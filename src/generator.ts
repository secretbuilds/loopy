import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BundleManifest, Candidate, ToolName } from "./types.js";

export type LlmRunner = (prompt: string) => Promise<string>;

export interface GenerateOptions {
  runner: LlmRunner;
  bundlesDir: string; // bundles root; create <bundlesDir>/<candidate.id>/
  now: string; // ISO timestamp injected for determinism
}

export type GenerateResult =
  | { ok: true; bundleDir: string }
  | { ok: false; reason: string };

interface Trigger {
  kind: "schedule" | "hook" | "manual";
  schedule?: string;
  hookEvent?: string;
  tool: ToolName;
}

const SECTIONS = [
  "Responsibility",
  "Trigger & cadence",
  "Procedure",
  "Verification",
  "Convergence",
  "Escalation"
] as const;

const TRIGGER_KINDS = ["schedule", "hook", "manual"] as const;
const TOOLS: ToolName[] = ["claude-code", "codex"];

const MAKER_PROMPT = `You are the MAKER. Turn an approved automation candidate into an installable loop document.

Produce a loop.md with EXACTLY these six \`##\` sections, in this order:
## Responsibility
## Trigger & cadence
## Procedure
## Verification
## Convergence
## Escalation

After the six sections, append exactly ONE fenced json block of the form:
\`\`\`json
{"kind": "schedule"|"hook"|"manual", "schedule"?: string, "hookEvent"?: string, "tool": "claude-code"|"codex"}
\`\`\`
Include "schedule" when kind is "schedule"; include "hookEvent" when kind is "hook".

Section content rules:
- Responsibility: ONE outcome-framed sentence describing the outcome the loop guarantees.
- Trigger & cadence: when and how often the loop runs.
- Procedure: the concrete steps the agent takes; they must address the candidate's evidence.
- Verification: name a CONCRETE check — a command to run, a file assertion, or a comparison. "Verify it works" is NOT acceptable.
- Convergence: include an iteration count cap or a time cap so the loop cannot run forever.
- Escalation: say exactly when to stop and notify the human.

Output ONLY the markdown. No commentary before or after.`;

const CHECKER_PROMPT = `You are the CHECKER. Critique the loop.md below. Do NOT rewrite it.

Judge strictly:
- Verification names a concrete check (command, file assertion, or comparison), not a vague "verify it works".
- Procedure plausibly addresses the candidate's evidence.
- Escalation and Convergence are real: explicit caps, stop conditions, and a human notification path.
- No invented tools or APIs that the named tool would not have.

Return ONLY a JSON object of the form:
{"verdict": "pass"|"fail", "problems": ["..."]}
If verdict is "pass", problems may be an empty array.`;

function describeCandidate(c: Candidate): string {
  const evidenceCount = c.evidence.length;
  return [
    `Candidate id: ${c.id}`,
    `Type: ${c.type}`,
    `Summary: ${c.summary}`,
    `Evidence count: ${evidenceCount}`,
    `Impact estimate: ${c.impactEstimate}`,
    `Suggested tool: ${c.suggestedTool}`
  ].join("\n");
}

function makerInput(c: Candidate, problems?: string[]): string {
  const parts = [MAKER_PROMPT, "", "Candidate:", describeCandidate(c)];
  if (problems !== undefined && problems.length > 0) {
    parts.push("", `Revise. Problems: ${problems.join("; ")}`);
  }
  return parts.join("\n");
}

function checkerInput(c: Candidate, loopMd: string): string {
  return [
    CHECKER_PROMPT,
    "",
    "Candidate:",
    describeCandidate(c),
    "",
    "loop.md:",
    loopMd
  ].join("\n");
}

/**
 * Extracts the first balanced JSON object from text and parses it.
 * Returns undefined when no balanced object is found or parsing fails.
 */
function firstBalancedJson(text: string): unknown {
  const start = text.indexOf("{");
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return undefined;
        }
      }
    }
  }

  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface StructuralResult {
  ok: boolean;
  problems: string[];
  trigger?: Trigger;
}

function extractFencedJson(md: string): string | undefined {
  const match = md.match(/```json\s*([\s\S]*?)```/i);
  return match?.[1];
}

function validateStructure(md: string): StructuralResult {
  const problems: string[] = [];

  // Headings present and in order.
  const headingRegex = /^##\s+(.+?)\s*$/gm;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(md)) !== null) {
    found.push(m[1].trim());
  }

  // The heading list must be EXACTLY the six expected headings, in order —
  // no missing, no extra, no reordering.
  const expected = SECTIONS as readonly string[];
  const headingsExact =
    found.length === expected.length &&
    found.every((heading, index) => heading === expected[index]);
  if (!headingsExact) {
    problems.push(
      `Headings must be EXACTLY, in order: ${expected
        .map((s) => `## ${s}`)
        .join(", ")}. Found: ${
        found.length > 0 ? found.map((s) => `## ${s}`).join(", ") : "(none)"
      }.`
    );
  }

  // Fenced json block.
  const jsonText = extractFencedJson(md);
  if (jsonText === undefined) {
    problems.push("Missing fenced ```json trigger block.");
    return { ok: false, problems };
  }

  const parsed = firstBalancedJson(jsonText);
  if (!isObject(parsed)) {
    problems.push("Trigger json block does not parse into an object.");
    return { ok: false, problems: problems };
  }

  const kind = parsed.kind;
  const tool = parsed.tool;

  if (typeof kind !== "string" || !TRIGGER_KINDS.includes(kind as Trigger["kind"])) {
    problems.push(`Trigger "kind" must be one of ${TRIGGER_KINDS.join(", ")}.`);
  }
  if (typeof tool !== "string" || !TOOLS.includes(tool as ToolName)) {
    problems.push(`Trigger "tool" must be one of ${TOOLS.join(", ")}.`);
  }
  if (kind === "schedule" && typeof parsed.schedule !== "string") {
    problems.push('Trigger "schedule" is required when kind is "schedule".');
  }
  if (kind === "hook" && typeof parsed.hookEvent !== "string") {
    problems.push('Trigger "hookEvent" is required when kind is "hook".');
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  const trigger: Trigger = {
    kind: kind as Trigger["kind"],
    tool: tool as ToolName
  };
  if (typeof parsed.schedule === "string") {
    trigger.schedule = parsed.schedule;
  }
  if (typeof parsed.hookEvent === "string") {
    trigger.hookEvent = parsed.hookEvent;
  }

  return { ok: true, problems: [], trigger };
}

interface CheckerResult {
  verdict: "pass" | "fail";
  problems: string[];
}

function parseChecker(raw: string): CheckerResult | undefined {
  const parsed = firstBalancedJson(raw);
  if (!isObject(parsed)) {
    return undefined;
  }

  const verdict = parsed.verdict;
  if (verdict !== "pass" && verdict !== "fail") {
    return undefined;
  }

  const problems = Array.isArray(parsed.problems)
    ? parsed.problems.filter((p): p is string => typeof p === "string")
    : [];

  return { verdict, problems };
}

async function runChecker(
  c: Candidate,
  loopMd: string,
  runner: LlmRunner
): Promise<CheckerResult> {
  const first = await runner(checkerInput(c, loopMd));
  const parsedFirst = parseChecker(first);
  if (parsedFirst !== undefined) {
    return parsedFirst;
  }

  // One re-ask on unparseable checker output.
  const second = await runner(checkerInput(c, loopMd));
  const parsedSecond = parseChecker(second);
  if (parsedSecond !== undefined) {
    return parsedSecond;
  }

  return { verdict: "fail", problems: ["Checker output could not be parsed."] };
}

interface Attempt {
  ok: boolean;
  problems: string[];
  loopMd?: string;
  trigger?: Trigger;
}

async function attempt(
  c: Candidate,
  runner: LlmRunner,
  problems?: string[]
): Promise<Attempt> {
  const loopMd = await runner(makerInput(c, problems));

  const structural = validateStructure(loopMd);
  if (!structural.ok || structural.trigger === undefined) {
    return { ok: false, problems: structural.problems };
  }

  const checker = await runChecker(c, loopMd, runner);
  if (checker.verdict !== "pass") {
    return { ok: false, problems: checker.problems };
  }

  return { ok: true, problems: [], loopMd, trigger: structural.trigger };
}

function writeBundle(
  c: Candidate,
  bundleDir: string,
  loopMd: string,
  trigger: Trigger,
  now: string
): void {
  mkdirSync(bundleDir, { recursive: true });
  mkdirSync(join(bundleDir, "state"), { recursive: true });

  writeFileSync(join(bundleDir, "loop.md"), loopMd, "utf8");
  writeFileSync(
    join(bundleDir, "trigger.json"),
    `${JSON.stringify(trigger, null, 2)}\n`,
    "utf8"
  );

  const manifest: BundleManifest = {
    loopId: c.id,
    generatedAt: now,
    evidence: c.evidence,
    tool: trigger.tool,
    installedPaths: [],
    uninstallNotes: []
  };
  writeFileSync(
    join(bundleDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
}

export async function generateBundle(
  c: Candidate,
  opts: GenerateOptions
): Promise<GenerateResult> {
  const first = await attempt(c, opts.runner);
  let result = first;

  if (!result.ok) {
    // ONE revision cycle: re-call maker with problems appended.
    result = await attempt(c, opts.runner, result.problems);
  }

  if (!result.ok || result.loopMd === undefined || result.trigger === undefined) {
    return {
      ok: false,
      reason: `Bundle generation failed: ${result.problems.join("; ")}`
    };
  }

  const bundleDir = join(opts.bundlesDir, c.id);
  writeBundle(c, bundleDir, result.loopMd, result.trigger, opts.now);

  return { ok: true, bundleDir };
}

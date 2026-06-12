import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Candidate } from "../src/types.js";
import { generateBundle, type LlmRunner } from "../src/generator.js";

let bundlesDir: string;
const NOW = "2026-06-12T00:00:00.000Z";

beforeEach(async () => {
  bundlesDir = await mkdtemp(join(tmpdir(), "loopy-gen-"));
});

afterEach(async () => {
  await rm(bundlesDir, { recursive: true, force: true });
});

const candidate: Candidate = {
  id: "cand-1",
  type: "recurring_task",
  summary: "Run the same verification command after edits",
  evidence: [
    { sessionId: "s-1", events: [0, 2] },
    { sessionId: "s-2", events: [4] }
  ],
  occurrences: 3,
  confidence: 0.9,
  suggestedTool: "codex",
  impactEstimate: "saves ~30 min/week"
};

function validLoopMd(opts?: { kind?: string; trigger?: string }): string {
  const triggerJson =
    opts?.trigger ??
    JSON.stringify({
      kind: opts?.kind ?? "schedule",
      schedule: "0 9 * * *",
      tool: "codex"
    });

  return [
    "## Responsibility",
    "Ensure the verification command passes after every code edit.",
    "",
    "## Trigger & cadence",
    "Runs daily at 09:00.",
    "",
    "## Procedure",
    "Run `npm test` and inspect output for failures.",
    "",
    "## Verification",
    "Assert `npm test` exits 0.",
    "",
    "## Convergence",
    "Stop after at most 3 iterations.",
    "",
    "## Escalation",
    "If tests still fail after 3 tries, stop and notify the human.",
    "",
    "```json",
    triggerJson,
    "```",
    ""
  ].join("\n");
}

function missingVerification(): string {
  return [
    "## Responsibility",
    "Ensure builds stay green.",
    "",
    "## Trigger & cadence",
    "Runs daily.",
    "",
    "## Procedure",
    "Run the build.",
    "",
    "## Convergence",
    "Cap at 3 iterations.",
    "",
    "## Escalation",
    "Notify the human on repeated failure.",
    "",
    "```json",
    JSON.stringify({ kind: "schedule", schedule: "0 9 * * *", tool: "codex" }),
    "```",
    ""
  ].join("\n");
}

const checkerPass = '{"verdict": "pass", "problems": []}';
const checkerFail = '{"verdict": "fail", "problems": ["Verification is vague"]}';

/** Builds a runner from a scripted list of responses. */
function scriptedRunner(responses: string[]): { run: LlmRunner; prompts: string[] } {
  const prompts: string[] = [];
  let i = 0;
  const run: LlmRunner = async (prompt: string) => {
    prompts.push(prompt);
    if (i >= responses.length) {
      throw new Error(`No scripted response for call ${i}`);
    }
    const out = responses[i];
    i += 1;
    return out;
  };
  return { run, prompts };
}

describe("generateBundle", () => {
  it("happy path: maker valid + checker pass writes correct files", async () => {
    const loopMd = validLoopMd();
    const { run } = scriptedRunner([loopMd, checkerPass]);

    const result = await generateBundle(candidate, { runner: run, bundlesDir, now: NOW });

    expect(result).toEqual({ ok: true, bundleDir: join(bundlesDir, "cand-1") });

    const dir = join(bundlesDir, "cand-1");
    expect(await readFile(join(dir, "loop.md"), "utf8")).toBe(loopMd);

    const trigger = JSON.parse(await readFile(join(dir, "trigger.json"), "utf8"));
    expect(trigger).toEqual({ kind: "schedule", schedule: "0 9 * * *", tool: "codex" });

    const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
    expect(manifest).toEqual({
      loopId: "cand-1",
      generatedAt: NOW,
      evidence: candidate.evidence,
      tool: "codex",
      installedPaths: [],
      uninstallNotes: []
    });

    const stateInfo = await stat(join(dir, "state"));
    expect(stateInfo.isDirectory()).toBe(true);
  });

  it("maker omits ## Verification → revision prompt includes problem → revised passes", async () => {
    const good = validLoopMd();
    const { run, prompts } = scriptedRunner([missingVerification(), good, checkerPass]);

    const result = await generateBundle(candidate, { runner: run, bundlesDir, now: NOW });

    expect(result.ok).toBe(true);
    // Second maker call (index 1) is the revision and must mention the problem.
    expect(prompts[1]).toContain("Revise. Problems:");
    expect(prompts[1]).toContain("## Verification");
    expect(await readFile(join(bundlesDir, "cand-1", "loop.md"), "utf8")).toBe(good);
  });

  it("checker fails twice → ok:false with problems, no bundle dir", async () => {
    const loopMd = validLoopMd();
    const { run } = scriptedRunner([loopMd, checkerFail, loopMd, checkerFail]);

    const result = await generateBundle(candidate, { runner: run, bundlesDir, now: NOW });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.reason).toContain("Verification is vague");
    }
    expect(existsSync(join(bundlesDir, "cand-1"))).toBe(false);
  });

  it("invalid trigger kind (cron) counts as structural fail → revision", async () => {
    const bad = validLoopMd({ trigger: JSON.stringify({ kind: "cron", tool: "codex" }) });
    const good = validLoopMd();
    const { run, prompts } = scriptedRunner([bad, good, checkerPass]);

    const result = await generateBundle(candidate, { runner: run, bundlesDir, now: NOW });

    expect(result.ok).toBe(true);
    expect(prompts[1]).toContain("Revise. Problems:");
    expect(prompts[1]).toContain("kind");
  });

  it("extra seventh heading (## Notes) → structural fail → revision", async () => {
    const withExtra = validLoopMd().replace(
      "```json",
      "## Notes\nExtra section that should not be allowed.\n\n```json"
    );
    const good = validLoopMd();
    const { run, prompts } = scriptedRunner([withExtra, good, checkerPass]);

    const result = await generateBundle(candidate, { runner: run, bundlesDir, now: NOW });

    expect(result.ok).toBe(true);
    expect(prompts[1]).toContain("Revise. Problems:");
    expect(prompts[1]).toContain("Headings must be EXACTLY");
    expect(await readFile(join(bundlesDir, "cand-1", "loop.md"), "utf8")).toBe(good);
  });

  it("checker garbage once then valid JSON still works (re-ask path)", async () => {
    const loopMd = validLoopMd();
    const { run } = scriptedRunner([loopMd, "not json at all", checkerPass]);

    const result = await generateBundle(candidate, { runner: run, bundlesDir, now: NOW });

    expect(result.ok).toBe(true);
    expect(existsSync(join(bundlesDir, "cand-1", "loop.md"))).toBe(true);
  });
});

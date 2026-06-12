import { spawn } from "node:child_process";
import { join } from "node:path";
import type { Candidate, CandidateType, ToolName } from "./types.js";
import { loadConfig, loopyHome, readJson, writeJsonAtomic } from "./state.js";

export type LlmRunner = (prompt: string) => Promise<string>;
export class EngineError extends Error {}

export interface EngineInput {
  digests: string;
  knownSessionIds: string[];
  installed: string[];
  dismissed: string[];
  patternMemory: string;
  runner: LlmRunner;
}

export interface EngineOutput {
  skipped: boolean;
  candidates: Candidate[];
  watchlist: Candidate[];
  memoryUpdates: string[];
  warnings: string[];
}

const CANDIDATE_TYPES: CandidateType[] = [
  "recurring_task",
  "babysitting",
  "post_event",
  "retry_storm",
  "hygiene",
  "cross_tool"
];

const TOOL_NAMES: ToolName[] = ["claude-code", "codex"];

const ANALYSIS_PROMPT = `You analyze a developer's coding-agent session digests to find work that should become an automation loop.

Candidate types:
- recurring_task: The developer repeatedly asks for the same multi-step task or workflow.
- babysitting: The developer repeatedly monitors commands, logs, processes, or long-running work by hand.
- post_event: A predictable follow-up happens after an event such as a build, test, release, or file change.
- retry_storm: The same failure or flaky operation causes repeated retries, triage, or recovery steps.
- hygiene: Routine cleanup, formatting, verification, organization, or maintenance keeps recurring.
- cross_tool: The work repeatedly requires transferring context or actions across coding-agent tools.

Quality bar:
Only surface opportunities a developer would genuinely thank you for. Recurring evidence must appear in >=3 distinct sessions. Each candidate needs an impactEstimate ("saves ~X min/week — because ..."). If estimated savings < 10 min/week, it belongs in the watchlist.

Hard rules:
- evidence sessionIds MUST come from the provided known-session-id list.
- Never re-propose the provided installed/dismissed ids.

Output schema:
Respond with a single JSON object and no extra text:
{"candidates": [...], "watchlist": [...], "memoryUpdates": ["..."]}

Each candidate object must match this field list:
- id: string
- type: one of recurring_task, babysitting, post_event, retry_storm, hygiene, cross_tool
- summary: string
- evidence: array of {sessionId: string, events: number[]}
- occurrences: positive integer
- confidence: number from 0 to 1
- suggestedTool: one of claude-code, codex
- impactEstimate: non-empty string`;

interface RawEngineResponse {
  candidates: Candidate[];
  watchlist: Candidate[];
  memoryUpdates: string[];
}

type SpendLedger = Record<string, number>;

export async function runEngine(input: EngineInput): Promise<EngineOutput> {
  const prompt = buildPrompt(input);
  const estimate = estimateTokens(prompt);
  const spendPath = join(loopyHome(), "log", "spend.json");
  const ledger = readJson<SpendLedger>(spendPath) ?? {};
  const today = todayKey();

  if ((ledger[today] ?? 0) + estimate > loadConfig().dailyTokenCap) {
    return emptyOutput(true);
  }

  // Reserve the budget up front: failed attempts still consume real LLM calls,
  // so a perpetually-failing runner must not bypass the daily cap.
  writeJsonAtomic(spendPath, { ...ledger, [today]: (ledger[today] ?? 0) + estimate });

  const raw = await callWithRetries(input.runner, prompt);
  return filterCandidates(raw, input);
}

export function defaultRunner(): LlmRunner {
  return (prompt: string) =>
    new Promise((resolve, reject) => {
      const child = spawn("claude", ["-p"], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";

      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`claude -p exited with code ${code}: ${stderr.trim()}`));
        }
      });

      child.stdin.end(prompt);
    });
}

function buildPrompt(input: EngineInput): string {
  return `${ANALYSIS_PROMPT}

Pattern memory:
${input.patternMemory}

Installed ids:
${JSON.stringify(input.installed)}

Dismissed ids:
${JSON.stringify(input.dismissed)}

Known session ids:
${JSON.stringify(input.knownSessionIds)}

Digests:
${input.digests}`;
}

function estimateTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4) + 2000;
}

async function callWithRetries(runner: LlmRunner, prompt: string): Promise<RawEngineResponse> {
  let validationError = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const attemptPrompt =
      attempt === 1
        ? prompt
        : `${prompt}\n\nYour previous response was invalid: ${validationError}. Respond with ONLY the JSON object.`;
    const response = await runner(attemptPrompt);

    try {
      return validateResponse(JSON.parse(extractFirstJsonObject(response)));
    } catch (error) {
      validationError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new EngineError(`LLM response stayed invalid after 3 attempts: ${validationError}`);
}

function extractFirstJsonObject(response: string): string {
  const start = response.indexOf("{");

  if (start === -1) {
    throw new EngineError("response did not contain a JSON object");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < response.length; index += 1) {
    const char = response[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return response.slice(start, index + 1);
      }
    }
  }

  throw new EngineError("response JSON object was not balanced");
}

function validateResponse(value: unknown): RawEngineResponse {
  if (!isRecord(value)) {
    throw new EngineError("response must be a JSON object");
  }

  const candidates = validateCandidateArray(value.candidates, "candidates");
  const watchlist = validateCandidateArray(value.watchlist, "watchlist");
  const memoryUpdates = validateStringArray(value.memoryUpdates, "memoryUpdates");

  return { candidates, watchlist, memoryUpdates };
}

function validateCandidateArray(value: unknown, field: string): Candidate[] {
  if (!Array.isArray(value)) {
    throw new EngineError(`${field} must be an array`);
  }

  return value.map((candidate, index) => validateCandidate(candidate, `${field}[${index}]`));
}

function validateCandidate(value: unknown, path: string): Candidate {
  if (!isRecord(value)) {
    throw new EngineError(`${path} must be an object`);
  }

  const id = requireString(value.id, `${path}.id`);
  const type = requireCandidateType(value.type, `${path}.type`);
  const summary = requireString(value.summary, `${path}.summary`);
  const evidence = validateEvidenceArray(value.evidence, `${path}.evidence`);
  const occurrences = requirePositiveInteger(value.occurrences, `${path}.occurrences`);
  const confidence = requireConfidence(value.confidence, `${path}.confidence`);
  const suggestedTool = requireToolName(value.suggestedTool, `${path}.suggestedTool`);
  const impactEstimate = requireNonEmptyString(value.impactEstimate, `${path}.impactEstimate`);

  return {
    id,
    type,
    summary,
    evidence,
    occurrences,
    confidence,
    suggestedTool,
    impactEstimate
  };
}

function validateEvidenceArray(value: unknown, path: string): Candidate["evidence"] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new EngineError(`${path} must be a non-empty array`);
  }

  return value.map((evidence, index) => {
    if (!isRecord(evidence)) {
      throw new EngineError(`${path}[${index}] must be an object`);
    }

    const sessionId = requireString(evidence.sessionId, `${path}[${index}].sessionId`);
    const events = evidence.events;

    if (
      !Array.isArray(events) ||
      events.length === 0 ||
      !events.every((event) => Number.isInteger(event) && event >= 0)
    ) {
      throw new EngineError(`${path}[${index}].events must be a non-empty array of non-negative integers`);
    }

    return { sessionId, events };
  });
}

function validateStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new EngineError(`${field} must be an array of strings`);
  }

  return value;
}

function filterCandidates(raw: RawEngineResponse, input: EngineInput): EngineOutput {
  const known = new Set(input.knownSessionIds);
  const ignored = new Set([...input.installed, ...input.dismissed]);
  const candidates: Candidate[] = [];
  const watchlist: Candidate[] = [];
  const warnings: string[] = [];

  for (const candidate of [...raw.candidates, ...raw.watchlist]) {
    if (ignored.has(candidate.id)) {
      continue;
    }

    const fabricatedSessionId = candidate.evidence.find((evidence) => !known.has(evidence.sessionId))?.sessionId;

    if (fabricatedSessionId !== undefined) {
      warnings.push(`Dropped candidate ${candidate.id}: evidence cites unknown sessionId ${fabricatedSessionId}`);
      continue;
    }

    if (candidate.confidence >= 0.75 && candidate.occurrences >= 3) {
      candidates.push(candidate);
    } else {
      watchlist.push(candidate);
    }
  }

  return {
    skipped: false,
    candidates,
    watchlist,
    memoryUpdates: raw.memoryUpdates,
    warnings
  };
}

function emptyOutput(skipped: boolean): EngineOutput {
  return {
    skipped,
    candidates: [],
    watchlist: [],
    memoryUpdates: [],
    warnings: []
  };
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new EngineError(`${path} must be a string`);
  }

  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  const string = requireString(value, path);

  if (string.trim() === "") {
    throw new EngineError(`${path} must be non-empty`);
  }

  return string;
}

function requireCandidateType(value: unknown, path: string): CandidateType {
  if (typeof value !== "string" || !CANDIDATE_TYPES.includes(value as CandidateType)) {
    throw new EngineError(`${path} must be a known candidate type`);
  }

  return value as CandidateType;
}

function requireToolName(value: unknown, path: string): ToolName {
  if (typeof value !== "string" || !TOOL_NAMES.includes(value as ToolName)) {
    throw new EngineError(`${path} must be a known tool name`);
  }

  return value as ToolName;
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new EngineError(`${path} must be a positive integer`);
  }

  return value as number;
}

function requireConfidence(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new EngineError(`${path} must be a number from 0 to 1`);
  }

  return value;
}

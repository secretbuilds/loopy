import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EngineError, type EngineInput, type LlmRunner, runEngine } from "../src/engine.js";
import { readJson, writeJsonAtomic } from "../src/state.js";
import type { Candidate } from "../src/types.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "loopy-engine-test-"));
  process.env.LOOPY_HOME = home;
});

afterEach(async () => {
  delete process.env.LOOPY_HOME;
  await rm(home, { recursive: true, force: true });
});

describe("runEngine", () => {
  it("promotes good candidates, filters junk, and preserves below-threshold watchlist", async () => {
    const response = {
      candidates: [
        candidate("promoted-1", { confidence: 0.91, occurrences: 3 }),
        candidate("promoted-2", { confidence: 0.8, occurrences: 4 }),
        candidate("below-threshold", { confidence: 0.7, occurrences: 3 }),
        candidate("fabricated", {
          evidence: [{ sessionId: "fake-session", events: [1, 2, 3] }]
        }),
        candidate("already-installed")
      ],
      watchlist: [],
      memoryUpdates: ["watch for recurring test cleanup"]
    };
    const runner = jsonRunner(response);

    const output = await runEngine(baseInput({ runner, installed: ["already-installed"] }));

    expect(output.skipped).toBe(false);
    expect(output.candidates.map((item) => item.id)).toEqual(["promoted-1", "promoted-2"]);
    expect(output.watchlist.map((item) => item.id)).toEqual(["below-threshold"]);
    expect(output.warnings).toHaveLength(1);
    expect(output.warnings[0]).toContain("fabricated");
    expect([...output.candidates, ...output.watchlist].some((item) => item.id === "already-installed")).toBe(false);
  });

  it("retries once with validation error context when the first response is garbage", async () => {
    const calls: string[] = [];
    const runner: LlmRunner = async (prompt) => {
      calls.push(prompt);
      return calls.length === 1
        ? "not json"
        : JSON.stringify({
            candidates: [candidate("promoted")],
            watchlist: [],
            memoryUpdates: []
          });
    };

    const output = await runEngine(baseInput({ runner }));

    expect(output.candidates.map((item) => item.id)).toEqual(["promoted"]);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("previous response was invalid");
  });

  it("throws EngineError after exactly three invalid responses", async () => {
    let calls = 0;
    const runner: LlmRunner = async () => {
      calls += 1;
      return "still garbage";
    };

    await expect(runEngine(baseInput({ runner }))).rejects.toBeInstanceOf(EngineError);
    expect(calls).toBe(3);
  });

  it("skips without calling the runner when the daily token cap is exhausted", async () => {
    let calls = 0;
    const runner: LlmRunner = async () => {
      calls += 1;
      return JSON.stringify({ candidates: [candidate("never-called")], watchlist: [], memoryUpdates: [] });
    };
    writeJsonAtomic(join(home, "config.json"), {
      companion: "auto",
      dailyTokenCap: 1,
      pollIntervalMin: 15
    });

    const output = await runEngine(baseInput({ runner }));

    expect(output).toEqual({
      skipped: true,
      candidates: [],
      watchlist: [],
      memoryUpdates: [],
      warnings: []
    });
    expect(calls).toBe(0);
  });

  it("records estimated spend after a run", async () => {
    const calls: string[] = [];
    const runner: LlmRunner = async (prompt) => {
      calls.push(prompt);
      return JSON.stringify({ candidates: [candidate("spend-recorded")], watchlist: [], memoryUpdates: [] });
    };

    await runEngine(baseInput({ runner }));

    const spend = readJson<Record<string, number>>(join(home, "log", "spend.json")) ?? {};
    const today = todayKey();
    const estimate = Math.ceil(calls[0].length / 4) + 2000;
    expect(spend[today]).toBeGreaterThanOrEqual(estimate);
  });
});

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    digests: "session s1 fixed tests\nsession s2 fixed tests\nsession s3 fixed tests",
    knownSessionIds: ["s1", "s2", "s3"],
    installed: [],
    dismissed: [],
    patternMemory: "previously saw repeated verification loops",
    runner: jsonRunner({ candidates: [candidate("default")], watchlist: [], memoryUpdates: [] }),
    ...overrides
  };
}

function jsonRunner(value: unknown): LlmRunner {
  return async () => JSON.stringify(value);
}

function candidate(id: string, overrides: Partial<Candidate> = {}): Candidate {
  return {
    id,
    type: "recurring_task",
    summary: `Automate ${id}`,
    evidence: [
      { sessionId: "s1", events: [0] },
      { sessionId: "s2", events: [1] },
      { sessionId: "s3", events: [2] }
    ],
    occurrences: 3,
    confidence: 0.9,
    suggestedTool: "codex",
    impactEstimate: "saves ~30 min/week — because this repeats across sessions",
    ...overrides
  };
}

function todayKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

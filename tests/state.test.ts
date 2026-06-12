import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Proposal } from "../src/types.js";
import {
  addToRegistry,
  ensureDirs,
  getProposal,
  inRegistry,
  listProposals,
  loadConfig,
  readJson,
  saveProposal,
  setProposalStatus,
  writeJsonAtomic
} from "../src/state.js";

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "loopy-test-"));
  process.env.LOOPY_HOME = home;
});

afterEach(async () => {
  delete process.env.LOOPY_HOME;
  await rm(home, { recursive: true, force: true });
});

describe("state", () => {
  it("creates state directories", async () => {
    ensureDirs();

    for (const dir of ["digests", "proposals", "bundles", "registry", "log"]) {
      const info = await stat(join(home, dir));
      expect(info.isDirectory()).toBe(true);
    }
  });

  it("round-trips JSON with atomic writes", async () => {
    const path = join(home, "digests", "sample.json");
    const value = { ok: true, count: 3 };

    writeJsonAtomic(path, value);

    expect(readJson<typeof value>(path)).toEqual(value);
  });

  it("returns undefined for missing JSON", async () => {
    expect(readJson(join(home, "missing.json"))).toBeUndefined();
  });

  it("saves, lists, gets, and updates proposals", async () => {
    const proposal: Proposal = {
      candidate: {
        id: "candidate-1",
        type: "recurring_task",
        summary: "Run the same verification command",
        evidence: [{ sessionId: "session-1", events: [0, 2] }],
        occurrences: 2,
        confidence: 0.8,
        suggestedTool: "codex",
        impactEstimate: "saves ~30 min/week"
      },
      status: "pending",
      createdAt: "2026-06-12T00:00:00.000Z"
    };

    saveProposal(proposal);

    expect(listProposals()).toEqual([proposal]);
    expect(getProposal("candidate-1")).toEqual(proposal);

    setProposalStatus("candidate-1", "approved");

    expect(getProposal("candidate-1")).toEqual({ ...proposal, status: "approved" });
  });

  it("adds and checks registry entries", async () => {
    addToRegistry("installed", "candidate-1");
    addToRegistry("installed", "candidate-1");

    expect(inRegistry("installed", "candidate-1")).toBe(true);
    expect(readJson<string[]>(join(home, "registry", "installed.json"))).toEqual(["candidate-1"]);
  });

  it("loads default config when config.json is absent", async () => {
    expect(loadConfig()).toEqual({
      companion: "auto",
      dailyTokenCap: 100000,
      pollIntervalMin: 15
    });
  });
});

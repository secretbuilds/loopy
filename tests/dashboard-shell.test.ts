import { mkdtemp, rm } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Candidate } from "../src/types.js";
import { type CliDeps } from "../src/cli.js";
import { assembleData, dispatchEffect } from "../src/dashboard/shell.js";
import {
  addToRegistry,
  getProposal,
  loadConfig,
  loopyHome,
  saveProposal,
  writeJsonAtomic
} from "../src/state.js";
import { appendEvent, readEvents } from "../src/events.js";

const NOW = "2026-06-12T12:00:00.000Z";
const TODAY = NOW.slice(0, 10);

let home: string; // LOOPY_HOME
let userHome: string; // injected homedir
let lines: string[];
let execCalls: { cmd: string; args: string[] }[];

function makeDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    runner: async () => "{}",
    exec: async (cmd, args) => {
      execCalls.push({ cmd, args });
      return { code: 0, out: "" };
    },
    now: () => NOW,
    homedir: () => userHome,
    out: (line) => lines.push(line),
    ...overrides
  };
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "loopy-shell-"));
  userHome = await mkdtemp(join(tmpdir(), "loopy-shell-home-"));
  process.env.LOOPY_HOME = home;
  lines = [];
  execCalls = [];
});

afterEach(async () => {
  delete process.env.LOOPY_HOME;
  await rm(home, { recursive: true, force: true });
  await rm(userHome, { recursive: true, force: true });
});

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "cand-1",
    type: "recurring_task",
    summary: "Run the same verification command after edits",
    evidence: [{ sessionId: "s-1", events: [0] }],
    occurrences: 3,
    confidence: 0.9,
    suggestedTool: "claude-code",
    impactEstimate: "saves ~30 min/week — because manual reruns",
    ...overrides
  };
}

function plistPath(): string {
  return join(userHome, "Library", "LaunchAgents", "com.loopy.daemon.plist");
}

function writePlist(): void {
  const dir = join(userHome, "Library", "LaunchAgents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(plistPath(), "<plist/>", "utf8");
}

describe("assembleData", () => {
  it("returns an empty snapshot for empty state with daemon not-installed", async () => {
    const data = await assembleData(makeDeps());
    expect(data.proposals).toEqual([]);
    expect(data.loops).toEqual([]);
    expect(data.sessions).toBe(0);
    expect(data.daemon).toBe("not-installed");
    expect(data.spendToday).toBe(0);
    expect(data.spendCap).toBe(loadConfig().dailyTokenCap);
    expect(data.events).toEqual([]);
  });

  it("assembles proposals, loops, spend, events, and daemon state from disk", async () => {
    // two pending proposals
    saveProposal({ candidate: candidate({ id: "p-1" }), status: "pending", createdAt: NOW });
    saveProposal({ candidate: candidate({ id: "p-2" }), status: "pending", createdAt: NOW });

    // one installed loop with a seeded bundle
    const id = "loop-1";
    const bundleDir = join(loopyHome(), "bundles", id);
    mkdirSync(bundleDir, { recursive: true });
    writeFileSync(
      join(bundleDir, "manifest.json"),
      `${JSON.stringify(
        {
          loopId: id,
          generatedAt: NOW,
          evidence: [],
          tool: "codex",
          installedPaths: [],
          uninstallNotes: []
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    writeFileSync(
      join(bundleDir, "trigger.json"),
      `${JSON.stringify({ kind: "manual", tool: "codex" }, null, 2)}\n`,
      "utf8"
    );
    addToRegistry("installed", id);
    saveProposal({
      candidate: candidate({ id, suggestedTool: "codex" }),
      status: "approved",
      createdAt: NOW,
      bundleDir
    });

    writeJsonAtomic(join(loopyHome(), "log", "spend.json"), { [TODAY]: 1234 });
    appendEvent("scan", "scan complete", NOW);
    appendEvent("approve", "approved x", NOW);

    // daemon running: plist present + launchctl list code 0
    writePlist();
    const running = await assembleData(makeDeps());
    expect(running.proposals).toHaveLength(2);
    expect(running.loops).toHaveLength(1);
    expect(running.loops[0]).toEqual({ id, kind: "manual", tool: "codex" });
    expect(running.spendToday).toBe(1234);
    expect(running.events.length).toBeGreaterThanOrEqual(2);
    expect(running.daemon).toBe("running");

    // daemon paused: plist present + launchctl list non-zero
    const paused = await assembleData(makeDeps({ exec: async () => ({ code: 1, out: "" }) }));
    expect(paused.daemon).toBe("paused");
  });
});

describe("dispatchEffect", () => {
  it("dismiss marks the proposal dismissed and logs an event", async () => {
    saveProposal({ candidate: candidate({ id: "d-1" }), status: "pending", createdAt: NOW });

    const flash = await dispatchEffect(makeDeps(), { type: "dismiss", id: "d-1" });
    expect(flash).toBe('dismissed "d-1"');
    expect(getProposal("d-1")?.status).toBe("dismissed");

    const events = readEvents(50);
    expect(events.some((e) => e.kind === "dismiss" && e.msg.includes("d-1"))).toBe(true);
  });

  it("snooze returns the snooze flash and sets snoozedUntil", async () => {
    saveProposal({ candidate: candidate({ id: "s-1" }), status: "pending", createdAt: NOW });

    const flash = await dispatchEffect(makeDeps(), { type: "snooze", id: "s-1" });
    expect(flash).toBe('snoozed "s-1" for 7 days');
    const stored = getProposal("s-1");
    expect(stored?.status).toBe("snoozed");
    expect(stored?.snoozedUntil).toBeDefined();
  });

  it("scan returns a non-empty flash and writes a proposal file", async () => {
    seedDigests();
    const flash = await dispatchEffect(
      makeDeps({ runner: async () => engineResponse }),
      { type: "scan" }
    );
    expect(flash.length).toBeGreaterThan(0);
    expect(getProposal("cand-new")).toBeDefined();
  });

  it("toggle-pause unloads a running daemon", async () => {
    writePlist();
    const flash = await dispatchEffect(makeDeps(), { type: "toggle-pause" });
    expect(flash).toBe("daemon paused");
    expect(execCalls).toContainEqual({ cmd: "launchctl", args: ["unload", plistPath()] });
  });

  it("toggle-pause loads a paused daemon", async () => {
    writePlist();
    const flash = await dispatchEffect(
      makeDeps({ exec: async (cmd, args) => {
        execCalls.push({ cmd, args });
        return { code: 1, out: "" };
      } }),
      { type: "toggle-pause" }
    );
    expect(flash).toBe("daemon resumed");
    expect(execCalls).toContainEqual({ cmd: "launchctl", args: ["load", plistPath()] });
  });

  it("propagates a thrown runner so the shell can surface it (does not swallow)", async () => {
    seedDigests();
    const deps = makeDeps({
      runner: async () => {
        throw new Error("LLM unavailable");
      }
    });
    await expect(dispatchEffect(deps, { type: "scan" })).rejects.toThrow("LLM unavailable");
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────
function seedDigests(): void {
  const dir = join(loopyHome(), "digests");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "s-1.txt"), "digest one", "utf8");
}

const engineResponse = JSON.stringify({
  candidates: [
    {
      id: "cand-new",
      type: "recurring_task",
      summary: "A new recurring task",
      evidence: [{ sessionId: "s-1", events: [0] }],
      occurrences: 3,
      confidence: 0.9,
      suggestedTool: "claude-code",
      impactEstimate: "saves ~30 min/week — because reasons"
    }
  ],
  watchlist: [],
  memoryUpdates: []
});

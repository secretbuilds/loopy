import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Candidate } from "../src/types.js";
import { type CliDeps } from "../src/cli.js";
import { assembleData, dispatchEffect } from "../src/dashboard/shell.js";
import { reduce, type DashboardState, type Effect } from "../src/dashboard/state.js";
import { renderDashboard } from "../src/dashboard/render.js";
import { addToRegistry, getProposal, loopyHome, saveProposal, writeJsonAtomic } from "../src/state.js";
import { appendEvent } from "../src/events.js";

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

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "cand-1",
    type: "recurring_task",
    summary: "Run the same verification command after edits",
    evidence: [{ sessionId: "s-1", events: [0] }],
    occurrences: 3,
    confidence: 0.9,
    suggestedTool: "claude-code",
    impactEstimate: "saves ~30 min/week",
    ...overrides
  };
}

function initialState(data: Awaited<ReturnType<typeof assembleData>>): DashboardState {
  return {
    data,
    focus: "inbox",
    inboxIndex: 0,
    loopsIndex: 0,
    activityScroll: 0,
    moodFrame: 0,
    spinnerFrame: 0
  };
}

function seedLoop(id: string): void {
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
}

function seedDigests(): void {
  const dir = join(loopyHome(), "digests");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "s-9.txt"), "digest nine", "utf8");
}

const scanEngineResponse = JSON.stringify({
  candidates: [
    {
      id: "cand-scanned",
      type: "recurring_task",
      summary: "A freshly scanned recurring task",
      evidence: [{ sessionId: "s-9", events: [0] }],
      occurrences: 4,
      confidence: 0.8,
      suggestedTool: "claude-code",
      impactEstimate: "saves ~20 min/week — because reasons"
    }
  ],
  watchlist: [],
  memoryUpdates: []
});

function assertGeometry(render: string, cols: number, rows: number): string[] {
  const renderedLines = render.split("\n");
  expect(renderedLines).toHaveLength(rows);
  for (const line of renderedLines) {
    expect(line.length).toBe(cols);
  }
  return renderedLines;
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "loopy-int-"));
  userHome = await mkdtemp(join(tmpdir(), "loopy-int-home-"));
  process.env.LOOPY_HOME = home;
  lines = [];
  execCalls = [];
});

afterEach(async () => {
  delete process.env.LOOPY_HOME;
  await rm(home, { recursive: true, force: true });
  await rm(userHome, { recursive: true, force: true });
});

describe("dashboard integration", () => {
  async function seedAndAssemble(): Promise<{ deps: CliDeps; state: DashboardState }> {
    saveProposal({
      candidate: candidate({
        id: "p-first",
        summary: "Re-run the verification suite",
        impactEstimate: "saves ~45 min/week"
      }),
      status: "pending",
      createdAt: NOW
    });
    saveProposal({
      candidate: candidate({
        id: "p-second",
        summary: "Tidy stale branches",
        impactEstimate: "saves ~15 min/week"
      }),
      status: "pending",
      createdAt: NOW
    });

    seedLoop("loop-installed");

    writeJsonAtomic(join(loopyHome(), "log", "spend.json"), { [TODAY]: 1234 });

    appendEvent("scan", "scan complete", NOW);
    appendEvent("approve", "approved a loop", NOW);
    appendEvent("dismiss", "dismissed a proposal", NOW);

    const deps = makeDeps();
    const data = await assembleData(deps);
    return { deps, state: initialState(data) };
  }

  it("assembles seeded state and renders exact geometry with selected proposal, loop, and event", async () => {
    const { state } = await seedAndAssemble();

    const wide = renderDashboard(state, 120, 40);
    assertGeometry(wide, 120, 40);

    // (b) selected proposal id + impact text
    expect(wide).toContain("p-first");
    expect(wide).toContain("impact:");
    expect(wide).toContain("saves ~45 min/week");
    // (c) installed loop id
    expect(wide).toContain("loop-installed");
    // (d) a seeded event's HH:MM
    expect(wide).toContain("12:00");

    // small geometry too
    assertGeometry(renderDashboard(state, 60, 16), 60, 16);
  });

  it("runs a confirm→dismiss cycle end-to-end and drops the proposal from the inbox", async () => {
    const { deps, state } = await seedAndAssemble();
    expect(state.data.proposals).toHaveLength(2);

    // d sets confirm, returns no effect
    const afterD = reduce(state, { kind: "key", key: "d" });
    expect(afterD.effect).toBeUndefined();
    expect(afterD.state.confirm).toEqual({ action: "dismiss", targetId: "p-first" });

    const confirmRender = renderDashboard(afterD.state, 120, 40);
    expect(confirmRender).toContain('dismiss "p-first"?');
    expect(confirmRender).toContain("[y]es [n]o");

    // y clears confirm and returns the dismiss effect
    const afterY = reduce(afterD.state, { kind: "key", key: "y" });
    expect(afterY.state.confirm).toBeUndefined();
    expect(afterY.effect).toEqual({ type: "dismiss", id: "p-first" });

    const flash = await dispatchEffect(deps, afterY.effect as Effect);
    expect(flash).toBe('dismissed "p-first"');
    expect(getProposal("p-first")?.status).toBe("dismissed");

    const refreshed = await assembleData(deps);
    expect(refreshed.proposals).toHaveLength(1);
    expect(refreshed.proposals.some((p) => p.candidate.id === "p-first")).toBe(false);
  });

  it("runs a confirm→cancel cycle leaving the proposal pending", async () => {
    const { deps, state } = await seedAndAssemble();

    const afterD = reduce(state, { kind: "key", key: "d" });
    expect(afterD.state.confirm).toBeDefined();

    const afterN = reduce(afterD.state, { kind: "key", key: "n" });
    expect(afterN.effect).toBeUndefined();
    expect(afterN.state.confirm).toBeUndefined();
    expect(afterN.state.flash).toBe("cancelled");

    expect(getProposal("p-first")?.status).toBe("pending");
    const refreshed = await assembleData(deps);
    expect(refreshed.proposals).toHaveLength(2);
  });

  it("runs a scan cycle that writes a new proposal and surfaces it in the inbox", async () => {
    const { deps, state } = await seedAndAssemble();
    seedDigests();

    const afterS = reduce(state, { kind: "key", key: "s" });
    expect(afterS.effect).toEqual({ type: "scan" });

    const scanDeps = makeDeps({ runner: async () => scanEngineResponse });
    const flash = await dispatchEffect(scanDeps, afterS.effect as Effect);
    expect(flash.length).toBeGreaterThan(0);
    expect(existsSync(join(loopyHome(), "proposals", "cand-scanned.json"))).toBe(true);

    const refreshed = await assembleData(deps);
    expect(refreshed.proposals.some((p) => p.candidate.id === "cand-scanned")).toBe(true);
  });

  it("switches focus to loops on tab and brackets the focused panel title", async () => {
    const { state } = await seedAndAssemble();

    const afterTab = reduce(state, { kind: "key", key: "tab" });
    expect(afterTab.state.focus).toBe("loops");

    const render = renderDashboard(afterTab.state, 120, 40);
    expect(render).toContain("[loops]");
    expect(render).not.toContain("[inbox]");
    expect(render).toContain("inbox");
  });
});

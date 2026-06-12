import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Candidate, Proposal } from "../src/types.js";
import {
  approveAction,
  listAction,
  markAction,
  readCompanionState,
  scanAction,
  setupAction,
  statusAction,
  uninstallAction,
  type CliDeps
} from "../src/cli.js";
import {
  addToRegistry,
  getProposal,
  inRegistry,
  listProposals,
  loopyHome,
  readJson,
  saveProposal,
  writeJsonAtomic
} from "../src/state.js";

const NOW = "2026-06-12T12:00:00.000Z";

let home: string; // LOOPY_HOME
let userHome: string; // injected homedir
let lines: string[];
let execCalls: { cmd: string; args: string[] }[];

interface TestDeps extends CliDeps {}

function makeDeps(overrides: Partial<CliDeps> = {}): TestDeps {
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
  home = await mkdtemp(join(tmpdir(), "loopy-cli-"));
  userHome = await mkdtemp(join(tmpdir(), "loopy-cli-home-"));
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

function claudeSettingsPath(): string {
  return join(userHome, ".claude", "settings.json");
}

describe("setupAction", () => {
  it("writes config, appends the trigger hook preserving existing hooks, installs daemon, and is idempotent", async () => {
    // Pre-seed an unrelated existing hook.
    const settingsPath = claudeSettingsPath();
    mkdirSync(join(userHome, ".claude"), { recursive: true });
    writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          hooks: {
            SessionStart: [
              { matcher: "*", hooks: [{ type: "command", command: "echo existing" }] }
            ]
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );

    const deps = makeDeps();
    await setupAction(deps, { companion: "manual" });

    // config.json
    const config = readJson<{ companion: string }>(join(loopyHome(), "config.json"));
    expect(config?.companion).toBe("manual");

    // both hooks present
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const sessionStart = settings.hooks.SessionStart as { hooks: { command: string }[] }[];
    const commands = sessionStart.flatMap((e) => e.hooks.map((h) => h.command));
    expect(commands).toContain("echo existing");
    expect(commands.some((c) => c.includes("# loopy:trigger-hook"))).toBe(true);
    expect(sessionStart).toHaveLength(2);

    // daemon plist written + launchctl load called
    const plistPath = join(userHome, "Library", "LaunchAgents", "com.loopy.daemon.plist");
    expect(existsSync(plistPath)).toBe(true);
    expect(execCalls).toContainEqual({ cmd: "launchctl", args: ["load", plistPath] });

    // idempotent: second run adds no hook
    await setupAction(makeDeps(), { companion: "manual" });
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(after.hooks.SessionStart).toHaveLength(2);
  });

  it("skips the daemon with --no-daemon", async () => {
    await setupAction(makeDeps(), { daemon: false });
    const plistPath = join(userHome, "Library", "LaunchAgents", "com.loopy.daemon.plist");
    expect(existsSync(plistPath)).toBe(false);
    expect(execCalls).toHaveLength(0);
  });

  it("rejects an invalid --companion value without persisting it", async () => {
    const deps = makeDeps();
    await setupAction(deps, { companion: "bogus" });

    // config.json must not be written with the bogus value.
    const config = readJson<{ companion: string }>(join(loopyHome(), "config.json"));
    expect(config?.companion).not.toBe("bogus");
    expect(config).toBeUndefined();
    // an error line is surfaced to the user
    expect(lines.some((l) => l.includes("invalid --companion"))).toBe(true);
    // nothing installed
    expect(execCalls).toHaveLength(0);
  });
});

describe("readCompanionState", () => {
  it("returns pending proposals and expired snoozes, but hides active snoozes", async () => {
    const nowMs = new Date(NOW).getTime();
    const past = new Date(nowMs - 60_000).toISOString(); // 1 min ago
    const future = new Date(nowMs + 60_000).toISOString(); // 1 min ahead

    // plain pending -> visible
    saveProposal({
      candidate: candidate({ id: "p-pending" }),
      status: "pending",
      createdAt: NOW
    });
    // snoozed, expired -> returns to inbox
    saveProposal({
      candidate: candidate({ id: "p-snooze-expired" }),
      status: "snoozed",
      createdAt: NOW,
      snoozedUntil: past
    });
    // snoozed, still active -> hidden
    saveProposal({
      candidate: candidate({ id: "p-snooze-active" }),
      status: "snoozed",
      createdAt: NOW,
      snoozedUntil: future
    });
    // pending but with an active snooze stamp -> hidden
    saveProposal({
      candidate: candidate({ id: "p-pending-future" }),
      status: "pending",
      createdAt: NOW,
      snoozedUntil: future
    });

    const { proposals } = readCompanionState(makeDeps());
    const ids = proposals.map((p) => p.candidate.id).sort();
    expect(ids).toEqual(["p-pending", "p-snooze-expired"]);
  });
});

describe("markAction", () => {
  it("creates a marker file", async () => {
    await markAction(makeDeps());
    const ms = new Date(NOW).getTime();
    expect(existsSync(join(loopyHome(), "markers", `${ms}.mark`))).toBe(true);
  });
});

describe("scanAction", () => {
  function seedDigests(): void {
    const dir = join(loopyHome(), "digests");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "s-1.txt"), "digest one", "utf8");
    writeFileSync(join(dir, "s-2.txt"), "digest two", "utf8");
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
      },
      {
        id: "cand-dismissed",
        type: "hygiene",
        summary: "Already dismissed",
        evidence: [{ sessionId: "s-2", events: [0] }],
        occurrences: 3,
        confidence: 0.9,
        suggestedTool: "codex",
        impactEstimate: "saves ~15 min/week — because reasons"
      }
    ],
    watchlist: [],
    memoryUpdates: ["learned: developers rerun verification"]
  });

  it("saves only new, non-dismissed candidates, appends memory, and dedups on rerun", async () => {
    seedDigests();
    addToRegistry("dismissed", "cand-dismissed");

    const deps = makeDeps({ runner: async () => engineResponse });
    await scanAction(deps);

    const proposals = listProposals();
    expect(proposals.map((p) => p.candidate.id)).toEqual(["cand-new"]);

    const memory = readFileSync(join(loopyHome(), "log", "pattern-memory.txt"), "utf8");
    expect(memory).toContain("learned: developers rerun verification");

    expect(lines).toContain("✨ i spotted 1 loop idea for you");

    // Rerun: cand-new already has a proposal file -> 0 new.
    lines = [];
    await scanAction(makeDeps({ runner: async () => engineResponse }));
    expect(listProposals().map((p) => p.candidate.id)).toEqual(["cand-new"]);
    expect(lines).toContain("all quiet — your loops have it covered");
  });
});

// A runner that satisfies the generator's maker + checker exchange.
function generatorRunner(tool: "claude-code" | "codex"): CliDeps["runner"] {
  const loopMd = [
    "## Responsibility",
    "Guarantee the verification always runs.",
    "## Trigger & cadence",
    "Runs daily at 9am.",
    "## Procedure",
    "Run the verification steps the developer repeats by hand.",
    "## Verification",
    "Run `npm test` and assert the process exits 0.",
    "## Convergence",
    "Stop after at most 3 iterations.",
    "## Escalation",
    "Notify the human after 3 consecutive failures.",
    "",
    "```json",
    JSON.stringify({ kind: "schedule", schedule: "0 9 * * *", tool }),
    "```",
    ""
  ].join("\n");

  return async (prompt: string) => {
    if (prompt.includes("You are the CHECKER")) {
      return JSON.stringify({ verdict: "pass", problems: [] });
    }
    return loopMd;
  };
}

describe("approveAction", () => {
  it("generates a bundle, installs via the suggested tool, and updates registry + status", async () => {
    const proposal: Proposal = {
      candidate: candidate({ id: "cand-approve", suggestedTool: "claude-code" }),
      status: "pending",
      createdAt: NOW
    };
    saveProposal(proposal);

    const deps = makeDeps({ runner: generatorRunner("claude-code") });
    await approveAction(deps, proposal);

    // schedule trigger -> claude-code installer writes a plist under the
    // injected homedir's LaunchAgents and loads it via launchctl.
    const plistPath = join(
      userHome,
      "Library",
      "LaunchAgents",
      "com.loopy.cand-approve.plist"
    );
    expect(execCalls).toContainEqual({ cmd: "launchctl", args: ["load", plistPath] });

    expect(inRegistry("installed", "cand-approve")).toBe(true);
    const stored = getProposal("cand-approve");
    expect(stored?.status).toBe("approved");
    expect(stored?.bundleDir).toBe(join(loopyHome(), "bundles", "cand-approve"));
  });
});

describe("uninstallAction", () => {
  it("removes the loop from the installed registry and marks it dismissed", async () => {
    const proposal: Proposal = {
      candidate: candidate({ id: "cand-uninstall", suggestedTool: "claude-code" }),
      status: "pending",
      createdAt: NOW
    };
    saveProposal(proposal);

    // Install it first via approveAction so a real bundle/manifest exists.
    await approveAction(makeDeps({ runner: generatorRunner("claude-code") }), proposal);
    expect(inRegistry("installed", "cand-uninstall")).toBe(true);

    await uninstallAction(makeDeps(), { id: "cand-uninstall" });

    expect(inRegistry("installed", "cand-uninstall")).toBe(false);
    expect(getProposal("cand-uninstall")?.status).toBe("dismissed");
    // plist was unloaded during uninstall
    const plistPath = join(
      userHome,
      "Library",
      "LaunchAgents",
      "com.loopy.cand-uninstall.plist"
    );
    expect(execCalls).toContainEqual({ cmd: "launchctl", args: ["unload", plistPath] });
  });
});

describe("status and list", () => {
  it("do not throw on empty state", async () => {
    await expect(statusAction(makeDeps())).resolves.toBeUndefined();
    await expect(listAction(makeDeps())).resolves.toBeUndefined();
    expect(lines.some((l) => l.startsWith("daemon:"))).toBe(true);
    expect(lines.some((l) => l.startsWith("pending proposals:"))).toBe(true);
  });

  it("assemble output from seeded state", async () => {
    const id = "cand-listed";
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

    // seed spend + watch state for status
    writeJsonAtomic(join(loopyHome(), "log", "spend.json"), { [NOW.slice(0, 10)]: 1234 });
    writeJsonAtomic(join(loopyHome(), "log", "watch.json"), { files: {} });

    await listAction(makeDeps());
    expect(lines.some((l) => l.includes(id) && l.includes("codex") && l.includes("manual"))).toBe(
      true
    );

    lines = [];
    await statusAction(makeDeps());
    expect(lines.some((l) => l.includes("1234"))).toBe(true);
    expect(lines.some((l) => l.startsWith("last tick:") && !l.includes("never"))).toBe(true);
  });
});

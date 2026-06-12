import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runEngine, type LlmRunner } from "../src/engine.js";
import { generateBundle } from "../src/generator.js";
import { installClaudeCodeLoop } from "../src/installers/claude-code.js";
import { uninstallLoop, type ExecResult, type InstallContext } from "../src/installers/shared.js";
import { listProposals, saveProposal } from "../src/state.js";
import type { BundleManifest, Candidate } from "../src/types.js";
import { tick, type WatchContext } from "../src/watcher.js";

const NOW = "2026-06-12T09:00:00.000Z";

let sandbox: string;
let loopyHomeDir: string;
let claudeProjectsDir: string;
let codexSessionsDir: string;
let fakeUserHome: string;
let claudeSettingsPath: string;
let launchAgentsDir: string;

interface ExecCall {
  cmd: string;
  args: string[];
}

beforeEach(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "loopy-e2e-"));
  loopyHomeDir = join(sandbox, "loopy-home");
  claudeProjectsDir = join(sandbox, "claude-projects");
  codexSessionsDir = join(sandbox, "codex-sessions");
  fakeUserHome = join(sandbox, "fake-home");
  claudeSettingsPath = join(fakeUserHome, ".claude", "settings.json");
  launchAgentsDir = join(fakeUserHome, "Library", "LaunchAgents");

  await mkdir(claudeProjectsDir, { recursive: true });
  await mkdir(codexSessionsDir, { recursive: true });
  await mkdir(join(fakeUserHome, ".claude"), { recursive: true });
  await mkdir(launchAgentsDir, { recursive: true });
  process.env.LOOPY_HOME = loopyHomeDir;
});

afterEach(async () => {
  delete process.env.LOOPY_HOME;
  await rm(sandbox, { recursive: true, force: true });
});

describe("loopy end-to-end pipeline", () => {
  it("digests transcripts, proposes a loop, bundles it, installs it, and uninstalls cleanly", async () => {
    for (const sessionId of ["s1", "s2", "s3", "s4"]) {
      await seedClaudeTranscript(sessionId);
    }

    const tickResult = await tick(watchContext());
    expect(tickResult.digested.sort()).toEqual(["s1", "s2", "s3", "s4"]);

    const digestDir = join(loopyHomeDir, "digests");
    const digestFiles = readdirSync(digestDir).sort();
    expect(digestFiles).toEqual(["s1.txt", "s2.txt", "s3.txt", "s4.txt"]);

    const digests = digestFiles
      .map((file) => readFileSync(join(digestDir, file), "utf8"))
      .join("\n\n");

    const candidate = ciWatchCandidate();
    const engine = await runEngine({
      digests,
      knownSessionIds: ["s1", "s2", "s3", "s4"],
      installed: [],
      dismissed: [],
      patternMemory: "",
      runner: async () =>
        JSON.stringify({
          candidates: [candidate],
          watchlist: [],
          memoryUpdates: []
        })
    });

    expect(engine.candidates).toEqual([candidate]);
    expect(engine.warnings).toEqual([]);

    saveProposal({ candidate: engine.candidates[0], status: "pending", createdAt: NOW });
    expect(listProposals().map((proposal) => proposal.candidate.id)).toEqual(["ci-watch"]);

    const loopMd = validLoopMd();
    const bundleRunner = scriptedRunner([
      loopMd,
      JSON.stringify({ verdict: "pass", problems: [] })
    ]);
    const bundle = await generateBundle(candidate, {
      runner: bundleRunner,
      bundlesDir: join(loopyHomeDir, "bundles"),
      now: NOW
    });

    expect(bundle.ok).toBe(true);
    if (!bundle.ok) {
      throw new Error(bundle.reason);
    }

    const writtenLoop = await readFile(join(bundle.bundleDir, "loop.md"), "utf8");
    for (const section of [
      "## Responsibility",
      "## Trigger & cadence",
      "## Procedure",
      "## Verification",
      "## Convergence",
      "## Escalation"
    ]) {
      expect(writtenLoop).toContain(section);
    }

    const preInstallHomeListing = snapshotDir(fakeUserHome);
    const calls: ExecCall[] = [];
    const installCtx = installContext(calls);
    await installClaudeCodeLoop(bundle.bundleDir, installCtx);

    const plistPath = join(launchAgentsDir, "com.loopy.ci-watch.plist");
    expect(existsSync(plistPath)).toBe(true);
    expect(await readFile(plistPath, "utf8")).toContain(join(bundle.bundleDir, "loop.md"));
    expect(calls).toContainEqual({ cmd: "launchctl", args: ["load", plistPath] });

    let manifest = readManifest(bundle.bundleDir);
    expect(manifest.installedPaths.length).toBeGreaterThan(0);

    await uninstallLoop(bundle.bundleDir, installCtx);

    expect(existsSync(plistPath)).toBe(false);
    expect(calls).toContainEqual({ cmd: "launchctl", args: ["unload", plistPath] });
    manifest = readManifest(bundle.bundleDir);
    expect(manifest.installedPaths).toEqual([]);
    expect(manifest.uninstallNotes).toEqual([]);
    expect(snapshotDir(fakeUserHome)).toEqual(preInstallHomeListing);
  });
});

function watchContext(): WatchContext {
  return {
    claudeProjectsDir,
    codexSessionsDir,
    spawn: () => undefined,
    isPidAlive: () => false,
    selfPid: 999,
    now: () => NOW
  };
}

async function seedClaudeTranscript(sessionId: string): Promise<void> {
  const projectDir = join(claudeProjectsDir, "project");
  await mkdir(projectDir, { recursive: true });
  await writeFile(
    join(projectDir, `${sessionId}.jsonl`),
    [
      JSON.stringify({
        type: "user",
        sessionId,
        timestamp: NOW,
        cwd: "/x",
        gitBranch: "main",
        message: { role: "user", content: "check ci status please" }
      }),
      JSON.stringify({
        type: "assistant",
        sessionId,
        timestamp: "2026-06-12T09:01:00.000Z",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Bash",
              input: { command: "gh run list" }
            }
          ]
        }
      })
    ].join("\n") + "\n",
    "utf8"
  );
}

function ciWatchCandidate(): Candidate {
  return {
    type: "babysitting",
    id: "ci-watch",
    summary: "Watch CI status instead of checking GitHub runs by hand.",
    evidence: [
      { sessionId: "s1", events: [0, 1] },
      { sessionId: "s2", events: [0, 1] },
      { sessionId: "s3", events: [0, 1] },
      { sessionId: "s4", events: [0, 1] }
    ],
    occurrences: 4,
    confidence: 0.9,
    suggestedTool: "claude-code",
    impactEstimate: "saves ~45 min/week"
  };
}

function validLoopMd(): string {
  return [
    "## Responsibility",
    "Keep the repository's CI status visible without manual polling.",
    "",
    "## Trigger & cadence",
    "Run daily at 09:00.",
    "",
    "## Procedure",
    "Run `gh run list`, inspect the latest workflow run, and summarize any failing jobs.",
    "",
    "## Verification",
    "Assert `gh run list --limit 1` exits 0 before reporting status.",
    "",
    "## Convergence",
    "Stop after one status check and never retry more than 2 times.",
    "",
    "## Escalation",
    "If GitHub cannot be reached or CI is red after 2 tries, stop and notify the human.",
    "",
    "```json",
    JSON.stringify({ kind: "schedule", schedule: "0 9 * * *", tool: "claude-code" }),
    "```",
    ""
  ].join("\n");
}

function scriptedRunner(responses: string[]): LlmRunner {
  let index = 0;
  return async () => {
    const response = responses[index];
    index += 1;
    if (response === undefined) {
      throw new Error(`No scripted response for call ${index}`);
    }
    return response;
  };
}

function installContext(calls: ExecCall[]): InstallContext {
  return {
    claudeSettingsPath,
    launchAgentsDir,
    exec: async (cmd: string, args: string[]): Promise<ExecResult> => {
      calls.push({ cmd, args });
      return { code: 0, out: "" };
    }
  };
}

function readManifest(bundleDir: string): BundleManifest {
  return JSON.parse(readFileSync(join(bundleDir, "manifest.json"), "utf8")) as BundleManifest;
}

function snapshotDir(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const entries: string[] = [];
  function walk(current: string, prefix: string): void {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      entries.push(entry.isDirectory() ? `${relative}/` : relative);
      if (entry.isDirectory()) {
        walk(join(current, entry.name), relative);
      }
    }
  }

  walk(dir, "");
  return entries;
}

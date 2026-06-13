import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from "node:fs";
import { homedir as osHomedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";

import type { Candidate, Proposal } from "./types.js";
import {
  addToRegistry,
  ensureDirs,
  getProposal,
  inRegistry,
  listProposals,
  loadConfig,
  loopyHome,
  readJson,
  saveProposal,
  setProposalStatus,
  writeJsonAtomic
} from "./state.js";
import { defaultRunner, runEngine, type LlmRunner } from "./engine.js";
import { appendEvent } from "./events.js";
import { generateBundle } from "./generator.js";
import { startWatcher, defaultContext } from "./watcher.js";
import {
  readBundleManifest,
  readClaudeSettings,
  readTrigger,
  uninstallLoop,
  writeClaudeSettings,
  type InstallContext
} from "./installers/shared.js";
import { installClaudeCodeLoop } from "./installers/claude-code.js";
import { installCodexLoop } from "./installers/codex.js";
import { runCompanion, type CompanionShellOpts } from "./companion/tui.js";
import { VOICE } from "./companion/voice.js";

// ── Dependency injection ─────────────────────────────────────────────────────
// Every side effect that is awkward to control in tests (process spawning, the
// LLM, the wall clock, the home directory, stdout) flows through this object so
// action functions stay pure and individually testable.
export interface CliDeps {
  runner: LlmRunner;
  exec: (cmd: string, args: string[]) => Promise<{ code: number; out: string }>;
  now: () => string;
  homedir: () => string;
  out: (line: string) => void;
}

export function realDeps(): CliDeps {
  return {
    runner: defaultRunner(),
    exec: (cmd, args) =>
      new Promise((resolve) => {
        execFile(cmd, args, (error, stdout, stderr) => {
          const code =
            error && typeof (error as NodeJS.ErrnoException).code === "number"
              ? ((error as unknown as { code: number }).code as number)
              : error
                ? 1
                : 0;
          resolve({ code, out: `${stdout ?? ""}${stderr ?? ""}` });
        });
      }),
    now: () => new Date().toISOString(),
    homedir: () => osHomedir(),
    out: (line) => {
      process.stdout.write(`${line}\n`);
    }
  };
}

// ── Path helpers (derived from injected homedir) ─────────────────────────────
function claudeSettingsPath(deps: CliDeps): string {
  return join(deps.homedir(), ".claude", "settings.json");
}

function launchAgentsDir(deps: CliDeps): string {
  return join(deps.homedir(), "Library", "LaunchAgents");
}

function daemonPlistPath(deps: CliDeps): string {
  return join(launchAgentsDir(deps), "com.loopy.daemon.plist");
}

function installContext(deps: CliDeps): InstallContext {
  return {
    claudeSettingsPath: claudeSettingsPath(deps),
    launchAgentsDir: launchAgentsDir(deps),
    exec: deps.exec
  };
}

function bundlesDir(): string {
  return join(loopyHome(), "bundles");
}

function bundleDirFor(proposal: Proposal | undefined, id: string): string {
  return proposal?.bundleDir ?? join(bundlesDir(), id);
}

function nowMs(deps: CliDeps): number {
  return new Date(deps.now()).getTime();
}

// ── setup ────────────────────────────────────────────────────────────────────
export interface SetupOpts {
  companion?: string;
  daemon?: boolean;
}

const VALID_COMPANION = ["auto", "manual", "off"] as const;
type CompanionMode = (typeof VALID_COMPANION)[number];

function isCompanionMode(value: string): value is CompanionMode {
  return (VALID_COMPANION as readonly string[]).includes(value);
}

const TRIGGER_HOOK_MARKER = "# loopy:trigger-hook";

function installTriggerHook(deps: CliDeps): boolean {
  const settingsPath = claudeSettingsPath(deps);
  const settings = readClaudeSettings(settingsPath);

  const hooks =
    typeof settings.hooks === "object" && settings.hooks !== null
      ? (settings.hooks as Record<string, unknown>)
      : {};
  settings.hooks = hooks;

  const sessionStart = Array.isArray(hooks.SessionStart)
    ? (hooks.SessionStart as unknown[])
    : [];
  hooks.SessionStart = sessionStart;

  const alreadyPresent = sessionStart.some((entry) => {
    const inner = (entry as { hooks?: unknown })?.hooks;
    return (
      Array.isArray(inner) &&
      inner.some(
        (h) =>
          typeof (h as { command?: unknown })?.command === "string" &&
          ((h as { command: string }).command).includes(TRIGGER_HOOK_MARKER)
      )
    );
  });

  if (alreadyPresent) {
    return false;
  }

  sessionStart.push({
    matcher: "*",
    hooks: [{ type: "command", command: `loopy mark ${TRIGGER_HOOK_MARKER}` }]
  });
  writeClaudeSettings(settingsPath, settings);
  return true;
}

function daemonPlistXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.loopy.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>-c</string>
    <string>loopy daemon</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
`;
}

export async function setupAction(deps: CliDeps, opts: SetupOpts): Promise<void> {
  const companion = opts.companion ?? "auto";
  if (!isCompanionMode(companion)) {
    deps.out(`✗ invalid --companion value: ${companion} (expected auto|manual|off)`);
    return; // do not write config or touch anything on bad input
  }

  ensureDirs();

  writeJsonAtomic(join(loopyHome(), "config.json"), {
    companion,
    dailyTokenCap: 100000,
    pollIntervalMin: 15
  });
  deps.out(`✓ wrote config (companion: ${companion})`);

  const hookAdded = installTriggerHook(deps);
  deps.out(
    hookAdded
      ? `✓ installed SessionStart trigger hook into ${claudeSettingsPath(deps)}`
      : "· trigger hook already present — skipped"
  );

  if (opts.daemon === false) {
    deps.out("· skipped daemon install (--no-daemon)");
    return;
  }

  const plistPath = daemonPlistPath(deps);
  mkdirSync(launchAgentsDir(deps), { recursive: true });
  writeFileSync(plistPath, daemonPlistXml(), "utf8");
  await deps.exec("launchctl", ["load", plistPath]);
  deps.out(`✓ installed + loaded daemon (${plistPath})`);
}

// ── mark ──────────────────────────────────────────────────────────────────--
export async function markAction(deps: CliDeps): Promise<void> {
  const dir = join(loopyHome(), "markers");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${nowMs(deps)}.mark`), "", "utf8");
}

// ── daemon ────────────────────────────────────────────────────────────────--
export async function daemonAction(deps: CliDeps): Promise<void> {
  startWatcher(defaultContext());
  deps.out("loopy daemon watching for sessions…");
  await new Promise<never>(() => {
    // Never resolves: keep the process alive for launchd KeepAlive.
  });
}

// ── scan ──────────────────────────────────────────────────────────────────--
function readDigests(): { digests: string; knownSessionIds: string[] } {
  const dir = join(loopyHome(), "digests");
  if (!existsSync(dir)) {
    return { digests: "", knownSessionIds: [] };
  }

  const files = readdirSync(dir, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith(".txt")
  );

  const knownSessionIds = files.map((entry) => entry.name.slice(0, -".txt".length));
  const digests = files
    .map((entry) => readFileSync(join(dir, entry.name), "utf8"))
    .join("\n");

  return { digests, knownSessionIds };
}

function patternMemoryPath(): string {
  return join(loopyHome(), "log", "pattern-memory.txt");
}

export async function scanAction(deps: CliDeps): Promise<void> {
  ensureDirs();
  const { digests, knownSessionIds } = readDigests();
  const installed = readJson<string[]>(join(loopyHome(), "registry", "installed.json")) ?? [];
  const dismissed = readJson<string[]>(join(loopyHome(), "registry", "dismissed.json")) ?? [];

  const memPath = patternMemoryPath();
  const patternMemory = existsSync(memPath) ? readFileSync(memPath, "utf8") : "";

  const output = await runEngine({
    digests,
    knownSessionIds,
    installed,
    dismissed,
    patternMemory,
    runner: deps.runner
  });

  if (output.skipped) {
    appendEvent("scan", "scan skipped — daily token budget reached", deps.now());
    deps.out("token budget reached — skipped");
    return;
  }

  let saved = 0;
  for (const candidate of output.candidates) {
    if (getProposal(candidate.id) !== undefined) {
      continue;
    }
    if (inRegistry("installed", candidate.id) || inRegistry("dismissed", candidate.id)) {
      continue;
    }
    saveProposal({ candidate, status: "pending", createdAt: deps.now() });
    saved += 1;
  }

  appendEvent("scan", `scan complete: ${saved} new proposal(s)`, deps.now());

  if (output.memoryUpdates.length > 0) {
    const existing = existsSync(memPath) ? readFileSync(memPath, "utf8") : "";
    const appended = existing + output.memoryUpdates.map((line) => `${line}\n`).join("");
    mkdirSync(join(loopyHome(), "log"), { recursive: true });
    writeFileSync(memPath, appended, "utf8");
  }

  deps.out(saved > 0 ? VOICE.proposalNudge(saved) : VOICE.noProposals());
  for (const warning of output.warnings) {
    deps.out(`⚠ ${warning}`);
  }
}

// ── companion callbacks (review / companion) ────────────────────────────────
export async function approveAction(deps: CliDeps, proposal: Proposal): Promise<void> {
  const candidate: Candidate = proposal.candidate;
  const result = await generateBundle(candidate, {
    runner: deps.runner,
    bundlesDir: bundlesDir(),
    now: deps.now()
  });

  if (!result.ok) {
    appendEvent(
      "error",
      `bundle generation failed for ${candidate.id}: ${result.reason}`,
      deps.now()
    );
    deps.out(result.reason);
    return; // leave the proposal pending
  }

  const ctx = installContext(deps);
  if (candidate.suggestedTool === "claude-code") {
    await installClaudeCodeLoop(result.bundleDir, ctx);
  } else {
    await installCodexLoop(result.bundleDir, ctx);
  }

  addToRegistry("installed", candidate.id);
  const stored = getProposal(candidate.id) ?? proposal;
  saveProposal({ ...stored, status: "approved", bundleDir: result.bundleDir });
  appendEvent("approve", `approved + installed "${candidate.id}"`, deps.now());
}

export async function dismissAction(deps: CliDeps, proposal: Proposal): Promise<void> {
  addToRegistry("dismissed", proposal.candidate.id);
  setProposalStatus(proposal.candidate.id, "dismissed");
  appendEvent("dismiss", `dismissed "${proposal.candidate.id}"`, deps.now());
}

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export async function snoozeAction(deps: CliDeps, proposal: Proposal): Promise<void> {
  const id = proposal.candidate.id;
  const snoozedUntil = new Date(nowMs(deps) + SNOOZE_MS).toISOString();
  const stored = getProposal(id) ?? proposal;
  saveProposal({ ...stored, status: "snoozed", snoozedUntil });
  appendEvent("snooze", `snoozed "${id}" for 7 days`, deps.now());
}

export function readCompanionState(deps: CliDeps): { proposals: Proposal[]; sessions: number } {
  const now = nowMs(deps);

  const proposals = listProposals().filter((p) => {
    // A still-active snooze (snoozedUntil in the future) keeps a proposal out
    // of the inbox regardless of status.
    const snoozeActive =
      p.snoozedUntil !== undefined && new Date(p.snoozedUntil).getTime() > now;

    if (p.status === "pending") {
      return !snoozeActive;
    }
    // An expired snooze returns the proposal to the inbox.
    if (p.status === "snoozed") {
      return p.snoozedUntil !== undefined && !snoozeActive;
    }
    return false;
  });

  const digestsDir = join(loopyHome(), "digests");
  let sessions = 0;
  if (existsSync(digestsDir)) {
    const cutoff = now - 4 * 60 * 60 * 1000;
    for (const entry of readdirSync(digestsDir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }
      try {
        if (statSync(join(digestsDir, entry.name)).mtimeMs >= cutoff) {
          sessions += 1;
        }
      } catch {
        // File vanished between readdir and stat — ignore.
      }
    }
  }

  return { proposals, sessions };
}

function companionOpts(deps: CliDeps, startMode: "ambient" | "inbox"): CompanionShellOpts {
  return {
    onApprove: (p) => approveAction(deps, p),
    onDismiss: (p) => dismissAction(deps, p),
    onSnooze: (p) => snoozeAction(deps, p),
    readState: () => readCompanionState(deps),
    startMode
  };
}

export async function reviewAction(deps: CliDeps): Promise<void> {
  await runCompanion(companionOpts(deps, "inbox"));
}

export async function companionAction(deps: CliDeps): Promise<void> {
  await runCompanion(companionOpts(deps, "ambient"));
}

// ── list ──────────────────────────────────────────────────────────────────--
export async function listAction(deps: CliDeps): Promise<void> {
  const installed = readJson<string[]>(join(loopyHome(), "registry", "installed.json")) ?? [];

  for (const id of installed) {
    const dir = bundleDirFor(getProposal(id), id);
    try {
      const manifest = readBundleManifest(dir);
      const trigger = readTrigger(dir);
      deps.out(`${manifest.loopId}  ${manifest.tool}  ${trigger.kind}  ${dir}`);
    } catch {
      deps.out(`${id}  (bundle unreadable)  ${dir}`);
    }
  }
}

// ── uninstall ─────────────────────────────────────────────────────────────--
export async function uninstallAction(deps: CliDeps, opts: { id: string }): Promise<void> {
  const { id } = opts;
  const dir = bundleDirFor(getProposal(id), id);

  await uninstallLoop(dir, installContext(deps));

  const registryFile = join(loopyHome(), "registry", "installed.json");
  const installed = readJson<string[]>(registryFile) ?? [];
  writeJsonAtomic(registryFile, installed.filter((entry) => entry !== id));

  setProposalStatus(id, "dismissed");
  appendEvent("uninstall", `uninstalled "${id}"`, deps.now());
  deps.out(`✓ uninstalled ${id}`);
}

// ── pause / resume ─────────────────────────────────────────────────────────-
export async function pauseAction(deps: CliDeps): Promise<void> {
  const { code } = await deps.exec("launchctl", ["unload", daemonPlistPath(deps)]);
  if (code === 0) {
    appendEvent("pause", "daemon paused", deps.now());
  }
  deps.out(code === 0 ? "✓ daemon paused" : "daemon not installed?");
}

export async function resumeAction(deps: CliDeps): Promise<void> {
  const { code } = await deps.exec("launchctl", ["load", daemonPlistPath(deps)]);
  if (code === 0) {
    appendEvent("resume", "daemon resumed", deps.now());
  }
  deps.out(code === 0 ? "✓ daemon resumed" : "daemon not installed?");
}

// ── status ────────────────────────────────────────────────────────────────--
export async function statusAction(deps: CliDeps): Promise<void> {
  const plistPath = daemonPlistPath(deps);
  deps.out(`daemon: ${existsSync(plistPath) ? "installed" : "not installed"}`);

  const watchPath = join(loopyHome(), "log", "watch.json");
  let lastTick = "never";
  if (existsSync(watchPath)) {
    try {
      lastTick = new Date(statSync(watchPath).mtimeMs).toISOString();
    } catch {
      lastTick = "never";
    }
  }
  deps.out(`last tick: ${lastTick}`);

  const ledger = readJson<Record<string, number>>(join(loopyHome(), "log", "spend.json")) ?? {};
  const today = deps.now().slice(0, 10);
  const cap = loadConfig().dailyTokenCap;
  deps.out(`today's spend: ${ledger[today] ?? 0} / ${cap} tokens`);

  const pending = listProposals().filter((p) => p.status === "pending").length;
  deps.out(`pending proposals: ${pending}`);
}

// ── Program assembly ─────────────────────────────────────────────────────────
export function buildProgram(deps: CliDeps): Command {
  const program = new Command();
  program.name("loopy").description("loopy — your coding-agent loop companion").version("0.1.0");

  program
    .command("setup")
    .description("initialize loopy: config, trigger hook, and daemon")
    .option("--companion <mode>", "companion behaviour: auto | manual | off")
    .option("--no-daemon", "skip installing the background daemon")
    .action((opts: { companion?: string; daemon?: boolean }) =>
      setupAction(deps, {
        companion: opts.companion,
        daemon: opts.daemon
      })
    );

  program
    .command("mark")
    .description("drop a watcher marker (used by the trigger hook)")
    .action(() => markAction(deps));

  program
    .command("daemon")
    .description("run the background watcher")
    .action(() => daemonAction(deps));

  program
    .command("scan")
    .description("analyze digests and propose loops")
    .action(() => scanAction(deps));

  program
    .command("review")
    .description("review pending proposals in the inbox")
    .action(() => reviewAction(deps));

  program
    .command("companion")
    .description("run the ambient companion")
    .action(() => companionAction(deps));

  program
    .command("list")
    .description("list installed loops")
    .action(() => listAction(deps));

  program
    .command("uninstall <id>")
    .description("uninstall a loop by id")
    .action((id: string) => uninstallAction(deps, { id }));

  program
    .command("pause")
    .description("pause the background daemon")
    .action(() => pauseAction(deps));

  program
    .command("resume")
    .description("resume the background daemon")
    .action(() => resumeAction(deps));

  program
    .command("status")
    .description("show loopy status")
    .action(() => statusAction(deps));

  return program;
}

# Task 10: CLI wiring — every command, every module connected

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
Wire all existing modules into the `loopy` CLI with commander. All side effects
(process exec, LLM runner, clock) flow through an injectable deps object so the
action functions are testable; the CLI binds real implementations.

## Files you may touch (exclusive list)
- `src/cli.ts` — create
- `src/index.ts` — REPLACE contents (currently a stub printing the version)
- `tests/cli.test.ts` — create

## Context — existing modules (import with .js suffix, NodeNext ESM)

- `./types.js`: all domain types (Proposal, Candidate, LoopyConfig, BundleManifest...).
- `./state.js`: `loopyHome()`, `ensureDirs()`, `readJson`, `writeJsonAtomic`,
  `listProposals()`, `getProposal(id)`, `saveProposal(p)`, `setProposalStatus(id, st)`,
  `addToRegistry(name, id)`, `inRegistry(name, id)`, `loadConfig()`.
- `./engine.js`: `runEngine(input): Promise<EngineOutput>`, `defaultRunner(): LlmRunner`,
  `LlmRunner = (prompt: string) => Promise<string>`;
  EngineInput needs `{digests, knownSessionIds, installed, dismissed, patternMemory, runner}`;
  EngineOutput has `{skipped, candidates, watchlist, memoryUpdates, warnings}`.
- `./generator.js`: `generateBundle(c, {runner, bundlesDir, now}): Promise<{ok:true,bundleDir}|{ok:false,reason}>`.
- `./installers/shared.js`: `InstallContext {claudeSettingsPath, launchAgentsDir, exec}`,
  `uninstallLoop(bundleDir, ctx)`.
- `./installers/claude-code.js`: `installClaudeCodeLoop(bundleDir, ctx)`.
- `./installers/codex.js`: `installCodexLoop(bundleDir, ctx)`.
- `./watcher.js`: `tick(ctx)`, `startWatcher(ctx)`, `defaultContext(): WatchContext`.
- `./companion/tui.js`: `runCompanion(opts: CompanionShellOpts)` where opts =
  `{onApprove, onDismiss, onSnooze, readState, fps?, startMode?: "ambient"|"inbox"}`.
- `./companion/voice.js`: `VOICE` (use `VOICE.proposalNudge(n)` etc. for output).

## Implementation requirements

**src/cli.ts** — export `buildProgram(deps: CliDeps): Command` plus the deps type:

```ts
export interface CliDeps {
  runner: LlmRunner;
  exec: (cmd: string, args: string[]) => Promise<{code: number; out: string}>;
  now: () => string;
  homedir: () => string;
  out: (line: string) => void;      // print
}
export function realDeps(): CliDeps; // child_process execFile, new Date().toISOString(), os.homedir, console.log-free printer via process.stdout.write
```

Commands (all action logic in exported, individually testable functions
`xxxAction(deps, opts)`):

- `setup [--companion <auto|manual|off>] [--no-daemon]` —
  ensureDirs; write config.json (companion choice, defaults otherwise); install
  the trigger hook into `<homedir>/.claude/settings.json`: append under
  `hooks.SessionStart` an entry whose command is
  `loopy mark # loopy:trigger-hook` (same append-preserve discipline: parse,
  append, 2-space re-serialize; skip if a command containing `# loopy:trigger-hook`
  already exists). Unless --no-daemon: write
  `<homedir>/Library/LaunchAgents/com.loopy.daemon.plist` (ProgramArguments
  ["/bin/sh","-c","loopy daemon"], RunAtLoad true, KeepAlive true) and
  `deps.exec("launchctl", ["load", plist])`. Print what was done.
- `mark` — write a file `<loopyHome()>/markers/<now-ms>.mark` (mkdir -p first). Silent.
- `daemon` — `startWatcher(defaultContext())`, print one line, keep process
  alive (await a never-resolving promise).
- `scan` — read all files in `<loopyHome()>/digests/` (concatenate, collect
  session ids from filenames minus .txt); read registries + pattern memory
  (`<loopyHome()>/log/pattern-memory.txt`, empty string if missing); call
  runEngine with deps.runner. If skipped → print "token budget reached — skipped".
  Else: save each promoted candidate as a pending Proposal (skip ids that
  already have a proposal file or are in either registry), append memoryUpdates
  lines to pattern-memory file, print VOICE.proposalNudge(savedCount) or
  VOICE.noProposals(), print each warning prefixed "⚠ ".
- `review` — companion(startMode "inbox"); `companion` — startMode "ambient".
  Both: runCompanion with callbacks:
  - onApprove(p): generateBundle(p.candidate, {runner: deps.runner,
    bundlesDir: `<loopyHome()>/bundles`, now: deps.now()}); if ok → install via
    the candidate's suggestedTool installer with real ctx
    `{claudeSettingsPath: <homedir>/.claude/settings.json, launchAgentsDir: <homedir>/Library/LaunchAgents, exec: deps.exec}`,
    addToRegistry("installed", id), setProposalStatus(id, "approved"),
    save bundleDir on the proposal; if not ok → print reason, leave pending.
  - onDismiss(p): addToRegistry("dismissed", id) + setProposalStatus "dismissed".
  - onSnooze(p): setProposalStatus "snoozed" + snoozedUntil = now + 7 days.
  - readState: pending proposals (filter snoozedUntil > now out) + sessions =
    count of digest files modified in the last 4 hours.
- `list` — for each installed-registry id: read its bundle manifest, print
  `<loopId>  <tool>  <kind from trigger.json>  <bundleDir>`.
- `uninstall <id>` — uninstallLoop(bundleDir from proposal/bundles dir, real ctx);
  remove id from installed registry (rewrite registry array without it);
  setProposalStatus "dismissed"; print confirmation.
- `pause` / `resume` — launchctl unload / load of com.loopy.daemon.plist via
  deps.exec; tolerate non-zero exit (print "daemon not installed?").
- `status` — print: daemon plist exists?, last tick (mtime of log/watch.json,
  "never" if absent), today's spend from log/spend.json vs configured cap,
  pending proposal count.

**src/index.ts** — `#!/usr/bin/env node` shebang +
`buildProgram(realDeps()).parseAsync(process.argv)`.

Tests (vitest, temp LOOPY_HOME + temp homedir, fake deps recording calls):
1. setup: config written with chosen companion; settings.json hook appended
   (pre-seed an existing unrelated hook → both present); idempotent (second
   setup adds nothing); plist written + launchctl load called; --no-daemon skips.
2. mark: marker file created.
3. scanAction with fake runner returning 2 candidates (1 new, 1 already in
   dismissed registry) → exactly 1 proposal file; memory file appended; rerun
   → 0 new proposals (dedup vs existing proposal file).
4. approve flow (call the onApprove handler directly with fakes): generateBundle
   fake ok → installer called with right ctx paths, registry + status updated.
5. uninstall: registry entry removed, status dismissed.
6. status/list: assemble output from seeded state; no throws on empty state.
Do NOT test `daemon`/`review` interactive loops.

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run tests/cli.test.ts` exit 0.
2. `node dist/index.js --help` (after build) lists all commands.
3. Every command's action is an exported function taking CliDeps (no direct
   process/os/Date access inside action logic).

## Verification
```bash
npm run typecheck && npx vitest run tests/cli.test.ts && npm run build && node dist/index.js --help
```

## Rules
- Touch ONLY the files listed (index.ts replacement is expected).
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: ambiguity/contradiction/unlisted files needed → STOP, write
  `specs/loopy-v1/tasks/10-cli.questions.md`, end turn. Do not guess.

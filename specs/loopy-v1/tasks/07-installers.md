# Task 07: Installers — additive, manifest-tracked, fully reversible

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
Install approved loop bundles into Claude Code and Codex surfaces. Additive-only
writes, every touched path recorded in the manifest, and a one-call uninstall
that leaves zero residue. All host paths and process execution are injected —
tests run entirely in temp dirs with a fake exec.

## Files you may touch (exclusive list)
- `src/installers/shared.ts` — create
- `src/installers/claude-code.ts` — create
- `src/installers/codex.ts` — create
- `tests/installers.test.ts` — create

## Context

From `../types.js` / `./types.js` as appropriate (NodeNext ESM — .js suffix):
`BundleManifest`, `ToolName`.

A bundle dir (produced earlier in the pipeline) contains:
- `loop.md` — the loop prompt
- `trigger.json` — `{"kind": "schedule"|"hook"|"manual", "schedule"?: string, "hookEvent"?: string, "tool": "claude-code"|"codex"}`
  (`schedule` is a cron-style 5-field string, e.g. `"0 9 * * 1"`)
- `manifest.json` — BundleManifest with empty installedPaths/uninstallNotes
- `state/` — the loop's working dir

## Implementation requirements

**shared.ts:**
```ts
export interface ExecResult { code: number; out: string }
export interface InstallContext {
  claudeSettingsPath: string;   // e.g. ~/.claude/settings.json
  launchAgentsDir: string;      // e.g. ~/Library/LaunchAgents
  exec: (cmd: string, args: string[]) => Promise<ExecResult>;
}
export function cronToLaunchdInterval(schedule: string): Record<string, number>[]
// 5-field cron -> launchd StartCalendarInterval entries. Support: "*" (omit
// field), plain numbers, comma lists. Reject ranges/steps with a thrown Error.
// Fields: minute hour day-of-month month weekday.
export function plistFor(label: string, programArgs: string[], intervals: Record<string, number>[]): string
// Minimal valid launchd plist XML: Label, ProgramArguments, StartCalendarInterval (array), StandardOutPath/StandardErrPath under /tmp/<label>.log.
```

**claude-code.ts:**
```ts
export function installClaudeCodeLoop(bundleDir: string, ctx: InstallContext): Promise<BundleManifest>
```
- kind=schedule → write plist `<launchAgentsDir>/com.loopy.<loopId>.plist`
  running `/bin/sh -c 'claude -p "$(cat <bundleDir>/loop.md)"'` (ProgramArguments:
  ["/bin/sh","-c", that string]); then `ctx.exec("launchctl", ["load", plistPath])`.
  Record plist path in installedPaths; note launchctl in uninstallNotes.
- kind=hook → edit `ctx.claudeSettingsPath` JSON: under `hooks.<hookEvent>`
  (array, create file/objects as needed) append
  `{"matcher": "*", "hooks": [{"type": "command", "command": "sh -c 'claude -p \"$(cat <bundleDir>/loop.md)\"' # loopy:<loopId>"}]}`.
  PRESERVE all existing content byte-for-byte semantically (parse, modify,
  re-serialize 2-space indent). The ` # loopy:<loopId>` marker in the command
  string is the removal key. Record settings path in installedPaths.
- kind=manual → nothing to install; manifest unchanged except uninstallNotes
  gets "manual loop — run via: claude -p loop.md".
- Always: update bundle's manifest.json on disk with installedPaths/uninstallNotes; return manifest.

**codex.ts:**
```ts
export function installCodexLoop(bundleDir: string, ctx: InstallContext): Promise<BundleManifest>
```
- kind=schedule → same plist approach, command
  `codex exec --sandbox workspace-write --skip-git-repo-check "$(cat <bundleDir>/loop.md)"`.
- kind=hook → throw Error("codex does not support hook triggers").
- kind=manual → as above with `codex exec`.

**shared.ts also exports:**
```ts
export function uninstallLoop(bundleDir: string, ctx: InstallContext): Promise<void>
```
- Read manifest. For each installedPaths entry: if it's a plist → ctx.exec
  launchctl unload, then delete the file; if it's the claude settings file →
  parse, remove every hook entry whose command contains `# loopy:<loopId>`,
  remove empty arrays/keys left behind, re-serialize (do NOT delete the file).
- Reset manifest installedPaths/uninstallNotes to [] and save. Idempotent:
  second call is a no-op (missing files skipped silently).

Tests (vitest, temp dirs, fake exec recording calls):
1. schedule install (claude-code): plist exists, contains label + loop.md path,
   launchctl load called once; manifest updated on disk.
2. hook install: pre-seed settings.json with an existing unrelated hook →
   after install both entries present, original untouched; marker present.
3. uninstall after 1: plist gone, launchctl unload called, manifest emptied.
4. uninstall after 2: our entry gone, the pre-existing hook intact.
5. Double uninstall → no throw.
6. codex schedule install + uninstall round-trip; codex hook → throws.
7. cronToLaunchdInterval: "0 9 * * 1" → [{Minute:0,Hour:9,Weekday:1}];
   "30 8,18 * * *" → two entries; "*/5 ..." → throws.

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run tests/installers.test.ts` exit 0.
2. Install→uninstall leaves the temp HOME byte-identical to before (test
   asserts no residue files and settings.json deep-equals original).
3. No function reads os.homedir() — all paths come from ctx.

## Verification
```bash
npm run typecheck && npx vitest run tests/installers.test.ts
```

## Rules
- Touch ONLY the files listed. Do not modify types.ts/state.ts/package.json.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: ambiguity/contradiction/unlisted files needed → STOP, write
  `specs/loopy-v1/tasks/07-installers.questions.md`, end turn. Do not guess.

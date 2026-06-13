# Task 03: Dashboard shell + CLI wiring (retire v1 companion TUI)

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it. This is a TypeScript
strict ESM (NodeNext) project; imports of local modules use the `.js` suffix.

## Objective
Turn the merged pure dashboard (renderer + reducer) into the thing the user
actually runs: bare `loopy` opens a full-terminal dashboard. Build the
interactive shell (raw stdin, render loop, resize, clean exit), a disk→state
data assembler, and an effect dispatcher that wires reducer Effects to the
existing CLI actions. Retire the old 44×14 companion TUI.

## Files you may touch (exclusive list)
- `src/dashboard/shell.ts` — create (assembler + effect dispatch + interactive shell)
- `src/cli.ts` — modify (reviewAction/companionAction use the dashboard; add a
  default command so bare `loopy` opens it; drop the companion/tui import)
- `src/index.ts` — modify (no behavior change needed if commander default
  command handles bare invocation — but verify bare `loopy` opens the dashboard)
- `tests/dashboard-shell.test.ts` — create
- DELETE `src/companion/tui.ts` (v1 TUI retired)
- DELETE `src/companion/frames.ts` (only the deleted tui.ts/test used it)
- DELETE `tests/companion.test.ts` (tests the retired TUI)

Do NOT touch src/dashboard/state.ts, src/dashboard/render.ts,
src/companion/voice.ts (VOICE is still used by scanAction), or any other file.

## Context — existing modules (import with .js suffix)

### src/dashboard/state.ts (already merged — DO NOT modify)
```ts
export type Focus = "inbox" | "loops" | "activity";
export interface EventRow { t: string; kind: string; msg: string; }
export interface LoopRow { id: string; kind: string; tool: string; }
export interface DashboardData {
  sessions: number;
  daemon: "running" | "paused" | "not-installed";
  spendToday: number; spendCap: number;
  proposals: Proposal[];   // from ../types.js
  loops: LoopRow[];
  events: EventRow[];      // oldest-first (newest last)
}
export interface DashboardState {
  data: DashboardData; focus: Focus;
  inboxIndex: number; loopsIndex: number; activityScroll: number;
  moodFrame: number; spinnerFrame: number;
  flash?: string;
  confirm?: { action: "approve" | "dismiss" | "uninstall"; targetId: string };
  busy?: string; quit?: boolean;
}
export type DashboardAction =
  | { kind: "key"; key: string }      // normalized: single chars, "up","down","tab","esc","enter"
  | { kind: "tick" }
  | { kind: "data"; data: DashboardData }
  | { kind: "busy"; label: string }
  | { kind: "done"; flash: string };
export type Effect =
  | { type: "approve"; id: string } | { type: "dismiss"; id: string }
  | { type: "snooze"; id: string }  | { type: "uninstall"; id: string }
  | { type: "scan" } | { type: "toggle-pause" };
export function reduce(s: DashboardState, a: DashboardAction): { state: DashboardState; effect?: Effect };
```

### src/dashboard/render.ts (already merged — DO NOT modify)
```ts
export function renderDashboard(s: DashboardState, cols: number, rows: number): string;
export const MIN_COLS: number; export const MIN_ROWS: number;
```

### src/cli.ts (you ARE modifying this; these already exist there)
- `export interface CliDeps { runner; exec(cmd,args): Promise<{code:number;out:string}>; now(): string; homedir(): string; out(line: string): void; }`
- `export function realDeps(): CliDeps`
- Actions (all exist, all async unless noted):
  `approveAction(deps, proposal: Proposal)`, `dismissAction(deps, proposal)`,
  `snoozeAction(deps, proposal)`, `uninstallAction(deps, {id})`,
  `scanAction(deps)`, `pauseAction(deps)`, `resumeAction(deps)`,
  `readCompanionState(deps): { proposals: Proposal[]; sessions: number }` (sync).
- Currently `reviewAction`/`companionAction` call `runCompanion(...)` from
  `./companion/tui.js`. You will replace those two function bodies to call the
  new dashboard shell, and remove the now-unused
  `import { runCompanion, type CompanionShellOpts } from "./companion/tui.js";`
  Also remove the now-unused `companionOpts` helper if it becomes dead.
- Helpers already in cli.ts you may reuse by EXPORTING them if needed:
  `loopyHome()` (from state.js), `getProposal(id)`, `readJson`, `loadConfig`,
  `readBundleManifest`, `readTrigger`, `bundleDirFor`, `daemonPlistPath(deps)`.
  `daemonPlistPath` and `bundleDirFor` are currently module-private — export
  them so shell.ts can reuse them (exporting is allowed; do not change bodies).

### src/state.ts, src/events.ts, src/installers/shared.ts (DO NOT modify; import only)
- state: `loopyHome()`, `getProposal(id): Proposal | undefined`,
  `readJson<T>(path): T | undefined`, `loadConfig(): { dailyTokenCap: number; ... }`.
- events: `readEvents(limit: number): { t; kind; msg }[]` (oldest-first).
- installers/shared: `readBundleManifest(dir): { loopId; tool; ... }`,
  `readTrigger(dir): { kind; ... }`.

## src/dashboard/shell.ts — required public surface

```ts
import type { CliDeps } from "../cli.js";
import type { DashboardData, Effect, Focus } from "./state.js";

// Assemble the live DashboardData from disk + launchctl. ASYNC (daemon state
// needs deps.exec). Pure read — performs no mutations.
export async function assembleData(deps: CliDeps): Promise<DashboardData>;

// Execute one reducer Effect against the real CLI actions and return the flash
// string to show afterward. ASYNC.
export async function dispatchEffect(deps: CliDeps, effect: Effect): Promise<string>;

// The interactive shell: raw-mode stdin, render loop, resize, clean exit.
// startFocus defaults to "inbox". Resolves when the user quits.
export function runDashboard(deps: CliDeps, startFocus?: Focus): Promise<void>;
```

### assembleData rules
- `sessions` and `proposals`: from `readCompanionState(deps)` (reuse it exactly
  — same snooze/pending filtering the inbox already uses).
- `daemon`: let `plist = daemonPlistPath(deps)`. If `!existsSync(plist)` →
  `"not-installed"`. Else `await deps.exec("launchctl", ["list", "com.loopy.daemon"])`:
  `code === 0` → `"running"`, otherwise `"paused"` (plist present but not loaded).
- `spendToday`: `(readJson<Record<string,number>>(loopyHome()+"/log/spend.json") ?? {})[deps.now().slice(0,10)] ?? 0`.
- `spendCap`: `loadConfig().dailyTokenCap`.
- `loops`: for each id in `readJson<string[]>(loopyHome()+"/registry/installed.json") ?? []`:
  resolve `dir = bundleDirFor(getProposal(id), id)`; try
  `{ id: manifest.loopId, kind: readTrigger(dir).kind, tool: manifest.tool }`;
  on any throw, fall back to `{ id, kind: "?", tool: "?" }`. Never throw.
- `events`: `readEvents(50)` mapped to `{ t, kind, msg }` (already that shape).

### dispatchEffect rules (return the flash string)
- `approve`: `const p = getProposal(id)`; if undefined → return `bundle "${id}" not found`.
  Else `await approveAction(deps, p)`; return `🌱 "${id}" installed — it's off your plate now`.
  (The 🌱 prefix makes the reducer's deriveMood show celebrate.)
- `dismiss`: `const p = getProposal(id)`; if undefined → return `"${id}" not found`.
  Else `await dismissAction(deps, p)`; return `dismissed "${id}"`.
- `snooze`: `const p = getProposal(id)`; if undefined → return `"${id}" not found`.
  Else `await snoozeAction(deps, p)`; return `snoozed "${id}" for 7 days`.
- `uninstall`: `await uninstallAction(deps, { id })`; return `uninstalled "${id}"`.
- `scan`: run `scanAction` with a deps whose `out` captures lines into an array
  (spread the real deps, override `out`); after it resolves return the LAST
  captured line, or `scan complete` if it captured nothing.
- `toggle-pause`: read current daemon via `assembleData(deps)`. If
  `daemon === "running"` → `await pauseAction(deps)` and return `daemon paused`;
  else → `await resumeAction(deps)` and return `daemon resumed`.

### runDashboard rules (interactive shell — NOT unit-tested)
- Initial: `data = await assembleData(deps)`; build initial DashboardState
  `{ data, focus: startFocus ?? "inbox", inboxIndex:0, loopsIndex:0,
     activityScroll:0, moodFrame:0, spinnerFrame:0 }`.
- Raw mode: if `process.stdin.isTTY`, `setRawMode(true)`; `resume()`. Render via
  `process.stdout.write("\x1b[2J\x1b[H" + renderDashboard(state, cols, rows) + "\n")`
  where `cols = process.stdout.columns ?? 80`, `rows = process.stdout.rows ?? 24`.
- Tick: `setInterval` ~3fps dispatching `{kind:"tick"}` then render. `unref()` it.
- Resize: on `process.stdout.on("resize", …)` re-render at new size.
- Key normalization (stdin "data" → normalized key string for the reducer):
  `\x1b[A`→"up", `\x1b[B`→"down", `\x1b[C`→"right", `\x1b[D`→"left",
  lone `\x1b`→"esc", `\r`/`\n`→"enter", `\t`→"tab", `\x03` (ctrl-c)→quit
  immediately (clean up + resolve). Lowercase single letters pass through.
- Effect handling: when `reduce` returns an `effect`, FIRST dispatch
  `{kind:"busy", label}` to the state and render (label: "scanning" for scan,
  "working" otherwise), THEN `await dispatchEffect`, THEN dispatch
  `{kind:"done", flash}` with the returned string, THEN
  `data = await assembleData(deps)` + dispatch `{kind:"data", data}`, then
  render. While awaiting, ignore further keypresses (a simple `busy` boolean
  guard in the shell is fine; the reducer also guards via state.busy).
- Quit: on `state.quit` (from reducer `q`) or ctrl-c: clear interval, remove
  listeners, `setRawMode(false)` if TTY, `process.stdout.write("\n")`, resolve.
- Keep this shell THIN: all rendering/decision logic already lives in
  render.ts/state.ts; the shell only does IO, the effect await-cycle, and
  refresh-after-effect.

## CLI wiring
- Replace `reviewAction` body: `await runDashboard(deps, "inbox")`.
- Replace `companionAction` body: `await runDashboard(deps, "inbox")`
  (companion and review now open the same dashboard).
- Bare `loopy` (no subcommand) must open the dashboard. With commander, add:
  `program.action(() => runDashboard(deps, "inbox"));` so that running with no
  command invokes the dashboard, while `--help`/`-h` and all existing
  subcommands still work unchanged. Keep the `review`, `companion`, `scan`,
  etc. subcommands exactly as they are (review/companion just call runDashboard
  via their actions).
- Remove the `runCompanion`/`CompanionShellOpts` import and any now-dead
  `companionOpts` helper. `readCompanionState` STAYS (assembleData uses it).

## tests/dashboard-shell.test.ts (vitest, temp LOOPY_HOME + temp homedir, fake deps)
Build a fake CliDeps the same way tests/cli.test.ts does (read it for the
makeDeps pattern: temp LOOPY_HOME via mkdtemp, fixed now(), exec recorder,
out collector). Test ONLY the pure-ish exported functions, NOT runDashboard's
stdin loop:
1. assembleData on empty state: proposals [], loops [], sessions 0,
   daemon "not-installed" (no plist), spendToday 0, spendCap from config,
   events [].
2. assembleData with seed: 2 pending proposals saved, 1 installed loop (seed a
   bundle dir with manifest.json {loopId, tool} + trigger.json {kind} and add
   id to installed.json), spend.json {today: 1234}, a couple events appended →
   proposals length 2, loops length 1 with correct {id,kind,tool}, spendToday
   1234, events length ≥ 2. daemon: with a fake exec returning code 0 when a
   plist file exists → "running"; make the plist exist and assert "running";
   with exec returning non-zero → "paused".
3. dispatchEffect dismiss: seed a pending proposal, call
   `dispatchEffect(deps, {type:"dismiss", id})` → returns `dismissed "<id>"`,
   the proposal is now dismissed (getProposal status), and an event was logged.
4. dispatchEffect snooze: returns the snooze flash and sets snoozedUntil.
5. dispatchEffect scan: with a fake runner returning 1 new candidate JSON
   (reuse the engineResponse shape from tests/cli.test.ts) → returns a
   non-empty flash string and a proposal file now exists.
6. dispatchEffect toggle-pause: plist exists + exec code 0 (running) → returns
   "daemon paused" and records an unload exec call; plist exists + exec code 1
   (paused) → returns "daemon resumed" and records a load exec call.

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run` (full suite) exit 0.
2. `npm run build && node dist/index.js --help` still lists all subcommands.
3. Bare `node dist/index.js` (no args) invokes runDashboard (you cannot drive
   the TTY in a test; instead assert via a unit test that buildProgram's
   default action is wired — e.g. parse `["node","loopy"]` with a deps whose
   runDashboard path is observable, OR keep it simple: a test that the program
   has a default action handler. If that is awkward, assert bare-invocation
   routing indirectly by confirming reviewAction and companionAction both call
   runDashboard — acceptable: export a tiny seam if needed but DO NOT add new
   public API beyond what's listed; prefer asserting --help still works +
   the three deleted files are gone.)
4. The three deleted files no longer exist; nothing imports companion/tui or
   companion/frames anymore (`grep -r "companion/tui\|companion/frames" src tests`
   returns nothing).

## Verification
```bash
npm run typecheck && npx vitest run && npm run build && node dist/index.js --help
grep -rn "companion/tui\|companion/frames" src tests || echo "clean: no stale imports"
```

## Rules
- Touch ONLY the listed files (creating, modifying, or deleting as specified).
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: ambiguity/contradiction/unlisted files needed → STOP, write
  `specs/loopy-dash-v1/tasks/03-shell.questions.md`, end turn. Do not guess.

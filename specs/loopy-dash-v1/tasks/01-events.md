# Task 01: Event log — append-only activity journal + writer wiring

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
Loopy currently has NO record of what it does — users can't see daemon
activity. Build an append-only JSONL event log and wire every state-changing
action to write to it.

## Files you may touch (exclusive list)
- `src/events.ts` — create
- `src/watcher.ts` — modify (add event writes only)
- `src/cli.ts` — modify (add event writes only)
- `tests/events.test.ts` — create

## Context — existing modules (import with .js suffix, NodeNext ESM)
- `./state.js`: `loopyHome()` (honors LOOPY_HOME env; log dir is
  `<loopyHome()>/log`, already created by `ensureDirs()` but appendEvent must
  mkdir -p it defensively since the watcher can run before setup).
- `src/watcher.ts` exports `tick(ctx: WatchContext)`; inside it, `digested`
  (string[] of session ids) and `markersConsumed`/`companionSpawned` are
  computed; `ctx.now(): string` returns an ISO timestamp.
- `src/cli.ts` exports actions taking `deps: CliDeps` where `deps.now(): string`
  returns an ISO timestamp: `scanAction`, `approveAction`, `dismissAction`,
  `snoozeAction`, `uninstallAction`, `pauseAction`, `resumeAction`.

## src/events.ts — exact public surface

```ts
export type EventKind =
  | "digest" | "scan" | "propose" | "approve" | "dismiss" | "snooze"
  | "install" | "uninstall" | "pause" | "resume" | "spawn" | "error";

export interface LoopyEvent {
  t: string;       // ISO timestamp (callers pass their injected clock)
  kind: EventKind;
  msg: string;     // human-readable single line
}

export function appendEvent(kind: EventKind, msg: string, t: string): void;
// Appends one JSON line to <loopyHome()>/log/events.jsonl (mkdir -p the log
// dir first). After appending, if the file exceeds 512 * 1024 bytes, rewrite
// it keeping only the most recent 1000 lines. Newlines inside msg must be
// replaced with spaces before serializing.

export function readEvents(limit: number): LoopyEvent[];
// Returns the most recent `limit` events, oldest-first (newest last).
// Missing file → []. A line that fails JSON.parse or lacks t/kind/msg string
// fields is skipped silently (it is a log, not a database).
```

## Writer wiring (each call passes the caller's injected clock)

In `src/watcher.ts` `tick()`:
- after the digest loop, if `digested.length > 0`:
  `appendEvent("digest", `digested ${digested.length} session(s): ${digested.join(", ")}`, ctx.now())`
- if the companion was spawned this tick:
  `appendEvent("spawn", "opened companion window", ctx.now())`

In `src/cli.ts`:
- `scanAction`: when engine output `skipped` →
  `appendEvent("scan", "scan skipped — daily token budget reached", deps.now())`;
  otherwise → `appendEvent("scan", `scan complete: ${saved} new proposal(s)`, deps.now())`
  (after the save loop, where `saved` already exists).
- `approveAction`: on generateBundle failure →
  `appendEvent("error", `bundle generation failed for ${id}: ${reason}`, deps.now())`;
  on success after install →
  `appendEvent("approve", `approved + installed "${id}"`, deps.now())`.
- `dismissAction` → `appendEvent("dismiss", `dismissed "${id}"`, deps.now())`.
- `snoozeAction` → `appendEvent("snooze", `snoozed "${id}" for 7 days`, deps.now())`.
- `uninstallAction` → `appendEvent("uninstall", `uninstalled "${id}"`, deps.now())`.
- `pauseAction` (exit 0 only) → `appendEvent("pause", "daemon paused", deps.now())`.
- `resumeAction` (exit 0 only) → `appendEvent("resume", "daemon resumed", deps.now())`.

Do NOT change any existing behavior, signatures, or output lines in these
files — event writes are pure additions.

## tests/events.test.ts (vitest, temp LOOPY_HOME via mkdtemp)
1. appendEvent writes parseable JSONL; readEvents returns them oldest-first
   and respects limit.
2. readEvents on missing file → []; corrupt line in the middle is skipped,
   valid neighbors survive.
3. Rotation: append until > 512KB (write long msgs), assert file shrinks to
   exactly 1000 lines and the kept lines are the most recent ones.
4. msg with embedded newline is flattened to spaces.
5. Wiring smoke (no LLM): call `dismissAction`/`snoozeAction` with fake deps
   (now() fixed) on a seeded proposal → events.jsonl contains the dismiss and
   snooze events with the fixed timestamp. (Import the actions from
   `../src/cli.js`; build fake CliDeps exactly like tests/cli.test.ts does —
   read it for the makeDeps pattern.)

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run tests/events.test.ts` exit 0.
2. `npx vitest run` (full suite) exits 0 — existing tests must not break.
3. No existing exported signature changed.

## Verification
```bash
npm run typecheck && npx vitest run
```

## Rules
- Touch ONLY the files listed.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: ambiguity/contradiction/unlisted files needed → STOP, write
  `specs/loopy-dash-v1/tasks/01-events.questions.md`, end turn. Do not guess.

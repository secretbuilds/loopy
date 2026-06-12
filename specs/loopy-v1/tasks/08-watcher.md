# Task 08: Watcher — transcript polling, marker wake, companion spawn

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
The always-on piece of "loopy": notices new/changed coding-agent transcripts,
digests them to disk, and spawns the companion window (singleton) when a
session starts. Zero LLM calls. Everything injectable; tests use temp dirs.

## Files you may touch (exclusive list)
- `src/watcher.ts` — create
- `tests/watcher.test.ts` — create

## Context — existing modules (import with .js suffix, NodeNext ESM)

- `./types.js`: `SessionRecord`, `LoopyConfig`.
- `./state.js`: `loopyHome()`, `readJson<T>(p)`, `writeJsonAtomic(p, v)`, `loadConfig()`.
- `./adapters/claude-code.js`: `parseClaudeCodeTranscript(content): SessionRecord|undefined`,
  `listClaudeCodeTranscripts(baseDir): string[]`.
- `./adapters/codex.js`: `parseCodexSession(content): SessionRecord|undefined`,
  `listCodexSessions(baseDir): string[]`.
- `./digester.js`: `digestSession(record): string`.

## Implementation requirements

```ts
export interface WatchContext {
  claudeProjectsDir: string;   // default: ~/.claude/projects
  codexSessionsDir: string;    // default: ~/.codex/sessions
  spawn: (argv: string[]) => void;   // injected process spawner
  isPidAlive: (pid: number) => boolean;
  selfPid: number;
  now: () => string;           // ISO clock, injected
}
export interface TickResult {
  digested: string[];          // sessionIds digested this tick
  markersConsumed: number;
  companionSpawned: boolean;
}
export function tick(ctx: WatchContext): Promise<TickResult>;
export function startWatcher(ctx: WatchContext): { stop(): void };
export function defaultContext(): WatchContext;  // real dirs, real spawn (see below)
```

**tick() behavior:**
1. Consume markers: delete every file in `<loopyHome()>/markers/` (create dir
   if missing), count them.
2. Scan both adapters' dirs. Track state in `<loopyHome()>/log/watch.json`
   shape `{ files: { "<absPath>": <mtimeMs> } }`. A file is NEW/CHANGED when
   its mtimeMs differs from the recorded one.
3. For each new/changed file: read, parse with the matching adapter; if a
   record comes back, write `<loopyHome()>/digests/<sessionId>.txt` containing
   `digestSession(record)`. Update watch.json. Parse failures: skip silently
   (adapter already fail-soft), still record mtime (don't reparse forever).
4. Companion spawn check — run when (markers consumed > 0) OR (any file
   digested): if `loadConfig().companion === "auto"`, check singleton lock
   `<loopyHome()>/companion.lock` (JSON `{pid: number}`): if missing OR
   `!ctx.isPidAlive(pid)` → `ctx.spawn(["loopy","companion"])`, write lock with
   `{pid: ctx.selfPid}` placeholder — the real pid is corrected by the
   companion process itself; for this task just write the lock after spawning.
   If lock pid alive → do not spawn.
5. Return TickResult.

**startWatcher():** runs tick immediately, then every
`loadConfig().pollIntervalMin` minutes (setInterval, `.unref()`), plus an
`fs.watch` on the markers dir that triggers an extra tick (debounce 2s).
Returns stop() clearing both.

**defaultContext():** real paths from os.homedir(); spawn uses child_process
spawn with `osascript -e 'tell application "Terminal" to do script "loopy companion"'`
on darwin, plain detached `loopy companion` elsewhere; detached:true, unref.

Tests (vitest, temp LOOPY_HOME + temp transcript dirs, fake spawn/isPidAlive/now):
1. Seed a valid claude-code jsonl (synthesize per the user/assistant line format
   with type:"user", message.content string, sessionId, timestamp fields) and a
   codex jsonl (session_meta + response_item message) → tick → two digest files
   exist, names = sessionIds, content non-empty.
2. Second tick with no changes → digested empty.
3. Touch (rewrite) one file → only that session re-digested.
4. Marker file present + companion=auto + no lock → spawn called once, marker
   consumed, lock written.
5. Lock with alive pid → no spawn. Lock with dead pid → spawn.
6. companion=off → never spawns even with markers.
7. Garbage transcript file → no digest, no throw, mtime recorded (tick 2 skips it).

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run tests/watcher.test.ts` exit 0.
2. Two ticks with a live lock spawn the companion exactly once (singleton).
3. tick() never throws on garbage input files.

## Verification
```bash
npm run typecheck && npx vitest run tests/watcher.test.ts
```

## Rules
- Touch ONLY the files listed. Do not modify existing files.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: ambiguity/contradiction/unlisted files needed → STOP, write
  `specs/loopy-v1/tasks/08-watcher.questions.md`, end turn. Do not guess.

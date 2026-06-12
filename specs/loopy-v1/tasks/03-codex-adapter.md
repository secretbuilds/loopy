# Task 03: Codex session adapter

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
Parse OpenAI Codex CLI session rollout files (JSONL) into the project's common
`SessionRecord` format, fail-soft. Part of "loopy", a tool that analyzes coding
sessions to suggest automations. The project scaffold already exists.

## Files you may touch (exclusive list)
- `src/adapters/codex.ts` — create
- `tests/adapters/codex.test.ts` — create
- `tests/fixtures/codex/session1.jsonl` — create (synthetic, per format below)
- `tests/fixtures/codex/messy.jsonl` — create (malformed/noise cases)

## Context

Existing types in `src/types.ts` (import as `../types.js` — this project is
NodeNext ESM, relative imports REQUIRE the .js suffix):

```ts
export interface SessionEvent {
  t: string; kind: "user_msg" | "command" | "tool_call" | "error";
  text?: string; name?: string; summary?: string;
}
export interface SessionRecord {
  tool: "claude-code" | "codex"; sessionId: string; startedAt: string;
  endedAt: string; cwd: string; repo?: string; branch?: string;
  events: SessionEvent[];
}
```

### Real session format (documented from actual files — trust this)

One JSON object per line: `{ timestamp: string, type: string, payload: object }`.
Relevant types:

- `"session_meta"`: `payload = { id, timestamp, cwd, originator, cli_version, source }`
  → provides sessionId and cwd. First line of the file.
- `"response_item"`: `payload.type` varies:
  - `"message"`: `{ type:"message", role:"user"|"assistant"|"developer"|"system", content: Array<{type:"input_text"|"output_text", text:string}> }`
    — only `role:"user"` becomes an event; SKIP developer/system/assistant roles
    (developer messages are injected instructions, not the human).
    Also SKIP user messages whose text starts with `<permissions` or
    `<environment_context` (injected blocks).
  - `"function_call"`: `{ type:"function_call", name:string, arguments:string }`
    → tool_call event.
  - `"function_call_output"`: SKIP.
  - `"reasoning"`: SKIP.
- `"event_msg"`: `payload.type` e.g. `"task_started"`, `"agent_message"`,
  `"error"` — map only `"error"` → error event with `summary` from
  `payload.message ?? JSON.stringify(payload)` (200 chars). SKIP all others.
- Any other line type: SKIP.

## Implementation requirements

Export from `src/adapters/codex.ts`:

1. `parseCodexSession(content: string): SessionRecord | undefined`
   - Pure, fail-soft per line (bad JSON skipped). `undefined` if no usable events.
   - Mapping: user message → `user_msg` (join content[].text, truncate 500);
     function_call → `tool_call` (`name` = payload.name, `summary` = first 120
     chars of arguments string); event_msg error → `error`.
   - `sessionId`/`cwd` from session_meta (fall back: sessionId = "unknown",
     cwd = ""); `startedAt`/`endedAt` = min/max timestamps of mapped events
     (fall back to session_meta timestamp); `tool` = `"codex"`.
2. `listCodexSessions(baseDir: string): string[]`
   - Recursively find `*.jsonl` under baseDir (real layout nests by date:
     `<baseDir>/2026/06/12/rollout-*.jsonl`), return absolute paths, missing
     dir → empty array.

Fixtures: `session1.jsonl` = realistic happy path (session_meta; a developer
message to be skipped; 2 real user messages; 2 function_calls e.g. name "shell";
1 event_msg error; 2 reasoning items; a function_call_output). `messy.jsonl` =
malformed lines, missing payload, unknown types, no session_meta — parser
survives and falls back as specified.

Tests (vitest): golden assertions on session1 (event count/kinds/order,
sessionId, cwd, skipped developer + injected blocks, tool_call name/summary);
messy fail-soft + fallbacks; garbage → undefined; listCodexSessions with temp
nested dirs and missing dir.

## Acceptance criteria
1. `npm run typecheck` and `npx vitest run tests/adapters/codex.test.ts` exit 0.
2. Parser never throws on arbitrary input.
3. Developer/system/assistant messages and injected user blocks produce zero events.

## Verification
```bash
npm run typecheck && npx vitest run tests/adapters/codex.test.ts
```

## Rules
- Touch ONLY the files listed. Do not modify src/types.ts, package.json, or any
  existing file. Do not create documentation files.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: if this brief is ambiguous, contradictory, or requires touching
  unlisted files — STOP. Write your questions to
  `specs/loopy-v1/tasks/03-codex-adapter.questions.md` and end your turn. Do not guess.

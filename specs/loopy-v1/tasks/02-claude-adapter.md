# Task 02: Claude Code transcript adapter

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
Parse Claude Code session transcripts (JSONL files) into the project's common
`SessionRecord` format, fail-soft. Part of "loopy", a tool that analyzes coding
sessions to suggest automations. The project scaffold already exists.

## Files you may touch (exclusive list)
- `src/adapters/claude-code.ts` — create
- `tests/adapters/claude-code.test.ts` — create
- `tests/fixtures/claude-code/session1.jsonl` — create (synthetic, per format below)
- `tests/fixtures/claude-code/messy.jsonl` — create (malformed/noise cases)

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

### Real transcript format (documented from actual files — trust this)

One JSON object per line. Every line has a `type` field. Relevant types:

- `"user"`: `{ type:"user", sessionId, timestamp, cwd, gitBranch, isMeta?, isSidechain?, message: { role:"user", content: string | Array<{type:string, text?:string}> } }`
  - `content` may be a plain string OR an array of blocks; for arrays, join the `text` of blocks with `type:"text"`.
- `"assistant"`: `{ type:"assistant", sessionId, timestamp, message: { content: Array<{type:"text"|"tool_use", name?:string, input?:object, text?:string}> } }`
  - each `tool_use` block has `name` (e.g. "Bash", "Edit") and `input` object.
- `"system"`: `{ type:"system", sessionId, timestamp, content, level?, subtype? }`

Noise types to SKIP entirely: `last-prompt`, `mode`, `permission-mode`,
`attachment`, `file-history-snapshot`, `ai-title`, `queue-operation`, and any
unknown type. Also skip any line with `isMeta: true` or `isSidechain: true`.

## Implementation requirements

Export from `src/adapters/claude-code.ts`:

1. `parseClaudeCodeTranscript(content: string): SessionRecord | undefined`
   - Pure function over file content. Returns `undefined` if no usable events.
   - Fail-soft per line: unparseable JSON lines are skipped, never thrown.
   - Mapping:
     - `user` lines → `user_msg` event with `text` (truncate to 500 chars).
       If the text starts with `/` (e.g. `/review`), emit kind `command` with
       `name` = first token instead. If the text contains
       `<command-name>X</command-name>`, emit `command` with name X.
     - `assistant` `tool_use` blocks → `tool_call` events: `name` = block name,
       `summary` = for Bash use `input.description ?? input.command`, else
       JSON.stringify(input); truncate summary to 120 chars.
     - `system` lines where `level === "error"` → `error` event with
       `summary` = first 200 chars of content.
   - `sessionId` from the first line carrying one; `startedAt`/`endedAt` from
     min/max timestamps of mapped events; `cwd`/`branch` from the first `user`
     line that has `cwd`/`gitBranch`. `tool` is `"claude-code"`. `repo` left undefined.
2. `listClaudeCodeTranscripts(baseDir: string): string[]`
   - Returns absolute paths of all `*.jsonl` files in immediate subdirectories
     of `baseDir` (layout: `<baseDir>/<project-slug>/<session>.jsonl`).
     Missing baseDir → empty array.

Fixtures: `session1.jsonl` = a realistic happy-path session (≥2 user msgs incl.
one `/command`, ≥2 tool_use blocks, 1 error system line, plus several noise-type
lines and one isMeta line). `messy.jsonl` = malformed JSON lines, unknown types,
a user line with array content, lines missing timestamps — parser must survive
all of it and still return a record from the valid parts.

Tests (vitest): golden assertions on session1 (exact event count, kinds in
order, sessionId, cwd, command name extraction, tool_call summary content);
messy.jsonl fail-soft behavior; empty/garbage content → undefined;
listClaudeCodeTranscripts with a temp dir layout and with a missing dir.

## Acceptance criteria
1. `npm run typecheck` and `npx vitest run tests/adapters/claude-code.test.ts` exit 0.
2. Parser never throws on arbitrary text input (test with garbage).
3. Noise types and isMeta/isSidechain lines produce zero events.

## Verification
```bash
npm run typecheck && npx vitest run tests/adapters/claude-code.test.ts
```

## Rules
- Touch ONLY the files listed. Do not modify src/types.ts, package.json, or any
  existing file. Do not create documentation files.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: if this brief is ambiguous, contradictory, or requires touching
  unlisted files — STOP. Write your questions to
  `specs/loopy-v1/tasks/02-claude-adapter.questions.md` and end your turn. Do not guess.

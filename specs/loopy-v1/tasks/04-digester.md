# Task 04: Digester — deterministic session reduction + secret redaction

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
Reduce parsed coding sessions into compact text digests for later LLM analysis,
with aggressive secret redaction. Deterministic, zero LLM calls. Part of
"loopy". The project scaffold already exists.

## Files you may touch (exclusive list)
- `src/digester.ts` — create
- `tests/digester.test.ts` — create

## Context

Existing types in `src/types.ts` (import as `./types.js` — NodeNext ESM,
relative imports REQUIRE the .js suffix):

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

## Implementation requirements

Export from `src/digester.ts`:

1. `redact(text: string): string` — replaces, in order:
   - Known token prefixes followed by 8+ non-space chars: `sk-`, `ghp_`, `gho_`,
     `github_pat_`, `xoxb-`, `xoxp-`, `AKIA` (then 12+ alnum), `Bearer ` (then
     16+ non-space) → `[REDACTED]`.
   - `key=value` / `key: value` where key matches
     `/(api[_-]?key|token|secret|password|passwd|credential|auth)/i` and value
     is 8+ non-space chars → keep key, value → `[REDACTED]`.
   - High-entropy strings: any run of 24+ chars from `[A-Za-z0-9+/=_-]`
     containing at least one digit AND mixed case → `[REDACTED]`.
     (Apply last; do not redact normal prose, file paths, or URLs without
     credential userinfo. A URL like `https://user:pass@host` → credential part redacted.)
2. `digestSession(record: SessionRecord): string` — compact, deterministic:
   ```
   === session <sessionId> tool=<tool> cwd=<cwd> branch=<branch ?? "-"> start=<startedAt> end=<endedAt>
   U <t> <text first 200 chars, newlines→spaces>
   C <t> <command name>
   T <t> <tool name>: <summary first 100 chars>
   E <t> <summary first 150 chars>
   ```
   One line per event, in original order, all fields passed through `redact()`.
3. `digestSessions(records: SessionRecord[]): string` — concatenation with a
   blank line between sessions, records sorted by startedAt (determinism).

Tests (vitest):
- Redaction property test: build texts embedding each planted secret type
  (e.g. `sk-abc123XYZsecretsecret`, `ghp_aaaaaaaaaaaaaaaaaaaa`,
  `API_KEY=supersecretvalue123`, `password: hunter2hunter2`,
  `AKIAIOSFODNN7EXAMPLE`, a 32-char mixed base64 blob, `https://u:p4ss@x.com`)
  and assert NONE of the secret substrings appear in `redact()` output, while
  surrounding prose survives.
- Negative cases: ordinary prose, `/Users/foo/projects/bar-baz`, plain URLs,
  ISO timestamps, and UUIDs pass through UNCHANGED.
- Size: a synthetic record with 50 events of ~1KB texts digests to ≤10% of
  `JSON.stringify(record).length`.
- Determinism: `digestSessions(shuffled) === digestSessions(sorted)`.
- Format: golden assertion on a small 4-event record (exact expected string).

## Acceptance criteria
1. `npm run typecheck` and `npx vitest run tests/digester.test.ts` exit 0.
2. All planted secrets redacted; all negative cases untouched.
3. Pure functions only — no fs, no env, no Date.now() (timestamps come from input).

## Verification
```bash
npm run typecheck && npx vitest run tests/digester.test.ts
```

## Rules
- Touch ONLY the files listed. Do not modify src/types.ts, package.json, or any
  existing file. Do not create documentation files.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: if this brief is ambiguous, contradictory, or requires touching
  unlisted files — STOP. Write your questions to
  `specs/loopy-v1/tasks/04-digester.questions.md` and end your turn. Do not guess.

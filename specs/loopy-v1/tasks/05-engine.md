# Task 05: Pattern engine — LLM analysis with verification loop

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
The brain of "loopy": a batched LLM pass that reads session digests and emits
loop-opportunity candidates — with hard anti-junk enforcement in code (schema
validation, fabricated-evidence rejection, retry-with-error-injection, token
budget). The LLM is injectable; tests use fakes.

## Files you may touch (exclusive list)
- `src/engine.ts` — create
- `tests/engine.test.ts` — create

## Context

Existing (import from `./types.js`, `./state.js` — NodeNext ESM needs .js):
- Types: `Candidate`, `CandidateType` (6 values: recurring_task, babysitting,
  post_event, retry_storm, hygiene, cross_tool), `Evidence {sessionId, events: number[]}`,
  `LoopyConfig {companion, dailyTokenCap, pollIntervalMin}`.
- State helpers: `loopyHome()`, `readJson<T>(path)`, `writeJsonAtomic(path, v)`,
  `loadConfig()`.

## Implementation requirements

Export from `src/engine.ts`:

```ts
export type LlmRunner = (prompt: string) => Promise<string>;
export class EngineError extends Error {}

export interface EngineInput {
  digests: string;            // concatenated session digests
  knownSessionIds: string[];  // ids present in digests
  installed: string[];        // candidate ids already installed
  dismissed: string[];        // candidate ids the user dismissed
  patternMemory: string;      // rolling memory text from previous runs
  runner: LlmRunner;
}
export interface EngineOutput {
  skipped: boolean;           // true when token budget exhausted
  candidates: Candidate[];    // promoted: confidence>=0.75 AND occurrences>=3
  watchlist: Candidate[];     // valid but below promotion threshold
  memoryUpdates: string[];
  warnings: string[];         // e.g. dropped fabricated-evidence candidates
}
export function runEngine(input: EngineInput): Promise<EngineOutput>;
export function defaultRunner(): LlmRunner; // spawns `claude -p` (prompt via stdin)
```

**The analysis prompt** (a const in engine.ts). Must contain:
- Role: "You analyze a developer's coding-agent session digests to find work
  that should become an automation loop."
- The 6 candidate types with one-line definitions each.
- Quality bar (verbatim intent): only surface opportunities a developer would
  genuinely thank you for. Recurring evidence in >=3 distinct sessions. Each
  candidate needs an impactEstimate ("saves ~X min/week — because ...").
  If estimated savings < 10 min/week, it belongs in the watchlist.
- Hard rules: evidence sessionIds MUST come from the provided known-session-id
  list; never re-propose the provided installed/dismissed ids.
- Exact output schema: a single JSON object
  `{"candidates": [...], "watchlist": [...], "memoryUpdates": ["..."]}` where
  each candidate matches the Candidate type (give the field list in the prompt).
- Inputs appended: pattern memory, installed/dismissed ids, known session ids, digests.

**Verification loop (in code, deterministic):**
1. Call runner. Extract the first balanced `{...}` JSON block from the response.
2. Validate: parses; candidates/watchlist arrays of objects with correct field
   types; type in the 6-value enum; confidence number 0..1; occurrences positive
   int; evidence non-empty; impactEstimate non-empty string.
3. On parse/shape failure: re-call the SAME runner with the original prompt +
   "\n\nYour previous response was invalid: <error>. Respond with ONLY the JSON object."
   Max 3 total attempts, then throw EngineError.
4. Post-validation (these do NOT trigger retry — they filter):
   - Candidate citing any sessionId not in knownSessionIds → drop + warning.
   - Candidate id in installed or dismissed → drop silently.
   - Valid but confidence<0.75 or occurrences<3 → move to watchlist.

**Token budget:** estimate = ceil(prompt.length / 4) + 2000. Spend ledger at
`<loopyHome()>/log/spend.json` shape `{"2026-06-12": 41200}`. If today's spend +
estimate > `loadConfig().dailyTokenCap` → return `{skipped: true, ...empty}`
WITHOUT calling the runner. Otherwise record spend after the (final) call.

**defaultRunner:** `child_process.spawn("claude", ["-p"], ...)` writing the
prompt to stdin, collecting stdout, reject on non-zero exit. Do not unit-test
the real spawn — factor so tests cover everything else via fake runners.

Tests (vitest, fake runners + temp LOOPY_HOME):
1. Happy path: fake returns 2 good candidates, 1 below-threshold, 1 citing a
   fake sessionId, 1 with an installed id → assert: 2 promoted, 1 watchlist,
   1 warning, installed-id absent everywhere.
2. First response garbage, second valid → succeeds; runner called exactly 2×;
   second prompt contains "previous response was invalid".
3. Always-garbage runner → EngineError after exactly 3 calls.
4. dailyTokenCap tiny → skipped:true, runner called 0×.
5. Spend recorded: after a run, spend.json today >= estimate.

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run tests/engine.test.ts` exit 0.
2. Fabricated evidence can never reach EngineOutput.candidates (test 1 proves).
3. Budget exhaustion never calls the LLM (test 4 proves).

## Verification
```bash
npm run typecheck && npx vitest run tests/engine.test.ts
```

## Rules
- Touch ONLY the files listed. Do not modify types.ts/state.ts/package.json.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: if this brief is ambiguous, contradictory, or requires touching
  unlisted files — STOP. Write questions to
  `specs/loopy-v1/tasks/05-engine.questions.md` and end your turn. Do not guess.

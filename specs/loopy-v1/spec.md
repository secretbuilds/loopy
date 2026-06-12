# Build Contract: Loopy v1

Source design: `docs/plans/2026-06-11-loopy-design.md` (the product spec).
This file is the engineering contract the spec-loop converges on.

## Stack (decided, not negotiable per-task)

- TypeScript 5.x, strict, ESM, Node >= 20. Package name `loopy`, bin `loopy`.
- Runtime deps: `commander` only. Dev: `typescript`, `vitest`, `tsx`, `@types/node`.
- No TUI framework — raw ANSI escape codes (window is 44×14).
- All `~/.loopy` access goes through `LOOPY_HOME` env override (testability).
- LLM calls (`claude -p`) behind an injectable runner interface (testability).

## Source layout

```
src/types.ts            # SessionRecord, Candidate, Proposal, BundleManifest, Config
src/state.ts            # LOOPY_HOME paths, atomic JSON IO, proposal/registry stores
src/adapters/claude-code.ts   src/adapters/codex.ts
src/digester.ts         # SessionRecord -> digest (deterministic, redacting)
src/engine.ts           # pattern engine (claude -p runner, schema, retry, thresholds)
src/generator.ts        # maker/checker bundle generation
src/installers/claude-code.ts   src/installers/codex.ts
src/watcher.ts          # poll + marker wake, digest trigger, companion spawn (singleton)
src/companion/          # tui.ts, frames.ts, voice.ts
src/cli.ts  src/index.ts
tests/                  # mirrors src/; tests/fixtures/{claude-code,codex}/
```

## Acceptance criteria

- [ ] AC1 Foundation: `npm install && npm run typecheck && npm test && npm run build` green; strict TS; ESM.
- [ ] AC2 Claude Code adapter: real-format JSONL → SessionRecord; fail-soft per line; skips isMeta/isSidechain/non-message types; golden fixture tests.
- [ ] AC3 Codex adapter: session_meta/response_item format → SessionRecord; fail-soft; golden fixture tests.
- [ ] AC4 Digester: ≥90% byte reduction on fixtures; planted secrets (key-shaped, high-entropy, .env-style) never appear in output (property test); deterministic output.
- [ ] AC5 State layer: atomic writes (tmp+rename); proposal store CRUD; installed/dismissed registries; LOOPY_HOME override honored everywhere.
- [ ] AC6 Engine: schema-validated JSON output with error-injection retry ×3; promotion at confidence ≥0.75 AND occurrences ≥3; dedup vs registries; planted-pattern eval — ≥4/5 planted patterns found, 0 fabricated evidence (every cited session id must exist in input), 0 decoys proposed.
- [ ] AC7 Generator: maker+checker passes; bundle = manifest.json + loop.md (6 required sections: responsibility, trigger, procedure, verification, convergence, escalation) + state/; checker rejects drafts missing verification (rigged-runner test).
- [ ] AC8 Installers: additive-only writes, every path manifest-tracked; sandbox-HOME e2e: install → assert artifacts → uninstall → zero residue. Claude Code: hook/launchd+`claude -p`. Codex: launchd/cron+`codex exec`.
- [ ] AC9 Watcher: marker-file wake + poll fallback; triggers digestion of new transcripts; companion spawn per config with singleton guarantee (two triggers → one spawn; mockable spawner).
- [ ] AC10 Companion TUI: render-to-string frames for every mood (sleepy/perky/attentive/celebrate); ambient + inbox modes; keys r/a/d/s/q; approve calls installer; all user-facing strings in voice.ts; no guilt strings.
- [ ] AC11 CLI: setup/scan/review/companion/list/uninstall/pause/resume/status wired with accurate --help.
- [ ] AC12 Token budget: engine skips run when daily cap reached (test).
- [ ] AC13 E2E: seeded fixtures → scan (canned-runner) → proposal → approve → installed bundle verified → uninstall clean. Single test, sandbox HOME.
- [ ] AC14 Quality gate (no junk): every proposal cites ≥3 real occurrences with session ids; engine prompt requires per-proposal impact estimate (time saved/week); eval suite is CI-blocking.

## User's quality goals (binding)

1. The meta-agent must NOT create junk — AC6/AC14 are the enforcement.
2. Companion must genuinely open on Claude Code AND Codex session start — AC9.
3. Proposed loops must be legitimately impactful — impact estimate + evidence
   thresholds (AC14), warm-encourager framing (§10 of design doc).

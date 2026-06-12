# Ledger: loopy-dash-v1

> Loop state. Source of truth — a fresh session resumes from this file alone.

## Acceptance criteria (mirror of spec.md — convergence when all checked)
- [ ] AC1 event log (task 01)
- [ ] AC2 renderer cols×rows + min-size (task 02)
- [ ] AC3 reducer: focus/confirm/flash/busy (task 02)
- [ ] AC4 confirm gates destructive actions (task 02, verified 03)
- [ ] AC5 CLI: bare loopy → dashboard, review focus, subcommands intact (task 03)
- [ ] AC6 shell: resize, clean exit, tick refresh (task 03)
- [ ] AC7 full suite green + scripted real-state renders (task 04)

## Tasks
| ID | Name | Vendor | Status | Attempts | Cross-review | Claude review |
|----|------|--------|--------|----------|--------------|---------------|
| 01 | event log infra + writer wiring | kiro | planned | 0/2 | — | — |
| 02 | dashboard renderer + reducer (pure) | codex | planned | 0/2 | — | — |
| 03 | shell + CLI wiring (replaces v1 TUI) | kiro | planned | 0/2 | — | — |
| 04 | integration verify + polish | codex | planned | 0/2 | — | — |

## Decisions
- 2026-06-12: Raw ANSI continues (no ink/blessed) — keeps zero-dep constraint,
  pure-function renderer pattern proven in v1, both vendors handled it well.
- 2026-06-12: v1 companion tui.ts renderer/reducer retired by task 03;
  frames.ts + voice.ts survive (compact critter + voice lines reuse them).
- 2026-06-12: Routing — 01 kiro (mechanical multi-file wiring), 02 codex
  (greenfield layout/reducer algorithm), 03 kiro (wiring/refactor), 04 codex.
- 2026-06-12: Waves — W1=[01,02] parallel (01 touches src/events.ts +
  watcher.ts + cli.ts action bodies; 02 touches src/dashboard/* only —
  disjoint). W2=[03] (cli.ts, index.ts, companion/tui.ts removal, shell).
  W3=[04].
- 2026-06-12: Parallelism constraint inherited from loopy-v1: max ONE codex
  task in flight; kiro tasks parallel in separate worktrees.

## Spec drift discovered
(none yet)

## Wave log
- 2026-06-12 ~18:00: spec written from user brainstorm (panels layout, confirm
  prompts, compact critter). Scaffolded; W1 scoping.

## Known context from loopy-v1 dogfooding (why this feature exists)
- Real proposals were accidentally dismissed by single-key `d` with 333ms
  feedback; restored by hand. Confirm modal is non-negotiable (AC4).
- No activity log exists; users cannot see what the daemon did. events.jsonl
  is the fix (AC1).

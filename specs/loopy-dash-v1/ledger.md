# Ledger: loopy-dash-v1

> Loop state. Source of truth — a fresh session resumes from this file alone.

## Acceptance criteria (mirror of spec.md — convergence when all checked)
- [x] AC1 event log (task 01)
- [x] AC2 renderer cols×rows + min-size (task 02)
- [x] AC3 reducer: focus/confirm/flash/busy (task 02)
- [x] AC4 confirm gates destructive actions (task 02, verified 03)
- [x] AC5 CLI: bare loopy → dashboard, review focus, subcommands intact (task 03)
- [x] AC6 shell: resize, clean exit, tick refresh (task 03)
- [ ] AC7 full suite green + scripted real-state renders (task 04)

## Tasks
| ID | Name | Vendor | Status | Attempts | Cross-review | Claude review |
|----|------|--------|--------|----------|--------------|---------------|
| 01 | event log infra + writer wiring | kiro | accepted (merged) | 1/2 | NO_DEFECTS (Claude — codex review stalled) | accept; wiring verbatim, 96 tests |
| 02 | dashboard renderer + reducer (pure) | codex | accepted (merged) | 1/2 | NO_DEFECTS (kiro) | accept; pure, geometry exact, 13 tests |
| 03 | shell + CLI wiring (replaces v1 TUI) | claude-subagent | accepted (merged) | 1/2 | 1 HIGH → fixed | accept after fix; 94 tests, build + --help green, v1 TUI removed |
| 04 | integration verify + polish | claude-subagent | planned | 0/2 | — | — |

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
- 2026-06-12 ~22:30: VENDOR SWITCH — codex rate-limited, user said keep it in
  Claude. Tasks 03-04 run on Claude subagents (Agent tool, worktree isolation):
  maker subagent implements, fresh adversarial subagent cross-reviews, Claude
  orchestrator gates + final-reviews + merges. Same maker/checker discipline,
  no external CLIs.

## Spec drift discovered
(none yet)

## Wave log
- 2026-06-12 ~18:00: spec written from user brainstorm (panels layout, confirm
  prompts, compact critter). Scaffolded; W1 scoping.
- 2026-06-12 ~22:00: W1 done. Both tasks one-shot, gate green first try (01: 96
  tests; 02: 13 tests). Kiro cross-review of 02 NO_DEFECTS. Codex cross-review
  of 01 STALLED 1h15m (zero output growth — the documented silent-stall mode);
  killed, Claude did the cross-review directly (review, not impl). Both merged;
  combined suite 109 tests green. W2 = task 03 (shell + CLI wiring) next.
  LESSON RE-CONFIRMED: codex read-only review runs need the output-growth
  watchdog from day one, not just impl runs.

## Known context from loopy-v1 dogfooding (why this feature exists)
- Real proposals were accidentally dismissed by single-key `d` with 333ms
  feedback; restored by hand. Confirm modal is non-negotiable (AC4).
- No activity log exists; users cannot see what the daemon did. events.jsonl
  is the fix (AC1).

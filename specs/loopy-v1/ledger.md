# Ledger: loopy-v1

> Loop state. Source of truth — a fresh session resumes from this file alone.

## Acceptance criteria (mirror of spec.md — convergence when all checked)
- [ ] AC1 foundation (task 01)
- [ ] AC2 claude-code adapter (task 02)
- [ ] AC3 codex adapter (task 03)
- [ ] AC4 digester (task 04)
- [ ] AC5 state layer (task 01)
- [ ] AC6 engine + eval (task 05)
- [ ] AC7 generator (task 06)
- [ ] AC8 installers (task 07)
- [ ] AC9 watcher + spawn (task 08)
- [ ] AC10 companion TUI (task 09)
- [ ] AC11 CLI wiring (task 10)
- [ ] AC12 token cap (task 05)
- [ ] AC13 e2e (task 11)
- [ ] AC14 quality gate (tasks 05, 11)

## Tasks
| ID | Name | Vendor | Status | Attempts | Cross-review | Claude review |
|----|------|--------|--------|----------|--------------|---------------|
| 01 | scaffold + types + state | codex | accepted | 1/2 | NO_DEFECTS | accept |
| 02 | claude-code adapter | kiro | accepted (merged 0d9e84f) | 1/2 | NO_DEFECTS (codex) | accept; low-sev note: empty user texts still emit events — polish in 11 |
| 03 | codex adapter | codex | accepted (merged 0d9e84f) | 1/2 | NO_DEFECTS (kiro) | accept |
| 04 | digester + redaction | kiro | delegated (wt-04) | 1/2 | — | — |
| 05 | engine + eval harness | codex | delegated (wt-05) | 1/2 | — | — |
| 06 | generator | kiro | delegated (wt-06) | 1/2 | — | — |
| 07 | installers | kiro | planned | 0/2 | — | — |
| 08 | watcher + spawn | codex | planned | 0/2 | — | — |
| 09 | companion TUI + voice | kiro | planned | 0/2 | — | — |
| 10 | CLI wiring | kiro | planned | 0/2 | — | — |
| 11 | e2e + polish | codex | planned | 0/2 | — | — |

## Decisions
- 2026-06-12: Stack = TS strict ESM, Node>=20, deps commander+vitest+tsx only; raw ANSI TUI. Why: both vendors strongest in TS; minimal deps = less review surface.
- 2026-06-12: Vendor routing — each vendor parses its own tool's transcript format (kiro→claude-code adapter, codex→codex adapter): native format knowledge.
- 2026-06-12: Wave plan W1=[01]→[02,03,04] W2=[05,06,07] W3=[08,09]→[10] W4=[11]. Task 01 lands on main first; subsequent parallel tasks in worktrees branched from main, merged per-task after gate+review.
- 2026-06-12: Real transcript formats documented in briefs by Claude (scope work); implementers get synthetic fixtures, never read ~/.claude or ~/.codex.
- 2026-06-12: Parallelism constraint — max ONE codex task in flight (resume --last is global); kiro tasks may run parallel in separate worktrees (--resume is directory-scoped). Task 04 rerouted codex→kiro.

## Spec drift discovered
- (none yet)

## Wave log
- Wave 1 (2026-06-12): started — task 01 delegated to codex.
- 2026-06-12 ~11:35: task 01 first run STALLED (machine slept overnight; 11.5h wall, 15s CPU, zero output). Infra failure, not counted against the 2-attempt code budget. Killed + relaunched with run log to specs/loopy-v1/tasks/01-run.log. Lesson for commands.md: long codex runs need an output-growth watchdog.
- 2026-06-12 ~11:40: task 01 rerun wrote all files but codex sandbox BLOCKS NETWORK → its npm install hung. Resolution: orchestrator runs npm install + gate outside the sandbox (mechanical infra, not implementation). Standing practice: worktrees get `npm ci` before delegation; briefs' npm-install step is orchestrator's job.
- 2026-06-12 ~11:45: task 01 gate green (typecheck/6 tests/build), kiro cross-review NO_DEFECTS, Claude review accept → merged to main (29fa3fb). Wave 1 parallel fired: 02+04 kiro, 03 codex, worktrees loopy-wt-{02,03,04}, 6-min stall watchdog armed.

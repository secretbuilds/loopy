# Ledger: loopy-v1

> Loop state. Source of truth — a fresh session resumes from this file alone.

## Acceptance criteria (mirror of spec.md — convergence when all checked)
- [x] AC1 foundation (task 01)
- [x] AC2 claude-code adapter (task 02)
- [x] AC3 codex adapter (task 03)
- [x] AC4 digester (task 04)
- [x] AC5 state layer (task 01)
- [x] AC6 engine + eval (task 05)
- [x] AC7 generator (task 06)
- [x] AC8 installers (task 07)
- [x] AC9 watcher + spawn (task 08)
- [x] AC10 companion TUI (task 09)
- [x] AC11 CLI wiring (task 10)
- [x] AC12 token cap (task 05)
- [x] AC13 e2e (task 11)
- [x] AC14 quality gate (tasks 05, 11)

**CONVERGED 2026-06-12 — all acceptance criteria met. Loop DONE.**

## Tasks
| ID | Name | Vendor | Status | Attempts | Cross-review | Claude review |
|----|------|--------|--------|----------|--------------|---------------|
| 01 | scaffold + types + state | codex | accepted | 1/2 | NO_DEFECTS | accept |
| 02 | claude-code adapter | kiro | accepted (merged 0d9e84f) | 1/2 | NO_DEFECTS (codex) | accept; low-sev note: empty user texts still emit events — polish in 11 |
| 03 | codex adapter | codex | accepted (merged 0d9e84f) | 1/2 | NO_DEFECTS (kiro) | accept |
| 04 | digester + redaction | kiro | accepted (merged db15dfd) | 1/2 | 2 HIGH found → fixed | accept after fix + independent spot-checks |
| 05 | engine + eval harness | codex | accepted (merged 723a22e) | 1/2 | NO_DEFECTS + budget gap | accept after PULL-BACK (codex fix cycle failed; Claude moved spend reservation before first call) |
| 06 | generator | kiro | accepted (merged 441df62) | 1/2 | 1 MED → fixed | accept after fix |
| 07 | installers | kiro | accepted (merged 94bec15) | 1/2 | 1 HIGH + 3 MED → all fixed | accept after fix; 16 tests incl. byte-clean uninstall + shared-entry precision |
| 08 | watcher + spawn | codex | accepted (merged a062838) | 1/2 | NO_DEFECTS | accept; singleton logic verified |
| 09 | companion TUI + voice | kiro | accepted (merged) | 1/2 | 1 HIGH + 1 MED → fixed | accept after fix; verbatim art/voice verified, purity verified, 23 tests |
| 10 | CLI wiring | kiro | accepted (merged) | 1/2 | 2 MED → fixed | accept after fix; gate incl. build + --help (11 cmds), 90 tests on main |
| 11 | e2e + polish | codex | accepted (merged) | 1/2 | 1 LOW → fixed | accept after fix (decoy scoped to candidates; README brand frame); 91 tests on main |

## Decisions
- 2026-06-12: Stack = TS strict ESM, Node>=20, deps commander+vitest+tsx only; raw ANSI TUI. Why: both vendors strongest in TS; minimal deps = less review surface.
- 2026-06-12: Vendor routing — each vendor parses its own tool's transcript format (kiro→claude-code adapter, codex→codex adapter): native format knowledge.
- 2026-06-12: Wave plan W1=[01]→[02,03,04] W2=[05,06,07] W3=[08,09]→[10] W4=[11]. Task 01 lands on main first; subsequent parallel tasks in worktrees branched from main, merged per-task after gate+review.
- 2026-06-12: Real transcript formats documented in briefs by Claude (scope work); implementers get synthetic fixtures, never read ~/.claude or ~/.codex.
- 2026-06-12: Parallelism constraint — max ONE codex task in flight (resume --last is global); kiro tasks may run parallel in separate worktrees (--resume is directory-scoped). Task 04 rerouted codex→kiro.

## Spec drift discovered
- 2026-06-12 (task 09): brief specified critter-left + right-column text layout for ambient mode; implementation stacks vertically (critter, then text lines full-width). Verdict: drift ACCEPTED as improvement — at 44 chars wide the vertical stack is more readable. Brief not retro-edited; design doc §10 unaffected (it never specified internal layout).

## Wave log
- Wave 1 (2026-06-12): started — task 01 delegated to codex.
- 2026-06-12 ~11:35: task 01 first run STALLED (machine slept overnight; 11.5h wall, 15s CPU, zero output). Infra failure, not counted against the 2-attempt code budget. Killed + relaunched with run log to specs/loopy-v1/tasks/01-run.log. Lesson for commands.md: long codex runs need an output-growth watchdog.
- 2026-06-12 ~11:40: task 01 rerun wrote all files but codex sandbox BLOCKS NETWORK → its npm install hung. Resolution: orchestrator runs npm install + gate outside the sandbox (mechanical infra, not implementation). Standing practice: worktrees get `npm ci` before delegation; briefs' npm-install step is orchestrator's job.
- 2026-06-12 ~11:45: task 01 gate green (typecheck/6 tests/build), kiro cross-review NO_DEFECTS, Claude review accept → merged to main (29fa3fb). Wave 1 parallel fired: 02+04 kiro, 03 codex, worktrees loopy-wt-{02,03,04}, 6-min stall watchdog armed.
- 2026-06-12 ~16:20: session resumed after interruption. Task 09: kiro fix cycle (codex cross-review: HIGH d/s no index advance, MED required tick field) had completed pre-interruption; re-gate green (typecheck + 23 tests; full suite 57 in wt, 80 on main post-merge), Claude review accept → merged to main. Wave 3 closes; task 10 (CLI wiring, kiro) unblocked.
- 2026-06-12 ~16:35: task 10 — kiro one-shot (2m44s), gate green first try (8 CLI tests, build, --help). Codex cross-review 2 MED (snoozed proposals never return to inbox; --companion persists arbitrary strings) → kiro fix cycle → re-gate green (90 tests), Claude review accept → merged to main. Wave 4 (task 11, codex) is last.
- 2026-06-12 ~16:45: task 11 brief repaired pre-delegation (Claude SCOPE): AC3 claimed `npm run typecheck` covers scripts/ but tsconfig include=["src"]; skip guard made mechanically gateable via LOOPY_CLAUDE_BIN pre-check (defaultRunner hardcodes `claude`).
- 2026-06-12 ~16:51: task 11 — codex one-shot, gate green first try (typecheck, e2e, forced-skip live-eval exit 0). Kiro cross-review 1 LOW (decoy check included watchlist → spurious exit 1 risk) + Claude review finding (README used generic ASCII instead of brand frame from frames.ts) → single codex fix cycle → re-gate green (91 tests), accept → merged to main. **All 14 ACs met — loop converged.**

## Known issues carried past v1
- task 02 low-sev note (deferred from Claude review): empty user texts in claude-code transcripts still emit events. Brief for task 11 did not include this polish (task 11 forbids touching src/); fix in a future wave if it matters in practice.

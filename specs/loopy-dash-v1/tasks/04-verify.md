# Task 04: Dashboard integration test + real-state smoke script + README

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. TypeScript strict ESM (NodeNext); local imports
use the `.js` suffix; 2-space indent, double quotes, semicolons — match
existing src style.

## Objective
Prove the dashboard works as one system end-to-end (assemble → reduce key
sequence → dispatch effect → re-render, against a real seeded LOOPY_HOME), give
a manual smoke script that renders the user's REAL ~/.loopy state once, and
update the README to document the dashboard.

## Files you may touch (exclusive list)
- `tests/dashboard-integration.test.ts` — create
- `scripts/dash-smoke.ts` — create
- `README.md` — modify (dashboard section + command docs only)

Do NOT modify any src/ file. If an integration assertion fails because of a
real bug in src/, STOP and escalate (write the questions file) — do not patch
src/ from this task.

## Context — modules (import with .js suffix from ../src or ../../src as path requires)

- `../src/dashboard/state.js`: `reduce(s, a)` → `{state, effect?}`;
  types `DashboardState`, `DashboardData`, `Focus`, `Effect`.
  Initial state shape:
  `{ data, focus, inboxIndex:0, loopsIndex:0, activityScroll:0, moodFrame:0, spinnerFrame:0 }`.
  Key actions: `{kind:"key", key}` with keys "tab","up","down","a","d","z","x","s","p","q","y","n","esc".
  `a`/`d` (inbox) and `x` (loops) set `state.confirm`; `y` confirms → returns the
  matching Effect; `z` returns snooze Effect immediately; `s` returns scan Effect.
- `../src/dashboard/render.js`: `renderDashboard(state, cols, rows): string`
  (exact cols×rows), `MIN_COLS`, `MIN_ROWS`.
- `../src/dashboard/shell.js`: `assembleData(deps): Promise<DashboardData>`,
  `dispatchEffect(deps, effect): Promise<string>`.
- `../src/cli.js`: `CliDeps`, `realDeps()`. Build a fake CliDeps in tests the
  same way `tests/cli.test.ts` and `tests/dashboard-shell.test.ts` do (read
  them: temp LOOPY_HOME via mkdtemp, temp homedir, fixed now(), exec recorder,
  out collector, a runner you control).
- `../src/state.js`: `saveProposal(p)`, `getProposal(id)`, `loopyHome()`,
  `writeJsonAtomic(path, val)`, `addToRegistry(name, id)`.
- `../src/events.js`: `appendEvent(kind, msg, t)`.

## tests/dashboard-integration.test.ts (vitest, temp LOOPY_HOME + temp homedir)

One describe, fake deps. Seed a realistic state, then drive the real
reduce→dispatch→assemble→render pipeline (NOT the stdin shell):

1. Seed: 2 pending proposals (distinct ids/summaries/impactEstimate), 1
   installed loop (bundle dir with manifest.json {loopId,tool} + trigger.json
   {kind} + add id to installed.json), spend.json {today:1234}, and 3 appended
   events. `assembleData(deps)` → build initial DashboardState.
2. Render at 120×40 and 60×16: assert (a) exact geometry (line count === rows,
   every line length === cols), (b) the selected proposal's id and its
   `impact:` text appear in the 120×40 render, (c) the installed loop's id
   appears, (d) at least one seeded event's HH:MM appears.
3. Confirm→dismiss cycle: from inbox focus, `reduce(key "d")` sets confirm and
   returns NO effect; render shows the confirm prompt + `[y]es [n]o` footer;
   `reduce(key "y")` clears confirm and returns `{type:"dismiss", id}`;
   `await dispatchEffect(deps, effect)` → returns the dismiss flash and
   `getProposal(id).status === "dismissed"`; re-`assembleData` → that proposal
   is gone from the inbox (length drops by 1).
4. Confirm→cancel: `d` then `n` → confirm cleared, flash "cancelled", proposal
   still pending.
5. Scan cycle: `reduce(key "s")` returns `{type:"scan"}`; `dispatchEffect` with
   a fake runner returning one NEW candidate JSON (reuse the engineResponse
   shape from tests/cli.test.ts) → returns a non-empty flash and a new proposal
   file exists; re-assemble shows the new proposal in the inbox.
6. tab focus + render: `reduce(key "tab")` → focus "loops"; render shows
   `[loops]` bracketed (focused) and `inbox` unbracketed.

## scripts/dash-smoke.ts  (manual: `npx tsx scripts/dash-smoke.ts [cols] [rows]`)

- Read `cols`/`rows` from argv (defaults 100/30; parseInt, fall back on NaN).
- Build `realDeps()`, `const data = await assembleData(deps)`, build an initial
  DashboardState with focus "inbox", and `process.stdout.write(renderDashboard(state, cols, rows) + "\n")`.
- READ-ONLY: it must not mutate any loopy state (assembleData is read-only;
  do not dispatch effects). Exit 0 always (even with empty/absent ~/.loopy —
  assembleData tolerates that).
- Must run under tsx and would pass `tsc --noEmit` if scripts/ were in the
  tsconfig include (it is NOT — include is ["src"] — so write it clean).

## README.md changes (only the dashboard/command parts)
- Update the "Commands" table: `loopy` (no args) and `loopy review` /
  `loopy companion` now open the full-terminal dashboard.
- Replace/extend the old "Loopy" companion section with a "Dashboard" section
  describing: panels (inbox, installed loops, activity log), header status
  (sessions · daemon · spend), `tab` to switch panels, `↑/↓` to move,
  `a`/`d`/`z` approve/dismiss/snooze (with `[y]es/[n]o` confirm on approve and
  dismiss), `s` scan, `p` pause/resume daemon, `q` quit. Mention it resizes
  with the terminal and shows a "bigger window" hint below 60×16.
- Keep it concise; do not invent features not in this spec.

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run` (full suite) exit 0.
2. `npx tsx scripts/dash-smoke.ts 80 24` prints exactly 24 lines, each 80
   chars, and exits 0 (against whatever ~/.loopy exists, including absent).
3. README documents bare `loopy` → dashboard and the keybindings.

## Verification
```bash
npm run typecheck && npx vitest run && npx tsx scripts/dash-smoke.ts 80 24 | awk '{ if (length($0)!=80) bad=1 } END { print NR" lines"; exit bad?1:0 }'
```

## Rules
- Touch ONLY the listed files. Do not modify src/.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: ambiguity/contradiction/real src bug → STOP, write
  `specs/loopy-dash-v1/tasks/04-verify.questions.md`, end turn. Do not guess.

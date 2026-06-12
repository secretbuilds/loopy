# Spec: loopy-dash-v1 — full-terminal mission-control dashboard

## Problem (from live dogfooding, 2026-06-12)
v1's 44×14 companion box failed first contact: fixed tiny size regardless of
terminal, no visibility into what the daemon is doing (no activity log exists
at all), single-key `d` permanently dismissed two real proposals with feedback
that flashes for ~333ms (cleared by the next animation tick), and bare `loopy`
prints commander help instead of an interface.

## Goal
`loopy` with no arguments opens a full-terminal dashboard where the user can
see and control everything: pending proposals (with full detail), installed
loops, live activity log, daemon state, token spend — with confirm prompts on
destructive actions and feedback that persists until the next action.

## User decisions (2026-06-12 brainstorm)
- Layout: panels dashboard — header + inbox panel + loops panel + activity
  panel + footer keybar, all visible at once, resizes with the terminal.
- Safety: confirm prompt (`[y]es/[n]o`) before dismiss, approve, and uninstall.
  Snooze needs no confirm (recoverable by design).
- Critter: compact corner buddy in the header; moods still animate.

## Design

### Event log (new infrastructure — nothing exists today)
- Append-only JSONL at `<loopyHome()>/log/events.jsonl`.
  Line shape: `{"t":"<iso>","kind":"<kind>","msg":"<human line>"}` where kind ∈
  digest | scan | propose | approve | dismiss | snooze | install | uninstall |
  pause | resume | spawn | error.
- Writers: watcher tick (digested sessions, companion spawned), scanAction
  (engine ran / skipped / N promoted), approve/dismiss/snooze actions,
  uninstallAction, pause/resumeAction.
- Rotation: on append, if file > 512 KB keep only the most recent 1000 lines.
- Reader: `readEvents(limit)` returns the last N parsed events, newest last;
  tolerates a corrupt/partial line by skipping it (logged to nothing — it's a
  log).

### Dashboard layout (raw ANSI, no new deps, pure-function renderer)
- `renderDashboard(state, cols, rows): string` — every line exactly `cols`
  wide, exactly `rows` lines. Re-render whole screen each frame (v1 pattern).
- Regions, top to bottom:
  - Header (3 rows): compact critter (single-row face derived from mood, e.g.
    `(◕ ◕)` / `(− −)ᶻ` / `(✧ ✧)` / celebrate variant) + status line
    (`watching N sessions · daemon ✓/✗/paused · spend X/Y` ) + nudge/flash line.
  - Body (remaining rows minus footer): two columns — left = inbox panel
    (proposal list + detail of selected: full summary wrapped, type,
    confidence, impact, evidence), right = installed loops panel (id, kind,
    tool, last-event time). Column split ~55/45.
  - Activity panel (6 rows incl. its border): last events from events.jsonl,
    newest at bottom, each `HH:MM <msg>` truncated to fit.
  - Footer (1 row): context-sensitive keybar (changes with focus + modal).
- Focus model: `tab` cycles inbox → loops → activity. Focused panel title is
  highlighted (inverse video). ↑/↓ (and j/k) move selection in the focused
  panel; activity panel scrolls.
- Modal confirm: pressing a/d (inbox) or x (loops) sets
  `state.confirm = {action, targetId}`; renderer shows a 1-line prompt in the
  flash row (`dismiss "<id>" forever? [y]es [n]o`); y executes, n cancels;
  every other key is ignored while confirm is set.
- Flash/status messages persist until the NEXT user action (never cleared by
  tick). Tick only advances the critter mood frame and refreshes data.
- Resize: listen to stdout `resize` (SIGWINCH); re-render at new size.
- Minimum size: below 60×16 render a centered "loopy needs a bigger window
  (60×16+)" card instead of panels.
- Scan from dashboard: `s` triggers scanAction in the background; state gains
  `busy: "scanning…"` shown in the flash row with a spinner frame on tick;
  completion appends an event, refreshes proposals, sets flash to the result.
  A second `s` while busy is ignored.
- Pause/resume daemon: `p` toggles via existing pause/resume actions, confirm
  NOT required (recoverable), result shown in flash + event log.

### CLI changes
- Bare `loopy` (no subcommand) → opens the dashboard. `--help`/`-h` still
  prints commander help.
- `loopy review` → dashboard with inbox focused. `loopy companion` → dashboard
  (same thing; the v1 44×14 mini TUI is retired — its renderer/reducer files
  are replaced by the dashboard; voice.ts and frames.ts survive, the compact
  critter derives from FRAMES moods).
- Watcher's auto-spawned window (already runs `loopy companion`) therefore
  gets the dashboard with zero watcher changes.

## Acceptance criteria
- AC1 event log: all listed writers append events; rotation works; readEvents
  tolerates corruption. Unit-tested.
- AC2 renderer: pure; every render is exactly cols×rows at multiple sizes
  (property test 60×16, 80×24, 120×40); min-size card below 60×16.
- AC3 reducer: focus cycling, selection movement, confirm modal (y executes /
  n cancels / other keys ignored), flash persistence across ticks, busy-scan
  state machine. Unit-tested, pure.
- AC4 confirm prompts gate approve, dismiss, uninstall. Dismiss without
  confirm is impossible.
- AC5 CLI: bare `loopy` opens dashboard; review focuses inbox; --help intact;
  all v1 subcommands still work.
- AC6 shell: resize re-renders; ctrl-c and q exit cleanly restoring the
  terminal; tick refreshes proposals/loops/events from disk.
- AC7 e2e-ish: full suite green; manual smoke = dashboard renders real
  ~/.loopy state correctly at 2 different terminal sizes (orchestrator
  verifies with scripted renders, not interactive).

## Out of scope
- Mouse support, themes, color beyond inverse-video focus + dim, Windows.
- Nightly scheduled scan (separate future feature).
- Streaming logs from delegated runs (that's the stall-watchdog proposal).

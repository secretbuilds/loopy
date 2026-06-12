# Task 02: Dashboard renderer + reducer — pure functions only

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
The heart of loopy's new full-terminal dashboard: a pure renderer
(`renderDashboard(state, cols, rows)` → exact cols×rows string) and a pure
reducer with a focus model, confirm-modal for destructive actions, persistent
flash messages, and a busy-scan state machine. NO process/stdin/stdout/fs
access anywhere in this task — a later task builds the interactive shell.

## Files you may touch (exclusive list)
- `src/dashboard/state.ts` — create (types + reducer)
- `src/dashboard/render.ts` — create (pure renderer)
- `tests/dashboard.test.ts` — create

## Context — existing modules (import with .js suffix, NodeNext ESM)
- `../types.js`: `Proposal` =
  `{ candidate: Candidate, status: "pending"|"approved"|"dismissed"|"snoozed", createdAt: string, snoozedUntil?: string, bundleDir?: string }`;
  `Candidate` = `{ id: string, type: string, summary: string, evidence: {sessionId: string, events: number[]}[], occurrences: number, confidence: number, suggestedTool: "claude-code"|"codex", impactEstimate: string }`.
- Do NOT import from src/events.ts or src/companion/* — they may not exist in
  your snapshot. The event row type is defined structurally below.

## src/dashboard/state.ts — exact public surface

```ts
import type { Proposal } from "../types.js";

export type Mood = "sleepy" | "idle" | "perky" | "attentive" | "celebrate";
export type Focus = "inbox" | "loops" | "activity";

export interface EventRow { t: string; kind: string; msg: string; }
export interface LoopRow { id: string; kind: string; tool: string; }

export interface DashboardData {
  sessions: number;
  daemon: "running" | "paused" | "not-installed";
  spendToday: number;
  spendCap: number;
  proposals: Proposal[];   // pending only — provided by the shell
  loops: LoopRow[];
  events: EventRow[];      // oldest-first (newest last)
}

export interface DashboardState {
  data: DashboardData;
  focus: Focus;
  inboxIndex: number;
  loopsIndex: number;
  activityScroll: number;  // 0 = pinned to newest; +1 per line scrolled back
  moodFrame: number;       // advances on tick, drives critter blink
  spinnerFrame: number;    // advances on tick while busy
  flash?: string;          // persists until the NEXT key action (never cleared by tick)
  confirm?: { action: "approve" | "dismiss" | "uninstall"; targetId: string };
  busy?: string;           // e.g. "scanning" — set/cleared via actions below
  quit?: boolean;
}

export type DashboardAction =
  | { kind: "key"; key: string }     // normalized: single chars, "up","down","tab","esc","enter"
  | { kind: "tick" }
  | { kind: "data"; data: DashboardData }       // shell refreshed from disk
  | { kind: "busy"; label: string }             // shell started a slow effect
  | { kind: "done"; flash: string };            // slow effect finished

export type Effect =
  | { type: "approve"; id: string }
  | { type: "dismiss"; id: string }
  | { type: "snooze"; id: string }
  | { type: "uninstall"; id: string }
  | { type: "scan" }
  | { type: "toggle-pause" };

export function deriveMood(s: DashboardState): Mood;
// celebrate if flash starts with "🌱"; attentive if confirm is set;
// perky if data.proposals.length > 0; sleepy if data.sessions === 0; else idle.

export function reduce(
  s: DashboardState,
  a: DashboardAction
): { state: DashboardState; effect?: Effect };
```

Reducer rules (PURE — effects are returned, never executed):
- `tick`: moodFrame+1, spinnerFrame+1. NEVER touches flash. Nothing else.
- `data`: replace `data`; clamp inboxIndex/loopsIndex into the new ranges
  (min 0); leave everything else.
- `busy`: set busy=label. `done`: clear busy, set flash to the given string.
- `key` while `confirm` is set: `y` → clear confirm, return the matching
  Effect, set flash `"…working"`-free (flash unchanged; the shell sends
  `done` later); `n` or `esc` → clear confirm, flash "cancelled"; ALL other
  keys ignored (state unchanged).
- `key` while `busy` is set: only `q` (quit) and `tab`/movement keys work;
  action keys (a/d/z/x/s/p) are ignored.
- `key` normal:
  - `q` → quit=true.
  - `tab` → focus cycles inbox → loops → activity → inbox. Clears flash.
  - `up`/`k`, `down`/`j` → move selection in the focused panel (inbox/loops:
    clamp 0..len-1; activity: activityScroll +1 on up / -1 on down, clamped
    0..max(0, events.length - 1)). Clears flash.
  - focus inbox, proposals non-empty: `a` → confirm {action:"approve",
    targetId: selected id}; `d` → confirm {action:"dismiss", ...}; `z` →
    return Effect snooze for selected id immediately (no confirm), flash
    unchanged (shell sends `done`).
  - focus loops, loops non-empty: `x` → confirm {action:"uninstall",
    targetId: selected id}.
  - any focus: `s` → if not busy, return Effect {type:"scan"} (the shell
    will send `busy` then `done`); `p` → Effect {type:"toggle-pause"}.
  - unknown keys → state unchanged.

## src/dashboard/render.ts — exact public surface

```ts
import type { DashboardState } from "./state.js";
export function renderDashboard(s: DashboardState, cols: number, rows: number): string;
export const MIN_COLS = 60;
export const MIN_ROWS = 16;
```

Rendering rules — every line EXACTLY `cols` chars (pad/truncate by string
length, i.e. UTF-16 code units, same convention as the rest of the codebase),
EXACTLY `rows` lines, joined with "\n":

- Below MIN_COLS×MIN_ROWS: bordered box filling the whole area with the
  message `loopy needs a bigger window (60×16+)` centered vertically and
  horizontally; nothing else.
- Otherwise, top to bottom:
  1. Top border: `╭─ loopy ` + `─`… + `╮`.
  2. Header row A: two spaces + critter face + two spaces + status:
     `watching {sessions} sessions · daemon {✓|paused|✗} · spend {spendToday}/{spendCap}`.
     Critter face by mood (VERBATIM):
     idle `(◕ ◕)` / blink frame `(− −)` (alternate when moodFrame % 4 === 3),
     sleepy `(− −)ᶻ`, perky `(✧ ✧)`, attentive `(◕ ◕)?`, celebrate `✧(◕◡◕)✧`.
  3. Header row B: flash line — priority: confirm prompt if set
     (`{action} "{targetId}"? [y]es [n]o`), else busy
     (`{busy}{spinner}` where spinner cycles `.`, `..`, `...` by
     spinnerFrame % 3), else flash if set, else
     `✨ {n} loop idea(s) waiting` when proposals exist, else
     `all quiet — your loops have it covered`.
  4. Panel title row: `├─ inbox ({n}) ` `─`… `┬─ loops ({m}) ` `─`… `┤` —
     left column takes `Math.floor((cols-3)*0.55)` interior chars, right
     column the rest. The FOCUSED panel's title word is wrapped in `[` `]`
     (e.g. `[inbox]`), the unfocused ones plain — this is the focus indicator
     (no ANSI colors anywhere; plain text only).
  5. Body rows (everything between title row and activity title): left =
     inbox list then detail; right = loops list. Vertical divider `│` between
     columns and at both edges.
     - Inbox list: one row per proposal (up to 4): `▶ ` selected / `  `
       unselected + candidate.id truncated. Below the list, a blank row, then
       the SELECTED proposal's detail: summary wrapped to the column width
       (as many rows as fit), then `impact: …`, `evidence: {occurrences} sessions`,
       `confidence: {confidence}` each truncated. Empty inbox → `(no proposals — press s to scan)`.
     - Loops list: one row per loop: `▶ `/`  ` + `{id}  {kind}  {tool}`
       truncated. Empty → `(none installed yet)`.
  6. Activity title row: `├─ [activity] ` `─`… `┤` (same focus-bracket rule),
     then exactly 4 event rows: the last 4 events after applying
     activityScroll (scroll N = shift the window N lines back in time),
     each `{HH:MM} {msg}` (HH:MM = chars 11-16 of the ISO t), oldest at top,
     padded/truncated. Fewer events than 4 → pad with empty rows.
  7. Footer keybar row (inside the box, last row before bottom border),
     context-sensitive:
     confirm set → `[y]es [n]o`;
     busy → `{busy}… [q]uit`;
     focus inbox → `[tab]panel [↑↓]move [a]pprove [d]ismiss [z]snooze [s]can [p]ause [q]uit`;
     focus loops → `[tab]panel [↑↓]move [x]uninstall [s]can [p]ause [q]uit`;
     focus activity → `[tab]panel [↑↓]scroll [s]can [p]ause [q]uit`.
  8. Bottom border `╰` `─`… `╯`.
  Body height flexes with `rows`; activity panel is always 5 rows total
  (title + 4 events); header is always 3 rows (border + A + B); footer +
  bottom border 2 rows. All remaining rows go to the body panels.

## tests/dashboard.test.ts (vitest — pure functions only)

1. Geometry property: for sizes (60,16), (80,24), (120,40) and states
   {empty data, 2 proposals + 3 loops + 6 events, confirm set, busy set}:
   every render has exactly `rows` lines, every line exactly `cols` chars.
2. Min-size: (59,16) and (60,15) render the bigger-window card (still exact
   geometry).
3. deriveMood table: each rule.
4. Reducer: tab cycles all three focuses; flash survives 5 ticks but clears
   on tab; `d` sets confirm and does NOT return an effect; `y` returns the
   dismiss effect with the selected id and clears confirm; `n` cancels with
   flash "cancelled"; keys other than y/n/esc while confirmed are no-ops;
   `z` returns snooze effect immediately; `s` returns scan effect, and while
   busy `s`/`a`/`d` are ignored but `tab` works; `data` action clamps
   inboxIndex; up/down move selection and clamp at both ends.
5. Render content spot-checks (substring assertions, not full goldens):
   selected proposal's impact line appears; confirm prompt appears in header
   row B and footer shows `[y]es [n]o`; focused panel title shows brackets;
   empty inbox shows the scan hint.

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run tests/dashboard.test.ts` exit 0.
2. renderDashboard and reduce are pure: no fs/process/Date.now/Math.random.
3. Critter faces and message strings byte-identical to this brief.

## Verification
```bash
npm run typecheck && npx vitest run tests/dashboard.test.ts
```

## Rules
- Touch ONLY the files listed. Do not modify existing files.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: ambiguity/contradiction/unlisted files needed → STOP, write
  `specs/loopy-dash-v1/tasks/02-dashboard.questions.md`, end turn. Do not guess.

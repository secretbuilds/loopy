# Task 09: Companion TUI — Loopy the noodle-loop critter

You are implementing one atomic task. You have NO context beyond this brief.
Everything you need is below. Do not improvise beyond it.

## Objective
The face of "loopy": a 44×14 terminal TUI hosting an animated ASCII critter and
the proposal review inbox. Pure-function rendering (testable as strings), a key
reducer, and a thin interactive shell. The exact art and voice strings are
supplied below — use them VERBATIM; they are brand assets, not suggestions.

## Files you may touch (exclusive list)
- `src/companion/frames.ts` — create
- `src/companion/voice.ts` — create
- `src/companion/tui.ts` — create
- `tests/companion.test.ts` — create

## Context — existing modules (import with .js suffix, NodeNext ESM)

- `../types.js`: `Proposal`, `Candidate`, `ProposalStatus`.
- `../state.js`: `listProposals()`, `setProposalStatus(id, status)`.

## frames.ts — VERBATIM art (each frame is one string; arrays animate in order)

```ts
export type Mood = "sleepy" | "idle" | "perky" | "attentive" | "celebrate";

export const FRAMES: Record<Mood, string[]> = {
  idle: [
`   ╭──╮
  ╭│◕ ◕│╮
   ╰◡◡╯`,
`   ╭──╮
  ╭│◕ ◕│╮
   ╰◡◡╯ `,
`   ╭──╮
  ╭│− −│╮
   ╰◡◡╯`,
  ],
  sleepy: [
`   ╭──╮
  ╭│− −│╮  z
   ╰‿‿╯`,
`   ╭──╮
  ╭│− −│╮  z Z
   ╰‿‿╯`,
  ],
  perky: [
`   ╭──╮ ✧
  ╭│◕ ◕│╮
   ╰◡◡╯`,
`  ✧╭──╮
  ╭│✧ ✧│╮
   ╰◡◡╯ ✧`,
  ],
  attentive: [
`   ╭──╮
  ╭│◕ ◕│╮
   ╰──╯`,
  ],
  celebrate: [
`  ✧ ╭──╮ ✧
  ╭│✧◡✧│╮
   ╰─◡─╯`,
` ✧  ╭──╮  ✧
  ╰╰│✧◡✧│╯╯
    ╰◡╯`,
  ],
};
```

## voice.ts — VERBATIM strings

```ts
export const VOICE = {
  greeting: (sessions: number) =>
    sessions > 0 ? `hi! watching ${sessions} session${sessions === 1 ? "" : "s"} with you~` : `hi! i'll be right here while you code~`,
  proposalNudge: (n: number) =>
    n === 1 ? `✨ i spotted 1 loop idea for you` : `✨ i spotted ${n} loop ideas for you`,
  noProposals: () => `all quiet — your loops have it covered`,
  installCelebrate: (name: string) =>
    `🌱 "${name}" is yours no more — that's a responsibility you don't carry anymore~`,
  dismissGrace: () => `okay! i won't bring that one up again`,
  snoozed: () => `got it — i'll remind you later~`,
  milestoneFirst: () => `🌱 your very first loop!! so proud of you`,
  milestoneTenth: () => `✨ ten loops! you're really getting the hang of this`,
  reviewing: () => `take your time, i'll walk you through it`,
} as const;

export const TIPS: readonly string[] = [
  "loops with a real verify step survive 10x longer",
  "the best loop is the task you no longer remember doing",
  "a loop without an exit condition is a runaway, not a system",
  "evidence first: a loop should earn its place with receipts",
  "small loops that always work beat big loops that mostly work",
  "external memory beats perfect memory — write state to disk",
  "if you've checked it three times by hand, it wants to be a loop",
  "let the loop do the work; you do the judgment",
] as const;
```

## tui.ts — rendering + reducer + shell

```ts
export interface CompanionState {
  mode: "ambient" | "inbox";
  mood: Mood;                 // derived, see deriveMood
  frame: number;              // animation index
  sessions: number;           // sessions being watched
  proposals: Proposal[];      // pending only
  inboxIndex: number;
  flash?: string;             // one-shot message line (celebrate/grace/snooze)
  tipIndex: number;
  quit?: boolean;
}
export function deriveMood(s: CompanionState): Mood;
// celebrate if flash is a celebrate message (set by reducer for 1 render);
// attentive in inbox mode; perky if proposals.length>0; sleepy if
// sessions===0 && no proposals; else idle.
export function renderFrame(s: CompanionState): string;
// EXACTLY 14 lines, each padded/truncated to 44 chars, box-drawn border with
// title " loopy ". Ambient: critter frame centered-ish left, right column =
// greeting, status line ("· watching N sessions"), proposalNudge/noProposals,
// blank, tip line ("tip: <TIPS[tipIndex]>" wrapped to fit), bottom bar
// "[r]eview  [q]uit" (only show [r] when proposals exist).
// Inbox: critter mini (first idle frame) top-left, then proposal
// inboxIndex+1/total: candidate.summary (wrap 2 lines), "impact: <impactEstimate>",
// "evidence: <occurrences> sessions", flash line if set, bottom bar
// "[a]pprove [d]ismiss [s]nooze [→]next [esc]back".
export type CompanionAction =
  | { kind: "key"; key: string }
  | { kind: "tick" }   // advance animation frame + rotate tip every 10 ticks
  | { kind: "refresh"; proposals: Proposal[]; sessions: number };
export function reduce(s: CompanionState, a: CompanionAction): CompanionState;
// pure. keys: ambient r→inbox (if proposals); q→quit. inbox: a→ flash
// installCelebrate(summary), status side-effect NOT here (see shell), advance
// index; d→ flash dismissGrace; s→ flash snoozed; right-arrow/n→next; esc→ambient.
export interface CompanionShellOpts {
  onApprove: (p: Proposal) => Promise<void>;   // wired by CLI task later
  onDismiss: (p: Proposal) => Promise<void>;
  onSnooze: (p: Proposal) => Promise<void>;
  readState: () => { proposals: Proposal[]; sessions: number };
  fps?: number;  // default 3
  startMode?: "ambient" | "inbox";  // default "ambient"; "inbox" used by `loopy review`
}
export function runCompanion(opts: CompanionShellOpts): Promise<void>;
// raw-mode stdin shell: interval tick renders via process.stdout.write
// (ANSI clear + home each frame), dispatches key/refresh actions, calls the
// matching opts callback when reduce() consumed an a/d/s key in inbox mode,
// resolves on quit. Keep this thin — ALL logic lives in reduce/renderFrame.
```

Tests (vitest — pure functions only, do NOT test runCompanion's stdin loop):
1. renderFrame ambient golden: fixed state (2 proposals, 1 session, tipIndex 0,
   idle frame 0) → assert full exact 14-line string.
2. Every line of every mood/mode render is exactly 44 chars; 14 lines total
   (property test over a few states).
3. deriveMood table: each rule above.
4. reduce: r with no proposals = no-op; r with proposals → inbox; a → flash set
   + index advanced; esc → ambient; q → quit; tick advances frame modulo
   frames length and rotates tip every 10th tick.
5. VOICE functions: plural/singular greeting + nudge.

## Acceptance criteria
1. `npm run typecheck` && `npx vitest run tests/companion.test.ts` exit 0.
2. Art and voice strings byte-identical to this brief.
3. renderFrame/reduce are pure (no fs, no Date.now, no process access).

## Verification
```bash
npm run typecheck && npx vitest run tests/companion.test.ts
```

## Rules
- Touch ONLY the files listed. Do not modify existing files.
- No placeholder/TODO code. Complete the task or escalate.
- ESCALATION: ambiguity/contradiction/unlisted files needed → STOP, write
  `specs/loopy-v1/tasks/09-companion.questions.md`, end turn. Do not guess.

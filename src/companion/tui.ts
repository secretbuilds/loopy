import type { Proposal } from "../types.js";
import { FRAMES, type Mood } from "./frames.js";
import { TIPS, VOICE } from "./voice.js";

// ── Geometry ────────────────────────────────────────────────────────────────
const WIDTH = 44; // every rendered line is exactly this many code units
const HEIGHT = 14; // every render is exactly this many lines
const INNER = WIDTH - 2; // interior width between the box borders

// ── State ─────────────────────────────────────────────────────────────────--
export interface CompanionState {
  mode: "ambient" | "inbox";
  mood: Mood; // derived, see deriveMood
  frame: number; // animation index
  sessions: number; // sessions being watched
  proposals: Proposal[]; // pending only
  inboxIndex: number;
  flash?: string; // one-shot message line (celebrate/grace/snooze)
  tipIndex: number;
  quit?: boolean;
  tick?: number; // internal: monotonic tick counter driving tip rotation
}

export function deriveMood(s: CompanionState): Mood {
  // celebrate if flash is a celebrate message (set by reducer for 1 render)
  if (s.flash !== undefined && s.flash.startsWith("🌱")) {
    return "celebrate";
  }
  if (s.mode === "inbox") {
    return "attentive";
  }
  if (s.proposals.length > 0) {
    return "perky";
  }
  if (s.sessions === 0 && s.proposals.length === 0) {
    return "sleepy";
  }
  return "idle";
}

// ── Rendering helpers ─────────────────────────────────────────────────────--
function clip(s: string): string {
  if (s.length >= INNER) {
    return s.slice(0, INNER);
  }
  return s + " ".repeat(INNER - s.length);
}

function bordered(content: string): string {
  return `│${clip(content)}│`;
}

// Art rows sit flush-left (the ASCII frames carry their own leading spaces).
function artRow(s: string): string {
  return clip(s);
}

// Text rows get one space of left padding so content never touches the border.
function textRow(s: string): string {
  return clip(` ${s}`);
}

// Width available to wrapped text once the one-space left pad is accounted for.
const TEXT_INNER = INNER - 1;

function topBorder(): string {
  const title = "─ loopy ";
  return `╭${title}${"─".repeat(INNER - title.length)}╮`;
}

function bottomBorder(): string {
  return `╰${"─".repeat(INNER)}╯`;
}

function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (current === "") {
      current = word;
    } else if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") {
    lines.push(current);
  }
  return lines;
}

function critterLines(frame: string): [string, string, string] {
  const parts = frame.split("\n");
  return [parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""];
}

function renderAmbient(s: CompanionState): string[] {
  const frames = FRAMES[s.mood];
  const [c0, c1, c2] = critterLines(frames[s.frame % frames.length]);
  const greeting = VOICE.greeting(s.sessions);
  const status = `· watching ${s.sessions} sessions`;
  const proposalLine =
    s.proposals.length > 0 ? VOICE.proposalNudge(s.proposals.length) : VOICE.noProposals();
  const tipLines = wrap(`tip: ${TIPS[s.tipIndex]}`, TEXT_INNER);
  const bar = s.proposals.length > 0 ? "[r]eview  [q]uit" : "[q]uit";

  const head = [
    "",
    artRow(c0),
    artRow(c1),
    artRow(c2),
    "",
    textRow(greeting),
    textRow(status),
    textRow(proposalLine),
    "",
  ];
  const body = [...head, ...tipLines.map(textRow)];
  while (body.length < HEIGHT - 3) {
    body.push("");
  }
  const rows = body.slice(0, HEIGHT - 3);
  rows.push(textRow(bar));
  return rows;
}

function renderInbox(s: CompanionState): string[] {
  const [c0, c1, c2] = critterLines(FRAMES.idle[0]);
  const total = s.proposals.length;

  if (s.inboxIndex < 0 || s.inboxIndex >= total) {
    return [
      "",
      artRow(c0),
      artRow(c1),
      artRow(c2),
      "",
      textRow(VOICE.noProposals()),
      "",
      "",
      "",
      "",
      "",
      textRow("[esc]back"),
    ];
  }

  const proposal = s.proposals[s.inboxIndex];
  const summary = wrap(proposal.candidate.summary, TEXT_INNER);
  const header = `proposal ${s.inboxIndex + 1}/${total}`;
  const impact = `impact: ${proposal.candidate.impactEstimate}`;
  const evidence = `evidence: ${proposal.candidate.occurrences} sessions`;
  const flash = s.flash ?? "";
  const bar = "[a]pprove [d]ismiss [s]nooze [→]next [esc]back";

  return [
    "",
    artRow(c0),
    artRow(c1),
    artRow(c2),
    "",
    textRow(header),
    textRow(summary[0] ?? ""),
    textRow(summary[1] ?? ""),
    textRow(impact),
    textRow(evidence),
    textRow(flash),
    textRow(bar),
  ];
}

export function renderFrame(s: CompanionState): string {
  const content = s.mode === "inbox" ? renderInbox(s) : renderAmbient(s);
  const lines = [topBorder(), ...content.map(bordered), bottomBorder()];
  return lines.join("\n");
}

// ── Reducer ───────────────────────────────────────────────────────────────--
export type CompanionAction =
  | { kind: "key"; key: string }
  | { kind: "tick" } // advance animation frame + rotate tip every 10 ticks
  | { kind: "refresh"; proposals: Proposal[]; sessions: number };

function clampIndex(index: number, length: number): number {
  return Math.min(index, Math.max(0, length - 1));
}

function reduceKey(s: CompanionState, key: string): CompanionState {
  if (s.mode === "ambient") {
    if (key === "r") {
      if (s.proposals.length === 0) {
        return s; // no-op when there's nothing to review
      }
      return { ...s, mode: "inbox", inboxIndex: 0, flash: undefined };
    }
    if (key === "q") {
      return { ...s, quit: true };
    }
    return s;
  }

  // inbox mode
  switch (key) {
    case "a": {
      const inBounds = s.inboxIndex >= 0 && s.inboxIndex < s.proposals.length;
      const flash = inBounds
        ? VOICE.installCelebrate(s.proposals[s.inboxIndex].candidate.summary)
        : undefined;
      return { ...s, flash, inboxIndex: clampIndex(s.inboxIndex + 1, s.proposals.length) };
    }
    case "d":
      return {
        ...s,
        flash: VOICE.dismissGrace(),
        inboxIndex: clampIndex(s.inboxIndex + 1, s.proposals.length),
      };
    case "s":
      return {
        ...s,
        flash: VOICE.snoozed(),
        inboxIndex: clampIndex(s.inboxIndex + 1, s.proposals.length),
      };
    case "n":
    case "right":
      return { ...s, inboxIndex: clampIndex(s.inboxIndex + 1, s.proposals.length), flash: undefined };
    case "esc":
      return { ...s, mode: "ambient", inboxIndex: 0, flash: undefined };
    default:
      return s;
  }
}

export function reduce(s: CompanionState, a: CompanionAction): CompanionState {
  let next: CompanionState = s;
  switch (a.kind) {
    case "tick": {
      const frames = FRAMES[s.mood];
      const tick = (s.tick ?? 0) + 1;
      const frame = (s.frame + 1) % frames.length;
      const tipIndex = tick % 10 === 0 ? (s.tipIndex + 1) % TIPS.length : s.tipIndex;
      next = { ...s, tick, frame, tipIndex, flash: undefined };
      break;
    }
    case "refresh": {
      next = {
        ...s,
        proposals: a.proposals,
        sessions: a.sessions,
        inboxIndex: clampIndex(s.inboxIndex, a.proposals.length),
      };
      break;
    }
    case "key":
      next = reduceKey(s, a.key);
      break;
  }
  return { ...next, mood: deriveMood(next) };
}

// ── Interactive shell ─────────────────────────────────────────────────────--
export interface CompanionShellOpts {
  onApprove: (p: Proposal) => Promise<void>; // wired by CLI task later
  onDismiss: (p: Proposal) => Promise<void>;
  onSnooze: (p: Proposal) => Promise<void>;
  readState: () => { proposals: Proposal[]; sessions: number };
  fps?: number; // default 3
  startMode?: "ambient" | "inbox"; // default "ambient"; "inbox" used by `loopy review`
}

function normalizeKey(data: string): string | undefined {
  if (data === "\x1b[C") {
    return "right";
  }
  if (data === "\x1b") {
    return "esc";
  }
  const c = data.toLowerCase();
  if (["a", "d", "s", "r", "q", "n"].includes(c)) {
    return c;
  }
  return undefined;
}

export function runCompanion(opts: CompanionShellOpts): Promise<void> {
  return new Promise<void>((resolve) => {
    const fps = opts.fps ?? 3;
    const startMode = opts.startMode ?? "ambient";
    const initial = opts.readState();

    let state: CompanionState = {
      mode: startMode,
      mood: "idle",
      frame: 0,
      sessions: initial.sessions,
      proposals: initial.proposals,
      inboxIndex: 0,
      tipIndex: 0,
    };
    state = { ...state, mood: deriveMood(state) };

    const stdin = process.stdin;
    const isTTY = Boolean(stdin.isTTY);
    if (isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    const render = (): void => {
      process.stdout.write(`\x1b[2J\x1b[H${renderFrame(state)}\n`);
    };

    let finished = false;
    const cleanup = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      clearInterval(timer);
      if (isTTY) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve();
    };

    const dispatch = async (key: string): Promise<void> => {
      const before = state;
      state = reduce(state, { kind: "key", key });

      // Wire the matching callback when reduce() consumed an a/d/s key in inbox.
      if (before.mode === "inbox" && (key === "a" || key === "d" || key === "s")) {
      if (before.inboxIndex >= 0 && before.inboxIndex < before.proposals.length) {
        const proposal = before.proposals[before.inboxIndex];
        if (key === "a") {
          await opts.onApprove(proposal);
        } else if (key === "d") {
          await opts.onDismiss(proposal);
        } else {
          await opts.onSnooze(proposal);
        }
      }
        const fresh = opts.readState();
        state = reduce(state, { kind: "refresh", proposals: fresh.proposals, sessions: fresh.sessions });
      }

      render();
      if (state.quit) {
        cleanup();
      }
    };

    const onData = (chunk: Buffer | string): void => {
      const data = chunk.toString();
      if (data === "\x03") {
        cleanup();
        return;
      }
      const key = normalizeKey(data);
      if (key !== undefined) {
        void dispatch(key);
      }
    };

    stdin.on("data", onData);

    const timer = setInterval(() => {
      state = reduce(state, { kind: "tick" });
      render();
    }, Math.max(1, Math.round(1000 / fps)));

    render();
  });
}

export { HEIGHT, WIDTH };

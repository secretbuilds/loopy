import { describe, expect, it } from "vitest";
import type { Candidate, Proposal } from "../src/types.js";
import { FRAMES } from "../src/companion/frames.js";
import { TIPS, VOICE } from "../src/companion/voice.js";
import {
  type CompanionState,
  deriveMood,
  reduce,
  renderFrame,
} from "../src/companion/tui.js";

const INNER = 42;

function makeProposal(id: string, summary = "Run the same verify command after every edit"): Proposal {
  const candidate: Candidate = {
    id,
    type: "recurring_task",
    summary,
    evidence: [{ sessionId: `session-${id}`, events: [0, 1] }],
    occurrences: 4,
    confidence: 0.9,
    suggestedTool: "codex",
    impactEstimate: "saves ~30 min/week",
  };
  return { candidate, status: "pending", createdAt: "2026-06-12T00:00:00.000Z" };
}

function baseState(overrides: Partial<CompanionState> = {}): CompanionState {
  return {
    mode: "ambient",
    mood: "idle",
    frame: 0,
    sessions: 0,
    proposals: [],
    inboxIndex: 0,
    tipIndex: 0,
    ...overrides,
  };
}

describe("renderFrame ambient golden", () => {
  it("renders the exact 14-line ambient frame", () => {
    const state = baseState({
      mode: "ambient",
      mood: "idle",
      frame: 0,
      sessions: 1,
      proposals: [makeProposal("a"), makeProposal("b")],
      tipIndex: 0,
    });

    const pad = (s: string): string =>
      `│${s.length >= INNER ? s.slice(0, INNER) : s + " ".repeat(INNER - s.length)}│`;
    const top = `╭${"─ loopy "}${"─".repeat(INNER - "─ loopy ".length)}╮`;
    const bottom = `╰${"─".repeat(INNER)}╯`;

    const expected = [
      top,
      pad(""),
      pad("   ╭──╮"),
      pad("  ╭│◕ ◕│╮"),
      pad("   ╰◡◡╯"),
      pad(""),
      pad(" hi! watching 1 session with you~"),
      pad(" · watching 1 sessions"),
      pad(" ✨ i spotted 2 loop ideas for you"),
      pad(""),
      pad(" tip: loops with a real verify step"),
      pad(" survive 10x longer"),
      pad(" [r]eview  [q]uit"),
      bottom,
    ].join("\n");

    expect(renderFrame(state)).toBe(expected);
  });
});

describe("renderFrame invariants", () => {
  const states: CompanionState[] = [
    baseState({ mode: "ambient", mood: "idle", sessions: 2, proposals: [makeProposal("a")] }),
    baseState({ mode: "ambient", mood: "sleepy", sessions: 0, proposals: [] }),
    baseState({ mode: "ambient", mood: "perky", sessions: 3, proposals: [makeProposal("a"), makeProposal("b")], tipIndex: 5 }),
    baseState({
      mode: "inbox",
      mood: "attentive",
      proposals: [makeProposal("a", "A very long summary that definitely needs to wrap across multiple lines to fit the panel")],
    }),
    baseState({
      mode: "inbox",
      mood: "celebrate",
      proposals: [makeProposal("a")],
      flash: VOICE.installCelebrate("rerun-verify"),
    }),
    baseState({ mode: "inbox", mood: "attentive", proposals: [] }),
  ];

  for (const [i, state] of states.entries()) {
    it(`render #${i} is 14 lines of exactly 44 chars`, () => {
      const lines = renderFrame(state).split("\n");
      expect(lines).toHaveLength(14);
      for (const line of lines) {
        expect(line.length).toBe(44);
      }
    });
  }
});

describe("deriveMood", () => {
  it("celebrate when flash is a celebrate message", () => {
    expect(deriveMood(baseState({ mode: "inbox", flash: VOICE.installCelebrate("x") }))).toBe("celebrate");
  });
  it("attentive in inbox mode", () => {
    expect(deriveMood(baseState({ mode: "inbox", proposals: [makeProposal("a")] }))).toBe("attentive");
  });
  it("perky when proposals exist in ambient", () => {
    expect(deriveMood(baseState({ mode: "ambient", sessions: 1, proposals: [makeProposal("a")] }))).toBe("perky");
  });
  it("sleepy when no sessions and no proposals", () => {
    expect(deriveMood(baseState({ mode: "ambient", sessions: 0, proposals: [] }))).toBe("sleepy");
  });
  it("idle otherwise", () => {
    expect(deriveMood(baseState({ mode: "ambient", sessions: 2, proposals: [] }))).toBe("idle");
  });
});

describe("reduce", () => {
  it("r with no proposals is a no-op", () => {
    const next = reduce(baseState({ mode: "ambient", proposals: [] }), { kind: "key", key: "r" });
    expect(next.mode).toBe("ambient");
    expect(next.quit).toBeUndefined();
  });

  it("r with proposals enters inbox", () => {
    const next = reduce(
      baseState({ mode: "ambient", proposals: [makeProposal("a")] }),
      { kind: "key", key: "r" },
    );
    expect(next.mode).toBe("inbox");
    expect(next.mood).toBe("attentive");
    expect(next.inboxIndex).toBe(0);
  });

  it("a sets celebrate flash and advances the index", () => {
    const proposals = [makeProposal("a", "first loop"), makeProposal("b", "second loop")];
    const next = reduce(
      baseState({ mode: "inbox", mood: "attentive", proposals, inboxIndex: 0 }),
      { kind: "key", key: "a" },
    );
    expect(next.flash).toBe(VOICE.installCelebrate("first loop"));
    expect(next.inboxIndex).toBe(1);
    expect(next.mood).toBe("celebrate");
  });

  it("d sets the dismiss-grace flash and advances the index", () => {
    const next = reduce(
      baseState({ mode: "inbox", proposals: [makeProposal("a"), makeProposal("b")], inboxIndex: 0 }),
      { kind: "key", key: "d" },
    );
    expect(next.flash).toBe(VOICE.dismissGrace());
    expect(next.inboxIndex).toBe(1);
  });

  it("s sets the snoozed flash and advances the index", () => {
    const next = reduce(
      baseState({ mode: "inbox", proposals: [makeProposal("a"), makeProposal("b")], inboxIndex: 0 }),
      { kind: "key", key: "s" },
    );
    expect(next.flash).toBe(VOICE.snoozed());
    expect(next.inboxIndex).toBe(1);
  });

  it("esc returns to ambient", () => {
    const next = reduce(
      baseState({ mode: "inbox", proposals: [makeProposal("a")] }),
      { kind: "key", key: "esc" },
    );
    expect(next.mode).toBe("ambient");
  });

  it("q quits", () => {
    const next = reduce(baseState({ mode: "ambient" }), { kind: "key", key: "q" });
    expect(next.quit).toBe(true);
  });

  it("tick advances the frame modulo the frame count", () => {
    const len = FRAMES.idle.length;
    const next = reduce(
      baseState({ mode: "ambient", mood: "idle", sessions: 1, frame: len - 1 }),
      { kind: "tick" },
    );
    expect(next.frame).toBe(0);
  });

  it("tick rotates the tip every 10th tick", () => {
    let state = baseState({ mode: "ambient", mood: "idle", sessions: 1, tipIndex: 0 });
    for (let i = 0; i < 9; i++) {
      state = reduce(state, { kind: "tick" });
      expect(state.tipIndex).toBe(0);
    }
    state = reduce(state, { kind: "tick" });
    expect(state.tipIndex).toBe(1 % TIPS.length);
  });
});

describe("VOICE", () => {
  it("greeting handles singular/plural and zero sessions", () => {
    expect(VOICE.greeting(0)).toBe("hi! i'll be right here while you code~");
    expect(VOICE.greeting(1)).toBe("hi! watching 1 session with you~");
    expect(VOICE.greeting(2)).toBe("hi! watching 2 sessions with you~");
  });

  it("proposalNudge handles singular/plural", () => {
    expect(VOICE.proposalNudge(1)).toBe("✨ i spotted 1 loop idea for you");
    expect(VOICE.proposalNudge(3)).toBe("✨ i spotted 3 loop ideas for you");
  });
});

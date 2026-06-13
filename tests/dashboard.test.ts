import { describe, expect, it } from "vitest";
import type { Proposal } from "../src/types.js";
import type { DashboardData, DashboardState } from "../src/dashboard/state.js";
import { deriveMood, reduce } from "../src/dashboard/state.js";
import { renderDashboard } from "../src/dashboard/render.js";

function proposal(id: string, summary = "Run the same verification command before handoff"): Proposal {
  return {
    candidate: {
      id,
      type: "recurring_task",
      summary,
      evidence: [{ sessionId: "session-1", events: [0, 2] }],
      occurrences: 2,
      confidence: 0.82,
      suggestedTool: "codex",
      impactEstimate: "saves ~30 min/week"
    },
    status: "pending",
    createdAt: "2026-06-12T00:00:00.000Z"
  };
}

const emptyData: DashboardData = {
  sessions: 0,
  daemon: "running",
  spendToday: 0,
  spendCap: 100,
  proposals: [],
  loops: [],
  events: []
};

const fullData: DashboardData = {
  sessions: 3,
  daemon: "running",
  spendToday: 7,
  spendCap: 100,
  proposals: [proposal("candidate-1"), proposal("candidate-2", "Summarize repeated logs")],
  loops: [
    { id: "loop-1", kind: "recurring_task", tool: "codex" },
    { id: "loop-2", kind: "hygiene", tool: "claude-code" },
    { id: "loop-3", kind: "retry_storm", tool: "codex" }
  ],
  events: Array.from({ length: 6 }, (_, index) => ({
    t: `2026-06-12T0${index}:00:00.000Z`,
    kind: "event",
    msg: `event ${index}`
  }))
};

function state(overrides: Partial<DashboardState> = {}): DashboardState {
  return {
    data: emptyData,
    focus: "inbox",
    inboxIndex: 0,
    loopsIndex: 0,
    activityScroll: 0,
    moodFrame: 0,
    spinnerFrame: 0,
    ...overrides
  };
}

function expectGeometry(rendered: string, cols: number, rows: number): void {
  const lines = rendered.split("\n");
  expect(lines).toHaveLength(rows);
  for (const line of lines) expect(line.length).toBe(cols);
}

describe("dashboard renderer geometry", () => {
  it("renders exact geometry across states and sizes", () => {
    const states = [
      state(),
      state({ data: fullData }),
      state({ data: fullData, confirm: { action: "dismiss", targetId: "candidate-1" } }),
      state({ data: fullData, busy: "scanning" })
    ];

    for (const [cols, rows] of [[60, 16], [80, 24], [120, 40]] as const) {
      for (const s of states) expectGeometry(renderDashboard(s, cols, rows), cols, rows);
    }
  });

  it("renders the bigger-window card below minimum size", () => {
    for (const [cols, rows] of [[59, 16], [60, 15]] as const) {
      const rendered = renderDashboard(state(), cols, rows);
      expectGeometry(rendered, cols, rows);
      expect(rendered).toContain("loopy needs a bigger window (60×16+)");
    }
  });
});

describe("deriveMood", () => {
  it("follows the mood priority table", () => {
    expect(deriveMood(state({ flash: "🌱 installed" }))).toBe("celebrate");
    expect(deriveMood(state({ data: fullData, confirm: { action: "approve", targetId: "candidate-1" } }))).toBe("attentive");
    expect(deriveMood(state({ data: fullData }))).toBe("perky");
    expect(deriveMood(state({ data: emptyData, flash: undefined }))).toBe("sleepy");
    expect(deriveMood(state({ data: { ...emptyData, sessions: 1 } }))).toBe("idle");
  });
});

describe("dashboard reducer", () => {
  it("cycles focus with tab", () => {
    const first = reduce(state(), { kind: "key", key: "tab" }).state;
    const second = reduce(first, { kind: "key", key: "tab" }).state;
    const third = reduce(second, { kind: "key", key: "tab" }).state;

    expect([first.focus, second.focus, third.focus]).toEqual(["loops", "activity", "inbox"]);
  });

  it("keeps flash through ticks and clears it on tab", () => {
    let current = state({ flash: "hello" });
    for (let i = 0; i < 5; i += 1) current = reduce(current, { kind: "tick" }).state;

    expect(current.flash).toBe("hello");
    expect(reduce(current, { kind: "key", key: "tab" }).state.flash).toBeUndefined();
  });

  it("confirms dismiss without returning the effect until y", () => {
    const pending = reduce(state({ data: fullData }), { kind: "key", key: "d" });

    expect(pending.effect).toBeUndefined();
    expect(pending.state.confirm).toEqual({ action: "dismiss", targetId: "candidate-1" });

    const confirmed = reduce(pending.state, { kind: "key", key: "y" });
    expect(confirmed.effect).toEqual({ type: "dismiss", id: "candidate-1" });
    expect(confirmed.state.confirm).toBeUndefined();
  });

  it("cancels confirmation and ignores unrelated confirmed keys", () => {
    const confirmed = state({ confirm: { action: "dismiss", targetId: "candidate-1" }, flash: "keep" });

    expect(reduce(confirmed, { kind: "key", key: "a" }).state).toBe(confirmed);

    const cancelled = reduce(confirmed, { kind: "key", key: "n" }).state;
    expect(cancelled.confirm).toBeUndefined();
    expect(cancelled.flash).toBe("cancelled");
  });

  it("snoozes immediately", () => {
    expect(reduce(state({ data: fullData }), { kind: "key", key: "z" }).effect).toEqual({
      type: "snooze",
      id: "candidate-1"
    });
  });

  it("starts scans and ignores action keys while busy but still tabs", () => {
    expect(reduce(state(), { kind: "key", key: "s" }).effect).toEqual({ type: "scan" });

    const busy = state({ data: fullData, busy: "scanning" });
    for (const key of ["s", "a", "d"]) {
      const result = reduce(busy, { kind: "key", key });
      expect(result.state).toBe(busy);
      expect(result.effect).toBeUndefined();
    }

    expect(reduce(busy, { kind: "key", key: "tab" }).state.focus).toBe("loops");
  });

  it("clamps inbox index on data refresh", () => {
    const current = state({ data: fullData, inboxIndex: 9, loopsIndex: 9, activityScroll: 5 });
    const next = reduce(current, {
      kind: "data",
      data: {
        ...fullData,
        proposals: [fullData.proposals[0]!],
        loops: [fullData.loops[0]!],
        events: []
      }
    }).state;

    expect(next.inboxIndex).toBe(0);
    expect(next.loopsIndex).toBe(0);
    expect(next.activityScroll).toBe(5);
  });

  it("moves selections up and down with clamping", () => {
    let current = state({ data: fullData });

    current = reduce(current, { kind: "key", key: "up" }).state;
    expect(current.inboxIndex).toBe(0);

    current = reduce(current, { kind: "key", key: "down" }).state;
    current = reduce(current, { kind: "key", key: "down" }).state;
    expect(current.inboxIndex).toBe(1);

    current = reduce({ ...current, focus: "loops" }, { kind: "key", key: "j" }).state;
    expect(current.loopsIndex).toBe(1);

    current = reduce({ ...current, focus: "activity", activityScroll: 0 }, { kind: "key", key: "k" }).state;
    expect(current.activityScroll).toBe(1);
    current = reduce(current, { kind: "key", key: "j" }).state;
    current = reduce(current, { kind: "key", key: "j" }).state;
    expect(current.activityScroll).toBe(0);
  });
});

describe("dashboard render content", () => {
  it("includes selected details, focus brackets, and empty hints", () => {
    const rendered = renderDashboard(state({ data: fullData }), 80, 24);
    expect(rendered).toContain("impact: saves ~30 min/week");
    expect(rendered).toContain("[inbox] (2)");

    expect(renderDashboard(state(), 80, 24)).toContain("(no proposals — press s to scan)");
  });

  it("renders confirm prompt and footer", () => {
    const rendered = renderDashboard(
      state({ data: fullData, confirm: { action: "dismiss", targetId: "candidate-1" } }),
      80,
      24
    );

    expect(rendered).toContain('dismiss "candidate-1"? [y]es [n]o');
    expect(rendered).toContain("[y]es [n]o");
  });
});

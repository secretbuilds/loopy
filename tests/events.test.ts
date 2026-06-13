import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendEvent, readEvents } from "../src/events.js";
import { dismissAction, snoozeAction, type CliDeps } from "../src/cli.js";
import { loopyHome, saveProposal } from "../src/state.js";
import type { Candidate, Proposal } from "../src/types.js";

const NOW = "2026-06-12T12:00:00.000Z";

let home: string;
let userHome: string;
let lines: string[];

function makeDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    runner: async () => "{}",
    exec: async () => ({ code: 0, out: "" }),
    now: () => NOW,
    homedir: () => userHome,
    out: (line) => lines.push(line),
    ...overrides
  };
}

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: "cand-1",
    type: "recurring_task",
    summary: "Run the same verification command after edits",
    evidence: [{ sessionId: "s-1", events: [0] }],
    occurrences: 3,
    confidence: 0.9,
    suggestedTool: "claude-code",
    impactEstimate: "saves ~30 min/week — because manual reruns",
    ...overrides
  };
}

function eventsPath(): string {
  return join(loopyHome(), "log", "events.jsonl");
}

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "loopy-events-"));
  userHome = await mkdtemp(join(tmpdir(), "loopy-events-home-"));
  process.env.LOOPY_HOME = home;
  lines = [];
});

afterEach(async () => {
  delete process.env.LOOPY_HOME;
  await rm(home, { recursive: true, force: true });
  await rm(userHome, { recursive: true, force: true });
});

describe("appendEvent + readEvents", () => {
  it("writes parseable JSONL, returns oldest-first, and respects limit", () => {
    appendEvent("scan", "first", NOW);
    appendEvent("digest", "second", NOW);
    appendEvent("pause", "third", NOW);

    // Raw file is valid JSONL.
    const raw = readFileSync(eventsPath(), "utf8").trim().split("\n");
    expect(raw).toHaveLength(3);
    for (const line of raw) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    const all = readEvents(10);
    expect(all.map((e) => e.msg)).toEqual(["first", "second", "third"]);

    const limited = readEvents(2);
    expect(limited.map((e) => e.msg)).toEqual(["second", "third"]);
  });

  it("returns [] on missing file and skips corrupt lines while keeping neighbors", () => {
    expect(readEvents(10)).toEqual([]);

    appendEvent("scan", "before", NOW);
    appendEvent("scan", "after", NOW);

    // Inject a corrupt line in the middle by rewriting the file.
    const path = eventsPath();
    const good = readFileSync(path, "utf8").trim().split("\n");
    const corrupted = [good[0], "this is not json", good[1]].join("\n") + "\n";
    writeFileSync(path, corrupted, "utf8");

    const events = readEvents(10);
    expect(events.map((e) => e.msg)).toEqual(["before", "after"]);
  });

  it("rotates to exactly 1000 most-recent lines once past 512KB", () => {
    // ~500-char messages keep each JSON line ~560 bytes, so the 512KB
    // threshold is crossed close to the 1000-line mark — enough lines to
    // force a real truncation while keeping the test's IO small.
    const longMsg = "x".repeat(500);
    const total = 1100;
    for (let i = 0; i < total; i++) {
      appendEvent("scan", `${longMsg} ${i}`, NOW);
    }

    const path = eventsPath();
    const fileLines = readFileSync(path, "utf8").trim().split("\n");
    expect(fileLines).toHaveLength(1000);

    const events = readEvents(1000);
    expect(events).toHaveLength(1000);
    // The kept lines are the most recent ones (last index total-1).
    expect(events[events.length - 1].msg.endsWith(`${total - 1}`)).toBe(true);
    expect(events[0].msg.endsWith(`${total - 1000}`)).toBe(true);
  });

  it("flattens embedded newlines in msg to spaces", () => {
    appendEvent("error", "line one\nline two\r\nline three", NOW);
    const [event] = readEvents(1);
    expect(event.msg).toBe("line one line two line three");
    expect(event.msg).not.toContain("\n");
  });
});

describe("wiring smoke", () => {
  function seed(id: string): Proposal {
    const proposal: Proposal = {
      candidate: candidate({ id }),
      status: "pending",
      createdAt: NOW
    };
    saveProposal(proposal);
    return proposal;
  }

  it("dismissAction and snoozeAction record events with the injected clock", async () => {
    const dismissed = seed("cand-dismiss");
    const snoozed = seed("cand-snooze");

    await dismissAction(makeDeps(), dismissed);
    await snoozeAction(makeDeps(), snoozed);

    expect(existsSync(eventsPath())).toBe(true);
    const events = readEvents(10);

    const dismissEvent = events.find((e) => e.kind === "dismiss");
    const snoozeEvent = events.find((e) => e.kind === "snooze");

    expect(dismissEvent).toBeDefined();
    expect(dismissEvent?.msg).toContain("cand-dismiss");
    expect(dismissEvent?.t).toBe(NOW);

    expect(snoozeEvent).toBeDefined();
    expect(snoozeEvent?.msg).toContain("cand-snooze");
    expect(snoozeEvent?.t).toBe(NOW);
  });
});

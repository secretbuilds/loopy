import { readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listCodexSessions, parseCodexSession } from "../../src/adapters/codex.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(testDir, "../fixtures/codex");

function fixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf8");
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "loopy-codex-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("parseCodexSession", () => {
  it("maps Codex rollout records into a SessionRecord", () => {
    const session = parseCodexSession(fixture("session1.jsonl"));

    expect(session).toBeDefined();
    expect(session).toMatchObject({
      tool: "codex",
      sessionId: "codex-session-1",
      startedAt: "2026-06-12T14:00:02.000Z",
      endedAt: "2026-06-12T14:00:10.000Z",
      cwd: "/Users/sujit/projects/loopy"
    });
    expect(session?.events).toHaveLength(5);
    expect(session?.events.map((event) => event.kind)).toEqual([
      "user_msg",
      "tool_call",
      "user_msg",
      "tool_call",
      "error"
    ]);
    expect(session?.events[0]).toEqual({
      t: "2026-06-12T14:00:02.000Z",
      kind: "user_msg",
      text: "Build the Codex adapter."
    });
    expect(session?.events[1]).toEqual({
      t: "2026-06-12T14:00:03.000Z",
      kind: "tool_call",
      name: "shell",
      summary: "{\"cmd\":\"rg --files\"}"
    });
    expect(session?.events[3]).toEqual({
      t: "2026-06-12T14:00:09.000Z",
      kind: "tool_call",
      name: "shell",
      summary: "{\"cmd\":\"npm run typecheck && npx vitest run tests/adapters/codex.test.ts\"}"
    });
    expect(session?.events[4]).toEqual({
      t: "2026-06-12T14:00:10.000Z",
      kind: "error",
      summary: "sandbox denied reading a missing rollout file"
    });

    const allEventText = JSON.stringify(session?.events);
    expect(allEventText).not.toContain("developer-only instruction");
    expect(allEventText).not.toContain("assistant response");
    expect(allEventText).not.toContain("system instruction");
    expect(allEventText).not.toContain("<environment_context");
    expect(allEventText).not.toContain("<permissions");
  });

  it("survives malformed and noisy lines with fallbacks", () => {
    const session = parseCodexSession(fixture("messy.jsonl"));

    expect(session).toBeDefined();
    expect(session).toMatchObject({
      tool: "codex",
      sessionId: "unknown",
      startedAt: "2026-06-12T15:00:03.000Z",
      endedAt: "2026-06-12T15:00:05.000Z",
      cwd: ""
    });
    expect(session?.events).toEqual([
      {
        t: "2026-06-12T15:00:03.000Z",
        kind: "user_msg",
        text: "Keep going despite noise."
      },
      {
        t: "2026-06-12T15:00:04.000Z",
        kind: "tool_call",
        name: "shell",
        summary: "{\"cmd\":\"pwd\"}"
      },
      {
        t: "2026-06-12T15:00:05.000Z",
        kind: "error",
        summary: "{\"type\":\"error\",\"detail\":\"no message key\"}"
      }
    ]);
  });

  it("returns undefined for garbage with no usable events", () => {
    expect(() => parseCodexSession("not json\n{}\n[]\n")).not.toThrow();
    expect(parseCodexSession("not json\n{}\n[]\n")).toBeUndefined();
  });
});

describe("listCodexSessions", () => {
  it("recursively lists jsonl session files as absolute paths", async () => {
    const nested = join(tempDir, "2026", "06", "12");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "rollout-one.jsonl"), "{}\n");
    await writeFile(join(nested, "rollout-two.jsonl"), "{}\n");
    await writeFile(join(nested, "notes.txt"), "skip\n");
    await mkdir(join(tempDir, "2026", "06", "13"), { recursive: true });
    await writeFile(join(tempDir, "2026", "06", "13", "rollout-three.jsonl"), "{}\n");

    expect(listCodexSessions(tempDir)).toEqual([
      resolve(nested, "rollout-one.jsonl"),
      resolve(nested, "rollout-two.jsonl"),
      resolve(tempDir, "2026", "06", "13", "rollout-three.jsonl")
    ]);
  });

  it("returns an empty list for a missing directory", () => {
    expect(listCodexSessions(join(tempDir, "missing"))).toEqual([]);
  });
});

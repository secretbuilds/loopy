import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  listClaudeCodeTranscripts,
  parseClaudeCodeTranscript
} from "../../src/adapters/claude-code.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "fixtures", "claude-code");

function readFixture(name: string): string {
  return readFileSync(join(fixtureDir, name), "utf8");
}

describe("parseClaudeCodeTranscript", () => {
  it("parses a happy-path session (golden)", () => {
    const record = parseClaudeCodeTranscript(readFixture("session1.jsonl"));

    expect(record).toBeDefined();
    if (record === undefined) {
      throw new Error("expected a record");
    }

    expect(record.tool).toBe("claude-code");
    expect(record.sessionId).toBe("sess-abc");
    expect(record.cwd).toBe("/home/user/project");
    expect(record.branch).toBe("main");
    expect(record.repo).toBeUndefined();
    expect(record.startedAt).toBe("2026-06-12T10:00:00.000Z");
    expect(record.endedAt).toBe("2026-06-12T10:01:05.000Z");

    // Exact event count and kinds in order.
    expect(record.events).toHaveLength(5);
    expect(record.events.map((event) => event.kind)).toEqual([
      "user_msg",
      "tool_call",
      "tool_call",
      "command",
      "error"
    ]);

    // user_msg text.
    expect(record.events[0].text).toBe("Please help me fix the build");

    // Bash tool_call uses input.description.
    expect(record.events[1].name).toBe("Bash");
    expect(record.events[1].summary).toBe("Run the build");

    // Non-Bash tool_call stringifies input.
    expect(record.events[2].name).toBe("Edit");
    expect(record.events[2].summary).toBe(
      JSON.stringify({ file_path: "src/x.ts", old_string: "a", new_string: "b" })
    );

    // Slash command extraction.
    expect(record.events[3].name).toBe("/review");

    // System error summary.
    expect(record.events[4].summary).toContain("TypeError");
  });

  it("survives malformed input and parses the valid parts (fail-soft)", () => {
    const record = parseClaudeCodeTranscript(readFixture("messy.jsonl"));

    expect(record).toBeDefined();
    if (record === undefined) {
      throw new Error("expected a record");
    }

    expect(record.sessionId).toBe("sess-messy");
    expect(record.events.map((event) => event.kind)).toEqual([
      "user_msg",
      "tool_call",
      "command"
    ]);

    // Array content joined from text blocks only.
    expect(record.events[0].text).toBe("Hello world");

    // Bash falls back to input.command when no description.
    expect(record.events[1].summary).toBe("ls -la");

    // <command-name> tag extraction.
    expect(record.events[2].name).toBe("compact");
  });

  it("never throws on arbitrary garbage and returns undefined when empty", () => {
    expect(parseClaudeCodeTranscript("")).toBeUndefined();
    expect(parseClaudeCodeTranscript("   \n  \n")).toBeUndefined();
    expect(
      parseClaudeCodeTranscript("garbage\n{not json}\n\u0000\u0001 random bytes")
    ).toBeUndefined();
    // Only noise + meta lines yield no events.
    expect(
      parseClaudeCodeTranscript(
        [
          '{"type":"mode","sessionId":"x"}',
          '{"type":"unknown-thing"}',
          '{"type":"user","isMeta":true,"message":{"content":"hi"}}',
          '{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"tool_use","name":"Bash","input":{}}]}}'
        ].join("\n")
      )
    ).toBeUndefined();
  });

  it("truncates long user text and tool summaries", () => {
    const longText = "x".repeat(600);
    const longCommand = "y".repeat(200);
    const content = [
      `{"type":"user","sessionId":"s","timestamp":"2026-06-12T10:00:00.000Z","message":{"role":"user","content":"${longText}"}}`,
      `{"type":"assistant","timestamp":"2026-06-12T10:00:01.000Z","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"${longCommand}"}}]}}`
    ].join("\n");

    const record = parseClaudeCodeTranscript(content);
    expect(record).toBeDefined();
    expect(record?.events[0].text).toHaveLength(500);
    expect(record?.events[1].summary).toHaveLength(120);
  });
});

describe("listClaudeCodeTranscripts", () => {
  it("returns absolute paths of jsonl files in immediate subdirectories", async () => {
    const base = await mkdtemp(join(tmpdir(), "loopy-cc-"));
    try {
      const projectA = join(base, "project-a");
      const projectB = join(base, "project-b");
      await mkdir(projectA, { recursive: true });
      await mkdir(projectB, { recursive: true });

      const sessionA = join(projectA, "session1.jsonl");
      const sessionB = join(projectB, "session2.jsonl");
      await writeFile(sessionA, "{}\n");
      await writeFile(sessionB, "{}\n");
      // Non-jsonl file and a file directly in base should be ignored.
      await writeFile(join(projectA, "notes.txt"), "ignore me");
      await writeFile(join(base, "top.jsonl"), "ignore me too");

      const found = listClaudeCodeTranscripts(base).sort();
      expect(found).toEqual([sessionA, sessionB].sort());
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it("returns an empty array for a missing directory", () => {
    expect(listClaudeCodeTranscripts(join(tmpdir(), "loopy-does-not-exist-xyz"))).toEqual([]);
  });
});

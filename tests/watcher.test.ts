import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJson, writeJsonAtomic } from "../src/state.js";
import { tick, type WatchContext } from "../src/watcher.js";

let home: string;
let claudeDir: string;
let codexDir: string;
let spawned: string[][];
let alivePids: Set<number>;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "loopy-watch-home-"));
  claudeDir = await mkdtemp(join(tmpdir(), "loopy-watch-claude-"));
  codexDir = await mkdtemp(join(tmpdir(), "loopy-watch-codex-"));
  process.env.LOOPY_HOME = home;
  spawned = [];
  alivePids = new Set();
});

afterEach(async () => {
  delete process.env.LOOPY_HOME;
  await rm(home, { recursive: true, force: true });
  await rm(claudeDir, { recursive: true, force: true });
  await rm(codexDir, { recursive: true, force: true });
});

describe("watcher tick", () => {
  it("digests new claude-code and codex transcript files", async () => {
    await seedClaudeTranscript("claude-session-1", "Build the watcher.");
    await seedCodexTranscript("codex-session-1", "Run the watcher tests.");

    const result = await tick(ctx());

    expect(result).toEqual({
      digested: ["claude-session-1", "codex-session-1"],
      markersConsumed: 0,
      companionSpawned: true
    });
    expect(spawned).toEqual([["loopy", "companion"]]);

    for (const sessionId of ["claude-session-1", "codex-session-1"]) {
      const digestPath = join(home, "digests", `${sessionId}.txt`);
      expect(existsSync(digestPath)).toBe(true);
      expect(readFileSync(digestPath, "utf8").trim().length).toBeGreaterThan(0);
    }
  });

  it("skips unchanged transcripts on the second tick", async () => {
    await seedClaudeTranscript("claude-session-1", "Build the watcher.");

    await tick(ctx());
    const result = await tick(ctx());

    expect(result.digested).toEqual([]);
  });

  it("re-digests only a changed transcript", async () => {
    const claudePath = await seedClaudeTranscript("claude-session-1", "Original claude text.");
    await seedCodexTranscript("codex-session-1", "Original codex text.");
    await tick(ctx());

    await writeFile(claudePath, claudeTranscript("claude-session-1", "Updated claude text."));
    await forceNewMtime(claudePath);

    const result = await tick(ctx());

    expect(result.digested).toEqual(["claude-session-1"]);
    expect(readFileSync(join(home, "digests", "claude-session-1.txt"), "utf8")).toContain(
      "Updated claude text."
    );
  });

  it("consumes markers and spawns the companion once when no live lock exists", async () => {
    await writeConfig({ companion: "auto" });
    await mkdir(join(home, "markers"), { recursive: true });
    await writeFile(join(home, "markers", "wake"), "");

    const first = await tick(ctx());

    expect(first.markersConsumed).toBe(1);
    expect(first.companionSpawned).toBe(true);
    expect(spawned).toEqual([["loopy", "companion"]]);
    expect(readJson<{ pid: number }>(join(home, "companion.lock"))).toEqual({ pid: 4242 });
    expect(existsSync(join(home, "markers", "wake"))).toBe(false);

    alivePids.add(4242);
    await writeFile(join(home, "markers", "wake-again"), "");
    const second = await tick(ctx());

    expect(second.markersConsumed).toBe(1);
    expect(second.companionSpawned).toBe(false);
    expect(spawned).toEqual([["loopy", "companion"]]);
  });

  it("respects live and dead companion locks", async () => {
    await writeConfig({ companion: "auto" });
    await writeJsonAtomic(join(home, "companion.lock"), { pid: 100 });
    alivePids.add(100);
    await marker("live-lock");

    const live = await tick(ctx());

    expect(live.companionSpawned).toBe(false);
    expect(spawned).toEqual([]);

    alivePids.delete(100);
    await marker("dead-lock");

    const dead = await tick(ctx());

    expect(dead.companionSpawned).toBe(true);
    expect(spawned).toEqual([["loopy", "companion"]]);
    expect(readJson<{ pid: number }>(join(home, "companion.lock"))).toEqual({ pid: 4242 });
  });

  it("does not spawn when companion is off", async () => {
    await writeConfig({ companion: "off" });
    await marker("off");

    const result = await tick(ctx());

    expect(result.markersConsumed).toBe(1);
    expect(result.companionSpawned).toBe(false);
    expect(spawned).toEqual([]);
  });

  it("records garbage transcript mtimes without throwing or writing digests", async () => {
    const projectDir = join(claudeDir, "project");
    await mkdir(projectDir, { recursive: true });
    const garbagePath = join(projectDir, "garbage.jsonl");
    await writeFile(garbagePath, "not json\n{}\n");

    const first = await tick(ctx());
    const second = await tick(ctx());

    expect(first.digested).toEqual([]);
    expect(second.digested).toEqual([]);
    expect(existsSync(join(home, "digests", ".txt"))).toBe(false);

    const watchState = readJson<{ files: Record<string, number> }>(join(home, "log", "watch.json"));
    expect(watchState?.files[resolve(garbagePath)]).toBe((await stat(garbagePath)).mtimeMs);
  });
});

function ctx(): WatchContext {
  return {
    claudeProjectsDir: claudeDir,
    codexSessionsDir: codexDir,
    spawn(argv: string[]): void {
      spawned.push(argv);
    },
    isPidAlive(pid: number): boolean {
      return alivePids.has(pid);
    },
    selfPid: 4242,
    now: () => "2026-06-12T00:00:00.000Z"
  };
}

async function seedClaudeTranscript(sessionId: string, text: string): Promise<string> {
  const projectDir = join(claudeDir, "project");
  await mkdir(projectDir, { recursive: true });
  const path = join(projectDir, `${sessionId}.jsonl`);
  await writeFile(path, claudeTranscript(sessionId, text));
  return path;
}

function claudeTranscript(sessionId: string, text: string): string {
  return `${JSON.stringify({
    type: "user",
    sessionId,
    timestamp: "2026-06-12T10:00:00.000Z",
    cwd: "/tmp/project",
    gitBranch: "main",
    message: { role: "user", content: text }
  })}\n`;
}

async function seedCodexTranscript(sessionId: string, text: string): Promise<string> {
  const sessionDir = join(codexDir, "2026", "06", "12");
  await mkdir(sessionDir, { recursive: true });
  const path = join(sessionDir, `${sessionId}.jsonl`);
  await writeFile(
    path,
    [
      JSON.stringify({
        timestamp: "2026-06-12T11:00:00.000Z",
        type: "session_meta",
        payload: {
          id: sessionId,
          cwd: "/tmp/project",
          timestamp: "2026-06-12T11:00:00.000Z"
        }
      }),
      JSON.stringify({
        timestamp: "2026-06-12T11:00:01.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text }]
        }
      })
    ].join("\n") + "\n"
  );
  return path;
}

async function marker(name: string): Promise<void> {
  await mkdir(join(home, "markers"), { recursive: true });
  await writeFile(join(home, "markers", name), "");
}

async function writeConfig(config: { companion: "auto" | "off" }): Promise<void> {
  await writeJsonAtomic(join(home, "config.json"), {
    companion: config.companion,
    dailyTokenCap: 100000,
    pollIntervalMin: 15
  });
}

async function forceNewMtime(path: string): Promise<void> {
  const future = new Date(Date.now() + 5000);
  await utimes(path, future, future);
}

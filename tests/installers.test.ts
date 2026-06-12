import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BundleManifest, ToolName } from "../src/types.js";
import { installClaudeCodeLoop } from "../src/installers/claude-code.js";
import { installCodexLoop } from "../src/installers/codex.js";
import {
  cronToLaunchdInterval,
  uninstallLoop,
  type ExecResult,
  type InstallContext
} from "../src/installers/shared.js";

interface ExecCall {
  cmd: string;
  args: string[];
}

interface Trigger {
  kind: "schedule" | "hook" | "manual";
  schedule?: string;
  hookEvent?: string;
  tool: ToolName;
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "loopy-inst-"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function makeCtx(): { ctx: InstallContext; calls: ExecCall[] } {
  const calls: ExecCall[] = [];
  const ctx: InstallContext = {
    claudeSettingsPath: join(home, ".claude", "settings.json"),
    launchAgentsDir: join(home, "Library", "LaunchAgents"),
    exec: async (cmd: string, args: string[]): Promise<ExecResult> => {
      calls.push({ cmd, args });
      return { code: 0, out: "" };
    }
  };
  return { ctx, calls };
}

async function makeBundleAt(
  bundleDir: string,
  loopId: string,
  tool: ToolName,
  trigger: Trigger
): Promise<string> {
  await mkdir(join(bundleDir, "state"), { recursive: true });
  await writeFile(join(bundleDir, "loop.md"), "Do the recurring loop\n", "utf8");
  await writeFile(join(bundleDir, "trigger.json"), JSON.stringify(trigger), "utf8");

  const manifest: BundleManifest = {
    loopId,
    generatedAt: "2026-01-01T00:00:00.000Z",
    evidence: [],
    tool,
    installedPaths: [],
    uninstallNotes: []
  };
  await writeFile(join(bundleDir, "manifest.json"), serialize(manifest), "utf8");
  return bundleDir;
}

async function makeBundle(opts: {
  loopId: string;
  tool: ToolName;
  trigger: Trigger;
}): Promise<string> {
  return makeBundleAt(
    join(home, "bundles", opts.loopId),
    opts.loopId,
    opts.tool,
    opts.trigger
  );
}

async function readManifest(bundleDir: string): Promise<BundleManifest> {
  return JSON.parse(await readFile(join(bundleDir, "manifest.json"), "utf8")) as BundleManifest;
}

describe("cronToLaunchdInterval", () => {
  it("maps a single weekly schedule", () => {
    expect(cronToLaunchdInterval("0 9 * * 1")).toEqual([{ Minute: 0, Hour: 9, Weekday: 1 }]);
  });

  it("expands comma lists into multiple entries", () => {
    expect(cronToLaunchdInterval("30 8,18 * * *")).toEqual([
      { Minute: 30, Hour: 8 },
      { Minute: 30, Hour: 18 }
    ]);
  });

  it("rejects steps", () => {
    expect(() => cronToLaunchdInterval("*/5 * * * *")).toThrow();
  });

  it("rejects ranges", () => {
    expect(() => cronToLaunchdInterval("0 9-17 * * *")).toThrow();
  });

  it("rejects malformed field counts", () => {
    expect(() => cronToLaunchdInterval("0 9 * *")).toThrow();
  });

  it("rejects out-of-range minute values", () => {
    expect(() => cronToLaunchdInterval("99 * * * *")).toThrow(/out of range/);
  });

  it("rejects other out-of-range fields", () => {
    expect(() => cronToLaunchdInterval("0 99 * * *")).toThrow(/out of range/); // hour
    expect(() => cronToLaunchdInterval("0 0 99 * *")).toThrow(/out of range/); // day
    expect(() => cronToLaunchdInterval("0 0 1 99 *")).toThrow(/out of range/); // month
    expect(() => cronToLaunchdInterval("0 0 1 1 99")).toThrow(/out of range/); // weekday
  });
});

describe("installClaudeCodeLoop - schedule", () => {
  it("writes a plist, loads it, and records every touched path in the manifest", async () => {
    const bundleDir = await makeBundle({
      loopId: "abc123",
      tool: "claude-code",
      trigger: { kind: "schedule", schedule: "0 9 * * 1", tool: "claude-code" }
    });
    const { ctx, calls } = makeCtx();

    const manifest = await installClaudeCodeLoop(bundleDir, ctx);
    const plistPath = join(ctx.launchAgentsDir, "com.loopy.abc123.plist");

    expect(existsSync(plistPath)).toBe(true);
    const plist = await readFile(plistPath, "utf8");
    expect(plist).toContain("com.loopy.abc123");
    expect(plist).toContain(join(bundleDir, "loop.md"));

    expect(calls).toEqual([{ cmd: "launchctl", args: ["load", plistPath] }]);

    expect(manifest.installedPaths).toContain(plistPath);
    const onDisk = await readManifest(bundleDir);
    expect(onDisk.installedPaths).toContain(plistPath);
    expect(onDisk.uninstallNotes.some((n) => n.includes("launchctl unload"))).toBe(true);
  });

  it("round-trips with zero residue: plist + created dirs removed, manifest emptied", async () => {
    const bundleDir = await makeBundle({
      loopId: "abc123",
      tool: "claude-code",
      trigger: { kind: "schedule", schedule: "0 9 * * 1", tool: "claude-code" }
    });
    const { ctx, calls } = makeCtx();

    await installClaudeCodeLoop(bundleDir, ctx);
    const plistPath = join(ctx.launchAgentsDir, "com.loopy.abc123.plist");

    await uninstallLoop(bundleDir, ctx);

    expect(existsSync(plistPath)).toBe(false);
    // Directories the installer created are gone — no residue under HOME.
    expect(existsSync(ctx.launchAgentsDir)).toBe(false);
    expect(existsSync(join(home, "Library"))).toBe(false);
    expect(calls).toContainEqual({ cmd: "launchctl", args: ["unload", plistPath] });

    const onDisk = await readManifest(bundleDir);
    expect(onDisk.installedPaths).toEqual([]);
    expect(onDisk.uninstallNotes).toEqual([]);
  });

  it("shell-quotes a loop.md path containing a space", async () => {
    const bundleDir = await makeBundleAt(
      join(home, "with space", "spc1"),
      "spc1",
      "claude-code",
      { kind: "schedule", schedule: "0 9 * * 1", tool: "claude-code" }
    );
    const { ctx } = makeCtx();

    await installClaudeCodeLoop(bundleDir, ctx);
    const plistPath = join(ctx.launchAgentsDir, "com.loopy.spc1.plist");
    const plist = await readFile(plistPath, "utf8");

    const loopPath = join(bundleDir, "loop.md");
    // Path is single-quoted so the embedded space cannot split the command.
    expect(plist).toContain(`'${loopPath}'`);
  });
});

describe("installClaudeCodeLoop - hook", () => {
  const existingSettings = {
    permissions: { allow: ["Read"] },
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "echo pre-existing" }]
        }
      ]
    }
  };

  it("appends additively, preserving existing content; uninstall is byte-clean", async () => {
    const bundleDir = await makeBundle({
      loopId: "hook99",
      tool: "claude-code",
      trigger: { kind: "hook", hookEvent: "PreToolUse", tool: "claude-code" }
    });
    const { ctx } = makeCtx();

    await mkdir(join(home, ".claude"), { recursive: true });
    const originalBytes = serialize(existingSettings);
    await writeFile(ctx.claudeSettingsPath, originalBytes, "utf8");

    await installClaudeCodeLoop(bundleDir, ctx);

    const afterInstall = JSON.parse(await readFile(ctx.claudeSettingsPath, "utf8"));
    expect(afterInstall.hooks.PreToolUse).toHaveLength(2);
    expect(afterInstall.hooks.PreToolUse[0]).toEqual(existingSettings.hooks.PreToolUse[0]);
    expect(afterInstall.permissions).toEqual(existingSettings.permissions);
    expect(afterInstall.hooks.PreToolUse[1].hooks[0].command).toContain("# loopy:hook99");

    const onDisk = await readManifest(bundleDir);
    expect(onDisk.installedPaths).toEqual([ctx.claudeSettingsPath]);

    await uninstallLoop(bundleDir, ctx);
    const afterUninstall = await readFile(ctx.claudeSettingsPath, "utf8");
    expect(afterUninstall).toBe(originalBytes);
    expect(existsSync(ctx.claudeSettingsPath)).toBe(true);
  });

  it("removes only the loopy command from a shared entry, sparing user commands", async () => {
    const loopId = "shared1";
    const bundleDir = await makeBundle({
      loopId,
      tool: "claude-code",
      trigger: { kind: "hook", hookEvent: "PreToolUse", tool: "claude-code" }
    });
    const { ctx } = makeCtx();

    await mkdir(join(home, ".claude"), { recursive: true });
    const userCommand = { type: "command", command: "echo user-owned" };
    const loopyCommand = {
      type: "command",
      command: `sh -c 'claude -p "$(cat x)"' # loopy:${loopId}`
    };
    const sharedSettings = {
      hooks: {
        PreToolUse: [{ matcher: "*", hooks: [userCommand, loopyCommand] }]
      }
    };
    await writeFile(ctx.claudeSettingsPath, serialize(sharedSettings), "utf8");

    // Point the manifest at the settings file so uninstall processes it.
    const manifest = await readManifest(bundleDir);
    manifest.installedPaths = [ctx.claudeSettingsPath];
    await writeFile(join(bundleDir, "manifest.json"), serialize(manifest), "utf8");

    await uninstallLoop(bundleDir, ctx);

    const after = JSON.parse(await readFile(ctx.claudeSettingsPath, "utf8"));
    expect(after.hooks.PreToolUse).toHaveLength(1);
    expect(after.hooks.PreToolUse[0].hooks).toEqual([userCommand]);
    const dumped = JSON.stringify(after);
    expect(dumped).not.toContain(`# loopy:${loopId}`);
  });

  it("throws and keeps the manifest intact when settings.json is unreadable", async () => {
    const bundleDir = await makeBundle({
      loopId: "hookbad",
      tool: "claude-code",
      trigger: { kind: "hook", hookEvent: "PreToolUse", tool: "claude-code" }
    });
    const { ctx } = makeCtx();

    await installClaudeCodeLoop(bundleDir, ctx);
    expect((await readManifest(bundleDir)).installedPaths).toEqual([ctx.claudeSettingsPath]);

    // Corrupt the settings file after install.
    await writeFile(ctx.claudeSettingsPath, "{ this is not json", "utf8");

    await expect(uninstallLoop(bundleDir, ctx)).rejects.toThrow(/Claude settings/);

    // Manifest must NOT have been cleared — the loop is still installed.
    expect((await readManifest(bundleDir)).installedPaths).toEqual([ctx.claudeSettingsPath]);
  });
});

describe("uninstallLoop - idempotency", () => {
  it("does not throw on a double uninstall", async () => {
    const bundleDir = await makeBundle({
      loopId: "abc123",
      tool: "claude-code",
      trigger: { kind: "schedule", schedule: "0 9 * * 1", tool: "claude-code" }
    });
    const { ctx } = makeCtx();

    await installClaudeCodeLoop(bundleDir, ctx);
    await uninstallLoop(bundleDir, ctx);
    await expect(uninstallLoop(bundleDir, ctx)).resolves.toBeUndefined();
  });
});

describe("installCodexLoop", () => {
  it("round-trips a schedule install", async () => {
    const bundleDir = await makeBundle({
      loopId: "cdx1",
      tool: "codex",
      trigger: { kind: "schedule", schedule: "30 8,18 * * *", tool: "codex" }
    });
    const { ctx, calls } = makeCtx();

    await installCodexLoop(bundleDir, ctx);
    const plistPath = join(ctx.launchAgentsDir, "com.loopy.cdx1.plist");

    expect(existsSync(plistPath)).toBe(true);
    const plist = await readFile(plistPath, "utf8");
    expect(plist).toContain("codex exec --sandbox workspace-write --skip-git-repo-check");
    expect(plist).toContain(join(bundleDir, "loop.md"));
    expect(calls).toEqual([{ cmd: "launchctl", args: ["load", plistPath] }]);

    await uninstallLoop(bundleDir, ctx);
    expect(existsSync(plistPath)).toBe(false);
    expect(existsSync(ctx.launchAgentsDir)).toBe(false);
    expect(calls).toContainEqual({ cmd: "launchctl", args: ["unload", plistPath] });

    const onDisk = await readManifest(bundleDir);
    expect(onDisk.installedPaths).toEqual([]);
    expect(onDisk.uninstallNotes).toEqual([]);
  });

  it("throws when asked to install a hook trigger", async () => {
    const bundleDir = await makeBundle({
      loopId: "cdx2",
      tool: "codex",
      trigger: { kind: "hook", hookEvent: "PreToolUse", tool: "codex" }
    });
    const { ctx } = makeCtx();

    await expect(installCodexLoop(bundleDir, ctx)).rejects.toThrow(
      "codex does not support hook triggers"
    );
  });
});

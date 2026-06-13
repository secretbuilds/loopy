import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import type { BundleManifest } from "../types.js";

export interface ExecResult {
  code: number;
  out: string;
}

export interface InstallContext {
  claudeSettingsPath: string; // e.g. ~/.claude/settings.json
  launchAgentsDir: string; // e.g. ~/Library/LaunchAgents
  exec: (cmd: string, args: string[]) => Promise<ExecResult>;
}

/** launchd StartCalendarInterval keys, in cron field order. */
const FIELD_KEYS = ["Minute", "Hour", "Day", "Month", "Weekday"] as const;

/** Inclusive [min, max] bounds for each cron field, in field order. */
const FIELD_RANGES: [number, number][] = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day-of-month
  [1, 12], // month
  [0, 7] // weekday (0 and 7 are both Sunday)
];

/**
 * Convert a 5-field cron string into launchd StartCalendarInterval entries.
 * Supports "*" (field omitted), plain numbers and comma lists. Comma lists
 * expand to the cartesian product of entries. Ranges ("-"), steps ("/") and
 * out-of-range values are rejected with a thrown Error.
 */
export function cronToLaunchdInterval(schedule: string): Record<string, number>[] {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron schedule (expected 5 fields): ${schedule}`);
  }

  const parsed: (number[] | null)[] = fields.map((field, index) => {
    if (field === "*") {
      return null;
    }
    if (field.includes("-") || field.includes("/")) {
      throw new Error(`Unsupported cron field (ranges/steps not allowed): ${field}`);
    }
    const [min, max] = FIELD_RANGES[index];
    return field.split(",").map((part) => {
      if (!/^\d+$/.test(part)) {
        throw new Error(`Invalid cron field value: ${part}`);
      }
      const value = Number(part);
      if (value < min || value > max) {
        throw new Error(
          `Cron value out of range for ${FIELD_KEYS[index]} (${min}-${max}): ${value}`
        );
      }
      return value;
    });
  });

  let entries: Record<string, number>[] = [{}];
  parsed.forEach((values, index) => {
    if (values === null) {
      return;
    }
    const key = FIELD_KEYS[index];
    const next: Record<string, number>[] = [];
    for (const entry of entries) {
      for (const value of values) {
        next.push({ ...entry, [key]: value });
      }
    }
    entries = next;
  });

  return entries;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * POSIX shell single-quote a value: wrap in single quotes, escaping any
 * embedded single quote as '\''. Safe for paths containing spaces, quotes,
 * `$`, backticks, or other shell metacharacters.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

const LOOP_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Throw if loopId does not match the allowed charset (a-z0-9 and hyphens). */
export function validateLoopId(loopId: string): void {
  if (!LOOP_ID_RE.test(loopId)) {
    throw new Error(
      `Invalid loopId "${loopId}": must match /^[a-z0-9][a-z0-9-]{0,63}$/`
    );
  }
}

/** Build a minimal valid launchd plist XML document. */
export function plistFor(
  label: string,
  programArgs: string[],
  intervals: Record<string, number>[]
): string {
  const argsXml = programArgs
    .map((arg) => `    <string>${escapeXml(arg)}</string>`)
    .join("\n");

  const intervalsXml = intervals
    .map((interval) => {
      const body = Object.entries(interval)
        .map(
          ([key, value]) =>
            `      <key>${escapeXml(key)}</key>\n      <integer>${value}</integer>`
        )
        .join("\n");
      return `    <dict>\n${body}\n    </dict>`;
    })
    .join("\n");

  const logPath = `/tmp/${label}.log`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>
  <key>ProgramArguments</key>
  <array>
${argsXml}
  </array>
  <key>StartCalendarInterval</key>
  <array>
${intervalsXml}
  </array>
  <key>StandardOutPath</key>
  <string>${escapeXml(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(logPath)}</string>
</dict>
</plist>
`;
}

function manifestPath(bundleDir: string): string {
  return join(bundleDir, "manifest.json");
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Read the bundle's manifest.json from disk. */
export function readBundleManifest(bundleDir: string): BundleManifest {
  const raw = readFileSync(manifestPath(bundleDir), "utf8");
  return JSON.parse(raw) as BundleManifest;
}

/** Write the bundle's manifest.json to disk (2-space indent, trailing newline). */
export function writeBundleManifest(bundleDir: string, manifest: BundleManifest): void {
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(manifestPath(bundleDir), serialize(manifest), "utf8");
}

/** Serialize a Claude settings object to disk, preserving 2-space indentation. */
export function writeClaudeSettings(settingsPath: string, settings: unknown): void {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, serialize(settings), "utf8");
}

/** Read a Claude settings object, returning {} when the file is absent. */
export function readClaudeSettings(settingsPath: string): Record<string, unknown> {
  if (!existsSync(settingsPath)) {
    return {};
  }
  const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as unknown;
  return typeof parsed === "object" && parsed !== null
    ? (parsed as Record<string, unknown>)
    : {};
}

/**
 * Create `targetDir` (recursive) and return the list of directories that did
 * not previously exist, ordered deepest-first. Recording these lets uninstall
 * remove exactly the directories the installer created, leaving zero residue.
 */
export function ensureDirCreated(targetDir: string): string[] {
  const created: string[] = [];
  let dir = targetDir;
  while (!existsSync(dir)) {
    created.push(dir); // deepest-first as we walk toward the root
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  mkdirSync(targetDir, { recursive: true });
  return created;
}

interface HookCommand {
  type?: string;
  command?: string;
}

interface HookEntry {
  matcher?: string;
  hooks?: HookCommand[];
}

/**
 * Precisely remove this loop's hook commands from a Claude settings file.
 * Only the inner command objects whose command contains the marker are
 * dropped; an outer entry is removed only when it becomes empty, so
 * user-owned commands sharing an entry are preserved. Empty event arrays and
 * an emptied `hooks` object are pruned. The file is rewritten in place (never
 * deleted). Throws a descriptive error if the file exists but cannot be
 * read/parsed — callers must NOT treat that as a successful uninstall.
 */
function removeLoopHooks(settingsPath: string, loopId: string): void {
  if (!existsSync(settingsPath)) {
    return;
  }

  let settings: Record<string, unknown>;
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("settings is not a JSON object");
    }
    settings = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to read/parse Claude settings at ${settingsPath}: ${(error as Error).message}`
    );
  }

  const marker = ` # loopy:${loopId}`;
  const hooks = settings.hooks;
  if (typeof hooks === "object" && hooks !== null) {
    const hookMap = hooks as Record<string, unknown>;
    for (const event of Object.keys(hookMap)) {
      const arr = hookMap[event];
      if (!Array.isArray(arr)) {
        continue;
      }

      const cleaned = (arr as HookEntry[])
        .map((entry) => {
          const inner = entry?.hooks;
          if (!Array.isArray(inner)) {
            return entry;
          }
          const keptInner = inner.filter(
            (h) => !(typeof h?.command === "string" && h.command.endsWith(marker))
          );
          if (keptInner.length === inner.length) {
            return entry; // nothing of ours here — leave untouched
          }
          if (keptInner.length === 0) {
            return null; // entry held only our command(s) — drop it
          }
          return { ...entry, hooks: keptInner }; // keep user-owned commands
        })
        .filter((entry): entry is HookEntry => entry !== null);

      if (cleaned.length === 0) {
        delete hookMap[event];
      } else {
        hookMap[event] = cleaned;
      }
    }

    if (Object.keys(hookMap).length === 0) {
      delete settings.hooks;
    }
  }

  writeClaudeSettings(settingsPath, settings);
}

/**
 * Reverse an install. For each recorded path: plists are unloaded via
 * launchctl then deleted; the Claude settings file has its loop hook entries
 * stripped (file preserved); directories the installer created are removed
 * when empty. The manifest is reset and saved only after every path has been
 * processed successfully — a failure (e.g. unreadable settings) throws and
 * leaves the manifest accurate. Idempotent: missing files/dirs are skipped.
 */
export async function uninstallLoop(bundleDir: string, ctx: InstallContext): Promise<void> {
  const manifest = readBundleManifest(bundleDir);

  for (const path of manifest.installedPaths) {
    if (path.endsWith(".plist")) {
      await ctx.exec("launchctl", ["unload", path]);
      if (existsSync(path)) {
        rmSync(path);
      }
    } else if (path === ctx.claudeSettingsPath) {
      removeLoopHooks(path, manifest.loopId);
    } else {
      // A directory the installer created — remove it only if now empty.
      try {
        rmdirSync(path);
      } catch {
        // Non-empty (shared with other loops) or already gone: leave it.
      }
    }
  }

  manifest.installedPaths = [];
  manifest.uninstallNotes = [];
  writeBundleManifest(bundleDir, manifest);
}

export interface Trigger {
  kind: "schedule" | "hook" | "manual";
  schedule?: string;
  hookEvent?: string;
  tool: "claude-code" | "codex";
}

/** Read the bundle's trigger.json from disk. */
export function readTrigger(bundleDir: string): Trigger {
  const raw = readFileSync(join(bundleDir, "trigger.json"), "utf8");
  return JSON.parse(raw) as Trigger;
}

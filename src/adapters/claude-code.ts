import { existsSync, readdirSync, type Dirent } from "node:fs";
import { resolve } from "node:path";
import type { SessionEvent, SessionRecord } from "../types.js";

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

/** Extract user text from a Claude Code `message.content` payload. */
function extractUserText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter(
        (block): block is { type: string; text?: string } =>
          typeof block === "object" && block !== null
      )
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("");
  }

  return "";
}

function commandNameTag(text: string): string | undefined {
  const match = text.match(/<command-name>([^<]*)<\/command-name>/);
  return match ? match[1] : undefined;
}

/** Map a single user line into an event, or undefined if it carries nothing. */
function mapUserLine(line: Record<string, unknown>, t: string): SessionEvent | undefined {
  const message = line.message as { content?: unknown } | undefined;
  const text = extractUserText(message?.content);

  const tagName = commandNameTag(text);
  if (tagName !== undefined) {
    return { t, kind: "command", name: tagName };
  }

  if (text.startsWith("/")) {
    const firstToken = text.split(/\s+/)[0];
    return { t, kind: "command", name: firstToken };
  }

  return { t, kind: "user_msg", text: truncate(text, 500) };
}

/** Map an assistant line into zero or more tool_call events. */
function mapAssistantLine(line: Record<string, unknown>, t: string): SessionEvent[] {
  const message = line.message as { content?: unknown } | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) {
    return [];
  }

  const events: SessionEvent[] = [];
  for (const block of content) {
    if (typeof block !== "object" || block === null) {
      continue;
    }

    const b = block as { type?: string; name?: string; input?: unknown };
    if (b.type !== "tool_use") {
      continue;
    }

    const name = typeof b.name === "string" ? b.name : "";
    const input = (b.input ?? {}) as Record<string, unknown>;

    let summary: string;
    if (name === "Bash") {
      const description = input.description;
      const command = input.command;
      summary =
        typeof description === "string"
          ? description
          : typeof command === "string"
            ? command
            : JSON.stringify(input);
    } else {
      summary = JSON.stringify(input);
    }

    events.push({ t, kind: "tool_call", name, summary: truncate(summary, 120) });
  }

  return events;
}

function mapSystemLine(line: Record<string, unknown>, t: string): SessionEvent | undefined {
  if (line.level !== "error") {
    return undefined;
  }

  const content = typeof line.content === "string" ? line.content : "";
  return { t, kind: "error", summary: truncate(content, 200) };
}

const NOISE_TYPES = new Set([
  "last-prompt",
  "mode",
  "permission-mode",
  "attachment",
  "file-history-snapshot",
  "ai-title",
  "queue-operation"
]);

/**
 * Parse a Claude Code session transcript (JSONL) into a SessionRecord.
 * Fail-soft: unparseable lines are skipped, never thrown. Returns undefined
 * when no usable events are found.
 */
export function parseClaudeCodeTranscript(content: string): SessionRecord | undefined {
  const events: SessionEvent[] = [];
  let sessionId: string | undefined;
  let cwd: string | undefined;
  let branch: string | undefined;

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    let parsed: Record<string, unknown>;
    try {
      const value = JSON.parse(line);
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        continue;
      }
      parsed = value as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = parsed.type;
    if (typeof type !== "string") {
      continue;
    }

    if (NOISE_TYPES.has(type)) {
      continue;
    }

    if (parsed.isMeta === true || parsed.isSidechain === true) {
      continue;
    }

    if (sessionId === undefined && typeof parsed.sessionId === "string") {
      sessionId = parsed.sessionId;
    }

    const t = typeof parsed.timestamp === "string" ? parsed.timestamp : "";

    if (type === "user") {
      if (cwd === undefined && typeof parsed.cwd === "string") {
        cwd = parsed.cwd;
      }
      if (branch === undefined && typeof parsed.gitBranch === "string") {
        branch = parsed.gitBranch;
      }

      const event = mapUserLine(parsed, t);
      if (event !== undefined) {
        events.push(event);
      }
    } else if (type === "assistant") {
      events.push(...mapAssistantLine(parsed, t));
    } else if (type === "system") {
      const event = mapSystemLine(parsed, t);
      if (event !== undefined) {
        events.push(event);
      }
    }
    // Unknown types fall through and are skipped.
  }

  if (events.length === 0) {
    return undefined;
  }

  const timestamps = events.map((event) => event.t).filter((t) => t !== "");
  timestamps.sort();
  const startedAt = timestamps[0] ?? "";
  const endedAt = timestamps[timestamps.length - 1] ?? "";

  return {
    tool: "claude-code",
    sessionId: sessionId ?? "",
    startedAt,
    endedAt,
    cwd: cwd ?? "",
    branch,
    events
  };
}

/**
 * List absolute paths of all `*.jsonl` files in immediate subdirectories of
 * `baseDir` (layout: `<baseDir>/<project-slug>/<session>.jsonl`).
 * Missing baseDir yields an empty array.
 */
export function listClaudeCodeTranscripts(baseDir: string): string[] {
  if (!existsSync(baseDir)) {
    return [];
  }

  const results: string[] = [];

  let subdirs: Dirent[];
  try {
    subdirs = readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of subdirs) {
    if (!entry.isDirectory()) {
      continue;
    }

    const subdir = resolve(baseDir, entry.name);
    let files: Dirent[];
    try {
      files = readdirSync(subdir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const file of files) {
      if (file.isFile() && file.name.endsWith(".jsonl")) {
        results.push(resolve(subdir, file.name));
      }
    }
  }

  return results;
}

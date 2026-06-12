import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SessionEvent, SessionRecord } from "../types.js";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

function eventTimestamp(timestamp: string | undefined, fallback: string | undefined): string {
  return timestamp ?? fallback ?? "";
}

function contentText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => (isObject(item) ? stringValue(item.text) : undefined))
    .filter((text): text is string => text !== undefined)
    .join("");
}

function stringifyPayload(payload: JsonObject): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return "";
  }
}

function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function parseCodexSession(content: string): SessionRecord | undefined {
  let sessionId = "unknown";
  let cwd = "";
  let metaTimestamp: string | undefined;
  const events: SessionEvent[] = [];

  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!isObject(parsed)) {
      continue;
    }

    const timestamp = stringValue(parsed.timestamp);
    const type = stringValue(parsed.type);
    const payload = isObject(parsed.payload) ? parsed.payload : undefined;

    if (type === "session_meta") {
      if (payload !== undefined) {
        sessionId = stringValue(payload.id) ?? sessionId;
        cwd = stringValue(payload.cwd) ?? cwd;
        metaTimestamp = stringValue(payload.timestamp) ?? timestamp ?? metaTimestamp;
      }
      continue;
    }

    if (payload === undefined) {
      continue;
    }

    if (type === "response_item") {
      const payloadType = stringValue(payload.type);

      if (payloadType === "message") {
        if (stringValue(payload.role) !== "user") {
          continue;
        }

        const text = contentText(payload.content);
        if (text.startsWith("<permissions") || text.startsWith("<environment_context")) {
          continue;
        }

        events.push({
          t: eventTimestamp(timestamp, metaTimestamp),
          kind: "user_msg",
          text: truncate(text, 500)
        });
        continue;
      }

      if (payloadType === "function_call") {
        const name = stringValue(payload.name);
        const args = stringValue(payload.arguments);
        if (name === undefined || args === undefined) {
          continue;
        }

        events.push({
          t: eventTimestamp(timestamp, metaTimestamp),
          kind: "tool_call",
          name,
          summary: truncate(args, 120)
        });
      }

      continue;
    }

    if (type === "event_msg" && stringValue(payload.type) === "error") {
      const message = stringValue(payload.message) ?? stringifyPayload(payload);
      events.push({
        t: eventTimestamp(timestamp, metaTimestamp),
        kind: "error",
        summary: truncate(message, 200)
      });
    }
  }

  if (events.length === 0) {
    return undefined;
  }

  const eventTimes = events.map((event) => event.t).filter((t) => t !== "").sort(compareIso);
  const startedAt = eventTimes[0] ?? metaTimestamp ?? "";
  const endedAt = eventTimes[eventTimes.length - 1] ?? metaTimestamp ?? "";

  return {
    tool: "codex",
    sessionId,
    startedAt,
    endedAt,
    cwd,
    events
  };
}

export function listCodexSessions(baseDir: string): string[] {
  const root = resolve(baseDir);
  const sessions: string[] = [];

  function visit(dir: string): void {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        sessions.push(path);
      }
    }
  }

  visit(root);
  return sessions.sort();
}

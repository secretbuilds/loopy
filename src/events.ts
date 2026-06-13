import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { loopyHome } from "./state.js";

export type EventKind =
  | "digest"
  | "scan"
  | "propose"
  | "approve"
  | "dismiss"
  | "snooze"
  | "install"
  | "uninstall"
  | "pause"
  | "resume"
  | "spawn"
  | "error";

export interface LoopyEvent {
  t: string; // ISO timestamp (callers pass their injected clock)
  kind: EventKind;
  msg: string; // human-readable single line
}

const MAX_BYTES = 512 * 1024;
const KEEP_LINES = 1000;

function logDir(): string {
  return join(loopyHome(), "log");
}

function eventsPath(): string {
  return join(logDir(), "events.jsonl");
}

export function appendEvent(kind: EventKind, msg: string, t: string): void {
  const dir = logDir();
  mkdirSync(dir, { recursive: true });

  const path = eventsPath();
  const event: LoopyEvent = { t, kind, msg: msg.replace(/[\r\n]+/g, " ") };
  appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");

  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }

  if (size > MAX_BYTES) {
    const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.length > 0);
    const kept = lines.slice(-KEEP_LINES);
    writeFileSync(path, `${kept.join("\n")}\n`, "utf8");
  }
}

export function readEvents(limit: number): LoopyEvent[] {
  const path = eventsPath();
  if (!existsSync(path)) {
    return [];
  }

  const lines = readFileSync(path, "utf8").split("\n").filter((line) => line.length > 0);
  const events: LoopyEvent[] = [];

  for (const line of lines) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as LoopyEvent).t === "string" &&
      typeof (parsed as LoopyEvent).kind === "string" &&
      typeof (parsed as LoopyEvent).msg === "string"
    ) {
      events.push(parsed as LoopyEvent);
    }
  }

  return limit >= 0 ? events.slice(-limit) : events;
}

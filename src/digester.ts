import type { SessionRecord } from "./types.js";

/**
 * Deterministically redact secrets from arbitrary text.
 *
 * Rules are applied in order:
 *  1. Known token prefixes followed by 8+ non-space chars.
 *  2. `key=value` / `key: value` where the key looks credential-ish.
 *  3. High-entropy runs (24+ chars, with a digit AND mixed case) — applied last.
 *
 * URL credential userinfo (`//user:pass@host`) is also stripped. Normal prose,
 * file paths, plain URLs, ISO timestamps and UUIDs are left untouched.
 */
export function redact(text: string): string {
  let s = text;

  // 1. Known token prefixes followed by 8+ non-space chars.
  s = s.replace(/\b(?:sk-|ghp_|gho_|github_pat_|xoxb-|xoxp-)\S{8,}/g, "[REDACTED]");
  // AWS access key ids: AKIA then 12+ alphanumerics.
  s = s.replace(/\bAKIA[A-Za-z0-9]{12,}/g, "[REDACTED]");
  // Bearer tokens: "Bearer " then 16+ non-space chars.
  s = s.replace(/\bBearer \S{16,}/g, "[REDACTED]");

  // 2. key=value / key: value with a credential-ish key and an 8+ char value.
  s = s.replace(
    /\b(api[_-]?key|token|secret|password|passwd|credential|auth)(\s*[=:]\s*)(\S{8,})/gi,
    "$1$2[REDACTED]"
  );

  // URL credential userinfo: //user:pass@host -> //[REDACTED]@host
  s = s.replace(/(\/\/)[^\s\/@]+:[^\s\/@]+@/g, "$1[REDACTED]@");

  // 3. High-entropy strings (applied last): 24+ chars from a base64-ish alphabet
  //    that contain at least one digit AND mixed case.
  //    '/' is deliberately excluded from the run alphabet so that file paths and
  //    URL paths break into short segments. As an extra guard, any candidate run
  //    sitting in a path/URL context (immediately preceded by '/') is skipped so
  //    long path/URL segments are never treated as secrets.
  s = s.replace(/[A-Za-z0-9+=_-]{24,}/g, (m: string, offset: number, full: string) => {
    if (offset > 0 && full[offset - 1] === "/") return m;
    const ok = /\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m);
    return ok ? "[REDACTED]" : m;
  });

  return s;
}

/** Redact a field, collapse newlines to spaces, then optionally truncate. */
function reduceField(value: string | undefined, max?: number): string {
  let v = redact(value ?? "");
  v = v.replace(/[\r\n]+/g, " ");
  if (max !== undefined) v = v.slice(0, max);
  return v;
}

/**
 * Reduce a single session into a compact, deterministic text digest.
 * One header line plus one line per event, in original order.
 */
export function digestSession(record: SessionRecord): string {
  const header =
    `=== session ${reduceField(record.sessionId)} tool=${reduceField(record.tool)} ` +
    `cwd=${reduceField(record.cwd)} branch=${reduceField(record.branch ?? "-")} ` +
    `start=${reduceField(record.startedAt)} end=${reduceField(record.endedAt)}`;

  const lines: string[] = [header];

  for (const e of record.events) {
    const t = reduceField(e.t);
    switch (e.kind) {
      case "user_msg":
        lines.push(`U ${t} ${reduceField(e.text, 200)}`);
        break;
      case "command":
        lines.push(`C ${t} ${reduceField(e.name)}`);
        break;
      case "tool_call":
        lines.push(`T ${t} ${reduceField(e.name)}: ${reduceField(e.summary, 100)}`);
        break;
      case "error":
        lines.push(`E ${t} ${reduceField(e.summary, 150)}`);
        break;
    }
  }

  return lines.join("\n");
}

/**
 * Reduce many sessions, sorted by startedAt (then sessionId for full
 * determinism), separated by a blank line.
 */
export function digestSessions(records: SessionRecord[]): string {
  const sorted = [...records].sort((a, b) => {
    if (a.startedAt < b.startedAt) return -1;
    if (a.startedAt > b.startedAt) return 1;
    if (a.sessionId < b.sessionId) return -1;
    if (a.sessionId > b.sessionId) return 1;
    return 0;
  });
  return sorted.map(digestSession).join("\n\n");
}

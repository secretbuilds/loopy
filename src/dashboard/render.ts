import type { DashboardState, Focus, Mood } from "./state.js";
import { deriveMood } from "./state.js";

export const MIN_COLS = 60;
export const MIN_ROWS = 16;

export function renderDashboard(s: DashboardState, cols: number, rows: number): string {
  if (cols < MIN_COLS || rows < MIN_ROWS) return renderTooSmall(cols, rows);

  const widths = columnWidths(cols);
  const bodyRows = Math.max(0, rows - 11);
  const lines: string[] = [
    topBorder(cols),
    boxedLine(`  ${critterFace(deriveMood(s), s.moodFrame)}  ${statusText(s)}`, cols),
    boxedLine(headerMessage(s), cols),
    panelTitleLine(s, widths, cols),
    ...bodyLines(s, widths, bodyRows),
    activityTitleLine(s.focus, cols),
    ...activityLines(s, cols),
    boxedLine(footerText(s), cols),
    bottomBorder(cols)
  ];

  return normalizeLines(lines, cols, rows).join("\n");
}

function renderTooSmall(cols: number, rows: number): string {
  if (rows <= 0) return "";

  const message = "loopy needs a bigger window (60×16+)";
  const centerRow = Math.floor(rows / 2);
  const lines = Array.from({ length: rows }, (_, index) => {
    if (index === 0) return `╭${"─".repeat(Math.max(0, cols - 2))}╮`;
    if (index === rows - 1) return `╰${"─".repeat(Math.max(0, cols - 2))}╯`;
    if (index === centerRow) return boxedLine(centerText(message, Math.max(0, cols - 2)), cols);
    return boxedLine("", cols);
  });

  return normalizeLines(lines, cols, rows).join("\n");
}

function topBorder(cols: number): string {
  const prefix = "╭─ loopy ";
  return fit(prefix + "─".repeat(Math.max(0, cols - prefix.length - 1)) + "╮", cols);
}

function bottomBorder(cols: number): string {
  return fit(`╰${"─".repeat(Math.max(0, cols - 2))}╯`, cols);
}

function boxedLine(content: string, cols: number): string {
  return fit(`│${fit(content, Math.max(0, cols - 2))}│`, cols);
}

function panelTitleLine(s: DashboardState, widths: { left: number; right: number }, cols: number): string {
  const inboxTitle = `${s.focus === "inbox" ? "[inbox]" : "inbox"} (${s.data.proposals.length}) `;
  const loopsTitle = `${s.focus === "loops" ? "[loops]" : "loops"} (${s.data.loops.length}) `;
  return fit(
    `├${titleSegment(inboxTitle, widths.left)}┬${titleSegment(loopsTitle, widths.right)}┤`,
    cols
  );
}

function activityTitleLine(focus: Focus, cols: number): string {
  const title = `${focus === "activity" ? "[activity]" : "activity"} `;
  return fit(`├${titleSegment(title, Math.max(0, cols - 2))}┤`, cols);
}

function titleSegment(title: string, width: number): string {
  return fit(`─ ${title}${"─".repeat(Math.max(0, width - title.length - 2))}`, width);
}

function bodyLines(
  s: DashboardState,
  widths: { left: number; right: number },
  count: number
): string[] {
  const left = inboxLines(s, widths.left, count);
  const right = loopLines(s, widths.right, count);

  return Array.from({ length: count }, (_, index) => {
    return `│${fit(left[index] ?? "", widths.left)}│${fit(right[index] ?? "", widths.right)}│`;
  });
}

function inboxLines(s: DashboardState, width: number, count: number): string[] {
  if (count <= 0) return [];
  if (s.data.proposals.length === 0) return [fit("(no proposals — press s to scan)", width)];

  const selected = s.data.proposals[s.inboxIndex] ?? s.data.proposals[0];
  const list = s.data.proposals.slice(0, 4).map((proposal, index) => {
    const marker = index === s.inboxIndex ? "▶ " : "  ";
    return fit(`${marker}${proposal.candidate.id}`, width);
  });
  const detail = [
    ...wrapText(selected.candidate.summary, width),
    `impact: ${selected.candidate.impactEstimate}`,
    `evidence: ${selected.candidate.occurrences} sessions`,
    `confidence: ${selected.candidate.confidence}`
  ].map((line) => fit(line, width));

  return fitToCount([...list, "", ...detail], count);
}

function loopLines(s: DashboardState, width: number, count: number): string[] {
  if (count <= 0) return [];
  if (s.data.loops.length === 0) return [fit("(none installed yet)", width)];

  return fitToCount(
    s.data.loops.map((loop, index) => {
      const marker = index === s.loopsIndex ? "▶ " : "  ";
      return fit(`${marker}${loop.id}  ${loop.kind}  ${loop.tool}`, width);
    }),
    count
  );
}

function activityLines(s: DashboardState, cols: number): string[] {
  const width = Math.max(0, cols - 2);
  const events = s.data.events;
  const start = Math.max(0, events.length - 4 - s.activityScroll);
  const visible = events.slice(start, start + 4);

  return Array.from({ length: 4 }, (_, index) => {
    const event = visible[index];
    if (!event) return boxedLine("", cols);
    return boxedLine(`${event.t.slice(11, 16)} ${event.msg}`, cols);
  }).map((line) => fit(line, width + 2));
}

function statusText(s: DashboardState): string {
  const daemon =
    s.data.daemon === "running" ? "✓" : s.data.daemon === "paused" ? "paused" : "✗";
  return `watching ${s.data.sessions} sessions · daemon ${daemon} · spend ${s.data.spendToday}/${s.data.spendCap}`;
}

function headerMessage(s: DashboardState): string {
  if (s.confirm) return `${s.confirm.action} "${s.confirm.targetId}"? [y]es [n]o`;
  if (s.busy) return `${s.busy}${".".repeat((s.spinnerFrame % 3) + 1)}`;
  if (s.flash) return s.flash;
  if (s.data.proposals.length > 0) return `✨ ${s.data.proposals.length} loop idea(s) waiting`;
  return "all quiet — your loops have it covered";
}

function footerText(s: DashboardState): string {
  if (s.confirm) return "[y]es [n]o";
  if (s.busy) return `${s.busy}… [q]uit`;

  switch (s.focus) {
    case "inbox":
      return "[tab]panel [↑↓]move [a]pprove [d]ismiss [z]snooze [s]can [p]ause [q]uit";
    case "loops":
      return "[tab]panel [↑↓]move [x]uninstall [s]can [p]ause [q]uit";
    case "activity":
      return "[tab]panel [↑↓]scroll [s]can [p]ause [q]uit";
  }
}

function critterFace(mood: Mood, moodFrame: number): string {
  switch (mood) {
    case "idle":
      return moodFrame % 4 === 3 ? "(− −)" : "(◕ ◕)";
    case "sleepy":
      return "(− −)ᶻ";
    case "perky":
      return "(✧ ✧)";
    case "attentive":
      return "(◕ ◕)?";
    case "celebrate":
      return "✧(◕◡◕)✧";
  }
}

function columnWidths(cols: number): { left: number; right: number } {
  const interior = Math.max(0, cols - 3);
  const left = Math.floor(interior * 0.55);
  return { left, right: interior - left };
}

function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [""];

  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let start = 0; start < word.length; start += width) {
        lines.push(word.slice(start, start + width));
      }
      continue;
    }

    const next = current ? `${current} ${word}` : word;
    if (next.length <= width) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function fitToCount(lines: string[], count: number): string[] {
  return [...lines, ...Array.from({ length: Math.max(0, count - lines.length) }, () => "")].slice(0, count);
}

function normalizeLines(lines: string[], cols: number, rows: number): string[] {
  return Array.from({ length: Math.max(0, rows) }, (_, index) => fit(lines[index] ?? "", cols));
}

function centerText(text: string, width: number): string {
  if (text.length >= width) return fit(text, width);
  const left = Math.floor((width - text.length) / 2);
  return `${" ".repeat(left)}${text}`;
}

function fit(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length > width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

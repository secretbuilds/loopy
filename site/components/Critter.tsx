"use client";

import { useEffect, useState, type ReactNode } from "react";

export type CritterMood = "idle" | "perky" | "celebrate" | "smile";

interface CritterProps {
  mood?: CritterMood;
  size?: number;
  animate?: boolean;
}

// Each frame is an array of lines. Eye characters are isolated so we can
// color them amber while keeping the ears/arms in the body text color.
// Frames within a mood are kept to equal height to avoid layout shift.

const IDLE_FRAMES: string[][] = [
  ["  ∧   ∧", " (◕ ω ◕)", "  ┗┛ ┗┛"], // open
  ["  ∧   ∧", " (◕ ω ·)", "  ┗┛ ┗┛"], // glance
  ["  ∧   ∧", " (— ω —)", "  ┗┛ ┗┛"], // blink
];

const PERKY_FRAME: string[] = [" +∧   ∧+", " (◕ ▿ ◕)", "  ┗┛ ┗┛"];

const CELEBRATE_FRAME: string[] = [" + ∧   ∧ +", "  (◕ ▿ ◕)", "   \\(^)/"];

const SMILE_FRAME: string[] = ["  ∧   ∧", " (◕ ‿ ◕)"];

// Per-frame display durations (ms) for the idle cycle.
const IDLE_DURATIONS = [2600, 500, 120];

function colorizeEyes(line: string): ReactNode {
  // Eye glyphs we want to tint amber. Everything else stays as body text.
  const eyeChars = new Set(["◕", "—", "·", "ω", "▿", "‿"]);
  return Array.from(line).map((ch, i) =>
    eyeChars.has(ch) ? (
      <span key={i} style={{ color: "var(--amber)" }}>
        {ch}
      </span>
    ) : (
      <span key={i}>{ch}</span>
    )
  );
}

export default function Critter({
  mood = "idle",
  size,
  animate = true,
}: CritterProps) {
  const [frameIndex, setFrameIndex] = useState(0);

  const isAnimatedIdle = mood === "idle" && animate;

  useEffect(() => {
    if (!isAnimatedIdle) return;

    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      // Reduced motion: hold the static open frame.
      setFrameIndex(0);
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    let current = 0;

    const tick = () => {
      current = (current + 1) % IDLE_FRAMES.length;
      setFrameIndex(current);
      timer = setTimeout(tick, IDLE_DURATIONS[current]);
    };

    timer = setTimeout(tick, IDLE_DURATIONS[0]);
    return () => clearTimeout(timer);
  }, [isAnimatedIdle]);

  let lines: string[];
  let minHeight: number;

  switch (mood) {
    case "perky":
      lines = PERKY_FRAME;
      minHeight = PERKY_FRAME.length;
      break;
    case "celebrate":
      lines = CELEBRATE_FRAME;
      minHeight = CELEBRATE_FRAME.length;
      break;
    case "smile":
      lines = SMILE_FRAME;
      minHeight = SMILE_FRAME.length;
      break;
    case "idle":
    default:
      lines = isAnimatedIdle ? IDLE_FRAMES[frameIndex] : IDLE_FRAMES[0];
      minHeight = IDLE_FRAMES[0].length;
      break;
  }

  return (
    <pre
      aria-hidden="true"
      className="font-mono whitespace-pre leading-tight text-text select-none"
      style={{
        fontSize: size ? `${size}rem` : undefined,
        minHeight: `${minHeight * 1.1}em`,
        margin: 0,
      }}
    >
      {lines.map((line, i) => (
        <div key={i}>{colorizeEyes(line)}</div>
      ))}
    </pre>
  );
}

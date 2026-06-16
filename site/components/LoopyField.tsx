import type { CSSProperties } from "react";

// Decorative animated background for the hero: a sparse field of static loopy
// critters, each drifting along a small CLOSED orbit forever. This is a Server
// Component on purpose — pure CSS keyframes, no timers, no state. The whole
// layer sits behind the hero content (-z-10), is aria-hidden, and ignores
// pointer events so it never interferes with the page.
//
// Readability is the hard requirement: critters are rendered at very low
// opacity, kept toward the PERIPHERY, and a radial mask darkens the center so
// the headline/subcopy/install column always reads against ~solid background.
//
// Reduced motion is handled globally in globals.css (animation-duration ~0 +
// delay 0), which freezes every critter in place — no JS needed here.

// Three face variants for gentle variety. Eyes (◕) are tinted amber via a
// nested span; the rest inherits the per-critter color.
type Face = "wink" | "smile" | "soft";

function CritterGlyph({ face }: { face: Face }) {
  const eye = <span style={{ color: "var(--amber)" }}>◕</span>;
  if (face === "smile") {
    return (
      <>
        {" ∧   ∧\n("}
        {eye}
        {" ‿ "}
        {eye}
        {")\n ┗┛ ┗┛"}
      </>
    );
  }
  if (face === "soft") {
    return (
      <>
        {"+∧   ∧+\n("}
        {eye}
        {" ▿ "}
        {eye}
        {")\n ┗┛ ┗┛"}
      </>
    );
  }
  // wink (default)
  return (
    <>
      {" ∧   ∧\n("}
      {eye}
      {" ω "}
      {eye}
      {")\n ┗┛ ┗┛"}
    </>
  );
}

type Critter = {
  top: string;
  left: string;
  fontSize: string;
  opacity: number;
  color: string;
  orbit: "a" | "b" | "c";
  duration: string;
  delay: string;
  face: Face;
};

// ~26 critters pushed to the corners/sides/top/bottom, with a few faint
// mid-field strays (kept at the low end of the opacity band so the masked
// center stays readable). All durations differ; delays are negative so the
// loops start mid-orbit and never sync up.
const CRITTERS: Critter[] = [
  // top edge
  { top: "5%", left: "5%", fontSize: "0.85rem", opacity: 0.26, color: "var(--amber)", orbit: "a", duration: "24s", delay: "-3s", face: "wink" },
  { top: "8%", left: "22%", fontSize: "0.65rem", opacity: 0.18, color: "var(--text-dim)", orbit: "b", duration: "31s", delay: "-12s", face: "smile" },
  { top: "4%", left: "44%", fontSize: "0.55rem", opacity: 0.15, color: "var(--text-dim)", orbit: "c", duration: "27s", delay: "-9s", face: "soft" },
  { top: "6%", left: "66%", fontSize: "0.75rem", opacity: 0.2, color: "var(--amber)", orbit: "a", duration: "29s", delay: "-17s", face: "smile" },
  { top: "9%", left: "88%", fontSize: "0.9rem", opacity: 0.27, color: "var(--amber)", orbit: "b", duration: "22s", delay: "-6s", face: "soft" },
  { top: "14%", left: "12%", fontSize: "0.7rem", opacity: 0.23, color: "var(--amber)", orbit: "c", duration: "33s", delay: "-21s", face: "wink" },
  { top: "12%", left: "78%", fontSize: "0.6rem", opacity: 0.19, color: "var(--text-dim)", orbit: "a", duration: "26s", delay: "-14s", face: "soft" },
  // right side
  { top: "22%", left: "92%", fontSize: "0.8rem", opacity: 0.22, color: "var(--text-dim)", orbit: "b", duration: "30s", delay: "-8s", face: "wink" },
  { top: "38%", left: "90%", fontSize: "0.85rem", opacity: 0.23, color: "var(--amber)", orbit: "c", duration: "34s", delay: "-19s", face: "smile" },
  { top: "50%", left: "94%", fontSize: "0.95rem", opacity: 0.28, color: "var(--amber)", orbit: "a", duration: "21s", delay: "-4s", face: "wink" },
  { top: "64%", left: "88%", fontSize: "0.7rem", opacity: 0.24, color: "var(--amber)", orbit: "b", duration: "28s", delay: "-15s", face: "soft" },
  { top: "78%", left: "92%", fontSize: "0.6rem", opacity: 0.2, color: "var(--text-dim)", orbit: "c", duration: "32s", delay: "-11s", face: "smile" },
  { top: "60%", left: "82%", fontSize: "0.65rem", opacity: 0.2, color: "var(--text-dim)", orbit: "b", duration: "25s", delay: "-2s", face: "wink" },
  // left side
  { top: "20%", left: "3%", fontSize: "0.8rem", opacity: 0.24, color: "var(--amber)", orbit: "c", duration: "23s", delay: "-18s", face: "soft" },
  { top: "36%", left: "6%", fontSize: "0.7rem", opacity: 0.21, color: "var(--text-dim)", orbit: "a", duration: "18s", delay: "-7s", face: "smile" },
  { top: "52%", left: "2%", fontSize: "0.85rem", opacity: 0.2, color: "var(--text-dim)", orbit: "b", duration: "19s", delay: "-13s", face: "wink" },
  { top: "66%", left: "5%", fontSize: "0.9rem", opacity: 0.22, color: "var(--amber)", orbit: "c", duration: "20s", delay: "-5s", face: "soft" },
  { top: "76%", left: "3%", fontSize: "0.65rem", opacity: 0.25, color: "var(--amber)", orbit: "a", duration: "18.5s", delay: "-16s", face: "wink" },
  // bottom edge
  { top: "88%", left: "14%", fontSize: "0.95rem", opacity: 0.27, color: "var(--amber)", orbit: "b", duration: "19.5s", delay: "-10s", face: "smile" },
  { top: "92%", left: "36%", fontSize: "0.6rem", opacity: 0.18, color: "var(--text-dim)", orbit: "c", duration: "20.5s", delay: "-1s", face: "soft" },
  { top: "94%", left: "58%", fontSize: "0.55rem", opacity: 0.16, color: "var(--text-dim)", orbit: "a", duration: "21.5s", delay: "-20s", face: "wink" },
  { top: "90%", left: "78%", fontSize: "0.8rem", opacity: 0.26, color: "var(--amber)", orbit: "b", duration: "22.5s", delay: "-22s", face: "smile" },
  { top: "86%", left: "94%", fontSize: "0.7rem", opacity: 0.2, color: "var(--text-dim)", orbit: "c", duration: "23.5s", delay: "-23s", face: "soft" },
  // faint mid-field strays (kept low under the mask)
  { top: "30%", left: "16%", fontSize: "0.6rem", opacity: 0.18, color: "var(--amber)", orbit: "a", duration: "24.5s", delay: "-24s", face: "wink" },
  { top: "44%", left: "30%", fontSize: "0.55rem", opacity: 0.14, color: "var(--text-dim)", orbit: "b", duration: "25.5s", delay: "-25s", face: "soft" },
  { top: "56%", left: "70%", fontSize: "0.6rem", opacity: 0.15, color: "var(--text-dim)", orbit: "c", duration: "26.5s", delay: "-26s", face: "smile" },
];

const FIELD_KEYFRAMES = `
@keyframes loopy-orbit-a {
  0%,100% { transform: translate(0,0); }
  25% { transform: translate(10px,-8px); }
  50% { transform: translate(0,-16px); }
  75% { transform: translate(-10px,-8px); }
}
@keyframes loopy-orbit-b {
  0%,100% { transform: translate(0,0) rotate(0deg); }
  33% { transform: translate(-12px,-6px) rotate(2deg); }
  66% { transform: translate(8px,-12px) rotate(-2deg); }
}
@keyframes loopy-orbit-c {
  0%,100% { transform: translate(0,0); }
  50% { transform: translate(14px,10px); }
}`;

export default function LoopyField() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    >
      <style>{FIELD_KEYFRAMES}</style>

      {CRITTERS.map((c, i) => {
        const style: CSSProperties = {
          top: c.top,
          left: c.left,
          fontSize: c.fontSize,
          opacity: c.opacity,
          color: c.color,
          lineHeight: 1.05,
          animation: `loopy-orbit-${c.orbit} ${c.duration} ease-in-out infinite`,
          animationDelay: c.delay,
        };
        return (
          <pre
            key={i}
            style={style}
            className="absolute m-0 select-none font-mono"
          >
            <CritterGlyph face={c.face} />
          </pre>
        );
      })}

      {/* Readability mask: darkens the center to ~solid bg where the hero text
          lives, fading out toward the edges so critters only show near the
          periphery. Sits above the critters but still behind hero content. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 42%, var(--bg) 0%, color-mix(in srgb, var(--bg) 80%, transparent) 45%, transparent 80%)",
        }}
      />
    </div>
  );
}

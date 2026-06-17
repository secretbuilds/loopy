"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Critter from "@/components/Critter";
import LoopyField from "@/components/LoopyField";
import TerminalCard from "@/components/TerminalCard";
import CopyButton from "@/components/CopyButton";
import { INSTALL_CMD, CA, hero } from "@/lib/content";

// Page-load reveal + proposal slide-in keyframes. Kept inline so this
// component is self-contained. Under prefers-reduced-motion the global CSS
// rule in globals.css forces animation-duration ~0 with fill "both", so each
// element lands instantly at its final (visible) state — no transforms.
const KEYFRAMES = `
@keyframes loopy-rise {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: none; }
}
@keyframes loopy-slide {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}`;

// Staggered reveal style for a given delay (seconds).
function reveal(delay: number): CSSProperties {
  return {
    animationName: "loopy-rise",
    animationDuration: "0.6s",
    animationTimingFunction: "ease-out",
    animationFillMode: "both",
    animationDelay: `${delay}s`,
  };
}

const SLIDE_IN: CSSProperties = {
  animationName: "loopy-slide",
  animationDuration: "0.4s",
  animationTimingFunction: "ease-out",
  animationFillMode: "both",
};

export default function Hero() {
  // The proposal row animates in after a beat; under reduced motion it is
  // shown immediately with no timer.
  const [showProposal, setShowProposal] = useState(false);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setShowProposal(true);
      return;
    }
    const t = setTimeout(() => setShowProposal(true), 1600);
    return () => clearTimeout(t);
  }, []);

  // Split line2 at the em-dash so the leading phrase ("all quiet") can be
  // tinted blue and the remainder muted — derived entirely from content.
  const dashIdx = hero.demo.line2.indexOf(" — ");
  const line2Blue =
    dashIdx >= 0 ? hero.demo.line2.slice(0, dashIdx) : hero.demo.line2;
  const line2Rest = dashIdx >= 0 ? hero.demo.line2.slice(dashIdx) : "";

  return (
    <section id="top" className="relative isolate overflow-hidden">
      <LoopyField />

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-4 pt-28 pb-20 text-center sm:pt-32 sm:pb-28">
        <style>{KEYFRAMES}</style>

      {/* Version badge */}
      <span
        style={reveal(0)}
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted"
      >
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-amber"
        />
        {hero.versionBadge}
      </span>

      {/* Headline */}
      <h1
        style={{
          ...reveal(0.08),
          fontSize: "clamp(2.75rem, 6vw, 4.5rem)",
        }}
        className="mt-6 font-serif leading-[1.05] tracking-tight text-text"
      >
        {hero.h1}
      </h1>

      {/* Subcopy */}
      <p
        style={{ ...reveal(0.16), maxWidth: "60ch" }}
        className="mt-5 font-mono text-sm text-muted sm:text-base"
      >
        {hero.subcopy}
      </p>

      {/* Install block */}
      <div id="install" style={reveal(0.24)} className="mt-8 w-full max-w-xl">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-inset px-4 py-3 text-left">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-sm text-text">
            {INSTALL_CMD}
          </code>
          <CopyButton value={INSTALL_CMD} className="shrink-0" />
        </div>
        <p className="mt-3 font-mono text-sm text-muted">
          or{" "}
          <a
            href={hero.docsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue transition-colors hover:text-amber"
          >
            read the docs →
          </a>
        </p>
      </div>

      {/* Contract address (CA) */}
      <div
        style={reveal(0.28)}
        className="mt-4 flex w-full max-w-xl items-center gap-2 rounded-lg border border-border bg-inset px-3 py-2 text-left"
      >
        <span className="shrink-0 font-mono text-xs text-dim">CA</span>
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-muted">
          {CA}
        </code>
        <CopyButton value={CA} className="shrink-0 text-xs" />
      </div>

      {/* Hero visual: "live" terminal with the critter + demo lines */}
      <div style={reveal(0.32)} className="mt-12 w-full max-w-xl">
        <TerminalCard title="live" className="text-left">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <Critter mood={showProposal ? "perky" : "idle"} animate />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-muted">{hero.demo.line1}</p>
              <p>
                <span className="text-blue">{line2Blue}</span>
                {line2Rest ? (
                  <span className="text-muted">{line2Rest}</span>
                ) : null}
              </p>
              {showProposal ? (
                <p style={SLIDE_IN} className="text-green">
                  {hero.demo.proposal}
                </p>
              ) : null}
            </div>
          </div>
        </TerminalCard>
      </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import SectionLabel from "@/components/SectionLabel";
import { impact } from "@/lib/content";

// Visual widths (percent of track) for each bar, aligned by index with
// impact.bars. "before" is the manual baseline (static, muted), "after" is the
// loopy result (amber, animates in). Direction conveys "manual worse, loopy
// better": for overhead/token-burn the after bar shrinks; for patterns-found
// the after bar grows from near-empty.
const BAR_WIDTHS: { before: number; after: number }[] = [
  { before: 100, after: 11 }, // repetitive overhead: 90 → 10 min/wk
  { before: 100, after: 70 }, // token burn: −20–35%
  { before: 6, after: 85 }, // patterns found: ~0 → 3–5
];

export default function Impact() {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Reduced motion: render final widths immediately, no observer needed.
    if (prefersReduced) {
      setInView(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section className="mx-auto w-full max-w-4xl px-6 py-24">
      <SectionLabel>IMPACT</SectionLabel>

      <h2 className="mt-4 font-serif text-4xl leading-[1.1] sm:text-5xl">
        {impact.heading}
        <br />
        <span className="text-amber">{impact.headingAccent}</span>
      </h2>

      <div ref={ref} className="mt-12 space-y-8">
        {impact.bars.map((bar, i) => {
          const w = BAR_WIDTHS[i] ?? { before: 100, after: 50 };
          return (
            <div key={bar.label}>
              <p className="font-mono text-sm text-muted">{bar.label}</p>

              <div className="mt-2 space-y-2">
                {/* before — manual baseline (static, muted) */}
                <div className="relative h-9 overflow-hidden rounded-md border border-border bg-inset">
                  <div
                    className="h-full bg-muted/25"
                    style={{ width: `${w.before}%` }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-dim">
                      manual
                    </span>
                    <span className="font-mono text-xs text-muted">
                      {bar.before}
                    </span>
                  </div>
                </div>

                {/* after — loopy result (amber, animates width on scroll-in) */}
                <div className="relative h-9 overflow-hidden rounded-md border border-border bg-inset">
                  <div
                    className="h-full bg-amber/80 transition-[width] duration-[1100ms] ease-out motion-reduce:transition-none"
                    style={{ width: inView ? `${w.after}%` : "0%" }}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-amber">
                      loopy
                    </span>
                    <span className="font-mono text-xs font-medium text-amber">
                      {bar.after}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-12 text-center text-lg text-text sm:text-xl">
        {impact.kicker}
      </p>
      <p className="mt-3 text-center text-xs text-dim">{impact.footnote}</p>
    </section>
  );
}

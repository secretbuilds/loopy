import type { ReactNode } from "react";
import SectionLabel from "@/components/SectionLabel";
import { shift } from "@/lib/content";

// Brighten the word "your" inside the otherwise-muted closing line so the
// loop-engineering bridge ("your patterns") lands. Copy still comes verbatim
// from content; we only split on the whole word.
function emphasizeYour(text: string): ReactNode[] {
  return text.split(/(\byour\b)/).map((part, i) =>
    part === "your" ? (
      <em key={i} className="not-italic text-text">
        {part}
      </em>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function TheShift() {
  return (
    <section
      id="shift"
      className="mx-auto w-full max-w-5xl px-6 py-24 sm:py-32"
    >
      <SectionLabel>THE SHIFT</SectionLabel>

      <h2 className="mt-6 max-w-3xl font-serif text-4xl leading-tight text-text sm:text-5xl">
        {shift.heading}
      </h2>

      <div className="mt-12 grid gap-12 lg:grid-cols-2 lg:gap-10">
        {shift.quotes.map((quote) => (
          <blockquote key={quote.author} className="flex flex-col gap-5">
            <p className="font-serif text-2xl italic leading-relaxed text-text sm:text-[1.75rem] sm:leading-snug">
              {quote.text}
            </p>
            <footer className="font-mono text-sm text-amber">
              — {quote.author}
              {quote.role ? (
                <span className="text-muted"> · {quote.role}</span>
              ) : null}
            </footer>
          </blockquote>
        ))}
      </div>

      <p className="mt-16 max-w-3xl font-mono text-base leading-relaxed text-muted">
        {emphasizeYour(shift.closing)}
      </p>
    </section>
  );
}

import type { ReactNode } from "react";
import SectionLabel from "@/components/SectionLabel";
import TerminalCard from "@/components/TerminalCard";
import { pipeline } from "@/lib/content";

// Tokens that get semantic color inside the terminal mocks. Kept verbatim so a
// split with a capturing group leaves these segments intact for re-coloring.
const MOCK_TOKENS = /(▶|auto-lint-fix|├|└|🔒 redacted: \d+ secrets)/g;

function colorizeMockLine(line: string): ReactNode[] {
  return line
    .split(MOCK_TOKENS)
    .filter((part) => part !== "")
    .map((part, i) => {
      // Proposal marker + leaf loop name read as "the good thing".
      if (part === "▶" || part === "auto-lint-fix") {
        return (
          <span key={i} className="text-green">
            {part}
          </span>
        );
      }
      // File-tree connectors recede.
      if (part === "├" || part === "└") {
        return (
          <span key={i} className="text-dim">
            {part}
          </span>
        );
      }
      // Redaction hint draws a warm, reassuring eye.
      if (part.startsWith("🔒")) {
        return (
          <span key={i} className="text-amber">
            {part}
          </span>
        );
      }
      return <span key={i}>{part}</span>;
    });
}

export default function HowItWorks() {
  return (
    <section
      id="how"
      className="mx-auto w-full max-w-7xl px-6 py-24 sm:py-32"
    >
      <SectionLabel>PIPELINE</SectionLabel>

      <h2 className="mt-6 max-w-3xl font-serif text-4xl leading-tight text-text sm:text-5xl">
        {pipeline.heading}
      </h2>
      <p className="mt-4 max-w-2xl font-mono text-sm leading-relaxed text-muted sm:text-base">
        {pipeline.sub}
      </p>

      <ol className="mt-14 grid gap-x-6 gap-y-10 md:grid-cols-2 xl:grid-cols-4">
        {pipeline.steps.map((step, index) => (
          <li
            key={step.n}
            className="relative flex flex-col gap-4"
          >
            {/* Subtle left-to-right flow connector on xl; CSS-only, decorative. */}
            {index < pipeline.steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-3 top-3 hidden font-mono text-dim xl:block"
              >
                →
              </span>
            ) : null}

            <div className="flex items-baseline gap-3">
              <span className="font-mono text-3xl leading-none text-dim">
                {step.n}
              </span>
              <h3 className="font-serif text-2xl font-bold text-amber">
                {step.title}
              </h3>
            </div>

            <p className="text-sm leading-relaxed text-muted">{step.desc}</p>

            <TerminalCard title={`step ${step.n}`} className="mt-auto">
              <div className="flex flex-col gap-1">
                {step.mockLines.map((line, i) => (
                  <span
                    key={i}
                    className="block whitespace-pre-wrap break-words font-mono text-sm"
                  >
                    {colorizeMockLine(line)}
                  </span>
                ))}
              </div>
            </TerminalCard>
          </li>
        ))}
      </ol>
    </section>
  );
}

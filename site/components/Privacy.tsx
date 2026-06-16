import SectionLabel from "@/components/SectionLabel";
import TerminalCard from "@/components/TerminalCard";
import { privacy } from "@/lib/content";

export default function Privacy() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
      <div className="flex flex-col gap-4">
        <SectionLabel>PRIVACY</SectionLabel>
        <h2 className="font-serif text-3xl leading-tight text-text sm:text-4xl">
          {privacy.heading}
        </h2>
      </div>

      <p className="mt-6 max-w-2xl font-mono text-sm text-muted">
        {privacy.paragraph}
      </p>

      <div className="mt-10">
        <TerminalCard title="redacted before anything moves">
          <ul className="flex flex-col gap-1">
            {privacy.redacted.map((line, i) => {
              const last = i === privacy.redacted.length - 1;
              return (
                <li key={line} className="flex gap-2">
                  <span className="text-dim" aria-hidden="true">
                    {last ? "└" : "├"}
                  </span>
                  <span className="text-text">{line}</span>
                </li>
              );
            })}
          </ul>
        </TerminalCard>
      </div>

      <ul className="mt-8 flex flex-wrap gap-3">
        {privacy.pills.map((pill) => (
          <li
            key={pill}
            className="flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted"
          >
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber"
              aria-hidden="true"
            />
            {pill}
          </li>
        ))}
      </ul>
    </section>
  );
}

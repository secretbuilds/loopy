import Critter from "@/components/Critter";
import { neverGuilt } from "@/lib/content";

const EMPHASIS = "Your inbox, your call.";

export default function NeverGuilt() {
  const idx = neverGuilt.lastIndexOf(EMPHASIS);
  const lead = idx >= 0 ? neverGuilt.slice(0, idx) : neverGuilt;
  const tail = idx >= 0 ? neverGuilt.slice(idx) : "";
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="flex flex-col items-center gap-4 rounded-lg border border-border bg-raised px-6 py-6 text-center sm:flex-row sm:gap-6 sm:text-left">
        <div className="shrink-0">
          <Critter mood="smile" animate={false} />
        </div>
        <p className="font-mono text-sm text-muted">
          {lead}
          {tail && <span className="text-text">{tail}</span>}
        </p>
      </div>
    </section>
  );
}

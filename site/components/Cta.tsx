import CopyButton from "@/components/CopyButton";
import Critter from "@/components/Critter";
import { cta, INSTALL_CMD } from "@/lib/content";

export default function Cta() {
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-24 text-center sm:py-32">
      <div className="flex flex-col items-center gap-6">
        <Critter mood="celebrate" />

        <h2 className="font-serif text-4xl leading-tight text-text sm:text-5xl">
          {cta.h2}
        </h2>

        <div className="flex w-full max-w-xl flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-inset px-4 py-3 text-left">
            <code className="whitespace-nowrap font-mono text-sm text-text">
              {INSTALL_CMD}
            </code>
          </div>
          <CopyButton
            value={INSTALL_CMD}
            className="shrink-0 rounded-lg border border-border px-4 py-3"
          />
        </div>

        <p className="text-sm text-muted">
          {cta.sub}
          <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-amber">
            {cta.subCode}
          </code>
        </p>
      </div>
    </section>
  );
}

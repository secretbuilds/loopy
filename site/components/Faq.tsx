"use client";

import { useId, useState } from "react";
import SectionLabel from "@/components/SectionLabel";
import { faq } from "@/lib/content";

export default function Faq() {
  // Single-open accordion; all-closed by default. null = nothing open.
  const [open, setOpen] = useState<number | null>(null);
  const baseId = useId();

  return (
    <section id="faq" className="mx-auto w-full max-w-3xl px-6 py-24">
      <SectionLabel>FAQ</SectionLabel>

      <h2 className="mt-4 font-serif text-4xl sm:text-5xl">
        Frequently asked questions.
      </h2>

      <div className="mt-10 border-t border-border">
        {faq.map((item, i) => {
          const isOpen = open === i;
          const btnId = `${baseId}-btn-${i}`;
          const panelId = `${baseId}-panel-${i}`;

          return (
            <div key={item.q} className="border-b border-border">
              <h3 className="m-0">
                <button
                  type="button"
                  id={btnId}
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-amber"
                >
                  <span className="font-mono text-base text-text">
                    {item.q}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`shrink-0 font-mono text-xl leading-none text-amber transition-transform duration-300 ease-out motion-reduce:transition-none ${
                      isOpen ? "rotate-45" : ""
                    }`}
                  >
                    +
                  </span>
                </button>
              </h3>

              <div
                id={panelId}
                role="region"
                aria-labelledby={btnId}
                className={`grid transition-all duration-300 ease-out motion-reduce:transition-none ${
                  isOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "grid-rows-[0fr] opacity-0"
                }`}
              >
                <div className="overflow-hidden">
                  <p className="pb-5 leading-relaxed text-muted">{item.a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

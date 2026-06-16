import Image from "next/image";

import SectionLabel from "@/components/SectionLabel";
import { dashboard } from "@/lib/content";

export default function Dashboard() {
  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
      <div className="flex flex-col gap-4">
        <SectionLabel>DASHBOARD</SectionLabel>
        <h2 className="font-serif text-3xl leading-tight text-text sm:text-4xl">
          {dashboard.heading}
        </h2>
      </div>

      <div className="mt-10 flex flex-col gap-4">
        <p className="font-mono text-sm text-green">{dashboard.command}</p>
        <div className="overflow-hidden rounded-lg border border-border bg-raised p-2 sm:p-3">
          <Image
            src="/dashboard.png"
            width={1676}
            height={672}
            alt="loopy terminal dashboard showing inbox, loops, and activity panels"
            className="h-auto w-full rounded"
            priority={false}
          />
        </div>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {dashboard.bullets.map((bullet) => (
          <div key={bullet.name} className="flex flex-col gap-1">
            <span className="font-mono text-sm text-green">{bullet.name}</span>
            <span className="text-sm text-muted">{bullet.desc}</span>
          </div>
        ))}
      </div>

      <p className="mt-8 text-sm text-muted">{dashboard.subline}</p>
    </section>
  );
}

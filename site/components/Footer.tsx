import Critter from "@/components/Critter";
import { footer } from "@/lib/content";

export default function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{footer.copyright}</p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {footer.links.map((link) => {
              const external = link.href.startsWith("http");
              return (
                <a
                  key={link.label}
                  href={link.href}
                  className="text-sm text-muted transition-colors hover:text-amber"
                  {...(external
                    ? { target: "_blank", rel: "noreferrer" }
                    : {})}
                >
                  {link.label}
                </a>
              );
            })}
          </nav>
        </div>

        <div className="my-12 flex justify-center">
          <Critter mood="idle" animate={false} size={1.6} />
        </div>

        <p className="font-serif text-lg italic text-muted">
          {footer.tagline}
        </p>
      </div>
    </footer>
  );
}

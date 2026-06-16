"use client";

import { useEffect, useState } from "react";
import { nav, REPO_URL, SUPPORT_URL, GITHUB_STARS_FALLBACK } from "@/lib/content";

export default function Nav() {
  // Becomes true once the user scrolls past the hero's top edge, at which
  // point the bar gains a translucent backdrop + bottom border.
  const [scrolled, setScrolled] = useState(false);
  // Star count from the GitHub API; falls back to a constant on any failure
  // and while loading, so the pill always renders something sensible.
  const [stars, setStars] = useState<number>(GITHUB_STARS_FALLBACK);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(
          "https://api.github.com/repos/secretbuilds/loopy"
        );
        if (!res.ok) return; // keep fallback on non-2xx
        const data: unknown = await res.json();
        const count = (data as { stargazers_count?: unknown })
          ?.stargazers_count;
        if (active && typeof count === "number" && Number.isFinite(count)) {
          setStars(count);
        }
      } catch {
        // Network/parse error — silently keep the fallback. Never throw.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-colors duration-300 ${
        scrolled
          ? "border-border bg-bg/80 backdrop-blur"
          : "border-transparent"
      }`}
    >
      <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        {/* Brand: small critter face + wordmark, links to page top */}
        <a
          href="#top"
          className="flex items-center gap-2 font-mono text-amber transition-colors hover:text-amber-bright"
        >
          <span aria-hidden="true" className="text-sm">
            (◕ω◕)
          </span>
          <span className="text-sm font-medium">loopy</span>
        </a>

        {/* Center nav links — hidden on mobile, shown md+ */}
        <ul className="hidden items-center gap-6 md:flex">
          {nav.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="font-mono text-sm text-muted transition-colors hover:text-text"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Right: support + GitHub star pill + Install button */}
        <div className="flex items-center gap-2">
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-amber transition-colors hover:text-amber-bright"
          >
            support
          </a>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-full border border-border px-3 py-1 font-mono text-xs text-muted transition-colors hover:text-text"
          >
            <span className="text-amber" aria-hidden="true">
              ★
            </span>
            <span>{stars.toLocaleString("en-US")}</span>
          </a>
          <a
            href="#install"
            className="rounded-full bg-amber px-3 py-1 font-mono text-xs font-medium text-bg transition-colors hover:bg-amber-bright"
          >
            Install
          </a>
        </div>
      </nav>
    </header>
  );
}

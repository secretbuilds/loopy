import type { ReactNode } from "react";

interface SectionLabelProps {
  children: ReactNode;
}

export default function SectionLabel({ children }: SectionLabelProps) {
  return (
    <span className="font-mono text-xs uppercase tracking-[0.2em] text-dim">
      // {children} --
    </span>
  );
}

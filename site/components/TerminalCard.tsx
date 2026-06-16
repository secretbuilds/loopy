import type { ReactNode } from "react";

interface TerminalCardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export default function TerminalCard({
  title,
  children,
  className = "",
}: TerminalCardProps) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-border bg-raised ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {title ? (
          <span className="font-mono text-xs text-dim">{title}</span>
        ) : (
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-dim" />
            <span className="h-2.5 w-2.5 rounded-full bg-dim" />
            <span className="h-2.5 w-2.5 rounded-full bg-dim" />
          </div>
        )}
      </div>
      <div className="p-4 font-mono text-sm text-text">{children}</div>
    </div>
  );
}

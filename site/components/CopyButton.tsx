"use client";

import { useEffect, useState } from "react";

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
}

export default function CopyButton({
  value,
  label = "copy",
  className = "",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); fail silently.
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={copied ? "copied" : `copy ${label}`}
      className={`font-mono text-sm text-muted transition-colors hover:text-amber ${className}`}
    >
      {copied ? "copied ✓" : label}
    </button>
  );
}

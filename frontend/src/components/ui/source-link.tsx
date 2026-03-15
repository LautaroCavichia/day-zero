// ─── SourceLink ───────────────────────────────────────────────────────────────
// Renders an external source URL as a subtle inline link with an icon.

import { ExternalLink } from "lucide-react";

interface SourceLinkProps {
  url: string;
  /** Custom label to show instead of the URL hostname */
  label?: string;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 32);
  }
}

export function SourceLink({ url, label }: SourceLinkProps) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs font-mono text-[#5a5a5a] hover:text-[#C8FF00] transition-colors duration-150"
    >
      <ExternalLink className="size-3 flex-shrink-0" strokeWidth={1.5} />
      <span className="truncate max-w-[160px]">{label ?? hostname(url)}</span>
    </a>
  );
}

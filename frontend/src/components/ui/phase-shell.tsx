// ─── PhaseShell ───────────────────────────────────────────────────────────────
// Consistent wrapper for all phase content panels.
// Provides the page-load header pattern with title, subtitle, optional badge,
// and an optional "Continue to Next Phase" CTA at the bottom.

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

interface PhaseShellProps {
  title: string;
  subtitle: string;
  badge?: ReactNode;
  children: ReactNode;
  /** If provided, shows a "Continue to X" CTA at bottom */
  continueLabel?: string;
  onContinue?: () => void;
}

export function PhaseShell({
  title,
  subtitle,
  badge,
  children,
  continueLabel,
  onContinue,
}: PhaseShellProps) {
  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Page header */}
      <div className="page-load-item" style={{ animationDelay: "0ms" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#f0f0f0] font-heading">{title}</h1>
            <p className="text-sm text-[#5a5a5a] mt-0.5">{subtitle}</p>
          </div>
          {badge && <div>{badge}</div>}
        </div>
      </div>

      {children}

      {/* Continue CTA */}
      {continueLabel && onContinue && (
        <div className="page-load-item pt-2" style={{ animationDelay: "200ms" }}>
          <button
            onClick={onContinue}
            className="
              flex items-center gap-2 px-5 py-2.5 rounded-xl
              bg-[#C8FF00] text-black text-sm font-semibold
              hover:bg-[#D4FF33] transition-colors duration-150
              active:scale-[0.98]
            "
          >
            {continueLabel}
            <ArrowRight className="size-4" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
  );
}

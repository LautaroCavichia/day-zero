// ─── PhaseShell ───────────────────────────────────────────────────────────────
// Consistent wrapper for all phase content panels.
// Provides the page-load header pattern with title, subtitle, optional badge,
// and an optional "What's Next" card at the bottom.

import type { ReactNode } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";

interface PhaseShellProps {
  title: string;
  subtitle: string;
  badge?: ReactNode;
  children: ReactNode;
  /** If provided, shows a "What's Next" card at bottom */
  continueLabel?: string;
  /** Short description of what the next phase reveals */
  continueDescription?: string;
  onContinue?: () => void;
  /** If provided, shows a "Re-run" button in the header */
  onRerun?: () => void;
  isRerunning?: boolean;
}

export function PhaseShell({
  title,
  subtitle,
  badge,
  children,
  continueLabel,
  continueDescription,
  onContinue,
  onRerun,
  isRerunning = false,
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
          <div className="flex items-center gap-3">
            {/* Re-run button */}
            {onRerun && (
              <button
                onClick={onRerun}
                disabled={isRerunning}
                className="
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  border border-[#2a2a2a] text-xs text-[#a0a0a0]
                  hover:border-[#3a3a3a] hover:text-[#f0f0f0]
                  transition-colors duration-150
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                <RefreshCw className={`size-3 ${isRerunning ? "animate-spin" : ""}`} strokeWidth={1.5} />
                {isRerunning ? "Starting…" : "Re-run"}
              </button>
            )}
            {badge && <div>{badge}</div>}
          </div>
        </div>
      </div>

      {children}

      {/* What's Next card */}
      {continueLabel && onContinue && (
        <div className="page-load-item pt-2" style={{ animationDelay: "200ms" }}>
          <div className="rounded-xl border border-[#1A3D28]/60 bg-[#0A1F12]/40 p-5 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-mono tracking-widest text-[#C8FF00]/60 uppercase">
                What's next
              </span>
              <span className="text-sm font-semibold text-[#f0f0f0]">{continueLabel}</span>
              {continueDescription && (
                <span className="text-xs text-[#5a5a5a] leading-snug mt-0.5">
                  {continueDescription}
                </span>
              )}
            </div>
            <button
              onClick={onContinue}
              className="
                flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg
                bg-[#C8FF00] text-black text-sm font-semibold
                hover:bg-[#D4FF33] transition-colors duration-150
                active:scale-[0.98]
              "
            >
              Go
              <ArrowRight className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

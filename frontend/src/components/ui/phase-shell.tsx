// ─── PhaseShell ───────────────────────────────────────────────────────────────
// Consistent wrapper for all phase content panels.
// Provides the page-load header pattern with title, subtitle, optional badge,
// and an optional "What's Next" card at the bottom.

import type { ReactNode } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";

interface PhaseShellProps {
  title: string;
  subtitle: string;
  /** e.g. "Phase 3 — Market Intelligence" shown in mono above the title */
  phaseLabel?: string;
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
  phaseLabel,
  badge,
  children,
  continueLabel,
  continueDescription,
  onContinue,
  onRerun,
  isRerunning = false,
}: PhaseShellProps) {
  return (
    <div className="flex flex-col gap-8 pb-10 max-w-7xl mx-auto w-full">
      {/* Page header */}
      <div className="page-load-item" style={{ animationDelay: "0ms" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            {phaseLabel && (
              <p className="text-[10px] font-mono tracking-[0.12em] text-[#C8FF00]/40 uppercase mb-2">
                {phaseLabel}
              </p>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold text-[#f0f0f0] font-heading tracking-tight leading-tight">{title}</h1>
            <p className="text-sm text-[#5a5a5a] mt-1.5 leading-relaxed">{subtitle}</p>
          </div>
          <div className="flex items-center gap-3 pt-1 flex-shrink-0">
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
          <div
            className="rounded-2xl border border-[#1A3D28]/60 bg-[#0A1F12]/40 p-6 flex items-center justify-between gap-4"
            style={{
              boxShadow: "0 1px 0 0 rgba(200,255,0,0.04) inset, 0 4px 32px rgba(0,0,0,0.5), 0 0 60px rgba(200,255,0,0.03)",
            }}
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-mono tracking-[0.12em] text-[#C8FF00]/60 uppercase">
                What's next
              </span>
              <span className="text-base font-semibold text-[#f0f0f0] font-heading mt-0.5">{continueLabel}</span>
              {continueDescription && (
                <span className="text-sm text-[#5a5a5a] leading-snug mt-1">
                  {continueDescription}
                </span>
              )}
            </div>
            <button
              onClick={onContinue}
              className="
                flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl
                bg-[#C8FF00] text-black text-sm font-semibold
                hover:bg-[#D4FF33] transition-colors duration-150
                active:scale-[0.98] shadow-[0_0_30px_rgba(200,255,0,0.2)]
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

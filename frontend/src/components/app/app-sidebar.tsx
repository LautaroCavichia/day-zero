// ─── AppSidebar ───────────────────────────────────────────────────────────────
// Collapsible sidebar showing the 5 workflow phases.
// States per phase: active (chartreuse), done (muted green), locked (disabled), available.
// Phases 3 & 4 show a spinner + status text when background tasks are running.
// Phase 1 shows live interview state when a call is active.

import { useEffect, useRef, useState } from "react";
import { Check, Lock, Loader, Radio, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import type { PhaseStatuses } from "@/hooks/useSession";
import type { TaskStatusValue, WorkflowPhase } from "@/types/session";
import { WORKFLOW_PHASES } from "@/types/session";

interface AppSidebarProps {
  open: boolean;
  activePhase: WorkflowPhase;
  phaseStatuses: PhaseStatuses;
  onSelectPhase: (phase: WorkflowPhase) => void;
  marketIntelStatus?: TaskStatusValue;
  deliberationStatus?: TaskStatusValue;
  /** Number of completed debate rounds (for "Round N/3" subtitle) */
  debateRoundsCount?: number;
  /** Whether a live interview call is currently in progress */
  interviewIsActive?: boolean;
  /** Whether the interview has been completed at least once */
  interviewDone?: boolean;
  /** Company name to show in the bottom bar */
  companyName?: string;
}

// Dynamic subtitle for each phase
function phaseSubtitle(
  phase: WorkflowPhase,
  status: string,
  marketStatus?: TaskStatusValue,
  debateStatus?: TaskStatusValue,
  interviewIsActive?: boolean,
  interviewDone?: boolean,
  debateRoundsCount?: number,
): string | null {
  if (phase === 1) {
    if (interviewIsActive) return "Interview in progress";
    if (interviewDone && status !== "active") return "Completed";
  }
  if (phase === 3) {
    if (marketStatus === "running") return "Researching…";
    if (marketStatus === "failed") return "Research failed";
    if (marketStatus === "completed") return "Research complete";
  }
  if (phase === 4) {
    if (debateStatus === "running") {
      const n = debateRoundsCount ?? 0;
      return n > 0 ? `Round ${n + 1}/3 in progress…` : "Deliberating…";
    }
    if (debateStatus === "failed") return "Deliberation failed";
    if (debateStatus === "completed") return "Panel complete";
  }
  return null;
}

function taskIsRunning(phase: WorkflowPhase, marketStatus?: TaskStatusValue, debateStatus?: TaskStatusValue): boolean {
  return (phase === 3 && marketStatus === "running") || (phase === 4 && debateStatus === "running");
}

export default function AppSidebar({
  open,
  activePhase,
  phaseStatuses,
  onSelectPhase,
  marketIntelStatus,
  deliberationStatus,
  debateRoundsCount,
  interviewIsActive = false,
  interviewDone = false,
  companyName,
}: AppSidebarProps) {
  // Count completed phases for the progress indicator
  const doneCount = Object.values(phaseStatuses).filter((s) => s === "done").length;

  // Track newly-completed phases for the pop animation
  const prevStatuses = useRef<PhaseStatuses>({ ...phaseStatuses });
  const [poppingPhases, setPoppingPhases] = useState<Set<WorkflowPhase>>(new Set());

  useEffect(() => {
    const prev = prevStatuses.current;
    const newlyDone: WorkflowPhase[] = [];
    for (const { phase } of WORKFLOW_PHASES) {
      if (prev[phase] !== "done" && phaseStatuses[phase] === "done") {
        newlyDone.push(phase);
      }
    }
    prevStatuses.current = { ...phaseStatuses };

    if (newlyDone.length > 0) {
      setPoppingPhases((s) => {
        const next = new Set(s);
        newlyDone.forEach((p) => next.add(p));
        return next;
      });
      // Clear after animation completes (550ms)
      const timer = setTimeout(() => {
        setPoppingPhases((s) => {
          const next = new Set(s);
          newlyDone.forEach((p) => next.delete(p));
          return next;
        });
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [phaseStatuses]);

  return (
    <aside
      className={`
        fixed left-0 top-14 bottom-0 z-40 flex flex-col
        bg-[#0c0c0c] border-r border-[#1e1e1e]
        transition-all duration-300 ease-in-out
        ${open ? "w-64" : "w-16"}
        overflow-hidden
      `}
    >
      {/* Section label + dashboard link when open */}
      {open ? (
        <div className="px-5 py-3 border-b border-[#1e1e1e] flex items-center justify-between">
          <p className="text-xs font-mono tracking-widest text-[#5a5a5a] uppercase">
            Workflow
          </p>
          <Link
            to="/app"
            className="inline-flex items-center gap-1 text-[10px] font-mono text-[#3a3a3a] hover:text-[#C8FF00]/70 transition-colors"
          >
            <LayoutDashboard className="size-3" />
            Dashboard
          </Link>
        </div>
      ) : (
        /* Collapsed: dashboard icon at top */
        <div className="py-3 flex justify-center border-b border-[#1e1e1e]">
          <Link
            to="/app"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-[#3a3a3a] hover:text-[#C8FF00]/70 hover:bg-[#161616] transition-all"
            title="Back to Dashboard"
          >
            <LayoutDashboard className="size-4" />
          </Link>
        </div>
      )}

      {/* Phase list */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {WORKFLOW_PHASES.map(({ phase, label, description }) => {
          const status = phaseStatuses[phase];
          const isActive = phase === activePhase;
          const isLocked = status === "locked";
          const isDone = status === "done";
          const isAvailable = status === "available" || isActive;
          const running = taskIsRunning(phase, marketIntelStatus, deliberationStatus);
          const isInterviewLive = phase === 1 && interviewIsActive;

          const subtitle = phaseSubtitle(
            phase,
            status,
            marketIntelStatus,
            deliberationStatus,
            interviewIsActive,
            interviewDone,
            debateRoundsCount,
          );
          const hasFailed =
            (phase === 3 && marketIntelStatus === "failed") ||
            (phase === 4 && deliberationStatus === "failed");

          return (
            <button
              key={phase}
              disabled={isLocked}
              onClick={() => !isLocked && onSelectPhase(phase)}
              className={`
                relative w-full flex items-center gap-3 px-4 py-3
                text-left transition-all duration-200
                ${isLocked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                ${isActive
                  ? "bg-[rgba(200,255,0,0.06)] border-r-2 border-[#C8FF00]"
                  : isAvailable
                  ? "hover:bg-[#161616]"
                  : ""}
              `}
            >
              {/* Phase number / status icon */}
              <div
                className={`
                  flex-shrink-0 flex items-center justify-center
                  w-7 h-7 rounded-full border text-xs font-mono font-semibold
                  transition-colors duration-200
                  ${poppingPhases.has(phase) ? "phase-done-pop" : ""}
                  ${isActive
                    ? "bg-[#C8FF00] border-[#C8FF00] text-black"
                    : isDone
                    ? "bg-[#1A3D28] border-[#3D5A4A] text-[#C8FF00]"
                    : isLocked
                    ? "bg-transparent border-[#2a2a2a] text-[#3a3a3a]"
                    : running || isInterviewLive
                    ? "bg-transparent border-[#3a3a3a] text-[#5a5a5a]"
                    : "bg-transparent border-[#3a3a3a] text-[#a0a0a0]"}
                `}
              >
                {isDone ? (
                  <Check className="size-3" strokeWidth={2.5} />
                ) : isLocked ? (
                  <Lock className="size-3" strokeWidth={2} />
                ) : running ? (
                  <Loader className="size-3 animate-spin" strokeWidth={2} />
                ) : isInterviewLive ? (
                  <Radio className="size-3" strokeWidth={2} />
                ) : (
                  phase
                )}
              </div>

              {/* Label + description — only when sidebar is open */}
              {open && (
                <div className="flex-1 min-w-0">
                  <p
                    className={`
                      text-sm font-medium leading-tight truncate
                      ${isActive ? "text-[#f0f0f0]" : isLocked ? "text-[#3a3a3a]" : "text-[#a0a0a0]"}
                    `}
                  >
                    {label}
                  </p>
                  <p
                    className={`text-xs mt-0.5 truncate leading-tight transition-colors duration-300 ${
                      running || isInterviewLive
                        ? "text-[#C8FF00]/60"
                        : hasFailed
                        ? "text-red-400/60"
                        : "text-[#5a5a5a]"
                    }`}
                  >
                    {subtitle ?? description}
                  </p>
                </div>
              )}

              {/* Running/live dot indicator when collapsed */}
              {!open && (running || isInterviewLive) && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#C8FF00]/60 animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom — session info */}
      <div className="border-t border-[#1e1e1e]">
        {open ? (
          <div className="px-5 py-4 space-y-2">
            {/* Company name */}
            {companyName && (
              <p className="text-xs font-medium text-[#a0a0a0] truncate">{companyName}</p>
            )}
            {/* Progress row */}
            <div className="flex items-center justify-between">
              {interviewIsActive ? (
                <p className="text-xs text-[#C8FF00]/50 font-mono flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#C8FF00]/60 animate-pulse inline-block" />
                  Interview live
                </p>
              ) : (
                <p className="text-xs text-[#5a5a5a] font-mono">{doneCount}/5 complete</p>
              )}
              {/* Mini progress dots */}
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((p) => (
                  <span
                    key={p}
                    className={`w-1 h-1 rounded-full transition-colors duration-300 ${
                      phaseStatuses[p as WorkflowPhase] === "done"
                        ? "bg-[#C8FF00]/60"
                        : p === activePhase
                        ? "bg-[#C8FF00]/30"
                        : "bg-[#2a2a2a]"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Collapsed: just show progress dots vertically */
          <div className="py-3 flex flex-col items-center gap-1">
            {[1, 2, 3, 4, 5].map((p) => (
              <span
                key={p}
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                  phaseStatuses[p as WorkflowPhase] === "done"
                    ? "bg-[#C8FF00]/60"
                    : p === activePhase
                    ? "bg-[#C8FF00]/30"
                    : "bg-[#2a2a2a]"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

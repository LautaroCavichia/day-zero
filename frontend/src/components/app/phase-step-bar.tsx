// ─── PhaseStepBar ─────────────────────────────────────────────────────────────
// Horizontal phase stepper replacing the vertical sidebar.
// Shows all 5 workflow phases as a left-to-right journey with status icons,
// connectors, and scroll-on-overflow for narrow viewports.
// Steps are centered on wide screens and horizontally scrollable on narrow ones.

import { Check, Lock, Loader, Radio } from "lucide-react";
import type { PhaseStatuses } from "@/hooks/useSession";
import type { TaskStatusValue, WorkflowPhase } from "@/types/session";
import { WORKFLOW_PHASES } from "@/types/session";

// Stepper bar height — exported so AppLayout can sync paddingTop
export const STEPPER_HEIGHT = "3.5rem"; // 56px

interface PhaseStepBarProps {
  activePhase: WorkflowPhase;
  phaseStatuses: PhaseStatuses;
  onSelectPhase: (phase: WorkflowPhase) => void;
  marketIntelStatus?: TaskStatusValue;
  deliberationStatus?: TaskStatusValue;
  debateRoundsCount?: number;
  interviewIsActive?: boolean;
  interviewDone?: boolean;
}

function taskIsRunning(
  phase: WorkflowPhase,
  marketStatus?: TaskStatusValue,
  debateStatus?: TaskStatusValue,
): boolean {
  return (
    (phase === 3 && marketStatus === "running") ||
    (phase === 4 && debateStatus === "running")
  );
}

function phaseSubtitle(
  phase: WorkflowPhase,
  marketStatus?: TaskStatusValue,
  debateStatus?: TaskStatusValue,
  interviewIsActive?: boolean,
  interviewDone?: boolean,
  debateRoundsCount?: number,
): string | null {
  if (phase === 1) {
    if (interviewIsActive) return "Live";
    if (interviewDone) return "Done";
  }
  if (phase === 3) {
    if (marketStatus === "running") return "Researching…";
    if (marketStatus === "failed") return "Failed";
    if (marketStatus === "completed") return "Done";
  }
  if (phase === 4) {
    if (debateStatus === "running") {
      const n = debateRoundsCount ?? 0;
      return n > 0 ? `Round ${n + 1}/3` : "Deliberating…";
    }
    if (debateStatus === "failed") return "Failed";
    if (debateStatus === "completed") return "Done";
  }
  return null;
}

export default function PhaseStepBar({
  activePhase,
  phaseStatuses,
  onSelectPhase,
  marketIntelStatus,
  deliberationStatus,
  debateRoundsCount,
  interviewIsActive = false,
  interviewDone = false,
}: PhaseStepBarProps) {
  return (
    <div
      className="fixed left-0 right-0 z-40 bg-[#070707]/96 backdrop-blur-xl border-b border-[#242424] overflow-x-auto overflow-y-hidden scrollbar-none"
      style={{ top: "3.5rem", height: STEPPER_HEIGHT }}
    >
      {/* Subtle top highlight line */}
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(200,255,0,0.18) 25%, rgba(200,255,0,0.18) 75%, transparent 100%)",
        }}
      />

      {/* Steps — centered, min-width for overflow scroll */}
      <nav
        className="flex items-center justify-center h-full min-w-max mx-auto px-6 gap-1"
        aria-label="Workflow phases"
      >
        {WORKFLOW_PHASES.map(({ phase, label }, index) => {
          const status = phaseStatuses[phase];
          const isActive = phase === activePhase;
          const isLocked = status === "locked";
          const isDone = status === "done";
          const running = taskIsRunning(phase, marketIntelStatus, deliberationStatus);
          const isInterviewLive = phase === 1 && interviewIsActive;
          const hasFailed =
            (phase === 3 && marketIntelStatus === "failed") ||
            (phase === 4 && deliberationStatus === "failed");

          const subtitle = phaseSubtitle(
            phase,
            marketIntelStatus,
            deliberationStatus,
            interviewIsActive,
            interviewDone,
            debateRoundsCount,
          );

          const isClickable = !isLocked;

          return (
            <div key={phase} className="flex items-center">
              {/* Step button */}
              <button
                disabled={isLocked}
                onClick={() => isClickable && onSelectPhase(phase)}
                className={`
                  relative flex items-center gap-3 h-14 px-5
                  transition-all duration-200 group rounded-sm
                  ${isLocked ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
                  ${isActive
                    ? "opacity-100"
                    : !isLocked
                    ? "hover:opacity-90 hover:bg-white/[0.02]"
                    : ""}
                `}
                title={label}
              >
                {/* Phase icon — slightly larger */}
                <div
                  className={`
                    flex-shrink-0 flex items-center justify-center
                    w-6 h-6 rounded-full text-[11px] font-mono font-bold
                    transition-all duration-200
                    ${isActive
                      ? "bg-[#C8FF00] text-black shadow-[0_0_12px_rgba(200,255,0,0.4)]"
                      : isDone
                      ? "bg-[#1A3D28] border border-[#3D5A4A] text-[#C8FF00]"
                      : isLocked
                      ? "bg-transparent border border-[#282828] text-[#383838]"
                      : running || isInterviewLive
                      ? "bg-transparent border border-[#404040] text-[#606060]"
                      : "bg-transparent border border-[#383838] text-[#686868]"}
                  `}
                >
                  {isDone ? (
                    <Check className="w-3 h-3" strokeWidth={3} />
                  ) : isLocked ? (
                    <Lock className="w-3 h-3" strokeWidth={2} />
                  ) : running ? (
                    <Loader className="w-3 h-3 animate-spin" strokeWidth={2} />
                  ) : isInterviewLive ? (
                    <Radio className="w-3 h-3" strokeWidth={2} />
                  ) : (
                    phase
                  )}
                </div>

                {/* Label + optional subtitle */}
                <div className="flex flex-col items-start min-w-0">
                  <span
                    className={`
                      text-[13px] font-medium leading-tight whitespace-nowrap
                      transition-colors duration-200
                      ${isActive
                        ? "text-[#f0f0f0]"
                        : isDone
                        ? "text-[#5a5a5a]"
                        : isLocked
                        ? "text-[#333333]"
                        : "text-[#6e6e6e] group-hover:text-[#aaaaaa]"}
                    `}
                  >
                    {label}
                  </span>
                  {subtitle && (
                    <span
                      className={`
                        text-[10px] font-mono leading-tight whitespace-nowrap mt-0.5
                        ${running || isInterviewLive
                          ? "text-[#C8FF00]/70"
                          : hasFailed
                          ? "text-red-400/70"
                          : "text-[#484848]"}
                      `}
                    >
                      {subtitle}
                    </span>
                  )}
                  {/* Pulsing dot for running phases with no subtitle */}
                  {(running || isInterviewLive) && !subtitle && (
                    <span className="w-1 h-1 rounded-full bg-[#C8FF00]/70 animate-pulse mt-1" />
                  )}
                </div>

                {/* Active underline bar */}
                {isActive && (
                  <span
                    className="absolute bottom-0 left-4 right-4 h-[2px] rounded-t-full"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, #C8FF00 15%, #C8FF00 85%, transparent)",
                    }}
                  />
                )}

                {/* Running pulse underline */}
                {(running || isInterviewLive) && !isActive && (
                  <span
                    className="absolute bottom-0 left-4 right-4 h-[2px] rounded-t-full animate-pulse"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(200,255,0,0.5) 15%, rgba(200,255,0,0.5) 85%, transparent)",
                    }}
                  />
                )}
              </button>

              {/* Connector — skip after last item */}
              {index < WORKFLOW_PHASES.length - 1 && (
                <div className="flex-shrink-0 flex items-center mx-1" aria-hidden>
                  <svg
                    width="28"
                    height="2"
                    viewBox="0 0 28 2"
                    fill="none"
                  >
                    <line
                      x1="0"
                      y1="1"
                      x2="28"
                      y2="1"
                      stroke={
                        phaseStatuses[phase] === "done"
                          ? "#C8FF00"
                          : "#2e2e2e"
                      }
                      strokeWidth="1"
                      strokeDasharray="4 4"
                      strokeOpacity={phaseStatuses[phase] === "done" ? 0.45 : 1}
                    />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

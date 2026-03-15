// ─── AppSidebar ───────────────────────────────────────────────────────────────
// Collapsible sidebar showing the 5 workflow phases.
// States per phase: active (chartreuse), done (muted green), locked (disabled), available.

import { Check, Lock } from "lucide-react";
import type { PhaseStatuses } from "@/hooks/useSession";
import type { WorkflowPhase } from "@/types/session";
import { WORKFLOW_PHASES } from "@/types/session";

interface AppSidebarProps {
  open: boolean;
  activePhase: WorkflowPhase;
  phaseStatuses: PhaseStatuses;
  onSelectPhase: (phase: WorkflowPhase) => void;
}

export default function AppSidebar({
  open,
  activePhase,
  phaseStatuses,
  onSelectPhase,
}: AppSidebarProps) {
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
      {/* Section label */}
      {open && (
        <div className="px-5 py-4 border-b border-[#1e1e1e]">
          <p className="text-xs font-mono tracking-widest text-[#5a5a5a] uppercase">
            Workflow
          </p>
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

          return (
            <button
              key={phase}
              disabled={isLocked}
              onClick={() => !isLocked && onSelectPhase(phase)}
              className={`
                w-full flex items-center gap-3 px-4 py-3
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
                  ${isActive
                    ? "bg-[#C8FF00] border-[#C8FF00] text-black"
                    : isDone
                    ? "bg-[#1A3D28] border-[#3D5A4A] text-[#C8FF00]"
                    : isLocked
                    ? "bg-transparent border-[#2a2a2a] text-[#3a3a3a]"
                    : "bg-transparent border-[#3a3a3a] text-[#a0a0a0]"}
                `}
              >
                {isDone ? (
                  <Check className="size-3" strokeWidth={2.5} />
                ) : isLocked ? (
                  <Lock className="size-3" strokeWidth={2} />
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
                  <p className="text-xs text-[#5a5a5a] mt-0.5 truncate leading-tight">
                    {description}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom — session info when open */}
      {open && (
        <div className="px-5 py-4 border-t border-[#1e1e1e]">
          <p className="text-xs text-[#5a5a5a] font-mono">Phase {activePhase} of 5</p>
        </div>
      )}
    </aside>
  );
}

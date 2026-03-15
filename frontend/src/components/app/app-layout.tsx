// ─── AppLayout ────────────────────────────────────────────────────────────────
// Root layout for the app workspace.
// Provides: fixed AppNav, collapsible AppSidebar, scrollable main content area.

import { useState, type ReactNode } from "react";
import AppNav from "@/components/app/app-nav";
import AppSidebar from "@/components/app/app-sidebar";
import GrainOverlay from "@/components/shared/grain-overlay";
import type { PhaseStatuses } from "@/hooks/useSession";
import type { TaskStatusValue, WorkflowPhase } from "@/types/session";

interface AppLayoutProps {
  children: ReactNode;
  sessionName?: string;
  activePhase: WorkflowPhase;
  phaseStatuses: PhaseStatuses;
  onSelectPhase: (phase: WorkflowPhase) => void;
  marketIntelStatus?: TaskStatusValue;
  deliberationStatus?: TaskStatusValue;
  /** Number of completed debate rounds (for Round N/3 in sidebar) */
  debateRoundsCount?: number;
  /** Whether a live interview call is currently in progress */
  interviewIsActive?: boolean;
  /** Whether the interview has been completed at least once */
  interviewDone?: boolean;
  /** Elapsed seconds of the current (or last) interview call */
  interviewElapsed?: number;
}

export default function AppLayout({
  children,
  sessionName,
  activePhase,
  phaseStatuses,
  onSelectPhase,
  marketIntelStatus,
  deliberationStatus,
  debateRoundsCount,
  interviewIsActive = false,
  interviewDone = false,
}: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <GrainOverlay />

      <AppNav
        sessionName={sessionName}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <AppSidebar
        open={sidebarOpen}
        activePhase={activePhase}
        phaseStatuses={phaseStatuses}
        onSelectPhase={onSelectPhase}
        marketIntelStatus={marketIntelStatus}
        deliberationStatus={deliberationStatus}
        debateRoundsCount={debateRoundsCount}
        interviewIsActive={interviewIsActive}
        interviewDone={interviewDone}
      />

      {/* Main content — offset for nav (top-14) and sidebar width */}
      <main
        className={`
          min-h-screen pt-14 transition-all duration-300
          ${sidebarOpen ? "pl-64" : "pl-16"}
        `}
      >
        <div className="h-full p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

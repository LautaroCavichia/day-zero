// ─── AppLayout ────────────────────────────────────────────────────────────────
// Root layout for the app workspace.
// Provides: fixed AppNav (h-14), horizontal PhaseStepBar (h-12),
// ambient gradient background, and scrollable main content area.
// The vertical sidebar has been replaced by the horizontal stepper for
// a clearer step-by-step UX with more horizontal content space.

import { type ReactNode } from "react";
import AppNav from "@/components/app/app-nav";
import PhaseStepBar from "@/components/app/phase-step-bar";
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
  /** Number of completed debate rounds (for Round N/3 in stepper) */
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
  return (
    <div className="h-screen overflow-hidden bg-background text-foreground">
      <GrainOverlay />

      {/* ── Ambient background glow ─────────────────────────────────────── */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "linear-gradient(to top right, rgba(200,255,0,0.05) 0%, transparent 50%)",
        }}
      />

      {/* ── Fixed nav ── */}
      <AppNav sessionName={sessionName} />

      {/* ── Horizontal phase stepper ── */}
      <PhaseStepBar
        activePhase={activePhase}
        phaseStatuses={phaseStatuses}
        onSelectPhase={onSelectPhase}
        marketIntelStatus={marketIntelStatus}
        deliberationStatus={deliberationStatus}
        debateRoundsCount={debateRoundsCount}
        interviewIsActive={interviewIsActive}
        interviewDone={interviewDone}
      />

      {/* ── Main content — offset for nav (3.5rem) + stepper (3.5rem) ── */}
      <main className="relative z-10 h-screen overflow-hidden" style={{ paddingTop: "7rem" }}>
        <div className="h-full px-8 py-6 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

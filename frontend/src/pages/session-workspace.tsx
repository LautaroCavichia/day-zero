// ─── SessionWorkspace ─────────────────────────────────────────────────────────
// Route: /app/session/:id
// The main workspace UI. Loads the session, renders the AppLayout with
// sidebar, and shows the appropriate phase panel.
//
// Phase 1 (Live Interview) is the only implemented phase so far.
// Phases 2–5 render a placeholder "coming soon" card until built out.

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/app/app-layout";
import LiveInterview from "@/components/session/live-interview";
import { useSession } from "@/hooks/useSession";
import type { WorkflowPhase } from "@/types/session";
import { Lock } from "lucide-react";

// ─── Placeholder for phases 2–5 ───────────────────────────────────────────────
function PhasePlaceholder({ phase }: { phase: WorkflowPhase }) {
  const labels: Record<WorkflowPhase, string> = {
    1: "Live Interview",
    2: "Deck Analysis",
    3: "Market Validation",
    4: "VC Deliberation",
    5: "Verdict",
  };
  const descriptions: Record<WorkflowPhase, string> = {
    1: "Voice interview with Sam",
    2: "AI critique of your pitch deck",
    3: "Real-time market & competitor intelligence",
    4: "Panel of AI investors debate your startup",
    5: "Investment decision and coaching report",
  };

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center px-6">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[#161616] border border-[#1e1e1e]">
        <Lock className="size-5 text-[#3a3a3a]" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-[#f0f0f0] mb-1">
          Phase {phase}: {labels[phase]}
        </h2>
        <p className="text-sm text-[#5a5a5a] max-w-xs">{descriptions[phase]}</p>
      </div>
      <p className="text-xs font-mono text-[#3a3a3a]">
        Complete Phase 1 to unlock this phase.
      </p>
    </div>
  );
}

// ─── Main workspace ────────────────────────────────────────────────────────────
export default function SessionWorkspace() {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const session = useSession();

  // Load session on mount
  useEffect(() => {
    if (!sessionId) {
      navigate("/app");
      return;
    }
    session.loadSession(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Redirect to /app if session not found after load attempt
  useEffect(() => {
    if (!session.isLoading && session.error && !session.sessionState) {
      navigate("/app");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isLoading, session.error, session.sessionState]);

  // ─── Handle interview ended → advance to phase 2 ──────────────────────────
  const handleInterviewEnded = () => {
    session.refresh();
    session.setActivePhase(2);
  };

  // ─── Phase panel renderer ─────────────────────────────────────────────────
  const renderPhase = () => {
    if (!sessionId) return null;

    switch (session.activePhase) {
      case 1:
        return (
          <LiveInterview
            sessionId={sessionId}
            onInterviewEnded={handleInterviewEnded}
          />
        );
      case 2:
      case 3:
      case 4:
      case 5:
        return <PhasePlaceholder phase={session.activePhase} />;
    }
  };

  // ─── Loading state ────────────────────────────────────────────────────────
  if (session.isLoading && !session.sessionState) {
    return (
      <div className="dark min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-[#5a5a5a]">
          <div className="w-4 h-4 rounded-full border-2 border-[#1e1e1e] border-t-[#C8FF00] animate-spin" />
          Loading session...
        </div>
      </div>
    );
  }

  return (
    <div className="dark">
      <AppLayout
        sessionName={sessionId ? `Session ${sessionId.slice(0, 8)}` : undefined}
        activePhase={session.activePhase}
        phaseStatuses={session.phaseStatuses}
        onSelectPhase={(phase: WorkflowPhase) => session.setActivePhase(phase)}
      >
        {renderPhase()}
      </AppLayout>
    </div>
  );
}

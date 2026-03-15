// ─── SessionWorkspace ─────────────────────────────────────────────────────────
// Route: /app/session/:id
// The main workspace UI. Loads the session, renders the AppLayout with
// sidebar, and shows the appropriate phase panel.
//
// Navigation guards:
//   - While an interview is active, clicking another phase shows a confirm dialog.
//   - Returning to Phase 1 after a completed interview shows the post-interview view.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import AppLayout from "@/components/app/app-layout";
import LiveInterview from "@/components/session/live-interview";
import type { InterviewLifecycle } from "@/components/session/live-interview";
import DeckAnalysis from "@/components/session/deck-analysis";
import MarketIntelComponent from "@/components/session/market-intel";
import DeliberationComponent from "@/components/session/deliberation";
import VerdictComponent from "@/components/session/verdict";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { PhaseToastContainer } from "@/components/ui/phase-toast";
import { useSession } from "@/hooks/useSession";
import { usePhaseNotifications } from "@/hooks/usePhaseNotifications";
import { api } from "@/services/api";
import type { WorkflowPhase } from "@/types/session";
import { WORKFLOW_PHASES } from "@/types/session";

// ─── Phase content wrapper with entrance animation ────────────────────────────
function PhasePanel({
  phaseKey,
  children,
}: {
  phaseKey: string;
  children: React.ReactNode;
}) {
  return (
    <div
      key={phaseKey}
      className="h-full animate-[phase-enter_0.35s_cubic-bezier(0.22,1,0.36,1)_both]"
    >
      {children}
    </div>
  );
}

// ─── Main workspace ────────────────────────────────────────────────────────────
export default function SessionWorkspace() {
  const { id: sessionId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const session = useSession();

  // Phase completion notifications
  const { toasts, dismiss } = usePhaseNotifications(
    session.sessionState?.market_intel_status?.status,
    session.sessionState?.deliberation_status?.status,
    useCallback(() => session.setActivePhase(3), [session]),
    useCallback(() => session.setActivePhase(5), [session]),
  );

  // Track whether an interview call is currently live (for nav guard)
  const [interviewIsActive, setInterviewIsActive] = useState(false);

  // Local trigger error state for market intel and deliberation
  const [marketTriggerError, setMarketTriggerError] = useState<string | null>(null);
  const [deliberationTriggerError, setDeliberationTriggerError] = useState<string | null>(null);

  // Navigation guard: if user clicks a phase while interview is active,
  // store the requested phase here and show a confirm dialog first
  const [pendingPhase, setPendingPhase] = useState<WorkflowPhase | null>(null);

  // Track the lifecycle to pass to LiveInterview when mounting / re-mounting
  // "pre" = first time or after redo, "post" = returning after completed interview
  const [interviewLifecycle, setInterviewLifecycle] = useState<InterviewLifecycle>("pre");
  const interviewDoneRef = useRef(false); // whether a full interview has been done this session

  // ─── Load session on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      navigate("/app");
      return;
    }
    session.loadSession(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ─── Redirect to /app if session not found ────────────────────────────────
  useEffect(() => {
    if (!session.isLoading && session.error && !session.sessionState) {
      navigate("/app");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.isLoading, session.error, session.sessionState]);

  // ─── Derive initial interview lifecycle from session state ────────────────
  // When the session loads and already has a transcript, the interview was done.
  useEffect(() => {
    if (!session.sessionState) return;
    const hasTranscript = (session.sessionState.live_transcript?.length ?? 0) > 0;
    if (hasTranscript && !interviewDoneRef.current) {
      interviewDoneRef.current = true;
      // Only switch to post if we're still on phase 1
      if (session.activePhase === 1) {
        setInterviewLifecycle("post");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.sessionState]);

  // ─── Handle interview ended (live call finished) ───────────────────────────
  const handleInterviewEnded = useCallback(() => {
    interviewDoneRef.current = true;
    session.refresh();
    session.startPolling();
  }, [session]);

  // ─── Handle "Continue to Deck Analysis" from post-interview view ──────────
  const handleInterviewContinue = useCallback(() => {
    session.setActivePhase(2);
  }, [session]);

  // ─── Phase selection with nav guard ───────────────────────────────────────
  const handleSelectPhase = useCallback(
    (phase: WorkflowPhase) => {
      if (interviewIsActive) {
        // Block navigation — show confirm dialog
        setPendingPhase(phase);
        return;
      }

      // If navigating back to phase 1 after interview completed, show post view
      if (phase === 1 && interviewDoneRef.current) {
        setInterviewLifecycle("post");
      } else if (phase === 1) {
        setInterviewLifecycle("pre");
      }

      session.setActivePhase(phase);
    },
    [interviewIsActive, session]
  );

  // ─── Confirm navigation away from active call ─────────────────────────────
  const handleNavConfirm = useCallback(() => {
    // The interview component's own end-call logic handles WebSocket cleanup
    // when it unmounts (via cleanup in useLiveInterview effect). We just navigate.
    const target = pendingPhase!;
    setPendingPhase(null);
    setInterviewIsActive(false);

    if (target === 1 && interviewDoneRef.current) {
      setInterviewLifecycle("post");
    } else if (target === 1) {
      setInterviewLifecycle("pre");
    }

    session.setActivePhase(target);
  }, [pendingPhase, session]);

  const handleNavCancel = useCallback(() => {
    setPendingPhase(null);
  }, []);

  // ─── Phase panel renderer ─────────────────────────────────────────────────
  const renderPhase = () => {
    if (!sessionId) return null;

    switch (session.activePhase) {
      case 1:
        return (
          <LiveInterview
            key={interviewLifecycle === "pre" ? "pre" : "post-or-active"}
            sessionId={sessionId}
            slideCount={session.sessionState?.slide_count ?? 0}
            initialLifecycle={interviewLifecycle}
            savedTranscript={session.sessionState?.live_transcript ?? []}
            savedScores={session.sessionState?.delivery_scores ?? null}
            deckCritique={session.sessionState?.deck_critique ?? null}
            onInterviewEnded={handleInterviewEnded}
            onContinue={handleInterviewContinue}
            onActiveStateChange={setInterviewIsActive}
            onUploadDeck={async (file: File) => {
              await api.uploadDeck(sessionId!, file);
              session.refresh();
            }}
          />
        );
      case 2:
        return (
          <DeckAnalysis
            critique={session.sessionState?.deck_critique ?? null}
            sessionId={sessionId!}
            isLoading={session.isLoading && !session.sessionState}
            onContinue={() => session.setActivePhase(3)}
            continueLabel="Run Market Research"
            continueDescription="Deep-dive competitor mapping, market sizing, and timing signals — powered by Google Search grounding."
            onReupload={async (file: File) => {
              await api.uploadDeck(sessionId!, file);
              session.refresh();
            }}
          />
        );
      case 3:
        return (
          <MarketIntelComponent
            marketIntel={session.sessionState?.market_intel ?? null}
            status={session.sessionState?.market_intel_status?.status ?? "idle"}
            statusError={session.sessionState?.market_intel_status?.error ?? marketTriggerError}
            canTrigger={
              !!session.sessionState?.pitch_context &&
              Object.values(session.sessionState.pitch_context).some(Boolean) &&
              !!session.sessionState?.deck_analysis_done
            }
            onTrigger={async () => {
              try {
                setMarketTriggerError(null);
                await api.triggerMarketValidation(sessionId);
                session.startPolling();
              } catch (e) {
                setMarketTriggerError(e instanceof Error ? e.message : "Failed to start market research");
              }
            }}
            onRerun={async () => {
              try {
                setMarketTriggerError(null);
                await api.triggerMarketValidation(sessionId);
                session.startPolling();
              } catch (e) {
                setMarketTriggerError(e instanceof Error ? e.message : "Failed to restart market research");
              }
            }}
            onContinue={() => session.setActivePhase(4)}
            nextPhaseLabel="Start VC Deliberation"
            nextPhaseDescription="Three AI investors — Paul, Elad, and Keith — debate your startup across 3 adversarial rounds to reach an investment decision."
          />
        );
      case 4:
        return (
          <DeliberationComponent
            rounds={session.sessionState?.debate_rounds ?? []}
            status={session.sessionState?.deliberation_status?.status ?? "idle"}
            statusError={session.sessionState?.deliberation_status?.error ?? deliberationTriggerError}
            canTrigger={
              !!session.sessionState?.pitch_context &&
              Object.values(session.sessionState.pitch_context).some(Boolean) &&
              !!session.sessionState?.deck_analysis_done
            }
            onTrigger={async () => {
              try {
                setDeliberationTriggerError(null);
                await api.triggerDeliberation(sessionId);
                session.startPolling();
              } catch (e) {
                setDeliberationTriggerError(e instanceof Error ? e.message : "Failed to start deliberation");
              }
            }}
            onRerun={async () => {
              try {
                setDeliberationTriggerError(null);
                await api.triggerDeliberation(sessionId);
                session.startPolling();
              } catch (e) {
                setDeliberationTriggerError(e instanceof Error ? e.message : "Failed to restart deliberation");
              }
            }}
            onContinue={() => session.setActivePhase(5)}
            nextPhaseLabel="View Final Verdict"
            nextPhaseDescription="See the panel's investment decision, your weighted score, and actionable next steps."
          />
        );
      case 5:
        return (
          <VerdictComponent
            verdict={session.sessionState?.final_verdict ?? null}
            deliberationStatus={session.sessionState?.deliberation_status?.status ?? "idle"}
          />
        );
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

  const sessionLabel =
    session.sessionState?.session_name?.trim() ||
    session.sessionState?.pitch_context?.company_name?.trim() ||
    (sessionId ? `Session ${sessionId.slice(0, 8)}` : undefined);

  return (
    <div className="dark">
      <AppLayout
        sessionName={sessionLabel}
        activePhase={session.activePhase}
        phaseStatuses={session.phaseStatuses}
        onSelectPhase={handleSelectPhase}
        marketIntelStatus={session.sessionState?.market_intel_status?.status}
        deliberationStatus={session.sessionState?.deliberation_status?.status}
        debateRoundsCount={session.sessionState?.debate_rounds?.length ?? 0}
        interviewIsActive={interviewIsActive}
        interviewDone={interviewDoneRef.current}
      >
        <PhasePanel phaseKey={String(session.activePhase)}>
          {renderPhase()}
        </PhasePanel>
      </AppLayout>

      {/* ── Prev / Next phase chevrons ─────────────────────────────────── */}
      {(() => {
        const phases = WORKFLOW_PHASES.map((p) => p.phase) as WorkflowPhase[];
        const currentIdx = phases.indexOf(session.activePhase);
        const prevPhase = currentIdx > 0 ? phases[currentIdx - 1] : null;
        const nextPhase = currentIdx < phases.length - 1 ? phases[currentIdx + 1] : null;
        const nextLocked = nextPhase ? session.phaseStatuses[nextPhase] === "locked" : true;

        return (
          <>
            {/* Left — previous */}
            {prevPhase !== null && (
              <button
                onClick={() => handleSelectPhase(prevPhase)}
                className="
                  fixed left-4 z-50 flex items-center justify-center
                  text-chartreuse hover:text-chartreuse-hover
                  transition-all duration-200 hover:scale-110
                  drop-shadow-[0_0_8px_rgba(200,255,0,0.3)]
                "
                style={{ top: "calc(3.5rem + 3.5rem + 50vh - 1.25rem)" }}
                title="Previous phase"
                aria-label="Previous phase"
              >
                <ChevronLeft className="w-10 h-10" strokeWidth={1.5} />
              </button>
            )}

            {/* Right — next */}
            {nextPhase !== null && !nextLocked && (
              <button
                onClick={() => handleSelectPhase(nextPhase)}
                className="
                  fixed right-4 z-50 flex items-center justify-center
                  text-chartreuse hover:text-chartreuse-hover
                  transition-all duration-200 hover:scale-110
                  drop-shadow-[0_0_8px_rgba(200,255,0,0.3)]
                "
                style={{ top: "calc(3.5rem + 3.5rem + 50vh - 1.25rem)" }}
                title="Next phase"
                aria-label="Next phase"
              >
                <ChevronRight className="w-10 h-10" strokeWidth={1.5} />
              </button>
            )}
          </>
        );
      })()}

      {/* Navigation-away confirm dialog */}
      <ConfirmDialog
        open={pendingPhase !== null}
        title="Leave interview?"
        message="Your interview is still in progress. Leaving now will end the call. Your transcript so far will be saved."
        confirmLabel="End & Leave"
        cancelLabel="Stay in Interview"
        variant="danger"
        onConfirm={handleNavConfirm}
        onCancel={handleNavCancel}
      />

      {/* Phase completion toasts */}
      <PhaseToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

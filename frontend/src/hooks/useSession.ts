// ─── useSession ───────────────────────────────────────────────────────────────
// Manages DayZero session lifecycle: create, load, poll, and derive phase statuses.

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import type { SessionState, PhaseStatus, WorkflowPhase } from "@/types/session";

export interface PhaseStatuses {
  1: PhaseStatus;
  2: PhaseStatus;
  3: PhaseStatus;
  4: PhaseStatus;
  5: PhaseStatus;
}

export interface UseSessionReturn {
  sessionId: string | null;
  sessionState: SessionState | null;
  phaseStatuses: PhaseStatuses;
  activePhase: WorkflowPhase;
  isLoading: boolean;
  error: string | null;
  createSession: () => Promise<string>;
  loadSession: (id: string) => Promise<void>;
  setActivePhase: (phase: WorkflowPhase) => void;
  refresh: () => Promise<void>;
  startPolling: () => void;
}

const POLL_INTERVAL_MS = 3000;

function derivePhaseStatuses(
  state: SessionState | null,
  active: WorkflowPhase
): PhaseStatuses {
  if (!state) {
    return { 1: "active", 2: "locked", 3: "locked", 4: "locked", 5: "locked" };
  }

  const hasPitch = !!state.pitch_context;
  const hasTranscript = state.live_transcript && state.live_transcript.length > 0;
  const marketDone = state.market_intel_status?.status === "completed";
  const deliberationDone = state.deliberation_status?.status === "completed";
  const hasVerdict = !!state.final_verdict;

  const status = (phase: WorkflowPhase): PhaseStatus => {
    if (phase === active) return "active";
    switch (phase) {
      case 1:
        return hasTranscript ? "done" : "available";
      case 2:
        // Phase 2 is always available — user can upload a deck at any time.
        return state.deck_analysis_done ? "done" : "available";
      case 3:
        if (!hasPitch && !hasTranscript) return "locked";
        return marketDone ? "done" : "available";
      case 4:
        // Deliberation auto-fires after interview ends, independent of market intel.
        // Unlock as soon as pitch_context is populated.
        if (!hasPitch) return "locked";
        return deliberationDone ? "done" : "available";
      case 5:
        if (!deliberationDone) return "locked";
        return hasVerdict ? "done" : "available";
    }
  };

  return { 1: status(1), 2: status(2), 3: status(3), 4: status(4), 5: status(5) };
}

export function useSession(): UseSessionReturn {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [activePhase, setActivePhase] = useState<WorkflowPhase>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  const fetchState = useCallback(async (id: string) => {
    try {
      const state = await api.getSession(id);
      if (isMounted.current) setSessionState(state);
    } catch (err) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : "Failed to load session");
      }
    }
  }, []);

  // Poll while tasks are running
  const schedulePolling = useCallback(
    (id: string) => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      pollTimerRef.current = setTimeout(async () => {
        if (!isMounted.current) return;
        await fetchState(id);

        // Keep polling if background tasks are still running
        const state = await api.getSession(id).catch(() => null);
        if (!state || !isMounted.current) return;
        const marketRunning = state.market_intel_status?.status === "running";
        const debateRunning = state.deliberation_status?.status === "running";
        if (marketRunning || debateRunning) {
          schedulePolling(id);
        }
      }, POLL_INTERVAL_MS);
    },
    [fetchState]
  );

  const createSession = useCallback(async (): Promise<string> => {
    setIsLoading(true);
    setError(null);
    try {
      const { session_id } = await api.createSession();
      if (isMounted.current) {
        setSessionId(session_id);
        setSessionState(null);
        setActivePhase(1);
      }
      return session_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create session";
      if (isMounted.current) setError(msg);
      throw err;
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  const loadSession = useCallback(
    async (id: string) => {
      setIsLoading(true);
      setError(null);
      setSessionId(id);
      try {
        await fetchState(id);
        schedulePolling(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load session";
        if (isMounted.current) setError(msg);
      } finally {
        if (isMounted.current) setIsLoading(false);
      }
    },
    [fetchState, schedulePolling]
  );

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    await fetchState(sessionId);
  }, [sessionId, fetchState]);

  // Manually kick off polling (e.g. after interview ends to watch background tasks)
  const startPolling = useCallback(() => {
    if (!sessionId) return;
    schedulePolling(sessionId);
  }, [sessionId, schedulePolling]);

  const phaseStatuses = derivePhaseStatuses(sessionState, activePhase);

  return {
    sessionId,
    sessionState,
    phaseStatuses,
    activePhase,
    isLoading,
    error,
    createSession,
    loadSession,
    setActivePhase,
    refresh,
    startPolling,
  };
}

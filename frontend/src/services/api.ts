// ─── DayZero REST API Client — DEMO MODE ─────────────────────────────────────
// All calls return mock data from an in-memory store. No backend required.

import type {
  CreateSessionResponse,
  SessionState,
  UploadDeckResponse,
  SlidesResponse,
  CoachingResponse,
  TrainingReview,
  VerdictResponse,
  DebateResponse,
  SourcesResponse,
  TaskStartedResponse,
  ListSessionsResponse,
  SessionSummary,
  DeckCritique,
} from "@/types/session";

// ─── In-memory session store (persisted to localStorage) ─────────────────────

const STORAGE_KEY = "dayzero_demo_sessions";

interface StoredSession {
  session_id: string;
  created_at: number;
  updated_at: number;
  session_name: string;
  pitch_context: Record<string, string> | null;
  slide_count: number;
  deck_critique: DeckCritique | null;
  uploaded_file_name: string | null;
}

function loadStore(): Map<string, StoredSession> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const arr: StoredSession[] = JSON.parse(raw);
    return new Map(arr.map((s) => [s.session_id, s]));
  } catch {
    return new Map();
  }
}

function saveStore(store: Map<string, StoredSession>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...store.values()]));
}

const sessionStore = loadStore();

function generateId(): string {
  return "demo-" + crypto.randomUUID().slice(0, 12);
}

// Small async delay to simulate network latency (feels more realistic)
const delay = (ms = 150) => new Promise((r) => setTimeout(r, ms));

// ─── Mock DeckCritique factory ───────────────────────────────────────────────

function makeFakeDeckCritique(slideCount: number): DeckCritique {
  const slides = Array.from({ length: slideCount }, (_, i) => ({
    index: i,
    title: `Slide ${i + 1}`,
    content_text: "Demo slide content",
    critique: "This is a demo — upload your real deck for detailed AI feedback.",
    score: 7,
  }));

  return {
    narrative_arc_score: 7.5,
    visual_clarity_score: 7.0,
    slide_count: slideCount,
    slides,
    missing_slides: [],
    top_issues: ["Demo mode — no real analysis available"],
    strengths: ["Your deck was uploaded successfully"],
    overall_summary: "This is a demo session. Deploy with a backend for full AI-powered deck analysis.",
  };
}

// ─── Build SessionState from stored session ─────────────────────────────────

function toSessionState(s: StoredSession): SessionState {
  return {
    session_name: s.session_name,
    pitch_context: s.pitch_context as SessionState["pitch_context"],
    live_transcript: [],
    delivery_scores: null,
    deck_critique: s.deck_critique,
    market_intel: null,
    debate_rounds: [],
    final_verdict: null,
    live_interview_active: false,
    deck_analysis_done: !!s.deck_critique,
    slide_count: s.slide_count,
    pitch_submitted_at: null,
    market_intel_status: { status: "idle", error: null },
    deliberation_status: { status: "idle", error: null },
  };
}

// ─── Build SessionSummary from stored session ───────────────────────────────

function toSessionSummary(s: StoredSession): SessionSummary {
  return {
    session_id: s.session_id,
    created_at: s.created_at,
    updated_at: s.updated_at,
    session_name: s.session_name,
    company_name: s.pitch_context?.company_name ?? "",
    one_liner: s.pitch_context?.one_liner ?? "",
    stage: s.pitch_context?.stage ?? "",
    verdict_decision: null,
    weighted_score: null,
    deck_analysis_done: !!s.deck_critique,
    market_intel_status: "idle",
    deliberation_status: "idle",
    live_interview_active: false,
    transcript_turns: 0,
  };
}

// ─── Demo API ─────────────────────────────────────────────────────────────────

export const api = {
  // List all sessions
  listSessions: async (): Promise<ListSessionsResponse> => {
    await delay();
    return { sessions: [...sessionStore.values()].map(toSessionSummary) };
  },

  // Create a new session
  createSession: async (): Promise<CreateSessionResponse> => {
    await delay(200);
    const id = generateId();
    const now = Date.now() / 1000;
    const session: StoredSession = {
      session_id: id,
      created_at: now,
      updated_at: now,
      session_name: "",
      pitch_context: null,
      slide_count: 0,
      deck_critique: null,
      uploaded_file_name: null,
    };
    sessionStore.set(id, session);
    saveStore(sessionStore);
    return { session_id: id };
  },

  // Get full session state
  getSession: async (sessionId: string): Promise<SessionState> => {
    await delay(100);
    const s = sessionStore.get(sessionId);
    if (!s) {
      // Return a blank session rather than throwing — avoids redirect-to-dashboard
      return toSessionState({
        session_id: sessionId,
        created_at: Date.now() / 1000,
        updated_at: Date.now() / 1000,
        session_name: "Demo Session",
        pitch_context: null,
        slide_count: 0,
        deck_critique: null,
        uploaded_file_name: null,
      });
    }
    return toSessionState(s);
  },

  // Delete a session
  deleteSession: async (sessionId: string): Promise<void> => {
    await delay(100);
    sessionStore.delete(sessionId);
    saveStore(sessionStore);
  },

  // Update session metadata
  updateSession: async (
    sessionId: string,
    updates: { session_name?: string; pitch_context?: Record<string, string> }
  ): Promise<{ status: string; session_id: string; session_name: string }> => {
    await delay(150);
    const s = sessionStore.get(sessionId);
    if (s) {
      if (updates.session_name !== undefined) s.session_name = updates.session_name;
      if (updates.pitch_context) s.pitch_context = { ...(s.pitch_context ?? {}), ...updates.pitch_context };
      s.updated_at = Date.now() / 1000;
      sessionStore.set(sessionId, s);
      saveStore(sessionStore);
    }
    return {
      status: "ok",
      session_id: sessionId,
      session_name: updates.session_name ?? s?.session_name ?? "",
    };
  },

  // ─── Analysis ───────────────────────────────────────────────────────────────

  // Upload pitch deck (simulated)
  uploadDeck: async (sessionId: string, file: File): Promise<UploadDeckResponse> => {
    // Simulate a realistic upload+analysis delay
    await delay(1500);
    const slideCount = 5; // Fake 5 slides
    const critique = makeFakeDeckCritique(slideCount);

    const s = sessionStore.get(sessionId);
    if (s) {
      s.slide_count = slideCount;
      s.deck_critique = critique;
      s.uploaded_file_name = file.name;
      s.updated_at = Date.now() / 1000;
      sessionStore.set(sessionId, s);
      saveStore(sessionStore);
    }

    return { status: "ok", deck_critique: critique };
  },

  // Submit typed pitch text
  submitPitch: async (sessionId: string, _pitchText: string): Promise<SessionState> => {
    await delay();
    return api.getSession(sessionId);
  },

  // Get slide count
  getSlides: async (_sessionId: string): Promise<SlidesResponse> => {
    await delay();
    return { count: 0 };
  },

  // ─── Market + Deliberation ──────────────────────────────────────────────────

  triggerMarketValidation: async (_sessionId: string): Promise<TaskStartedResponse> => {
    await delay();
    return { status: "started", message: "Demo mode — market validation simulated" };
  },

  triggerDeliberation: async (_sessionId: string): Promise<TaskStartedResponse> => {
    await delay();
    return { status: "started", message: "Demo mode — deliberation simulated" };
  },

  // ─── Results ────────────────────────────────────────────────────────────────

  getVerdict: async (_sessionId: string): Promise<VerdictResponse> => {
    await delay();
    return {
      decision: "SOFT PASS",
      weighted_score: 0,
      score_breakdown: {
        problem_clarity: 0,
        market_size: 0,
        solution_strength: 0,
        team: 0,
        traction: 0,
        delivery: 0,
      },
      strengths: [],
      risks: [],
      recommended_pivot: null,
      next_steps: [],
      investment_thesis: "",
      all_sources: [],
    };
  },

  getDebate: async (_sessionId: string): Promise<DebateResponse> => {
    await delay();
    return { debate_rounds: [], status: "idle" };
  },

  getSources: async (_sessionId: string): Promise<SourcesResponse> => {
    await delay();
    return { sources: [] };
  },

  // ─── Coaching ───────────────────────────────────────────────────────────────

  getCoachingTip: async (_sessionId: string): Promise<CoachingResponse> => {
    await delay();
    return { tip: null };
  },

  getTrainingReview: async (_sessionId: string): Promise<TrainingReview> => {
    await delay();
    return {
      overall_summary: "Demo mode — complete a real interview for training feedback.",
      top_improvements: [],
      turns: [],
    };
  },
};

// ─── WebSocket URL builders (kept for type compatibility) ─────────────────────

export function getLiveInterviewWsUrl(sessionId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws/live/${sessionId}`;
}

export function getDeliberationWsUrl(sessionId: string): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}/ws/deliberation/${sessionId}`;
}

/**
 * Returns the direct URL for a slide PNG image (0-based index).
 * In demo mode this returns a placeholder — no real slides are served.
 */
export function getSlideUrl(_sessionId: string, _index: number): string {
  // Return a 1x1 transparent PNG data URI as placeholder
  return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==";
}

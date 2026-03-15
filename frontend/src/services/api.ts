// ─── DayZero REST API Client ──────────────────────────────────────────────────
// All calls proxy through Vite dev server to localhost:8080

import type {
  CreateSessionResponse,
  SessionState,
  UploadDeckResponse,
  SlidesResponse,
  SlideResponse,
  CoachingResponse,
  VerdictResponse,
  DebateResponse,
  SourcesResponse,
  TaskStartedResponse,
} from "@/types/session";

// Base URL is empty — Vite proxies /api and /ws to :8080
const BASE = "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail ?? body.error ?? detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ─── Session ──────────────────────────────────────────────────────────────────

export const api = {
  // Create a new session
  createSession: (): Promise<CreateSessionResponse> =>
    request<CreateSessionResponse>("/api/session", { method: "POST" }),

  // Get full session state
  getSession: (sessionId: string): Promise<SessionState> =>
    request<SessionState>(`/api/session/${sessionId}`),

  // Delete a session
  deleteSession: (sessionId: string): Promise<void> =>
    request<void>(`/api/session/${sessionId}`, { method: "DELETE" }),

  // ─── Analysis ───────────────────────────────────────────────────────────────

  // Upload PDF or PPTX pitch deck
  uploadDeck: (sessionId: string, file: File): Promise<UploadDeckResponse> => {
    const form = new FormData();
    form.append("file", file);
    form.append("session_id", sessionId);
    return request<UploadDeckResponse>("/api/upload-deck", {
      method: "POST",
      headers: {}, // Let browser set Content-Type with boundary for multipart
      body: form,
    });
  },

  // Submit typed pitch text
  submitPitch: (sessionId: string, pitchText: string): Promise<SessionState> =>
    request<SessionState>(`/api/pitch?session_id=${sessionId}`, {
      method: "POST",
      body: JSON.stringify({ pitch_text: pitchText }),
    }),

  // Get all slide images for a session
  getSlides: (sessionId: string): Promise<SlidesResponse> =>
    request<SlidesResponse>(`/api/session/${sessionId}/slides`),

  // Get a single slide by index
  getSlide: (sessionId: string, index: number): Promise<SlideResponse> =>
    request<SlideResponse>(`/api/session/${sessionId}/slides/${index}`),

  // ─── Market + Deliberation ──────────────────────────────────────────────────

  // Trigger market validation (background task)
  triggerMarketValidation: (sessionId: string): Promise<TaskStartedResponse> =>
    request<TaskStartedResponse>(`/api/validate-market?session_id=${sessionId}`, {
      method: "POST",
    }),

  // Trigger VC deliberation (background task)
  triggerDeliberation: (sessionId: string): Promise<TaskStartedResponse> =>
    request<TaskStartedResponse>(`/api/deliberate?session_id=${sessionId}`, {
      method: "POST",
    }),

  // ─── Results ────────────────────────────────────────────────────────────────

  // Get final verdict (returns 202 if still pending)
  getVerdict: (sessionId: string): Promise<VerdictResponse> =>
    request<VerdictResponse>(`/api/session/${sessionId}/verdict`),

  // Get all debate rounds
  getDebate: (sessionId: string): Promise<DebateResponse> =>
    request<DebateResponse>(`/api/session/${sessionId}/debate`),

  // Get all cited sources
  getSources: (sessionId: string): Promise<SourcesResponse> =>
    request<SourcesResponse>(`/api/session/${sessionId}/sources`),

  // ─── Coaching ───────────────────────────────────────────────────────────────

  // Request real-time coaching tip
  getCoachingTip: (sessionId: string): Promise<CoachingResponse> =>
    request<CoachingResponse>(`/api/session/${sessionId}/coach`, {
      method: "POST",
    }),
};

// ─── WebSocket URL builder ────────────────────────────────────────────────────

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

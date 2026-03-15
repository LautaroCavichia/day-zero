// ─── DayZero Session Types ───────────────────────────────────────────────────
// Mirrors backend Pydantic models in backend/core/models.py

// ─── Pitch Context ────────────────────────────────────────────────────────────

export interface PitchContext {
  company_name: string;
  one_liner: string;
  problem: string;
  solution: string;
  target_customer: string;
  business_model: string;
  traction: string;
  team: string;
  ask: string;
  stage: string;
}

// ─── Live Interview ───────────────────────────────────────────────────────────

export type TranscriptSpeaker = "Sam" | "Founder";

export interface TranscriptTurn {
  speaker: TranscriptSpeaker;
  text: string;
  timestamp: number;
}

export interface DeliveryScores {
  confidence: number;   // 0.0–1.0
  specificity: number;  // 0.0–1.0
  energy: number;       // 0.0–1.0
  hesitation_count: number;
}

// ─── Deck Analysis ────────────────────────────────────────────────────────────

export interface SlideNote {
  index: number;
  title: string;
  critique: string;
  score: number; // 0–10
}

export interface DeckCritique {
  narrative_arc_score: number;
  visual_clarity_score: number;
  slide_count: number;
  slides: SlideNote[];
  missing_slides: string[];
  top_issues: string[];
  strengths: string[];
  overall_summary: string;
}

// ─── Market Intelligence ──────────────────────────────────────────────────────

export interface Competitor {
  name: string;
  description: string;
  funding: string;
  source_url: string;
  confidence: number; // 0.0–1.0
}

export interface MarketSize {
  tam: string;
  sam: string;
  som: string;
  source_url: string;
  confidence: number;
  analyst_note: string;
}

export interface WhyNow {
  tailwinds: string[];
  headwinds: string[];
  source_urls: string[];
}

export interface PivotSuggestion {
  suggestion: string;
  rationale: string;
  precedent_company: string;
  source_url: string;
  confidence: number;
}

export interface MarketIntel {
  competitors: Competitor[];
  market_size: MarketSize;
  why_now: WhyNow;
  pivot_suggestions: PivotSuggestion[];
}

// ─── VC Deliberation ──────────────────────────────────────────────────────────

export interface SkepticOutput {
  dialogue: string;
  objections: string[];
  questions: string[];
  score: number; // 1–10
  cited_sources: string[];
}

export interface OptimistOutput {
  dialogue: string;
  thesis_points: string[];
  analogies: string[];
  score: number;
  cited_sources: string[];
}

export interface OperatorOutput {
  dialogue: string;
  execution_risks: string[];
  operational_questions: string[];
  score: number;
  cited_sources: string[];
}

export interface DebateRound {
  round: number; // 1, 2, 3
  skeptic: SkepticOutput;
  optimist: OptimistOutput;
  operator: OperatorOutput;
}

// ─── Final Verdict ────────────────────────────────────────────────────────────

export type VerdictDecision = "PASS" | "SOFT PASS" | "NO";

export interface ScoreBreakdown {
  problem_clarity: number;  // 0–10
  market_size: number;
  solution_strength: number;
  team: number;
  traction: number;
  delivery: number;
}

export interface SourceCitation {
  claim: string;
  url: string;
  date: string;
  confidence: number;
}

export interface FinalVerdict {
  decision: VerdictDecision;
  weighted_score: number; // 0–100
  score_breakdown: ScoreBreakdown;
  strengths: string[];
  risks: string[];
  recommended_pivot: string | null;
  next_steps: string[];
  investment_thesis: string;
  all_sources: SourceCitation[]; // fixed: backend returns objects, not strings
}

// ─── Task Status ──────────────────────────────────────────────────────────────

export type TaskStatusValue = "idle" | "running" | "completed" | "failed";

export interface TaskStatus {
  status: TaskStatusValue;
  error: string | null;
}

// ─── Full Session State ───────────────────────────────────────────────────────

export interface SessionState {
  pitch_context: PitchContext | null;
  live_transcript: TranscriptTurn[];
  delivery_scores: DeliveryScores | null;
  deck_critique: DeckCritique | null;
  market_intel: MarketIntel | null;
  debate_rounds: DebateRound[];
  final_verdict: FinalVerdict | null;
  live_interview_active: boolean;
  deck_analysis_done: boolean;
  slide_images: string[]; // base64 PNG strings
  market_intel_status: TaskStatus;
  deliberation_status: TaskStatus;
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface CreateSessionResponse {
  session_id: string;
}

export interface UploadDeckResponse {
  status: string;
  deck_critique: DeckCritique;
}

export interface SlideResponse {
  index: number;
  image: string; // base64 PNG
  total: number;
}

export interface SlidesResponse {
  slides: string[]; // base64 PNG array
  count: number;
}

export interface CoachingResponse {
  tip: string | null;
}

// ─── Training Review ──────────────────────────────────────────────────────────

export type TurnRating = "strong" | "weak" | "missed";

export interface TrainingTurn {
  turn_index: number;
  speaker: "Founder";
  text: string;
  question: string | null;
  rating: TurnRating;
  annotation: string;
  ideal_answer: string;
}

export interface TrainingReview {
  overall_summary: string;
  top_improvements: string[];
  turns: TrainingTurn[];
}

export interface VerdictResponse extends FinalVerdict {}

export interface DebateResponse {
  debate_rounds: DebateRound[];
  status: TaskStatusValue;
}

export interface SourcesResponse {
  sources: string[];
}

export interface TaskStartedResponse {
  status: "started";
  message: string;
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────

export type WsEventType =
  | "transcript_input"
  | "transcript_output"
  | "turn_complete"
  | "interrupted"
  | "error"
  | "ping";

export interface WsTranscriptEvent {
  type: "transcript_input" | "transcript_output";
  text: string;
  timestamp: number;
}

export interface WsTurnCompleteEvent {
  type: "turn_complete";
}

export interface WsInterruptedEvent {
  type: "interrupted";
}

export interface WsErrorEvent {
  type: "error";
  message: string;
}

export type WsServerEvent =
  | WsTranscriptEvent
  | WsTurnCompleteEvent
  | WsInterruptedEvent
  | WsErrorEvent;

// ─── Deliberation WebSocket Events ───────────────────────────────────────────

export interface WsPersonaStartEvent {
  type: "persona_start";
  persona: string;
  role: string;
  round: number;
  color: string;
}

export interface WsPersonaTranscriptEvent {
  type: "transcript";
  persona: string;
  role: string;
  text: string;
  round: number;
  color: string;
}

export interface WsPersonaEndEvent {
  type: "persona_end";
  persona: string;
  role: string;
  round: number;
  full_transcript: string;
}

export interface WsDeliberationCompleteEvent {
  type: "deliberation_complete";
}

export interface WsStatusEvent {
  type: "status";
  message: string;
}

export type WsDeliberationEvent =
  | WsPersonaStartEvent
  | WsPersonaTranscriptEvent
  | WsPersonaEndEvent
  | WsDeliberationCompleteEvent
  | WsStatusEvent
  | WsErrorEvent;

// ─── UI-only types ────────────────────────────────────────────────────────────

export type WorkflowPhase = 1 | 2 | 3 | 4 | 5;

export type PhaseStatus = "locked" | "available" | "active" | "done";

export interface PhaseInfo {
  phase: WorkflowPhase;
  label: string;
  description: string;
  status: PhaseStatus;
}

export const WORKFLOW_PHASES: Omit<PhaseInfo, "status">[] = [
  { phase: 1, label: "Live Interview", description: "Voice chat with Sam, YC partner AI" },
  { phase: 2, label: "Deck Analysis", description: "Slide-by-slide critique and scoring" },
  { phase: 3, label: "Market Intel", description: "Competitive research and market sizing" },
  { phase: 4, label: "Deliberation", description: "3-round VC panel debate" },
  { phase: 5, label: "Verdict", description: "Final investment decision and next steps" },
];

// ─── Dashboard / Session List ─────────────────────────────────────────────────

export type SessionCardStatus =
  | "new"          // No interview started yet
  | "in_progress"  // Interview done, tasks still running
  | "analyzing"    // Background tasks (market/deliberation) running
  | "complete";    // Verdict received

export interface SessionSummary {
  session_id: string;
  created_at: number;         // Unix timestamp
  updated_at: number;         // Unix timestamp
  company_name: string;
  one_liner: string;
  stage: string;
  verdict_decision: VerdictDecision | null;
  weighted_score: number | null;
  deck_analysis_done: boolean;
  market_intel_status: TaskStatusValue;
  deliberation_status: TaskStatusValue;
  live_interview_active: boolean;
  transcript_turns: number;
}

export interface ListSessionsResponse {
  sessions: SessionSummary[];
}

export function deriveSessionCardStatus(s: SessionSummary): SessionCardStatus {
  if (s.verdict_decision != null) return "complete";
  if (
    s.market_intel_status === "running" ||
    s.deliberation_status === "running"
  )
    return "analyzing";
  if (s.transcript_turns > 0) return "in_progress";
  return "new";
}

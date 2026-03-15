"""
core/models.py — Pydantic domain models for DayZero.

These models validate and document every structured data object that
flows through the system:  agent outputs, session state sub-schemas,
and API request/response bodies.

All models use ``model_config = ConfigDict(extra="ignore")`` so that
Gemini outputs with extra fields don't cause validation errors.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── Shared base ───────────────────────────────────────────────────────────


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ── Pitch context ─────────────────────────────────────────────────────────


class PitchContext(_Base):
    """Structured representation of a founder's startup pitch."""

    company_name: str = ""
    one_liner: str = ""
    problem: str = ""
    solution: str = ""
    target_customer: str = ""
    business_model: str = ""
    traction: str = ""
    team: str = ""
    ask: str = ""
    stage: Literal["idea", "MVP", "seed", "series-a", "growth", "unknown"] | str = ""

    def is_populated(self) -> bool:
        """Return True if at least one field is non-empty."""
        return any(
            [
                self.company_name,
                self.one_liner,
                self.problem,
                self.solution,
                self.target_customer,
            ]
        )


# ── Deck critique ─────────────────────────────────────────────────────────


class SlideNote(_Base):
    """Per-slide critique produced by DeckAnalystAgent."""

    index: int = Field(..., ge=1, description="1-based slide index.")
    title: str = ""
    content_text: str = ""  # All visible text on this slide, extracted by Gemini
    critique: str = ""
    score: float = Field(default=0.0, ge=0.0, le=10.0)


class DeckCritique(_Base):
    """Full output of the DeckAnalystAgent."""

    narrative_arc_score: float = Field(default=0.0, ge=0.0, le=10.0)
    visual_clarity_score: float = Field(default=0.0, ge=0.0, le=10.0)
    slide_count: int = Field(default=0, ge=0)
    slides: list[SlideNote] = []
    missing_slides: list[str] = []
    top_issues: list[str] = []
    strengths: list[str] = []
    overall_summary: str = ""


# ── Market intelligence ───────────────────────────────────────────────────


class Competitor(_Base):
    name: str = ""
    description: str = ""
    funding: str = "Unknown"
    source_url: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class MarketSize(_Base):
    tam: str = ""
    sam: str = ""
    som: str = ""
    source_url: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    analyst_note: str = ""


class WhyNow(_Base):
    tailwinds: list[str] = []
    headwinds: list[str] = []
    source_urls: list[str] = []


class PivotSuggestion(_Base):
    suggestion: str = ""
    rationale: str = ""
    precedent_company: str = ""
    source_url: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class MarketIntel(_Base):
    """Full output of the MarketValidatorAgent."""

    competitors: list[Competitor] = []
    market_size: MarketSize = Field(default_factory=MarketSize)
    why_now: WhyNow = Field(default_factory=WhyNow)
    pivot_suggestions: list[PivotSuggestion] = []


# ── Deliberation ──────────────────────────────────────────────────────────


class SkepticOutput(_Base):
    dialogue: str = ""
    objections: list[str] = []
    questions: list[str] = []
    score: float = Field(default=0.0, ge=0.0, le=10.0)
    cited_sources: list[str] = []


class OptimistOutput(_Base):
    dialogue: str = ""
    thesis_points: list[str] = []
    analogies: list[str] = []
    score: float = Field(default=0.0, ge=0.0, le=10.0)
    cited_sources: list[str] = []


class OperatorOutput(_Base):
    dialogue: str = ""
    execution_risks: list[str] = []
    operational_questions: list[str] = []
    score: float = Field(default=0.0, ge=0.0, le=10.0)
    cited_sources: list[str] = []


class DebateRound(_Base):
    round: int = Field(..., ge=1)
    skeptic: SkepticOutput = Field(default_factory=SkepticOutput)
    optimist: OptimistOutput = Field(default_factory=OptimistOutput)
    operator: OperatorOutput = Field(default_factory=OperatorOutput)


# ── Final verdict ─────────────────────────────────────────────────────────


class ScoreBreakdown(_Base):
    problem_clarity: float = Field(default=0.0, ge=0.0, le=10.0)
    market_size: float = Field(default=0.0, ge=0.0, le=10.0)
    solution_strength: float = Field(default=0.0, ge=0.0, le=10.0)
    team: float = Field(default=0.0, ge=0.0, le=10.0)
    traction: float = Field(default=0.0, ge=0.0, le=10.0)
    delivery: float = Field(default=0.0, ge=0.0, le=10.0)


class SourceCitation(_Base):
    claim: str = ""
    url: str = ""
    date: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class FinalVerdict(_Base):
    """Synthesised investment decision produced after all debate rounds."""

    decision: Literal["PASS", "SOFT PASS", "NO"] = "NO"
    weighted_score: float = Field(default=0.0, ge=0.0, le=100.0)
    score_breakdown: ScoreBreakdown = Field(default_factory=ScoreBreakdown)
    strengths: list[str] = []
    risks: list[str] = []
    recommended_pivot: str | None = None
    next_steps: list[str] = []
    investment_thesis: str = ""
    all_sources: list[SourceCitation] = []


# ── Session state ─────────────────────────────────────────────────────────


class TranscriptTurn(_Base):
    speaker: str
    text: str
    timestamp: float


class DeliveryScores(_Base):
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    specificity: float = Field(default=0.0, ge=0.0, le=1.0)
    energy: float = Field(default=0.0, ge=0.0, le=1.0)
    hesitation_count: int = Field(default=0, ge=0)


class TaskStatus(_Base):
    """Tracks the lifecycle of a background task (market validation / deliberation)."""

    status: Literal["idle", "running", "completed", "failed"] = "idle"
    error: str | None = None


class SessionState(_Base):
    """Complete session state schema — mirrors ARCHITECTURE.md §5."""

    pitch_context: PitchContext = Field(default_factory=PitchContext)
    live_transcript: list[TranscriptTurn] = []
    delivery_scores: DeliveryScores = Field(default_factory=DeliveryScores)
    deck_critique: DeckCritique | None = None
    market_intel: MarketIntel | None = None
    debate_rounds: list[DebateRound] = []
    final_verdict: FinalVerdict | None = None

    # Internal flags
    live_interview_active: bool = False
    deck_analysis_done: bool = False
    market_intel_status: TaskStatus = Field(default_factory=TaskStatus)
    deliberation_status: TaskStatus = Field(default_factory=TaskStatus)


# ── API request / response models ─────────────────────────────────────────


class PitchTextRequest(BaseModel):
    pitch_text: str = Field(..., description="Raw startup pitch text (minimum 10 characters).")

    @field_validator("pitch_text")
    @classmethod
    def pitch_text_min_length(cls, v: str) -> str:
        if len(v) < 10:
            raise ValueError(
                "Pitch text is too short — please enter at least 10 characters describing your startup."
            )
        return v


class SessionResponse(BaseModel):
    session_id: str


class TaskStartedResponse(BaseModel):
    status: Literal["started"] = "started"
    message: str


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
    session_id: str | None = None

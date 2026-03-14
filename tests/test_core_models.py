"""
tests/test_core_models.py — Tests for Pydantic domain models.
"""

from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from backend.core.models import (
    DebateRound,
    DeckCritique,
    DeliveryScores,
    FinalVerdict,
    MarketIntel,
    OperatorOutput,
    OptimistOutput,
    PitchContext,
    SessionResponse,
    SkepticOutput,
    SlideNote,
    TaskStartedResponse,
    TaskStatus,
    TranscriptTurn,
)

# ── PitchContext ────────────────────────────────────────────────────────────


def test_pitch_context_defaults():
    ctx = PitchContext()
    assert ctx.company_name == ""
    assert ctx.stage == ""
    assert ctx.is_populated() is False


def test_pitch_context_is_populated():
    ctx = PitchContext(company_name="Acme", one_liner="AI email")
    assert ctx.is_populated() is True


def test_pitch_context_from_dict():
    data = {
        "company_name": "TestCo",
        "one_liner": "Test",
        "problem": "P",
        "solution": "S",
        "target_customer": "TC",
        "business_model": "BM",
        "traction": "T",
        "team": "Team",
        "ask": "$1M",
        "stage": "seed",
    }
    ctx = PitchContext.model_validate(data)
    assert ctx.company_name == "TestCo"
    assert ctx.stage == "seed"


def test_pitch_context_extra_fields_ignored():
    """Extra fields from Gemini output must not raise."""
    ctx = PitchContext.model_validate({"company_name": "X", "unknown_field": "y"})
    assert ctx.company_name == "X"


# ── DeckCritique ────────────────────────────────────────────────────────────


def test_deck_critique_defaults():
    dc = DeckCritique()
    assert dc.narrative_arc_score == 0.0
    assert dc.slides == []
    assert dc.missing_slides == []


def test_deck_critique_slide_note():
    note = SlideNote(index=1, title="Cover", critique="Good hook", score=8.5)
    assert note.index == 1
    assert note.score == 8.5


def test_deck_critique_score_clamped():
    """Scores outside 0-10 range should raise a validation error."""
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        SlideNote(index=1, title="X", critique="X", score=11.0)


# ── MarketIntel ─────────────────────────────────────────────────────────────


def test_market_intel_defaults():
    mi = MarketIntel()
    assert mi.competitors == []
    assert mi.pivot_suggestions == []
    assert mi.market_size.tam == ""


def test_market_intel_full(mock_market_intel_response):
    mi = MarketIntel.model_validate(mock_market_intel_response)
    assert len(mi.competitors) == 1
    assert mi.competitors[0].name == "Competitor A"
    assert mi.market_size.tam == "$50B"
    assert len(mi.why_now.tailwinds) == 1


# ── DebateRound ─────────────────────────────────────────────────────────────


def test_debate_round_defaults():
    dr = DebateRound(round=1)
    assert dr.round == 1
    assert dr.skeptic.score == 0.0
    assert dr.optimist.dialogue == ""


def test_debate_round_from_data(
    mock_skeptic_response, mock_optimist_response, mock_operator_response
):
    dr = DebateRound(
        round=1,
        skeptic=SkepticOutput.model_validate(mock_skeptic_response),
        optimist=OptimistOutput.model_validate(mock_optimist_response),
        operator=OperatorOutput.model_validate(mock_operator_response),
    )
    assert dr.skeptic.score == 4.0
    assert dr.optimist.score == 8.0
    assert dr.operator.score == 6.0


# ── FinalVerdict ────────────────────────────────────────────────────────────


def test_final_verdict_defaults():
    fv = FinalVerdict()
    assert fv.decision == "NO"
    assert fv.weighted_score == 0.0
    assert fv.strengths == []
    assert fv.all_sources == []


def test_final_verdict_from_data(mock_verdict_response):
    fv = FinalVerdict.model_validate(mock_verdict_response)
    assert fv.decision == "SOFT PASS"
    assert fv.weighted_score == 62.5
    assert len(fv.strengths) == 2
    assert fv.recommended_pivot is None
    assert fv.score_breakdown.problem_clarity == 8.0


# ── SessionState sub-models ─────────────────────────────────────────────────


def test_transcript_turn():
    turn = TranscriptTurn(speaker="Sam", text="Hello", timestamp=1234567890.0)
    assert turn.speaker == "Sam"


def test_delivery_scores_defaults():
    ds = DeliveryScores()
    assert ds.confidence == 0.0
    assert ds.hesitation_count == 0


def test_task_status_defaults():
    ts = TaskStatus()
    assert ts.status == "idle"
    assert ts.error is None


def test_task_status_failed():
    ts = TaskStatus(status="failed", error="timeout")
    assert ts.status == "failed"
    assert ts.error == "timeout"


# ── API models ──────────────────────────────────────────────────────────────


def test_session_response():
    sr = SessionResponse(session_id="abc-123")
    assert sr.session_id == "abc-123"


def test_task_started_response():
    r = TaskStartedResponse(message="running")
    assert r.status == "started"
    assert r.message == "running"


# ── conftest fixture access ──────────────────────────────────────────────────


@pytest.fixture
def mock_market_intel_response():
    return {
        "competitors": [
            {
                "name": "Competitor A",
                "description": "Does similar things",
                "funding": "$10M Series A",
                "source_url": "https://example.com",
                "confidence": 0.8,
            }
        ],
        "market_size": {
            "tam": "$50B",
            "sam": "$5B",
            "som": "$100M",
            "source_url": "https://example.com",
            "confidence": 0.7,
            "analyst_note": "Growing market",
        },
        "why_now": {
            "tailwinds": ["AI adoption"],
            "headwinds": ["Regulation"],
            "source_urls": ["https://example.com"],
        },
        "pivot_suggestions": [],
    }


@pytest.fixture
def mock_skeptic_response():
    return {
        "dialogue": "Skeptical.",
        "objections": [],
        "questions": [],
        "score": 4.0,
        "cited_sources": [],
    }


@pytest.fixture
def mock_optimist_response():
    return {
        "dialogue": "Optimistic.",
        "thesis_points": [],
        "analogies": [],
        "score": 8.0,
        "cited_sources": [],
    }


@pytest.fixture
def mock_operator_response():
    return {
        "dialogue": "Operational.",
        "execution_risks": [],
        "operational_questions": [],
        "score": 6.0,
        "cited_sources": [],
    }


@pytest.fixture
def mock_verdict_response():
    return {
        "decision": "SOFT PASS",
        "weighted_score": 62.5,
        "score_breakdown": {
            "problem_clarity": 8.0,
            "market_size": 6.0,
            "solution_strength": 7.0,
            "team": 7.5,
            "traction": 4.0,
            "delivery": 6.0,
        },
        "strengths": ["Clear problem", "Strong team"],
        "risks": ["Unproven traction"],
        "recommended_pivot": None,
        "next_steps": ["Get 10 paying customers"],
        "investment_thesis": "Could be compelling.",
        "all_sources": [
            {
                "claim": "Market size",
                "url": "https://example.com",
                "date": "2025",
                "confidence": 0.7,
            }
        ],
    }

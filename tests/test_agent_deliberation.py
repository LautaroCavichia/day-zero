"""
tests/test_agent_deliberation.py — Unit tests for the Deliberation Panel.
"""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from google.adk.sessions import InMemorySessionService

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from core.errors import SessionNotFoundError, SessionStateError
from session_state import SessionStore

POPULATED_PITCH = {
    "company_name": "Acme AI",
    "one_liner": "AI email",
    "problem": "Email slow",
    "solution": "LLM",
    "target_customer": "Workers",
    "business_model": "SaaS",
    "traction": "100 users",
    "team": "2 founders",
    "ask": "$500k",
    "stage": "MVP",
}

SKEPTIC = {
    "dialogue": "I have concerns about the market size.",
    "objections": ["Market too small"],
    "questions": ["Who is customer #1?"],
    "score": 4.5,
    "cited_sources": ["https://example.com"],
}

OPTIMIST = {
    "dialogue": "I see a huge opportunity.",
    "thesis_points": ["Large TAM", "Strong team"],
    "analogies": ["Like Notion"],
    "score": 8.5,
    "cited_sources": [],
}

OPERATOR = {
    "dialogue": "The unit economics need work.",
    "execution_risks": ["CAC too high"],
    "operational_questions": ["What is your LTV?"],
    "score": 5.5,
    "cited_sources": [],
}

VERDICT = {
    "decision": "SOFT PASS",
    "weighted_score": 60.0,
    "score_breakdown": {
        "problem_clarity": 8.0,
        "market_size": 5.0,
        "solution_strength": 7.0,
        "team": 8.0,
        "traction": 4.0,
        "delivery": 6.0,
    },
    "strengths": ["Clear problem"],
    "risks": ["No traction"],
    "recommended_pivot": None,
    "next_steps": ["Get customers"],
    "investment_thesis": "Could work if traction improves.",
    "all_sources": [],
}


@pytest_asyncio.fixture
async def store_with_pitch():
    store = SessionStore(service=InMemorySessionService())
    sid = await store.create()
    await store.update(sid, {"pitch_context": POPULATED_PITCH})
    return store, sid


@pytest.mark.asyncio
async def test_run_deliberation_returns_verdict(store_with_pitch):
    store, sid = store_with_pitch

    # Gemini is called: skeptic, optimist, operator x3 rounds + 1 synthesizer = 10 calls
    call_count = 0
    responses = [SKEPTIC, OPTIMIST, OPERATOR] * 3 + [VERDICT]

    async def mock_generate(*args, **kwargs):
        nonlocal call_count
        resp = MagicMock()
        resp.text = json.dumps(responses[call_count % len(responses)])
        call_count += 1
        return resp

    with patch("core.gemini_client.genai.Client") as MockClient:
        mock_instance = MagicMock()
        mock_instance.aio.models.generate_content = AsyncMock(side_effect=mock_generate)
        MockClient.return_value = mock_instance

        with patch("agents.deliberation.settings") as mock_settings:
            mock_settings.debate_rounds = 3
            mock_settings.debate_context_transcript_turns = 20
            mock_settings.debate_context_dialogue_chars = 300
            mock_settings.gemini_flash_model = "gemini-2.5-flash"

            from agents.deliberation import run_deliberation

            verdict = await run_deliberation(sid, api_key="test-key", store=store)

    assert verdict.decision == "SOFT PASS"
    assert verdict.weighted_score == 60.0


@pytest.mark.asyncio
async def test_run_deliberation_writes_rounds_incrementally(store_with_pitch):
    store, sid = store_with_pitch
    responses = [SKEPTIC, OPTIMIST, OPERATOR] * 3 + [VERDICT]
    call_count = 0

    async def mock_generate(*args, **kwargs):
        nonlocal call_count
        resp = MagicMock()
        resp.text = json.dumps(responses[call_count % len(responses)])
        call_count += 1
        return resp

    with patch("core.gemini_client.genai.Client") as MockClient:
        mock_instance = MagicMock()
        mock_instance.aio.models.generate_content = AsyncMock(side_effect=mock_generate)
        MockClient.return_value = mock_instance

        with patch("agents.deliberation.settings") as mock_settings:
            mock_settings.debate_rounds = 3
            mock_settings.debate_context_transcript_turns = 20
            mock_settings.debate_context_dialogue_chars = 300
            mock_settings.gemini_flash_model = "gemini-2.5-flash"

            from agents.deliberation import run_deliberation

            await run_deliberation(sid, api_key="test-key", store=store)

    state = await store.get_state(sid)
    assert len(state["debate_rounds"]) == 3
    assert state["debate_rounds"][0]["round"] == 1
    assert state["debate_rounds"][2]["round"] == 3


@pytest.mark.asyncio
async def test_run_deliberation_writes_final_verdict(store_with_pitch):
    store, sid = store_with_pitch
    responses = [SKEPTIC, OPTIMIST, OPERATOR] * 3 + [VERDICT]
    call_count = 0

    async def mock_generate(*args, **kwargs):
        nonlocal call_count
        resp = MagicMock()
        resp.text = json.dumps(responses[call_count % len(responses)])
        call_count += 1
        return resp

    with patch("core.gemini_client.genai.Client") as MockClient:
        mock_instance = MagicMock()
        mock_instance.aio.models.generate_content = AsyncMock(side_effect=mock_generate)
        MockClient.return_value = mock_instance

        with patch("agents.deliberation.settings") as mock_settings:
            mock_settings.debate_rounds = 3
            mock_settings.debate_context_transcript_turns = 20
            mock_settings.debate_context_dialogue_chars = 300
            mock_settings.gemini_flash_model = "gemini-2.5-flash"

            from agents.deliberation import run_deliberation

            await run_deliberation(sid, api_key="test-key", store=store)

    state = await store.get_state(sid)
    assert state["final_verdict"] is not None
    assert state["final_verdict"]["decision"] == "SOFT PASS"
    assert state["deliberation_status"]["status"] == "completed"


@pytest.mark.asyncio
async def test_run_deliberation_missing_session_raises():
    store = SessionStore(service=InMemorySessionService())

    from agents.deliberation import run_deliberation

    with pytest.raises(SessionNotFoundError):
        await run_deliberation("nonexistent", api_key="test-key", store=store)


@pytest.mark.asyncio
async def test_run_deliberation_empty_pitch_raises():
    store = SessionStore(service=InMemorySessionService())
    sid = await store.create()  # pitch_context is empty

    from agents.deliberation import run_deliberation

    with pytest.raises(SessionStateError):
        await run_deliberation(sid, api_key="test-key", store=store)


def test_build_debate_context_with_full_state():
    """_build_debate_context returns a non-empty string for a populated state."""
    from agents.deliberation import _build_debate_context

    state = {
        "pitch_context": POPULATED_PITCH,
        "deck_critique": {
            "narrative_arc_score": 7,
            "visual_clarity_score": 8,
            "top_issues": ["No traction"],
            "missing_slides": ["Team slide"],
        },
        "market_intel": {
            "competitors": [{"name": "Rival"}],
            "market_size": {"tam": "$30B", "sam": "$3B", "som": "$50M", "confidence": 0.8},
            "why_now": {"tailwinds": ["AI"], "headwinds": []},
        },
        "live_transcript": [
            {"speaker": "Sam", "text": "Tell me about your team.", "timestamp": 1.0},
            {"speaker": "Founder", "text": "We are two ex-Googlers.", "timestamp": 2.0},
        ],
        "debate_rounds": [],
    }

    context = _build_debate_context(state)
    assert "PITCH CONTEXT" in context
    assert "Acme AI" in context
    assert "DECK CRITIQUE" in context
    assert "MARKET INTELLIGENCE" in context
    assert "LIVE INTERVIEW TRANSCRIPT" in context


def test_build_debate_context_empty_state():
    from agents.deliberation import _build_debate_context

    context = _build_debate_context({})
    assert context == ""

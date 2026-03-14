"""
tests/conftest.py — shared fixtures for the DayZero test suite.

All fixtures are async-compatible via pytest-asyncio (asyncio_mode = "auto").

Key fixtures:
  - fresh_store      : an isolated SessionStore with a fresh ADK InMemorySessionService
  - session_id       : a pre-created session in fresh_store
  - mock_genai_client: a MagicMock that replaces the Gemini client
  - test_client      : a FastAPI TestClient wired to a test instance of the app
"""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

# Ensure backend/ is on sys.path for all tests
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from backend.session_state import SessionStore, _MemoryBackend

# ── Store fixtures ─────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def fresh_store() -> SessionStore:
    """Return a completely isolated SessionStore backed by a new in-memory backend."""
    return SessionStore(backend=_MemoryBackend())


@pytest_asyncio.fixture
async def session_id(fresh_store: SessionStore) -> str:
    """Create a session in fresh_store and return its ID."""
    return await fresh_store.create()


# ── Gemini mock ────────────────────────────────────────────────────────────


def make_mock_response(payload: dict | list | str) -> MagicMock:
    """
    Build a mock ``generate_content`` response whose ``.text`` attribute
    returns *payload* serialised as JSON.
    """
    mock_resp = MagicMock()
    mock_resp.text = json.dumps(payload)
    return mock_resp


@pytest.fixture
def mock_pitch_context_response():
    """A valid pitch_context JSON response from Gemini."""
    return {
        "company_name": "Acme AI",
        "one_liner": "AI that writes your emails",
        "problem": "People spend too long on email",
        "solution": "LLM-powered email drafting",
        "target_customer": "knowledge workers",
        "business_model": "SaaS $20/month",
        "traction": "100 beta users",
        "team": "2 ex-Googlers",
        "ask": "$500k pre-seed",
        "stage": "MVP",
    }


@pytest.fixture
def mock_deck_critique_response():
    """A valid deck_critique JSON response from Gemini."""
    return {
        "narrative_arc_score": 7.5,
        "visual_clarity_score": 8.0,
        "slide_count": 12,
        "slides": [{"index": 1, "title": "Cover", "critique": "Strong hook.", "score": 8.0}],
        "missing_slides": ["Traction slide"],
        "top_issues": ["No unit economics"],
        "strengths": ["Clear problem statement"],
        "overall_summary": "Solid deck with room to improve.",
    }


@pytest.fixture
def mock_market_intel_response():
    """A valid market_intel JSON response from Gemini."""
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
            "headwinds": ["Regulatory uncertainty"],
            "source_urls": ["https://example.com"],
        },
        "pivot_suggestions": [
            {
                "suggestion": "Focus on SMBs",
                "rationale": "Less competition",
                "precedent_company": "Notion",
                "source_url": "https://example.com",
                "confidence": 0.6,
            }
        ],
    }


@pytest.fixture
def mock_skeptic_response():
    return {
        "dialogue": "I'm skeptical about the market size.",
        "objections": ["Market too small", "Too much competition"],
        "questions": ["What's your CAC?"],
        "score": 4.0,
        "cited_sources": ["https://example.com"],
    }


@pytest.fixture
def mock_optimist_response():
    return {
        "dialogue": "I see huge potential here.",
        "thesis_points": ["Large TAM", "Strong team"],
        "analogies": ["Like Slack for X"],
        "score": 8.0,
        "cited_sources": ["https://example.com"],
    }


@pytest.fixture
def mock_operator_response():
    return {
        "dialogue": "Operations look solid.",
        "execution_risks": ["Hiring risk"],
        "operational_questions": ["What's your burn rate?"],
        "score": 6.0,
        "cited_sources": ["https://example.com"],
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
        "investment_thesis": "If traction improves, this could be compelling.",
        "all_sources": [
            {
                "claim": "Market size",
                "url": "https://example.com",
                "date": "2025",
                "confidence": 0.7,
            }
        ],
    }


# ── FastAPI test client ────────────────────────────────────────────────────


@pytest.fixture
def api_client():
    """
    Return a FastAPI TestClient.

    GOOGLE_API_KEY is patched to a test value so the _require_api_key()
    guard passes.  Gemini calls are mocked at the agent level in each test.
    """
    with patch.dict(os.environ, {"GOOGLE_API_KEY": "test-key-12345"}):
        # Re-import settings with the patched env
        import importlib

        import config as cfg_module

        importlib.reload(cfg_module)

        import main as main_module

        importlib.reload(main_module)

        with TestClient(main_module.app, raise_server_exceptions=True) as client:
            yield client

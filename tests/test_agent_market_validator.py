"""
tests/test_agent_market_validator.py — Unit tests for the MarketValidatorAgent.
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

from core.errors import PitchContextEmptyError, SessionNotFoundError
from session_state import SessionStore

MOCK_MARKET_RESPONSE = {
    "competitors": [
        {
            "name": "Rival Corp",
            "description": "Competing product",
            "funding": "$20M Series B",
            "source_url": "https://crunchbase.com/rival",
            "confidence": 0.85,
        }
    ],
    "market_size": {
        "tam": "$30B",
        "sam": "$3B",
        "som": "$50M",
        "source_url": "https://statista.com",
        "confidence": 0.75,
        "analyst_note": "Reliable estimate",
    },
    "why_now": {
        "tailwinds": ["Remote work boom", "AI adoption"],
        "headwinds": ["Regulatory risk"],
        "source_urls": ["https://example.com"],
    },
    "pivot_suggestions": [
        {
            "suggestion": "Focus on SMBs",
            "rationale": "Less competition",
            "precedent_company": "Notion",
            "source_url": "https://example.com",
            "confidence": 0.65,
        }
    ],
}

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


@pytest_asyncio.fixture
async def store():
    return SessionStore(service=InMemorySessionService())


@pytest_asyncio.fixture
async def sid_with_pitch(store):
    sid = await store.create()
    await store.update(sid, {"pitch_context": POPULATED_PITCH})
    return sid, store


@pytest.mark.asyncio
async def test_validate_market_success(sid_with_pitch):
    sid, store = sid_with_pitch

    mock_resp = MagicMock()
    mock_resp.text = json.dumps(MOCK_MARKET_RESPONSE)

    with patch("core.gemini_client.genai.Client") as MockClient:
        mock_instance = MagicMock()
        mock_instance.aio.models.generate_content = AsyncMock(return_value=mock_resp)
        MockClient.return_value = mock_instance

        from agents.market_validator import validate_market

        result = await validate_market(sid, api_key="test-key", store=store)

    assert result.competitors[0].name == "Rival Corp"
    assert result.market_size.tam == "$30B"
    assert len(result.why_now.tailwinds) == 2
    assert result.pivot_suggestions[0].suggestion == "Focus on SMBs"


@pytest.mark.asyncio
async def test_validate_market_writes_to_session(sid_with_pitch):
    sid, store = sid_with_pitch

    mock_resp = MagicMock()
    mock_resp.text = json.dumps(MOCK_MARKET_RESPONSE)

    with patch("core.gemini_client.genai.Client") as MockClient:
        mock_instance = MagicMock()
        mock_instance.aio.models.generate_content = AsyncMock(return_value=mock_resp)
        MockClient.return_value = mock_instance

        from agents.market_validator import validate_market

        await validate_market(sid, api_key="test-key", store=store)

    state = await store.get_state(sid)
    assert state["market_intel"] is not None
    assert state["market_intel_status"]["status"] == "completed"
    assert state["market_intel"]["market_size"]["tam"] == "$30B"


@pytest.mark.asyncio
async def test_validate_market_empty_pitch_raises():
    store = SessionStore(service=InMemorySessionService())
    sid = await store.create()  # pitch_context is empty by default

    from agents.market_validator import validate_market

    with pytest.raises(PitchContextEmptyError):
        await validate_market(sid, api_key="test-key", store=store)


@pytest.mark.asyncio
async def test_validate_market_missing_session_raises():
    store = SessionStore(service=InMemorySessionService())

    from agents.market_validator import validate_market

    with pytest.raises(SessionNotFoundError):
        await validate_market("nonexistent", api_key="test-key", store=store)


@pytest.mark.asyncio
async def test_validate_market_sets_running_status(sid_with_pitch):
    """Status should be set to 'running' before the API call."""
    sid, store = sid_with_pitch

    status_snapshots = []

    async def capture_status(*args, **kwargs):
        # Capture status at call time
        state = await store.get_state(sid)
        status_snapshots.append(state["market_intel_status"]["status"])
        mock_resp = MagicMock()
        mock_resp.text = json.dumps(MOCK_MARKET_RESPONSE)
        return mock_resp

    with patch("core.gemini_client.genai.Client") as MockClient:
        mock_instance = MagicMock()
        mock_instance.aio.models.generate_content = AsyncMock(side_effect=capture_status)
        MockClient.return_value = mock_instance

        from agents.market_validator import validate_market

        await validate_market(sid, api_key="test-key", store=store)

    assert "running" in status_snapshots

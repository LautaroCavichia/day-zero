"""
tests/test_agent_orchestrator.py — Unit tests for the OrchestratorAgent.
"""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from backend.session_state import SessionStore, _MemoryBackend


@pytest_asyncio.fixture
async def store():
    return SessionStore(backend=_MemoryBackend())


@pytest_asyncio.fixture
async def sid(store):
    return await store.create()


MOCK_PITCH_RESPONSE = {
    "company_name": "Acme AI",
    "one_liner": "AI that writes your emails",
    "problem": "Email is slow",
    "solution": "LLM drafting",
    "target_customer": "Knowledge workers",
    "business_model": "SaaS $20/month",
    "traction": "100 beta users",
    "team": "2 ex-Googlers",
    "ask": "$500k pre-seed",
    "stage": "MVP",
}


@pytest.mark.asyncio
async def test_extract_pitch_context(store, sid):
    """extract_pitch_context calls Gemini and returns a PitchContext."""
    mock_response = MOCK_PITCH_RESPONSE

    with patch("backend.core.llm_factory.get_provider") as mock_get_provider:
        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=mock_response)
        mock_get_provider.return_value = mock_provider

        from backend.agents.orchestrator import extract_pitch_context

        result = await extract_pitch_context("My startup pitch text", api_key="test-key")

    assert result.company_name == "Acme AI"
    assert result.stage == "MVP"
    assert result.is_populated() is True


@pytest.mark.asyncio
async def test_process_pitch_writes_to_session(store, sid):
    """process_pitch writes extracted context to session state."""
    mock_response = MOCK_PITCH_RESPONSE

    with patch("backend.core.llm_factory.get_provider") as mock_get_provider:
        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=mock_response)
        mock_get_provider.return_value = mock_provider

        from backend.agents.orchestrator import process_pitch

        result = await process_pitch(sid, "My startup pitch text", api_key="test-key", store=store)

    assert result.company_name == "Acme AI"

    state = await store.get_state(sid)
    assert state["pitch_context"]["company_name"] == "Acme AI"
    assert state["pitch_context"]["stage"] == "MVP"


@pytest.mark.asyncio
async def test_process_pitch_handles_unknown_stage(store, sid):
    """Gemini returning 'unknown' stage is valid."""
    response = {
        "company_name": "Acme AI",
        "one_liner": "AI that writes your emails",
        "problem": "Email is slow",
        "solution": "LLM drafting",
        "target_customer": "Knowledge workers",
        "business_model": "SaaS $20/month",
        "traction": "100 beta users",
        "team": "2 ex-Googlers",
        "ask": "$500k pre-seed",
        "stage": "unknown",
    }

    with (
        patch("backend.agents.orchestrator.get_provider") as mock_get_provider,
    ):
        mock_provider = AsyncMock()
        mock_provider.generate_json = AsyncMock(return_value=response)
        mock_get_provider.return_value = mock_provider

        from backend.agents.orchestrator import process_pitch

        result = await process_pitch(sid, "pitch text", api_key="test-key", store=store)

    assert result.stage == "unknown"


def test_create_orchestrator_agent():
    """The ADK LlmAgent is created without errors."""
    from backend.agents.orchestrator import create_orchestrator_agent

    agent = create_orchestrator_agent()
    assert agent.name == "DayZeroOrchestrator"

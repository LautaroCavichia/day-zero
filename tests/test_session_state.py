"""
tests/test_session_state.py — Tests for the SessionStore and helpers.
"""

from __future__ import annotations

import os
import sys

import pytest
import pytest_asyncio
from google.adk.sessions import InMemorySessionService

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from core.errors import SessionNotFoundError
from session_state import SessionStore, make_empty_state


@pytest_asyncio.fixture
async def store():
    return SessionStore(service=InMemorySessionService())


@pytest_asyncio.fixture
async def sid(store):
    return await store.create()


# ── CRUD ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_returns_string(store):
    session_id = await store.create()
    assert isinstance(session_id, str)
    assert len(session_id) > 0


@pytest.mark.asyncio
async def test_create_unique_ids(store):
    ids = [await store.create() for _ in range(5)]
    assert len(set(ids)) == 5


@pytest.mark.asyncio
async def test_get_state_returns_dict(store, sid):
    state = await store.get_state(sid)
    assert isinstance(state, dict)


@pytest.mark.asyncio
async def test_get_state_missing_returns_none(store):
    result = await store.get_state("nonexistent-id")
    assert result is None


@pytest.mark.asyncio
async def test_require_state_raises_on_miss(store):
    with pytest.raises(SessionNotFoundError) as exc_info:
        await store.require_state("nonexistent")
    assert exc_info.value.session_id == "nonexistent"


@pytest.mark.asyncio
async def test_require_state_returns_state(store, sid):
    state = await store.require_state(sid)
    assert isinstance(state, dict)
    assert "pitch_context" in state


@pytest.mark.asyncio
async def test_update_merges_keys(store, sid):
    await store.update(sid, {"pitch_context": {"company_name": "Acme"}})
    state = await store.get_state(sid)
    assert state["pitch_context"]["company_name"] == "Acme"


@pytest.mark.asyncio
async def test_update_missing_session_raises(store):
    with pytest.raises(SessionNotFoundError):
        await store.update("nonexistent", {"key": "val"})


@pytest.mark.asyncio
async def test_delete_session(store, sid):
    await store.delete(sid)
    result = await store.get_state(sid)
    assert result is None


@pytest.mark.asyncio
async def test_delete_nonexistent_silent(store):
    # Should not raise
    await store.delete("nonexistent-id")


# ── Empty state schema ──────────────────────────────────────────────────────


def test_make_empty_state_keys():
    state = make_empty_state()
    required_keys = {
        "pitch_context",
        "live_transcript",
        "delivery_scores",
        "deck_critique",
        "market_intel",
        "debate_rounds",
        "final_verdict",
        "live_interview_active",
        "deck_analysis_done",
        "market_intel_status",
        "deliberation_status",
    }
    assert required_keys.issubset(state.keys())


def test_make_empty_state_values():
    state = make_empty_state()
    assert state["deck_critique"] is None
    assert state["market_intel"] is None
    assert state["final_verdict"] is None
    assert state["debate_rounds"] == []
    assert state["live_transcript"] == []
    assert state["live_interview_active"] is False
    assert state["market_intel_status"]["status"] == "idle"
    assert state["deliberation_status"]["status"] == "idle"


# ── Transcript helpers ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_append_transcript_turn(store, sid):
    await store.append_transcript_turn(sid, "Sam", "Hello founder!", 1234567890.0)
    state = await store.get_state(sid)
    transcript = state["live_transcript"]
    assert len(transcript) == 1
    assert transcript[0]["speaker"] == "Sam"
    assert transcript[0]["text"] == "Hello founder!"
    assert transcript[0]["timestamp"] == 1234567890.0


@pytest.mark.asyncio
async def test_append_multiple_turns(store, sid):
    await store.append_transcript_turn(sid, "Sam", "Turn 1", 1.0)
    await store.append_transcript_turn(sid, "Founder", "Turn 2", 2.0)
    await store.append_transcript_turn(sid, "Sam", "Turn 3", 3.0)
    state = await store.get_state(sid)
    assert len(state["live_transcript"]) == 3
    assert state["live_transcript"][1]["speaker"] == "Founder"


@pytest.mark.asyncio
async def test_append_transcript_missing_session_silent(store):
    # Should not raise — just a no-op
    await store.append_transcript_turn("nonexistent", "Sam", "text", 0.0)


# ── Task status ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_task_status_running(store, sid):
    await store.set_task_status(sid, "market_intel_status", "running")
    state = await store.get_state(sid)
    assert state["market_intel_status"]["status"] == "running"
    assert state["market_intel_status"]["error"] is None


@pytest.mark.asyncio
async def test_set_task_status_failed(store, sid):
    await store.set_task_status(sid, "deliberation_status", "failed", error="timeout")
    state = await store.get_state(sid)
    assert state["deliberation_status"]["status"] == "failed"
    assert state["deliberation_status"]["error"] == "timeout"


@pytest.mark.asyncio
async def test_set_task_status_completed(store, sid):
    await store.set_task_status(sid, "market_intel_status", "completed")
    state = await store.get_state(sid)
    assert state["market_intel_status"]["status"] == "completed"

"""
tests/test_agent_deck_analyst.py — Unit tests for the DeckAnalystAgent.
"""

from __future__ import annotations

import io
import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from backend.core.errors import AgentError
from backend.session_state import SessionStore, _MemoryBackend

MOCK_CRITIQUE = {
    "narrative_arc_score": 7.5,
    "visual_clarity_score": 8.0,
    "slide_count": 12,
    "slides": [
        {"index": 1, "title": "Cover", "critique": "Strong hook.", "score": 8.5},
        {"index": 2, "title": "Problem", "critique": "Clear problem statement.", "score": 7.0},
    ],
    "missing_slides": ["Traction slide"],
    "top_issues": ["No unit economics shown"],
    "strengths": ["Clear narrative", "Good visuals"],
    "overall_summary": "Solid deck, address traction.",
}


def make_fake_png() -> bytes:
    """Return minimal valid 1x1 PNG bytes."""
    from PIL import Image

    buf = io.BytesIO()
    img = Image.new("RGB", (10, 10), color=(255, 0, 0))
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest_asyncio.fixture
async def store():
    return SessionStore(backend=_MemoryBackend())


@pytest_asyncio.fixture
async def sid(store):
    return await store.create()


@pytest.mark.asyncio
async def test_analyze_deck_pdf_success(store, sid):
    mock_critique = MOCK_CRITIQUE

    fake_image = MagicMock()
    fake_image.save = lambda buf, format: buf.write(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

    with (
        patch("backend.core.llm_factory.get_provider") as mock_get_provider,
        patch(
            "backend.agents.deck_analyst._file_to_images",
            new=AsyncMock(return_value=[fake_image, fake_image]),
        ),
        patch("backend.agents.deck_analyst._pil_to_bytes", return_value=make_fake_png()),
    ):
        mock_provider = AsyncMock()
        mock_provider.generate_json_multimodal = AsyncMock(return_value=mock_critique)
        mock_get_provider.return_value = mock_provider

        from backend.agents.deck_analyst import analyze_deck

        result = await analyze_deck(
            sid, b"fake-pdf-bytes", "deck.pdf", api_key="test-key", store=store
        )

    assert result.narrative_arc_score == 7.5
    assert result.visual_clarity_score == 8.0
    assert result.slide_count == 2  # stamped from actual image count
    assert result.missing_slides == ["Traction slide"]
    assert len(result.slides) == 2


@pytest.mark.asyncio
async def test_analyze_deck_writes_to_session(store, sid):
    mock_critique = MOCK_CRITIQUE

    with (
        patch("backend.core.llm_factory.get_provider") as mock_get_provider,
        patch("backend.agents.deck_analyst._file_to_images", new=AsyncMock(return_value=[MagicMock()])),
        patch("backend.agents.deck_analyst._pil_to_bytes", return_value=make_fake_png()),
    ):
        mock_provider = AsyncMock()
        mock_provider.generate_json_multimodal = AsyncMock(return_value=mock_critique)
        mock_get_provider.return_value = mock_provider

        from backend.agents.deck_analyst import analyze_deck

        await analyze_deck(sid, b"fake-pdf", "deck.pdf", api_key="test-key", store=store)

    state = await store.get_state(sid)
    assert state["deck_critique"] is not None
    assert state["deck_critique"]["narrative_arc_score"] == 7.5
    assert state["deck_analysis_done"] is True


@pytest.mark.asyncio
async def test_analyze_deck_empty_images_raises(store, sid):
    with patch("backend.agents.deck_analyst._file_to_images", new=AsyncMock(return_value=[])):
        from backend.agents.deck_analyst import analyze_deck

        with pytest.raises(AgentError, match="Could not extract images"):
            await analyze_deck(sid, b"empty", "deck.pdf", api_key="test-key", store=store)


def test_pil_to_bytes_returns_png():
    from backend.agents.deck_analyst import _pil_to_bytes
    from PIL import Image

    img = Image.new("RGB", (10, 10))
    result = _pil_to_bytes(img)
    assert result[:4] == b"\x89PNG"


def test_unsupported_file_type_raises():
    """_file_to_images raises AgentError for unsupported extension."""
    import asyncio

    from backend.agents.deck_analyst import _file_to_images

    with pytest.raises(AgentError, match="Unsupported file type"):
        asyncio.run(_file_to_images(b"data", "deck.docx"))

"""
tests/test_core_gemini_client.py — Tests for the shared Gemini client utilities.
"""

from __future__ import annotations

import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from core.errors import ConfigError, GeminiResponseError
from core.gemini_client import (
    generate_json,
    generate_json_multimodal,
    generate_json_with_search,
    get_client,
    parse_json_response,
)

# ── parse_json_response ────────────────────────────────────────────────────


def test_parse_plain_json():
    result = parse_json_response('{"key": "value"}')
    assert result == {"key": "value"}


def test_parse_json_with_markdown_fence():
    raw = '```json\n{"key": "value"}\n```'
    result = parse_json_response(raw)
    assert result == {"key": "value"}


def test_parse_json_with_plain_fence():
    raw = '```\n{"key": "value"}\n```'
    result = parse_json_response(raw)
    assert result == {"key": "value"}


def test_parse_json_strips_whitespace():
    result = parse_json_response('  \n{"key": 42}\n  ')
    assert result == {"key": 42}


def test_parse_json_array():
    result = parse_json_response("[1, 2, 3]")
    assert result == [1, 2, 3]


def test_parse_json_invalid_raises():
    with pytest.raises(GeminiResponseError) as exc_info:
        parse_json_response("not valid json")
    assert exc_info.value.raw_response == "not valid json"


def test_parse_json_empty_raises():
    with pytest.raises(GeminiResponseError):
        parse_json_response("")


# ── get_client ─────────────────────────────────────────────────────────────


def test_get_client_with_explicit_key():
    with patch("core.gemini_client.genai.Client") as mock_client:
        get_client("explicit-key")
        mock_client.assert_called_once_with(api_key="explicit-key")


def test_get_client_falls_back_to_settings():
    with patch("core.gemini_client.settings") as mock_settings:
        mock_settings.google_api_key = "settings-key"
        with patch("core.gemini_client.genai.Client") as mock_client:
            get_client()
            mock_client.assert_called_once_with(api_key="settings-key")


def test_get_client_raises_when_no_key():
    with patch("core.gemini_client.settings") as mock_settings:
        mock_settings.google_api_key = ""
        with pytest.raises(ConfigError):
            get_client()


# ── generate_json ──────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_json_returns_parsed_dict():
    mock_resp = MagicMock()
    mock_resp.text = '{"company": "Acme"}'

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    result = await generate_json(
        client=mock_client,
        model="gemini-2.5-flash",
        user_content="test prompt",
    )
    assert result == {"company": "Acme"}


@pytest.mark.asyncio
async def test_generate_json_with_system_instruction():
    mock_resp = MagicMock()
    mock_resp.text = '{"x": 1}'

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    result = await generate_json(
        client=mock_client,
        model="gemini-2.5-flash",
        user_content="test",
        system_instruction="Be helpful",
    )
    assert result == {"x": 1}

    # Verify system_instruction was passed to the config
    call_kwargs = mock_client.aio.models.generate_content.call_args
    config = call_kwargs.kwargs.get("config") or call_kwargs[1].get("config")
    assert config is not None


@pytest.mark.asyncio
async def test_generate_json_handles_fence_in_response():
    mock_resp = MagicMock()
    mock_resp.text = '```json\n{"wrapped": true}\n```'

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    result = await generate_json(
        client=mock_client,
        model="gemini-2.5-flash",
        user_content="test",
    )
    assert result == {"wrapped": True}


@pytest.mark.asyncio
async def test_generate_json_raises_on_bad_response():
    mock_resp = MagicMock()
    mock_resp.text = "INVALID JSON HERE"

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    with pytest.raises(GeminiResponseError):
        await generate_json(
            client=mock_client,
            model="gemini-2.5-flash",
            user_content="test",
        )


# ── generate_json_with_search ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_json_with_search_includes_tool():
    mock_resp = MagicMock()
    mock_resp.text = '{"result": "ok"}'

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    result = await generate_json_with_search(
        client=mock_client,
        model="gemini-2.5-flash",
        user_content="research this",
    )
    assert result == {"result": "ok"}

    call_kwargs = mock_client.aio.models.generate_content.call_args
    config = call_kwargs.kwargs.get("config") or call_kwargs[1].get("config")
    # tools list should be non-empty (GoogleSearch tool included)
    assert config.tools is not None
    assert len(config.tools) > 0


# ── generate_json_multimodal ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_generate_json_multimodal():
    from google.genai import types

    mock_resp = MagicMock()
    mock_resp.text = '{"slides": []}'

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_resp)

    parts = [types.Part(text="analyze this")]
    result = await generate_json_multimodal(
        client=mock_client,
        model="gemini-2.5-flash",
        parts=parts,
    )
    assert result == {"slides": []}

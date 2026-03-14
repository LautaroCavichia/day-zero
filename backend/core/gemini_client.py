"""
core/gemini_client.py — Shared Gemini client factory and response utilities.

Eliminates the per-module client construction and the repeated JSON
fence-stripping boilerplate that was copy-pasted into every agent.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from config import settings
from google import genai
from google.genai import types

from core.errors import ConfigError, GeminiResponseError

logger = logging.getLogger(__name__)


# ── Client factory ─────────────────────────────────────────────────────────


def get_client(api_key: str | None = None) -> genai.Client:
    """
    Return a configured Gemini ``genai.Client``.

    If *api_key* is not provided, falls back to ``settings.google_api_key``.
    Raises ``ConfigError`` if no key is available.
    """
    key = api_key or settings.google_api_key
    if not key:
        raise ConfigError(
            "GOOGLE_API_KEY is not configured. "
            "Set it in the .env file or as an environment variable."
        )
    return genai.Client(api_key=key)


# ── JSON response parsing ──────────────────────────────────────────────────


def parse_json_response(raw: str) -> Any:
    """
    Parse a JSON string from a Gemini response.

    Handles the common case where the model wraps its output in markdown
    code fences (```json … ```) even when asked not to.

    Raises ``GeminiResponseError`` if the string cannot be parsed.
    """
    text = raw.strip()

    # Strip optional language tag + closing fence
    if text.startswith("```"):
        # Remove opening fence (```json or ```)
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        # Remove closing fence
        if "```" in text:
            text = text.rsplit("```", 1)[0]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise GeminiResponseError(
            f"Could not parse Gemini response as JSON: {exc}",
            raw_response=raw,
        ) from exc


# ── High-level generate helper ─────────────────────────────────────────────


async def generate_json(
    *,
    client: genai.Client,
    model: str,
    user_content: str,
    system_instruction: str | None = None,
    temperature: float | None = None,
) -> Any:
    """
    Call ``generate_content`` with ``response_mime_type="application/json"``
    and return the parsed Python object.

    This is the standard path used by all non-Live agents.
    Raises ``GeminiResponseError`` on parse failure.
    """
    config_kwargs: dict[str, Any] = {
        "response_mime_type": "application/json",
    }
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction
    if temperature is not None:
        config_kwargs["temperature"] = temperature

    response = await client.aio.models.generate_content(
        model=model,
        contents=[
            types.Content(
                role="user",
                parts=[types.Part(text=user_content)],
            )
        ],
        config=types.GenerateContentConfig(**config_kwargs),
    )

    raw = response.text or ""
    return parse_json_response(raw)


async def generate_json_with_search(
    *,
    client: genai.Client,
    model: str,
    user_content: str,
    system_instruction: str | None = None,
) -> Any:
    """
    Like ``generate_json`` but enables the Google Search grounding tool.
    Used exclusively by the MarketValidatorAgent.
    """
    config_kwargs: dict[str, Any] = {
        "tools": [types.Tool(google_search=types.GoogleSearch())],
        "response_mime_type": "application/json",
    }
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction

    response = await client.aio.models.generate_content(
        model=model,
        contents=[
            types.Content(
                role="user",
                parts=[types.Part(text=user_content)],
            )
        ],
        config=types.GenerateContentConfig(**config_kwargs),
    )

    raw = response.text or ""
    return parse_json_response(raw)


async def generate_json_multimodal(
    *,
    client: genai.Client,
    model: str,
    parts: list[types.Part],
) -> Any:
    """
    Call ``generate_content`` with arbitrary multimodal *parts* and parse
    the JSON response.  Used by the DeckAnalystAgent.
    """
    response = await client.aio.models.generate_content(
        model=model,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        ),
    )

    raw = response.text or ""
    return parse_json_response(raw)

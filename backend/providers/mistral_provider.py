"""
providers/mistral_provider.py — Mistral LLM provider.

Uses the Mistral REST API via ``httpx`` for text generation.
Uses the Tavily Search API for web-grounded market validation.

Audio streaming is NOT supported by Mistral.  For real-time audio interviews,
use the OpenAI provider (``llm_provider=openai``) which implements the
OpenAI Realtime API (gpt-4o-realtime-preview).

To switch to Mistral:
    LLM_PROVIDER=mistral
    MISTRAL_API_KEY=<your-key>
    TAVILY_API_KEY=<your-key>          # optional but recommended for market validation
    ENABLE_LIVE_INTERVIEW=false        # Mistral has no audio streaming
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from backend.config import settings
from backend.core.errors import ConfigError, LLMProviderError, LLMResponseError, RateLimitError
from backend.core.llm_provider import LLMProvider
from backend.core.llm_types import MultimodalMessage

logger = logging.getLogger(__name__)


class MistralProvider(LLMProvider):
    """LLM provider backed by the Mistral REST API + Tavily web search."""

    def __init__(self, api_key: str | None = None) -> None:
        resolved_key = api_key or settings.mistral_api_key
        if not resolved_key:
            raise ConfigError(
                "MISTRAL_API_KEY is not configured.  "
                "Set it in the .env file or as an environment variable."
            )

        self._client = httpx.AsyncClient(
            base_url=settings.mistral_api_base,
            headers={
                "Authorization": f"Bearer {resolved_key}",
                "Content-Type": "application/json",
            },
            timeout=120.0,
        )

    # ── Text generation ────────────────────────────────────────────────────

    async def generate_json(
        self,
        model: str,
        user_message: str,
        system_instruction: str | None = None,
        temperature: float | None = None,
    ) -> Any:
        messages: list[dict] = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": user_message})

        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "response_format": {"type": "json_object"},
        }
        if temperature is not None:
            payload["temperature"] = temperature

        try:
            response = await self._client.post("/chat/completions", json=payload)
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise self._translate_error(exc) from exc
        except httpx.RequestError as exc:
            raise LLMProviderError(
                f"Mistral API request failed: {exc}", provider="mistral"
            ) from exc

        text = response.json()["choices"][0]["message"]["content"]
        return _parse_json(text)

    async def generate_json_with_search(
        self,
        model: str,
        user_message: str,
        system_instruction: str | None = None,
    ) -> Any:
        """
        Run web search via Tavily, inject the results into the prompt, then
        call Mistral for the structured JSON response.

        Falls back to plain ``generate_json`` if no Tavily key is configured.
        """
        if not settings.tavily_api_key:
            logger.warning(
                "TAVILY_API_KEY not set — market validation will run without web search. "
                "Set TAVILY_API_KEY for grounded results."
            )
            return await self.generate_json(model, user_message, system_instruction)

        search_context = await _tavily_search(user_message)
        augmented_message = (
            f"{user_message}\n\n"
            "---\n"
            "RECENT WEB SEARCH RESULTS (use these as sources, cite URLs):\n"
            f"{search_context}\n"
            "---"
        )
        return await self.generate_json(model, augmented_message, system_instruction)

    async def generate_json_multimodal(
        self,
        model: str,
        messages: list[MultimodalMessage],
    ) -> Any:
        """
        Call Mistral with multimodal input (text + images as base64 data URLs).

        Mistral supports vision via the same ``/chat/completions`` endpoint
        using ``image_url`` content parts with ``data:<mime>;base64,<data>`` URLs.
        """
        import base64

        api_messages: list[dict] = []
        for msg in messages:
            content: list[dict] = []
            if msg.text:
                content.append({"type": "text", "text": msg.text})
            for img in msg.images:
                b64 = base64.b64encode(img.data).decode("utf-8")
                content.append(
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{img.mime_type};base64,{b64}"},
                    }
                )
            api_messages.append({"role": msg.role, "content": content})

        try:
            response = await self._client.post(
                "/chat/completions",
                json={
                    "model": model,
                    "messages": api_messages,
                    "response_format": {"type": "json_object"},
                },
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise self._translate_error(exc) from exc
        except httpx.RequestError as exc:
            raise LLMProviderError(
                f"Mistral API request failed: {exc}", provider="mistral"
            ) from exc

        text = response.json()["choices"][0]["message"]["content"]
        return _parse_json(text)

    # ── Live audio streaming ───────────────────────────────────────────────

    async def stream_live_audio(
        self,
        websocket: Any,
        model: str,
        system_instruction: str,
        session_id: str,
        store: Any = None,
    ) -> None:
        raise NotImplementedError(
            "Mistral does not support real-time audio streaming.\n"
            "Recommended alternatives:\n"
            "  1. Switch to the OpenAI provider (LLM_PROVIDER=openai) which implements\n"
            "     the OpenAI Realtime API (gpt-4o-realtime-preview) for bidirectional\n"
            "     PCM audio — the closest equivalent to Google Live API.\n"
            "  2. Keep Google provider active only for live interviews:\n"
            "     set LLM_PROVIDER=google and ENABLE_LIVE_INTERVIEW=true.\n"
            "  3. Disable live interviews entirely:\n"
            "     set ENABLE_LIVE_INTERVIEW=false."
        )

    # ── Error translation ──────────────────────────────────────────────────

    @staticmethod
    def _translate_error(exc: httpx.HTTPStatusError) -> LLMProviderError:
        status = exc.response.status_code
        if status == 429:
            return RateLimitError(
                "Mistral API rate limit exceeded.  "
                "Check your plan or add a delay between requests.",
                status_code=status,
                provider="mistral",
            )
        if status in (401, 403):
            return ConfigError(
                "Mistral API authentication failed.  "
                "Verify your MISTRAL_API_KEY is valid."
            )
        return LLMProviderError(
            f"Mistral API error (HTTP {status}): {exc.response.text[:200]}",
            status_code=status,
            provider="mistral",
        )

    # ── Context manager (allows ``async with MistralProvider() as p:``) ───

    async def __aenter__(self) -> "MistralProvider":
        await self._client.__aenter__()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self._client.__aexit__(*args)


# ── Tavily search helper ───────────────────────────────────────────────────


async def _tavily_search(query: str) -> str:
    """
    Run a Tavily web search and return a formatted context string.

    Each result is formatted as::

        [1] Title (domain.com)
        URL: https://...
        Published: 2025-01-15
        Snippet: ...

    Returns an empty string (with a warning) if the search fails.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key": settings.tavily_api_key,
                    "query": query,
                    "search_depth": settings.tavily_search_depth,
                    "include_answer": False,
                    "include_raw_content": False,
                    "max_results": settings.tavily_max_results,
                },
            )
            response.raise_for_status()
    except Exception as exc:
        logger.warning("Tavily search failed: %s — proceeding without web context", exc)
        return ""

    results = response.json().get("results", [])
    if not results:
        logger.info("Tavily search returned 0 results for query: %s", query[:80])
        return ""

    lines: list[str] = []
    for i, r in enumerate(results[: settings.tavily_max_results], start=1):
        title = r.get("title", "Untitled")
        url = r.get("url", "")
        published = r.get("published_date", "")
        snippet = r.get("content", "")[:400]
        # Extract domain for display
        domain_match = re.search(r"https?://([^/]+)", url)
        domain = domain_match.group(1) if domain_match else url
        lines.append(
            f"[{i}] {title} ({domain})\n"
            f"URL: {url}\n"
            + (f"Published: {published}\n" if published else "")
            + f"Snippet: {snippet}"
        )

    logger.info("Tavily search: %d results for query: %s", len(results), query[:80])
    return "\n\n".join(lines)


# ── JSON parsing ───────────────────────────────────────────────────────────


def _parse_json(raw: str) -> Any:
    """
    Strip optional markdown fences and parse JSON.

    Raises ``LLMResponseError`` on failure.
    """
    text = raw.strip()
    text = re.sub(r"^<[^>]+>\s*", "", text)
    text = re.sub(r"\s*</[^>]+>$", "", text)
    text = text.strip()

    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if "```" in text:
            text = text.rsplit("```", 1)[0]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise LLMResponseError(
            f"Could not parse Mistral response as JSON: {exc}",
            raw_response=raw,
        ) from exc

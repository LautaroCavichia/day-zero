"""
core/llm_provider.py — Abstract base class for all LLM providers.

Every concrete provider (Google, Mistral, OpenAI, …) must implement these
methods.  Agent code only imports this interface, never a concrete provider.
"""

from __future__ import annotations

import abc
from typing import Any

from backend.core.llm_types import MultimodalMessage


class LLMProvider(abc.ABC):
    """Abstract base for all LLM providers."""

    # ── Text generation ────────────────────────────────────────────────────

    @abc.abstractmethod
    async def generate_json(
        self,
        model: str,
        user_message: str,
        system_instruction: str | None = None,
        temperature: float | None = None,
    ) -> Any:
        """
        Generate a JSON-structured response from the model.

        Returns the parsed Python object (dict / list).
        Raises ``LLMProviderError`` on API-level failures.
        Raises ``LLMResponseError`` when the response cannot be parsed as JSON.
        """

    @abc.abstractmethod
    async def generate_json_with_search(
        self,
        model: str,
        user_message: str,
        system_instruction: str | None = None,
    ) -> Any:
        """
        Like ``generate_json`` but with web search / grounding enabled.

        Implementations that do not support grounding should fall back to
        ``generate_json`` and log a warning.
        """

    @abc.abstractmethod
    async def generate_json_multimodal(
        self,
        model: str,
        messages: list[MultimodalMessage],
    ) -> Any:
        """
        Generate a JSON response from a multimodal prompt (text + images).

        Raises ``NotImplementedError`` for providers that do not support
        vision/multimodal inputs.
        """

    # ── Live audio streaming ───────────────────────────────────────────────

    @abc.abstractmethod
    async def stream_live_audio(
        self,
        websocket: Any,  # fastapi.WebSocket — avoid hard-dep here
        model: str,
        system_instruction: str,
        session_id: str,
    ) -> None:
        """
        Bridge the browser WebSocket ↔ provider Live/Realtime API.

        The implementation owns the full lifecycle of the connection (open,
        forward audio frames, emit transcript events, close).

        Raises ``NotImplementedError`` for providers that do not support
        real-time audio streaming.
        """

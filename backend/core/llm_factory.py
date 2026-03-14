"""
core/llm_factory.py — Provider factory for DayZero.

Usage (the common pattern in every agent):

    from core.llm_factory import get_provider

    provider = get_provider()
    result = await provider.generate_json(
        model=settings.selected_flash_model,
        user_message="...",
    )

The active provider is determined by ``settings.llm_provider`` (env var
``LLM_PROVIDER``).  Pass ``api_key`` to override the key from settings —
useful in tests and for per-request key injection.
"""

from __future__ import annotations

import logging
from typing import Any

from backend.config import LLMProviderEnum, settings
from backend.core.errors import ConfigError
from backend.core.llm_provider import LLMProvider

logger = logging.getLogger(__name__)


def get_provider(api_key: str | None = None) -> LLMProvider:
    """
    Instantiate and return the configured LLM provider.

    Args:
        api_key: Optional API key override (takes precedence over settings).
                 Useful for testing or per-request key injection.

    Returns:
        A concrete ``LLMProvider`` instance.

    Raises:
        ``ConfigError`` if the selected provider's API key is missing.
    """
    provider_type = settings.llm_provider

    if provider_type == LLMProviderEnum.GOOGLE:
        from backend.providers.google_provider import GoogleProvider

        effective_key = api_key or settings.google_api_key or None
        return GoogleProvider(api_key=effective_key)

    if provider_type == LLMProviderEnum.MISTRAL:
        from backend.providers.mistral_provider import MistralProvider

        effective_key = api_key or settings.mistral_api_key or None
        return MistralProvider(api_key=effective_key)

    if provider_type == LLMProviderEnum.OPENAI:
        from backend.providers.openai_provider import OpenAIProvider

        effective_key = api_key or settings.openai_api_key or None
        return OpenAIProvider(api_key=effective_key)

    raise ConfigError(
        f"Unsupported LLM provider: '{provider_type}'.  "
        f"Set LLM_PROVIDER to one of: {[p.value for p in LLMProviderEnum]}."
    )

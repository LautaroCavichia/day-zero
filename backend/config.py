"""
config.py — Centralised configuration for DayZero.

All tuneable values live here.  They can be overridden via environment
variables or a .env file (loaded by python-dotenv before this module
is imported from main.py).

Usage:
    from config import settings, LLMProviderEnum
    settings.llm_provider            # LLMProviderEnum.GOOGLE
    settings.selected_flash_model    # model name for the active provider
    settings.max_upload_bytes        # 52_428_800
"""

from __future__ import annotations

from enum import Enum

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class LLMProviderEnum(str, Enum):
    """Supported LLM provider backends."""

    GOOGLE = "google"
    MISTRAL = "mistral"
    OPENAI = "openai"


class Settings(BaseSettings):
    """DayZero runtime configuration.

    All fields have sane defaults so the app starts without any env vars
    set (except the API key for the selected provider).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Provider selection ────────────────────────────────────────────────────
    llm_provider: LLMProviderEnum = Field(
        default=LLMProviderEnum.GOOGLE,
        description=(
            "Active LLM provider backend.  "
            "Allowed values: google, mistral, openai.  "
            "Set via LLM_PROVIDER env var."
        ),
    )

    # ── Google / Gemini ───────────────────────────────────────────────────────
    google_api_key: str = Field(
        default="",
        description="Google AI Studio API key (required when llm_provider=google).",
    )
    google_cloud_project: str = Field(default="", description="GCP project ID.")
    google_cloud_region: str = Field(default="us-central1", description="GCP region.")

    gemini_flash_model: str = Field(
        default="gemini-2.5-flash",
        description="Gemini model used for analysis agents.",
    )
    gemini_live_model: str = Field(
        default="gemini-2.5-flash-native-audio-preview-12-2025",
        description="Gemini model used for the Live Interview audio WebSocket.",
    )

    # ── Mistral ───────────────────────────────────────────────────────────────
    mistral_api_key: str = Field(
        default="",
        description="Mistral API key (required when llm_provider=mistral).",
    )
    mistral_api_base: str = Field(
        default="https://api.mistral.ai/v1",
        description="Mistral REST API base URL.",
    )
    mistral_flash_model: str = Field(
        default="mistral-large-latest",
        description="Mistral model used for analysis agents.",
    )

    # ── OpenAI ────────────────────────────────────────────────────────────────
    openai_api_key: str = Field(
        default="",
        description=(
            "OpenAI API key (required when llm_provider=openai).  "
            "Also used for the OpenAI Realtime audio provider which is the "
            "recommended audio-streaming alternative to Google Live API."
        ),
    )
    openai_chat_model: str = Field(
        default="gpt-4o-mini",
        description="OpenAI model used for analysis agents.",
    )
    openai_realtime_model: str = Field(
        default="gpt-4o-realtime-preview",
        description=(
            "OpenAI Realtime model used for live audio interview.  "
            "Requires llm_provider=openai."
        ),
    )
    openai_realtime_voice: str = Field(
        default="alloy",
        description="Voice used by the OpenAI Realtime API (alloy, echo, shimmer, …).",
    )

    # ── Tavily web search ─────────────────────────────────────────────────────
    tavily_api_key: str = Field(
        default="",
        description=(
            "Tavily Search API key.  Required for market validation when "
            "llm_provider != google (Google Search grounding is Google-only)."
        ),
    )
    tavily_search_depth: str = Field(
        default="basic",
        description="Tavily search depth: 'basic' (faster) or 'advanced' (more results).",
    )
    tavily_max_results: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of Tavily search results to include in the prompt.",
    )

    # ── Session ───────────────────────────────────────────────────────────────
    app_name: str = Field(default="dayzero", description="ADK application name.")
    default_user_id: str = Field(
        default="founder",
        description="Hardcoded user-id per session (single-user model for hackathon).",
    )
    session_backend: str = Field(
        default="sqlite",
        description="Session storage backend: 'sqlite' or 'memory'.",
    )
    session_db_path: str = Field(
        default="data/dayzero.db",
        description="Path to SQLite database file (when session_backend='sqlite').",
    )
    session_ttl_hours: int = Field(
        default=24,
        ge=1,
        description="Session time-to-live in hours.",
    )
    session_cleanup_interval_minutes: int = Field(
        default=60,
        ge=5,
        description="Interval (minutes) between session cleanup tasks.",
    )

    # ── Readiness checks ───────────────────────────────────────────────────────
    readiness_gemini_check: bool = Field(
        default=True,
        description="Enable connectivity check to Gemini during readiness probe.",
    )

    # ── Debate ────────────────────────────────────────────────────────────────
    debate_rounds: int = Field(default=3, ge=1, le=10, description="Number of deliberation rounds.")
    debate_context_transcript_turns: int = Field(
        default=20,
        ge=1,
        description="Max live transcript turns injected into each persona prompt.",
    )
    debate_context_dialogue_chars: int = Field(
        default=300,
        ge=50,
        description="Max chars of each persona dialogue shown in previous-round summary.",
    )

    # ── Deck analysis ─────────────────────────────────────────────────────────
    deck_render_dpi: int = Field(
        default=150,
        ge=72,
        le=300,
        description="DPI used when rasterising PDF slides for the vision model.",
    )
    max_upload_bytes: int = Field(
        default=50 * 1024 * 1024,
        description="Maximum pitch deck file size in bytes (default 50 MB).",
    )
    libreoffice_timeout_seconds: int = Field(
        default=60,
        ge=10,
        description="Subprocess timeout for LibreOffice PPTX→PDF conversion.",
    )

    # ── Audio pipeline ────────────────────────────────────────────────────────
    live_api_input_sample_rate: int = Field(
        default=16000, description="PCM input sample rate expected by the Live API."
    )
    live_api_output_sample_rate: int = Field(
        default=24000, description="PCM output sample rate returned by the Live API."
    )

    # ── Server ────────────────────────────────────────────────────────────────
    host: str = Field(default="0.0.0.0", description="Uvicorn bind host.")
    port: int = Field(default=8080, ge=1, le=65535, description="Uvicorn bind port.")
    cors_origins: list[str] = Field(
        default=["*"],
        description=(
            "CORS allowed origins. Set to specific domains in production, "
            'e.g. ["https://dayzero.app"].'
        ),
    )
    log_level: str = Field(default="INFO", description="Python logging level.")
    log_format: str = Field(
        default="default",
        description="Logging format: 'default' or 'json'.",
    )

    # ── Feature flags ─────────────────────────────────────────────────────────
    enable_deck_analysis: bool = Field(
        default=True, description="Enable/disable pitch deck upload and analysis."
    )
    enable_market_validation: bool = Field(
        default=True, description="Enable/disable market research (uses web search)."
    )
    enable_live_interview: bool = Field(
        default=True, description="Enable/disable live audio interview WebSocket."
    )

    # ── Convenience properties ────────────────────────────────────────────────

    @property
    def api_key_set(self) -> bool:
        """True when the active provider's API key is configured."""
        return bool(self._active_api_key)

    @property
    def _active_api_key(self) -> str:
        if self.llm_provider == LLMProviderEnum.GOOGLE:
            return self.google_api_key
        if self.llm_provider == LLMProviderEnum.MISTRAL:
            return self.mistral_api_key
        if self.llm_provider == LLMProviderEnum.OPENAI:
            return self.openai_api_key
        return ""

    @property
    def selected_flash_model(self) -> str:
        """Fast analysis model for the active provider."""
        if self.llm_provider == LLMProviderEnum.GOOGLE:
            return self.gemini_flash_model
        if self.llm_provider == LLMProviderEnum.MISTRAL:
            return self.mistral_flash_model
        if self.llm_provider == LLMProviderEnum.OPENAI:
            return self.openai_chat_model
        return ""

    @property
    def selected_live_model(self) -> str:
        """Real-time / streaming model for the active provider."""
        if self.llm_provider == LLMProviderEnum.GOOGLE:
            return self.gemini_live_model
        if self.llm_provider == LLMProviderEnum.OPENAI:
            return self.openai_realtime_model
        # Mistral does not support real-time audio; return flash model as fallback
        return self.selected_flash_model


# Module-level singleton — import this everywhere.
settings = Settings()

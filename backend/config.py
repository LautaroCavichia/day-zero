"""
config.py — Centralised configuration for DayZero.

All tuneable values live here.  They can be overridden via environment
variables or a .env file (loaded by python-dotenv before this module
is imported from main.py).

Usage:
    from config import settings
    settings.gemini_flash_model      # "gemini-2.5-flash"
    settings.max_upload_bytes        # 52_428_800
"""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """DayZero runtime configuration.

    All fields have sane defaults so the app starts without any env vars
    set (except GOOGLE_API_KEY which is required for any real work).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── API Keys ──────────────────────────────────────────────────────────────
    google_api_key: str = Field(
        default="",
        description="Google AI Studio API key (required for all Gemini calls).",
    )

    # ── Session persistence ───────────────────────────────────────────────────
    session_backend: str = Field(
        default="sqlite",
        description=(
            "Session storage backend. "
            '"sqlite" persists to disk (default). '
            '"memory" uses in-memory storage (tests / ephemeral envs).'
        ),
    )
    session_db_path: str = Field(
        default="data/dayzero.db",
        description="Path to the SQLite database file (used when session_backend=sqlite).",
    )
    session_ttl_hours: int = Field(
        default=24,
        ge=1,
        description="Sessions inactive for longer than this (hours) are purged by the cleanup task.",
    )
    session_cleanup_interval_minutes: int = Field(
        default=60,
        ge=1,
        description="How often (minutes) the background session cleanup task runs.",
    )

    # ── GCP (optional, for Cloud Run deployment) ──────────────────────────────
    google_cloud_project: str = Field(default="", description="GCP project ID.")
    google_cloud_region: str = Field(default="us-central1", description="GCP region.")

    # ── Model names ───────────────────────────────────────────────────────────
    gemini_flash_model: str = Field(
        default="gemini-2.5-flash",
        description="Model used for analysis agents (orchestrator, deck, market, debate).",
    )
    gemini_live_model: str = Field(
        default="gemini-2.5-flash-native-audio-preview-12-2025",
        description="Model used for the Live Interview audio WebSocket.",
    )

    # ── Session ───────────────────────────────────────────────────────────────
    app_name: str = Field(default="dayzero", description="ADK application name.")
    default_user_id: str = Field(
        default="founder",
        description="Hardcoded user-id per session (single-user model for hackathon).",
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
        default="text",
        description=(
            'Log output format. "text" for human-readable (dev), '
            '"json" for structured JSON lines (production / Cloud Run).'
        ),
    )

    # ── WebSocket ─────────────────────────────────────────────────────────────
    ws_heartbeat_interval_seconds: int = Field(
        default=20,
        ge=5,
        description="How often (seconds) the server sends a ping frame on open WebSockets.",
    )

    # ── Feature flags ─────────────────────────────────────────────────────────
    enable_deck_analysis: bool = Field(
        default=True, description="Enable/disable pitch deck upload and analysis."
    )
    enable_market_validation: bool = Field(
        default=True, description="Enable/disable Google Search grounded market research."
    )
    enable_live_interview: bool = Field(
        default=True, description="Enable/disable live audio interview WebSocket."
    )

    # ── Health check ──────────────────────────────────────────────────────────
    readiness_gemini_check: bool = Field(
        default=True,
        description=(
            "If True, /health/ready tests Gemini connectivity via countTokens. "
            "Set to False in CI / envs without a real API key."
        ),
    )

    # ── Derived helpers ───────────────────────────────────────────────────────
    @property
    def api_key_set(self) -> bool:
        return bool(self.google_api_key)


# Module-level singleton — import this everywhere.
settings = Settings()

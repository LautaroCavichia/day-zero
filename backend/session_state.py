"""
session_state.py — DayZero session schema and management.

Uses ADK InMemorySessionService for local dev.
Session state schema mirrors ARCHITECTURE.md §5 and core/models.py.

The SessionStore class wraps ADK's service so it can be replaced with
a different backend (SQLite, Redis) by swapping the dependency in tests
or production without touching any agent code.
"""

from __future__ import annotations

import uuid
from typing import Any

from config import settings
from core.errors import SessionNotFoundError
from google.adk.sessions import InMemorySessionService

APP_NAME = settings.app_name


def make_empty_state() -> dict[str, Any]:
    """Return a fresh, fully-typed session.state dict."""
    return {
        # ── Input context ────────────────────────────────────────────────
        "pitch_context": {
            "company_name": "",
            "one_liner": "",
            "problem": "",
            "solution": "",
            "target_customer": "",
            "business_model": "",
            "traction": "",
            "team": "",
            "ask": "",
            "stage": "",
        },
        # ── Live interview ───────────────────────────────────────────────
        "live_transcript": [],  # [{ speaker, text, timestamp }]
        "delivery_scores": {
            "confidence": 0.0,
            "specificity": 0.0,
            "energy": 0.0,
            "hesitation_count": 0,
        },
        # ── Deck analysis ────────────────────────────────────────────────
        "deck_critique": None,
        # ── Market intelligence ──────────────────────────────────────────
        "market_intel": None,
        # ── Deliberation ─────────────────────────────────────────────────
        "debate_rounds": [],
        # ── Final output ─────────────────────────────────────────────────
        "final_verdict": None,
        # ── Internal flags ───────────────────────────────────────────────
        "live_interview_active": False,
        "deck_analysis_done": False,
        # Background-task statuses: { "status": "idle|running|completed|failed", "error": None }
        "market_intel_status": {"status": "idle", "error": None},
        "deliberation_status": {"status": "idle", "error": None},
    }


class SessionStore:
    """
    Thin wrapper around ADK's ``InMemorySessionService``.

    Injecting this object (rather than using a module-level singleton
    directly) makes it possible to swap in a test double in unit tests.
    """

    def __init__(self, service: InMemorySessionService | None = None) -> None:
        self._svc = service or InMemorySessionService()

    # ── CRUD ───────────────────────────────────────────────────────────────

    async def create(self) -> str:
        """Create a new ADK session and return its UUID."""
        session_id = str(uuid.uuid4())
        await self._svc.create_session(
            app_name=APP_NAME,
            user_id=settings.default_user_id,
            session_id=session_id,
            state=make_empty_state(),
        )
        return session_id

    async def get(self, session_id: str):
        """Return the raw ADK Session object or None."""
        return await self._svc.get_session(
            app_name=APP_NAME,
            user_id=settings.default_user_id,
            session_id=session_id,
        )

    async def get_state(self, session_id: str) -> dict[str, Any] | None:
        """Return session.state as a plain dict, or None if not found."""
        session = await self.get(session_id)
        if session is None:
            return None
        return dict(session.state)

    async def require_state(self, session_id: str) -> dict[str, Any]:
        """Like ``get_state`` but raises ``SessionNotFoundError`` on miss."""
        state = await self.get_state(session_id)
        if state is None:
            raise SessionNotFoundError(session_id)
        return state

    def _get_stored(self, session_id: str):
        """Return the **live** (non-copied) stored Session object, or None.

        ADK's ``get_session`` always returns a deep copy, so mutations to
        the returned object never persist.  This helper accesses the internal
        ``sessions`` dict directly so callers can mutate state in-place.
        """
        return (
            self._svc.sessions.get(APP_NAME, {}).get(settings.default_user_id, {}).get(session_id)
        )

    async def update(self, session_id: str, updates: dict[str, Any]) -> None:
        """Merge *updates* into session.state. Raises on missing session."""
        stored = self._get_stored(session_id)
        if stored is None:
            raise SessionNotFoundError(session_id)
        stored.state.update(updates)

    async def delete(self, session_id: str) -> None:
        """Delete a session. Silently ignores missing sessions."""
        await self._svc.delete_session(
            app_name=APP_NAME,
            user_id=settings.default_user_id,
            session_id=session_id,
        )

    # ── Domain helpers ─────────────────────────────────────────────────────

    async def append_transcript_turn(
        self,
        session_id: str,
        speaker: str,
        text: str,
        timestamp: float,
    ) -> None:
        """Append a single turn to ``live_transcript``."""
        stored = self._get_stored(session_id)
        if stored is None:
            return
        transcript = list(stored.state.get("live_transcript", []))
        transcript.append({"speaker": speaker, "text": text, "timestamp": timestamp})
        stored.state["live_transcript"] = transcript

    async def set_task_status(
        self,
        session_id: str,
        task_key: str,
        status: str,
        error: str | None = None,
    ) -> None:
        """
        Update the status of a background task stored in session state.

        Args:
            session_id: Target session.
            task_key: ``"market_intel_status"`` or ``"deliberation_status"``.
            status: One of ``"idle" | "running" | "completed" | "failed"``.
            error: Optional error message (set when status == "failed").
        """
        await self.update(session_id, {task_key: {"status": status, "error": error}})


# ── Module-level default store (used by FastAPI app) ──────────────────────
# Agents should accept a SessionStore parameter so they can be tested with
# a different instance, but the default allows zero-config usage.

default_store = SessionStore()


# ── Legacy module-level helpers (kept for backward compat during refactor) ─

session_service = default_store._svc  # noqa: SLF001  (used by orchestrator.py)


async def create_session() -> str:
    return await default_store.create()


async def get_session(session_id: str):
    return await default_store.get(session_id)


async def get_state(session_id: str) -> dict[str, Any] | None:
    return await default_store.get_state(session_id)


async def update_state(session_id: str, updates: dict[str, Any]) -> None:
    await default_store.update(session_id, updates)


async def append_transcript_turn(
    session_id: str, speaker: str, text: str, timestamp: float
) -> None:
    await default_store.append_transcript_turn(session_id, speaker, text, timestamp)


async def delete_session(session_id: str) -> None:
    await default_store.delete(session_id)

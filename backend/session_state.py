"""
session_state.py — DayZero session schema and management.

The ``SessionStore`` class is the single interface all agents use to read
and write session state.  The concrete backend is chosen at startup based
on ``settings.session_backend``:

  "sqlite"  — SqliteSessionStore: persists to disk, survives restarts (default)
  "memory"  — MemorySessionStore: fast in-process store, used in tests

Session state schema mirrors ARCHITECTURE.md §5 and core/models.py.
"""

from __future__ import annotations

import logging
from typing import Any

from backend.config import settings

logger = logging.getLogger(__name__)


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


# ── In-memory backend (tests + fallback) ───────────────────────────────────


class _MemoryBackend:
    """
    Lightweight in-process session store with no external dependencies.
    Used when ``settings.session_backend == "memory"`` and in tests.
    """

    def __init__(self) -> None:
        self._store: dict[str, dict[str, Any]] = {}

    async def initialize(self) -> None:
        pass  # nothing to set up

    async def create(self, initial_state: dict[str, Any]) -> str:
        import uuid

        session_id = str(uuid.uuid4())
        self._store[session_id] = dict(initial_state)
        return session_id

    async def get_state(self, session_id: str) -> dict[str, Any] | None:
        data = self._store.get(session_id)
        return dict(data) if data is not None else None

    async def require_state(self, session_id: str) -> dict[str, Any]:
        from backend.core.errors import SessionNotFoundError

        state = await self.get_state(session_id)
        if state is None:
            raise SessionNotFoundError(session_id)
        return state

    async def update(self, session_id: str, updates: dict[str, Any]) -> None:
        from backend.core.errors import SessionNotFoundError

        if session_id not in self._store:
            raise SessionNotFoundError(session_id)
        self._store[session_id].update(updates)

    async def delete(self, session_id: str) -> None:
        self._store.pop(session_id, None)

    async def exists(self, session_id: str) -> bool:
        return session_id in self._store

    async def append_transcript_turn(
        self, session_id: str, speaker: str, text: str, timestamp: float
    ) -> None:
        if session_id not in self._store:
            return
        transcript = list(self._store[session_id].get("live_transcript", []))
        transcript.append({"speaker": speaker, "text": text, "timestamp": timestamp})
        self._store[session_id]["live_transcript"] = transcript

    async def set_task_status(
        self, session_id: str, task_key: str, status: str, error: str | None = None
    ) -> None:
        await self.update(session_id, {task_key: {"status": status, "error": error}})

    async def cleanup_expired(self) -> int:
        return 0

    async def session_count(self) -> int:
        return len(self._store)

    async def list_sessions(self) -> list[dict]:
        import time as _time

        now = _time.time()
        results = []
        for sid, state in self._store.items():
            pc = state.get("pitch_context") or {}
            fv = state.get("final_verdict") or {}
            lt = state.get("live_transcript") or []
            results.append(
                {
                    "session_id": sid,
                    "created_at": now,
                    "updated_at": now,
                    "company_name": pc.get("company_name", ""),
                    "one_liner": pc.get("one_liner", ""),
                    "stage": pc.get("stage", ""),
                    "verdict_decision": fv.get("decision"),
                    "weighted_score": fv.get("weighted_score"),
                    "deck_analysis_done": bool(state.get("deck_analysis_done")),
                    "market_intel_status": (state.get("market_intel_status") or {}).get(
                        "status", "idle"
                    ),
                    "deliberation_status": (state.get("deliberation_status") or {}).get(
                        "status", "idle"
                    ),
                    "live_interview_active": bool(state.get("live_interview_active")),
                    "transcript_turns": len(lt),
                }
            )
        return results


# ── Public SessionStore façade ────────────────────────────────────────────


class SessionStore:
    """
    Public façade that delegates all operations to the configured backend.

    All agent code depends on this class.  The backend can be swapped by
    passing a different ``backend`` instance (useful in tests).

    Supported backends:
      SqliteSessionStore  — persistent, default in production
      _MemoryBackend      — ephemeral, default in tests
    """

    def __init__(self, backend=None) -> None:
        self._backend = backend  # type: ignore[assignment]
        # If no backend is supplied, _build_default_backend() is called lazily
        # by the property below to avoid importing aiosqlite at module import time.

    @property
    def _b(self):
        if self._backend is None:
            self._backend = _build_default_backend()
        return self._backend

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        """Initialise the backing store (creates DB tables, etc.)."""
        await self._b.initialize()

    # ── CRUD ───────────────────────────────────────────────────────────────

    async def create(self) -> str:
        """Create a new session and return its UUID."""
        return await self._b.create(make_empty_state())

    async def get_state(self, session_id: str) -> dict[str, Any] | None:
        """Return session state as a plain dict, or None if not found."""
        return await self._b.get_state(session_id)

    async def require_state(self, session_id: str) -> dict[str, Any]:
        """Like ``get_state`` but raises ``SessionNotFoundError`` on miss."""
        return await self._b.require_state(session_id)

    async def update(self, session_id: str, updates: dict[str, Any]) -> None:
        """Merge *updates* into session state. Raises on missing session."""
        await self._b.update(session_id, updates)

    async def delete(self, session_id: str) -> None:
        """Delete a session. Silently ignores missing sessions."""
        await self._b.delete(session_id)

    async def exists(self, session_id: str) -> bool:
        """Return True if the session exists."""
        return await self._b.exists(session_id)

    # ── Domain helpers ─────────────────────────────────────────────────────

    async def append_transcript_turn(
        self,
        session_id: str,
        speaker: str,
        text: str,
        timestamp: float,
    ) -> None:
        """Append a single turn to ``live_transcript``."""
        await self._b.append_transcript_turn(session_id, speaker, text, timestamp)

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
        await self._b.set_task_status(session_id, task_key, status, error)

    # ── Maintenance ────────────────────────────────────────────────────────

    async def cleanup_expired(self) -> int:
        """Delete sessions older than the configured TTL. Returns count deleted."""
        return await self._b.cleanup_expired()

    async def session_count(self) -> int:
        """Return total live session count (for health checks)."""
        return await self._b.session_count()

    async def list_sessions(self) -> list[dict]:
        """Return lightweight session summaries ordered by most-recently-updated."""
        return await self._b.list_sessions()


# ── Backend factory ────────────────────────────────────────────────────────


def _build_default_backend():
    """Build the appropriate backend from settings."""
    if settings.session_backend == "sqlite":
        import os

        from backend.core.sqlite_session_service import SqliteSessionStore

        db_path = settings.session_db_path
        # Ensure the parent directory exists
        db_dir = os.path.dirname(db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)

        return SqliteSessionStore(
            db_path=db_path,
            app_name=settings.app_name,
            user_id=settings.default_user_id,
            session_ttl_seconds=settings.session_ttl_hours * 3600,
        )
    else:
        logger.info("Using in-memory session backend")
        return _MemoryBackend()


# ── Module-level default store (used by FastAPI app) ──────────────────────
# Agents accept a SessionStore parameter for testability; this singleton
# is the default for production use.

default_store = SessionStore()


# ── Legacy module-level helpers (kept for backward compat) ─────────────────


async def create_session() -> str:
    return await default_store.create()


async def get_session(session_id: str) -> dict[str, Any] | None:
    return await default_store.get_state(session_id)


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

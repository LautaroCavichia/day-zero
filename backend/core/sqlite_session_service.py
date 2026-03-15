"""
core/sqlite_session_service.py — SQLite-backed session persistence for DayZero.

Drop-in replacement for the in-memory ADK InMemorySessionService.
State is stored as JSON in a local SQLite file so sessions survive restarts.

Schema:
    sessions(
        session_id  TEXT PRIMARY KEY,
        app_name    TEXT NOT NULL,
        user_id     TEXT NOT NULL,
        state       TEXT NOT NULL,   -- JSON blob
        created_at  REAL NOT NULL,   -- Unix timestamp
        updated_at  REAL NOT NULL
    )

Usage (via SessionStore):
    from core.sqlite_session_service import SqliteSessionStore
    store = SqliteSessionStore(db_path="data/dayzero.db")
    await store.initialize()          # call once at startup
    session_id = await store.create()

Design notes:
- All operations are async via aiosqlite.
- No ADK dependency — the sqlite store is a pure alternative that
  SessionStore wraps directly.  Tests can pass db_path=":memory:" for
  zero-overhead in-process isolation.
- TTL enforcement is done by a background cleanup task (started by main.py
  lifespan).  Expired sessions are hard-deleted.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any

import aiosqlite

from backend.core.errors import SessionNotFoundError

logger = logging.getLogger(__name__)

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS sessions (
    session_id  TEXT PRIMARY KEY,
    app_name    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    state       TEXT NOT NULL,
    created_at  REAL NOT NULL,
    updated_at  REAL NOT NULL
)
"""

_CREATE_IDX = "CREATE INDEX IF NOT EXISTS idx_sessions_app_user ON sessions(app_name, user_id)"


class SqliteSessionStore:
    """
    Async SQLite-backed session store.

    Parameters
    ----------
    db_path:
        File path for the SQLite database.  Use ``":memory:"`` in tests.
    app_name:
        Application namespace written into every row.
    user_id:
        User identifier written into every row.
    session_ttl_seconds:
        Sessions older than this (since last update) are removed by
        ``cleanup_expired()``.  ``0`` disables TTL enforcement.
    """

    def __init__(
        self,
        db_path: str = "dayzero.db",
        app_name: str = "dayzero",
        user_id: str = "founder",
        session_ttl_seconds: int = 86_400,  # 24 h
    ) -> None:
        self._db_path = db_path
        self._app_name = app_name
        self._user_id = user_id
        self._ttl = session_ttl_seconds

    # ── Lifecycle ──────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        """Create the sessions table if it does not exist."""
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(_CREATE_TABLE)
            await db.execute(_CREATE_IDX)
            # Enable WAL for better concurrent read/write performance
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA synchronous=NORMAL")
            await db.commit()
        logger.info("SqliteSessionStore initialised: path=%s", self._db_path)

    # ── CRUD ───────────────────────────────────────────────────────────────

    async def create(self, initial_state: dict[str, Any]) -> str:
        """Insert a new session row and return the new session_id UUID."""
        session_id = str(uuid.uuid4())
        now = time.time()
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "INSERT INTO sessions (session_id, app_name, user_id, state, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (session_id, self._app_name, self._user_id, json.dumps(initial_state), now, now),
            )
            await db.commit()
        logger.debug("Session created: id=%s", session_id)
        return session_id

    async def get_state(self, session_id: str) -> dict[str, Any] | None:
        """Return session state dict, or None if not found / expired."""
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT state FROM sessions WHERE session_id=? AND app_name=? AND user_id=?",
                (session_id, self._app_name, self._user_id),
            ) as cursor:
                row = await cursor.fetchone()
        if row is None:
            return None
        return json.loads(row[0])

    async def require_state(self, session_id: str) -> dict[str, Any]:
        """Like ``get_state`` but raises ``SessionNotFoundError`` on miss."""
        state = await self.get_state(session_id)
        if state is None:
            raise SessionNotFoundError(session_id)
        return state

    async def update(self, session_id: str, updates: dict[str, Any]) -> None:
        """
        Merge *updates* into session state (shallow merge at top level).
        Raises ``SessionNotFoundError`` if the session does not exist.
        """
        async with aiosqlite.connect(self._db_path) as db:
            # Read current state inside the same connection to be atomic
            async with db.execute(
                "SELECT state FROM sessions WHERE session_id=? AND app_name=? AND user_id=?",
                (session_id, self._app_name, self._user_id),
            ) as cursor:
                row = await cursor.fetchone()

            if row is None:
                raise SessionNotFoundError(session_id)

            state = json.loads(row[0])
            state.update(updates)

            await db.execute(
                "UPDATE sessions SET state=?, updated_at=? WHERE session_id=?",
                (json.dumps(state), time.time(), session_id),
            )
            await db.commit()

    async def delete(self, session_id: str) -> None:
        """Delete a session row. Silently ignores missing sessions."""
        async with aiosqlite.connect(self._db_path) as db:
            await db.execute(
                "DELETE FROM sessions WHERE session_id=? AND app_name=? AND user_id=?",
                (session_id, self._app_name, self._user_id),
            )
            await db.commit()
        logger.debug("Session deleted: id=%s", session_id)

    async def exists(self, session_id: str) -> bool:
        """Return True if the session exists."""
        state = await self.get_state(session_id)
        return state is not None

    # ── Domain helpers ─────────────────────────────────────────────────────

    async def append_transcript_turn(
        self,
        session_id: str,
        speaker: str,
        text: str,
        timestamp: float,
    ) -> None:
        """Append a single turn to the ``live_transcript`` list in session state."""
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT state FROM sessions WHERE session_id=? AND app_name=? AND user_id=?",
                (session_id, self._app_name, self._user_id),
            ) as cursor:
                row = await cursor.fetchone()

            if row is None:
                logger.warning("append_transcript_turn: session not found id=%s", session_id)
                return

            state = json.loads(row[0])
            transcript = list(state.get("live_transcript", []))
            transcript.append({"speaker": speaker, "text": text, "timestamp": timestamp})
            state["live_transcript"] = transcript

            await db.execute(
                "UPDATE sessions SET state=?, updated_at=? WHERE session_id=?",
                (json.dumps(state), time.time(), session_id),
            )
            await db.commit()

    async def set_task_status(
        self,
        session_id: str,
        task_key: str,
        status: str,
        error: str | None = None,
    ) -> None:
        """Update the status of a background task stored in session state."""
        await self.update(session_id, {task_key: {"status": status, "error": error}})

    # ── Maintenance ────────────────────────────────────────────────────────

    async def cleanup_expired(self) -> int:
        """
        Delete sessions whose ``updated_at`` is older than ``session_ttl_seconds``.
        Returns the number of rows deleted.  No-op when TTL is 0.
        """
        if self._ttl <= 0:
            return 0
        cutoff = time.time() - self._ttl
        async with aiosqlite.connect(self._db_path) as db:
            cursor = await db.execute(
                "DELETE FROM sessions WHERE updated_at < ? AND app_name=?",
                (cutoff, self._app_name),
            )
            await db.commit()
            deleted = cursor.rowcount
        if deleted:
            logger.info("SqliteSessionStore: expired %d session(s)", deleted)
        return deleted

    async def session_count(self) -> int:
        """Return the total number of live sessions (for health checks)."""
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                "SELECT COUNT(*) FROM sessions WHERE app_name=?", (self._app_name,)
            ) as cursor:
                row = await cursor.fetchone()
        return row[0] if row else 0

    async def list_sessions(self) -> list[dict[str, Any]]:
        """
        Return lightweight session summaries ordered by most-recently-updated first.

        Extracts only the fields needed for the dashboard card without deserialising
        the full state blob (especially avoids loading large slide_images arrays).
        Uses SQLite's json_extract() for zero-Python-overhead field access.
        """
        async with aiosqlite.connect(self._db_path) as db:
            async with db.execute(
                """
                SELECT
                    session_id,
                    created_at,
                    updated_at,
                    json_extract(state, '$.session_name')               AS session_name,
                    json_extract(state, '$.pitch_context.company_name') AS company_name,
                    json_extract(state, '$.pitch_context.one_liner')    AS one_liner,
                    json_extract(state, '$.pitch_context.stage')        AS stage,
                    json_extract(state, '$.final_verdict.decision')     AS verdict_decision,
                    json_extract(state, '$.final_verdict.weighted_score') AS weighted_score,
                    json_extract(state, '$.deck_analysis_done')         AS deck_analysis_done,
                    json_extract(state, '$.market_intel_status.status') AS market_intel_status,
                    json_extract(state, '$.deliberation_status.status') AS deliberation_status,
                    json_extract(state, '$.live_interview_active')      AS live_interview_active,
                    (SELECT COUNT(*) FROM json_each(json_extract(state, '$.live_transcript'))) AS transcript_turns
                FROM sessions
                WHERE app_name=? AND user_id=?
                ORDER BY updated_at DESC
                """,
                (self._app_name, self._user_id),
            ) as cursor:
                rows = await cursor.fetchall()

        return [
            {
                "session_id": r[0],
                "created_at": r[1],
                "updated_at": r[2],
                "session_name": r[3] or "",
                "company_name": r[4] or "",
                "one_liner": r[5] or "",
                "stage": r[6] or "",
                "verdict_decision": r[7],  # "PASS" | "SOFT PASS" | "NO" | None
                "weighted_score": r[8],  # 0–100 float | None
                "deck_analysis_done": bool(r[9]),
                "market_intel_status": r[10] or "idle",
                "deliberation_status": r[11] or "idle",
                "live_interview_active": bool(r[12]),
                "transcript_turns": r[13] or 0,
            }
            for r in rows
        ]

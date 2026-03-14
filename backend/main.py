"""
main.py — DayZero FastAPI application

Wires together:
  - Session management (/api/session)
  - Live Interview WebSocket (/ws/live/{session_id})
  - Deck analysis (/api/upload-deck)
  - Pitch text ingestion (/api/pitch)
  - Market validation trigger (/api/validate-market)
  - Deliberation trigger (/api/deliberate)
  - Static frontend serving (/)

Run locally:
  uvicorn main:app --reload --port 8080
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

# ── All imports below are intentionally after load_dotenv() ──────────────
# ruff: noqa: E402
import session_state as ss  # noqa: E402
from agents.coaching import get_coaching_tip  # noqa: E402
from agents.deck_analyst import analyze_deck  # noqa: E402
from agents.deliberation import run_deliberation  # noqa: E402
from agents.live_interview import run_live_interview  # noqa: E402
from agents.market_validator import validate_market  # noqa: E402
from agents.orchestrator import process_pitch  # noqa: E402
from config import settings  # noqa: E402
from core.errors import (  # noqa: E402
    AgentError,
    ConfigError,
    DayZeroError,
    FileTooLargeError,
    GeminiApiError,
    InvalidFileTypeError,
    PitchContextEmptyError,
    SessionNotFoundError,
)
from core.logging_config import configure_logging  # noqa: E402
from core.middleware import RequestIdMiddleware  # noqa: E402
from core.models import (  # noqa: E402
    ErrorResponse,
    PitchTextRequest,
    SessionResponse,
    TaskStartedResponse,
)
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402

# Configure structured logging before anything else logs
configure_logging(log_level=settings.log_level, log_format=settings.log_format)
logger = logging.getLogger(__name__)


# ── App lifecycle ──────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        "DayZero backend starting up: api_key_set=%s session_backend=%s",
        settings.api_key_set,
        settings.session_backend,
    )

    # Initialise the session store (creates SQLite tables if needed)
    await ss.default_store.initialize()
    logger.info("Session store initialised")

    # Background task: periodically purge expired sessions
    cleanup_task = asyncio.create_task(_session_cleanup_loop())

    yield

    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        pass
    logger.info("DayZero backend shutting down")


async def _session_cleanup_loop() -> None:
    """Periodically delete sessions older than session_ttl_hours."""
    interval = settings.session_cleanup_interval_minutes * 60
    while True:
        try:
            await asyncio.sleep(interval)
            deleted = await ss.default_store.cleanup_expired()
            if deleted:
                logger.info("Session cleanup: removed %d expired session(s)", deleted)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("Session cleanup error (will retry): %s", exc)


app = FastAPI(
    title="DayZero",
    description="AI-powered startup pitch validation — YC-style interview panel",
    version="0.2.0",
    lifespan=lifespan,
)

# RequestIdMiddleware must be added before CORSMiddleware so the ID is
# available throughout the full request lifecycle.
app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
)


# ── Error handling middleware ──────────────────────────────────────────────


@app.exception_handler(SessionNotFoundError)
async def session_not_found_handler(request: Request, exc: SessionNotFoundError):
    return JSONResponse(
        status_code=404,
        content=ErrorResponse(
            error="session_not_found",
            detail=exc.detail,
            session_id=exc.session_id,
        ).model_dump(),
    )


@app.exception_handler(ConfigError)
async def config_error_handler(request: Request, exc: ConfigError):
    return JSONResponse(
        status_code=503,
        content=ErrorResponse(error="configuration_error", detail=exc.detail).model_dump(),
    )


@app.exception_handler(PitchContextEmptyError)
async def pitch_context_empty_handler(request: Request, exc: PitchContextEmptyError):
    return JSONResponse(
        status_code=400,
        content=ErrorResponse(
            error="pitch_context_empty",
            detail=exc.detail,
            session_id=exc.session_id,
        ).model_dump(),
    )


@app.exception_handler(InvalidFileTypeError)
async def invalid_file_handler(request: Request, exc: InvalidFileTypeError):
    return JSONResponse(
        status_code=400,
        content=ErrorResponse(error="invalid_file_type", detail=exc.detail).model_dump(),
    )


@app.exception_handler(FileTooLargeError)
async def file_too_large_handler(request: Request, exc: FileTooLargeError):
    return JSONResponse(
        status_code=413,
        content=ErrorResponse(error="file_too_large", detail=exc.detail).model_dump(),
    )


@app.exception_handler(GeminiApiError)
async def gemini_api_error_handler(request: Request, exc: GeminiApiError):
    logger.error("GeminiApiError: status=%s code=%s %s", exc.status_code, exc.error_code, exc)
    if exc.status_code == 429:
        http_status = 429
        error_key = "rate_limit_exceeded"
    elif exc.status_code in (401, 403):
        http_status = 503
        error_key = "gemini_auth_error"
    elif exc.status_code >= 500:
        http_status = 502
        error_key = "gemini_server_error"
    else:
        http_status = 502
        error_key = "gemini_api_error"

    content = ErrorResponse(error=error_key, detail=exc.detail).model_dump()
    if exc.retry_after is not None:
        content["retry_after"] = exc.retry_after

    headers = {}
    if exc.retry_after is not None:
        headers["Retry-After"] = str(int(exc.retry_after))

    return JSONResponse(status_code=http_status, content=content, headers=headers)


@app.exception_handler(AgentError)
async def agent_error_handler(request: Request, exc: AgentError):
    logger.error("AgentError: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=502,
        content=ErrorResponse(error="agent_error", detail=exc.detail).model_dump(),
    )


@app.exception_handler(DayZeroError)
async def dayzero_error_handler(request: Request, exc: DayZeroError):
    logger.error("DayZeroError: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(error="internal_error", detail=exc.detail).model_dump(),
    )


# ── Session routes ─────────────────────────────────────────────────────────


@app.post("/api/session", response_model=SessionResponse, tags=["Session"])
async def create_session():
    """Create a new DayZero session. Returns session_id."""
    session_id = await ss.create_session()
    logger.info("Session created: %s", session_id)
    return {"session_id": session_id}


@app.get("/api/session/{session_id}", tags=["Session"])
async def get_session(session_id: str):
    """Get full session state."""
    return await ss.default_store.require_state(session_id)


@app.delete("/api/session/{session_id}", tags=["Session"])
async def delete_session(session_id: str):
    """Delete a session."""
    await ss.default_store.require_state(session_id)  # 404 if missing
    await ss.delete_session(session_id)
    return {"status": "deleted"}


@app.get("/api/session/{session_id}/verdict", tags=["Session"])
async def get_verdict(session_id: str):
    """Get final_verdict when ready. Returns 202 while deliberation is pending."""
    state = await ss.default_store.require_state(session_id)
    verdict = state.get("final_verdict")
    if verdict is None:
        delib_status = state.get("deliberation_status", {})
        return JSONResponse(
            status_code=202,
            content={
                "status": delib_status.get("status", "idle"),
                "error": delib_status.get("error"),
            },
        )
    return verdict


@app.get("/api/session/{session_id}/debate", tags=["Session"])
async def get_debate(session_id: str):
    """Get all completed debate rounds."""
    state = await ss.default_store.require_state(session_id)
    return {
        "debate_rounds": state.get("debate_rounds", []),
        "status": state.get("deliberation_status", {}).get("status", "idle"),
    }


@app.get("/api/session/{session_id}/sources", tags=["Session"])
async def get_sources(session_id: str):
    """Get all cited sources from the final verdict."""
    state = await ss.default_store.require_state(session_id)
    verdict = state.get("final_verdict") or {}
    return {"sources": verdict.get("all_sources", [])}


# ── Pitch text ingestion ────────────────────────────────────────────────────


@app.post("/api/pitch", tags=["Analysis"])
async def submit_pitch(session_id: str, body: PitchTextRequest):
    """
    Submit typed pitch text.
    Orchestrator extracts structured pitch_context and writes to session state.
    """
    _require_api_key()
    await ss.default_store.require_state(session_id)  # 404 guard

    pitch_context = await process_pitch(session_id, body.pitch_text)
    return {"status": "ok", "pitch_context": pitch_context.model_dump()}


# ── Deck upload ─────────────────────────────────────────────────────────────


@app.post("/api/upload-deck", tags=["Analysis"])
async def upload_deck(
    session_id: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Upload a PDF or PPTX pitch deck.
    DeckAnalystAgent analyzes it and writes to session.state['deck_critique'].
    """
    _require_api_key()
    if not settings.enable_deck_analysis:
        raise HTTPException(status_code=503, detail="Deck analysis is currently disabled.")

    state = await ss.default_store.require_state(session_id)  # 404 guard

    filename = file.filename or "deck.pdf"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed = {".pdf", ".pptx"}
    if ext not in allowed:
        raise InvalidFileTypeError(filename, allowed)

    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_bytes:
        raise FileTooLargeError(len(file_bytes), settings.max_upload_bytes)

    critique = await analyze_deck(session_id, file_bytes, filename)

    # Auto-kick deliberation only if pitch context is already populated.
    # If not, the post-interview pipeline will trigger it after the live session ends.
    pitch_ctx = state.get("pitch_context", {})
    if any(pitch_ctx.values()):
        asyncio.create_task(_run_deliberation_bg(session_id))
    else:
        logger.info(
            "upload_deck: skipping auto-deliberation for session=%s (no pitch_context yet)",
            session_id,
        )

    return {"status": "ok", "deck_critique": critique.model_dump()}


# ── Market validation ───────────────────────────────────────────────────────


@app.post("/api/validate-market", response_model=TaskStartedResponse, tags=["Analysis"])
async def trigger_market_validation(session_id: str):
    """
    Trigger market validation for this session.
    Requires pitch_context to be populated first (via /api/pitch).
    Runs in background — poll GET /api/session/{id} for market_intel.
    """
    _require_api_key()
    if not settings.enable_market_validation:
        raise HTTPException(status_code=503, detail="Market validation is currently disabled.")

    state = await ss.default_store.require_state(session_id)
    pitch_ctx = state.get("pitch_context", {})
    if not any(pitch_ctx.values()):
        raise PitchContextEmptyError(session_id)

    # Guard: don't spawn a duplicate task if one is already running
    market_status = state.get("market_intel_status", {}).get("status", "idle")
    if market_status == "running":
        return TaskStartedResponse(message="Market validation already running")

    asyncio.create_task(_run_market_validation_bg(session_id))
    return TaskStartedResponse(message="Market validation running in background")


async def _run_market_validation_bg(session_id: str) -> None:
    """Background task wrapper — catches exceptions and writes failure status."""
    try:
        await validate_market(session_id)
    except Exception as e:
        logger.error("Market validation failed for session=%s: %s", session_id, e, exc_info=True)
        try:
            await ss.default_store.set_task_status(
                session_id, "market_intel_status", "failed", error=str(e)
            )
        except Exception:
            pass


# ── Deliberation ────────────────────────────────────────────────────────────


@app.post("/api/deliberate", response_model=TaskStartedResponse, tags=["Analysis"])
async def trigger_deliberation(session_id: str):
    """
    Trigger the VC deliberation panel.
    Requires at minimum a pitch_context. Better with market_intel and deck_critique.
    Runs in background — poll GET /api/session/{id}/debate and /verdict.
    """
    _require_api_key()
    state = await ss.default_store.require_state(session_id)
    pitch_ctx = state.get("pitch_context", {})
    if not any(pitch_ctx.values()):
        raise PitchContextEmptyError(session_id)

    # Guard: don't spawn a duplicate task if one is already running
    delib_status = state.get("deliberation_status", {}).get("status", "idle")
    if delib_status == "running":
        return TaskStartedResponse(message="Deliberation already running")

    asyncio.create_task(_run_deliberation_bg(session_id))
    return TaskStartedResponse(message="Deliberation panel running in background")


async def _run_deliberation_bg(session_id: str) -> None:
    """Background task wrapper — catches exceptions and writes failure status."""
    try:
        await run_deliberation(session_id)
    except Exception as e:
        logger.error("Deliberation failed for session=%s: %s", session_id, e, exc_info=True)
        try:
            await ss.default_store.set_task_status(
                session_id, "deliberation_status", "failed", error=str(e)
            )
        except Exception:
            pass


# ── Slides ──────────────────────────────────────────────────────────────────


@app.get("/api/session/{session_id}/slides", tags=["Analysis"])
async def get_slides(session_id: str):
    """
    Return all slide images (base64 PNG) for the uploaded deck.
    Available after POST /api/upload-deck completes.
    """
    state = await ss.default_store.require_state(session_id)
    slides = state.get("slide_images", [])
    return {"slides": slides, "count": len(slides)}


@app.get("/api/session/{session_id}/slides/{index}", tags=["Analysis"])
async def get_slide(session_id: str, index: int):
    """
    Return a single slide image (base64 PNG) by 0-based index.
    Returns 404 if index is out of range.
    """
    state = await ss.default_store.require_state(session_id)
    slides = state.get("slide_images", [])
    if index < 0 or index >= len(slides):
        raise HTTPException(
            status_code=404, detail=f"Slide {index} not found (count={len(slides)})"
        )
    return {"index": index, "image": slides[index], "total": len(slides)}


# ── Real-time coaching ───────────────────────────────────────────────────────


@app.post("/api/session/{session_id}/coach", tags=["Analysis"])
async def request_coaching(session_id: str):
    """
    Request a real-time coaching tip based on the transcript so far.
    Called periodically by the frontend during a live interview.
    """
    _require_api_key()
    state = await ss.default_store.require_state(session_id)
    transcript = state.get("live_transcript", [])
    if not transcript:
        return {"tip": None, "reason": "no_transcript"}

    tip = await get_coaching_tip(transcript)
    return {"tip": tip}


# ── Audio Deliberation WebSocket ─────────────────────────────────────────────


@app.websocket("/ws/deliberation/{session_id}")
async def audio_deliberation_ws(websocket: WebSocket, session_id: str):
    """
    Streams the VC deliberation panel as audio.

    Each persona (Paul/Elad/Keith + Synthesizer) speaks their analysis via
    Gemini Live. The frontend plays audio and shows who is speaking.

    Text events:
      { "type": "persona_start",  "persona": "Paul",  "role": "Skeptic" }
      { "type": "transcript",     "persona": "Paul",  "text": "..." }
      { "type": "persona_end",    "persona": "Paul" }
      { "type": "deliberation_complete" }
      { "type": "error",          "message": "..." }
    Binary frames: PCM 24kHz audio for the current persona.
    """
    import json as _json

    from agents.audio_deliberation import run_audio_deliberation

    if not settings.api_key_set:
        await websocket.accept()
        await websocket.send_text(
            _json.dumps({"type": "error", "message": "GOOGLE_API_KEY not set"})
        )
        await websocket.close()
        return

    state = await ss.default_store.get_state(session_id)
    if state is None:
        await websocket.accept()
        await websocket.send_text(
            _json.dumps({"type": "error", "message": f"Session {session_id} not found"})
        )
        await websocket.close()
        return

    await run_audio_deliberation(websocket, session_id)


# ── Live Interview WebSocket ─────────────────────────────────────────────────


@app.websocket("/ws/live/{session_id}")
async def live_interview_ws(websocket: WebSocket, session_id: str):
    """
    Bidirectional audio stream for the live YC-style interview.

    Binary frames: PCM audio (16kHz in, 24kHz out)
    Text frames:   JSON control/transcript events
    """
    import json as _json

    if not settings.api_key_set:
        await websocket.accept()
        await websocket.send_text(
            _json.dumps(
                {"type": "error", "message": "GOOGLE_API_KEY is not configured on the server"}
            )
        )
        await websocket.close()
        return

    if not settings.enable_live_interview:
        await websocket.accept()
        await websocket.send_text(
            _json.dumps({"type": "error", "message": "Live interview is currently disabled."})
        )
        await websocket.close()
        return

    state = await ss.default_store.get_state(session_id)
    if state is None:
        await websocket.accept()
        await websocket.send_text(
            _json.dumps({"type": "error", "message": f"Session {session_id} not found"})
        )
        await websocket.close()
        return

    await run_live_interview(websocket, session_id)


# ── Static frontend ─────────────────────────────────────────────────────────

_frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(_frontend_dir):
    app.mount("/static", StaticFiles(directory=_frontend_dir), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_frontend():
        index_path = os.path.join(_frontend_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend not found")

    @app.get("/debug", include_in_schema=False)
    async def serve_debug():
        debug_path = os.path.join(_frontend_dir, "debug.html")
        if os.path.exists(debug_path):
            return FileResponse(debug_path)
        raise HTTPException(status_code=404, detail="Debug page not found")


# ── Health checks ────────────────────────────────────────────────────────────


@app.get("/health", tags=["System"])
async def health():
    """Liveness probe — cheap, always fast. Returns 200 if the process is alive."""
    return {"status": "ok", "version": "0.2.0"}


@app.get("/health/ready", tags=["System"])
async def health_ready():
    """
    Readiness probe — verifies the server can actually serve traffic.

    Checks:
      1. Session store: creates and immediately deletes a probe session.
      2. Gemini connectivity: calls countTokens (zero quota cost) to verify
         the API key is valid and the service is reachable.
         Skipped when GOOGLE_API_KEY is not set or
         READINESS_GEMINI_CHECK=false.

    Returns 200 when all checks pass, 503 when any check fails.
    """
    checks: dict[str, dict] = {}
    overall_ok = True

    # ── Check 1: session store ─────────────────────────────────────────────
    t0 = time.monotonic()
    try:
        probe_id = await ss.default_store.create()
        await ss.default_store.delete(probe_id)
        checks["session_store"] = {
            "status": "ok",
            "latency_ms": round((time.monotonic() - t0) * 1000, 1),
        }
    except Exception as exc:
        checks["session_store"] = {
            "status": "error",
            "error": str(exc),
            "latency_ms": round((time.monotonic() - t0) * 1000, 1),
        }
        overall_ok = False

    # ── Check 2: Gemini connectivity ───────────────────────────────────────
    if settings.readiness_gemini_check and settings.api_key_set:
        t0 = time.monotonic()
        try:
            from core.gemini_client import get_client
            from google.genai import types as _gtypes

            client = get_client()
            await client.aio.models.count_tokens(
                model=settings.gemini_flash_model,
                contents=[_gtypes.Content(role="user", parts=[_gtypes.Part(text="ping")])],
            )
            checks["gemini"] = {
                "status": "ok",
                "model": settings.gemini_flash_model,
                "latency_ms": round((time.monotonic() - t0) * 1000, 1),
            }
        except Exception as exc:
            checks["gemini"] = {
                "status": "error",
                "error": str(exc),
                "latency_ms": round((time.monotonic() - t0) * 1000, 1),
            }
            overall_ok = False
    elif not settings.api_key_set:
        checks["gemini"] = {"status": "skipped", "reason": "GOOGLE_API_KEY not set"}
    else:
        checks["gemini"] = {"status": "skipped", "reason": "READINESS_GEMINI_CHECK=false"}

    # ── Session store stats ────────────────────────────────────────────────
    try:
        checks["session_store"]["active_sessions"] = await ss.default_store.session_count()
    except Exception:
        pass

    body = {
        "status": "ok" if overall_ok else "degraded",
        "version": "0.2.0",
        "api_key_set": settings.api_key_set,
        "session_backend": settings.session_backend,
        "features": {
            "live_interview": settings.enable_live_interview,
            "deck_analysis": settings.enable_deck_analysis,
            "market_validation": settings.enable_market_validation,
        },
        "config": {
            "debate_rounds": settings.debate_rounds,
            "gemini_flash_model": settings.gemini_flash_model,
            "gemini_live_model": settings.gemini_live_model,
            "max_upload_mb": settings.max_upload_bytes // (1024 * 1024),
        },
        "checks": checks,
    }

    return JSONResponse(status_code=200 if overall_ok else 503, content=body)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _require_api_key() -> None:
    if not settings.api_key_set:
        raise ConfigError(
            "GOOGLE_API_KEY is not configured. Set it in .env or as an environment variable."
        )


# ── Dev entrypoint ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )

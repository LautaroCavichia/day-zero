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
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

# ── All imports below are intentionally after load_dotenv() ──────────────
# ruff: noqa: E402
import session_state as ss  # noqa: E402
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
    InvalidFileTypeError,
    PitchContextEmptyError,
    SessionNotFoundError,
)
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

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger(__name__)


# ── App lifecycle ──────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("DayZero backend starting up (api_key_set=%s)", settings.api_key_set)
    yield
    logger.info("DayZero backend shutting down")


app = FastAPI(
    title="DayZero",
    description="AI-powered startup pitch validation — YC-style interview panel",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

    await ss.default_store.require_state(session_id)  # 404 guard

    filename = file.filename or "deck.pdf"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed = {".pdf", ".pptx"}
    if ext not in allowed:
        raise InvalidFileTypeError(filename, allowed)

    file_bytes = await file.read()
    if len(file_bytes) > settings.max_upload_bytes:
        raise FileTooLargeError(len(file_bytes), settings.max_upload_bytes)

    critique = await analyze_deck(session_id, file_bytes, filename)

    # Auto-kick deliberation in background (market may still be running — that's fine,
    # deliberation uses whatever context is in session state at the time each round runs)
    asyncio.create_task(_run_deliberation_bg(session_id))

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


# ── Live Interview WebSocket ────────────────────────────────────────────────


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


# ── Health check ────────────────────────────────────────────────────────────


@app.get("/health", tags=["System"])
async def health():
    return {
        "status": "ok",
        "version": "0.2.0",
        "api_key_set": settings.api_key_set,
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
    }


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

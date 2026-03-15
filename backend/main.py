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
from backend import session_state as ss  # noqa: E402
from backend.agents.coaching import get_coaching_tip  # noqa: E402
from backend.agents.deck_analyst import analyze_deck  # noqa: E402
from backend.agents.deliberation import run_deliberation  # noqa: E402
from backend.agents.live_interview import run_live_interview  # noqa: E402
from backend.agents.market_validator import validate_market  # noqa: E402
from backend.agents.orchestrator import process_pitch  # noqa: E402
from backend.agents.training import generate_training_review  # noqa: E402
from backend.config import settings  # noqa: E402
from backend.core.errors import (  # noqa: E402
    AgentError,
    ConfigError,
    DayZeroError,
    FileTooLargeError,
    GeminiApiError,
    InvalidFileTypeError,
    PitchContextEmptyError,
    SessionNotFoundError,
)
from backend.core.logging_config import configure_logging  # noqa: E402
from backend.core.middleware import RequestIdMiddleware  # noqa: E402
from backend.core import slide_store  # noqa: E402
from backend.core.models import (  # noqa: E402
    ErrorResponse,
    PitchTextRequest,
    SessionResponse,
    TaskStartedResponse,
)
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket  # noqa: E402
from pydantic import BaseModel  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import FileResponse, JSONResponse, Response  # noqa: E402
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


@app.get("/api/sessions", tags=["Session"])
async def list_sessions():
    """
    List all sessions as lightweight summaries for the dashboard.

    Returns sessions ordered by most-recently-updated first.
    Heavy fields (slide_images, full transcripts) are excluded — only
    the data needed to render a session card is returned.
    """
    summaries = await ss.default_store.list_sessions()
    return {"sessions": summaries}


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
    slide_store.cleanup(session_id)
    return {"status": "deleted"}


class SessionUpdateRequest(BaseModel):
    session_name: str | None = None
    pitch_context: dict | None = None


@app.patch("/api/session/{session_id}", tags=["Session"])
async def update_session(session_id: str, body: SessionUpdateRequest):
    """
    Partially update session metadata.

    Accepts:
      - ``session_name``: user-provided name for the session
      - ``pitch_context``: partial dict deep-merged into the existing pitch_context

    Returns the updated top-level session metadata fields.
    """
    state = await ss.default_store.require_state(session_id)

    updates: dict = {}

    if body.session_name is not None:
        updates["session_name"] = body.session_name

    if body.pitch_context is not None:
        existing_ctx = dict(state.get("pitch_context") or {})
        existing_ctx.update(body.pitch_context)
        updates["pitch_context"] = existing_ctx

    if updates:
        await ss.default_store.update(session_id, updates)

    return {
        "status": "ok",
        "session_id": session_id,
        "session_name": updates.get("session_name", state.get("session_name", "")),
    }


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

    # If a deck was previously analyzed, clear all downstream results so the
    # user gets a clean re-run (market intel, deliberation, verdict all stale).
    existing_critique = state.get("deck_critique")
    if existing_critique is not None:
        logger.info(
            "upload_deck: re-upload detected for session=%s — clearing downstream results",
            session_id,
        )
        await ss.default_store.update(
            session_id,
            {
                "deck_analysis_done": False,
                "market_intel": None,
                "market_intel_status": {"status": "idle", "error": None},
                "debate_rounds": [],
                "deliberation_status": {"status": "idle", "error": None},
                "final_verdict": None,
            },
        )

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


# ── Testing: Resume pipeline after interview ────────────────────────────────


@app.get("/api/test-pipeline-resume/{session_id}", tags=["Testing"])
async def test_pipeline_resume(session_id: str):
    """
    [DEBUG/TESTING] Resume the pipeline (market + deliberation) for this session.

    Use this to test the full pipeline without spending time on the live interview.
    If pitch_context is missing, generates example data.

    Returns: {"status": "ok", "message": "Pipeline resumed..."}
    """
    _require_api_key()

    state = await ss.default_store.require_state(session_id)

    # Check if pitch_context has real content (non-empty values)
    existing_ctx = state.get("pitch_context") or {}
    has_real_content = any(v for v in existing_ctx.values() if v)

    if not has_real_content:
        # Store example pitch using the exact field names market_validator expects
        example_pitch = {
            "company_name": "CortaDoc",
            "one_liner": "AI platform that reviews contracts in 30 seconds for $5",
            "problem": "Small businesses lose $50K-150K/year in legal disputes from contracts they don't understand. Lawyers cost $300-500/hour.",
            "solution": "LLM fine-tuned on 10,000 real dispute cases. Identifies risks, flags bad clauses, explains in plain English. 30-second review for $5.",
            "target_customer": "SMBs with 20-100 employees signing 5+ contracts/month, e.g. SaaS companies, agencies, freelancers.",
            "business_model": "$49/month subscription (10 reviews). $199/month for teams. Usage-based API for larger companies.",
            "traction": "$2.5K MRR, 5 paying pilots including TechStart Ventures. 120 contracts reviewed. 1 annual renewal.",
            "team": "Founder: 8 years at Orrick law firm. Co-founder: former Stripe legal ops manager.",
            "ask": "$800K seed: $400K model training, $200K sales, $200K engineering.",
            "stage": "Pre-seed, post-revenue",
        }
        await ss.default_store.update(
            session_id, {"pitch_context": example_pitch, "pitch_submitted_at": time.time()}
        )
        logger.info("Generated example pitch_context for testing: session=%s", session_id)
    else:
        logger.info(
            "Using existing pitch_context (has content): session=%s company=%s",
            session_id,
            existing_ctx.get("company_name") or existing_ctx.get("title", "?"),
        )

    # Trigger market analysis in background
    asyncio.create_task(_run_market_and_deliberation_bg(session_id))

    return {"status": "ok", "message": "Pipeline resumed - market analysis + deliberation running"}


async def _run_market_and_deliberation_bg(session_id: str) -> None:
    """Run market validation + deliberation in background."""
    try:
        logger.info("Starting test pipeline: session=%s", session_id)

        # Double-check pitch_context has real content
        state = await ss.default_store.get_state(session_id)
        pitch_ctx = (state or {}).get("pitch_context") or {}
        has_content = any(v for v in pitch_ctx.values() if v)
        if not has_content:
            logger.error(
                "pitch_context empty/missing before market analysis: session=%s keys=%s",
                session_id,
                list(pitch_ctx.keys()),
            )
            raise Exception("pitch_context is empty — no real values found")

        logger.info(
            "pitch_context found — company=%s",
            pitch_ctx.get("company_name") or pitch_ctx.get("title", "?"),
        )

        await validate_market(session_id, store=ss.default_store)
        logger.info("Market analysis complete: session=%s", session_id)

        await run_deliberation(session_id, store=ss.default_store)
        logger.info("Deliberation complete: session=%s", session_id)
    except Exception as e:
        logger.error("Test pipeline error: session=%s %s", session_id, e, exc_info=True)


# ── Market validation ───────────────────────────────────────────────────────


@app.post("/api/validate-market", response_model=TaskStartedResponse, tags=["Analysis"])
async def trigger_market_validation(session_id: str):
    """
    Trigger market validation for this session.
    Requires pitch_context to be populated first (via /api/pitch).
    Runs in background — poll GET /api/session/{id} for market_intel.
    Can be re-triggered after completion to refresh results.
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

    # Reset prior results so the frontend gets a clean loading state
    if market_status in ("completed", "failed"):
        await ss.default_store.update(
            session_id,
            {
                "market_intel": None,
                "market_intel_status": {"status": "idle", "error": None},
            },
        )

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
    Can be re-triggered after completion to run a fresh round.
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

    # Reset prior results so the frontend gets a clean loading state
    if delib_status in ("completed", "failed"):
        await ss.default_store.update(
            session_id,
            {
                "debate_rounds": [],
                "deliberation_status": {"status": "idle", "error": None},
                "final_verdict": None,
            },
        )

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
    Return slide count for the uploaded deck.
    Available after POST /api/upload-deck completes.
    Falls back to deck_critique.slide_count for sessions that predate the
    slide_count state field, or when slide_count was not persisted correctly.
    """
    state = await ss.default_store.require_state(session_id)
    count = state.get("slide_count") or 0
    if not count:
        # Fallback: read slide_count from deck_critique (always persisted)
        critique = state.get("deck_critique") or {}
        count = critique.get("slide_count", 0)
    return {"count": count}


def _resolve_slide_count(state: dict) -> int:
    """Return the true slide count, checking state field then deck_critique fallback."""
    count = state.get("slide_count") or 0
    if not count:
        critique = state.get("deck_critique") or {}
        count = critique.get("slide_count", 0)
    return count


@app.get("/api/session/{session_id}/slides/{index}", tags=["Analysis"])
async def get_slide(session_id: str, index: int):
    """
    Stream a single slide image (PNG) by 0-based index directly from disk.
    Returns 404 if index is out of range or image not yet rendered.
    """
    state = await ss.default_store.require_state(session_id)
    count = _resolve_slide_count(state)
    if index < 0 or index >= count:
        raise HTTPException(status_code=404, detail=f"Slide {index} not found (count={count})")
    png_bytes = slide_store.get(session_id, index, "display")
    if png_bytes is None:
        raise HTTPException(status_code=404, detail=f"Slide {index} image not available yet")
    return Response(content=png_bytes, media_type="image/png")


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


# ── Training Review ───────────────────────────────────────────────────────────


@app.post("/api/session/{session_id}/training-review", tags=["Analysis"])
async def get_training_review(session_id: str):
    """
    Generate (or return cached) a post-interview training review.

    Analyzes the completed interview transcript against pitch context and
    deck critique to produce per-turn annotations, ratings, and ideal
    answers — surfaced as Training Mode in the frontend.

    Returns 400 if the interview transcript is empty.
    Returns the cached review if already generated (re-POST to regenerate).
    """
    _require_api_key()
    state = await ss.default_store.require_state(session_id)

    # Return cached result if available
    existing = state.get("training_review")
    if existing:
        return existing

    # Generate fresh review
    try:
        review = await generate_training_review(session_id)
        return review
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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


# ── Static frontend (React / Vite build output) ────────────────────────────

# In production, serve the Vite build output from frontend/dist/.
# In development, run `pnpm dev` in frontend/ and use the Vite proxy instead.
_frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
_frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")

if os.path.isdir(_frontend_dist):
    # Serve static assets (JS, CSS, fonts, images) from the dist/assets/ dir
    app.mount(
        "/assets",
        StaticFiles(directory=os.path.join(_frontend_dist, "assets")),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Serve the React SPA. All non-API routes fall through to index.html."""
        # Try serving a static file first (e.g. favicon.svg)
        static_path = os.path.join(_frontend_dist, full_path)
        if full_path and os.path.isfile(static_path):
            return FileResponse(static_path)
        # Otherwise serve the SPA entry point for client-side routing
        index_path = os.path.join(_frontend_dist, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend not found")

elif os.path.isdir(_frontend_dir):
    # Legacy fallback: serve raw frontend/ files (development without Vite build)
    app.mount("/static", StaticFiles(directory=_frontend_dir), name="static")

    @app.get("/", include_in_schema=False)
    async def serve_frontend():
        index_path = os.path.join(_frontend_dir, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
        raise HTTPException(status_code=404, detail="Frontend not found")


# ── Health checks ────────────────────────────────────────────────────────────


@app.get("/health", tags=["System"])
async def health():
    """Liveness probe — cheap, always fast. Returns 200 if the process is alive."""
    return {
        "status": "ok",
        "version": "0.2.0",
        "api_key_set": settings.api_key_set,
        "features": {
            "deck_analysis": settings.enable_deck_analysis,
            "market_validation": settings.enable_market_validation,
            "live_interview": settings.enable_live_interview,
        },
        "config": {
            "llm_provider": settings.llm_provider.value,
            "session_backend": settings.session_backend,
        },
    }


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

    try:
        # ── Check 1: session store ─────────────────────────────────────────
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

        # ── Check 2: Gemini connectivity ───────────────────────────────────
        if settings.readiness_gemini_check and settings.api_key_set:
            t0 = time.monotonic()
            try:
                from backend.core.gemini_client import get_client
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

        # ── Session store stats ────────────────────────────────────────────
        try:
            checks["session_store"]["active_sessions"] = await ss.default_store.session_count()
        except Exception:
            pass

    except Exception as e:
        logger.error(f"Unexpected error in health_ready: {e}", exc_info=True)
        overall_ok = False

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
            "llm_provider": settings.llm_provider.value,
            "selected_flash_model": settings.selected_flash_model,
            "selected_live_model": settings.selected_live_model,
            "debate_rounds": settings.debate_rounds,
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
        "backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
    )

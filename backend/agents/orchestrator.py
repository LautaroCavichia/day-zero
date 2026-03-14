"""
agents/orchestrator.py — OrchestratorAgent

ADK LlmAgent that acts as the session controller for DayZero.

Responsibilities:
- Extract structured pitch_context from typed text input
- Serve as the ADK "root agent" satisfying the hackathon ADK requirement

The Live Interview, Deck Analysis, Market Validation, and Deliberation
are all triggered directly via their Python modules (not via ADK sub-agent
delegation) to keep latency low and avoid ADK session conflicts with
the Live API WebSocket connection.
"""

from __future__ import annotations

import logging

import backend.session_state as ss
from backend.config import settings
from backend.core.llm_factory import get_provider
from backend.core.models import PitchContext
from google.adk.agents import LlmAgent

logger = logging.getLogger(__name__)

# ── Prompts ──────────────────────────────────────────────────────────────────

PITCH_EXTRACTOR_PROMPT = """You are an expert at parsing unstructured startup pitch text into structured data.

Extract the following fields from the pitch text provided. If a field is not mentioned, use an empty string "".
Be generous in your interpretation — infer reasonable values where possible.

Return ONLY a JSON object with these exact keys:
{
  "company_name": "",
  "one_liner": "",
  "problem": "",
  "solution": "",
  "target_customer": "",
  "business_model": "",
  "traction": "",
  "team": "",
  "ask": "",
  "stage": ""
}

stage should be one of: "idea", "MVP", "seed", "series-a", "growth", or "unknown".
Output ONLY the JSON object, no markdown fences, no extra text."""


# ── ADK LlmAgent definition (satisfies hackathon ADK requirement) ─────────────


def create_orchestrator_agent() -> LlmAgent:
    """
    Create the ADK OrchestratorAgent.

    This is the root ADK agent for the hackathon requirement.
    It handles pitch text extraction and session routing.
    """
    return LlmAgent(
        name="DayZeroOrchestrator",
        model=settings.gemini_flash_model,
        description=(
            "DayZero session orchestrator. Extracts pitch context from text input, "
            "manages session state, and coordinates analysis pipeline."
        ),
        instruction=(
            "You are the DayZero session orchestrator. When given pitch text, "
            "extract structured pitch context. When asked for session status, "
            "summarize what analysis has been completed and what is pending."
        ),
    )


# ── Direct Python API (used by FastAPI routes) ────────────────────────────────


async def extract_pitch_context(
    pitch_text: str,
    api_key: str | None = None,
) -> PitchContext:
    """
    Use Gemini to parse unstructured pitch text into a structured PitchContext.

    Returns a validated ``PitchContext`` Pydantic model.
    """
    provider = get_provider(api_key)

    raw = await provider.generate_json(
        model=settings.selected_flash_model,
        user_message=f"{PITCH_EXTRACTOR_PROMPT}\n\n---\nPITCH TEXT:\n{pitch_text}\n---",
    )

    return PitchContext.model_validate(raw)


async def process_pitch(
    session_id: str,
    pitch_text: str,
    api_key: str | None = None,
    store: ss.SessionStore | None = None,
) -> PitchContext:
    """
    Extract pitch context from text and write to session state.

    Returns the extracted ``PitchContext``.
    """
    _store = store or ss.default_store
    logger.info("Orchestrator: extracting pitch context for session=%s", session_id)

    pitch_context = await extract_pitch_context(pitch_text, api_key)

    await _store.update(session_id, {"pitch_context": pitch_context.model_dump()})

    logger.info(
        "Orchestrator: pitch_context written for session=%s company=%s",
        session_id,
        pitch_context.company_name or "unknown",
    )

    return pitch_context

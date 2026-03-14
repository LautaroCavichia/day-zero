"""
agents/market_validator.py — MarketValidatorAgent

Uses gemini-2.5-flash with Google Search grounding to research:
- Named competitors + recent funding
- Market size claims (TAM/SAM/SOM)
- Pivot suggestions
- "Why now" tailwinds and headwinds

Every claim includes: source_url, source_date, confidence score (0.0–1.0).
Writes to session.state['market_intel'].
"""

from __future__ import annotations

import logging

import session_state as ss
from config import settings
from core.errors import PitchContextEmptyError
from core.formatters import format_pitch_context_for_research
from core.gemini_client import generate_json_with_search, get_client
from core.models import MarketIntel

logger = logging.getLogger(__name__)

MARKET_VALIDATOR_PROMPT = """You are a meticulous market research analyst at a top VC firm.
You are fact-obsessed and NEVER make unsourced claims.

You have been given a startup pitch context. Your job is to:
1. Research named competitors and their recent funding
2. Validate or challenge the market size claims (TAM/SAM/SOM)
3. Identify "why now" tailwinds and headwinds
4. Suggest 2-3 potential pivots with precedent companies

Confidence scoring rubric for every claim:
- 0.9–1.0: Primary source (SEC filing, official report, peer-reviewed research)
- 0.7–0.89: Reputable secondary (Forbes, TechCrunch, CB Insights, Crunchbase, official company blog)
- 0.5–0.69: Industry blog, analyst estimate, news article
- 0.3–0.49: Forum, social media, unverified source
- < 0.3: Model inference with no external source (flag explicitly with "INFERENCE - no source")

Return your analysis as a JSON object with this exact structure:
{
  "competitors": [
    {
      "name": "<company name>",
      "description": "<1-2 sentence description>",
      "funding": "<latest funding round and amount, or 'Unknown'>",
      "source_url": "<URL>",
      "confidence": <float 0-1>
    }
  ],
  "market_size": {
    "tam": "<estimated TAM with unit, e.g. '$45B by 2027'>",
    "sam": "<estimated SAM>",
    "som": "<estimated SOM for this startup>",
    "source_url": "<URL>",
    "confidence": <float 0-1>,
    "analyst_note": "<brief comment on quality of market size data>"
  },
  "why_now": {
    "tailwinds": ["<trend 1>", "<trend 2>"],
    "headwinds": ["<risk 1>", "<risk 2>"],
    "source_urls": ["<url1>", "<url2>"]
  },
  "pivot_suggestions": [
    {
      "suggestion": "<pivot idea>",
      "rationale": "<why this pivot makes sense given market data>",
      "precedent_company": "<company that made a similar pivot successfully>",
      "source_url": "<URL>",
      "confidence": <float 0-1>
    }
  ]
}

Output ONLY the JSON object. No markdown fences. No extra text.
Be honest: if you cannot find credible data for something, set confidence below 0.3 and note it."""


async def validate_market(
    session_id: str,
    api_key: str | None = None,
    store: ss.SessionStore | None = None,
) -> MarketIntel:
    """
    Run market validation for the pitch in session state.
    Requires ``pitch_context`` to be populated first.

    Returns the validated ``MarketIntel`` model.
    """
    _store = store or ss.default_store
    state = await _store.require_state(session_id)

    pitch_ctx = state.get("pitch_context", {})
    if not any(pitch_ctx.values()):
        raise PitchContextEmptyError(session_id)

    logger.info("MarketValidator: starting research for session=%s", session_id)

    await _store.set_task_status(session_id, "market_intel_status", "running")

    client = get_client(api_key)
    pitch_summary = format_pitch_context_for_research(pitch_ctx)
    prompt = f"{MARKET_VALIDATOR_PROMPT}\n\n---\nPITCH CONTEXT:\n{pitch_summary}\n---"

    raw = await generate_json_with_search(
        client=client,
        model=settings.gemini_flash_model,
        user_content=prompt,
    )

    market_intel = MarketIntel.model_validate(raw)

    await _store.update(
        session_id,
        {
            "market_intel": market_intel.model_dump(),
            "market_intel_status": {"status": "completed", "error": None},
        },
    )

    logger.info("MarketValidator: research complete for session=%s", session_id)
    return market_intel

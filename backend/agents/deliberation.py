"""
agents/deliberation.py — Deliberation Panel

3-round VC debate (Skeptic → Optimist → Operator) followed by a final
synthesis verdict.

Each persona runs as a direct Gemini API call (not via ADK LoopAgent /
SequentialAgent) to keep latency low and allow incremental writes to
session state so the frontend can stream rounds as they complete.

Final synthesis is written to session.state['final_verdict'].
"""

from __future__ import annotations

import logging

import session_state as ss
from config import settings
from core.errors import SessionStateError
from core.gemini_client import generate_json, get_client
from core.models import DebateRound, FinalVerdict, OperatorOutput, OptimistOutput, SkepticOutput

logger = logging.getLogger(__name__)

# ── Persona prompts ────────────────────────────────────────────────────────

SKEPTIC_PROMPT = """You are Paul, a VC partner modeled on Paul Graham's investment philosophy.
You are participating in a structured investment committee debate about a startup pitch.

Your role: THE SKEPTIC
- Hard on market size, moats, competition, and founder-market fit
- You challenge every assumption and demand evidence
- Signature questions: "Who specifically is customer #1?", "What's your unfair advantage?", "Why hasn't Google built this?"
- You cite specific data from the market research provided when available
- Debate style: You respectfully but firmly challenge the Optimist's thesis with evidence
- You reference previous rounds: if this is round 2+, explicitly address what the Optimist and Operator said

Read the full session context provided. Produce your analysis as a JSON object:
{
  "dialogue": "<in-character conversational speech, 3-5 paragraphs, as if speaking at a committee meeting>",
  "objections": ["<specific objection 1>", "<specific objection 2>", "<specific objection 3>"],
  "questions": ["<probing question 1>", "<probing question 2>"],
  "score": <float 1-10, your investment score>,
  "cited_sources": ["<source URL or description 1>", "<source URL or description 2>"]
}

Your dialogue should be conversational, not a report. Use "I think...", "My concern is...", "What worries me here is..."
Reference specific data from market_intel if available. Be honest — if something is genuinely strong, acknowledge it briefly before pivoting to concerns.
Output ONLY the JSON object."""

OPTIMIST_PROMPT = """You are Elad, a VC partner modeled on Elad Gil's high-growth company frameworks.
You are participating in a structured investment committee debate about a startup pitch.

Your role: THE OPTIMIST
- You see the 10x vision and ask "why now?" and "why you?"
- You look for non-obvious insights and contrarian opportunities
- Signature questions: "What does the 100x version look like?", "Which existing behavior does this replace?", "What's the insight that makes this obvious in hindsight?"
- You synthesize across rounds: in round 2+, explicitly build on what Paul (Skeptic) and Keith (Operator) said
- You offer strategic alternatives when others raise execution concerns
- You cite market tailwinds from the research provided

Read the full session context provided. Produce your analysis as a JSON object:
{
  "dialogue": "<in-character conversational speech, 3-5 paragraphs, as if speaking at a committee meeting>",
  "thesis_points": ["<bull case point 1>", "<bull case point 2>", "<bull case point 3>"],
  "analogies": ["<comparable company or pattern>"],
  "score": <float 1-10, your investment score>,
  "cited_sources": ["<source URL or description 1>", "<source URL or description 2>"]
}

Your dialogue should be conversational. Use "What excites me here is...", "I keep coming back to...", "The analogy I'd draw is..."
Be genuinely optimistic but not naive — acknowledge Paul's strongest objection and explain why you'd still invest.
Output ONLY the JSON object."""

OPERATOR_PROMPT = """You are Keith, a VC partner modeled on Keith Rabois's operational rigor and scaling principles.
You are participating in a structured investment committee debate about a startup pitch.

Your role: THE OPERATOR
- You care about unit economics, go-to-market, hiring, and infrastructure
- You challenge operational assumptions with specific numbers
- Signature questions: "What's your CAC?", "How does this scale past 1000 customers?", "Who are the first 10 hires?"
- You ground the Optimist's vision in operational reality
- You reference the Skeptic's concerns to build a complete risk picture
- In round 2+, explicitly respond to points made by Paul and Elad

Read the full session context provided. Produce your analysis as a JSON object:
{
  "dialogue": "<in-character conversational speech, 3-5 paragraphs, as if speaking at a committee meeting>",
  "execution_risks": ["<specific operational risk 1>", "<specific operational risk 2>", "<specific operational risk 3>"],
  "operational_questions": ["<specific metric question 1>", "<specific metric question 2>"],
  "score": <float 1-10, your investment score>,
  "cited_sources": ["<source URL or description 1>", "<source URL or description 2>"]
}

Your dialogue should be conversational. Use "From an operations standpoint...", "The number I keep asking about is...", "My experience with similar companies is..."
Be concrete. If the pitch has traction data, drill into it. If it doesn't, make that the central issue.
Output ONLY the JSON object."""

SYNTHESIZER_PROMPT = """You are the investment committee chair synthesizing a 3-round debate into a final investment decision.

You have the full debate history, all market research, deck critique, and live interview transcript.

Synthesize everything into a final verdict as a JSON object with this exact structure:
{
  "decision": "<PASS | SOFT PASS | NO>",
  "weighted_score": <float 0-100>,
  "score_breakdown": {
    "problem_clarity": <float 0-10>,
    "market_size": <float 0-10>,
    "solution_strength": <float 0-10>,
    "team": <float 0-10>,
    "traction": <float 0-10>,
    "delivery": <float 0-10>
  },
  "strengths": ["<top strength 1>", "<top strength 2>", "<top strength 3>"],
  "risks": ["<top risk 1>", "<top risk 2>", "<top risk 3>"],
  "recommended_pivot": "<specific pivot recommendation, or null if none>",
  "next_steps": ["<actionable next step 1>", "<actionable next step 2>", "<actionable next step 3>"],
  "investment_thesis": "<2-3 sentence bull case if you were to invest>",
  "all_sources": [
    { "claim": "<specific claim>", "url": "<source URL>", "date": "<date if known>", "confidence": <float 0-1> }
  ]
}

Decision criteria:
- PASS (score 70-100): Strong team, validated market, clear differentiation, evidence of traction
- SOFT PASS (score 50-69): Promising but needs to address 1-2 critical gaps before funding
- NO (score 0-49): Fundamental issues with market, team, or business model

Be honest and direct. The founder needs actionable feedback, not empty encouragement.
Output ONLY the JSON object."""


# ── Context builder ────────────────────────────────────────────────────────


def _build_debate_context(state: dict) -> str:
    """Build the full context string injected into each persona's prompt."""
    sections: list[str] = []

    pitch = state.get("pitch_context", {})
    if pitch and any(pitch.values()):
        lines = [f"  {k}: {v}" for k, v in pitch.items() if v]
        sections.append("PITCH CONTEXT:\n" + "\n".join(lines))

    deck = state.get("deck_critique")
    if deck:
        sections.append(
            "DECK CRITIQUE (summary):\n"
            f"  Narrative arc: {deck.get('narrative_arc_score', 'N/A')}/10\n"
            f"  Visual clarity: {deck.get('visual_clarity_score', 'N/A')}/10\n"
            f"  Top issues: {', '.join(deck.get('top_issues', []))}\n"
            f"  Missing slides: {', '.join(deck.get('missing_slides', []))}"
        )

    market = state.get("market_intel")
    if market:
        comp_names = [c.get("name", "") for c in market.get("competitors", [])]
        ms = market.get("market_size", {})
        sections.append(
            "MARKET INTELLIGENCE:\n"
            f"  Competitors: {', '.join(comp_names) or 'none found'}\n"
            f"  TAM: {ms.get('tam', 'unknown')} | SAM: {ms.get('sam', 'unknown')} | SOM: {ms.get('som', 'unknown')}\n"
            f"  Market confidence: {ms.get('confidence', 'unknown')}\n"
            f"  Tailwinds: {', '.join(market.get('why_now', {}).get('tailwinds', []))}\n"
            f"  Headwinds: {', '.join(market.get('why_now', {}).get('headwinds', []))}"
        )

    transcript = state.get("live_transcript", [])
    max_turns = settings.debate_context_transcript_turns
    if transcript:
        turns = "\n".join(f"  {t['speaker']}: {t['text']}" for t in transcript[-max_turns:])
        sections.append(f"LIVE INTERVIEW TRANSCRIPT (recent {max_turns} turns):\n{turns}")

    rounds = state.get("debate_rounds", [])
    max_chars = settings.debate_context_dialogue_chars
    if rounds:
        rounds_text: list[str] = []
        for r in rounds:
            rnum = r.get("round", "?")
            s_dia = r.get("skeptic", {}).get("dialogue", "")[:max_chars]
            o_dia = r.get("optimist", {}).get("dialogue", "")[:max_chars]
            op_dia = r.get("operator", {}).get("dialogue", "")[:max_chars]
            rounds_text.append(
                f"  Round {rnum}:\n"
                f"    Paul (Skeptic): {s_dia}...\n"
                f"    Elad (Optimist): {o_dia}...\n"
                f"    Keith (Operator): {op_dia}..."
            )
        sections.append("PREVIOUS DEBATE ROUNDS:\n" + "\n".join(rounds_text))

    return "\n\n".join(sections)


# ── Persona runner ─────────────────────────────────────────────────────────


async def _run_persona(client, system_prompt: str, user_content: str) -> dict:
    """Run a single persona call and return the raw parsed dict."""
    return await generate_json(
        client=client,
        model=settings.gemini_flash_model,
        system_instruction=system_prompt,
        user_content=user_content,
    )


# ── Main entry point ───────────────────────────────────────────────────────


async def run_deliberation(
    session_id: str,
    api_key: str | None = None,
    store: ss.SessionStore | None = None,
) -> FinalVerdict:
    """
    Run N rounds of VC deliberation and synthesize a final verdict.

    The number of rounds is controlled by ``settings.debate_rounds`` (default 3).
    Rounds are written to session state incrementally so the frontend
    can poll and display them as they arrive.

    Returns the validated ``FinalVerdict``.
    """
    _store = store or ss.default_store
    state = await _store.require_state(session_id)

    pitch_ctx = state.get("pitch_context", {})
    if not any(pitch_ctx.values()):
        raise SessionStateError(
            f"pitch_context is empty for session '{session_id}'. "
            "Submit a pitch via POST /api/pitch first."
        )

    await _store.set_task_status(session_id, "deliberation_status", "running")

    client = get_client(api_key)
    debate_rounds: list[dict] = []

    for round_num in range(1, settings.debate_rounds + 1):
        logger.info(
            "Deliberation: round %d/%d for session=%s",
            round_num,
            settings.debate_rounds,
            session_id,
        )

        # Refresh state so each round includes the previous rounds
        state = await _store.require_state(session_id)
        context = _build_debate_context(state)
        round_prompt = f"ROUND {round_num} OF {settings.debate_rounds}\n\n{context}"

        skeptic_raw = await _run_persona(client, SKEPTIC_PROMPT, round_prompt)
        optimist_raw = await _run_persona(client, OPTIMIST_PROMPT, round_prompt)
        operator_raw = await _run_persona(client, OPERATOR_PROMPT, round_prompt)

        # Validate each persona output
        round_obj = DebateRound(
            round=round_num,
            skeptic=SkepticOutput.model_validate(skeptic_raw),
            optimist=OptimistOutput.model_validate(optimist_raw),
            operator=OperatorOutput.model_validate(operator_raw),
        )
        debate_rounds.append(round_obj.model_dump())

        # Write incrementally — frontend can render rounds as they arrive
        await _store.update(session_id, {"debate_rounds": debate_rounds})

    # Final synthesis
    logger.info("Deliberation: synthesizing final verdict for session=%s", session_id)
    state = await _store.require_state(session_id)
    full_context = _build_debate_context(state)

    verdict_raw = await _run_persona(client, SYNTHESIZER_PROMPT, full_context)
    final_verdict = FinalVerdict.model_validate(verdict_raw)

    await _store.update(
        session_id,
        {
            "final_verdict": final_verdict.model_dump(),
            "deliberation_status": {"status": "completed", "error": None},
        },
    )

    logger.info("Deliberation: complete for session=%s", session_id)
    return final_verdict

# DayZero — System Architecture

> Version: 0.2 — Implementation Phase
> Last updated: 2026-03-14

---

## 1. Problem Statement

Founders spend weeks doing manual, bias-prone idea validation. They get feedback from friends (charitable), or from real investors (rare and gatekept). The result is underprepared pitches, wasted runway, and pivots that come too late.

DayZero replaces this with a **continuous, intelligent, real-world validation pipeline** that simulates a YC-style interview panel — complete with live voice conversation, competitive intelligence, sourced counter-arguments, and scored deliberation between VC personas.

---

## 2. High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          USER (Founder)                                 │
│                                                                         │
│   [🎤 Live Audio/Video]  [📄 Upload PDF/PPTX]  [💬 Typed Pitch ? (not prefered) iwant toshocase the multumodsal for the ahckaton]        │
└────────────────┬────────────────────┬────────────────────┬─────────────┘
                 │                    │                    │
                 │   WebSocket        │   REST /upload     │   REST /pitch
                 ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  FastAPI Backend  ·  Cloud Run (GCP)                    │
│                  [ ADK get_fast_api_app() ]                             │
│                                                                         │
│   /ws/live          /api/upload-deck        /api/session                │
│   WebSocket         multipart/form-data      REST CRUD                  │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR AGENT                               │
│                        LlmAgent (ADK requirement) + direct Python calls │
│                                                                         │
│  Role: Session controller. Receives typed pitch text.                   │
│  The ADK LlmAgent (create_orchestrator_agent) satisfies the hackathon  │
│  ADK requirement. All other agents are called directly as Python        │
│  functions for performance (no ADK sub-agent delegation).               │
│  Extracts structured pitch_context via extract_pitch_context().         │
│                                                                         │
│  session.state keys managed:                                            │
│    pitch_context       — structured pitch summary (filled by analyst)   │
│    live_transcript     — rolling live interview transcript              │
│    deck_critique       — DeckAnalyst structured output                  │
│    market_intel        — MarketValidator research output                │
│    debate_rounds       — list of debate round objects                   │
│    final_verdict       — synthesized investment decision                │
│    market_intel_status — background task status (idle/running/done/err) │
│    deliberation_status — background task status (idle/running/done/err) │
└──────┬───────────────────────────┬─────────────────────────────────────┘
       │                           │
       ├───────────────────────────┼──────────────────────────────────────┐
       │                           │                                      │
       ▼                           ▼                                      ▼
┌──────────────────┐   ┌───────────────────────┐   ┌─────────────────────┐
│  LIVE INTERVIEW  │   │    DECK ANALYST        │   │  MARKET VALIDATOR   │
│     AGENT        │   │      AGENT             │   │      AGENT          │
│                  │   │                        │   │                     │
│ gemini-live-2.5- │   │  gemini-2.5-flash      │   │  gemini-2.5-flash   │
│ flash-preview    │   │                        │   │  + Grounding tool   │
│                  │   │  Input: PDF pages as   │   │                     │
│ Modality:        │   │  PIL images (pdf2image) │   │  Input: pitch_context│
│  IN  → audio PCM │   │                        │   │  from session.state │
│  OUT → audio PCM │   │  Output:               │   │                     │
│        + text    │   │  - Narrative arc score │   │  Output:            │
│                  │   │  - Slide-by-slide notes│   │  - Competitor matrix│
│ Behavior:        │   │  - Visual clarity score│   │  - Market size eval │
│  YC Partner      │   │  - Key missing slides  │   │  - Pivot suggestions│
│  persona.        │   │  - Delivery assessment │   │  - All claims:      │
│  Probing Qs.     │   │    (if video input)    │   │    source URL +     │
│  Interruptable.  │   │                        │   │    confidence score │
│  Evaluates tone, │   │  Writes to:            │   │                     │
│  confidence,     │   │  session.state         │   │  Writes to:         │
│  hesitation.     │   │  ['deck_critique']     │   │  session.state      │
│                  │   │                        │   │  ['market_intel']   │
│  Writes to:      │   │                        │   │                     │
│  session.state   │   │                        │   │                     │
│  ['live_trans-   │   │                        │   │                     │
│   cript']        │   │                        │   │                     │
└──────────────────┘   └───────────────────────┘   └─────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      DELIBERATION PANEL                                 │
│                   3 rounds of persona debate (direct Python calls)      │
│                                                                         │
│  Triggered via POST /api/deliberate (background task)                  │
│  Context injected: pitch_context + deck_critique + market_intel +       │
│                    live_transcript (if available)                       │
│                                                                         │
│  run_deliberation() loops settings.debate_rounds times (default 3).    │
│  Each round calls Skeptic → Optimist → Operator sequentially.          │
│  Each persona reads the full debate_rounds history from session.state   │
│  before speaking — they reference, challenge, and build on each other.  │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │               DEBATE ROUND  (sequential function calls)        │    │
│  │                                                                │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │    │
│  │  │  THE SKEPTIC │  │ THE OPTIMIST │  │   THE OPERATOR       │ │    │
│  │  │              │  │              │  │                      │ │    │
│  │  │ Persona:     │  │ Persona:     │  │ Persona:             │ │    │
│  │  │ Paul Graham- │  │ Peter Thiel- │  │ Keith Rabois-        │ │    │
│  │  │ style. Hard  │  │ style. Sees  │  │ style. Operations,   │ │    │
│  │  │ on market    │  │ the 10x      │  │ unit economics,      │ │    │
│  │  │ size, moats, │  │ vision. Asks │  │ go-to-market,        │ │    │
│  │  │ competition, │  │ "why now?"   │  │ hiring, infra.       │ │    │
│  │  │ founder fit. │  │ and "why     │  │ Challenges           │ │    │
│  │  │              │  │ you?"        │  │ operational          │ │    │
│  │  │ Output:      │  │              │  │ assumptions.         │ │    │
│  │  │ - Objections │  │ Output:      │  │                      │ │    │
│  │  │ - Questions  │  │ - Thesis     │  │ Output:              │ │    │
│  │  │ - Score 1-10 │  │ - Analogies  │  │ - Execution risks    │ │    │
│  │  │ - Confidence │  │ - Score 1-10 │  │ - Score 1-10         │ │    │
│  │  │   + source   │  │ - Confidence │  │ - Confidence         │ │    │
│  │  │              │  │   + source   │  │   + source           │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘ │    │
│  │                                                                │    │
│  │  After round 3: synthesizer call generates final_verdict        │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  Final output written to session.state['final_verdict']:               │
│    - Investment decision: PASS / SOFT PASS / NO                        │
│    - Weighted score (0-100)                                             │
│    - Top 3 strengths                                                    │
│    - Top 3 risks                                                        │
│    - Recommended pivot (if applicable)                                  │
│    - All sourced claims with confidence scores                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow — Full Session Lifecycle

```
PHASE 0: Session Init
─────────────────────
User opens browser
  → POST /api/session
  → OrchestratorAgent creates ADK Session
  → session.state initialized with empty keys
  → Session ID returned to frontend

PHASE 1: Pitch Ingestion (parallel paths)
──────────────────────────────────────────
Path A — Live Audio:
  User clicks [Start Interview]
  → Browser captures mic audio (MediaRecorder → PCM 16kHz mono)
  → WebSocket /ws/live streams PCM to LiveInterviewAgent
  → LiveInterviewAgent (gemini-live-2.5-flash-preview) conducts YC interview
  → Agent voice streams back as PCM audio chunks via WebSocket
  → Browser AudioContext plays response in real time
  → Transcript written to session.state['live_transcript'] per turn
  → VAD handles interruptions natively

Path B — Deck Upload:
  User uploads PDF or PPTX
  → POST /api/upload-deck
  → PPTX → PDF via python-pptx (if needed)
  → PDF → list of PIL images via pdf2image
  → Images passed to DeckAnalystAgent as multimodal content
  → Structured critique written to session.state['deck_critique']

Path C — Text Pitch (fallback):
  User types pitch summary
  → POST /api/pitch
  → OrchestratorAgent extracts structured pitch_context
  → Written to session.state['pitch_context']

PHASE 2: Market Intelligence (triggered after pitch_context populated)
──────────────────────────────────────────────────────────────────────
OrchestratorAgent delegates to MarketValidatorAgent
  → Reads pitch_context from session.state
  → Uses Gemini grounding (Google Search) to research:
      - Named competitors
      - Market size claims (TAM/SAM/SOM)
      - Recent funding in space
      - Regulatory environment
      - Technology readiness
  → Each claim tagged with: source URL, date, confidence score (0.0–1.0)
  → Written to session.state['market_intel']

PHASE 3: Deliberation (triggered after all available context is ready)
───────────────────────────────────────────────────────────────────────
OrchestratorAgent triggers DeliberationPanel
  → LoopAgent runs up to 3 rounds
  → Each round: SequentialAgent runs Skeptic → Optimist → Operator
  → Each persona receives full context + all previous debate rounds
  → Each persona output includes:
      - In-character dialogue (conversational, not report-style)
      - Specific references to other personas' points
      - Scored claims with sourced confidence
  → After round 3: OrchestratorAgent synthesizes final_verdict
  → Written to session.state['final_verdict']

PHASE 4: Output Delivery
─────────────────────────
Frontend polls /api/session/{id} or receives streamed events
  → Debate rounds rendered as conversation transcript
  → Final verdict rendered as scored investment decision
  → Sources panel shows all cited evidence
  → Optional: download full report as PDF
```

---

## 4. Agent Identity & Persona Specifications

### 4.1 LiveInterviewAgent — "Sam" (YC Partner)

- **Voice:** Authoritative but warm. Direct. Never lets vague answers pass.
- **Behavior:** Asks one focused question at a time. Follows up on weak answers. Praises specificity. Challenges round numbers.
- **Interruption:** VAD enabled. If founder trails off or repeats, interjects naturally.
- **Scoring (live, hidden from user until end):** Tracks confidence signals — hesitation, filler words, specificity, energy.
- **Context awareness:** Reads `pitch_context` and `deck_critique` before session starts so questions are pitch-specific, not generic.

### 4.2 DeckAnalystAgent — "Deck Reviewer"

- **Persona:** Ex-design partner. Thinks visually. Cares about narrative flow.
- **Evaluates:** Hook slide, problem clarity, solution clarity, traction proof, team slide, ask slide.
- **Outputs:** Slide-by-slide annotations + overall narrative arc score + missing slides.

### 4.3 MarketValidatorAgent — "Research Desk"

- **Persona:** Analyst. Fact-obsessed. Never makes unsourced claims.
- **Behavior:** Every claim in output has: `{ claim, source_url, source_date, confidence: 0.0–1.0 }`.
- **Confidence scoring rubric:**
  - `0.9–1.0` — Primary source (SEC filing, official report, peer-reviewed)
  - `0.7–0.89` — Reputable secondary (Forbes, TechCrunch, CB Insights, Crunchbase)
  - `0.5–0.69` — Industry blog, analyst estimate
  - `0.3–0.49` — Forum, social media, unverified
  - `< 0.3` — Model inference with no source (flagged explicitly)

### 4.4 The Skeptic — "Paul" (VC Persona 1)

- **Model on:** Paul Graham's essays + classic YC rejection patterns.
- **Signature questions:** "Who specifically is customer #1?" / "What's your unfair advantage?" / "Why hasn't this been built by Google?"
- **Debate style:** Challenges the Optimist's thesis with evidence. Cites market_intel data. Never personal, always analytical.

### 4.5 The Optimist — "Elad" (VC Persona 2)

- **Model on:** Elad Gil high-growth company frameworks.
- **Signature questions:** "What does the 100x version of this look like?" / "Which existing behavior does this replace?"
- **Debate style:** Builds on Operator's execution concerns by offering strategic alternatives. Synthesizes across rounds.

### 4.6 The Operator — "Keith" (VC Persona 3)

- **Model on:** Keith Rabois operational rigor + scaling principles.
- **Signature questions:** "What's your CAC?" / "How do you know this scales past 1000 customers?" / "Who's the first 10 hires?"
- **Debate style:** Grounds the Optimist's vision in operational reality. References Skeptic's concerns to build a complete risk picture.

---

## 5. Session State Schema

```python
# session.state — full schema

{
  # --- Input context ---
  "pitch_context": {
    "company_name": str,
    "one_liner": str,
    "problem": str,
    "solution": str,
    "target_customer": str,
    "business_model": str,
    "traction": str,
    "team": str,
    "ask": str,                   # funding amount / ask
    "stage": str,                 # idea / MVP / seed / etc.
  },

  # --- Live interview ---
  "live_transcript": [
    { "speaker": "Sam" | "Founder", "text": str, "timestamp": float }
  ],
  "delivery_scores": {
    "confidence": float,          # 0.0–1.0
    "specificity": float,
    "energy": float,
    "hesitation_count": int,
  },

  # --- Deck analysis ---
  "deck_critique": {
    "narrative_arc_score": float,
    "visual_clarity_score": float,
    "slide_count": int,
    "slides": [
      {
        "index": int,
        "title": str,
        "critique": str,
        "score": float,
      }
    ],
    "missing_slides": [str],
    "top_issues": [str],
  },

  # --- Market intelligence ---
  "market_intel": {
    "competitors": [
      {
        "name": str,
        "description": str,
        "funding": str,
        "source_url": str,
        "confidence": float,
      }
    ],
    "market_size": {
      "tam": str,
      "sam": str,
      "som": str,
      "source_url": str,
      "confidence": float,
    },
    "pivot_suggestions": [
      {
        "suggestion": str,
        "rationale": str,
        "precedent_company": str,
        "source_url": str,
        "confidence": float,
      }
    ],
    "why_now": {
      "tailwinds": [str],
      "headwinds": [str],
      "source_urls": [str],
    },
  },

  # --- Deliberation ---
  "debate_rounds": [
    {
      "round": int,                 # 1, 2, 3
      "skeptic": {
        "dialogue": str,            # in-character speech, conversational
        "objections": [str],
        "questions": [str],
        "score": float,
        "cited_sources": [str],
      },
      "optimist": {
        "dialogue": str,
        "thesis_points": [str],
        "score": float,
        "cited_sources": [str],
      },
      "operator": {
        "dialogue": str,
        "execution_risks": [str],
        "score": float,
        "cited_sources": [str],
      },
    }
  ],

  # --- Final output ---
  "final_verdict": {
    "decision": "PASS" | "SOFT PASS" | "NO",
    "weighted_score": float,        # 0–100
    "score_breakdown": {
      "problem_clarity": float,
      "market_size": float,
      "solution_strength": float,
      "team": float,
      "traction": float,
      "delivery": float,
    },
    "strengths": [str],
    "risks": [str],
    "recommended_pivot": str | None,
    "next_steps": [str],
    "investment_thesis": str,
    "all_sources": [str],           # list of source URLs
  },

  # --- Internal flags ---
  "live_interview_active": bool,
  "deck_analysis_done": bool,

  # --- Background task statuses ---
  # status: "idle" | "running" | "completed" | "failed"
  "market_intel_status": { "status": str, "error": str | None },
  "deliberation_status": { "status": str, "error": str | None },
}
```

---

## 6. API Surface

```
POST   /api/session                 Create new session → { session_id }
GET    /api/session/{id}            Get full session state
DELETE /api/session/{id}            End session

POST   /api/upload-deck             Upload PDF/PPTX → triggers DeckAnalystAgent
POST   /api/pitch                   Submit typed pitch text → populates pitch_context

WS     /ws/live/{session_id}        Bidirectional audio stream (PCM 16kHz)
                                    Client → server: audio chunks
                                    Server → client: audio chunks + text events

GET    /api/session/{id}/verdict    Get final_verdict when ready
GET    /api/session/{id}/sources    Get all_sources list
GET    /api/session/{id}/debate     Get full debate_rounds
```

---

## 6b. Backend Package Structure

```
backend/
├── main.py                  FastAPI app, route handlers, exception middleware
├── config.py                pydantic-settings Settings class (all tuneable values)
├── session_state.py         SessionStore (ADK InMemorySessionService wrapper)
├── audio_utils.py           PCM encode/decode helpers
│
├── core/                    Shared abstractions (no business logic)
│   ├── __init__.py
│   ├── errors.py            Full error hierarchy (DayZeroError → typed subclasses)
│   ├── gemini_client.py     get_client(), generate_json*() helpers
│   ├── formatters.py        format_pitch_context(), format_pitch_context_for_research()
│   └── models.py            Pydantic models for every domain object
│
└── agents/
    ├── orchestrator.py      extract_pitch_context(), process_pitch(), ADK LlmAgent
    ├── deck_analyst.py      analyze_deck() — multimodal PDF/PPTX critique
    ├── market_validator.py  validate_market() — Gemini + Google Search grounding
    ├── deliberation.py      run_deliberation() — 3-round Skeptic/Optimist/Operator loop
    └── live_interview.py    run_live_interview() — Gemini Live API WebSocket handler
```

### config.py key settings (all env-overridable)

| Setting | Default | Env var |
|---------|---------|---------|
| `gemini_flash_model` | `gemini-2.5-flash` | `GEMINI_FLASH_MODEL` |
| `gemini_live_model` | `gemini-2.5-flash-native-audio-preview-12-2025` | `GEMINI_LIVE_MODEL` |
| `debate_rounds` | `3` | `DEBATE_ROUNDS` |
| `deck_render_dpi` | `150` | `DECK_RENDER_DPI` |
| `max_upload_bytes` | `52428800` (50 MB) | `MAX_UPLOAD_BYTES` |
| `enable_deck_analysis` | `true` | `ENABLE_DECK_ANALYSIS` |
| `enable_market_validation` | `true` | `ENABLE_MARKET_VALIDATION` |
| `enable_live_interview` | `true` | `ENABLE_LIVE_INTERVIEW` |

### SessionStore

`SessionStore` wraps `InMemorySessionService` and exposes:
- `create()` → session_id
- `get_state(sid)` → dict | None
- `require_state(sid)` → dict (raises `SessionNotFoundError` on miss)
- `update(sid, updates)` → None (raises on missing session)
- `delete(sid)` → None
- `append_transcript_turn(sid, speaker, text, timestamp)` → None
- `set_task_status(sid, key, status, error?)` → None

All agents accept an optional `store: SessionStore` parameter for dependency injection in tests.

---

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Google Cloud Platform                         │
│                                                                     │
│  ┌──────────────────────┐    ┌───────────────────────────────────┐  │
│  │     Cloud Run         │    │         Secret Manager            │  │
│  │                       │    │                                   │  │
│  │  dayzero-backend      │    │  GOOGLE_API_KEY                   │  │
│  │  Python 3.11          │    │  (AI Studio key)                  │  │
│  │  min-instances: 1     │    └───────────────────────────────────┘  │
│  │  max-instances: 10    │                                           │
│  │  memory: 512Mi        │    ┌───────────────────────────────────┐  │
│  │  cpu: 1               │    │       Cloud Storage (optional)    │  │
│  │                       │    │                                   │  │
│  │  PORT: 8080           │    │  Uploaded deck files              │  │
│  │  CONCURRENCY: 80      │    │  (temp storage, TTL 24h)          │  │
│  └──────────────────────┘    └───────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    External APIs                             │   │
│  │                                                              │   │
│  │  Gemini Developer API (AI Studio key, free tier)            │   │
│  │    gemini-2.5-flash                — all analysis agents    │   │
│  │    gemini-2.5-flash-native-audio-preview — live interview   │   │
│  │    Google Search grounding         — MarketValidatorAgent   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Local dev stack (no cloud required)

```
ADK dev server:    adk web --port 8000
Session storage:   SQLite (file: sessions.db)
File uploads:      local /tmp/uploads/
API key:           .env file → GOOGLE_API_KEY
```

---

## 8. Frontend Architecture (Minimal HTML)

The UI is intentionally minimal. No frameworks. No build steps. Vanilla HTML + JS + CSS in a single `index.html`.

```
index.html
│
├── SECTION: Session Init
│     [Start New Pitch Session] button → POST /api/session
│
├── SECTION: Pitch Input (tabs)
│     Tab 1: [🎤 Live Interview]
│             - [Start] / [Stop] button
│             - MediaRecorder → PCM conversion (AudioWorklet)
│             - WebSocket connection to /ws/live/{session_id}
│             - Live transcript display (scrolling)
│             - Audio playback (AudioContext, PCM chunks)
│
│     Tab 2: [📄 Upload Deck]
│             - File input (PDF / PPTX)
│             - Progress bar
│             - Deck critique panel (populated after analysis)
│
│     Tab 3: [💬 Type Pitch]
│             - Textarea
│             - [Analyze] button → POST /api/pitch
│
├── SECTION: Market Intelligence Panel
│     - Competitor table (name, funding, source link)
│     - Market size (TAM/SAM/SOM with confidence badges)
│     - Pivot suggestions
│
├── SECTION: Live Deliberation Panel
│     - Debate transcript rendered as chat bubbles
│       (Paul, Elad, Keith each have distinct color/avatar)
│     - Round indicator (Round 1 of 3, Round 2 of 3...)
│     - Each message shows confidence score + source link inline
│
└── SECTION: Final Verdict
      - PASS / SOFT PASS / NO badge (large, prominent)
      - Weighted score gauge (0–100)
      - Score breakdown (6 dimensions, bar chart via plain CSS)
      - Top 3 Strengths / Top 3 Risks
      - Recommended pivot (if any)
      - Full sources list (collapsible)
```

---

## 9. Key Design Decisions & Rationale

| Decision           | Choice                                                      | Rationale                                                                             |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Agent framework    | ADK (google-adk)                                            | Mandatory per hackathon rules; native multi-agent, built-in FastAPI, Cloud Run deploy |
| Live model         | gemini-live-2.5-flash-preview                               | Only Live API model on AI Studio free tier                                            |
| Analysis model     | gemini-2.5-flash                                            | Free tier, multimodal (images, PDFs), fast                                            |
| Debate structure   | 3-round loop, direct Python calls               | Genuine cross-referencing; bounded cost; testable without ADK         |
| Confidence scoring | Per-claim, not per-agent                                    | Granular trust signals for judges and founders                        |
| PDF parsing        | pdf2image (PIL images)                                      | Best for Gemini vision; preserves visual context                      |
| Frontend           | Single index.html, no frameworks                            | No build pipeline; faster to debug; judges can read source                            |
| Audio pipeline     | MediaRecorder → PCM via AudioWorklet                        | Standard path; avoids Opus/WebM conversion complexity                 |
| State management   | ADK InMemorySessionService (SessionStore wrapper)           | Built-in; injectable for tests; swap to Redis without touching agents |
| Config             | pydantic-settings (Settings class in config.py)             | All model names / limits / flags env-overridable; type-safe defaults  |
| Cloud deployment   | Cloud Run via adk deploy cloud_run                          | One command; free tier; easy GCP proof recording                      |

---

## 10. Out of Scope (Explicitly Deferred)

- User authentication / accounts
- Persistent pitch history across sessions
- PDF report download
- Video input to LiveInterviewAgent (audio-only for now)
- Real-time stock/funding data integrations (grounding handles this)
- Mobile UI
- Multi-language support

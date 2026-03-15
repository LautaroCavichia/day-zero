# DayZero — App Dashboard Plan

> Phase 1 complete: Landing page (`/`)  
> This document covers all planned app pages and phases for the session workspace.  
> Build one phase at a time, maintaining the same style, animations, and components.

---

## Architecture Decisions

- **Session start flow**: Guided onboarding (3 steps: upload deck → preview → start interview)
- **Orb placement**: Right panel above mic controls, slide viewer on left
- **Sidebar**: Collapsible (280px open, 64px icon-only collapsed), visible during interview

---

## Route Structure

```
/                           Landing page (done)
/app                        Session start — guided onboarding
/app/session/:id            Session workspace (all phases)
```

---

## Session Workspace Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  AppNav  [ ≡ ]  DayZero  │  Session: "My Startup Pitch"  │      │
├────────┬─────────────────────────────────────────────────────────┤
│        │                                                         │
│  Side  │   Main Content Area (switches per active phase)         │
│  bar   │                                                         │
│        │   Phase 1: Live Interview + Slides ← Phase being built  │
│  ● 1   │   Phase 2: Deck Analysis Results                        │
│    2   │   Phase 3: Market Intelligence                          │
│    3   │   Phase 4: VC Deliberation (audio)                      │
│    4   │   Phase 5: Final Verdict                                │
│    5   │                                                         │
│        │                                                         │
├────────┴─────────────────────────────────────────────────────────┤
│  ● Connected  │  02:34  │  ████░░░░ Mic Level                    │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Live Interview (IMPLEMENTED)

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│  AppNav                                                        │
├──────┬─────────────────────────────────────────────────────────┤
│      │  ┌─────────────────────────┬──────────────────────────┐ │
│ Side │  │                         │                          │ │
│  bar │  │    Slide Viewer         │    Voice Channel         │ │
│      │  │                         │                          │ │
│  ● 1 │  │  ┌───────────────────┐  │  ┌──────────────────┐   │ │
│    2 │  │  │                   │  │  │                  │   │ │
│    3 │  │  │  [Slide Image]    │  │  │      Orb         │   │ │
│    4 │  │  │                   │  │  │   (pulsing to    │   │ │
│    5 │  │  │                   │  │  │    AI voice)     │   │ │
│      │  │  └───────────────────┘  │  │                  │   │ │
│      │  │                         │  └──────────────────┘   │ │
│      │  │  ◀  Slide 3 of 12  ▶   │                          │ │
│      │  │                         │  Sam is speaking...      │ │
│      │  │                         │                          │ │
│      │  │                         │  [ Mic ]  [ End Call ]   │ │
│      │  ├─────────────────────────┼──────────────────────────┤ │
│      │  │                         │                          │ │
│      │  │  Chat Transcript        │  Coaching Tips           │ │
│      │  │                         │                          │ │
│      │  │  Sam: Tell me about     │  "Try naming your first  │ │
│      │  │  your target customer.  │   3 paying customers"    │ │
│      │  │                         │                          │ │
│      │  │  You: We're targeting   │                          │ │
│      │  │  mid-market SaaS...     │                          │ │
│      │  │                         │                          │ │
│      │  └─────────────────────────┴──────────────────────────┘ │
├──────┴─────────────────────────────────────────────────────────┤
│  ● Connected  │  02:34  │  ████░░░░ Mic Level                   │
└────────────────────────────────────────────────────────────────┘
```

### Backend Connections

| Feature | Endpoint | Protocol |
|---------|----------|----------|
| Create session | `POST /api/session` | REST |
| Upload deck | `POST /api/upload-deck` | REST multipart |
| Get slides | `GET /api/session/:id/slides` | REST |
| Live interview | `WS /ws/live/:id` | WebSocket |
| Coaching tips | `POST /api/session/:id/coach` | REST |
| Poll session state | `GET /api/session/:id` | REST polling |

### WebSocket Events (Live Interview)

**Client → Server:**
- Binary: PCM 16kHz audio chunks
- JSON: `{ type: "end_stream" }`
- JSON: `{ type: "slide_change", index: N, title: "...", total: N }`

**Server → Client:**
- Binary: PCM 24kHz audio chunks (AI voice)
- JSON: `{ type: "transcript_input", text: "...", timestamp: N }` — user speech
- JSON: `{ type: "transcript_output", text: "...", timestamp: N }` — AI speech
- JSON: `{ type: "turn_complete" }`
- JSON: `{ type: "interrupted" }`
- JSON: `{ type: "error", message: "..." }`

### Orb Adaptation (voice reactivity)

The `Orb.tsx` component is adapted to accept an `audioLevel?: number` prop (0.0–1.0).
When provided, it overrides mouse hover detection and drives the GLSL `hover` uniform directly.
The audio level is derived from a Web Audio `AnalyserNode` on the playback output chain,
computing RMS from frequency data and normalizing to 0–1.

**Props added:**
- `audioLevel?: number` — 0.0 (silent) to 1.0 (peak) — overrides mouse hover when set
- `hue` for DayZero: `111` (shifts to chartreuse/green)
- `backgroundColor`: `"#050505"` (matches page background)

---

## Phase 2 — Deck Analysis (PLANNED)

**Unlocks after:** Deck is uploaded and analyzed

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Summary Row: Narrative Arc Score | Visual Clarity | Slide Count │
├─────────────────────────────────────────────────────────┤
│  Slide-by-slide grid (thumbnail + critique + score)     │
├─────────────────────────────────────────────────────────┤
│  Missing Slides panel  |  Top Issues list               │
├─────────────────────────────────────────────────────────┤
│  Strengths list                                         │
└─────────────────────────────────────────────────────────┘
```

### Backend Connections

| Feature | Endpoint |
|---------|----------|
| Get deck critique | `GET /api/session/:id` → `deck_critique` key |
| Get slide images | `GET /api/session/:id/slides` |

### Components Needed

- `DeckAnalysis` — orchestrator
- `SlideGrid` — thumbnail + score + critique per slide
- `ScoreSummaryBar` — narrative arc score, visual clarity score
- `IssueList` — top issues + missing slides
- `StrengthsList` — deck strengths

---

## Phase 3 — Market Intelligence (PLANNED)

**Unlocks after:** `pitch_context` is populated (from interview transcript or typed pitch)

### Layout

```
┌──────────────────────┬──────────────────────────────────┐
│  Market Size         │  Tailwinds / Headwinds           │
│  TAM / SAM / SOM     │  (sourced, confidence-scored)    │
│  (with source links) │                                  │
├──────────────────────┴──────────────────────────────────┤
│  Competitor Matrix                                       │
│  (name, description, funding, source, confidence badge) │
├─────────────────────────────────────────────────────────┤
│  Pivot Suggestions                                       │
│  (suggestion, rationale, precedent company)             │
└─────────────────────────────────────────────────────────┘
```

### Backend Connections

| Feature | Endpoint |
|---------|----------|
| Trigger market research | `POST /api/validate-market?session_id=` |
| Poll status | `GET /api/session/:id` → `market_intel_status` |
| Get results | `GET /api/session/:id` → `market_intel` |

### Components Needed

- `MarketIntel` — orchestrator with loading state
- `MarketSizeCard` — TAM/SAM/SOM with confidence badges
- `CompetitorTable` — sortable competitor rows
- `TailwindsPanel` — tailwinds (green) / headwinds (red)
- `PivotSuggestions` — pivot cards with precedent company

---

## Phase 4 — VC Deliberation (PLANNED)

**Unlocks after:** Market intel is completed

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Round indicator: Round 1 of 3  |  [Start Deliberation] │
├────────────────┬────────────────┬────────────────────────┤
│  Paul          │  Elad          │  Keith                  │
│  (Skeptic)     │  (Optimist)    │  (Operator)             │
│  🔴            │  🟢            │  🔵                    │
├────────────────┴────────────────┴────────────────────────┤
│  Debate transcript (chat-style, persona-colored bubbles) │
│  Each message: persona name, score badge, source links   │
├─────────────────────────────────────────────────────────┤
│  Audio controls: [Play Voice Deliberation] — uses        │
│  WS /ws/deliberation/:id for voiced personas             │
└─────────────────────────────────────────────────────────┘
```

### Backend Connections

| Feature | Endpoint | Protocol |
|---------|----------|----------|
| Start deliberation | `POST /api/deliberate?session_id=` | REST |
| Audio deliberation | `WS /ws/deliberation/:id` | WebSocket |
| Poll status | `GET /api/session/:id` → `deliberation_status` | REST |
| Get debate rounds | `GET /api/session/:id/debate` | REST |

### Persona Styles

| Persona | Name | Role | Color |
|---------|------|------|-------|
| Paul | Skeptic | Challenges assumptions | `#e53e3e` (red) |
| Elad | Optimist | Sees 10x vision | `#38a169` (green) |
| Keith | Operator | Unit economics | `#3182ce` (blue) |

### Components Needed

- `Deliberation` — orchestrator
- `PersonaHeader` — persona card (name, role, score, color)
- `DebateThread` — chat bubbles per round, grouped by speaker
- `RoundIndicator` — Round N of 3 progress stepper
- `AudioDeliberationPlayer` — play/pause for voiced deliberation

---

## Phase 5 — Final Verdict (PLANNED)

**Unlocks after:** Deliberation is completed

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  PASS / SOFT PASS / NO  (large badge)                   │
│  Weighted Score: 74/100  (large mono number)            │
├──────────────────────────┬──────────────────────────────┤
│  Score Breakdown         │  Investment Thesis           │
│  6 dimensions, bar chart │  (1 paragraph summary)       │
│                          │                              │
│  Problem Clarity  ████░  │  "The team has demonstrated  │
│  Market Size      ███░░  │  strong founder-market fit   │
│  Solution         █████  │  with..."                    │
│  Team             ████░  │                              │
│  Traction         ██░░░  │                              │
│  Delivery         ████░  │                              │
├──────────────────────────┴──────────────────────────────┤
│  Top 3 Strengths   |   Top 3 Risks                      │
├─────────────────────────────────────────────────────────┤
│  Recommended Pivot (if any)                             │
├─────────────────────────────────────────────────────────┤
│  Actionable Next Steps (numbered list)                  │
├─────────────────────────────────────────────────────────┤
│  All Sources (collapsible, confidence badges)           │
└─────────────────────────────────────────────────────────┘
```

### Backend Connections

| Feature | Endpoint |
|---------|----------|
| Get verdict | `GET /api/session/:id/verdict` |
| Get sources | `GET /api/session/:id/sources` |

### Components Needed

- `Verdict` — orchestrator
- `VerdictBadge` — PASS/SOFT PASS/NO with color coding
- `ScoreGauge` — large 0-100 score with animated fill
- `ScoreBreakdownChart` — 6-dimension bar chart
- `StrengthsRisks` — side-by-side lists
- `NextSteps` — numbered action items
- `SourcesPanel` — collapsible list with confidence badges

---

## Full File Structure

```
frontend/src/
├── pages/
│   ├── landing.tsx                    (done)
│   ├── session-start.tsx              /app — guided onboarding
│   └── session-workspace.tsx          /app/session/:id — workspace
│
├── components/
│   ├── app/
│   │   ├── app-layout.tsx             Sidebar + main content wrapper
│   │   ├── app-nav.tsx                Top bar (Logo, session name, collapse toggle)
│   │   └── app-sidebar.tsx            5-step workflow sidebar
│   │
│   ├── session/
│   │   ├── live-interview.tsx         Phase 1 orchestrator
│   │   ├── slide-viewer.tsx           Slide image + nav controls
│   │   ├── voice-channel.tsx          Orb + status + mic/end controls
│   │   ├── chat-transcript.tsx        Real-time message scroll
│   │   ├── deck-uploader.tsx          Drag-and-drop upload zone
│   │   └── onboarding-steps.tsx       3-step guided start flow
│   │
│   │   (future phases)
│   │   ├── deck-analysis.tsx          Phase 2
│   │   ├── market-intel.tsx           Phase 3
│   │   ├── deliberation.tsx           Phase 4
│   │   └── verdict.tsx                Phase 5
│   │
│   ├── Orb.tsx                        MODIFIED: +audioLevel prop
│   └── ...existing landing components...
│
├── hooks/
│   ├── useInView.ts                   (exists)
│   ├── useSession.ts                  Session CRUD + polling
│   ├── useAudioPipeline.ts            Mic → PCM16 → WebSocket → PCM24 → playback
│   ├── useAudioAnalyser.ts            AnalyserNode → audioLevel (0–1)
│   └── useLiveInterview.ts            WebSocket lifecycle + transcript state
│
├── services/
│   └── api.ts                         REST client
│
└── types/
    └── session.ts                     TS interfaces matching backend models
```

---

## Styling Rules (carry forward from landing)

- Dark mode only, `bg-background` (#050505)
- Chartreuse (`#C8FF00`) for active states, CTAs, highlights, scores
- Forest greens for secondary surfaces
- Cards: `bg-card border border-border rounded-xl p-6`
- `<GrainOverlay />` on all pages
- Typography: Outfit (headings), Inter (body), Fira Code (data/mono)
- CSS keyframe animations + `useInView` for scroll entrances
- Lucide icons only, `strokeWidth={1.5}`
- No emoji in UI, no hardcoded hex colors

---

## VC Persona Color Reference

| Persona | Role | Hex | Tailwind Approximate |
|---------|------|-----|---------------------|
| Paul | Skeptic | `#e53e3e` | `text-red-500` |
| Elad | Optimist | `#38a169` | `text-green-600` |
| Keith | Operator | `#3182ce` | `text-blue-500` |
| Chair | Synthesizer | `#764ba2` | `text-purple-600` |

---

## Implementation Status

| Phase | Status |
|-------|--------|
| Landing page | ✓ Done |
| Session start + onboarding | ✓ Done |
| Phase 1: Live Interview | ✓ Done |
| Phase 2: Deck Analysis | Planned |
| Phase 3: Market Intelligence | Planned |
| Phase 4: VC Deliberation | Planned |
| Phase 5: Final Verdict | Planned |

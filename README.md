# DayZero

**AI-powered YC-style pitch validation**

DayZero simulates a Y Combinator interview panel to validate startup ideas. It features:

- **Live YC-style interview** with Sam, an AI partner (real-time audio via Gemini Live API)
- **Pitch deck analysis** with slide-by-slide critique and narrative scoring
- **Market intelligence** with competitor research, market sizing, and sourced claims
- **3-round VC deliberation** with distinct personas (Skeptic, Optimist, Operator)
- **Investment decision** with scored breakdown, strengths, risks, and next steps

Built with:
- **Backend:** FastAPI + Google ADK + Gemini 2.5 Flash
- **Frontend:** Vanilla HTML/CSS/JS (single-file, no build step)
- **Audio:** WebSocket + PCM streaming (16kHz in, 24kHz out)
- **Deployment:** Docker + Cloud Run ready

---

## Quick Start

### Prerequisites

- Python 3.11+
- Google AI Studio API key ([get one here](https://aistudio.google.com/apikey))
- (Optional) LibreOffice for PPTX→PDF conversion
- (Optional) Poppler for PDF→image conversion

### 1. Clone and Setup

```bash
git clone <repo-url>
cd dayZero-2

# Create virtual environment
python3.11 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt
```

### 2. Configure API Key

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your API key
echo "GOOGLE_API_KEY=your_api_key_here" > .env
```

### 3. Run Locally

```bash
# From project root
cd backend
python main.py

# Or with uvicorn directly
uvicorn main:app --reload --port 8080
```

Server will start at: **http://localhost:8080**

### 4. Access the UI

Open your browser to **http://localhost:8080**

You'll see the DayZero interface with:
1. **Session Management** — Start a new pitch session
2. **Pitch Input** — Choose live interview, deck upload, or typed pitch
3. **Market Intelligence** — Trigger market research with Google Search grounding
4. **Deliberation** — Run 3-round VC panel debate
5. **Verdict** — View final investment decision with sources

---

## Docker Deployment

### Build the Image

```bash
docker build -t dayzero .
```

### Run with Docker

```bash
docker run -p 8080:8080 --env-file .env dayzero
```

Or pass the API key directly:

```bash
docker run -p 8080:8080 -e GOOGLE_API_KEY=your_key_here dayzero
```

### Deploy to Cloud Run (GCP)

```bash
# Enable Cloud Run API
gcloud services enable run.googleapis.com

# Build and deploy
gcloud run deploy dayzero \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_API_KEY=your_key_here \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10
```

---

## Architecture Overview

### Backend (`/backend`)

```
backend/
├── main.py                     # FastAPI app + WebSocket routes
├── session_state.py            # ADK session management
├── audio_utils.py              # PCM audio helpers
├── agents/
│   ├── orchestrator.py         # ADK LlmAgent (pitch text extraction)
│   ├── live_interview.py       # Gemini Live API WebSocket bridge
│   ├── deck_analyst.py         # Multimodal deck analysis
│   ├── market_validator.py     # Market research with grounding
│   └── deliberation.py         # 3-round VC panel debate
└── requirements.txt
```

**Key Endpoints:**

- `POST /api/session` — Create new session
- `GET /api/session/{id}` — Get session state
- `POST /api/pitch` — Submit typed pitch text
- `POST /api/upload-deck` — Upload PDF/PPTX deck
- `WS /ws/live/{id}` — Live audio interview WebSocket
- `POST /api/validate-market` — Trigger market research
- `POST /api/deliberate` — Run VC deliberation
- `GET /api/session/{id}/verdict` — Get final decision
- `GET /api/session/{id}/debate` — Get debate rounds
- `GET /api/session/{id}/sources` — Get all sources
- `GET /health` — Health check

### Frontend (`/frontend`)

Single-file `index.html` with:
- Session bootstrap
- 3 input tabs: Live Interview, Upload Deck, Type Pitch
- WebSocket audio pipeline (AudioWorklet for PCM conversion)
- Market intel panel with confidence badges
- Debate transcript with persona-specific styling
- Final verdict card with score breakdown

**Audio Pipeline:**

```
Browser Mic (getUserMedia)
  → MediaStreamSource
  → AudioWorklet (float32 → PCM16)
  → WebSocket (binary frames)
  → Backend → Gemini Live API

Gemini Live API → Backend
  → WebSocket (binary PCM24)
  → Browser AudioContext (PCM → playback)
```

---

## API Key Setup

### Get a Free API Key

1. Visit [Google AI Studio](https://aistudio.google.com/apikey)
2. Sign in with Google account
3. Click "Get API Key" → "Create API Key"
4. Copy the key

### Add to .env

```bash
GOOGLE_API_KEY=AIzaSy...your_key_here
```

### Models Used

- **Live Interview:** `gemini-2.5-flash-native-audio-preview-12-2025`
- **Analysis/Debate:** `gemini-2.5-flash`
- **Grounding:** Google Search tool (free tier)

---

## System Dependencies

### For Deck Analysis (PDF/PPTX)

**macOS:**
```bash
brew install poppler libreoffice
```

**Ubuntu/Debian:**
```bash
apt-get install poppler-utils libreoffice
```

**Docker:** Already included in `Dockerfile`

### For Live Audio

No extra dependencies — uses browser `getUserMedia` + `AudioContext`.

---

## Usage Flow

### 1. Create Session
Click "Start New Pitch Session" to initialize a new DayZero session.

### 2. Provide Pitch Input (choose one or multiple)

**Option A: Live Interview**
- Click "🎤 Live Interview"
- Grant mic permissions
- Click "Start Interview"
- Speak naturally — Sam (AI partner) will ask probing YC-style questions
- Click "Stop Interview" when done

**Option B: Upload Deck**
- Click "📄 Upload Deck"
- Select PDF or PPTX file
- Click "Analyze Deck"
- View slide-by-slide critique, narrative arc, and missing slides

**Option C: Type Pitch**
- Click "💬 Type Pitch"
- Enter pitch summary (problem, solution, customer, traction, team, ask)
- Click "Analyze Pitch"

### 3. Run Market Research
- Click "Run Market Research"
- Backend uses Gemini + Google Search to validate claims
- View competitors, market size, tailwinds/headwinds, pivot suggestions
- All claims include confidence scores + source URLs

### 4. Start Deliberation
- Click "Start Deliberation"
- 3 VC personas debate over 3 rounds:
  - **Paul (Skeptic)** — Challenges market size, moats, competition
  - **Elad (Optimist)** — Sees 10x vision, asks "why now?"
  - **Keith (Operator)** — Drills into unit economics, CAC, go-to-market
- Each round builds on previous arguments

### 5. View Verdict
- Final investment decision: **PASS** / **SOFT PASS** / **NO**
- Weighted score (0-100)
- Score breakdown (6 dimensions)
- Top 3 strengths + top 3 risks
- Recommended pivot (if applicable)
- Actionable next steps
- All sourced claims with confidence badges

---

## Troubleshooting

### "GOOGLE_API_KEY is not configured"
Add your API key to `.env` file or set as environment variable.

### "LibreOffice is required for PPTX conversion"
Install LibreOffice:
- macOS: `brew install libreoffice`
- Linux: `apt install libreoffice`
- Or upload PDF directly instead of PPTX

### "Could not extract images from deck file"
Install Poppler:
- macOS: `brew install poppler`
- Linux: `apt install poppler-utils`

### Live audio not working
- Ensure browser has mic permissions granted
- Use HTTPS or localhost (required for `getUserMedia`)
- Check browser console for WebSocket errors

### Market validation timeout
- Default timeout is 40s (20 attempts × 2s)
- If grounding takes longer, increase `maxAttempts` in `pollForMarketIntel()`

### Deliberation timeout
- Default timeout is 90s (30 attempts × 3s)
- Increase `maxAttempts` in `pollForDeliberation()` if needed

---

## Development

### Project Structure

```
dayZero-2/
├── backend/
│   ├── main.py
│   ├── session_state.py
│   ├── audio_utils.py
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── orchestrator.py
│   │   ├── live_interview.py
│   │   ├── deck_analyst.py
│   │   ├── market_validator.py
│   │   └── deliberation.py
│   └── requirements.txt
├── frontend/
│   └── index.html
├── .agents/
│   └── ARCHITECTURE.md
├── .env.example
├── Dockerfile
└── README.md
```

### Run Tests

```bash
# Check health endpoint
curl http://localhost:8080/health

# Create session
curl -X POST http://localhost:8080/api/session

# Get session state
curl http://localhost:8080/api/session/{session_id}
```

### Logs

```bash
# View backend logs
tail -f logs/dayzero.log

# In Docker
docker logs -f <container_id>
```

---

## Architecture Details

See [`.agents/ARCHITECTURE.md`](.agents/ARCHITECTURE.md) for full system design, agent specifications, session state schema, and data flow diagrams.

**Key Design Decisions:**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Agent framework | Google ADK | Hackathon requirement; native multi-agent orchestration |
| Live model | `gemini-2.5-flash-native-audio-preview` | Only Live API model on free tier |
| Analysis model | `gemini-2.5-flash` | Free tier, multimodal (images, PDFs), fast |
| Debate structure | 3 sequential rounds, 3 personas per round | Genuine cross-referencing; bounded cost |
| Frontend | Single HTML file | No build pipeline; judges can read source |
| Audio pipeline | WebSocket + PCM | Standard path; avoids codec complexity |
| State management | ADK InMemorySessionService | Built-in; no external DB needed |
| Deployment | Cloud Run | One command; free tier; GCP-native |

---

## Limitations

- **Audio:** Input must be 16kHz PCM mono; output is 24kHz PCM mono
- **Deck conversion:** PPTX requires LibreOffice (included in Docker)
- **Session storage:** In-memory only (lost on server restart)
- **Rate limits:** Free tier Gemini API limits apply
- **Video:** Live interview is audio-only (no video input)
- **Mobile:** UI optimized for desktop; mobile support limited

---

## Contributing

This is a hackathon project. For questions or issues:
1. Check `backend/main.py` logs for errors
2. Review `.agents/ARCHITECTURE.md` for system design
3. Open an issue with error messages + reproduction steps

---

## License

MIT License — see `LICENSE` file for details.

---

## Acknowledgments

- **Google ADK** for multi-agent orchestration
- **Gemini Live API** for real-time audio streaming
- **Google AI Studio** for free-tier API access
- **YC Partners** for inspiration (Paul Graham, Elad Gil, Keith Rabois)

---

**Built for the Google ADK Hackathon** 🚀

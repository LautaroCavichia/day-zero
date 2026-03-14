/**
 * metrics.js — Real-time pitch metrics (frontend-only, no API calls)
 *
 * Tracks and renders:
 *   - Elapsed time (live clock)
 *   - Words per minute (rolling 30s window)
 *   - Filler word count  (um, uh, like, you know, basically, literally, right, so)
 *   - Topic coverage     (simple keyword matching against YC pitch dimensions)
 *
 * Exports:
 *   initMetrics(containerId)   — create DOM, reset state, start timer
 *   stopMetrics()              — stop timer, freeze display
 *   recordTranscript(text)     — call with each new transcript chunk
 *   resetMetrics()             — full reset + hide container
 */

// ── Config ────────────────────────────────────────────────────────────────────

const FILLER_WORDS = ['um', 'uh', 'like', 'you know', 'basically', 'literally', 'right', 'so'];

// Topic → keywords (any match = covered)
const TOPICS = {
  Problem:   ['problem', 'pain', 'challenge', 'issue', 'struggle', 'hard'],
  Solution:  ['solution', 'product', 'platform', 'app', 'tool', 'built', 'system'],
  Market:    ['market', 'tam', 'billion', 'million', 'customers', 'users', 'audience'],
  Traction:  ['revenue', 'customers', 'growth', 'mrr', 'arr', 'users', 'signups', 'paying'],
  Team:      ['founded', 'team', 'cto', 'ceo', 'background', 'experience', 'years'],
  Ask:       ['raising', 'ask', 'funding', 'investment', 'round', 'seed', 'series'],
};

// ── State ─────────────────────────────────────────────────────────────────────

let _containerId = null;
let _startTime = null;
let _timerInterval = null;
let _fillerCount = 0;
let _totalWords = 0;
let _wordTimestamps = [];   // unix ms for each word, for rolling WPM
let _coveredTopics = new Set();

// ── Public API ─────────────────────────────────────────────────────────────────

export function initMetrics(containerId) {
  _containerId = containerId;
  _startTime = Date.now();
  _fillerCount = 0;
  _totalWords = 0;
  _wordTimestamps = [];
  _coveredTopics = new Set();

  _buildDOM();

  if (_timerInterval) clearInterval(_timerInterval);
  _timerInterval = setInterval(_tick, 500);
}

export function stopMetrics() {
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

export function resetMetrics() {
  stopMetrics();
  _startTime = null;
  _fillerCount = 0;
  _totalWords = 0;
  _wordTimestamps = [];
  _coveredTopics = new Set();
  const container = _containerId ? document.getElementById(_containerId) : null;
  if (container) container.innerHTML = '';
}

/**
 * Feed a transcript chunk. Call for every `transcript_input` (Founder) event.
 * @param {string} text
 */
export function recordTranscript(text) {
  if (!text) return;
  const lower = text.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  const now = Date.now();

  // Word count + timestamps
  _totalWords += words.length;
  words.forEach(() => _wordTimestamps.push(now));

  // Filler words
  FILLER_WORDS.forEach(filler => {
    // count all occurrences
    const regex = new RegExp(`\\b${filler.replace(' ', '\\s+')}\\b`, 'g');
    const matches = lower.match(regex);
    if (matches) _fillerCount += matches.length;
  });

  // Topic coverage
  Object.entries(TOPICS).forEach(([topic, keywords]) => {
    if (!_coveredTopics.has(topic)) {
      if (keywords.some(kw => lower.includes(kw))) {
        _coveredTopics.add(topic);
      }
    }
  });

  _render();
}

// ── Internal ───────────────────────────────────────────────────────────────────

function _tick() {
  _render();
}

function _buildDOM() {
  const container = document.getElementById(_containerId);
  if (!container) return;
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="stat-box" id="metric-timer">
        <div style="font-size:0.78rem;color:#718096;text-transform:uppercase;letter-spacing:0.5px">Time</div>
        <strong id="metric-timer-val" style="font-size:1.3rem">0:00</strong>
      </div>
      <div class="stat-box" id="metric-wpm">
        <div style="font-size:0.78rem;color:#718096;text-transform:uppercase;letter-spacing:0.5px">WPM</div>
        <strong id="metric-wpm-val" style="font-size:1.3rem">—</strong>
      </div>
      <div class="stat-box" id="metric-filler">
        <div style="font-size:0.78rem;color:#718096;text-transform:uppercase;letter-spacing:0.5px">Filler Words</div>
        <strong id="metric-filler-val" style="font-size:1.3rem">0</strong>
      </div>
      <div class="stat-box" id="metric-topics">
        <div style="font-size:0.78rem;color:#718096;text-transform:uppercase;letter-spacing:0.5px">Topics</div>
        <strong id="metric-topics-val" style="font-size:1.3rem">0/6</strong>
      </div>
    </div>
    <div id="metric-topic-pills" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px"></div>`;
}

function _render() {
  if (!_containerId) return;

  // Timer
  const timerVal = document.getElementById('metric-timer-val');
  if (timerVal && _startTime) {
    const elapsed = Math.floor((Date.now() - _startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    timerVal.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  // Rolling WPM (last 30s)
  const wpmVal = document.getElementById('metric-wpm-val');
  if (wpmVal) {
    const cutoff = Date.now() - 30000;
    const recentWords = _wordTimestamps.filter(t => t >= cutoff).length;
    const wpm = _totalWords > 0 ? Math.round(recentWords * 2) : 0; // 30s → per-minute
    wpmVal.textContent = wpm > 0 ? String(wpm) : '—';
    wpmVal.style.color = wpm > 180 ? '#e53e3e' : wpm > 80 ? '#2d3748' : (wpm > 0 ? '#dd6b20' : '#718096');
  }

  // Filler words
  const fillerVal = document.getElementById('metric-filler-val');
  if (fillerVal) {
    fillerVal.textContent = String(_fillerCount);
    fillerVal.style.color = _fillerCount > 10 ? '#e53e3e' : _fillerCount > 4 ? '#dd6b20' : '#2d3748';
  }

  // Topics
  const topicsVal = document.getElementById('metric-topics-val');
  if (topicsVal) {
    const covered = _coveredTopics.size;
    topicsVal.textContent = `${covered}/6`;
    topicsVal.style.color = covered >= 5 ? '#38a169' : covered >= 3 ? '#dd6b20' : '#e53e3e';
  }

  // Topic pills
  const pillsEl = document.getElementById('metric-topic-pills');
  if (pillsEl) {
    pillsEl.innerHTML = Object.keys(TOPICS).map(topic => {
      const covered = _coveredTopics.has(topic);
      return `<span style="
        display:inline-block;padding:3px 9px;border-radius:12px;font-size:0.75rem;font-weight:600;
        background:${covered ? '#c6f6d5' : '#edf2f7'};
        color:${covered ? '#22543d' : '#a0aec0'};
        border:1px solid ${covered ? '#9ae6b4' : '#e2e8f0'}">${topic}</span>`;
    }).join('');
  }
}

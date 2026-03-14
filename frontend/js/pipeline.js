/**
 * pipeline.js — Post-interview/post-deck auto-pipeline UI
 *
 * Shows a progress tracker and polls session state to render results
 * as they arrive. No manual buttons needed.
 *
 * Exports:
 *   startPipelineWatch(sessionId)  — begin polling and render steps
 *   resetPipeline()                — hide all result panels + reset steps
 */

import {
  renderDeliveryScores,
  renderMarketIntel,
  renderDebateRounds,
  renderVerdict,
  renderSources,
} from './render.js';
import { showToast, showError } from './ui.js';

const API_BASE = window.location.origin;
const POLL_MS = 3000;
const MAX_POLLS = 60; // ~3 min timeout

let _timer = null;
let _polls = 0;
let _sessionId = null;
let _rendered = {
  delivery: false,
  market: false,
  deliberation: false,
  verdict: false,
};

// ── Step registry ─────────────────────────────────────────────────────────────
// Each step has an id matching a <div class="pipeline-step" data-step="...">

const STEPS = [
  { id: 'step-transcript',  label: 'Transcript captured' },
  { id: 'step-pitch',       label: 'Extracting pitch context' },
  { id: 'step-market',      label: 'Researching market' },
  { id: 'step-deliberation',label: 'VC deliberation' },
  { id: 'step-verdict',     label: 'Verdict ready' },
];

function setStep(id, status) {
  // status: 'pending' | 'running' | 'done' | 'error' | 'skipped'
  const el = document.querySelector(`[data-step="${id}"]`);
  if (!el) return;
  el.className = `pipeline-step ${status}`;
  const icon = el.querySelector('.step-icon');
  if (icon) {
    icon.textContent = {
      pending:  '○',
      running:  '◐',
      done:     '✓',
      error:    '✗',
      skipped:  '—',
    }[status] || '○';
  }
}

export function resetPipeline() {
  stopWatch();
  _rendered = { delivery: false, market: false, deliberation: false, verdict: false };
  _polls = 0;
  _sessionId = null;
  STEPS.forEach(s => setStep(s.id, 'pending'));
  // Hide all result cards
  [
    'delivery-scores-card', 'market-intel-card',
    'deliberation-card', 'verdict-card', 'sources-card',
  ].forEach(id => document.getElementById(id)?.classList.add('hidden'));

  document.getElementById('pipeline-panel')?.classList.add('hidden');
}

export function startPipelineWatch(sessionId) {
  stopWatch();
  _sessionId = sessionId;
  _polls = 0;
  document.getElementById('pipeline-panel')?.classList.remove('hidden');
  setStep('step-transcript', 'done');
  setStep('step-pitch', 'running');

  _timer = setInterval(() => _poll(sessionId), POLL_MS);
}

function stopWatch() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

async function _poll(sessionId) {
  _polls++;
  if (_polls > MAX_POLLS) {
    stopWatch();
    // Mark any still-running steps as timed out
    STEPS.forEach(({ id }) => {
      const el = document.querySelector(`[data-step="${id}"]`);
      if (el?.classList.contains('running')) setStep(id, 'error');
    });
    showToast('Analysis is taking longer than expected. Results may still arrive — refresh to check.', 'warn');
    return;
  }

  let state;
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}`);
    if (!res.ok) {
      // 404 means session disappeared (e.g. server restart) — stop polling
      if (res.status === 404) {
        stopWatch();
        showError('Session not found. The server may have restarted. Please start a new session.');
      }
      return;
    }
    state = await res.json();
  } catch {
    // Transient network error — keep polling; toast after repeated failures
    return;
  }

  // ── Pitch context ────────────────────────────────────────────────────────
  const hasPitch = state.pitch_context && Object.values(state.pitch_context).some(Boolean);
  if (hasPitch) {
    setStep('step-pitch', 'done');
  }

  // ── Delivery scores ──────────────────────────────────────────────────────
  if (state.delivery_scores && !_rendered.delivery) {
    _rendered.delivery = true;
    renderDeliveryScores(state.delivery_scores);
  }

  // ── Market intel ─────────────────────────────────────────────────────────
  const mStatus = state.market_intel_status?.status || 'idle';
  if (!_rendered.market) {
    if (mStatus === 'running') setStep('step-market', 'running');
    if (state.market_intel) {
      _rendered.market = true;
      setStep('step-market', 'done');
      renderMarketIntel(state.market_intel);
    } else if (mStatus === 'failed') {
      setStep('step-market', 'error');
      _rendered.market = true; // don't retry
      showToast('Market research encountered an error — other results will still appear.', 'warn');
    }
  }

  // ── Deliberation rounds ──────────────────────────────────────────────────
  const dStatus = state.deliberation_status?.status || 'idle';
  if (dStatus === 'running' || dStatus === 'completed') {
    setStep('step-deliberation', dStatus === 'completed' ? 'done' : 'running');
  }
  if (state.debate_rounds?.length && !_rendered.deliberation) {
    renderDebateRounds(state.debate_rounds);
  }

  // ── Final verdict ────────────────────────────────────────────────────────
  if (state.final_verdict && !_rendered.verdict) {
    _rendered.verdict = true;
    setStep('step-deliberation', 'done');
    setStep('step-verdict', 'done');
    renderDebateRounds(state.debate_rounds || []);
    renderVerdict(state.final_verdict);
    renderSources(state.final_verdict.all_sources || []);
    stopWatch();
  } else if (dStatus === 'failed' && !_rendered.verdict) {
    setStep('step-deliberation', 'error');
    setStep('step-verdict', 'error');
    showError('VC deliberation failed. Check the server logs for details.');
    stopWatch();
  }
}

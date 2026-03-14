/**
 * interview.js — Live WebSocket interview controller
 *
 * Exports:
 *   startInterview(sessionId, callbacks)
 *     callbacks: { onTranscript(speaker, text), onStatus(msg), onEnded(),
 *                  onCoachingTip(tip) }
 *   stopInterview()
 *   isActive()
 *   sendSlideChange(index, title, total)   — call when founder advances a slide
 */

import { startCapture, stopCapture, initPlayback, playChunk, resetPlayback } from './audio.js';

const API_BASE = window.location.origin;

let _socket = null;
let _onEnded = null;
let _sessionId = null;
let _coachTimer = null;

export function isActive() {
  return _socket !== null && _socket.readyState === WebSocket.OPEN;
}

export async function startInterview(sessionId, { onTranscript, onStatus, onEnded, onCoachingTip }) {
  _onEnded = onEnded;
  _sessionId = sessionId;

  // Init audio playback context first (needs user gesture)
  initPlayback();

  // Start mic capture; PCM chunks go straight to socket
  await startCapture((chunk) => {
    if (_socket && _socket.readyState === WebSocket.OPEN) {
      _socket.send(chunk);
    }
  });

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProto}//${window.location.host}/ws/live/${sessionId}`;
  _socket = new WebSocket(wsUrl);
  _socket.binaryType = 'arraybuffer';

  _socket.onopen = () => {
    onStatus('connected');
    // Start periodic coaching tip requests (every 25 seconds)
    if (onCoachingTip) {
      _coachTimer = setInterval(() => _fetchCoachingTip(sessionId, onCoachingTip), 25000);
    }
  };

  _socket.onmessage = async (event) => {
    if (typeof event.data === 'string') {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      _handleTextEvent(msg, onTranscript, onStatus);
    } else {
      await playChunk(event.data);
    }
  };

  _socket.onerror = (err) => {
    console.error('WS error', err);
    onStatus('error');
    _teardown();
  };

  _socket.onclose = () => {
    onStatus('closed');
    _teardown();
    if (_onEnded) _onEnded();
  };
}

export function stopInterview() {
  if (_socket && _socket.readyState === WebSocket.OPEN) {
    _socket.send(JSON.stringify({ type: 'end_stream' }));
  }
  _teardown();
}

/**
 * Send a slide change notification to the backend (injected into Gemini Live).
 * Call this whenever the founder navigates to a new slide.
 */
export function sendSlideChange(index, title, total) {
  if (_socket && _socket.readyState === WebSocket.OPEN) {
    _socket.send(JSON.stringify({
      type: 'slide_change',
      index,
      title,
      total,
    }));
  }
}

async function _fetchCoachingTip(sessionId, onCoachingTip) {
  try {
    const res = await fetch(`${API_BASE}/api/session/${sessionId}/coach`, { method: 'POST' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.tip) onCoachingTip(data.tip);
  } catch (e) {
    // Coaching tips are best-effort — don't surface errors
  }
}

function _teardown() {
  stopCapture();
  resetPlayback();
  if (_coachTimer) { clearInterval(_coachTimer); _coachTimer = null; }
  if (_socket) {
    _socket.onclose = null; // prevent double-fire of onEnded
    if (_socket.readyState === WebSocket.OPEN || _socket.readyState === WebSocket.CONNECTING) {
      _socket.close();
    }
    _socket = null;
  }
  _sessionId = null;
}

function _handleTextEvent(msg, onTranscript, onStatus) {
  switch (msg.type) {
    case 'transcript_input':
      onTranscript('Founder', msg.text);
      break;
    case 'transcript_output':
      onTranscript('Sam', msg.text);
      break;
    case 'turn_complete':
      onStatus('turn_complete');
      break;
    case 'interrupted':
      onStatus('interrupted');
      break;
    case 'error':
      console.error('Interview server error:', msg.message);
      onStatus('error');
      _teardown();
      break;
    default:
      break;
  }
}


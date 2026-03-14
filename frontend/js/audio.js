/**
 * audio.js — PCM audio capture (16kHz) and playback (24kHz)
 *
 * Exports:
 *   startCapture()   — requests mic, creates AudioWorklet, returns the worklet node
 *   stopCapture()    — tears down capture pipeline
 *   initPlayback()   — creates persistent 24kHz playback context
 *   playChunk(buf)   — schedules an ArrayBuffer (PCM 16-bit) for gapless playback
 *   resetPlayback()  — closes playback context (call after interview ends)
 */

// Inline worklet code — avoids needing a separate file served from the right origin
const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      const pcm16 = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const s = Math.max(-1, Math.min(1, ch[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

let _captureCtx = null;
let _workletNode = null;
let _mediaStream = null;

let _playCtx = null;
let _nextPlayTime = 0;

export async function startCapture(onChunk) {
  _mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  _captureCtx = new AudioContext({ sampleRate: 16000 });

  const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  await _captureCtx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = _captureCtx.createMediaStreamSource(_mediaStream);
  _workletNode = new AudioWorkletNode(_captureCtx, 'pcm-processor');
  source.connect(_workletNode);

  _workletNode.port.onmessage = (e) => onChunk(e.data);
  return _workletNode;
}

export function stopCapture() {
  if (_workletNode) { _workletNode.disconnect(); _workletNode = null; }
  if (_captureCtx) { _captureCtx.close(); _captureCtx = null; }
  if (_mediaStream) { _mediaStream.getTracks().forEach(t => t.stop()); _mediaStream = null; }
}

export function initPlayback() {
  if (_playCtx) return; // already open
  _playCtx = new AudioContext({ sampleRate: 24000 });
  _nextPlayTime = 0;
}

export async function playChunk(arrayBuffer) {
  if (!_playCtx) return;
  const pcm16 = new Int16Array(arrayBuffer);
  const f32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    f32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
  }
  const buf = _playCtx.createBuffer(1, f32.length, 24000);
  buf.getChannelData(0).set(f32);
  const src = _playCtx.createBufferSource();
  src.buffer = buf;
  src.connect(_playCtx.destination);
  const startAt = Math.max(_playCtx.currentTime, _nextPlayTime);
  src.start(startAt);
  _nextPlayTime = startAt + buf.duration;
}

export function resetPlayback() {
  if (_playCtx) { _playCtx.close(); _playCtx = null; }
  _nextPlayTime = 0;
}

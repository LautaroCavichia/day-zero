// ─── useAudioPipeline ─────────────────────────────────────────────────────────
// Full duplex audio pipeline:
//   MIC → getUserMedia → AudioWorklet (float32→PCM16) → WebSocket (binary)
//   WS  → binary PCM24 chunks → AudioContext playback
//
// The pipeline is designed to connect to /ws/live/:sessionId but the caller
// provides the WebSocket instance so it can share it with useLiveInterview.

import { useCallback, useRef, useState } from "react";

export type PipelineStatus = "idle" | "requesting-mic" | "active" | "error";

export interface UseAudioPipelineReturn {
  status: PipelineStatus;
  micLevel: number; // 0.0–1.0, from microphone input
  startMic: (ws: WebSocket, audioCtx: AudioContext) => Promise<void>;
  stopMic: () => void;
  /** Call with PCM24 binary data received from the WebSocket to play AI audio */
  playAudioChunk: (chunk: ArrayBuffer) => void;
  /** Returns the AudioNode that plays AI audio, for connecting to an AnalyserNode */
  getPlaybackNode: () => AudioNode | null;
  error: string | null;
}

// PCM helpers
const INPUT_SAMPLE_RATE = 16000;  // What Gemini Live expects
const OUTPUT_SAMPLE_RATE = 24000; // What Gemini Live sends back

// AudioWorklet inline code for float32 → PCM16 conversion
const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const float32 = input[0];
    const pcm16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

export function useAudioPipeline(): UseAudioPipelineReturn {
  const [status, setStatus] = useState<PipelineStatus>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micDataRef = useRef<Uint8Array | null>(null);
  const micRafRef = useRef<number | null>(null);
  const playbackNodeRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletUrlRef = useRef<string | null>(null);

  const stopMicLevelLoop = useCallback(() => {
    if (micRafRef.current !== null) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const startMicLevelLoop = useCallback((analyser: AnalyserNode, data: Uint8Array) => {
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length / 255;
      setMicLevel(Math.min(1, avg * 3));
      micRafRef.current = requestAnimationFrame(tick);
    };
    micRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopMic = useCallback(() => {
    stopMicLevelLoop();

    if (workletRef.current) {
      workletRef.current.disconnect();
      workletRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (workletUrlRef.current) {
      URL.revokeObjectURL(workletUrlRef.current);
      workletUrlRef.current = null;
    }

    setStatus("idle");
  }, [stopMicLevelLoop]);

  const startMic = useCallback(
    async (ws: WebSocket, audioCtx: AudioContext) => {
      setError(null);
      setStatus("requesting-mic");
      audioCtxRef.current = audioCtx;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: INPUT_SAMPLE_RATE,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        streamRef.current = stream;

        // Mic level analyser
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.6;
        const data = new Uint8Array(analyser.frequencyBinCount);
        micAnalyserRef.current = analyser;
        micDataRef.current = data;

        // Source → analyser (for level meter, no output to speakers)
        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;
        source.connect(analyser);

        // Load AudioWorklet for float32 → PCM16 conversion
        const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
        const url = URL.createObjectURL(blob);
        workletUrlRef.current = url;
        await audioCtx.audioWorklet.addModule(url);

        const worklet = new AudioWorkletNode(audioCtx, "pcm-processor");
        workletRef.current = worklet;

        // Worklet receives float32 chunks, converts to PCM16, sends to WebSocket
        worklet.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(e.data);
          }
        };

        source.connect(worklet);
        // Do NOT connect worklet to destination — we don't want mic feedback

        startMicLevelLoop(analyser, data);
        setStatus("active");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Microphone access failed";
        setError(msg);
        setStatus("error");
        stopMic();
        throw err;
      }
    },
    [startMicLevelLoop, stopMic]
  );

  const playAudioChunk = useCallback((chunk: ArrayBuffer) => {
    const audioCtx = audioCtxRef.current;
    if (!audioCtx) return;

    // Ensure we have a shared gain node for the playback chain
    if (!playbackNodeRef.current) {
      const gain = audioCtx.createGain();
      gain.gain.value = 1.0;
      gain.connect(audioCtx.destination);
      playbackNodeRef.current = gain;
    }

    // PCM24 is 16-bit signed int at 24kHz
    const pcm16 = new Int16Array(chunk);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / 32768.0;
    }

    const buffer = audioCtx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(playbackNodeRef.current);
    source.start();
  }, []);

  const getPlaybackNode = useCallback((): AudioNode | null => {
    return playbackNodeRef.current;
  }, []);

  return {
    status,
    micLevel,
    startMic,
    stopMic,
    playAudioChunk,
    getPlaybackNode,
    error,
  };
}

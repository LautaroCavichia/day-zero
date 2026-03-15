// ─── useLiveInterview ─────────────────────────────────────────────────────────
// Manages the WebSocket connection to /ws/live/:sessionId.
// Handles the full interview lifecycle: connect → stream audio → transcript → end.

import { useCallback, useEffect, useRef, useState } from "react";
import { getLiveInterviewWsUrl } from "@/services/api";
import type { TranscriptTurn, WsServerEvent } from "@/types/session";

export type InterviewStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "sam-speaking"
  | "listening"
  | "ended"
  | "error";

export interface UseInterviewReturn {
  status: InterviewStatus;
  transcript: TranscriptTurn[];
  isConnected: boolean;
  isSamSpeaking: boolean;
  elapsedSeconds: number;
  error: string | null;
  /** Returns the live WebSocket for use by useAudioPipeline */
  ws: WebSocket | null;
  /** Returns an AudioContext — create once and share */
  audioCtx: AudioContext | null;
  connect: (sessionId: string) => void;
  sendSlideChange: (index: number, title: string, total: number) => void;
  endInterview: () => void;
  /** Call with each binary PCM chunk received from the WS */
  onAudioChunk: (handler: (data: ArrayBuffer) => void) => void;
  /** Register a one-time callback that fires after Sam's first turn_complete.
   *  Used to auto-activate the mic after Sam's opening greeting. */
  onFirstTurnComplete: (handler: () => void) => void;
  /** Register a callback that fires every time Sam is interrupted (e.g. to clear playback). */
  onInterrupted: (handler: () => void) => void;
}

export function useLiveInterview(): UseInterviewReturn {
  const [status, setStatus] = useState<InterviewStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [isSamSpeaking, setIsSamSpeaking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioChunkHandlerRef = useRef<((data: ArrayBuffer) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);
  const sessionIdRef = useRef<string | null>(null);
  // One-time callback for auto-mic after Sam's first greeting
  const firstTurnCallbackRef = useRef<(() => void) | null>(null);
  const firstTurnFiredRef = useRef(false);
  // Callback fired on every interruption (e.g. clear playback queue)
  const interruptedHandlerRef = useRef<(() => void) | null>(null);

  // ─── Founder transcript accumulation buffer ──────────────────────────────
  // Gemini sends input_transcription in many small incremental chunks.
  // We accumulate them and update a single "in-progress" bubble in real-time,
  // then finalize it on turn_complete/interrupted instead of creating a new
  // bubble for every chunk.
  const founderBufRef = useRef<string[]>([]);
  const founderBufStartedRef = useRef(false);

  const flushFounderBuf = useCallback((finalTimestamp?: number) => {
    if (!founderBufStartedRef.current) return;
    const text = founderBufRef.current.join(" ").trim();
    founderBufRef.current = [];
    founderBufStartedRef.current = false;
    if (!text) return;
    // Replace the last in-progress Founder bubble with the finalized text
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === "Founder") {
        return [...prev.slice(0, -1), { ...last, text }];
      }
      return [
        ...prev,
        { speaker: "Founder", text, timestamp: finalTimestamp ?? Date.now() / 1000 },
      ];
    });
  }, []);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    const start = Date.now();
    timerRef.current = setInterval(() => {
      if (!isMounted.current) return;
      setElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  }, []);

  const handleJsonEvent = useCallback((event: WsServerEvent) => {
    if (!isMounted.current) return;

    switch (event.type) {
      case "transcript_input": {
        // Accumulate incremental chunks into a single Founder bubble.
        // On first chunk: create the placeholder bubble. On subsequent chunks:
        // update the last bubble in-place (streaming effect in the UI).
        founderBufRef.current.push(event.text);
        const accumulated = founderBufRef.current.join(" ").trim();

        if (!founderBufStartedRef.current) {
          // First chunk — create the bubble
          founderBufStartedRef.current = true;
          setTranscript((prev) => [
            ...prev,
            { speaker: "Founder", text: accumulated, timestamp: event.timestamp },
          ]);
        } else {
          // Subsequent chunks — update the last bubble in place
          setTranscript((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.speaker === "Founder") {
              return [...prev.slice(0, -1), { ...last, text: accumulated }];
            }
            return prev;
          });
        }
        setIsSamSpeaking(false);
        if (isMounted.current) setStatus("listening");
        break;
      }

      case "transcript_output":
        // Finalize any in-progress Founder bubble before showing Sam's response
        flushFounderBuf(event.timestamp);
        setTranscript((prev) => {
          // Merge consecutive Sam turns (streaming text can come in chunks)
          const last = prev[prev.length - 1];
          if (last && last.speaker === "Sam" && Date.now() / 1000 - last.timestamp < 3) {
            return [
              ...prev.slice(0, -1),
              { ...last, text: last.text + " " + event.text },
            ];
          }
          return [
            ...prev,
            { speaker: "Sam", text: event.text, timestamp: event.timestamp },
          ];
        });
        setIsSamSpeaking(true);
        if (isMounted.current) setStatus("sam-speaking");
        break;

      case "turn_complete":
        // Finalize the Founder's accumulated input
        flushFounderBuf();
        founderBufRef.current = [];
        founderBufStartedRef.current = false;
        setIsSamSpeaking(false);
        if (isMounted.current) setStatus("listening");
        // Auto-mic: fire one-time callback after Sam's first greeting ends
        if (!firstTurnFiredRef.current && firstTurnCallbackRef.current) {
          firstTurnFiredRef.current = true;
          firstTurnCallbackRef.current();
        }
        break;

      case "interrupted":
        // Sam was interrupted — finalize whatever Founder said so far
        flushFounderBuf();
        founderBufRef.current = [];
        founderBufStartedRef.current = false;
        setIsSamSpeaking(false);
        if (isMounted.current) setStatus("listening");
        // Notify listeners (e.g. clear playback queue)
        interruptedHandlerRef.current?.();
        break;

      case "interview_complete":
        // Sam signalled INTERVIEW_COMPLETE — auto-end the interview gracefully
        if (isMounted.current) setStatus("ended");
        break;

      case "error":
        setError(event.message);
        if (isMounted.current) setStatus("error");
        break;
    }
  }, [flushFounderBuf]);

  const connect = useCallback(
    (sessionId: string) => {
      if (wsRef.current) return; // already connected

      sessionIdRef.current = sessionId;
      setStatus("connecting");
      setError(null);
      setTranscript([]);
      setElapsedSeconds(0);
      founderBufRef.current = [];
      founderBufStartedRef.current = false;
      firstTurnFiredRef.current = false;

      // Create shared AudioContext (must be created in response to user gesture)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext({ sampleRate: 24000 });
      }

      const ws = new WebSocket(getLiveInterviewWsUrl(sessionId));
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted.current) return;
        setStatus("connected");
        startTimer();
      };

      ws.onmessage = (event) => {
        if (!isMounted.current) return;

        if (event.data instanceof ArrayBuffer) {
          // Binary — PCM24 audio chunk from AI
          const handler = audioChunkHandlerRef.current;
          if (handler) handler(event.data);
          return;
        }

        // Text — JSON event
        try {
          const parsed = JSON.parse(event.data) as WsServerEvent;
          handleJsonEvent(parsed);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        if (!isMounted.current) return;
        setError("Connection error");
        setStatus("error");
      };

      ws.onclose = () => {
        if (!isMounted.current) return;
        wsRef.current = null;
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setIsSamSpeaking(false);
        if (isMounted.current && status !== "error") {
          setStatus("ended");
        }
      };
    },
    [handleJsonEvent, startTimer, status]
  );

  const sendSlideChange = useCallback(
    (index: number, title: string, total: number) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(
        JSON.stringify({ type: "slide_change", index, title, total })
      );
    },
    []
  );

  const endInterview = useCallback(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end_stream" }));
    }
    cleanup();
    if (isMounted.current) {
      setStatus("ended");
      setIsSamSpeaking(false);
    }
  }, [cleanup]);

  const onAudioChunk = useCallback((handler: (data: ArrayBuffer) => void) => {
    audioChunkHandlerRef.current = handler;
  }, []);

  const onFirstTurnComplete = useCallback((handler: () => void) => {
    firstTurnCallbackRef.current = handler;
  }, []);

  const onInterrupted = useCallback((handler: () => void) => {
    interruptedHandlerRef.current = handler;
  }, []);

  return {
    status,
    transcript,
    isConnected: status === "connected" || status === "sam-speaking" || status === "listening",
    isSamSpeaking,
    elapsedSeconds,
    error,
    ws: wsRef.current,
    audioCtx: audioCtxRef.current,
    connect,
    sendSlideChange,
    endInterview,
    onAudioChunk,
    onFirstTurnComplete,
    onInterrupted,
  };
}

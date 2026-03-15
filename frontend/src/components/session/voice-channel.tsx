// ─── VoiceChannel ─────────────────────────────────────────────────────────────
// The AI voice interaction panel.
// Contains the reactive Orb, connection status, mic toggle, and end call button.

import { Mic, MicOff, PhoneOff, Wifi, WifiOff, Loader } from "lucide-react";
import Orb from "@/components/Orb";
import type { InterviewStatus } from "@/hooks/useLiveInterview";
import type { PipelineStatus } from "@/hooks/useAudioPipeline";

interface VoiceChannelProps {
  interviewStatus: InterviewStatus;
  pipelineStatus: PipelineStatus;
  isSamSpeaking: boolean;
  audioLevel: number;       // 0–1, drives Orb reactivity
  micLevel: number;         // 0–1, for mic level meter
  elapsedSeconds: number;
  onToggleMic: () => void;
  onEndCall: () => void;
  isMicActive: boolean;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const STATUS_LABELS: Record<InterviewStatus, string> = {
  idle: "Ready to connect",
  connecting: "Connecting to Sam...",
  connected: "Connected",
  "sam-speaking": "Sam is speaking",
  listening: "Sam is listening",
  ended: "Interview ended",
  error: "Connection error",
};

export default function VoiceChannel({
  interviewStatus,
  pipelineStatus,
  isSamSpeaking,
  audioLevel,
  micLevel,
  elapsedSeconds,
  onToggleMic,
  onEndCall,
  isMicActive,
}: VoiceChannelProps) {
  const isActive =
    interviewStatus === "connected" ||
    interviewStatus === "sam-speaking" ||
    interviewStatus === "listening";

  const isConnecting = interviewStatus === "connecting";
  const isEnded = interviewStatus === "ended" || interviewStatus === "error";

  return (
    <div className="flex flex-col items-center gap-5">
      {/* Orb container */}
      <div className="relative w-48 h-48">
        {/* Subtle glow ring when Sam is speaking */}
        {isSamSpeaking && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              boxShadow: `0 0 ${40 + audioLevel * 60}px rgba(200,255,0,${0.06 + audioLevel * 0.12})`,
              transition: "box-shadow 100ms ease",
            }}
          />
        )}

        <Orb
          hue={111}
          hoverIntensity={0.35}
          rotateOnHover={true}
          backgroundColor="#050505"
          audioLevel={isActive ? audioLevel : undefined}
          forceHoverState={isConnecting}
        />
      </div>

      {/* Status text + timer */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          {isConnecting && (
            <Loader className="size-3 text-[#C8FF00] animate-spin" strokeWidth={2} />
          )}
          {isActive && !isConnecting && (
            <div className="w-1.5 h-1.5 rounded-full bg-[#C8FF00] animate-pulse" />
          )}
          {isEnded && (
            <WifiOff className="size-3 text-[#5a5a5a]" strokeWidth={2} />
          )}
          <span
            className={`text-sm font-medium transition-colors ${
              isActive ? "text-[#f0f0f0]" : "text-[#5a5a5a]"
            }`}
          >
            {STATUS_LABELS[interviewStatus]}
          </span>
        </div>

        {isActive && elapsedSeconds > 0 && (
          <span className="text-xs font-mono text-[#5a5a5a]">
            {formatElapsed(elapsedSeconds)}
          </span>
        )}
      </div>

      {/* Controls */}
      {isActive && (
        <div className="flex items-center gap-3">
          {/* Mic toggle */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={onToggleMic}
              disabled={pipelineStatus === "requesting-mic"}
              className={`
                relative flex items-center justify-center w-12 h-12 rounded-full
                border transition-all duration-200
                ${isMicActive
                  ? "bg-[#0A1F12] border-[#1A3D28] text-[#C8FF00] hover:bg-[#1A3D28]"
                  : "bg-[#161616] border-[#2a2a2a] text-[#5a5a5a] hover:bg-[#1e1e1e] hover:text-[#a0a0a0]"}
                disabled:opacity-40 disabled:cursor-not-allowed
              `}
            >
              {isMicActive ? (
                <Mic className="size-5" strokeWidth={1.5} />
              ) : (
                <MicOff className="size-5" strokeWidth={1.5} />
              )}

              {/* Mic level ring */}
              {isMicActive && micLevel > 0.05 && (
                <div
                  className="absolute inset-0 rounded-full border-2 border-[#C8FF00] pointer-events-none"
                  style={{
                    opacity: micLevel * 0.6,
                    transform: `scale(${1 + micLevel * 0.15})`,
                    transition: "opacity 60ms, transform 60ms",
                  }}
                />
              )}
            </button>
            <span className="text-[10px] font-mono text-[#5a5a5a]">
              {isMicActive ? "Mute" : "Unmute"}
            </span>
          </div>

          {/* End call */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={onEndCall}
              className="flex items-center justify-center w-12 h-12 rounded-full bg-[#1a0808] border border-[#3a1010] text-red-400 hover:bg-[#2a0a0a] hover:text-red-300 transition-all duration-200"
            >
              <PhoneOff className="size-5" strokeWidth={1.5} />
            </button>
            <span className="text-[10px] font-mono text-[#5a5a5a]">End</span>
          </div>
        </div>
      )}

      {/* Mic level bar (visual feedback) */}
      {isMicActive && isActive && (
        <div className="flex items-center gap-2 w-full max-w-[160px]">
          <Wifi className="size-3 text-[#5a5a5a] flex-shrink-0" strokeWidth={1.5} />
          <div className="flex-1 score-bar-track">
            <div
              className="score-bar-fill"
              style={{ width: `${micLevel * 100}%`, transition: "width 80ms" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ChatTranscript ───────────────────────────────────────────────────────────
// Real-time scrolling transcript between Sam and the Founder.
// New messages auto-scroll. Sam and Founder have distinct visual styles.

import { useEffect, useRef } from "react";
import type { TranscriptTurn } from "@/types/session";

interface ChatTranscriptProps {
  transcript: TranscriptTurn[];
  isSamSpeaking?: boolean;
  className?: string;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function ChatTranscript({
  transcript,
  isSamSpeaking = false,
  className = "",
}: ChatTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length]);

  if (transcript.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#282828] bg-[#131313] min-h-[160px] ${className}`}
        style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
      >
        <p className="text-xs text-[#5a5a5a] text-center">
          Transcript will appear here once the interview starts.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col overflow-y-auto rounded-2xl border border-[#282828] bg-[#131313] ${className}`}
      style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
    >
      <div className="flex flex-col gap-1 p-4">
        {transcript.map((turn, i) => {
          const isSam = turn.speaker === "Sam";

          return (
            <div
              key={i}
              className={`flex flex-col gap-0.5 ${isSam ? "" : "items-end"}`}
            >
              {/* Speaker label */}
              {(i === 0 || transcript[i - 1]?.speaker !== turn.speaker) && (
                <div
                  className={`flex items-center gap-2 mb-0.5 ${isSam ? "" : "flex-row-reverse"}`}
                >
                  <span
                    className={`text-xs font-mono font-medium tracking-wide ${
                      isSam ? "text-[#C8FF00]" : "text-[#a0a0a0]"
                    }`}
                  >
                    {isSam ? "Sam" : "You"}
                  </span>
                  <span className="text-[10px] text-[#3a3a3a] font-mono">
                    {formatTime(turn.timestamp)}
                  </span>
                </div>
              )}

              {/* Message bubble */}
              <div
                className={`
                  max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed
                  ${isSam
                    ? "bg-[#161616] text-[#e8e8e8] rounded-tl-sm border border-[#1e1e1e]"
                    : "bg-[#0A1F12] text-[#f0f0f0] rounded-tr-sm border border-[#1A3D28]"}
                `}
              >
                {turn.text}
              </div>
            </div>
          );
        })}

        {/* Sam typing indicator */}
        {isSamSpeaking && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-mono font-medium text-[#C8FF00] mb-0.5">Sam</span>
            <div className="inline-flex items-center gap-1.5 bg-[#161616] border border-[#1e1e1e] rounded-xl rounded-tl-sm px-3.5 py-2.5">
              <span className="w-1.5 h-1.5 bg-[#C8FF00] rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-[#C8FF00] rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-[#C8FF00] rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

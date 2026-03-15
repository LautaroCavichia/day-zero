// ─── TranscriptDrawer ─────────────────────────────────────────────────────────
// Slide-over panel from the right showing the full interview transcript.
//
// Animation approach: the panel is ALWAYS mounted; we toggle a CSS class
// to drive the transform transition. This avoids the rAF/mount-split race
// that caused choppy open/close in the previous implementation.
// The backdrop uses the same class-toggle pattern.

import { useEffect } from "react";
import { X, MessageSquare } from "lucide-react";
import ChatTranscript from "@/components/session/chat-transcript";
import type { TranscriptTurn } from "@/types/session";

interface TranscriptDrawerProps {
  open: boolean;
  onClose: () => void;
  transcript: TranscriptTurn[];
}

export default function TranscriptDrawer({ open, onClose, transcript }: TranscriptDrawerProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop — always in DOM, toggled via class */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`
          fixed inset-0 z-40
          bg-black/60 backdrop-blur-[2px]
          transition-opacity duration-300 ease-out
          ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
      />

      {/* Panel — always in DOM, toggled via transform */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Interview Transcript"
        aria-hidden={!open}
        className={`
          fixed right-0 top-0 bottom-0 z-50
          w-[min(480px,90vw)]
          bg-[#0e0e0e] border-l border-[#1e1e1e]
          flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
          ${open ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e1e] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#0A1F12] border border-[#1A3D28]/60">
              <MessageSquare className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#f0f0f0]">Full Transcript</p>
              {transcript.length > 0 && (
                <p className="text-[10px] text-[#5a5a5a] font-mono mt-0.5">
                  {transcript.length} turns
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-lg border border-[#2a2a2a] text-[#5a5a5a] hover:text-[#a0a0a0] hover:border-[#3a3a3a] transition-colors duration-150"
            aria-label="Close transcript"
          >
            <X className="size-3.5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Transcript scroll area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <ChatTranscript
            transcript={transcript}
            isSamSpeaking={false}
            className="min-h-full"
          />
        </div>
      </div>
    </>
  );
}

// ─── SlideViewer ──────────────────────────────────────────────────────────────
// Displays pitch deck slides (base64 PNG from the backend).
// Handles navigation and emits slide change events for WebSocket sync.

import { ChevronLeft, ChevronRight, Layers } from "lucide-react";

interface SlideViewerProps {
  slides: string[]; // base64 PNG strings
  currentIndex: number;
  onSlideChange: (index: number) => void;
  isLoading?: boolean;
}

export default function SlideViewer({
  slides,
  currentIndex,
  onSlideChange,
  isLoading = false,
}: SlideViewerProps) {
  const total = slides.length;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < total - 1;

  const goTo = (index: number) => {
    if (index < 0 || index >= total) return;
    onSlideChange(index);
  };

  // Empty / loading state
  if (isLoading || total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[280px] gap-3 rounded-xl border border-[#1e1e1e] bg-[#0c0c0c]">
        {isLoading ? (
          <>
            <div className="w-8 h-8 rounded-full border-2 border-[#1e1e1e] border-t-[#C8FF00] animate-spin" />
            <p className="text-xs text-[#5a5a5a]">Loading slides...</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-[#161616]">
              <Layers className="size-5 text-[#5a5a5a]" strokeWidth={1.5} />
            </div>
            <p className="text-xs text-[#5a5a5a] text-center px-4">
              No slides loaded yet.
              <br />
              Upload a deck to see it here during your interview.
            </p>
          </>
        )}
      </div>
    );
  }

  const currentSlide = slides[currentIndex];

  return (
    <div className="flex flex-col gap-3">
      {/* Slide image */}
      <div className="relative rounded-xl overflow-hidden border border-[#1e1e1e] bg-[#0c0c0c] aspect-[16/9]">
        <img
          key={currentIndex}
          src={`data:image/png;base64,${currentSlide}`}
          alt={`Slide ${currentIndex + 1} of ${total}`}
          className="w-full h-full object-contain transition-opacity duration-200"
          draggable={false}
        />

        {/* Slide number badge */}
        <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-md bg-[#050505]/80 backdrop-blur-sm border border-[#1e1e1e]">
          <span className="text-xs font-mono text-[#a0a0a0]">
            {currentIndex + 1} / {total}
          </span>
        </div>
      </div>

      {/* Navigation controls */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => goTo(currentIndex - 1)}
          disabled={!hasPrev}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#a0a0a0] border border-[#1e1e1e] hover:border-[#3a3a3a] hover:text-[#f0f0f0] hover:bg-[#161616] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          <ChevronLeft className="size-3.5" strokeWidth={2} />
          Prev
        </button>

        {/* Thumbnail strip — visible for small decks */}
        {total <= 12 && (
          <div className="flex items-center gap-1 overflow-x-auto max-w-[200px] py-1 px-1">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`
                  flex-shrink-0 w-6 h-1.5 rounded-full transition-all duration-150
                  ${i === currentIndex
                    ? "bg-[#C8FF00]"
                    : "bg-[#2a2a2a] hover:bg-[#3a3a3a]"}
                `}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        )}

        <button
          onClick={() => goTo(currentIndex + 1)}
          disabled={!hasNext}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#a0a0a0] border border-[#1e1e1e] hover:border-[#3a3a3a] hover:text-[#f0f0f0] hover:bg-[#161616] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          Next
          <ChevronRight className="size-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

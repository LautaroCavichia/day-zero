// ─── DeckAnalysis ─────────────────────────────────────────────────────────────
// Phase 2 orchestrator component.
// Reads deck_critique + slide_images from sessionState (already in memory).
// Layout:
//   1. Summary banner (overall_summary + score row)
//   2. Slide-by-slide grid (inline expand on click)
//   3. Top Issues + Missing Slides (two column)
//   4. Strengths

import { useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileStack,
  LayoutGrid,
  Minus,
  Plus,
  Sparkles,
  ArrowRight,
  Upload,
  RefreshCw,
} from "lucide-react";
import type { DeckCritique, SlideNote } from "@/types/session";
import { useInView } from "@/hooks/useInView";
import { ScoreBar } from "@/components/ui/score-bar";
import { CountUp } from "@/components/ui/count-up";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 7.5) return "text-[#C8FF00]";
  if (score >= 5) return "text-[#a0a0a0]";
  return "text-red-400";
}

// ─── Score Summary Row ────────────────────────────────────────────────────────

function ScoreSummaryRow({ critique }: { critique: DeckCritique }) {
  const [ref, inView] = useInView();

  const metrics = [
    {
      label: "Narrative Arc",
      value: critique.narrative_arc_score,
      max: 10,
      icon: <Sparkles className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />,
    },
    {
      label: "Visual Clarity",
      value: critique.visual_clarity_score,
      max: 10,
      icon: <LayoutGrid className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />,
    },
    {
      label: "Slide Count",
      value: critique.slide_count,
      max: critique.slide_count,
      icon: <FileStack className="size-3.5 text-[#C8FF00]" strokeWidth={1.5} />,
      isCount: true,
    },
  ];

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`grid grid-cols-3 gap-4 anim-hidden ${inView ? "anim-fade-up" : ""}`}
    >
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
              {m.label}
            </span>
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
              {m.icon}
            </div>
          </div>

          <div className="mb-2.5">
            <span className={`text-2xl font-mono font-semibold leading-none ${scoreColor(m.isCount ? 10 : m.value)}`}>
              {inView ? (
                m.isCount ? (
                  <CountUp value={m.value} decimals={0} delay={200 + i * 80} />
                ) : (
                  <CountUp value={m.value} decimals={1} delay={200 + i * 80} />
                )
              ) : (
                m.isCount ? "0" : "0.0"
              )}
            </span>
            {!m.isCount && (
              <span className="text-sm text-[#3a3a3a] font-mono ml-1">/10</span>
            )}
          </div>

          {!m.isCount && (
            <ScoreBar score={m.value} max={10} delay={400 + i * 80} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Overall Summary ──────────────────────────────────────────────────────────

function OverallSummary({ summary }: { summary: string }) {
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
    >
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] px-5 py-4 flex gap-3 items-start">
        <div className="flex-shrink-0 mt-0.5 flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
          <Sparkles className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
        </div>
        <p className="text-sm text-[#a0a0a0] leading-relaxed">{summary}</p>
      </div>
    </div>
  );
}

// ─── Slide Detail View (Master-Detail) ───────────────────────────────────────

function SlideDetailView({
  slides,
  images,
}: {
  slides: SlideNote[];
  images: string[];
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [ref, inView] = useInView();

  const selected = slides[selectedIndex];
  const selectedImage = images[selectedIndex];

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
      {/* Section header */}
      <div
        className={`flex items-center justify-between mb-3 anim-hidden ${inView ? "anim-fade-up" : ""}`}
      >
        <h3 className="text-sm font-medium text-[#a0a0a0] uppercase tracking-widest">
          Slide-by-Slide
        </h3>
        <span className="text-xs font-mono text-[#5a5a5a]">{slides.length} slides</span>
      </div>

      {/* Master-detail layout */}
      <div
        className={`flex gap-4 anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
      >
        {/* Left: slide list */}
        <div className="w-[260px] flex-shrink-0 flex flex-col gap-1 max-h-[540px] overflow-y-auto pr-1">
          {slides.map((slide, i) => {
            const isSelected = i === selectedIndex;
            return (
              <button
                key={slide.index}
                onClick={() => setSelectedIndex(i)}
                className={`
                  w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg
                  transition-all duration-150 flex-shrink-0
                  ${isSelected
                    ? "bg-[rgba(200,255,0,0.06)] border border-[#C8FF00]/20"
                    : "border border-transparent hover:bg-[#0f0f0f] hover:border-[#1e1e1e]"}
                `}
              >
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-16 h-9 rounded overflow-hidden border border-[#1e1e1e] bg-[#161616] flex items-center justify-center">
                  {images[i] ? (
                    <img
                      src={`data:image/png;base64,${images[i]}`}
                      alt={`Slide ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-[9px] font-mono text-[#3a3a3a]">{i + 1}</span>
                  )}
                </div>

                {/* Title + score */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[9px] font-mono text-[#5a5a5a] uppercase tracking-wider">
                      {i + 1}
                    </span>
                    <span className={`text-[10px] font-mono font-semibold ${scoreColor(slide.score)}`}>
                      {slide.score.toFixed(1)}
                    </span>
                  </div>
                  <p className="text-xs text-[#c0c0c0] leading-tight truncate">
                    {slide.title}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: selected slide detail */}
        {selected && (
          <div className="flex-1 min-w-0 rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden">
            {/* Slide image */}
            <div className="border-b border-[#1e1e1e] bg-[#080808]">
              {selectedImage ? (
                <img
                  src={`data:image/png;base64,${selectedImage}`}
                  alt={`Slide ${selectedIndex + 1}`}
                  className="w-full h-auto object-contain"
                />
              ) : (
                <div className="aspect-[16/9] flex items-center justify-center">
                  <span className="text-xs font-mono text-[#3a3a3a]">No image</span>
                </div>
              )}
            </div>

            {/* Slide info + critique */}
            <div className="p-5 flex flex-col gap-3">
              {/* Title row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase block mb-1">
                    Slide {selected.index}
                  </span>
                  <h4 className="text-sm font-semibold text-[#f0f0f0] leading-snug">
                    {selected.title}
                  </h4>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className={`text-xl font-mono font-semibold ${scoreColor(selected.score)}`}>
                    {selected.score.toFixed(1)}
                    <span className="text-sm text-[#3a3a3a] font-mono">/10</span>
                  </span>
                </div>
              </div>

              {/* Score bar */}
              <ScoreBar score={selected.score} max={10} delay={100} />

              {/* Critique */}
              <div className="flex gap-2 items-start pt-1">
                <div className="flex-shrink-0 mt-0.5 flex items-center justify-center w-5 h-5 rounded bg-[#0A1F12] border border-[#1A3D28]/60">
                  <Sparkles className="size-2.5 text-[#C8FF00]" strokeWidth={1.5} />
                </div>
                <p className="text-sm text-[#a0a0a0] leading-relaxed">{selected.critique}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Issues + Missing Panel ───────────────────────────────────────────────────

function IssuesPanel({
  topIssues,
  missingSlides,
}: {
  topIssues: string[];
  missingSlides: string[];
}) {
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`grid grid-cols-2 gap-4 anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
    >
      {/* Top Issues */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-red-950/40 border border-red-900/30">
            <AlertCircle className="size-3 text-red-400" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Top Issues
          </h3>
        </div>
        <ul className="flex flex-col gap-2.5">
          {topIssues.length === 0 ? (
            <li className="text-xs text-[#3a3a3a]">No critical issues found.</li>
          ) : (
            topIssues.map((issue, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <Minus
                  className="size-3 flex-shrink-0 mt-0.5 text-red-400/70"
                  strokeWidth={2}
                />
                <span className="text-sm text-[#a0a0a0] leading-snug">{issue}</span>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Missing Slides */}
      <div className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#1a1400]/60 border border-yellow-900/30">
            <FileStack className="size-3 text-yellow-500/70" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Missing Slides
          </h3>
        </div>
        <ul className="flex flex-col gap-2.5">
          {missingSlides.length === 0 ? (
            <li className="text-xs text-[#3a3a3a]">Deck appears complete.</li>
          ) : (
            missingSlides.map((slide, i) => (
              <li key={i} className="flex gap-2.5 items-start">
                <Plus
                  className="size-3 flex-shrink-0 mt-0.5 text-yellow-500/60"
                  strokeWidth={2}
                />
                <span className="text-sm text-[#a0a0a0] leading-snug">{slide}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

// ─── Strengths Panel ──────────────────────────────────────────────────────────

function StrengthsPanel({ strengths }: { strengths: string[] }) {
  const [ref, inView] = useInView();

  if (!strengths || strengths.length === 0) return null;

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-fade-up anim-delay-100" : ""}`}
    >
      <div className="rounded-xl border border-[#1A3D28]/60 bg-[#0A1F12]/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#0A1F12] border border-[#1A3D28]/60">
            <CheckCircle2 className="size-3 text-[#C8FF00]" strokeWidth={1.5} />
          </div>
          <h3 className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
            Strengths
          </h3>
        </div>
        <ul className="flex flex-col gap-2.5">
          {strengths.map((s, i) => (
            <li key={i} className="flex gap-2.5 items-start">
              <CheckCircle2
                className="size-3 flex-shrink-0 mt-0.5 text-[#C8FF00]/70"
                strokeWidth={2}
              />
              <span className="text-sm text-[#a0a0a0] leading-snug">{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Empty / Loading States ───────────────────────────────────────────────────

function DeckAnalysisLoading() {
  return (
    <div className="flex flex-col gap-6 pb-8 max-w-6xl mx-auto w-full animate-[fade-in_0.4s_ease_both]">
      {/* Skeleton header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-32 rounded-md bg-[#1e1e1e] animate-pulse" />
          <div className="h-3.5 w-48 rounded-md bg-[#161616] animate-pulse" />
        </div>
        <div className="h-6 w-16 rounded-full bg-[#1e1e1e] animate-pulse" />
      </div>

      {/* Skeleton score cards */}
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-5 flex flex-col gap-3"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="h-3 w-20 rounded-md bg-[#1e1e1e] animate-pulse" />
            <div className="h-8 w-12 rounded-md bg-[#161616] animate-pulse" />
            <div className="h-1.5 w-full rounded-full bg-[#1e1e1e] animate-pulse" />
          </div>
        ))}
      </div>

      {/* Skeleton slide master-detail */}
      <div>
        <div className="h-3.5 w-24 rounded-md bg-[#1e1e1e] animate-pulse mb-4" />
        <div className="flex gap-4">
          {/* Left list skeleton */}
          <div className="w-[260px] flex-shrink-0 flex flex-col gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-[#1e1e1e] bg-[#0c0c0c]">
                <div className="w-16 h-9 rounded bg-[#161616] animate-pulse flex-shrink-0" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="h-2.5 w-16 rounded bg-[#1e1e1e] animate-pulse" />
                  <div className="h-2.5 w-24 rounded bg-[#161616] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
          {/* Right detail skeleton */}
          <div className="flex-1 rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden">
            <div className="w-full animate-pulse bg-[#161616]" style={{ aspectRatio: "16/9" }} />
            <div className="p-5 flex flex-col gap-3">
              <div className="h-4 w-32 rounded bg-[#1e1e1e] animate-pulse" />
              <div className="h-3 w-full rounded bg-[#161616] animate-pulse" />
              <div className="h-3 w-5/6 rounded bg-[#161616] animate-pulse" />
            </div>
          </div>
        </div>
      </div>

      {/* Status message */}
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="w-3.5 h-3.5 rounded-full border-2 border-[#1e1e1e] border-t-[#C8FF00] animate-spin flex-shrink-0" />
        <p className="text-xs font-mono text-[#5a5a5a]">
          Analyzing your deck… usually takes 15–30 seconds
        </p>
      </div>
    </div>
  );
}

function DeckAnalysisEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4 text-center px-6">
      <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-[#161616] border border-[#1e1e1e]">
        <FileStack className="size-5 text-[#3a3a3a]" strokeWidth={1.5} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-[#f0f0f0] mb-1">No deck analysis yet</h2>
        <p className="text-sm text-[#5a5a5a] max-w-xs">
          Upload a pitch deck in the onboarding step to see a detailed slide-by-slide critique.
        </p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface DeckAnalysisProps {
  critique: DeckCritique | null;
  slideImages: string[];
  isLoading?: boolean;
  onContinue?: () => void;
  continueLabel?: string;
  continueDescription?: string;
  /** Called with a new file when the user wants to re-upload their deck */
  onReupload?: (file: File) => Promise<void>;
}

export default function DeckAnalysis({
  critique,
  slideImages,
  isLoading = false,
  onContinue,
  continueLabel,
  continueDescription,
  onReupload,
}: DeckAnalysisProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isReuploading, setIsReuploading] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onReupload) return;
    // Reset input so the same file can be re-selected if needed
    e.target.value = "";
    setIsReuploading(true);
    try {
      await onReupload(file);
    } finally {
      setIsReuploading(false);
    }
  };

  if (isLoading) return <DeckAnalysisLoading />;
  if (!critique) return <DeckAnalysisEmpty />;

  return (
      <div className="flex flex-col gap-6 pb-8 max-w-6xl mx-auto w-full">
      {/* Hidden file input for re-upload */}
      {onReupload && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.pptx"
          className="hidden"
          onChange={handleFileChange}
        />
      )}

      {/* Page header */}
      <div className="page-load-item" style={{ animationDelay: "0ms" }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-[#f0f0f0] font-heading">
              Deck Analysis
            </h1>
            <p className="text-sm text-[#5a5a5a] mt-0.5">
              AI critique of your pitch deck
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Update Deck button */}
            {onReupload && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isReuploading}
                className="
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                  border border-[#2a2a2a] text-xs text-[#a0a0a0]
                  hover:border-[#3a3a3a] hover:text-[#f0f0f0]
                  transition-colors duration-150
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                {isReuploading ? (
                  <>
                    <RefreshCw className="size-3 animate-spin" strokeWidth={1.5} />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="size-3" strokeWidth={1.5} />
                    Update Deck
                  </>
                )}
              </button>
            )}
            {/* Average score badge */}
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
                Avg. Slide Score
              </span>
              <span
                className={`text-xl font-mono font-semibold ${scoreColor(
                  critique.slides.length > 0
                    ? critique.slides.reduce((sum, s) => sum + s.score, 0) /
                        critique.slides.length
                    : 0
                )}`}
              >
                {critique.slides.length > 0
                  ? (
                      critique.slides.reduce((sum, s) => sum + s.score, 0) /
                      critique.slides.length
                    ).toFixed(1)
                  : "—"}
                <span className="text-sm text-[#3a3a3a] font-mono">/10</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Score summary row */}
      <ScoreSummaryRow critique={critique} />

      {/* Overall summary */}
      {critique.overall_summary && (
        <OverallSummary summary={critique.overall_summary} />
      )}

      {/* Slide detail view */}
      {critique.slides.length > 0 && (
        <SlideDetailView slides={critique.slides} images={slideImages} />
      )}

      {/* Issues + Missing */}
      <IssuesPanel
        topIssues={critique.top_issues ?? []}
        missingSlides={critique.missing_slides ?? []}
      />

      {/* Strengths */}
      <StrengthsPanel strengths={critique.strengths ?? []} />

      {/* What's next card */}
      {continueLabel && onContinue && (
        <div className="page-load-item pt-2" style={{ animationDelay: "200ms" }}>
          <div className="rounded-xl border border-[#1A3D28]/60 bg-[#0A1F12]/40 p-5 flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-mono tracking-widest text-[#C8FF00]/60 uppercase">
                What's next
              </span>
              <span className="text-sm font-semibold text-[#f0f0f0]">{continueLabel}</span>
              {continueDescription && (
                <span className="text-xs text-[#5a5a5a] leading-snug mt-0.5">
                  {continueDescription}
                </span>
              )}
            </div>
            <button
              onClick={onContinue}
              className="
                flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg
                bg-[#C8FF00] text-black text-sm font-semibold
                hover:bg-[#D4FF33] transition-colors duration-150
                active:scale-[0.98]
              "
            >
              Go
              <ArrowRight className="size-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

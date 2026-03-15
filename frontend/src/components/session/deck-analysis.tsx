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
  ChevronDown,
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

// ─── Individual Slide Card ────────────────────────────────────────────────────

function SlideCard({
  slide,
  image,
  index,
  animDelay,
}: {
  slide: SlideNote;
  image?: string;
  index: number;
  animDelay: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [ref, inView] = useInView();

  return (
    <div
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`anim-hidden ${inView ? "anim-scale-up" : ""}`}
      style={{ animationDelay: `${animDelay}ms` }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`
          w-full text-left rounded-xl border bg-[#0c0c0c]
          transition-all duration-200
          ${expanded
            ? "border-[#C8FF00]/20 bg-[rgba(200,255,0,0.02)]"
            : "border-[#1e1e1e] hover:border-[#2a2a2a] hover:bg-[#0f0f0f]"}
        `}
      >
        {/* Thumbnail row */}
        <div className="flex gap-3 p-4 items-start">
          {/* Thumbnail */}
          <div className="flex-shrink-0 w-20 h-[45px] rounded-md overflow-hidden border border-[#1e1e1e] bg-[#161616] flex items-center justify-center">
            {image ? (
              <img
                src={`data:image/png;base64,${image}`}
                alt={`Slide ${index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[10px] font-mono text-[#3a3a3a]">{index + 1}</span>
            )}
          </div>

          {/* Header info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase">
                Slide {slide.index}
              </span>
              <span className={`text-sm font-mono font-semibold ${scoreColor(slide.score)}`}>
                {slide.score.toFixed(1)}
              </span>
            </div>
            <p className="text-sm font-medium text-[#f0f0f0] leading-tight truncate">
              {slide.title}
            </p>
            {/* Mini score bar */}
            <div className="mt-2">
              <ScoreBar score={slide.score} max={10} delay={animDelay + 300} />
            </div>
          </div>

          {/* Expand icon */}
          <div className="flex-shrink-0 ml-1">
            <ChevronDown
              className={`size-4 text-[#5a5a5a] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              strokeWidth={1.5}
            />
          </div>
        </div>

        {/* Expanded: full-size slide + critique */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            expanded ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="px-4 pb-4 flex flex-col gap-3 border-t border-[#1e1e1e]">
            {/* Full-size slide image */}
            {image && (
              <div className="mt-3 rounded-lg overflow-hidden border border-[#1e1e1e] bg-[#161616]">
                <img
                  src={`data:image/png;base64,${image}`}
                  alt={`Slide ${index + 1} full`}
                  className="w-full h-auto object-contain"
                />
              </div>
            )}

            {/* Critique */}
            <div className="flex gap-2 items-start">
              <div className="flex-shrink-0 mt-0.5 flex items-center justify-center w-5 h-5 rounded bg-[#0A1F12] border border-[#1A3D28]/60">
                <Sparkles className="size-2.5 text-[#C8FF00]" strokeWidth={1.5} />
              </div>
              <p className="text-sm text-[#a0a0a0] leading-relaxed">{slide.critique}</p>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

// ─── Slide Grid ───────────────────────────────────────────────────────────────

function SlideGrid({
  slides,
  images,
}: {
  slides: SlideNote[];
  images: string[];
}) {
  const [ref, inView] = useInView();

  return (
    <div ref={ref as React.RefObject<HTMLDivElement>}>
      <div
        className={`flex items-center justify-between mb-3 anim-hidden ${inView ? "anim-fade-up" : ""}`}
      >
        <h3 className="text-sm font-medium text-[#a0a0a0] uppercase tracking-widest">
          Slide-by-Slide
        </h3>
        <span className="text-xs font-mono text-[#5a5a5a]">{slides.length} slides</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {slides.map((slide, i) => (
          <SlideCard
            key={slide.index}
            slide={slide}
            image={images[i]}
            index={i}
            animDelay={i * 50}
          />
        ))}
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
    <div className="flex flex-col gap-6 pb-8 animate-[fade-in_0.4s_ease_both]">
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

      {/* Skeleton slide grid */}
      <div>
        <div className="h-3.5 w-24 rounded-md bg-[#1e1e1e] animate-pulse mb-4" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-[#1e1e1e] bg-[#0c0c0c] p-4 flex flex-col gap-3"
            >
              <div
                className="w-full rounded-lg bg-[#161616] animate-pulse"
                style={{ aspectRatio: "16/9" }}
              />
              <div className="flex items-center justify-between">
                <div className="h-3.5 w-24 rounded-md bg-[#1e1e1e] animate-pulse" />
                <div className="h-3.5 w-8 rounded-md bg-[#1e1e1e] animate-pulse" />
              </div>
            </div>
          ))}
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
    <div className="flex flex-col gap-6 pb-8">
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

      {/* Slide grid */}
      {critique.slides.length > 0 && (
        <SlideGrid slides={critique.slides} images={slideImages} />
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

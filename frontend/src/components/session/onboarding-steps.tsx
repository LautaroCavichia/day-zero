// ─── OnboardingSteps ──────────────────────────────────────────────────────────
// 5-step guided flow before entering the live interview:
//   Step 1 — "Your Company"  — session name, one-liner, stage
//   Step 2 — "Tell us more"  — problem, solution (optional)
//   Step 3 — "Upload deck"   — DeckUploader + skip link
//   Step 4 — "Preview slides" — SlideViewer (only if deck uploaded)
//   Step 5 — "Ready to pitch" — summary + Start Interview CTA
//
// The parent is responsible for creating the session and providing upload
// handlers. OnboardingSteps is purely presentational + local nav.

import { useRef, useState } from "react";
import {
  ChevronRight,
  Play,
  ArrowLeft,
  CheckCircle2,
  Building2,
  FileText,
  Mic,
} from "lucide-react";
import DeckUploader from "@/components/session/deck-uploader";
import SlideViewer from "@/components/session/slide-viewer";
import type { OnboardingData } from "@/pages/session-start";

const STAGES = ["Idea", "MVP", "Seed", "Series A", "Growth"];

interface OnboardingStepsProps {
  sessionId: string;
  /** Called when step 1+2 are completed to persist company info */
  onSaveOnboardingData: (data: OnboardingData) => Promise<void>;
  /** Call to upload file; parent handles API call */
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  uploadProgress: number;
  uploadStageLabel?: string;
  uploadedFileName: string | null;
  slideCount: number; // number of slides — images served via /api/session/{id}/slides/{index}
  slidesLoading: boolean;
  onClearDeck: () => void;
  /** Final action — parent navigates to the workspace */
  onStartInterview: () => void;
}

const STEPS = [
  { n: 1, label: "Company" },
  { n: 2, label: "Details" },
  { n: 3, label: "Upload deck" },
  { n: 4, label: "Preview" },
  { n: 5, label: "Start" },
];

export default function OnboardingSteps({
  sessionId,
  onSaveOnboardingData,
  onUpload,
  isUploading,
  uploadProgress,
  uploadStageLabel,
  uploadedFileName,
  slideCount,
  slidesLoading,
  onClearDeck,
  onStartInterview,
}: OnboardingStepsProps) {
  const [step, setStep] = useState(1);
  const [slideIndex, setSlideIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 fields
  const [sessionName, setSessionName] = useState("");
  const [oneLiner, setOneLiner] = useState("");
  const [stage, setStage] = useState("");

  // Step 2 fields
  const [problem, setProblem] = useState("");
  const [solution, setSolution] = useState("");

  const sessionNameRef = useRef<HTMLInputElement>(null);

  const canAdvanceStep1 = sessionName.trim().length > 0;

  const handleStep1Next = async () => {
    if (!canAdvanceStep1) return;
    setSaving(true);
    try {
      await onSaveOnboardingData({ sessionName, oneLiner, stage, problem, solution });
    } finally {
      setSaving(false);
    }
    setStep(2);
  };

  const handleStep2Next = async () => {
    // Save updated problem/solution (non-blocking)
    onSaveOnboardingData({ sessionName, oneLiner, stage, problem, solution }).catch(() => {});
    setStep(3);
  };

  // ─── Step 1: Your Company ────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[10px] font-mono tracking-[0.12em] text-[#C8FF00]/40 uppercase mb-2">
          Step 1 of 5
        </p>
        <h3 className="text-xl font-semibold text-[#f0f0f0] font-heading mb-1">
          Your Company
        </h3>
        <p className="text-sm text-[#5a5a5a]">
          Give this session a name so you can find it later.
        </p>
      </div>

      {/* Session name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono text-[#5a5a5a] tracking-wide">
          Company / project name <span className="text-red-500">*</span>
        </label>
        <input
          ref={sessionNameRef}
          type="text"
          placeholder="e.g. CortaDoc"
          value={sessionName}
          onChange={(e) => setSessionName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && canAdvanceStep1) handleStep1Next(); }}
          autoFocus
          className="w-full h-11 px-4 rounded-xl border border-[#2a2a2a] bg-[#0c0c0c] text-sm text-[#f0f0f0] placeholder:text-[#3a3a3a] hover:border-[#3a3a3a] focus:border-[#C8FF00]/40 focus:outline-none transition-colors"
        />
      </div>

      {/* One-liner */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono text-[#5a5a5a] tracking-wide">
          One-liner <span className="text-[#3a3a3a]">(optional)</span>
        </label>
        <input
          type="text"
          placeholder="e.g. AI that reviews contracts in 30 seconds for $5"
          value={oneLiner}
          onChange={(e) => setOneLiner(e.target.value)}
          className="w-full h-11 px-4 rounded-xl border border-[#2a2a2a] bg-[#0c0c0c] text-sm text-[#f0f0f0] placeholder:text-[#3a3a3a] hover:border-[#3a3a3a] focus:border-[#C8FF00]/40 focus:outline-none transition-colors"
        />
      </div>

      {/* Stage */}
      <div className="flex flex-col gap-2">
        <label className="text-xs font-mono text-[#5a5a5a] tracking-wide">
          Stage <span className="text-[#3a3a3a]">(optional)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStage(stage === s ? "" : s)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono border transition-all duration-150 ${
                stage === s
                  ? "border-[#C8FF00]/40 bg-[#C8FF00]/10 text-[#C8FF00]"
                  : "border-[#2a2a2a] bg-transparent text-[#5a5a5a] hover:border-[#3a3a3a] hover:text-[#a0a0a0]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end pt-1">
        <button
          onClick={handleStep1Next}
          disabled={!canAdvanceStep1 || saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8FF00] text-[#050505] text-sm font-semibold hover:bg-[#d4ff26] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          {saving ? (
            <>
              <span className="w-3.5 h-3.5 rounded-full border-2 border-[#050505]/30 border-t-[#050505] animate-spin" />
              Saving…
            </>
          ) : (
            <>
              Continue
              <ChevronRight className="size-4" strokeWidth={2.5} />
            </>
          )}
        </button>
      </div>
    </div>
  );

  // ─── Step 2: Tell us more ────────────────────────────────────────────────────
  const renderStep2 = () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep(1)}
          className="inline-flex items-center gap-1.5 text-sm text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          Back
        </button>
        <div className="h-4 w-px bg-[#1e1e1e]" />
        <div>
          <p className="text-[10px] font-mono tracking-[0.12em] text-[#C8FF00]/40 uppercase mb-0.5">
            Step 2 of 5
          </p>
          <h3 className="text-xl font-semibold text-[#f0f0f0] font-heading leading-none">
            Tell us more
          </h3>
        </div>
      </div>

      <p className="text-sm text-[#5a5a5a] -mt-2">
        Help Sam understand the problem you're solving. Both fields are optional.
      </p>

      {/* Problem */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono text-[#5a5a5a] tracking-wide">
          Problem
        </label>
        <textarea
          rows={3}
          placeholder="What pain point are you solving? Who suffers from it?"
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-[#2a2a2a] bg-[#0c0c0c] text-sm text-[#f0f0f0] placeholder:text-[#3a3a3a] hover:border-[#3a3a3a] focus:border-[#C8FF00]/40 focus:outline-none transition-colors resize-none"
        />
      </div>

      {/* Solution */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-mono text-[#5a5a5a] tracking-wide">
          Solution
        </label>
        <textarea
          rows={3}
          placeholder="How do you solve it? What's your key insight?"
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-[#2a2a2a] bg-[#0c0c0c] text-sm text-[#f0f0f0] placeholder:text-[#3a3a3a] hover:border-[#3a3a3a] focus:border-[#C8FF00]/40 focus:outline-none transition-colors resize-none"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={handleStep2Next}
          className="text-sm text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
        >
          Skip
        </button>
        <button
          onClick={handleStep2Next}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8FF00] text-[#050505] text-sm font-semibold hover:bg-[#d4ff26] transition-all duration-150"
        >
          Continue
          <ChevronRight className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  // ─── Step 3: Upload deck ─────────────────────────────────────────────────────
  const renderStep3 = () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep(2)}
          className="inline-flex items-center gap-1.5 text-sm text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          Back
        </button>
        <div className="h-4 w-px bg-[#1e1e1e]" />
        <div>
          <p className="text-[10px] font-mono tracking-[0.12em] text-[#C8FF00]/40 uppercase mb-0.5">
            Step 3 of 5
          </p>
          <h3 className="text-xl font-semibold text-[#f0f0f0] font-heading leading-none">
            Upload deck
          </h3>
        </div>
      </div>

      <p className="text-sm text-[#5a5a5a] -mt-2">
        Drop your PDF or PPTX and Sam will review it before the call. Slides are optional.
      </p>

      <DeckUploader
        onUpload={onUpload}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        uploadStageLabel={uploadStageLabel}
        uploadedFileName={uploadedFileName}
        onClear={onClearDeck}
      />

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => setStep(5)}
          className="text-sm text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
        >
          Skip deck, pitch verbally
        </button>
        <button
          onClick={() => setStep(uploadedFileName ? 4 : 5)}
          disabled={isUploading}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8FF00] text-[#050505] text-sm font-semibold hover:bg-[#d4ff26] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          {uploadedFileName ? "Preview slides" : "Continue"}
          <ChevronRight className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  // ─── Step 4: Preview slides ──────────────────────────────────────────────────
  const renderStep4 = () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep(3)}
          className="inline-flex items-center gap-1.5 text-sm text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          Back
        </button>
        <div className="h-4 w-px bg-[#1e1e1e]" />
        <div>
          <p className="text-[10px] font-mono tracking-[0.12em] text-[#C8FF00]/40 uppercase mb-0.5">
            Step 4 of 5
          </p>
          <h3 className="text-xl font-semibold text-[#f0f0f0] font-heading leading-none">
            Preview slides
          </h3>
        </div>
      </div>

      <p className="text-sm text-[#5a5a5a] -mt-2">
        Make sure everything converted correctly before the interview.
      </p>

      <SlideViewer
        sessionId={sessionId}
        slideCount={slideCount}
        currentIndex={slideIndex}
        onSlideChange={setSlideIndex}
        isLoading={slidesLoading}
      />

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onClearDeck}
          className="text-sm text-[#5a5a5a] hover:text-red-400 transition-colors"
        >
          Replace deck
        </button>
        <button
          onClick={() => setStep(5)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8FF00] text-[#050505] text-sm font-semibold hover:bg-[#d4ff26] transition-all duration-150"
        >
          Looks good
          <ChevronRight className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  // ─── Step 5: Ready to pitch ──────────────────────────────────────────────────
  const renderStep5 = () => (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep(uploadedFileName ? 4 : 3)}
          className="inline-flex items-center gap-1.5 text-sm text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          Back
        </button>
      </div>

      <div className="flex flex-col items-center gap-6 py-4">
        {/* Summary card */}
        <div
          className="w-full rounded-2xl border border-[#282828] bg-[#0f0f0f] overflow-hidden"
          style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 4px 16px rgba(0,0,0,0.4)" }}
        >
          {/* Company row */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#1a1a1a]">
            <div className="w-8 h-8 rounded-lg bg-[#141414] border border-[#2a2a2a] flex items-center justify-center flex-shrink-0">
              <Building2 className="size-3.5 text-[#5a5a5a]" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono text-[#5a5a5a] mb-0.5">Company</p>
              <p className="text-sm font-semibold text-[#f0f0f0] truncate">
                {sessionName || "Untitled Pitch"}
              </p>
            </div>
            {stage && (
              <span className="flex-shrink-0 px-2 py-0.5 rounded border border-[#2a2a2a] text-[10px] font-mono text-[#5a5a5a] uppercase tracking-wider">
                {stage}
              </span>
            )}
          </div>

          {/* Checklist row */}
          <div className="flex items-center divide-x divide-[#1a1a1a]">
            <div className="flex items-center gap-2 flex-1 px-5 py-3.5">
              <CheckCircle2
                className={`size-3.5 flex-shrink-0 ${problem || solution ? "text-[#C8FF00]" : "text-[#3a3a3a]"}`}
                strokeWidth={1.5}
              />
              <span className={`text-xs font-mono ${problem || solution ? "text-[#a0a0a0]" : "text-[#3a3a3a]"}`}>
                Context added
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 px-5 py-3.5">
              <FileText
                className={`size-3.5 flex-shrink-0 ${uploadedFileName ? "text-[#C8FF00]" : "text-[#3a3a3a]"}`}
                strokeWidth={1.5}
              />
              <span className={`text-xs font-mono ${uploadedFileName ? "text-[#a0a0a0]" : "text-[#3a3a3a]"}`}>
                {uploadedFileName ? "Deck ready" : "No deck"}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-1 px-5 py-3.5">
              <Mic className="size-3.5 flex-shrink-0 text-[#C8FF00]" strokeWidth={1.5} />
              <span className="text-xs font-mono text-[#a0a0a0]">Mic needed</span>
            </div>
          </div>
        </div>

        <div className="text-center max-w-sm">
          <h3 className="text-xl font-semibold text-[#f0f0f0] mb-2">
            Ready for your investor meeting?
          </h3>
          <p className="text-sm text-[#5a5a5a] leading-relaxed">
            Sam will ask hard questions about your market, moat, and metrics.
            Speak naturally — the interview is recorded and scored in real time.
          </p>
        </div>

        <button
          onClick={onStartInterview}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-[#C8FF00] text-[#050505] text-base font-bold hover:bg-[#d4ff26] active:scale-[0.98] transition-all duration-150 shadow-[0_0_30px_rgba(200,255,0,0.15)]"
        >
          <Play className="size-5" strokeWidth={2.5} />
          Start Interview
        </button>

        <p className="text-xs text-[#3a3a3a] text-center">
          Your browser will ask for microphone access.
        </p>
      </div>
    </div>
  );

  // Compute which steps to actually show (skip step 4 if no deck)
  const visibleSteps = uploadedFileName
    ? STEPS
    : STEPS.filter((s) => s.n !== 4);

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {visibleSteps.map((s, i) => {
          // Map the display step number to actual step
          const displayN = i + 1;
          const done = step > s.n;
          const active = step === s.n;
          return (
            <div key={s.n} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`
                    flex items-center justify-center w-6 h-6 rounded-full text-xs font-mono font-medium
                    transition-all duration-200
                    ${done
                      ? "bg-[#1A3D28] text-[#C8FF00]"
                      : active
                      ? "bg-[#C8FF00] text-[#050505]"
                      : "bg-[#161616] text-[#3a3a3a]"}
                  `}
                >
                  {done ? <CheckCircle2 className="size-3.5" strokeWidth={2.5} /> : displayN}
                </div>
                <span
                  className={`text-sm transition-colors hidden sm:block ${
                    active ? "text-[#f0f0f0] font-medium" : done ? "text-[#5a5a5a]" : "text-[#3a3a3a]"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < visibleSteps.length - 1 && (
                <div className="w-6 sm:w-8 h-px bg-[#1e1e1e] mx-2 sm:mx-3" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div
        className="rounded-2xl border border-[#282828] bg-[#131313] p-6 overflow-hidden"
        style={{ boxShadow: "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 4px 24px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.3)" }}
      >
        <div
          key={step}
          className="animate-[phase-enter_0.35s_cubic-bezier(0.22,1,0.36,1)_both]"
        >
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
          {step === 5 && renderStep5()}
        </div>
      </div>
    </div>
  );
}

// ─── OnboardingSteps ──────────────────────────────────────────────────────────
// 3-step guided flow before entering the live interview:
//   Step 1 — Upload pitch deck (PDF / PPTX)
//   Step 2 — Preview slides, confirm they look right
//   Step 3 — Final "Start Interview" call to action
//
// The parent is responsible for creating the session and providing upload
// handlers. OnboardingSteps is purely presentational + local nav.

import { useState } from "react";
import { ChevronRight, Play, ArrowLeft, CheckCircle2 } from "lucide-react";
import DeckUploader from "@/components/session/deck-uploader";
import SlideViewer from "@/components/session/slide-viewer";

interface OnboardingStepsProps {
  sessionId: string;
  /** Call to upload file; parent handles API call */
  onUpload: (file: File) => Promise<void>;
  isUploading: boolean;
  uploadProgress: number;
  uploadedFileName: string | null;
  slides: string[]; // base64 PNGs, available after upload
  slidesLoading: boolean;
  onClearDeck: () => void;
  /** Final action — parent navigates to the workspace */
  onStartInterview: () => void;
}

const STEPS = [
  { n: 1, label: "Upload deck" },
  { n: 2, label: "Preview slides" },
  { n: 3, label: "Start interview" },
];

export default function OnboardingSteps({
  onUpload,
  isUploading,
  uploadProgress,
  uploadedFileName,
  slides,
  slidesLoading,
  onClearDeck,
  onStartInterview,
}: OnboardingStepsProps) {
  const [step, setStep] = useState(1);
  const [slideIndex, setSlideIndex] = useState(0);

  const canAdvanceStep1 = !!uploadedFileName && !isUploading;
  const canAdvanceStep2 = slides.length > 0 || !uploadedFileName; // allow skipping slides

  // ─── Step 1: Upload ──────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-base font-semibold text-[#f0f0f0] mb-1">
          Upload your pitch deck
        </h3>
        <p className="text-sm text-[#5a5a5a]">
          Drop your PDF or PPTX and Sam will review it before the call.
          Slides are optional — you can skip and pitch verbally.
        </p>
      </div>

      <DeckUploader
        onUpload={onUpload}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
        uploadedFileName={uploadedFileName}
        onClear={onClearDeck}
      />

      <div className="flex items-center justify-end gap-3 pt-1">
        {!uploadedFileName && (
          <button
            onClick={() => setStep(3)}
            className="text-sm text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
          >
            Skip deck, pitch verbally
          </button>
        )}
        <button
          onClick={() => setStep(2)}
          disabled={!canAdvanceStep1}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8FF00] text-[#050505] text-sm font-semibold hover:bg-[#d4ff26] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          Preview slides
          <ChevronRight className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  // ─── Step 2: Preview slides ──────────────────────────────────────────────────
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
          <h3 className="text-base font-semibold text-[#f0f0f0] leading-none">
            Preview your slides
          </h3>
          <p className="text-xs text-[#5a5a5a] mt-1">
            Make sure everything converted correctly before the interview.
          </p>
        </div>
      </div>

      <SlideViewer
        slides={slides}
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
          onClick={() => setStep(3)}
          disabled={!canAdvanceStep2}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8FF00] text-[#050505] text-sm font-semibold hover:bg-[#d4ff26] disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150"
        >
          Looks good
          <ChevronRight className="size-4" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );

  // ─── Step 3: Start ───────────────────────────────────────────────────────────
  const renderStep3 = () => (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setStep(uploadedFileName ? 2 : 1)}
          className="inline-flex items-center gap-1.5 text-sm text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
        >
          <ArrowLeft className="size-4" strokeWidth={1.5} />
          Back
        </button>
      </div>

      <div className="flex flex-col items-center gap-6 py-4">
        {/* Session summary pill */}
        <div className="flex items-center gap-6 px-6 py-3 rounded-2xl border border-[#1e1e1e] bg-[#0c0c0c]">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`size-4 ${uploadedFileName ? "text-[#C8FF00]" : "text-[#3a3a3a]"}`}
              strokeWidth={1.5}
            />
            <span className={`text-sm ${uploadedFileName ? "text-[#a0a0a0]" : "text-[#3a3a3a]"}`}>
              {uploadedFileName ? "Deck ready" : "No deck"}
            </span>
          </div>
          <div className="h-4 w-px bg-[#1e1e1e]" />
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-[#C8FF00]" strokeWidth={1.5} />
            <span className="text-sm text-[#a0a0a0]">Mic check needed</span>
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

  return (
    <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => {
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
                  {done ? <CheckCircle2 className="size-3.5" strokeWidth={2.5} /> : s.n}
                </div>
                <span
                  className={`text-sm transition-colors ${
                    active ? "text-[#f0f0f0] font-medium" : done ? "text-[#5a5a5a]" : "text-[#3a3a3a]"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className="w-8 h-px bg-[#1e1e1e] mx-3" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-2xl border border-[#1e1e1e] bg-[#0c0c0c] p-6">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </div>
    </div>
  );
}

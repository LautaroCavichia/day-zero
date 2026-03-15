// ─── SessionStart ─────────────────────────────────────────────────────────────
// Route: /app/new
// Creates a new session then guides the user through the 5-step onboarding:
//   1. Your Company  — session name, one-liner, stage
//   2. Tell us more  — problem, solution
//   3. Upload deck   — DeckUploader + skip link
//   4. Preview slides — SlideViewer (only if deck uploaded)
//   5. Ready to pitch — summary + Start Interview CTA
// On "Start Interview" navigates to /app/session/:id.

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import GrainOverlay from "@/components/shared/grain-overlay";
import Logo from "@/components/shared/logo";
import OnboardingSteps from "@/components/session/onboarding-steps";
import { api } from "@/services/api";

export interface OnboardingData {
  sessionName: string;
  oneLiner: string;
  stage: string;
  problem: string;
  solution: string;
}

export default function SessionStart() {
  const navigate = useNavigate();

  // ─── Session state ─────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const lastFailedFile = useRef<File | null>(null);

  // ─── Deck state ────────────────────────────────────────────────────────────
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStageLabel, setUploadStageLabel] = useState("Uploading…");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [slideCount, setSlideCount] = useState(0);
  const [slidesLoading, setSlidesLoading] = useState(false);

  // ─── Ensure a session exists, create lazily on step 1 completion ──────────
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    setSessionError(null);
    try {
      const { session_id } = await api.createSession();
      setSessionId(session_id);
      return session_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create session";
      setSessionError(msg);
      throw err;
    }
  }, [sessionId]);

  // ─── Save company/pitch info after step 1+2 ───────────────────────────────
  const handleSaveOnboardingData = useCallback(
    async (data: OnboardingData) => {
      const sid = await ensureSession();
      try {
        await api.updateSession(sid, {
          session_name: data.sessionName,
          pitch_context: {
            company_name: data.sessionName,
            one_liner: data.oneLiner,
            stage: data.stage,
            problem: data.problem,
            solution: data.solution,
          },
        });
      } catch {
        // Non-fatal — continue anyway; data can be enriched by the interview
      }
    },
    [ensureSession]
  );

  // ─── Upload handler ───────────────────────────────────────────────────────
  const handleUpload = useCallback(
    async (file: File) => {
      const sid = await ensureSession();
      setIsUploading(true);
      setUploadProgress(5);
      setUploadStageLabel("Uploading…");
      setSlideCount(0);
      setUploadedFileName(null);

      try {
        // Stage 1 — Uploading (5 → 30%)
        const stage1 = setInterval(() => {
          setUploadProgress((p) => {
            if (p >= 28) { clearInterval(stage1); return p; }
            return p + 5;
          });
        }, 300);

        await api.uploadDeck(sid, file);
        clearInterval(stage1);

        // Stage 2 — Converting slides (30 → 65%)
        setUploadProgress(30);
        setUploadStageLabel("Converting slides…");
        const stage2 = setInterval(() => {
          setUploadProgress((p) => {
            if (p >= 63) { clearInterval(stage2); return p; }
            return p + 4;
          });
        }, 400);

        setSlidesLoading(true);
        const resp = await api.getSlides(sid);
        clearInterval(stage2);

        // Stage 3 — Analyzing content (65 → 95%)
        setUploadProgress(65);
        setUploadStageLabel("Analyzing content…");
        const stage3 = setInterval(() => {
          setUploadProgress((p) => {
            if (p >= 93) { clearInterval(stage3); return p; }
            return p + 3;
          });
        }, 500);

        setSlideCount(resp.count ?? 0);
        setUploadedFileName(file.name);
        clearInterval(stage3);
        setUploadProgress(100);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setSessionError(msg);
        lastFailedFile.current = file;
      } finally {
        setIsUploading(false);
        setSlidesLoading(false);
      }
    },
    [ensureSession]
  );

  // ─── Clear deck ───────────────────────────────────────────────────────────
  const handleClearDeck = useCallback(() => {
    setUploadedFileName(null);
    setSlideCount(0);
    setUploadProgress(0);
    setUploadStageLabel("Uploading…");
  }, []);

  // ─── Start interview → navigate to workspace ──────────────────────────────
  const handleStartInterview = useCallback(async () => {
    try {
      const sid = await ensureSession();
      navigate(`/app/session/${sid}`);
    } catch {
      // error already set in ensureSession
    }
  }, [ensureSession, navigate]);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <GrainOverlay />

      {/* Atmospheric glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "linear-gradient(to top right, rgba(200,255,0,0.04) 0%, transparent 50%)",
        }}
      />

      {/* Fixed minimal nav */}
      <header className="fixed top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-50 border-b border-[#1e1e1e] bg-[#050505]/90 backdrop-blur-xl">
        <a href="/app">
          <Logo className="text-sm" />
        </a>
        <span className="text-xs font-mono text-[#3a3a3a]">New session</span>
      </header>

      {/* Centered content */}
      <main className="relative z-10 flex flex-col items-center justify-center min-h-screen pt-14 px-6 pb-16">

        {/* Errors */}
        {sessionError && (
          <div className="w-full max-w-2xl mb-6 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-red-400">{sessionError}</p>
            <div className="flex items-center gap-2 flex-shrink-0">
              {lastFailedFile.current && (
                <button
                  onClick={() => {
                    const file = lastFailedFile.current;
                    lastFailedFile.current = null;
                    setSessionError(null);
                    if (file) handleUpload(file);
                  }}
                  className="text-xs text-red-300/70 hover:text-red-300 underline transition-colors"
                >
                  Retry upload
                </button>
              )}
              <button
                onClick={() => { setSessionError(null); lastFailedFile.current = null; }}
                className="text-xs text-[#5a5a5a] hover:text-[#a0a0a0] transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Onboarding steps — always mounted so local wizard state survives session creation */}
        <OnboardingSteps
          sessionId={sessionId ?? ""}
          onSaveOnboardingData={handleSaveOnboardingData}
          onUpload={handleUpload}
          isUploading={isUploading}
          uploadProgress={uploadProgress}
          uploadStageLabel={uploadStageLabel}
          uploadedFileName={uploadedFileName}
          slideCount={slideCount}
          slidesLoading={slidesLoading}
          onClearDeck={handleClearDeck}
          onStartInterview={handleStartInterview}
        />
      </main>
    </div>
  );
}

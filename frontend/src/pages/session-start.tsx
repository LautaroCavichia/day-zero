// ─── SessionStart ─────────────────────────────────────────────────────────────
// Route: /app/new
// Creates a new session, then guides the user through the onboarding steps
// (upload deck → preview → start interview). On "Start Interview" navigates to
// /app/session/:id which hosts the live workspace.

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import GrainOverlay from "@/components/shared/grain-overlay";
import OnboardingSteps from "@/components/session/onboarding-steps";
import { api } from "@/services/api";

export default function SessionStart() {
  const navigate = useNavigate();

  // ─── Session state ─────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const lastFailedFile = useRef<File | null>(null);

  // ─── Deck state ────────────────────────────────────────────────────────────
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStageLabel, setUploadStageLabel] = useState("Uploading…");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [slides, setSlides] = useState<string[]>([]);
  const [slidesLoading, setSlidesLoading] = useState(false);

  // ─── Ensure a session exists, create lazily on first upload ──────────────
  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionId) return sessionId;
    setCreatingSession(true);
    setSessionError(null);
    try {
      const { session_id } = await api.createSession();
      setSessionId(session_id);
      return session_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create session";
      setSessionError(msg);
      throw err;
    } finally {
      setCreatingSession(false);
    }
  }, [sessionId]);

  // ─── Upload handler ───────────────────────────────────────────────────────
  const handleUpload = useCallback(
    async (file: File) => {
      const sid = await ensureSession();
      setIsUploading(true);
      setUploadProgress(5);
      setUploadStageLabel("Uploading…");
      setSlides([]);
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

        // Fetch converted slides
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

        setSlides(resp.slides ?? []);
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
    setSlides([]);
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

      {/* Fixed minimal nav */}
      <header className="fixed top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-50 border-b border-[#1e1e1e] bg-background/80 backdrop-blur-md">
        <a href="/app" className="flex items-center gap-2 group">
          <span className="text-sm font-semibold text-[#f0f0f0] font-heading tracking-tight group-hover:text-[#C8FF00] transition-colors">
            DayZero
          </span>
        </a>
        <span className="text-xs font-mono text-[#3a3a3a]">New session</span>
      </header>

      {/* Centered content */}
      <main className="flex flex-col items-center justify-center min-h-screen pt-14 px-6 pb-16">
        {/* Page heading */}
        <div className="w-full max-w-2xl mb-10 text-center">
          <p className="text-[10px] font-mono tracking-[0.12em] text-[#C8FF00]/40 uppercase mb-3">
            New session
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#f0f0f0] font-heading tracking-tight leading-tight mb-3">
            Prepare your pitch
          </h1>
          <p className="text-sm text-[#5a5a5a] leading-relaxed">
            Upload your deck and get grilled by Sam — your AI seed-round investor.
          </p>
        </div>

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

        {/* Onboarding steps */}
        {creatingSession ? (
          <div className="flex items-center gap-3 text-sm text-[#5a5a5a]">
            <div className="w-4 h-4 rounded-full border-2 border-[#1e1e1e] border-t-[#C8FF00] animate-spin" />
            Creating session...
          </div>
        ) : (
          <OnboardingSteps
            sessionId={sessionId ?? ""}
            onUpload={handleUpload}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            uploadStageLabel={uploadStageLabel}
            uploadedFileName={uploadedFileName}
            slides={slides}
            slidesLoading={slidesLoading}
            onClearDeck={handleClearDeck}
            onStartInterview={handleStartInterview}
          />
        )}
      </main>
    </div>
  );
}

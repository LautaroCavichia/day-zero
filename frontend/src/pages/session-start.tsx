// ─── SessionStart ─────────────────────────────────────────────────────────────
// Route: /app
// Creates a new session, then guides the user through the onboarding steps
// (upload deck → preview → start interview). On "Start Interview" navigates to
// /app/session/:id which hosts the live workspace.

import { useCallback, useState } from "react";
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

  // ─── Deck state ────────────────────────────────────────────────────────────
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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
      setUploadProgress(10);
      setSlides([]);
      setUploadedFileName(null);

      try {
        // Fake incremental progress while the server processes (PPTX conversion can be slow)
        const progressInterval = setInterval(() => {
          setUploadProgress((p) => Math.min(p + 8, 88));
        }, 600);

        await api.uploadDeck(sid, file);

        clearInterval(progressInterval);
        setUploadProgress(95);

        // Fetch converted slides
        setSlidesLoading(true);
        const resp = await api.getSlides(sid);
        setSlides(resp.slides ?? []);
        setUploadedFileName(file.name);
        setUploadProgress(100);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setSessionError(msg);
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
        <a href="/" className="flex items-center gap-2 group">
          <span className="text-sm font-semibold text-[#f0f0f0] font-display tracking-tight group-hover:text-[#C8FF00] transition-colors">
            DayZero
          </span>
        </a>
        <span className="text-xs font-mono text-[#3a3a3a]">New session</span>
      </header>

      {/* Centered content */}
      <main className="flex flex-col items-center justify-center min-h-screen pt-14 px-6 pb-16">
        {/* Page heading */}
        <div className="w-full max-w-2xl mb-10 text-center">
          <h1 className="text-2xl font-semibold text-[#f0f0f0] font-display mb-2">
            Prepare your pitch
          </h1>
          <p className="text-sm text-[#5a5a5a]">
            Upload your deck and get grilled by Sam — your AI seed-round investor.
          </p>
        </div>

        {/* Errors */}
        {sessionError && (
          <div className="w-full max-w-2xl mb-6 rounded-lg border border-red-900/50 bg-red-950/20 px-4 py-3">
            <p className="text-xs text-red-400">{sessionError}</p>
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

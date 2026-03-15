// ─── NotFound ─────────────────────────────────────────────────────────────────
// Route: * (catch-all)
// Displayed when the user navigates to an unknown URL.

import { useNavigate } from "react-router-dom";
import GrainOverlay from "@/components/shared/grain-overlay";

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="dark min-h-screen bg-background text-foreground flex flex-col">
      <GrainOverlay />

      {/* Atmospheric glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 50% 50%, rgba(200,255,0,0.05) 0%, transparent 70%)",
        }}
      />

      {/* Nav */}
      <header className="relative z-10 h-14 flex items-center px-6 border-b border-[#1e1e1e]">
        <a href="/" className="flex items-center gap-2 group">
          <span className="text-sm font-semibold text-[#f0f0f0] font-heading tracking-tight group-hover:text-[#C8FF00] transition-colors">
            Day<span className="text-[#C8FF00]">Zero</span>
          </span>
        </a>
      </header>

      {/* Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="page-load-item" style={{ animationDelay: "0ms" }}>
          <p className="text-[10px] font-mono tracking-widest text-[#5a5a5a] uppercase mb-3">
            Error 404
          </p>
          <h1
            className="font-heading font-semibold tracking-tight text-[#f0f0f0] mb-3"
            style={{ fontSize: "clamp(2.5rem, 8vw, 5rem)", lineHeight: 1.1 }}
          >
            Page not found
          </h1>
          <p className="text-sm text-[#5a5a5a] max-w-xs mx-auto mb-8 leading-relaxed">
            This URL doesn't exist. You may have followed a broken link or typed
            something wrong.
          </p>
        </div>

        <div
          className="page-load-item flex items-center gap-3"
          style={{ animationDelay: "120ms" }}
        >
          <button
            onClick={() => navigate("/app")}
            className="inline-flex items-center gap-2 rounded-lg bg-[#C8FF00] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[#D4FF33] active:scale-95 transition-all duration-150 shadow-[0_0_20px_rgba(200,255,0,0.12)]"
          >
            Go to dashboard
          </button>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#2a2a2a] px-5 py-2.5 text-sm font-medium text-[#a0a0a0] hover:border-[#3a3a3a] hover:text-[#f0f0f0] transition-colors duration-150"
          >
            Go back
          </button>
        </div>
      </main>
    </div>
  );
}

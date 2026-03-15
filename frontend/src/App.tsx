import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Landing from "@/pages/landing";
import ColorBendsTest from "@/pages/color-bends-test";
import Dashboard from "@/pages/dashboard";
import SessionStart from "@/pages/session-start";
import SessionWorkspace from "@/pages/session-workspace";
import NotFound from "@/pages/not-found";

// ─── PageTransition ────────────────────────────────────────────────────────────
// Re-triggers the entrance animation on every route change by keying
// a wrapper div off the pathname. Landing page has its own stagger sequence
// so it uses a lighter fade-in instead of fade-up.
function AnimatedRoutes() {
  const location = useLocation();
  const isLanding = location.pathname === "/";

  return (
    <div
      key={location.pathname}
      className={isLanding ? "anim-fade-in" : "anim-fade-up"}
      style={{ animationDuration: isLanding ? "0.5s" : "0.35s" }}
    >
      <Routes location={location}>
        <Route path="/" element={<Landing />} />
        <Route path="/test" element={<ColorBendsTest />} />
        {/* /app → dashboard (session history) */}
        <Route path="/app" element={<Dashboard />} />
        {/* /app/new → start a new session */}
        <Route path="/app/new" element={<SessionStart />} />
        {/* /app/session/:id → main workspace */}
        <Route path="/app/session/:id" element={<SessionWorkspace />} />
        {/* catch-all 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  );
}

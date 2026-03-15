import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "@/pages/landing";
import ColorBendsTest from "@/pages/color-bends-test";
import Dashboard from "@/pages/dashboard";
import SessionStart from "@/pages/session-start";
import SessionWorkspace from "@/pages/session-workspace";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/test" element={<ColorBendsTest />} />
        {/* /app → dashboard (session history) */}
        <Route path="/app" element={<Dashboard />} />
        {/* /app/new → start a new session */}
        <Route path="/app/new" element={<SessionStart />} />
        {/* /app/session/:id → main workspace */}
        <Route path="/app/session/:id" element={<SessionWorkspace />} />
      </Routes>
    </BrowserRouter>
  );
}

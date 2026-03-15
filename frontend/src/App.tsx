import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "@/pages/landing";
import ColorBendsTest from "@/pages/color-bends-test";
import SessionStart from "@/pages/session-start";
import SessionWorkspace from "@/pages/session-workspace";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/test" element={<ColorBendsTest />} />
        <Route path="/app" element={<SessionStart />} />
        <Route path="/app/session/:id" element={<SessionWorkspace />} />
      </Routes>
    </BrowserRouter>
  );
}

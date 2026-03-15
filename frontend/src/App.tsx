import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "@/pages/landing";
import ColorBendsTest from "@/pages/color-bends-test";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/test" element={<ColorBendsTest />} />
        {/* Future: <Route path="/app/*" element={<Dashboard />} /> */}
      </Routes>
    </BrowserRouter>
  );
}

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

// StrictMode is intentionally omitted: the ColorBends WebGL component calls
// renderer.forceContextLoss() in its cleanup, which causes the context to be
// unrecoverable when Strict Mode double-invokes effects in development.
createRoot(document.getElementById("root")!).render(<App />);

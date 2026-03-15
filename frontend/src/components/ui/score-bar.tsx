// ─── ScoreBar ─────────────────────────────────────────────────────────────────
// Animated horizontal bar that fills from 0% to target width on mount.
// Reusable across Deck Analysis, Market Intel, Deliberation, Verdict.

import { useEffect, useRef, useState } from "react";

interface ScoreBarProps {
  /** Score value */
  score: number;
  /** Maximum possible value (default 10) */
  max?: number;
  /** Delay before animation starts (ms) */
  delay?: number;
  /** Override bar color (default: chartreuse) */
  color?: "chartreuse" | "red" | "amber" | "blue" | "green";
}

const colorMap: Record<NonNullable<ScoreBarProps["color"]>, string> = {
  chartreuse: "bg-[#C8FF00]",
  red: "bg-red-400",
  amber: "bg-amber-400",
  blue: "bg-blue-400",
  green: "bg-emerald-400",
};

function scoreBarWidth(score: number, max: number): string {
  return `${Math.min(100, (score / max) * 100)}%`;
}

export function ScoreBar({ score, max = 10, delay = 0, color = "chartreuse" }: ScoreBarProps) {
  const [width, setWidth] = useState("0%");
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const t = setTimeout(() => {
      setWidth(scoreBarWidth(score, max));
    }, delay);
    return () => clearTimeout(t);
  }, [score, max, delay]);

  return (
    <div className="score-bar-track w-full">
      <div
        className={`score-bar-fill ${colorMap[color]}`}
        style={{ width }}
      />
    </div>
  );
}

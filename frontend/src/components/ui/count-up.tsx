// ─── CountUp ──────────────────────────────────────────────────────────────────
// Animated number that counts from 0 to target value on mount.
// Uses requestAnimationFrame with easeOutCubic for a smooth finish.

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  decimals?: number;
  /** Delay before animation starts (ms) */
  delay?: number;
  suffix?: string;
  prefix?: string;
  /** Animation duration (ms, default 1200) */
  duration?: number;
}

export function CountUp({
  value,
  decimals = 1,
  delay = 0,
  suffix = "",
  prefix = "",
  duration = 1200,
}: CountUpProps) {
  const [displayed, setDisplayed] = useState(0);
  const raf = useRef<number | null>(null);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    let started = false;

    const start = () => {
      startTime.current = performance.now();
      const tick = (now: number) => {
        const elapsed = now - (startTime.current ?? now);
        const progress = Math.min(1, elapsed / duration);
        const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
        setDisplayed(parseFloat((eased * value).toFixed(decimals)));
        if (progress < 1) {
          raf.current = requestAnimationFrame(tick);
        } else {
          setDisplayed(value);
        }
      };
      raf.current = requestAnimationFrame(tick);
    };

    const t = setTimeout(() => {
      started = true;
      start();
    }, delay);

    return () => {
      clearTimeout(t);
      if (!started && raf.current) cancelAnimationFrame(raf.current);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span>
      {prefix}{displayed.toFixed(decimals)}{suffix}
    </span>
  );
}

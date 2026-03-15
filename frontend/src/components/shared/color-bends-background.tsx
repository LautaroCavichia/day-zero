/**
 * ColorBendsBackground
 *
 * A reliable wrapper around ColorBends that guarantees the WebGL canvas
 * gets real dimensions on mount.
 *
 * Key fixes vs. using ColorBends directly inside absolute/inset-0:
 *  - Uses position:fixed so it's always sized to the viewport, not a layout ancestor
 *  - Colors are memoized to prevent the second useEffect re-firing constantly
 *  - zIndex exposed as a prop so callers can stack it correctly
 */
import { useMemo } from "react";
import ColorBends from "@/components/ColorBends";

type Props = {
  zIndex?: number;
  opacity?: number;
};

const COLORS = ["#C8FF00", "#0A1F12", "#1A3D28"];

export default function ColorBendsBackground({ zIndex = 0, opacity = 1 }: Props) {
  // Stable reference — never a new array on re-render
  const colors = useMemo(() => COLORS, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex,
        opacity,
        // Force a real layout box so clientWidth/clientHeight are non-zero on mount
        width: "100%",
        height: "100%",
        display: "block",
        overflow: "hidden",
      }}
    >
      <ColorBends
        colors={colors}
        speed={0.15}
        scale={1.2}
        frequency={0.8}
        warpStrength={0.7}
        mouseInfluence={0.5}
        parallax={0.3}
        noise={0.04}
        transparent={false}
      />
    </div>
  );
}

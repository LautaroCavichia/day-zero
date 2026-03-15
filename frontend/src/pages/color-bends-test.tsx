/**
 * ColorBendsTest — isolated test page to verify ColorBends renders correctly.
 * Visit /test in dev to see it.
 * Remove when confirmed working.
 */
import ColorBends from "@/components/ColorBends";

export default function ColorBendsTest() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#050505",
        position: "relative",
      }}
    >

      <ColorBends
        colors={["#C8FF00", "#0A1F12", "#1A3D28"]}
        rotation={0}
        speed={0.2}
        scale={1}
        frequency={1}
        warpStrength={1}
        mouseInfluence={1}
        parallax={0.5}
        noise={0.1}
        transparent
        autoRotate={0}
      />
    </div>
  );
}

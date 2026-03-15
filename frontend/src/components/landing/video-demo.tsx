import { Play } from "lucide-react";
import { useInView } from "@/hooks/useInView";

export default function VideoDemo() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.2 });
  const [headerRef, headerInView] = useInView<HTMLDivElement>({ threshold: 0.5 });

  return (
    <section id="demo" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">

        {/* Header */}
        <div ref={headerRef} className="text-center mb-12">
          <p
            className={`anim-hidden text-sm font-mono text-chartreuse tracking-widest uppercase mb-4 ${
              headerInView ? "anim-fade-up" : ""
            }`}
          >
            See it in action
          </p>
          <h2
            className={`anim-hidden text-3xl sm:text-4xl font-heading font-bold tracking-tight text-white ${
              headerInView ? "anim-fade-up anim-delay-100" : ""
            }`}
          >
            Watch a 2-minute walkthrough
          </h2>
        </div>

        {/* Video container */}
        <div
          ref={ref}
          className={`anim-hidden ${inView ? "anim-scale-up anim-delay-100" : ""}`}
        >
          <div className="relative aspect-video rounded-2xl border border-[#1e1e1e] bg-[#0c0c0c] overflow-hidden shadow-[0_0_80px_rgba(200,255,0,0.04),0_0_160px_rgba(0,0,0,0.5)]">
            {/* Inner gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-[#0A1F12]/40 to-transparent" />

            {/* Grid texture overlay */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: `
                  linear-gradient(rgba(200,255,0,0.5) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(200,255,0,0.5) 1px, transparent 1px)
                `,
                backgroundSize: "48px 48px",
              }}
            />

            {/* Play button */}
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center group cursor-pointer"
              aria-label="Play demo video"
            >
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center justify-center size-20 sm:size-24 rounded-full bg-chartreuse/8 border border-chartreuse/20 transition-all duration-300 group-hover:bg-chartreuse/15 group-hover:scale-105 group-hover:border-chartreuse/40 group-hover:shadow-[0_0_60px_rgba(200,255,0,0.15)]">
                  <Play
                    className="size-8 sm:size-10 text-chartreuse ml-1.5"
                    strokeWidth={1.5}
                    fill="currentColor"
                  />
                </div>
                <span className="text-xs font-mono text-[#5a5a5a] tracking-widest group-hover:text-[#a0a0a0] transition-colors">
                  WATCH THE WALKTHROUGH
                </span>
              </div>
            </button>

            {/* Corner labels */}
            <div className="absolute top-5 left-5 text-[10px] font-mono text-[#5a5a5a]/50 tracking-widest">
              DEMO · DAYZERO
            </div>
            <div className="absolute bottom-5 right-5 text-[10px] font-mono text-[#5a5a5a]/50 tracking-widest">
              2:14
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

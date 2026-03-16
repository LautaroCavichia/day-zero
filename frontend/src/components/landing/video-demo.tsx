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
            <iframe
              src="https://www.youtube.com/embed/MAaHndpRQPc?rel=0&modestbranding=1&color=white"
              title="DayZero walkthrough"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
              style={{ border: 0 }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

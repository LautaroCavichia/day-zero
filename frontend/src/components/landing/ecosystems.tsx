import { useInView } from "@/hooks/useInView";

const institutionalFeatures = [
  {
    title: "Portfolio Training",
    description: "Provide a dedicated environment for your founders to stress-test their narrative and metrics 24/7 before real Pitch Days."
  },
  {
    title: "Selection Efficiency",
    description: "Standardize your screening process. Use data-grounded assessments to accelerate the selection of high-potential applicants."
  },
  {
    title: "Custom Evaluation Bias",
    description: "Personalize the panel of voices and the assessment criteria to perfectly align with your investment thesis and specific quality bars."
  }
];

export default function Ecosystems() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.1 });

  return (
    <section id="ecosystems" className="py-24 sm:py-32 border-y border-[#1a1a1a] bg-[#050505]">
      <div ref={ref} className="mx-auto max-w-7xl px-6 lg:px-12">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* Left: Text */}
          <div className={`anim-hidden ${inView ? "anim-fade-right" : ""}`}>
            <p className="text-xs font-mono text-chartreuse tracking-widest uppercase mb-6">
              Institutional / Ecosystems
            </p>
            <h2 className="text-3xl sm:text-4xl font-heading font-bold tracking-tight text-white mb-8">
              Stress-testing infrastructure for <span className="text-chartreuse">Ecosystems.</span>
            </h2>
            <p className="text-lg text-[#a0a0a0] leading-relaxed mb-12 max-w-xl">
              Designed for incubators, accelerators, and VC funds aiming to elevate founder preparedness and optimize internal selection workflows.
            </p>

            <div className="space-y-10">
              {institutionalFeatures.map((f, i) => {
                return (
                  <div key={i} className="flex gap-0">
                    <div>
                      <h3 className="text-white font-semibold text-lg mb-2">{f.title}</h3>
                      <p className="text-[#707070] text-sm leading-relaxed">{f.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-16">
              <a
                href="https://zonda.one"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm font-mono text-white hover:text-chartreuse transition-colors group"
              >
                Learn about whitelabeling
                <span className="ml-2 group-hover:translate-x-1 transition-transform">→</span>
              </a>
            </div>
          </div>

          {/* Right: Abstract Visual / Quote */}
          <div className={`relative anim-hidden ${inView ? "anim-fade-left anim-delay-200" : ""}`}>
            <div className="aspect-4/3 rounded-2xl border border-[#1a1a1a] bg-[#0c0c0c] p-12 flex flex-col justify-center">
              <div className="text-4xl font-serif italic text-white/10 absolute top-8 left-8">“</div>
              <blockquote className="text-xl text-[#d0d0d0] font-medium leading-relaxed relative z-10 mb-8">
                We don't provide content generation, but <span className="text-white italic">rigorous critique</span>.
                We want the first "no" a founder receives to come from our AI, so that the investor's "yes" becomes inevitable.
              </blockquote>
              <div className="flex items-center gap-4">
                <div className="size-14 rounded-full border border-white/10 overflow-hidden grayscale hover:grayscale-0 transition-all duration-300">
                  <img
                    src="/lautaro.jpg"
                    alt="Lautaro Cavichia"
                    className="w-full h-full object-cover scale-[1.7] translate-y-[10%] translate-x-[10%]"
                  />
                </div>
                <div>
                  <p className="text-xs font-mono text-white">Lautaro Cavichia</p>
                  <p className="text-[10px] font-mono text-[#5a5a5a]">CEO and Co-Founder, Zonda One</p>
                </div>
              </div>
            </div>
            {/* Decorative glow */}
            <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-64 bg-chartreuse/5 blur-[100px]" />
          </div>

        </div>
      </div>
    </section>
  );
}

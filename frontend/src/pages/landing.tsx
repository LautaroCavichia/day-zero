import Nav from "@/components/shared/nav";
import GrainOverlay from "@/components/shared/grain-overlay";
import Hero from "@/components/landing/hero";
import Tension from "@/components/landing/tension";
import Features from "@/components/landing/features";
import VideoDemo from "@/components/landing/video-demo";
import OutputPreview from "@/components/landing/output-preview";
import Ecosystems from "@/components/landing/ecosystems";
import FinalCta from "@/components/landing/final-cta";
import Footer from "@/components/landing/footer";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <GrainOverlay />
      <Nav />
      <main>
        <Hero />
        <Tension />
        <Features />
        <VideoDemo />
        <OutputPreview />
        <Ecosystems />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

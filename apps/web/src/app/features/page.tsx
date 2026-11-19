import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Files, PanelsTopLeft, Sparkles } from "lucide-react";
import { MarketingPage } from "@/components/public-site";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Features",
  description: `Explore the brand-first planning and content tools in ${brand.productName}.`,
};

const features = [
  {
    icon: Building2,
    title: "Start with your brand",
    copy: "Keep your audience, voice, and visual direction close while you shape every new idea.",
  },
  {
    icon: Sparkles,
    title: "Turn a brief into a draft",
    copy: "Create a considered starting point for captions, campaigns, and a range of social formats.",
  },
  {
    icon: PanelsTopLeft,
    title: "Explore visual directions",
    copy: "Pair your message with editable design concepts and reusable templates for your next post.",
  },
  {
    icon: Files,
    title: "Keep work organized",
    copy: "Collect drafts, revisit saved content, and map out what you want to share next.",
  },
];

export default function FeaturesPage() {
  return (
    <MarketingPage
      eyebrow={`THE ${brand.productName.toUpperCase()} STUDIO`}
      title={<>A clearer path from<br /><em>idea to ready.</em></>}
      description="Everything begins with the details that make your business yours. Build on that foundation as you plan and create."
    >
      <div className="public-card-grid">
        {features.map((feature) => (
          <article className="public-card" key={feature.title}>
            <span className="public-card-icon"><feature.icon size={20} aria-hidden="true" /></span>
            <h2>{feature.title}</h2>
            <p>{feature.copy}</p>
          </article>
        ))}
      </div>
      <p className="public-note">
        Planning, drafting, and design tools are available to explore. Live social publishing and platform connections are still in development.
      </p>
      <Link className="button button-gold" href="/signup">Create your account <ArrowRight size={16} aria-hidden="true" /></Link>
    </MarketingPage>
  );
}

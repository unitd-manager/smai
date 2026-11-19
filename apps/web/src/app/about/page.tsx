import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Compass } from "lucide-react";
import { MarketingPage } from "@/components/public-site";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "About",
  description: `Learn about the thinking behind ${brand.productName}, a brand-first social content workspace.`,
};

export default function AboutPage() {
  return (
    <MarketingPage
      eyebrow={`MADE BY ${brand.companyName.toUpperCase()}`}
      title={<>Good content starts<br />with <em>knowing your brand.</em></>}
      description={`${brand.productName} is a social content workspace created to help businesses bring their brand details, drafts, and planning into one calmer workflow.`}
    >
      <div className="public-about-layout">
        <article className="public-card">
          <span className="public-card-icon"><Compass size={20} aria-hidden="true" /></span>
          <h2>Make room for the point of view</h2>
          <p>Tools should help teams get their ideas into focus—not make every brand sound the same. United Technologies starts with your audience, voice, and visual direction.</p>
        </article>
        <div className="public-about-copy">
          <h2>A practical creative workspace</h2>
          <p>From an early brief to a saved draft, United Technologies brings the useful steps together so you can spend less time switching between scattered notes and ideas.</p>
          <p>The product is actively being developed. Draft generation and design previews are available to explore; social publishing, payment processing, and several team integrations are not live yet.</p>
          <Link className="text-link" href="/how-it-works">See how it works <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </div>
    </MarketingPage>
  );
}

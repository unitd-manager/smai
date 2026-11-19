import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingPage } from "@/components/public-site";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Pricing",
  description: `Start a 14-day ${brand.productName} trial and explore the workspace before choosing a plan.`,
};

const planNotes = [
  { title: "Trial", copy: "Explore the studio for 14 days and see how a brand-first workflow fits your team." },
  { title: "For growing teams", copy: "The workspace includes plan options for independent brands and teams that manage multiple brands." },
  { title: "For agencies", copy: "Agency-scale options are part of the plan model; team and publishing integrations are still being built." },
];

export default function PricingPage() {
  return (
    <MarketingPage
      eyebrow="SIMPLE TO START"
      title={<>Try the studio.<br /><em>Find your fit.</em></>}
      description="Start with a 14-day trial and explore the tools in your workspace. We are still finalizing public plan pricing."
    >
      <div className="public-card-grid public-pricing-grid">
        {planNotes.map((plan) => (
          <article className="public-card" key={plan.title}>
            <p className="public-card-kicker">{brand.productName.toUpperCase()} PLANS</p>
            <h2>{plan.title}</h2>
            <p>{plan.copy}</p>
          </article>
        ))}
      </div>
      <div className="public-callout">
        <h2>What happens next?</h2>
        <p>There is no published subscription price yet. Your account shows the available workspace plan details; billing and payment processing are still in development.</p>
        <Link className="button button-gold" href="/signup">Start your 14-day trial <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </MarketingPage>
  );
}

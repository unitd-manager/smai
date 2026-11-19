import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MarketingPage } from "@/components/public-site";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "How it works",
  description: `See how ${brand.productName} helps you move from a brand brief to a considered content plan.`,
};

const steps = [
  {
    number: "01",
    title: "Set your foundation",
    copy: "Add the essentials: what your business does, who you want to reach, and the tone you want to use.",
    detail: "Your workspace keeps your brand details and content together.",
  },
  {
    number: "02",
    title: "Shape your next idea",
    copy: "Choose a format and share a short brief. Review a generated draft and explore a few visual directions.",
    detail: "Every draft is a starting point for your own review.",
  },
  {
    number: "03",
    title: "Organize the work",
    copy: "Save useful ideas, refine the copy, and arrange planned posts in one place.",
    detail: "You stay in control of what is ready and what needs more work.",
  },
];

export default function HowItWorksPage() {
  return (
    <MarketingPage
      eyebrow="A SIMPLE, THOUGHTFUL WORKFLOW"
      title={<>From your first brief<br />to a <em>clear next step.</em></>}
      description="United Technologies is designed to make the early work of social content easier to manage without taking your voice out of the process."
    >
      <div className="public-step-list">
        {steps.map((step) => (
          <article className="public-step" key={step.number}>
            <span className="public-step-number">{step.number}</span>
            <div>
              <h2>{step.title}</h2>
              <p>{step.copy}</p>
              <small>{step.detail}</small>
            </div>
          </article>
        ))}
      </div>
      <div className="public-callout">
        <h2>Built for thoughtful review.</h2>
        <p>Generated copy and design previews are drafts. Review them before publishing; live publishing requires a configured social account.</p>
        <Link className="text-link" href="/features">Explore the features <ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
    </MarketingPage>
  );
}

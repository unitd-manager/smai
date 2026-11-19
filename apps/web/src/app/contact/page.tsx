import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, LogIn, UserRoundPlus } from "lucide-react";
import { MarketingPage } from "@/components/public-site";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: "Contact",
  description: `Get started with ${brand.productName} or find help with your existing workspace.`,
};

export default function ContactPage() {
  return (
    <MarketingPage
      eyebrow="WE'RE HERE TO HELP YOU GET STARTED"
      title={<>Let’s find your<br /><em>next good step.</em></>}
      description="Explore the studio, learn about the workflow, or return to your account."
    >
      <div className="public-card-grid public-contact-grid">
        <article className="public-card">
          <span className="public-card-icon"><UserRoundPlus size={20} aria-hidden="true" /></span>
          <h2>New to United Technologies?</h2>
          <p>Start a 14-day trial to explore the current content planning and design tools in your own workspace.</p>
          <Link className="text-link" href="/signup">Create an account <ArrowRight size={14} aria-hidden="true" /></Link>
        </article>
        <article className="public-card">
          <span className="public-card-icon"><LogIn size={20} aria-hidden="true" /></span>
          <h2>Already have a workspace?</h2>
          <p>Sign in to find your account details, workspace, and available plan information.</p>
          <Link className="text-link" href="/login">Sign in <ArrowRight size={14} aria-hidden="true" /></Link>
        </article>
      </div>
      <p className="public-note">
        The public support contact channel is being set up by {brand.companyName}. We have not published an address yet, so we do not want to direct you to an unmonitored inbox.
      </p>
    </MarketingPage>
  );
}

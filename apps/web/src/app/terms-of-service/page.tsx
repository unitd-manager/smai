import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using Social Media Marketing to create, manage, schedule, and publish social content.",
  alternates: { canonical: "https://smai.unitdtechnologies.com/terms-of-service" },
  robots: { index: true, follow: true },
};

const legalSections = [
  { id: "acceptance", label: "01 Acceptance" },
  { id: "service", label: "02 The service" },
  { id: "eligibility", label: "03 Eligibility" },
  { id: "accounts", label: "04 Accounts and security" },
  { id: "connected-accounts", label: "05 Connecting third-party accounts" },
  { id: "acceptable-use", label: "06 Acceptable use" },
  { id: "user-content", label: "07 User content and licence" },
  { id: "ai-content", label: "08 AI-generated content" },
  { id: "third-party-platforms", label: "09 Third-party platforms" },
  { id: "fees", label: "10 Fees and billing" },
  { id: "intellectual-property", label: "11 Intellectual property" },
  { id: "privacy", label: "12 Privacy" },
  { id: "termination", label: "13 Suspension and termination" },
  { id: "disclaimers", label: "14 Disclaimers" },
  { id: "liability", label: "15 Limitation of liability" },
  { id: "indemnification", label: "16 Indemnification" },
  { id: "governing-law", label: "17 Governing law and disputes" },
  { id: "changes", label: "18 Changes" },
  { id: "contact", label: "19 Contact" },
];

export default function TermsOfServicePage() {
  return (
    <MarketingPage
      legal
      eyebrow="Legal"
      title="Terms of Service"
      description="Terms for using Social Media Marketing to create, manage, schedule, and publish social content."
      effectiveDate="26 November 2026"
      legalPath="/terms-of-service"
      legalSections={legalSections}
    >
      <article className="public-legal-document">
        <section id="acceptance">
          <h2><span className="legal-section-index">01</span><span>Acceptance</span></h2>
          <p>By creating an account or using Social Media Marketing (&quot;the Service&quot;), operated by United Technologies Solutions (&quot;we&quot;, &quot;us&quot;), you agree to these Terms and our <Link href="/privacy-policy">Privacy Policy</Link>. If you do not agree, do not use the Service.</p>
        </section>

        <section id="service">
          <h2><span className="legal-section-index">02</span><span>The service</span></h2>
          <p>The Service helps customers connect Instagram and Facebook Pages, create content, manage engagement, view analytics, and schedule or publish posts. Features depend on third-party platform APIs, permissions, and availability and may change or stop.</p>
        </section>

        <section id="eligibility">
          <h2><span className="legal-section-index">03</span><span>Eligibility</span></h2>
          <p>You must be at least 18 and have authority to enter into these Terms. If you use the Service for a business, you confirm that you have authority to bind that business.</p>
        </section>

        <section id="accounts">
          <h2><span className="legal-section-index">04</span><span>Accounts and security</span></h2>
          <p>Provide accurate account information and keep your sign-in credentials secure. You are responsible for activity under your account and should tell us promptly if you suspect unauthorized access.</p>
        </section>

        <section id="connected-accounts">
          <h2><span className="legal-section-index">05</span><span>Connecting third-party accounts</span></h2>
          <p>You may connect only accounts you own or are authorized to manage. You must follow each platform&apos;s terms and policies. You can revoke access in the platform&apos;s settings or disconnect an account in the dashboard. We may disconnect an account if its use breaches these Terms or applicable platform requirements.</p>
        </section>

        <section id="acceptable-use">
          <h2><span className="legal-section-index">06</span><span>Acceptable use</span></h2>
          <p>Do not use the Service to create or distribute spam, deceptive, illegal, infringing, or harassing content; attempt to bypass platform limits or automation rules; scrape data; or interfere with the security or operation of the Service.</p>
        </section>

        <section id="user-content">
          <h2><span className="legal-section-index">07</span><span>User content and licence</span></h2>
          <p>You keep ownership of content you create or upload. You grant us a limited licence to store, process, and publish that content only as needed to provide the Service on your instructions. You are responsible for your content, rights and permissions, and required disclosures such as sponsorship labels.</p>
        </section>

        <section id="ai-content">
          <h2><span className="legal-section-index">08</span><span>AI-generated content</span></h2>
          <p>Review AI-generated content before using or publishing it. It may be inaccurate, incomplete, or similar to other content. We do not guarantee its accuracy or originality, and you remain responsible for what you publish.</p>
        </section>

        <section id="third-party-platforms">
          <h2><span className="legal-section-index">09</span><span>Third-party platforms</span></h2>
          <p>We are not affiliated with or endorsed by Meta, Instagram, Facebook, or any other platform. A platform may change its API, policies, permissions, or access, which may change or stop features. We are not responsible for third-party outages, limits, or actions taken against your account.</p>
        </section>

        <section id="fees">
          <h2><span className="legal-section-index">10</span><span>Fees and billing</span></h2>
          <p><strong>TODO:</strong> Confirm whether paid subscriptions are offered, name the payment provider, and publish the approved fees, billing, renewal, cancellation, and refund terms. Do not rely on this section as a payment promise until those details are confirmed.</p>
        </section>

        <section id="intellectual-property">
          <h2><span className="legal-section-index">11</span><span>Intellectual property</span></h2>
          <p>The Service, its software, and its branding belong to us or our licensors. These Terms give you only the right to use the Service as described here.</p>
        </section>

        <section id="privacy">
          <h2><span className="legal-section-index">12</span><span>Privacy</span></h2>
          <p>Our <Link href="/privacy-policy">Privacy Policy</Link> explains what information we handle and how you can request deletion.</p>
        </section>

        <section id="termination">
          <h2><span className="legal-section-index">13</span><span>Suspension and termination</span></h2>
          <p>You may stop using the Service and request account deletion at any time. We may suspend or end access if you breach these Terms or create a security or legal risk. See the <Link href="/data-deletion">Data Deletion page</Link>.</p>
        </section>

        <section id="disclaimers">
          <h2><span className="legal-section-index">14</span><span>Disclaimers</span></h2>
          <p>The Service depends on third-party platforms and networks. We do not guarantee uninterrupted or error-free access. To the extent allowed by law, the Service is provided as available and without warranties not expressly stated here.</p>
        </section>

        <section id="liability">
          <h2><span className="legal-section-index">15</span><span>Limitation of liability</span></h2>
          <p><strong>TODO:</strong> Add the limitation of liability and exclusions approved for the applicable jurisdictions. This section requires legal review before publication as a final agreement.</p>
        </section>

        <section id="indemnification">
          <h2><span className="legal-section-index">16</span><span>Indemnification</span></h2>
          <p><strong>TODO:</strong> Add counsel-approved indemnification terms. No indemnity obligation is stated in this draft.</p>
        </section>

        <section id="governing-law">
          <h2><span className="legal-section-index">17</span><span>Governing law and disputes</span></h2>
          <p>The existing site terms state that the laws of India apply and that courts at Chennai, Tamil Nadu have jurisdiction. <strong>TODO:</strong> Confirm the governing law and courts with the registered legal entity before publication.</p>
        </section>

        <section id="changes">
          <h2><span className="legal-section-index">18</span><span>Changes</span></h2>
          <p>We may update these Terms. We will update the Effective Date and notify users of material changes. Continued use after an update means you accept the revised Terms.</p>
        </section>

        <section id="contact">
          <h2><span className="legal-section-index">19</span><span>Contact</span></h2>
          <p>United Technologies Solutions, 36, Balaji Nagar 2nd Street, Royapettah, Chennai - 600014, Tamil Nadu, India.</p>
          <p>Email: <a href="mailto:utsappcreate@gmail.com">utsappcreate@gmail.com</a></p>
          <p><strong>TODO:</strong> Confirm the exact registered legal name, current mailing address, and approved legal/privacy email.</p>
        </section>
      </article>
    </MarketingPage>
  );
}

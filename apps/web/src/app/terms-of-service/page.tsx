import type { Metadata } from "next";
import { MarketingPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you use Social Media Marketing.",
  robots: { index: true, follow: true },
};

const legalSections = [
  { id: "acceptance", label: "01 Acceptance" },
  { id: "service", label: "02 The Service" },
  { id: "eligibility", label: "03 Eligibility" },
  { id: "account", label: "04 Your account" },
  { id: "social-accounts", label: "05 Connecting social accounts" },
  { id: "acceptable-use", label: "06 Acceptable use" },
  { id: "your-content", label: "07 Your content" },
  { id: "ai-content", label: "08 AI-generated content" },
  { id: "third-party-platforms", label: "09 Third-party platforms" },
  { id: "subscriptions-payments", label: "10 Subscriptions and payments" },
  { id: "intellectual-property", label: "11 Intellectual property" },
  { id: "termination", label: "12 Suspension and termination" },
  { id: "disclaimers-liability", label: "13 Disclaimers and liability" },
  { id: "governing-law", label: "14 Governing law" },
  { id: "changes", label: "15 Changes" },
  { id: "contact", label: "16 Contact" },
];

export default function TermsOfServicePage() {
  return (
    <MarketingPage
      legal
      eyebrow="Legal"
      title="Terms of Service"
      description="The terms that apply when you use Social Media Marketing."
      effectiveDate="26 November 2026"
      legalPath="/terms-of-service"
      legalSections={legalSections}
    >
      <article className="public-legal-document">
        <section id="acceptance"><h2><span className="legal-section-index">01</span><span>Acceptance</span></h2>
          <p>By creating an account or using Social Media Marketing (&quot;the Service&quot;), operated by United Technologies Solutions (&quot;we&quot;, &quot;us&quot;), you agree to these terms and to our <a href="/privacy-policy">Privacy Policy</a>. If you do not agree, do not use the Service.</p>
        </section>

        <section id="service"><h2><span className="legal-section-index">02</span><span>The Service</span></h2>
          <p>The Service lets you connect social media accounts, create content with AI assistance, and schedule and publish posts. Features depend on the platforms&apos; APIs and may change.</p>
        </section>

        <section id="eligibility"><h2><span className="legal-section-index">03</span><span>Eligibility</span></h2>
          <p>You must be at least 18 and able to enter a binding agreement. If you use the Service for a business, you confirm you can bind that business.</p>
        </section>

        <section id="account"><h2><span className="legal-section-index">04</span><span>Your account</span></h2>
          <p>Provide accurate information and keep your login secure. You are responsible for activity under your account. Tell us promptly if you suspect unauthorised access.</p>
        </section>

        <section id="social-accounts"><h2><span className="legal-section-index">05</span><span>Connecting social accounts</span></h2>
          <p>You may connect only accounts you own or are authorised to manage. You must follow each platform&apos;s terms and policies. Instagram requires a Professional (Business or Creator) account and Facebook requires a Page. We may disconnect an account that breaches a platform&apos;s rules.</p>
        </section>

        <section id="acceptable-use"><h2><span className="legal-section-index">06</span><span>Acceptable use</span></h2>
          <p>Do not use the Service for spam, deception, illegal, infringing, harassing or harmful content, to bypass platform limits or rules, or to scrape data.</p>
        </section>

        <section id="your-content"><h2><span className="legal-section-index">07</span><span>Your content</span></h2>
          <p>You keep ownership of your content. You give us a limited licence to store, process and publish it as you instruct. You are responsible for your content and for required rights, consents and disclosures, such as sponsorship labels.</p>
        </section>

        <section id="ai-content"><h2><span className="legal-section-index">08</span><span>AI-generated content</span></h2>
          <p>AI suggestions may be inaccurate or similar to other content. Review everything before publishing. You are responsible for what you publish.</p>
        </section>

        <section id="third-party-platforms"><h2><span className="legal-section-index">09</span><span>Third-party platforms</span></h2>
          <p>We are not affiliated with or endorsed by any social media platform. Platforms may change or restrict access, which can affect the Service. We are not responsible for platform outages, limits or actions on your accounts.</p>
        </section>

        <section id="subscriptions-payments"><h2><span className="legal-section-index">10</span><span>Subscriptions and payments</span></h2>
          <p>The Service is offered on paid subscription plans processed by Stripe. Fees, billing period and renewal terms are shown at purchase. You can cancel at any time and your access continues until the end of the paid period. Fees already paid are non-refundable unless the law requires otherwise.</p>
        </section>

        <section id="intellectual-property"><h2><span className="legal-section-index">11</span><span>Intellectual property</span></h2>
          <p>The Service, its software and branding belong to us. These terms give you no rights to them except to use the Service.</p>
        </section>

        <section id="termination"><h2><span className="legal-section-index">12</span><span>Suspension and termination</span></h2>
          <p>You may stop using the Service or delete your account at any time. We may suspend or end access if you breach these terms.</p>
        </section>

        <section id="disclaimers-liability"><h2><span className="legal-section-index">13</span><span>Disclaimers and liability</span></h2>
          <p>The Service is provided &quot;as is&quot; without warranties. To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability is limited to the fees you paid in the 3 months before the claim.</p>
        </section>

        <section id="governing-law"><h2><span className="legal-section-index">14</span><span>Governing law</span></h2>
          <p>These terms are governed by the laws of India. Courts at Chennai, Tamil Nadu have jurisdiction.</p>
        </section>

        <section id="changes"><h2><span className="legal-section-index">15</span><span>Changes</span></h2>
          <p>We may update these terms and will change the Effective Date. Continued use means you accept the changes.</p>
        </section>

        <section id="contact"><h2><span className="legal-section-index">16</span><span>Contact</span></h2>
          <p>United Technologies Solutions, 36, Balaji Nagar 2nd Street, Royapettah, Chennai - 600014, Tamil Nadu, India. GSTIN 33AAIFU2698E1ZZ.</p>
          <p>Email: <a href="mailto:utsappcreate@gmail.com">utsappcreate@gmail.com</a></p>
        </section>
      </article>
    </MarketingPage>
  );
}

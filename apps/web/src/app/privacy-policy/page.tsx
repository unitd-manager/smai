import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Social Media Marketing collects, uses and protects your information.",
  robots: { index: true, follow: true },
};

const legalSections = [
  { id: "who-we-are", label: "01 Who we are" },
  { id: "information-we-collect", label: "02 Information we collect" },
  { id: "how-we-use", label: "03 How we use your information" },
  { id: "data-sales", label: "04 We do not sell your data" },
  { id: "ai-features", label: "05 AI features" },
  { id: "sharing-data", label: "06 Who we share data with" },
  { id: "connected-platforms", label: "07 Connected platforms" },
  { id: "security", label: "08 Security" },
  { id: "retention-deletion", label: "09 Retention and deletion" },
  { id: "your-rights", label: "10 Your rights" },
  { id: "children", label: "11 Children" },
  { id: "changes", label: "12 Changes" },
  { id: "contact", label: "13 Contact" },
];

export default function PrivacyPolicyPage() {
  return (
    <MarketingPage
      legal
      eyebrow="Legal"
      title="Privacy Policy"
      description="How Social Media Marketing collects, uses and protects your information."
      effectiveDate="26 November 2026"
      legalPath="/privacy-policy"
      legalSections={legalSections}
    >
      <article className="public-legal-document">
        <section id="who-we-are"><h2><span className="legal-section-index">01</span><span>Who we are</span></h2>
          <p>Social Media Marketing (&quot;the Service&quot;) is operated by United Technologies Solutions, a partnership firm in India (&quot;we&quot;, &quot;us&quot;), at 36, Balaji Nagar 2nd Street, Royapettah, Chennai - 600014, Tamil Nadu, India. The Service helps you connect your social media accounts, create content with AI assistance, and schedule and publish posts.</p>
        </section>

        <section id="information-we-collect"><h2><span className="legal-section-index">02</span><span>Information we collect</span></h2>
          <ul>
            <li>Account information: your name, email address and password (stored securely hashed).</li>
            <li>Connected account information: when you connect Instagram or Facebook, we receive only what you approve, such as your account ID, username, profile name and picture, and the Pages or professional accounts you choose to connect.</li>
            <li>Access tokens: issued by the platform when you connect an account. We store them encrypted and use them only to act on your instructions.</li>
            <li>Your content: posts, captions, images and videos you create or upload.</li>
            <li>Payment information: handled by Stripe. We do not store your card number.</li>
            <li>Usage data: log and device information, and cookies needed to run the Service.</li>
          </ul>
        </section>

        <section id="how-we-use"><h2><span className="legal-section-index">03</span><span>How we use your information</span></h2>
          <p>Only to provide the Service: to connect your accounts, create, schedule and publish content you choose, keep connections working, process payments, provide support, keep the Service secure, and meet legal obligations.</p>
        </section>

        <section id="data-sales"><h2><span className="legal-section-index">04</span><span>We do not sell your data</span></h2>
          <p>We do not sell, rent or trade personal data or data received from platform APIs. We do not use it for advertising, and we do not use it for anything other than providing the features you use.</p>
        </section>

        <section id="ai-features"><h2><span className="legal-section-index">05</span><span>AI features</span></h2>
          <p>When you use AI features, the content you provide is processed to generate suggestions such as captions and creative. We do not use your connected-account data to train AI models.</p>
        </section>

        <section id="sharing-data"><h2><span className="legal-section-index">06</span><span>Who we share data with</span></h2>
          <p>Only with service providers that help us run the Service, under our instructions: Stripe (payments), email delivery, and hosting and infrastructure providers, as well as AI providers for the AI features. We also disclose information if the law requires it. We never share it with advertisers.</p>
        </section>

        <section id="connected-platforms"><h2><span className="legal-section-index">07</span><span>Connected platforms</span></h2>
          <p>You connect each account through the platform&apos;s own login and approve the permissions it asks for. We request only the permissions needed for the features you use, and we follow each platform&apos;s developer policies. You can revoke our access at any time from the platform&apos;s settings (Instagram: Settings &gt; Apps and websites; Facebook: Settings &gt; Apps and Websites). We are not affiliated with or endorsed by Meta, Instagram or Facebook. Instagram and Facebook Pages are currently supported. We plan to add other platforms, and the same protections will apply to them.</p>
        </section>

        <section id="security"><h2><span className="legal-section-index">08</span><span>Security</span></h2>
          <p>We encrypt access tokens, protect data in transit, and limit access to personnel who need it. No system is completely secure, but we work to protect your information.</p>
        </section>

        <section id="retention-deletion"><h2><span className="legal-section-index">09</span><span>Retention and deletion</span></h2>
          <p>We keep your information while your account is active. You can delete your account and data at any time. See the <Link href="/data-deletion">Data Deletion page</Link>.</p>
        </section>

        <section id="your-rights"><h2><span className="legal-section-index">10</span><span>Your rights</span></h2>
          <p>Depending on where you live, including under India&apos;s Digital Personal Data Protection Act, 2023 and US state privacy laws such as the CCPA, you may have the right to access, correct or delete your data, and to withdraw consent. To exercise these rights, email <a href="mailto:utsappcreate@gmail.com">utsappcreate@gmail.com</a>. We respond within 30 days.</p>
        </section>

        <section id="children"><h2><span className="legal-section-index">11</span><span>Children</span></h2>
          <p>The Service is for users aged 18 and over. We do not knowingly collect data from children.</p>
        </section>

        <section id="changes"><h2><span className="legal-section-index">12</span><span>Changes</span></h2>
          <p>We may update this policy. We will change the Effective Date and notify you of material changes.</p>
        </section>

        <section id="contact"><h2><span className="legal-section-index">13</span><span>Contact</span></h2>
          <p>United Technologies Solutions, 36, Balaji Nagar 2nd Street, Royapettah, Chennai - 600014, Tamil Nadu, India. GSTIN 33AAIFU2698E1ZZ.</p>
          <p>Email: <a href="mailto:utsappcreate@gmail.com">utsappcreate@gmail.com</a></p>
        </section>
      </article>
    </MarketingPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Social Media Marketing handles information used to provide its social publishing, engagement, and analytics features.",
  alternates: { canonical: "https://smai.unitdtechnologies.com/privacy-policy" },
  robots: { index: true, follow: true },
};

const legalSections = [
  { id: "introduction", label: "01 Introduction" },
  { id: "information-we-collect", label: "02 Information we collect" },
  { id: "how-we-use", label: "03 How we use information" },
  { id: "data-sales", label: "04 We do not sell data" },
  { id: "ai-features", label: "05 AI features" },
  { id: "sharing-data", label: "06 Sharing" },
  { id: "connected-platforms", label: "07 Connected platforms" },
  { id: "platform-disclosures", label: "08 Platform disclosures" },
  { id: "security", label: "09 Security" },
  { id: "retention", label: "10 Retention" },
  { id: "deletion", label: "11 Deleting your data" },
  { id: "your-rights", label: "12 Your rights" },
  { id: "cookies", label: "13 Cookies" },
  { id: "children", label: "14 Children" },
  { id: "international-transfers", label: "15 International transfers" },
  { id: "changes", label: "16 Changes" },
  { id: "contact", label: "17 Contact" },
];

export default function PrivacyPolicyPage() {
  return (
    <MarketingPage
      legal
      eyebrow="Legal"
      title="Privacy Policy"
      description="How Social Media Marketing handles information used to provide its social publishing, engagement, and analytics features."
      effectiveDate="26 November 2026"
      legalPath="/privacy-policy"
      legalSections={legalSections}
    >
      <article className="public-legal-document">
        <section id="introduction">
          <h2><span className="legal-section-index">01</span><span>Introduction</span></h2>
          <p>Social Media Marketing (&quot;the Service&quot;) is operated by United Technologies Solutions (&quot;we&quot;, &quot;us&quot;). It lets customers connect social media accounts to schedule and publish content, manage engagement, and view analytics. The Service is available at <a href="https://smai.unitdtechnologies.com">smai.unitdtechnologies.com</a>.</p>
        </section>

        <section id="information-we-collect">
          <h2><span className="legal-section-index">02</span><span>Information we collect</span></h2>
          <ul>
            <li>Account information, including name, email address, hashed password, and billing details where applicable.</li>
            <li>Information from connected social accounts, only as authorized by you: account ID, username, profile name and picture, Pages and business accounts, and available comments, messages, and analytics metrics.</li>
            <li>OAuth access and refresh tokens, stored encrypted.</li>
            <li>Posts, captions, and media you create or upload.</li>
            <li>Account email, usage information, device information, security logs, and cookies needed to operate the Service.</li>
          </ul>
        </section>

        <section id="how-we-use">
          <h2><span className="legal-section-index">03</span><span>How we use information</span></h2>
          <p>We use information only to provide and secure the Service: connect accounts, publish and schedule posts, show comments, messages and analytics where authorized, keep connections working, provide support, handle billing, prevent abuse, and comply with law.</p>
        </section>

        <section id="data-sales">
          <h2><span className="legal-section-index">04</span><span>We do not sell data</span></h2>
          <p>We do not sell, rent, or trade personal data or data received from platform APIs. We do not use that data for advertising, data brokering, or building profiles for third parties. We use it only to provide the user-facing features of the Service.</p>
        </section>

        <section id="ai-features">
          <h2><span className="legal-section-index">05</span><span>AI features</span></h2>
          <p>When you request AI generation, your prompt and relevant brand-profile information are sent to the configured AI provider. Video generation may also send the image and instructions you select to Magic Hour. <strong>TODO: Confirm the production providers and their data retention and model-training terms before making a no-training statement.</strong></p>
        </section>

        <section id="sharing-data">
          <h2><span className="legal-section-index">06</span><span>Sharing</span></h2>
          <p>We share information only with service providers acting on our instructions, when legally required, or as part of a business transfer with notice. We do not share it with advertisers.</p>
          <p><strong>TODO:</strong> Confirm and name the production hosting, database, email, and AI/video providers and their applicable regions. The code supports SMTP or Resend for email, Cloudflare Workers AI, OpenAI or Groq for AI generation, and Magic Hour for video generation; the actual production configuration must be confirmed.</p>
        </section>

        <section id="connected-platforms">
          <h2><span className="legal-section-index">07</span><span>Connected platforms and permissions</span></h2>
          <p>The Service currently supports connecting Instagram and Facebook Pages. You connect through each platform&apos;s login and approve requested permissions. We request permissions needed for the features you use. You can revoke access in the platform&apos;s settings or disconnect an account in the dashboard. We comply with applicable platform developer terms and policies. We are not affiliated with or endorsed by Meta, Instagram, Facebook, or any other platform.</p>
        </section>

        <section id="platform-disclosures">
          <h2><span className="legal-section-index">08</span><span>Platform-specific disclosures</span></h2>
          <ul>
            <li><a href="https://www.facebook.com/privacy/policy/">Meta Privacy Policy</a> (covers Facebook and Instagram).</li>
            <li><a href="https://developers.facebook.com/terms/">Meta Platform Terms</a> and <a href="https://developers.facebook.com/devpolicy/">Meta Developer Policies</a>.</li>
          </ul>
          <p><strong>TODO:</strong> Re-check Meta&apos;s current developer requirements and add any additional app-specific disclosures before publication. YouTube is not currently a connected publishing account in this Service; if that changes, add the Google API Limited Use statement and <a href="https://policies.google.com/privacy">Google Privacy Policy</a>.</p>
        </section>

        <section id="security">
          <h2><span className="legal-section-index">09</span><span>Security</span></h2>
          <p>We encrypt social access tokens, protect data in transit, and use access controls to limit access. No system is completely secure.</p>
        </section>

        <section id="retention">
          <h2><span className="legal-section-index">10</span><span>Retention</span></h2>
          <p>When a connected account is disconnected, its stored access token is cleared. Meta deauthorization and data-deletion callbacks remove matched connection records and associated platform data from the Service. Some workspace content may remain available to other workspace members.</p>
          <p><strong>TODO:</strong> Confirm and publish retention periods for account, content, logs, billing/legal records, backups, and deletion-request status records.</p>
        </section>

        <section id="deletion">
          <h2><span className="legal-section-index">11</span><span>Deleting your data</span></h2>
          <p>You can disconnect a social account in Dashboard &gt; Social Accounts, delete your sign-in account in Settings &gt; Account, or request deletion by email. See the <Link href="/data-deletion">Data Deletion page</Link> for steps and information about shared workspace data.</p>
        </section>

        <section id="your-rights">
          <h2><span className="legal-section-index">12</span><span>Your rights</span></h2>
          <p>You may ask to access, correct, delete, restrict, or receive your personal information, withdraw consent, or object to certain processing by emailing our privacy contact. We aim to respond within 30 days.</p>
          <p><strong>TODO — GDPR/UK:</strong> Confirm whether GDPR or UK GDPR applies and add any required representative, legal basis, supervisory-authority, and rights details.</p>
          <p><strong>TODO — CCPA:</strong> Confirm whether the CCPA/CPRA applies and add applicable California rights and request instructions.</p>
          <p><strong>TODO:</strong> Confirm the privacy email address. The existing site lists utsappcreate@gmail.com; do not replace it with a placeholder address until the dedicated contact is confirmed.</p>
        </section>

        <section id="cookies">
          <h2><span className="legal-section-index">13</span><span>Cookies and similar technologies</span></h2>
          <p>The Service uses cookies and similar technologies needed for sign-in, security, and site preferences. <strong>TODO:</strong> Confirm the complete cookie inventory, purposes, lifetimes, and consent requirements.</p>
        </section>

        <section id="children">
          <h2><span className="legal-section-index">14</span><span>Children</span></h2>
          <p>The Service is not for anyone under 18. We do not knowingly collect personal information from children.</p>
        </section>

        <section id="international-transfers">
          <h2><span className="legal-section-index">15</span><span>International transfers</span></h2>
          <p><strong>TODO:</strong> Confirm whether information is processed worldwide or only in India, name the relevant regions, and describe safeguards for international transfers.</p>
        </section>

        <section id="changes">
          <h2><span className="legal-section-index">16</span><span>Changes</span></h2>
          <p>We will update this policy when our practices change, update the Effective Date, and notify users of material changes.</p>
        </section>

        <section id="contact">
          <h2><span className="legal-section-index">17</span><span>Contact</span></h2>
          <p>United Technologies Solutions, 36, Balaji Nagar 2nd Street, Royapettah, Chennai - 600014, Tamil Nadu, India.</p>
          <p>Email: <a href="mailto:utsappcreate@gmail.com">utsappcreate@gmail.com</a></p>
          <p><strong>TODO:</strong> Confirm the exact registered legal name, current mailing address, and privacy contact email before publication.</p>
        </section>
      </article>
    </MarketingPage>
  );
}

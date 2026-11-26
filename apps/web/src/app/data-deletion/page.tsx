import type { Metadata } from "next";
import { MarketingPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Data Deletion",
  description: "How to delete your account and data.",
  robots: { index: true, follow: true },
};

const legalSections = [
  { id: "what-we-store", label: "01 What we store" },
  { id: "dashboard-deletion", label: "02 Delete from your dashboard" },
  { id: "email-deletion", label: "03 Request deletion by email" },
  { id: "platform-removal", label: "04 If you remove our app on Instagram or Facebook" },
  { id: "retained-data", label: "05 What we may keep" },
  { id: "contact", label: "06 Contact" },
];

export default function DataDeletionPage() {
  return (
    <MarketingPage
      legal
      eyebrow="Legal"
      title="Data Deletion"
      description="How to delete your account and data."
      effectiveDate="26 November 2026"
      legalPath="/data-deletion"
      legalSections={legalSections}
    >
      <article className="public-legal-document">
        <section id="what-we-store"><h2><span className="legal-section-index">01</span><span>What we store</span></h2>
          <p>We store your account details, the Instagram and Facebook accounts you connected (IDs, usernames, encrypted access tokens), and the content you created in the Service.</p>
        </section>

        <section id="dashboard-deletion"><h2><span className="legal-section-index">02</span><span>Delete from your dashboard</span></h2>
          <p>Log in, go to Settings, and choose Delete Account. Your account, connected account data, access tokens and content are deleted.</p>
        </section>

        <section id="email-deletion"><h2><span className="legal-section-index">03</span><span>Request deletion by email</span></h2>
          <p>Email <a href="mailto:utsappcreate@gmail.com?subject=Data%20Deletion%20Request">utsappcreate@gmail.com</a> from your registered email address with the subject &quot;Data Deletion Request&quot;. Include your account email and the Instagram or Facebook username(s) you connected. We will verify your request, delete your data within 30 days, and confirm by email.</p>
        </section>

        <section id="platform-removal"><h2><span className="legal-section-index">04</span><span>If you remove our app on Instagram or Facebook</span></h2>
          <p>Removing the app in Instagram (Settings &gt; Apps and websites) or Facebook (Settings &gt; Apps and Websites) immediately stops our access to that account. To also delete the data we hold, use option 02 or 03.</p>
        </section>

        <section id="retained-data"><h2><span className="legal-section-index">05</span><span>What we may keep</span></h2>
          <p>Records we must keep for legal, tax or billing reasons, and backups until they expire. These are not used for any other purpose.</p>
        </section>

        <section id="contact"><h2><span className="legal-section-index">06</span><span>Contact</span></h2>
          <p>United Technologies Solutions, Chennai, India. Email: <a href="mailto:utsappcreate@gmail.com">utsappcreate@gmail.com</a></p>
        </section>
      </article>
    </MarketingPage>
  );
}

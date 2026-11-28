import type { Metadata } from "next";
import { MarketingPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Data Deletion",
  description: "How to disconnect social accounts and request deletion of data held by Social Media Marketing.",
  alternates: { canonical: "https://smai.unitdtechnologies.com/data-deletion" },
  robots: { index: true, follow: true },
};

const legalSections = [
  { id: "overview", label: "01 Overview" },
  { id: "dashboard", label: "02 Delete from the dashboard" },
  { id: "email-request", label: "03 Request deletion by email" },
  { id: "remove-app", label: "04 Remove our app in platform settings" },
  { id: "deleted-data", label: "05 What is deleted and when" },
  { id: "retained-data", label: "06 What may be retained" },
  { id: "contact", label: "07 Contact" },
];

export default function DataDeletionPage() {
  return (
    <MarketingPage
      legal
      eyebrow="Legal"
      title="Data Deletion"
      description="How to disconnect social accounts and request deletion of data held by Social Media Marketing."
      effectiveDate="26 November 2026"
      legalPath="/data-deletion"
      legalSections={legalSections}
    >
      <article className="public-legal-document">
        <section id="overview">
          <h2><span className="legal-section-index">01</span><span>Overview</span></h2>
          <p>Social Media Marketing may store account IDs, usernames, profile names and pictures, Facebook Pages and Instagram business accounts, encrypted OAuth tokens, posts and media you create, comments and messages where you grant permission, analytics metrics, account email, and usage logs.</p>
        </section>

        <section id="dashboard">
          <h2><span className="legal-section-index">02</span><span>Option 1: Delete from the dashboard</span></h2>
          <ol>
            <li>To disconnect a social account, open Dashboard &gt; Social Accounts and choose Disconnect. This clears the stored access token and disconnects the account. Workspace posts and media are not deleted by disconnecting.</li>
            <li>To delete your sign-in account, open Settings &gt; Account and choose Delete account. Account deletion does not automatically delete shared workspace content; contact us if you need that content reviewed for deletion.</li>
          </ol>
        </section>

        <section id="email-request">
          <h2><span className="legal-section-index">03</span><span>Option 2: Request deletion by email</span></h2>
          <p>Email the privacy contact with the subject <strong>Data Deletion Request</strong>, from the email address registered to your account. Include your account email and the connected account username(s) or workspace data you want deleted. We will verify the request and confirm by email. We aim to respond within 30 days.</p>
          <p><strong>TODO:</strong> Confirm the dedicated privacy contact email. The existing site lists <a href="mailto:utsappcreate@gmail.com">utsappcreate@gmail.com</a>; use it only if it is approved for privacy requests.</p>
        </section>

        <section id="remove-app">
          <h2><span className="legal-section-index">04</span><span>Option 3: Remove our app in platform settings</span></h2>
          <p>You can remove or revoke the app in the platform&apos;s settings. For Instagram, use Settings &gt; Apps and websites. For Facebook, use Settings &gt; Apps and Websites. When Meta sends a valid deauthorization or data-deletion callback, the Service removes matched connected-account records and associated platform data. If the callback does not complete, also use Option 1 or Option 2.</p>
          <p>A completed Meta data-deletion callback provides a confirmation code and a public <a href="/data-deletion/status">deletion status page</a>. A valid code is needed to view its status.</p>
        </section>

        <section id="deleted-data">
          <h2><span className="legal-section-index">05</span><span>What is deleted and when</span></h2>
          <p>When a Meta callback is successfully processed, the Service deletes the matched account connection and stored tokens, clears linked publishing identifiers, cancels queued publishing jobs for that account, and deletes associated inbox items, comments, and analytics records. The callback completes this processing before returning a successful response.</p>
          <p>Disconnecting in the dashboard clears the token and marks the connection disconnected, but leaves the connection record in the workspace. Deleting your sign-in account also does not delete shared workspace posts or media.</p>
          <p><strong>TODO:</strong> Confirm the timeframe for email deletion requests and the deletion/retention periods for logs, backups, and billing or legal records.</p>
        </section>

        <section id="retained-data">
          <h2><span className="legal-section-index">06</span><span>What may be retained and why</span></h2>
          <p>Posts and media created in a shared workspace may remain available to other workspace members after an account is disconnected or deleted. Records needed for legal, tax, billing, or fraud-prevention purposes, and backups until they expire, may also remain where permitted by law.</p>
          <p><strong>TODO:</strong> Confirm the exact retention periods and whether any other categories are retained.</p>
        </section>

        <section id="contact">
          <h2><span className="legal-section-index">07</span><span>Contact</span></h2>
          <p>United Technologies Solutions, 36, Balaji Nagar 2nd Street, Royapettah, Chennai - 600014, Tamil Nadu, India.</p>
          <p>Email: <a href="mailto:utsappcreate@gmail.com">utsappcreate@gmail.com</a></p>
          <p><strong>TODO:</strong> Confirm the exact registered legal name, current mailing address, and privacy contact email.</p>
        </section>
      </article>
    </MarketingPage>
  );
}

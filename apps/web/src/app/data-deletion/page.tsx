import type { Metadata } from "next";
import { MarketingPage } from "@/components/public-site";

export const metadata: Metadata = {
  title: "Data Deletion",
  description: "How to delete your account and data.",
  robots: { index: true, follow: true },
};

const legalSections = [
  { id: "account-deletion", label: "01 Delete your account" },
  { id: "workspace-data", label: "02 Workspace data" },
  { id: "before-deleting", label: "03 Before you delete" },
  { id: "disconnect-social", label: "04 Disconnect a social account" },
  { id: "platform-access", label: "05 Remove our app on Instagram or Facebook" },
  { id: "email-request", label: "06 Ask about workspace-data deletion" },
  { id: "retained-data", label: "07 Data that may remain" },
  { id: "contact", label: "08 Contact" },
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
        <section id="account-deletion"><h2><span className="legal-section-index">01</span><span>Delete your account</span></h2>
          <p>In Settings, open Account settings and choose Delete account. You must enter your current password and type DELETE to confirm.</p>
          <p>When deletion succeeds, we delete your sign-in account, workspace memberships, notifications and active refresh tokens. The account deletion process does not delete workspace data.</p>
        </section>

        <section id="workspace-data"><h2><span className="legal-section-index">02</span><span>Workspace data</span></h2>
          <p>Deleting your sign-in account does not delete workspaces or their data. Connected social-account records and access tokens, posts, and media remain in the workspace for its other members. Media files remain in the workspace, although their personal owner assignment is cleared when your account is deleted.</p>
        </section>

        <section id="before-deleting"><h2><span className="legal-section-index">03</span><span>Before you delete</span></h2>
          <p>Every workspace you own must have another owner before you can delete your account. Transfer ownership in Team settings or add another owner first. If you own a reseller organization, contact support to transfer that ownership before deleting your account.</p>
        </section>

        <section id="disconnect-social"><h2><span className="legal-section-index">04</span><span>Disconnect a social account</span></h2>
          <p>In the dashboard, open Social Accounts, choose the connected Instagram account or Facebook Page, and select Disconnect. This marks the connection as disconnected and clears the access token stored by the Service. The social-account record remains in the workspace, and this action does not delete workspace posts or media.</p>
        </section>

        <section id="platform-access"><h2><span className="legal-section-index">05</span><span>Remove our app on Instagram or Facebook</span></h2>
          <p>You can also remove the app in Instagram (Settings &gt; Apps and websites) or Facebook (Settings &gt; Apps and Websites) to revoke its platform authorization. To clear the access token stored by the Service, use the Disconnect action described above. Removing the app does not delete workspace data.</p>
        </section>

        <section id="email-request"><h2><span className="legal-section-index">06</span><span>Ask about workspace-data deletion</span></h2>
          <p>Account deletion does not remove workspace content or connected social-account records. To ask about deletion of data retained in a workspace, email <a href="mailto:utsappcreate@gmail.com?subject=Data%20Deletion%20Request">utsappcreate@gmail.com</a> from your registered email address. Include your account email, workspace name, and the social accounts or content involved. Email requests are separate from the self-service account deletion flow.</p>
        </section>

        <section id="retained-data"><h2><span className="legal-section-index">07</span><span>Data that may remain</span></h2>
          <p>Workspace data remains available to its members after your sign-in account is deleted. Records we must keep for legal, tax or billing reasons, and backups until they expire, may also remain. These records are not used for any other purpose.</p>
        </section>

        <section id="contact"><h2><span className="legal-section-index">08</span><span>Contact</span></h2>
          <p>United Technologies Solutions, Chennai, India. Email: <a href="mailto:utsappcreate@gmail.com">utsappcreate@gmail.com</a></p>
        </section>
      </article>
    </MarketingPage>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/components/platform-icon";
import { apiRequest } from "@/lib/api";

const platforms = [
  "Instagram", "Facebook Pages", "YouTube", "TikTok", "X", "LinkedIn",
  "Pinterest", "Threads", "Reddit", "Telegram", "Tumblr", "Google Business Profile",
  "ShareChat", "Moj",
];

type ConnectedAccount = {
  id: string;
  provider: "instagram" | "facebook";
  displayName: string;
  status: string;
  tokenExpiresAt: string | null;
};

type SocialAccountsResponse = {
  accounts: ConnectedAccount[];
  instagramConfigured: boolean;
  facebookConfigured: boolean;
  instagramRedirectUri: string | null;
  facebookRedirectUri: string | null;
  mediaPublishingConfigured: boolean;
  mediaPublishingMessage: string;
};

type SocialAccountsClientProps = { detailPlatform?: "Instagram" | "Facebook Pages" };

export function SocialAccountsClient({ detailPlatform }: SocialAccountsClientProps) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [instagramConfigured, setInstagramConfigured] = useState(false);
  const [facebookConfigured, setFacebookConfigured] = useState(false);
  const [instagramRedirectUri, setInstagramRedirectUri] = useState("");
  const [facebookRedirectUri, setFacebookRedirectUri] = useState("");
  const [mediaPublishingConfigured, setMediaPublishingConfigured] = useState(false);
  const [mediaPublishingMessage, setMediaPublishingMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAccounts = useCallback(async () => {
    try {
      const response = await apiRequest<SocialAccountsResponse>("/api/social-accounts");
      setAccounts(response.accounts);
      setInstagramConfigured(response.instagramConfigured);
      setFacebookConfigured(response.facebookConfigured);
      setInstagramRedirectUri(response.instagramRedirectUri ?? "");
      setFacebookRedirectUri(response.facebookRedirectUri ?? "");
      setMediaPublishingConfigured(response.mediaPublishingConfigured);
      setMediaPublishingMessage(response.mediaPublishingMessage);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load connected accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccounts();
      const params = new URLSearchParams(window.location.search);
      const instagramResult = params.get("instagram");
      const facebookResult = params.get("facebook");
      const result = instagramResult ? { platform: "Instagram", status: instagramResult } :
        facebookResult ? { platform: "Facebook", status: facebookResult } : null;
      if (result?.status === "connected") setNotice(`${result.platform} ${result.platform === "Facebook" ? "Pages" : "account"} connected.`);
      if (result?.status === "cancelled") setNotice(`${result.platform} connection was cancelled.`);
      if (result?.status === "failed") setError(`${result.platform} could not be connected. Check the Meta app settings and try again.`);
      if (result) window.history.replaceState({}, "", window.location.pathname);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAccounts]);

  useEffect(() => {
    function refreshVisibleWorkspace() {
      if (document.visibilityState === "visible") void loadAccounts();
    }
    window.addEventListener("focus", refreshVisibleWorkspace);
    document.addEventListener("visibilitychange", refreshVisibleWorkspace);
    return () => {
      window.removeEventListener("focus", refreshVisibleWorkspace);
      document.removeEventListener("visibilitychange", refreshVisibleWorkspace);
    };
  }, [loadAccounts]);

  const connectedInstagram = accounts.find((account) => account.provider === "instagram" && account.status === "CONNECTED");
  const connectedFacebookPages = accounts.filter((account) => account.provider === "facebook" && account.status === "CONNECTED");

  if (detailPlatform === "Instagram" || detailPlatform === "Facebook Pages") {
    const isFacebook = detailPlatform === "Facebook Pages";
    const providerConfigured = isFacebook ? facebookConfigured : instagramConfigured;
    const connectedAccounts = isFacebook ? connectedFacebookPages : connectedInstagram ? [connectedInstagram] : [];
    return (
      <section className="dashboard-content social-accounts-page">
        <Link className="social-account-back" href="/dashboard/social-accounts">← All social accounts</Link>
        <div className="social-account-detail-heading">
          <PlatformIcon platform={detailPlatform} />
          <div>
            <p className="eyebrow">ACCOUNT CONNECTION</p>
            <h1>{isFacebook ? "Connect Facebook Pages" : "Connect Instagram"}</h1>
          </div>
        </div>
        <p className="dashboard-lead">{isFacebook
          ? "Connect every Facebook Page your account manages to this workspace. Access is shared only with workspace members. Sign in securely with Facebook and approve Page-list access there. This setup only saves and displays Page connections; publishing and insights are not included."
          : "Link one Instagram Professional account to this workspace. Everyone in the workspace, including your other browser tabs, shares this connection. Connect it once; you’ll sign in securely on Instagram and approve access there. United Technologies never asks for or stores your Instagram password."}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}

        {loading ? (
          <p className="loading-label">Checking {isFacebook ? "Facebook Pages" : "Instagram"} connection…</p>
        ) : connectedAccounts.length ? (
          <div className="social-account-detail-list">
            {connectedAccounts.map((account) => (
              <article className="social-account-detail-card" key={account.id}>
                <p className="social-provider-status is-connected">{isFacebook ? "Connected Page" : "Workspace account"}: {account.displayName}</p>
                <p>This connection is shared with other members of this workspace.</p>
                {account.tokenExpiresAt && <p>Access may need renewal after {new Date(account.tokenExpiresAt).toLocaleDateString()}.</p>}
                <div className="oauth-callback-help"><strong>Meta OAuth callback URL</strong><p>Register this exact URL in Meta before reconnecting:</p><code>{isFacebook ? facebookRedirectUri : instagramRedirectUri}</code></div>
                {!isFacebook && <button className="social-provider-action" type="button" disabled={busy} onClick={() => void connectAccount("instagram")}>
                  {busy ? "Opening Instagram…" : "Reconnect to enable listening"}
                </button>}
                <button className="social-provider-action" type="button" disabled={busy} onClick={() => void disconnectAccount(account)}>
                  {busy ? "Disconnecting…" : "Disconnect"}
                </button>
              </article>
            ))}
            {isFacebook && <button className="button button-gold" type="button" disabled={busy} onClick={() => void connectAccount("facebook")}>
              {busy ? "Opening Facebook…" : "Connect or refresh Pages"}
            </button>}
          </div>
        ) : (
          <article className="social-account-detail-card">
            <h2>{providerConfigured ? "Ready to connect" : `${isFacebook ? "Facebook" : "Instagram"} setup is not complete`}</h2>
            {providerConfigured ? (
              <>
                <p>{isFacebook
                  ? "Continue to Facebook to review and authorize every Page available to your account."
                  : <>Select <strong>Continue to Instagram</strong> to open Instagram’s secure authorization page. Log in there with the Professional account you want to connect, then approve the requested permissions.</>}</p>
                <div className="oauth-callback-help">
                  <strong>Meta OAuth callback URL</strong>
                  <p>Add this exact URL to your Meta app’s redirect URI allowlist:</p>
                  <code>{isFacebook ? facebookRedirectUri : instagramRedirectUri}</code>
                </div>
                <button className="button button-gold" type="button" disabled={busy} onClick={() => void connectAccount(isFacebook ? "facebook" : "instagram")}>
                  {busy ? `Opening ${isFacebook ? "Facebook" : "Instagram"}…` : `Continue to ${isFacebook ? "Facebook" : "Instagram"}`}
                </button>
              </>
            ) : (
              <p>The workspace owner must first configure the Meta app ID, app secret, the matching OAuth callback URL, and token encryption key on the API server. Never enter a Facebook or Instagram password into this tool.</p>
            )}
            {!isFacebook && <ol className="social-account-steps">
              <li>Use an Instagram Professional account (Business or Creator).</li>
              <li>If the Meta app is in Development mode, add this Instagram account as a tester and accept the invitation.</li>
              <li>Approve comment and insights access to use Listening for post comments, views, and reach.</li>
              <li>Reconnect an existing account if it was connected before Listening permissions were added.</li>
            </ol>}
          </article>
        )}

        {!isFacebook && <div className="social-account-capabilities">
          <h2>What you can publish</h2>
          <p>Publish image posts, carousels, and Reels to a connected Instagram Professional account. Instagram must be able to fetch each image or video from this API over public HTTPS.</p>
          {!mediaPublishingConfigured && <p className="demo-banner" role="alert">Instagram publishing is blocked: {mediaPublishingMessage || "Checking whether the API media URL is reachable."}</p>}
          <p>Other listed channels are not connected for live publishing yet.</p>
        </div>}
      </section>
    );
  }

  async function connectAccount(provider: "instagram" | "facebook") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ authorizationUrl: string }>(`/api/social-accounts/${provider}/connect`, {
        method: "POST",
      });
      window.location.assign(response.authorizationUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Could not start ${provider} connection.`);
      setBusy(false);
    }
  }

  async function disconnectAccount(account: ConnectedAccount) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/social-accounts/${encodeURIComponent(account.id)}`, { method: "DELETE" });
      setNotice(`${account.provider === "facebook" ? "Facebook Page" : "Instagram account"} disconnected.`);
      await loadAccounts();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not disconnect social account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-content social-accounts-page">
      <p className="eyebrow">YOUR STUDIO · PUBLISH</p>
      <h1>Social Accounts</h1>
      <p className="dashboard-lead">Connect and manage the channels for this workspace.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      <div className="social-provider-grid">
        {platforms.map((platform) => (
          platform === "Instagram" ? (
            <Link className="social-provider-card social-provider-card-link" href="/dashboard/social-accounts/instagram" key={platform}>
              <PlatformIcon platform={platform} />
              <div>
                <h2>{platform}</h2>
                {connectedInstagram
                  ? <p className="social-provider-status is-connected">Connected as {connectedInstagram.displayName}</p>
                  : <p className="social-provider-status">{loading ? "Checking connection…" : "Not connected"}</p>}
              </div>
              <span className="social-provider-state">Open setup →</span>
            </Link>
          ) : platform === "Facebook Pages" ? (
            <Link className="social-provider-card social-provider-card-link" href="/dashboard/social-accounts/facebook" key={platform}>
              <PlatformIcon platform={platform} />
              <div>
                <h2>{platform}</h2>
                {connectedFacebookPages.length
                  ? <p className="social-provider-status is-connected">{connectedFacebookPages.length} Page{connectedFacebookPages.length === 1 ? "" : "s"} connected</p>
                  : <p className="social-provider-status">{loading ? "Checking connection…" : "Not connected"}</p>}
              </div>
              <span className="social-provider-state">Open setup →</span>
            </Link>
          ) : (
            <article className="social-provider-card" key={platform}>
              <PlatformIcon platform={platform} />
              <div>
                <h2>{platform}</h2>
                <p className="social-provider-status">Integration coming soon</p>
              </div>
              <span className="social-provider-state">Coming soon</span>
            </article>
          )
        ))}
      </div>
      {!instagramConfigured && <p className="demo-banner" role="note">To enable Instagram, set the Meta app ID and secret, OAuth callback URL, and token encryption key in the API environment. Use a public HTTPS API URL for live image publishing.</p>}
      {instagramConfigured && !mediaPublishingConfigured && <p className="demo-banner" role="alert">Instagram is connected, but publishing is blocked: {mediaPublishingMessage || "The API media URL is not reachable."}</p>}
      {instagramConfigured && mediaPublishingConfigured && <p className="demo-banner" role="note">{mediaPublishingMessage} Facebook Page text and image publishing is available after connecting a Page with the required Meta permissions. Facebook Page insights are not enabled.</p>}
    </section>
  );
}

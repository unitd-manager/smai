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
  displayName: string;
  status: string;
  tokenExpiresAt: string | null;
};

type SocialAccountsResponse = {
  accounts: ConnectedAccount[];
  instagramConfigured: boolean;
  mediaPublishingConfigured: boolean;
  mediaPublishingMessage: string;
};

type SocialAccountsClientProps = { detailPlatform?: "Instagram" };

export function SocialAccountsClient({ detailPlatform }: SocialAccountsClientProps) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [instagramConfigured, setInstagramConfigured] = useState(false);
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
      const result = new URLSearchParams(window.location.search).get("instagram");
      if (result === "connected") setNotice("Instagram account connected.");
      if (result === "cancelled") setNotice("Instagram connection was cancelled.");
      if (result === "failed") setError("Instagram could not be connected. Check the Meta app settings and try again.");
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

  const connectedInstagram = accounts.find((account) => account.status === "CONNECTED");

  if (detailPlatform === "Instagram") {
    return (
      <section className="dashboard-content social-accounts-page">
        <Link className="social-account-back" href="/dashboard/social-accounts">← All social accounts</Link>
        <div className="social-account-detail-heading">
          <PlatformIcon platform="Instagram" />
          <div>
            <p className="eyebrow">ACCOUNT CONNECTION</p>
            <h1>Connect Instagram</h1>
          </div>
        </div>
        <p className="dashboard-lead">Link one Instagram Professional account to this workspace. Everyone in the workspace, including your other browser tabs, shares this connection. Connect it once; you’ll sign in securely on Instagram and approve access there. United Technologies never asks for or stores your Instagram password.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}

        {loading ? (
          <p className="loading-label">Checking Instagram connection…</p>
        ) : connectedInstagram ? (
          <article className="social-account-detail-card">
            <p className="social-provider-status is-connected">Workspace account: {connectedInstagram.displayName}</p>
            <p>This connection is shared with other members and browser tabs in this workspace.</p>
            {connectedInstagram.tokenExpiresAt && <p>Access may need renewal after {new Date(connectedInstagram.tokenExpiresAt).toLocaleDateString()}.</p>}
            <button className="social-provider-action" type="button" disabled={busy} onClick={() => void disconnectInstagram(connectedInstagram)}>
              {busy ? "Disconnecting…" : "Disconnect account"}
            </button>
          </article>
        ) : (
          <article className="social-account-detail-card">
            <h2>{instagramConfigured ? "Ready to connect" : "Instagram setup is not complete"}</h2>
            {instagramConfigured ? (
              <>
                <p>Select <strong>Continue to Instagram</strong> to open Instagram’s secure authorization page. Log in there with the Professional account you want to connect, then approve the requested permissions.</p>
                <button className="button button-gold" type="button" disabled={busy} onClick={() => void connectInstagram()}>
                  {busy ? "Opening Instagram…" : "Continue to Instagram"}
                </button>
              </>
            ) : (
              <p>The workspace owner must first configure the Meta app ID, app secret, OAuth callback URL, and token encryption key on the API server. No Instagram password should be entered into this tool.</p>
            )}
            <ol className="social-account-steps">
              <li>Use an Instagram Professional account (Business or Creator).</li>
              <li>If the Meta app is in Development mode, add this Instagram account as a tester and accept the invitation.</li>
              <li>After connecting, create an image post, select Instagram, and schedule it for a future time.</li>
            </ol>
          </article>
        )}

        <div className="social-account-capabilities">
          <h2>What you can publish</h2>
          <p>Publish image posts, carousels, and Reels to a connected Instagram Professional account. Instagram must be able to fetch each image or video from this API over public HTTPS.</p>
          {!mediaPublishingConfigured && <p className="demo-banner" role="alert">Instagram publishing is blocked: {mediaPublishingMessage || "Checking whether the API media URL is reachable."}</p>}
          <p>Other listed channels are not connected for live publishing yet.</p>
        </div>
      </section>
    );
  }

  async function connectInstagram() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ authorizationUrl: string }>("/api/social-accounts/instagram/connect", {
        method: "POST",
      });
      window.location.assign(response.authorizationUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start Instagram connection.");
      setBusy(false);
    }
  }

  async function disconnectInstagram(account: ConnectedAccount) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/social-accounts/${encodeURIComponent(account.id)}`, { method: "DELETE" });
      setNotice("Instagram account disconnected.");
      await loadAccounts();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not disconnect Instagram.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="dashboard-content social-accounts-page">
      <p className="eyebrow">YOUR STUDIO · PUBLISH</p>
      <h1>Social Accounts</h1>
      <p className="dashboard-lead">Connect channels for this workspace. Each customer workspace manages its own social accounts; connections are shared only with members of the selected workspace.</p>
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
      {!instagramConfigured && <p className="demo-banner" role="note">To enable Instagram, set the Meta app ID and secret, OAuth callback URL, and token encryption key in the API environment. Use a public HTTPS API URL for live image publishing. Other listed platforms remain demo-only because their OAuth and publishing integrations are not enabled.</p>}
      {instagramConfigured && !mediaPublishingConfigured && <p className="demo-banner" role="alert">Instagram is connected, but publishing is blocked: {mediaPublishingMessage || "The API media URL is not reachable."}</p>}
      {instagramConfigured && mediaPublishingConfigured && <p className="demo-banner" role="note">{mediaPublishingMessage} Other listed platforms remain demo-only until their platform integrations are configured.</p>}
    </section>
  );
}

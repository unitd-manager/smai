"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type ApprovalEmailSettings = { recipient: string; accountEmail: string; isCustom: boolean };

export function ApprovalEmailSettingsPanel() {
  const [recipient, setRecipient] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [savedRecipient, setSavedRecipient] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<ApprovalEmailSettings>("/api/notification-settings/approval-email")
      .then((settings) => {
        if (!active) return;
        setRecipient(settings.recipient);
        setSavedRecipient(settings.isCustom ? settings.recipient : "");
        setAccountEmail(settings.accountEmail);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load the approval email recipient.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function saveRecipient() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await apiRequest<{ recipient: string | null }>("/api/notification-settings/approval-email", {
        method: "PUT",
        body: JSON.stringify({ recipient: recipient.trim() }),
      });
      const value = saved.recipient ?? accountEmail;
      setRecipient(value);
      setSavedRecipient(value);
      setNotice("Post approval emails will go to this address.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save the approval email recipient.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="approval-email-settings-card" aria-labelledby="approval-email-settings-title">
      <header>
        <p className="eyebrow">EMAIL NOTIFICATIONS</p>
        <h3 id="approval-email-settings-title">Post approval email</h3>
        <p>Choose where scheduled post reviews and reminders should be sent. By default, this is your sign-in email.</p>
      </header>
      {error && <p className="theme-settings-message error" role="alert">{error}</p>}
      {notice && <p className="theme-settings-message success" role="status">{notice}</p>}
      <div className="approval-email-settings-controls">
        <label htmlFor="approval-email-recipient">Notification email address</label>
        <input
          id="approval-email-recipient"
          type="email"
          autoComplete="email"
          placeholder="approvals@yourcompany.com"
          maxLength={320}
          value={recipient}
          disabled={loading || saving}
          onChange={(event) => { setRecipient(event.target.value); setNotice(""); }}
        />
        {accountEmail && recipient !== accountEmail && (
          <button type="button" className="button button-outline" disabled={loading || saving} onClick={() => { setRecipient(accountEmail); setNotice(""); }}>
            Use my sign-in email
          </button>
        )}
        <button
          type="button"
          className="button button-gold"
          disabled={loading || saving || !recipient.trim() || recipient.trim() === savedRecipient}
          onClick={() => void saveRecipient()}
        >
          {saving ? "Saving…" : "Save email address"}
        </button>
      </div>
      <p className="settings-footnote">The API must also have SMTP or Resend credentials to deliver email. Changing this address does not change your sign-in email.</p>
    </section>
  );
}

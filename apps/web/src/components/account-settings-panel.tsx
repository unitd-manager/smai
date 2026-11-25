"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";

type AccountResponse = {
  user: { name: string; email: string };
};

export function AccountSettingsPanel() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountResponse["user"] | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<AccountResponse>("/api/auth/me")
      .then(({ user }) => {
        if (active) setAccount(user);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load account details.");
      });
    return () => { active = false; };
  }, []);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (newPassword !== confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 12 || new TextEncoder().encode(newPassword).length > 72) {
      setError("Use a new password with at least 12 characters and no more than 72 UTF-8 bytes.");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password changed. Other active refresh sessions have been signed out.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not change your password.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError("");
    setNotice("");
    if (deleteConfirmation !== "DELETE") {
      setDeleteError('Type "DELETE" to confirm account deletion.');
      return;
    }
    setDeleting(true);
    try {
      await apiRequest("/api/auth/account", {
        method: "DELETE",
        body: JSON.stringify({ currentPassword: deletePassword, confirmation: deleteConfirmation }),
      });
      window.localStorage.removeItem("united-technologies.workspaceId");
      window.localStorage.removeItem("united-technologies.brandId");
      router.replace("/login");
    } catch (requestError) {
      setDeleteError(requestError instanceof Error ? requestError.message : "Could not delete this account.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="account-settings-page">
      <header className="account-settings-heading">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h2>Account settings</h2>
        <p className="dashboard-lead">Manage sign-in details for your account.</p>
      </header>
      <div className="account-settings-card">
        {account ? <>
          <div className="account-identity-heading">
            <span className="account-profile-avatar" aria-hidden="true">{account.name.trim().slice(0, 1).toUpperCase() || "U"}</span>
            <div><h3>Account details</h3><p>Your personal sign-in identity</p></div>
          </div>
          <dl>
            <div><dt>Name</dt><dd>{account.name}</dd></div>
            <div><dt>Email</dt><dd>{account.email}</dd></div>
          </dl>
        </> : <><h3>Account details</h3><p className="loading-label">Loading account details…</p></>}
      </div>
      <form className="account-settings-card account-password-form" onSubmit={(event) => void changePassword(event)}>
        <div><h3>Change password</h3><p>Choose at least 12 characters. Changing your password signs out other active sessions.</p></div>
        <label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
        <label>New password<input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
        <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}
        <button className="button button-gold" type="submit" disabled={saving}>{saving ? "Updating password…" : "Update password"}</button>
      </form>
      <form className="account-settings-card account-danger-card" onSubmit={(event) => void deleteAccount(event)}>
        <div><h3>Delete account</h3><p>This permanently removes your sign-in and workspace memberships. Workspace data is retained, but each workspace must have another owner. Transfer ownership first in Team settings. Accounts that own reseller organizations must contact support to transfer that ownership.</p></div>
        <label>Current password<input type="password" autoComplete="current-password" required value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} /></label>
        <label>Type DELETE to confirm<input type="text" autoComplete="off" required value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} /></label>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
        <button className="button button-outline" type="submit" disabled={deleting}>{deleting ? "Deleting account…" : "Delete account permanently"}</button>
      </form>
    </section>
  );
}

"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";

type InviteDetails = {
  email: string;
  role: "ADMIN" | "EDITOR" | "CONTRIBUTOR" | "VIEWER";
  workspaceName: string;
  expiresAt: string;
};
type AuthMode = "login" | "signup";

export function InviteLandingClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("united-technologies.theme");
    document.documentElement.dataset.appTheme = savedTheme === "dark" ? "dark" : "light";
  }, []);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const requestTimeout = AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]);
    const timer = window.setTimeout(() => {
      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) {
        setError("This invitation link is missing its token. Ask the workspace owner for a new link.");
        setLoading(false);
        return;
      }
      window.sessionStorage.setItem("united-technologies.pendingInvite", token);
      void (async () => {
        try {
          const inviteResult = await apiRequest<{ invite: InviteDetails }>(
            `/api/auth/invite/${encodeURIComponent(token)}`,
            { signal: requestTimeout },
          );
          if (disposed) return;
          setInvite(inviteResult.invite);
          setEmail(inviteResult.invite.email);
          try {
            await apiRequest("/api/auth/me", { signal: requestTimeout });
          } catch (requestError) {
            if (requestError instanceof ApiError && requestError.status === 401) {
              if (!disposed) setNeedsSignIn(true);
              return;
            }
            throw requestError;
          }
          if (disposed) return;
          let result: { workspace: { id: string } };
          try {
            result = await apiRequest<{ workspace: { id: string } }>("/api/auth/accept-invite", {
              method: "POST",
              body: JSON.stringify({ token }),
              signal: requestTimeout,
            });
          } catch (requestError) {
            if (requestError instanceof ApiError && requestError.status === 403) {
              setError(requestError.message);
              setNeedsSignIn(true);
              return;
            }
            throw requestError;
          }
          if (disposed) return;
          window.localStorage.setItem("united-technologies.workspaceId", result.workspace.id);
          window.sessionStorage.removeItem("united-technologies.pendingInvite");
          router.replace("/dashboard");
        } catch (requestError: unknown) {
          if (disposed) return;
          if (requestError instanceof DOMException && requestError.name === "TimeoutError") {
            setError("We couldn't verify the invitation because the service took too long to respond. Check your connection and try again.");
          } else {
            setError(requestError instanceof Error ? requestError.message : "Could not verify this invitation.");
          }
        } finally {
          if (!disposed) setLoading(false);
        }
      })();
    }, 0);

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [router]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invite || submitting) return;
    setSubmitting(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    try {
      let result: { workspace: { id: string } };
      if (authMode === "signup") {
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) throw new Error("This invitation link is missing its token. Ask the workspace owner for a new link.");
        result = await apiRequest<{ workspace: { id: string } }>("/api/auth/signup-invite", {
          method: "POST",
          body: JSON.stringify({
            token,
            name: String(formData.get("name") ?? ""),
            email: submittedEmail,
            password,
          }),
        });
      } else {
        await apiRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: submittedEmail, password }),
        });
        const token = new URLSearchParams(window.location.search).get("token");
        if (!token) throw new Error("This invitation link is missing its token. Ask the workspace owner for a new link.");
        result = await apiRequest<{ workspace: { id: string } }>("/api/auth/accept-invite", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
      }
      window.localStorage.setItem("united-technologies.workspaceId", result.workspace.id);
      window.sessionStorage.removeItem("united-technologies.pendingInvite");
      router.replace("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not join this workspace.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page invite-auth-page">
      <section className="auth-panel invite-landing-card">
        <p className="eyebrow">WORKSPACE INVITATION</p>
        <h1>Join your team</h1>
        {loading ? (
          <p className="invite-checking" role="status"><span className="invite-checking-spinner" aria-hidden="true" />Verifying your invitation…</p>
        ) : needsSignIn && invite ? (
          <>
            <p className="auth-intro">
              Join <strong>{invite.workspaceName}</strong> as a <strong>{invite.role.toLowerCase()}</strong>.
              Use the invited email address to access the workspace with this role.
            </p>
            <div className="invite-auth-tabs" aria-label="Choose account option">
              <button type="button" className={authMode === "login" ? "is-active" : ""} aria-pressed={authMode === "login"} onClick={() => { setAuthMode("login"); setError(""); }}>Sign in</button>
              <button type="button" className={authMode === "signup" ? "is-active" : ""} aria-pressed={authMode === "signup"} onClick={() => { setAuthMode("signup"); setError(""); }}>Create account</button>
            </div>
            <form className="auth-form" onSubmit={(event) => void submitAuth(event)} aria-busy={submitting ? "true" : undefined}>
              {authMode === "signup" && (
                <label>
                  Full name
                  <input name="name" autoComplete="name" required minLength={2} maxLength={100} />
                </label>
              )}
              <label>
                Invited email
                <input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label>
                Password
                <input name="password" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} required minLength={authMode === "signup" ? 12 : 1} maxLength={128} />
                {authMode === "signup" && <small>Use at least 12 characters.</small>}
              </label>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button button-primary button-full" type="submit" disabled={submitting}>
                {submitting ? "Joining workspace…" : authMode === "signup" ? "Create account and join" : "Sign in and accept invitation"}
              </button>
            </form>
          </>
        ) : error ? (
          <p className="form-error" role="alert">{error}</p>
        ) : (
          <p>Opening your workspace…</p>
        )}
      </section>
    </main>
  );
}

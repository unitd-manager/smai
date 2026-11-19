"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api";

export function InviteLandingClient() {
  const router = useRouter();
  const started = useRef(false);
  const [loading, setLoading] = useState(true);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("united-technologies.theme");
    document.documentElement.dataset.appTheme = savedTheme === "dark" ? "dark" : "light";
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const timer = window.setTimeout(() => {
      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) {
        setError("This invitation link is missing its token. Ask the workspace owner for a new link.");
        setLoading(false);
        return;
      }
      window.sessionStorage.setItem("united-technologies.pendingInvite", token);
      const requestTimeout = AbortSignal.timeout(20_000);
      apiRequest("/api/auth/me", { signal: requestTimeout })
        .then(async () => {
          const result = await apiRequest<{ workspace: { id: string }; role: string }>("/api/auth/accept-invite", {
            method: "POST",
            body: JSON.stringify({ token }),
            signal: requestTimeout,
          });
          window.localStorage.setItem("united-technologies.workspaceId", result.workspace.id);
          window.sessionStorage.removeItem("united-technologies.pendingInvite");
          router.replace("/dashboard/team");
        })
        .catch((requestError: unknown) => {
          if (requestError instanceof ApiError && requestError.status === 401) {
            setNeedsSignIn(true);
          } else if (requestError instanceof DOMException && requestError.name === "TimeoutError") {
            setError("We couldn't verify the invitation because the service took too long to respond. Check your connection and try again.");
          } else {
            setError(requestError instanceof Error ? requestError.message : "Could not accept this invitation.");
          }
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="auth-page invite-auth-page">
      <section className="auth-panel invite-landing-card">
        <p className="eyebrow">WORKSPACE INVITATION</p>
        <h1>Join your team</h1>
        {loading ? <p className="invite-checking" role="status"><span className="invite-checking-spinner" aria-hidden="true" />Verifying your invite and checking your sign-in…</p> : needsSignIn ? (
          <>
            <p>Sign in using the email address that received this invitation. We will keep the invitation link ready while you sign in.</p>
            <Link className="button button-primary" href="/login">Sign in to accept</Link>
          </>
        ) : error ? <p className="form-error" role="alert">{error}</p> : (
          <p>Opening your workspace…</p>
        )}
      </section>
    </main>
  );
}

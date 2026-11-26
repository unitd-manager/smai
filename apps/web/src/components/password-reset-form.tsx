"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";

type PasswordResetFormProps = { mode: "request" } | { mode: "reset"; token: string | null };

export function PasswordResetForm(props: PasswordResetFormProps) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmPassword") ?? "");

    if (props.mode === "reset" && password !== confirmation) {
      setError("The new password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (props.mode === "request") {
        const result = await apiRequest<{ message: string }>("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email }),
        });
        setMessage(result.message);
      } else {
        if (!props.token) {
          setError("This reset link is missing its token. Request a new password reset link.");
          return;
        }
        const result = await apiRequest<{ message: string }>("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: props.token, password }),
        });
        setMessage(result.message);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (message && props.mode === "reset") {
    return (
      <div className="auth-form">
        <p className="auth-form-success" role="status">{message}</p>
        <Link className="button button-gold button-full" href="/login">Return to sign in</Link>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={(event) => void handleSubmit(event)} aria-busy={submitting ? "true" : undefined}>
      {props.mode === "request" ? (
        <label>
          Work email
          <input name="email" type="email" autoComplete="email" required maxLength={254} />
        </label>
      ) : (
        <>
          {!props.token && <p className="form-error" role="alert">This reset link is missing its token. Request a new password reset link.</p>}
          <label>
            New password
            <input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} />
          </label>
          <label>
            Confirm new password
            <input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={72} />
          </label>
          <small className="auth-reset-note">Use at least 12 characters. Reset links expire after 30 minutes and can only be used once.</small>
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && props.mode === "request" && <p className="auth-form-success" role="status">{message}</p>}
      <button className="button button-gold button-full" type="submit" disabled={submitting || (props.mode === "reset" && !props.token)}>
        {submitting ? "Please wait..." : props.mode === "request" ? "Email me a reset link" : "Reset password"}
      </button>
      <p className="auth-switch">
        <Link href="/login">Back to sign in</Link>
      </p>
    </form>
  );
}

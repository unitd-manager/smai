"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { brand } from "@/config/brand";
import { CompactSelect } from "@/components/compact-select";

type AuthFormProps = { mode: "signup" | "login" };
type AccountType = "business" | "agency" | "creator" | "personal";

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [accountType, setAccountType] = useState<AccountType>("business");
  const [noWebsite, setNoWebsite] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [takingLonger, setTakingLonger] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");

    const formData = new FormData(event.currentTarget);
    const payload = isSignup
      ? {
          name: String(formData.get("name") ?? ""),
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
          companyName: String(formData.get("companyName") ?? ""),
          companyWebsite: String(formData.get("companyWebsite") ?? ""),
          accountType,
          noWebsite,
        }
      : {
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
        };

    setSubmitting(true);
    setTakingLonger(false);
    const slowRequestTimer = window.setTimeout(() => setTakingLonger(true), 8_000);

    try {
      await apiRequest(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      router.replace(isSignup ? "/onboarding" : "/dashboard");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      window.clearTimeout(slowRequestTimer);
      setSubmitting(false);
      setTakingLonger(false);
    }
  }

  return (
    <form
      className="auth-form"
      onSubmit={handleSubmit}
      aria-busy={submitting ? "true" : undefined}
    >
      {isSignup && (
        <>
          <label>
            Full name
            <input name="name" autoComplete="name" required minLength={2} maxLength={100} />
          </label>
          <label>
            Company or brand name
            <input name="companyName" autoComplete="organization" required minLength={2} maxLength={120} />
          </label>
        </>
      )}
      <label>
        Work email
        <input name="email" type="email" autoComplete="email" required maxLength={254} />
      </label>
      <div className="auth-password-control">
        <label htmlFor="auth-password">Password</label>
        <span className="auth-password-field">
          <input
            id="auth-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 12 : 1}
            maxLength={128}
          />
          <button
            className="auth-password-toggle"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-controls="auth-password"
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword
              ? <EyeOff size={18} aria-hidden="true" />
              : <Eye size={18} aria-hidden="true" />}
          </button>
        </span>
        {isSignup && <small>Use at least 12 characters.</small>}
      </div>
      {isSignup && (
        <>
      <label>
        Account type
            <CompactSelect
          aria-label="Account type"
              value={accountType}
              onChange={(event) => {
                setAccountType(event.target.value as AccountType);
                setNoWebsite(false);
              }}
            >
          <option value="business">Individual business</option>
          <option value="agency">Agency managing client brands</option>
              <option value="creator">Creator or influencer</option>
              <option value="personal">Personal use</option>
            </CompactSelect>
          </label>
      {accountType === "agency" && <p className="auth-account-type-note">Create one agency sign-in, then set up a separate workspace for each client. Your clients’ brands, content and connected social accounts stay isolated.</p>}
          {accountType !== "personal" && (
            <>
              <label>
                Company website{accountType === "creator" ? " (optional)" : ""}
                <input
                  name="companyWebsite"
                  type="url"
                  placeholder="https://example.com"
                  required={(accountType === "business" || accountType === "agency") && !noWebsite}
                  disabled={noWebsite}
                />
              </label>
              {(accountType === "business" || accountType === "agency") && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={noWebsite}
                    onChange={(event) => setNoWebsite(event.target.checked)}
                  />
                  I don&apos;t have a website
                </label>
              )}
            </>
          )}
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      {submitting && (
        <p className="auth-progress" role="status" aria-live="polite">
          {takingLonger
            ? "Still connecting. The service may be starting after a period of inactivity; please keep this page open."
            : isSignup
              ? "Creating your account securely..."
              : "Signing you in securely..."}
        </p>
      )}
      <button className="button button-gold button-full" type="submit" disabled={submitting}>
        {submitting ? (
          <>
            <LoaderCircle className="auth-submit-spinner" size={18} aria-hidden="true" />
            {isSignup ? "Creating account..." : "Signing in..."}
          </>
        ) : isSignup ? "Start my 14-day trial" : "Sign in"}
      </button>
      <p className="auth-switch">
        {isSignup ? "Already have an account?" : `New to ${brand.productName}?`}{" "}
        <Link href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}

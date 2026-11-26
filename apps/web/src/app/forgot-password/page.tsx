import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { PasswordResetForm } from "@/components/password-reset-form";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Forgot password | ${brand.productName}`,
  description: `Request a secure password reset link for your ${brand.productName} account.`,
};

export default function ForgotPasswordPage() {
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand"><Logo /></Link>
      <section className="auth-panel">
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Reset your <em>password.</em></h1>
        <p className="auth-intro">Enter the email address for your account. If it is registered, we’ll send you a secure reset link.</p>
        <PasswordResetForm mode="request" />
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/logo";
import { PasswordResetForm } from "@/components/password-reset-form";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Choose a new password | ${brand.productName}`,
  description: `Choose a new password for your ${brand.productName} account.`,
};

async function ResetPasswordContent({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

  return <PasswordResetForm mode="reset" token={token} />;
}

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand"><Logo /></Link>
      <section className="auth-panel">
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Choose a new <em>password.</em></h1>
        <p className="auth-intro">Set a new password for your account. You’ll then sign in with that password.</p>
        <Suspense fallback={<p className="auth-progress" role="status">Loading your secure reset link...</p>}>
          <ResetPasswordContent searchParams={searchParams} />
        </Suspense>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Create your account | ${brand.productName}`,
  description: `Start a 14-day ${brand.productName} trial and create your first brand profile.`,
};

export default function SignupPage() {
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand"><Logo /></Link>
      <section className="auth-panel">
        <p className="eyebrow">YOUR CONTENT, THOUGHTFULLY MADE</p>
        <h1>Tell us about your business.<br /><em>We&apos;ll take it from here.</em></h1>
        <p className="auth-intro">Choose an individual business workspace or an agency account for managing separate client brands. Start with 14 days of access.</p>
        <AuthForm mode="signup" />
      </section>
    </main>
  );
}

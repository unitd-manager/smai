import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Logo } from "@/components/logo";
import { brand } from "@/config/brand";

export const metadata: Metadata = {
  title: `Sign in | ${brand.productName}`,
  description: `Sign in to your ${brand.productName} workspace.`,
};

export default function LoginPage() {
  return (
    <main className="auth-page">
      <Link href="/" className="auth-brand"><Logo /></Link>
      <section className="auth-panel">
        <p className="eyebrow">WELCOME BACK</p>
        <h1>Make room for <em>great work.</em></h1>
        <p className="auth-intro">Sign in to continue to your content workspace.</p>
        <AuthForm mode="login" />
      </section>
    </main>
  );
}

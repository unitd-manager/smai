import Link from "next/link";
import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/logo";
import { brand } from "@/config/brand";

const publicLinks = [
  { href: "/features", label: "Features" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function MarketingHeader() {
  return (
    <header className="marketing-header">
      <Link href="/" className="marketing-brand">
        <Logo />
      </Link>
      <nav className="marketing-nav" aria-label="Main navigation">
        {publicLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            {item.label}
          </Link>
        ))}
      </nav>
      <details className="marketing-mobile-nav">
        <summary aria-label="Toggle navigation"><Menu size={19} strokeWidth={1.8} aria-hidden="true" /></summary>
        <nav aria-label="Mobile navigation">
          {publicLinks.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
      </details>
      <div className="header-actions">
        <Link className="login-link" href="/login">Log in</Link>
        <Link className="button button-gold" href="/signup">Start your free trial</Link>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <Link href="/" className="marketing-brand"><Logo /></Link>
      <nav aria-label="Footer navigation">
        {publicLinks.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
      </nav>
      <p>Thoughtful content, made around your brand.</p>
      <small>© {brand.companyName}. Social publishing integrations are still in development.</small>
    </footer>
  );
}

export function MarketingPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="marketing-page public-page">
      <MarketingHeader />
      <section className="public-page-content">
        <header className="public-page-heading">
          <p className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </header>
        <div className="public-page-body">{children}</div>
      </section>
      <MarketingFooter />
    </main>
  );
}

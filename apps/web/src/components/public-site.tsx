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
  { href: "/privacy-policy", label: "Privacy" },
  { href: "/terms-of-service", label: "Terms" },
  { href: "/data-deletion", label: "Data deletion" },
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
      <small>© {brand.companyName}. Social publishing is available for connected Instagram Professional accounts and Facebook Pages.</small>
    </footer>
  );
}

export function MarketingPage({
  eyebrow,
  title,
  description,
  effectiveDate,
  legal = false,
  legalPath,
  legalSections,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  description: string;
  effectiveDate?: string;
  legal?: boolean;
  legalPath?: string;
  legalSections?: Array<{ id: string; label: string }>;
  children: ReactNode;
}) {
  return (
    <main className={`marketing-page public-page${legal ? " public-legal-page" : ""}`}>
      {!legal && <MarketingHeader />}
      <section className="public-page-content">
        <header className="public-page-heading">
          <p className="eyebrow"><span className="eyebrow-line" /> {eyebrow}</p>
          <h1>{title}</h1>
          <p>{description}</p>
          {effectiveDate && <p className="public-page-effective-date">Effective Date: {effectiveDate}</p>}
        </header>
        {legal && (
          <nav className="legal-page-switcher" aria-label="Legal pages">
            <Link href="/privacy-policy" aria-current={legalPath === "/privacy-policy" ? "page" : undefined}>Privacy Policy</Link>
            <Link href="/terms-of-service" aria-current={legalPath === "/terms-of-service" ? "page" : undefined}>Terms of Service</Link>
            <Link href="/data-deletion" aria-current={legalPath === "/data-deletion" ? "page" : undefined}>Data Deletion</Link>
          </nav>
        )}
        <div className="public-page-body">
          {legal && legalSections ? (
            <div className="legal-reading-layout">
              <aside className="legal-contents">
                <p>On this page</p>
                <nav aria-label="On this page">
                  {legalSections.map((section) => (
                    <a key={section.id} href={`#${section.id}`}>{section.label}</a>
                  ))}
                </nav>
              </aside>
              <div className="legal-reading-content">{children}</div>
            </div>
          ) : children}
        </div>
      </section>
      {legal ? (
        <footer className="legal-page-footer">
          <small>Copyright © 2026 United Technologies</small>
          <nav aria-label="Legal pages">
            <Link href="/terms-of-service">Terms of Service</Link>
            <span aria-hidden="true" className="legal-footer-separator">|</span>
            <Link href="/privacy-policy">Privacy Policy</Link>
            <span aria-hidden="true" className="legal-footer-separator">|</span>
            <Link href="/data-deletion">Data Deletion</Link>
          </nav>
        </footer>
      ) : <MarketingFooter />}
    </main>
  );
}

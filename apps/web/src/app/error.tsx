"use client";

import Link from "next/link";

export default function AppErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="dashboard-content">
      <section className="section-empty-state" role="alert">
        <p className="eyebrow">TEMPORARY ISSUE</p>
        <h1>This page could not be loaded</h1>
        <p>Your other workspace pages are still available. Try loading this page again.</p>
        <div className="video-detail-actions">
          <button type="button" onClick={reset}>Try again</button>
          <Link className="button button-gold" href="/dashboard">Go to dashboard</Link>
        </div>
      </section>
    </main>
  );
}

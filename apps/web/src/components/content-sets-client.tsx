"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type ContentSet = {
  id: string;
  name: string;
  brief: string;
  platforms: unknown;
  contentIds: unknown;
  status: string;
  createdAt: string;
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function ContentSetsClient() {
  const [sets, setSets] = useState<ContentSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const linkedDraftCount = sets.reduce((total, set) => total + strings(set.contentIds).length, 0);

  useEffect(() => {
    let active = true;
    apiRequest<{ sets: ContentSet[] }>("/api/content-sets")
      .then(({ sets: loadedSets }) => {
        if (active) setSets(loadedSets);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load content sets.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return (
    <section className="dashboard-content content-sets-page">
      <p className="eyebrow">YOUR LIBRARY · CONTENT SETS</p>
      <div className="content-sets-heading">
        <div><h1>Content Sets</h1><p className="dashboard-lead">Group related drafts for review. For one post per day, use the 30-day planner.</p></div>
        <div className="content-sets-actions">
          <Link className="button button-gold" href="/dashboard/campaigns">Build a 30-day plan</Link>
          <Link className="button button-outline" href="/dashboard/create">Create content</Link>
        </div>
      </div>
      {!loading && sets.length > 0 && <div className="content-sets-summary" aria-label="Content set totals">
        <div><span>Saved sets</span><strong>{sets.length}</strong></div>
        <div><span>Linked drafts</span><strong>{linkedDraftCount}</strong></div>
        <div><span>Channels covered</span><strong>{new Set(sets.flatMap((set) => strings(set.platforms))).size}</strong></div>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <p className="loading-label">Loading content sets…</p> : sets.length === 0 ? (
        <div className="section-empty-state content-sets-empty"><span className="card-kicker">REUSE YOUR BEST IDEAS</span><h2>No saved sets yet</h2><p>Generate content, edit its channel versions, then save everything together for easy review.</p><Link className="button button-gold" href="/dashboard/create">Create your first set</Link></div>
      ) : (
        <div className="content-sets-grid">
          {sets.map((set) => (
            <article className="content-set-card" key={set.id}>
              <header><span className="content-set-status">{set.status.toLowerCase()}</span><span className="content-set-date">Saved {new Date(set.createdAt).toLocaleDateString()}</span></header>
              <h2>{set.name}</h2>
              <div className="content-set-card-meta"><strong>{strings(set.contentIds).length} linked {strings(set.contentIds).length === 1 ? "draft" : "drafts"}</strong><span>{strings(set.platforms).length} {strings(set.platforms).length === 1 ? "channel" : "channels"}</span></div>
              <details className="content-set-details">
                <summary>View brief and channels</summary>
                <p className="content-set-brief">{set.brief}</p>
                <div className="content-set-platforms">{strings(set.platforms).map((platform) => <span key={platform}>{platform}</span>)}</div>
              </details>
              <footer><Link href="/dashboard/content">Review content drafts <ArrowRight size={14} aria-hidden="true" /></Link></footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

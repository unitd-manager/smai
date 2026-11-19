"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type Recommendation = {
  id: string;
  title: string;
  explanation: string;
  actionLabel: string;
  actionHref: string;
  kind: string;
};

type BrainResponse = {
  brand: { name: string; industry: string | null };
  health: { score: number; label: string; signals: number; totalSignals: number };
  strategy: string[];
  metrics: { recentPosts: number; drafts: number; plannedCampaigns: number; connectedAccounts: number; analyticsAvailable: boolean };
  content: { formats: string[]; gaps: string[] };
  campaigns: Array<{ name: string; status: string; startsAt: string; endsAt: string }>;
  competitors: { entries: string[]; status: string };
  performance: { status: string; evidence: string };
  priorities: string[];
  recommendations: Recommendation[];
};

export function MarketingBrainClient() {
  const [data, setData] = useState<BrainResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await apiRequest<BrainResponse>("/api/marketing-brain");
      setError("");
      setData(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load marketing recommendations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    apiRequest<BrainResponse>("/api/marketing-brain")
      .then((result) => {
        if (active) setData(result);
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load marketing recommendations.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function decide(id: string, decision: "accept" | "snooze" | "dismiss") {
    setBusyId(id);
    setError("");
    try {
      await apiRequest(`/api/marketing-brain/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      });
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your decision.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="dashboard-content marketing-brain-page">
      <p className="eyebrow">GROW YOUR BUSINESS</p>
      <div className="dashboard-tools-heading brain-page-heading">
        <div>
          <h1>Marketing Brain</h1>
          <p className="dashboard-lead">Practical next steps grounded in your brand profile and workspace activity.</p>
        </div>
        <button className="button button-outline" type="button" onClick={() => setHelpOpen((open) => !open)} aria-expanded={helpOpen}>
          What is this?
        </button>
      </div>
      {helpOpen && <div className="notice"><strong>How recommendations work</strong><p>Suggestions use your saved profile and recent workspace activity. They are guidance, not promises of results. Nothing is published automatically.</p></div>}
      {error && <div className="notice notice-error" role="alert"><p>{error}</p><button className="button button-outline" type="button" onClick={() => { setLoading(true); void load(); }}>Try again</button></div>}
      {loading && <p className="loading-label">Reviewing your brand and recent activity…</p>}
      {!loading && data && <>
        <section className="brain-hero-grid" aria-label="Marketing health overview">
          <article className="brain-health-card"><span className="card-kicker">MARKETING HEALTH</span><strong>{data.health.score}</strong><span>/100 · {data.health.label}</span><div className="brain-health-meter" aria-label={`${data.health.score} out of 100`}><i style={{ width: `${data.health.score}%` }} /></div><small>{data.health.signals} of {data.health.totalSignals} foundation signals are active</small></article>
          <article className="brain-next-card"><span className="card-kicker">WHAT SHOULD WE DO NEXT?</span><h2>{data.priorities[0] ?? "Keep publishing and review results"}</h2><p>{data.recommendations[0]?.explanation ?? "Your current profile and workspace activity do not show an urgent gap."}</p>{data.recommendations[0] && <Link className="button button-gold" href={data.recommendations[0].actionHref}>{data.recommendations[0].actionLabel}</Link>}</article>
        </section>
        <section className="brain-context-panel" aria-label="Business context">
          <div className="brain-context-heading">
            <div><span className="card-kicker">YOUR BUSINESS CONTEXT</span><h2>Recommendations, grounded in your activity</h2></div>
            <span className="brain-context-status">{data.metrics.analyticsAvailable ? "Analytics connected" : "Workspace activity only"}</span>
          </div>
          <div className="brain-context-metrics">
            <div><span>Industry</span><strong>{data.brand.industry || "Not set"}</strong></div>
            <div><span>Recent posts</span><strong>{data.metrics.recentPosts}</strong></div>
            <div><span>Drafts created</span><strong>{data.metrics.drafts}</strong></div>
            <div><span>Connected accounts</span><strong>{data.metrics.connectedAccounts}</strong></div>
          </div>
          <details className="brain-context-details">
            <summary>How these recommendations are grounded</summary>
            <p className="brain-context-note">{data.performance.status}</p>
            <p className="brain-context-limitation">{data.performance.evidence}</p>
          </details>
        </section>
        <section className="brain-intelligence-grid">
          <article><span className="card-kicker">CURRENT STRATEGY</span><h2>Direction for {data.brand.name}</h2><ul>{data.strategy.map((item) => <li key={item}>{item}</li>)}</ul></article>
          <article><span className="card-kicker">CONTENT OPPORTUNITIES</span><h2>Gaps to close</h2>{data.content.gaps.length ? <ul>{data.content.gaps.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Your current content foundation is balanced.</p>}<small>Formats used recently: {data.content.formats.join(", ") || "none"}.</small></article>
          <article><span className="card-kicker">COMPETITOR INSIGHTS</span><h2>Positioning research</h2><p>{data.competitors.status}</p>{data.competitors.entries.length > 0 && <ul>{data.competitors.entries.map((item) => <li key={item}>{item}</li>)}</ul>}<Link href="/onboarding">Update competitor list</Link></article>
          <article><span className="card-kicker">CAMPAIGN PRIORITIES</span><h2>Plan before you publish</h2>{data.campaigns.length ? <ul>{data.campaigns.map((campaign) => <li key={campaign.name}><strong>{campaign.name}</strong> · {campaign.status}</li>)}</ul> : <p>No active campaign plan. Turn your highest priority into a reviewable plan.</p>}<Link href="/dashboard/campaigns">Open campaigns</Link></article>
        </section>
        <div className="brain-recommendations-heading">
          <div><span className="card-kicker">NEXT STEPS</span><h2>Ideas for your business</h2></div>
          <span>{data.recommendations.length} {data.recommendations.length === 1 ? "recommendation" : "recommendations"}</span>
        </div>
        {data.recommendations.length === 0
          ? <div className="section-empty-state"><h2>You’re up to date</h2><p>No new recommendations are available for this brand right now. Keep your profile and content activity current to improve future suggestions.</p><Link className="button button-gold" href="/dashboard/create">Create content</Link></div>
          : <div className="brain-recommendations-grid">
            {data.recommendations.map((recommendation) => <article className="brain-recommendation-card" key={recommendation.id}>
              <span className="card-kicker">{recommendation.kind.replaceAll("-", " ")}</span>
              <h2>{recommendation.title}</h2>
              <details className="brain-recommendation-details">
                <summary>Why this suggestion</summary>
                <p>{recommendation.explanation}</p>
              </details>
              <Link className="button button-gold" href={recommendation.actionHref}>{recommendation.actionLabel}</Link>
              <details className="brain-decision-details">
                <summary>More actions</summary>
                <div className="brain-decision-actions">
                  <button className="button button-outline" type="button" onClick={() => void decide(recommendation.id, "accept")} disabled={busyId === recommendation.id}>Accept</button>
                  <button className="button button-outline" type="button" onClick={() => void decide(recommendation.id, "snooze")} disabled={busyId === recommendation.id}>Snooze 7 days</button>
                  <button className="button button-outline" type="button" onClick={() => void decide(recommendation.id, "dismiss")} disabled={busyId === recommendation.id}>Dismiss</button>
                </div>
              </details>
              {busyId === recommendation.id && <small className="loading-label">Saving your choice…</small>}
            </article>)}
          </div>}
      </>}
    </section>
  );
}

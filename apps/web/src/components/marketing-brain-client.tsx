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
  health: { score: number; label: string; signals: number; totalSignals: number; checks?: Array<{ key: string; label: string; active: boolean }> };
  strategy: string[];
  metrics: { recentPosts: number; drafts: number; plannedCampaigns: number; connectedAccounts: number; analyticsAvailable: boolean };
  content: { formats: string[]; gaps: string[] };
  campaigns: Array<{ id: string; name: string; status: string; startsAt: string; endsAt: string }>;
  competitors: {
    entries: string[];
    status: string;
    insights: Array<{ name: string; category: string; analyzedAt: string | null; summary: string | null; opportunities: string[] }>;
  };
  performance: { status: string; evidence: string };
  priorities: string[];
  recommendations: Recommendation[];
};

export function MarketingBrainClient() {
  const [data, setData] = useState<BrainResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
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
      <p className="eyebrow">Grow your business</p>
      <div className="dashboard-tools-heading brain-page-heading">
        <div>
          <h1>Marketing Brain</h1>
          <p className="dashboard-lead">Your next best marketing move, backed by brand and channel signals.</p>
        </div>
        <button className="button button-outline" type="button" onClick={() => { setLoading(true); void load(); }} disabled={loading}>
          {loading ? "Updating…" : "Refresh insights"}
        </button>
      </div>
      {error && <div className="notice notice-error" role="alert"><p>{error}</p><button className="button button-outline" type="button" onClick={() => { setLoading(true); void load(); }}>Try again</button></div>}
      {loading && <p className="loading-label">Reviewing your brand and recent activity…</p>}
      {!loading && data && <>
        <section className="brain-hero-grid" aria-label="Marketing health overview">
          <article className="brain-health-card"><span className="card-kicker">Brand health</span><strong>{data.health.score}</strong><span>/100 · {data.health.label}</span><div className="brain-health-meter" aria-label={`${data.health.score} out of 100`}><i style={{ width: `${data.health.score}%` }} /></div><small>{data.health.signals}/{data.health.totalSignals} signals active</small>{data.health.checks && <details className="brain-health-details"><summary>How this score is calculated</summary><ul>{data.health.checks.map((check) => <li key={check.key}><span aria-hidden="true">{check.active ? "✓" : "–"}</span>{check.label}<strong>{check.active ? "Active" : "Not active"}</strong></li>)}</ul><p>Each active signal contributes 12.5 points. The score reflects profile setup and workspace activity, not business results.</p></details>}</article>
          <article className="brain-next-card"><span className="card-kicker">Next best move</span><h2>{data.recommendations[0]?.title ?? data.priorities[0] ?? "Keep your brand profile current"}</h2><p>{data.recommendations[0]?.explanation ?? "Your workspace is ready for the next content batch."}</p>{data.recommendations[0] && <><Link className="button button-gold" href={data.recommendations[0].actionHref}>{data.recommendations[0].actionLabel}</Link><details className="brain-decision-details"><summary>More actions</summary><div className="brain-decision-actions"><button className="button button-outline" type="button" onClick={() => void decide(data.recommendations[0]!.id, "accept")} disabled={busyId === data.recommendations[0]!.id}>Accept</button><button className="button button-outline" type="button" onClick={() => void decide(data.recommendations[0]!.id, "snooze")} disabled={busyId === data.recommendations[0]!.id}>Snooze 7 days</button><button className="button button-outline" type="button" onClick={() => void decide(data.recommendations[0]!.id, "dismiss")} disabled={busyId === data.recommendations[0]!.id}>Dismiss</button></div></details>{busyId === data.recommendations[0]!.id && <small className="loading-label">Saving your choice…</small>}</>}</article>
        </section>
        <section className="brain-context-panel" aria-label="Business context">
          <div className="brain-context-heading">
            <div><span className="card-kicker">Live signals</span><h2>{data.brand.name}</h2></div>
            <span className="brain-context-status">{data.metrics.analyticsAvailable ? "Analytics connected" : "Workspace activity only"}</span>
          </div>
          <div className="brain-context-metrics">
            <div><span>Industry</span><strong>{data.brand.industry || "Not set"}</strong></div>
            <div><span>Recent posts</span><strong>{data.metrics.recentPosts}</strong></div>
            <div><span>Drafts</span><strong>{data.metrics.drafts}</strong></div>
            <div><span>Channels</span><strong>{data.metrics.connectedAccounts}</strong></div>
            <div><span>Planned campaigns</span><strong>{data.metrics.plannedCampaigns}</strong></div>
          </div>
          <details className="brain-context-details">
            <summary>How these recommendations are grounded</summary>
            <p className="brain-context-note">{data.performance.status}</p>
            <p className="brain-context-limitation">{data.performance.evidence}</p>
          </details>
        </section>
        <div className="brain-recommendations-heading">
          <div><span className="card-kicker">Action queue</span><h2>Recommended moves</h2></div>
          <span>{Math.max(0, data.recommendations.length - 1)} additional</span>
        </div>
        {data.recommendations.length <= 1
          ? <div className="section-empty-state"><h2>{data.recommendations.length ? "Top move is ready" : "All caught up"}</h2><p>{data.recommendations.length ? "Your next action is featured above." : "Ready for a fresh content batch?"}</p>{!data.recommendations.length && <Link className="button button-gold" href="/dashboard/create">Create content</Link>}</div>
          : <div className="brain-recommendations-grid">
            {data.recommendations.slice(1).map((recommendation) => <article className="brain-recommendation-card" key={recommendation.id}>
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
        <section className="brain-intelligence-grid">
          <article><span className="card-kicker">Strategy</span><h2>Brand direction</h2><ul>{data.strategy.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>{data.priorities.length > 0 && <div className="brain-priority-note"><strong>Current priorities</strong><p>{data.priorities.slice(0, 3).join(" · ")}</p></div>}</article>
          <article><span className="card-kicker">Content</span><h2>{data.content.gaps.length ? "Gaps to close" : "Formats in rotation"}</h2>{data.content.gaps.length ? <ul>{data.content.gaps.slice(0, 3).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>{data.content.formats.slice(0, 3).join(" · ") || "Create your first post"}</p>}{data.content.gaps.length > 0 && data.content.formats.length > 0 && <small>Formats in rotation · {data.content.formats.slice(0, 3).join(" · ")}</small>}<Link href="/dashboard/create">Create content</Link></article>
          <article><span className="card-kicker">Competitors</span><h2>{data.competitors.insights.length ? "Market signals" : "Research workspace"}</h2>{data.competitors.insights.filter((item) => item.summary).slice(0, 2).map((item) => <details key={item.name}><summary>{item.name}</summary><p>{item.summary}</p>{item.opportunities.length > 0 && <small>{item.opportunities.slice(0, 2).join(" · ")}</small>}</details>)}{!data.competitors.insights.length && <p>{data.competitors.entries.length} profiles tracked · {data.competitors.status}</p>}<Link href="/dashboard/competitors">Open research</Link></article>
          <article><span className="card-kicker">Campaigns</span><h2>{data.campaigns.length ? "In motion" : "Plan a moment"}</h2>{data.campaigns.length ? <ul>{data.campaigns.slice(0, 3).map((campaign) => <li key={campaign.id}><strong>{campaign.name}</strong><span className="brain-campaign-meta">{campaign.status} · {new Date(campaign.startsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {new Date(campaign.endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></li>)}</ul> : <p>Turn a seasonal moment into a content plan.</p>}<Link href="/dashboard/campaigns">Open campaigns</Link></article>
        </section>
      </>}
    </section>
  );
}

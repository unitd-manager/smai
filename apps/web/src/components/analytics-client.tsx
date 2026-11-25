"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarClock, CircleAlert, Eye, Lightbulb, Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, postsUpdatedEvent } from "@/lib/api";

type AnalyticsPost = {
  id: string;
  title: string | null;
  status: string;
  scheduledAt: string | null;
  timezone?: string | null;
  createdAt: string;
  targets: Array<{
    platform: string;
    status: string;
    publishedAt: string | null;
    publishingMode: "live" | "demo";
  }>;
};

type InstagramInsightPost = {
  id: string;
  caption: string;
  mediaType: string;
  timestamp: string | null;
  permalink: string | null;
  likes: number | null;
  commentsCount: number | null;
  insights: Record<string, number | null>;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const periodOptions = [7, 30, 90] as const;
const scheduleDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const scheduleBands = ["Morning", "Afternoon", "Evening"];
type Period = (typeof periodOptions)[number];

function formatDay(date: Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en", { timeZone: "UTC", ...options }).format(date);
}

function ActivityChart({ values, period, startDate }: { values: number[]; period: Period; startDate: number }) {
  const width = 760;
  const height = 250;
  const left = 42;
  const right = 744;
  const top = 18;
  const bottom = 194;
  const peak = Math.max(1, ...values);
  const tickStep = Math.max(1, Math.ceil(peak / 3));
  const chartMaximum = tickStep * 3;
  const points = values.map((value, index) => {
    const x = left + (values.length < 2 ? 0 : (index / (values.length - 1)) * (right - left));
    const y = bottom - (value / chartMaximum) * (bottom - top);
    return { x, y, value };
  });
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${left},${bottom} ${line} ${right},${bottom}`;
  const labelIndexes = [...new Set([0, Math.round((values.length - 1) / 4), Math.round((values.length - 1) / 2), Math.round((values.length - 1) * 3 / 4), values.length - 1])];
  const axisLabels = period === 7 ? { weekday: "short" } as const : { month: "short", day: "numeric" } as const;

  return (
    <div className="analytics-chart-wrap">
      <svg className="analytics-activity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby="analytics-chart-title analytics-chart-description">
        <title id="analytics-chart-title">Confirmed publishing activity over the last {period} days</title>
        <desc id="analytics-chart-description">Daily counts of live posts confirmed as published. Engagement and demo activity are excluded.</desc>
        <defs>
          <linearGradient id="analytics-activity-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3979dc" stopOpacity=".24" />
            <stop offset="100%" stopColor="#3979dc" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((step) => {
          const value = tickStep * step;
          const y = bottom - (value / chartMaximum) * (bottom - top);
          return (
            <g key={step}>
              <line x1={left} x2={right} y1={y} y2={y} className="analytics-chart-gridline" />
              <text x={left - 10} y={y + 4} className="analytics-chart-axis-label" textAnchor="end">{value}</text>
            </g>
          );
        })}
        <polygon points={area} className="analytics-chart-area" />
        <polyline points={line} className="analytics-chart-line" />
        {points.map(({ x, y, value }, index) => (
          <circle key={index} cx={x} cy={y} r={period === 7 ? 4 : 2.5} className="analytics-chart-point">
            <title>{formatDay(new Date(startDate + index * DAY_MS), axisLabels)}: {value} published</title>
          </circle>
        ))}
        {labelIndexes.map((index) => (
          <text key={index} x={points[index]?.x ?? left} y={bottom + 25} className="analytics-chart-axis-label" textAnchor={index === 0 ? "start" : index === values.length - 1 ? "end" : "middle"}>
            {formatDay(new Date(startDate + index * DAY_MS), axisLabels)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function StatusChart({ published, scheduled, failed, removed, other }: { published: number; scheduled: number; failed: number; removed: number; other: number }) {
  const total = published + scheduled + failed + removed + other;
  const colors = { published: "#3a9d83", scheduled: "#c99a21", failed: "#cf6257", removed: "#a45b83", other: "#a3acb8" };
  const items = [
    { label: "Published", value: published, color: "published", hex: colors.published },
    { label: "Scheduled", value: scheduled, color: "scheduled", hex: colors.scheduled },
    { label: "Failed", value: failed, color: "failed", hex: colors.failed },
    { label: "Deleted on Instagram", value: removed, color: "removed", hex: colors.removed },
    { label: "Other", value: other, color: "other", hex: colors.other },
  ];
  let offset = 0;
  const gradient = items.map((item) => {
    const start = offset;
    offset += total ? (item.value / total) * 100 : 0;
    return `${item.hex} ${start}% ${offset}%`;
  }).join(", ");

  return (
    <div className="analytics-status-chart analytics-status-donut-layout">
      <div className="analytics-status-donut" role="img" aria-label={`${published} published, ${scheduled} scheduled, ${failed} failed, ${removed} removed, ${other} other live targets`} style={{ background: total ? `conic-gradient(${gradient})` : "var(--ivory-300)" }}>
        <span><strong>{total}</strong><small>targets</small></span>
      </div>
      <ul className="analytics-status-legend">
        {items.map((item) => (
          <li key={item.color}><span className={`analytics-status-dot is-${item.color}`} /><span>{item.label}</span><strong>{item.value}</strong></li>
        ))}
      </ul>
    </div>
  );
}

function SchedulePattern({ rows }: { rows: number[][] }) {
  return (
    <div className="analytics-schedule-table-wrap">
      <table className="analytics-schedule-table">
        <thead><tr><th scope="col">Local time</th>{scheduleDays.map((day) => <th scope="col" key={day}>{day}</th>)}</tr></thead>
        <tbody>{scheduleBands.map((band, row) => (
          <tr key={band}>
            <th scope="row">{band}</th>
            {scheduleDays.map((day, column) => <td key={day} data-value={rows[row]?.[column] ?? 0}>{rows[row]?.[column] ?? 0}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function AnalyticsClient() {
  const [posts, setPosts] = useState<AnalyticsPost[]>([]);
  const [period, setPeriod] = useState<Period>(7);
  const [now, setNow] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [instagramPosts, setInstagramPosts] = useState<InstagramInsightPost[] | null>(null);
  const [instagramError, setInstagramError] = useState("");
  const [instagramLoading, setInstagramLoading] = useState(true);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const loaded: AnalyticsPost[] = [];
      let offset = 0;
      while (true) {
        const response = await apiRequest<{ posts: AnalyticsPost[] }>(
          `/api/posts?brandId=all&limit=500&offset=${offset}`,
        );
        loaded.push(...response.posts);
        if (response.posts.length < 500) break;
        offset += response.posts.length;
      }
      setPosts(loaded);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load publishing activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNow(Date.now());
      void loadAnalytics();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAnalytics]);

  useEffect(() => {
    let active = true;
    apiRequest<{ posts: InstagramInsightPost[] }>("/api/listening")
      .then((response) => { if (active) { setInstagramPosts(response.posts); setInstagramError(""); } })
      .catch((requestError: unknown) => {
        if (active) setInstagramError(requestError instanceof Error ? requestError.message : "Instagram insights are unavailable.");
      })
      .finally(() => { if (active) setInstagramLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const refreshAnalytics = () => void loadAnalytics();
    window.addEventListener(postsUpdatedEvent, refreshAnalytics);
    return () => window.removeEventListener(postsUpdatedEvent, refreshAnalytics);
  }, [loadAnalytics]);

  const summary = useMemo(() => {
    const currentDate = new Date(now ?? 0);
    const todayUtc = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate());
    const firstDay = todayUtc - (period - 1) * DAY_MS;
    const liveTargets = posts.flatMap((post) =>
      post.targets.filter((target) => target.publishingMode === "live").map((target) => ({ post, target })),
    );
    const publishedInPeriod = liveTargets.filter(({ target }) => {
      if (!["PUBLISHED", "DELETED_ON_PLATFORM"].includes(target.status) || !target.publishedAt) return false;
      const timestamp = Date.parse(target.publishedAt);
      return Number.isFinite(timestamp) && timestamp >= firstDay && timestamp < todayUtc + DAY_MS;
    });
    const dailyPublished = Array.from({ length: period }, (_, day) => {
      const dateKey = new Date(firstDay + day * DAY_MS).toISOString().slice(0, 10);
      return new Set(publishedInPeriod
        .filter(({ target }) => target.publishedAt && new Date(target.publishedAt).toISOString().slice(0, 10) === dateKey)
        .map(({ post }) => post.id)).size;
    });
    const platformCounts = new Map<string, number>();
    for (const { target } of publishedInPeriod) {
      platformCounts.set(target.platform, (platformCounts.get(target.platform) ?? 0) + 1);
    }
    const statusCounts = {
      published: liveTargets.filter(({ target }) => target.status === "PUBLISHED").length,
      scheduled: liveTargets.filter(({ target }) => target.status === "PENDING" || target.status === "QUEUED").length,
      failed: liveTargets.filter(({ target }) => target.status === "FAILED").length,
      removed: liveTargets.filter(({ target }) => target.status === "DELETED_ON_PLATFORM").length,
      other: liveTargets.filter(({ target }) => !["PUBLISHED", "PENDING", "QUEUED", "FAILED", "DELETED_ON_PLATFORM"].includes(target.status)).length,
    };
    const schedulePattern = scheduleBands.map(() => Array.from({ length: 7 }, () => 0));
    for (const post of posts) {
      if (!post.scheduledAt || Date.parse(post.scheduledAt) <= (now ?? 0)) continue;
      if (!post.targets.some((target) => target.publishingMode === "live" && ["PENDING", "QUEUED"].includes(target.status))) continue;
      const scheduledDate = new Date(post.scheduledAt);
      let parts: Intl.DateTimeFormatPart[];
      try {
        parts = new Intl.DateTimeFormat("en-US", {
          timeZone: post.timezone || "UTC",
          weekday: "short",
          hour: "2-digit",
          hourCycle: "h23",
        }).formatToParts(scheduledDate);
      } catch {
        parts = new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          weekday: "short",
          hour: "2-digit",
          hourCycle: "h23",
        }).formatToParts(scheduledDate);
      }
      const dayIndex = scheduleDays.indexOf(parts.find((part) => part.type === "weekday")?.value ?? "");
      const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
      const bandIndex = hour < 12 ? 0 : hour < 18 ? 1 : 2;
      if (dayIndex >= 0) schedulePattern[bandIndex]![dayIndex] += 1;
    }
    const recent = posts
      .map((post) => ({
        post,
        targets: post.targets.filter((target) =>
          ["PUBLISHED", "DELETED_ON_PLATFORM"].includes(target.status) && target.publishingMode === "live",
        ),
      }))
      .filter(({ targets }) => targets.length > 0)
      .sort((a, b) => {
        const latestPublished = (targets: typeof a.targets) => Math.max(...targets.map((target) => Date.parse(target.publishedAt ?? "" ) || 0));
        return latestPublished(b.targets) - latestPublished(a.targets);
      })
      .slice(0, 5);
    const publishedWithoutTimestamp = liveTargets.filter(({ target }) => target.status === "PUBLISHED" && !target.publishedAt).length;

    return {
      published: new Set(publishedInPeriod.map(({ post }) => post.id)).size,
      scheduled: statusCounts.scheduled,
      failed: statusCounts.failed,
      activeChannels: new Set(liveTargets.map(({ target }) => target.platform)).size,
      dailyPublished,
      chartStartDate: firstDay,
      byPlatform: [...platformCounts.entries()].sort(([, a], [, b]) => b - a),
      statusCounts,
      schedulePattern,
      statusTotal: liveTargets.length,
      recent,
      publishedWithoutTimestamp,
      hasLiveTargets: liveTargets.length > 0,
    };
  }, [now, period, posts]);

  const instagramSummary = useMemo(() => {
    const postsWithInteractions = (instagramPosts ?? []).map((post) => ({
      post,
      interactions: post.insights.total_interactions ?? ((post.likes ?? 0) + (post.commentsCount ?? 0) + (post.insights.shares ?? 0) + (post.insights.saved ?? 0)),
    }));
    const availableSum = (key: string) => {
      const values = (instagramPosts ?? []).map((post) => post.insights[key]).filter((value): value is number => typeof value === "number");
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    };
    const bestPost = [...postsWithInteractions].filter(({ interactions }) => interactions > 0).sort((a, b) => b.interactions - a.interactions)[0]?.post ?? null;
    return {
      reach: availableSum("reach"),
      views: availableSum("views"),
      interactions: postsWithInteractions.some(({ post }) => typeof post.insights.total_interactions === "number" || post.likes !== null || post.commentsCount !== null || typeof post.insights.shares === "number" || typeof post.insights.saved === "number")
        ? postsWithInteractions.reduce((sum, item) => sum + item.interactions, 0)
        : null,
      likes: (instagramPosts ?? []).some((post) => post.likes !== null) ? (instagramPosts ?? []).reduce((sum, post) => sum + (post.likes ?? 0), 0) : null,
      comments: (instagramPosts ?? []).some((post) => post.commentsCount !== null) ? (instagramPosts ?? []).reduce((sum, post) => sum + (post.commentsCount ?? 0), 0) : null,
      bestPost,
    };
  }, [instagramPosts]);

  const maxPlatformCount = Math.max(1, ...summary.byPlatform.map(([, count]) => count));
  const leadingPlatform = summary.byPlatform[0];
  const nextAction = summary.failed > 0
    ? {
      title: "Review publishing issues",
      detail: `${summary.failed} live ${summary.failed === 1 ? "target needs" : "targets need"} attention.`,
      href: "/dashboard/posts",
      link: "Review posts",
    }
    : summary.scheduled === 0
      ? {
        title: "Schedule your next post",
        detail: "No queued or pending live targets were found.",
        href: "/dashboard/calendar",
        link: "Open calendar",
      }
      : {
        title: "Review the publishing queue",
        detail: `${summary.scheduled} live ${summary.scheduled === 1 ? "target is" : "targets are"} queued or pending.`,
        href: "/dashboard/calendar",
        link: "View schedule",
      };

  return (
    <section className="dashboard-content analytics-page">
      <header className="analytics-page-heading">
        <div>
          <p className="eyebrow">Your studio · Grow</p>
          <h1>Analytics</h1>
          <p className="dashboard-lead">A clear view of your publishing activity across connected channels.</p>
        </div>
        <div className="analytics-header-actions">
          <div className="analytics-period-switch" role="group" aria-label="Analytics period">
            {periodOptions.map((days) => (
              <button key={days} type="button" className={period === days ? "is-active" : ""} aria-pressed={period === days} onClick={() => setPeriod(days)}>
                {days} days
              </button>
            ))}
          </div>
          <Link className="button button-primary analytics-manage-link" href="/dashboard/social-accounts">Manage channels <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </header>
      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <p className="loading-label" role="status">Loading publishing activity…</p> : (
        <>
          <section className="analytics-marketing-snapshot" aria-labelledby="analytics-snapshot-title">
            <header className="analytics-section-heading">
              <div><p className="card-kicker">Publishing overview</p><h2 id="analytics-snapshot-title">Your publishing at a glance</h2></div>
              <span className="analytics-data-source">Live publishing records</span>
            </header>
            <div className="analytics-snapshot-grid">
              <article className="analytics-snapshot-card is-published">
                <span>Published posts</span><strong>{summary.published}</strong>
                <small>Unique posts · selected period</small><Send size={17} aria-hidden="true" />
              </article>
              <article className="analytics-snapshot-card is-channel">
                <span>Most active platform</span><strong>{leadingPlatform?.[0] ?? "—"}</strong>
                <small>{leadingPlatform ? `${leadingPlatform[1]} live ${leadingPlatform[1] === 1 ? "target" : "targets"} in this period` : "No confirmed live posts in this period"}</small>
                <ArrowUpRight size={17} aria-hidden="true" />
              </article>
              <article className="analytics-snapshot-card is-queued">
                <span>Queued live targets</span><strong>{summary.scheduled}</strong>
                <small>Current queue · waiting or pending</small><CalendarClock size={17} aria-hidden="true" />
              </article>
              <article className="analytics-snapshot-card is-attention">
                <span>Needs attention</span><strong>{summary.failed}</strong>
                <small>Current failed live targets</small><CircleAlert size={17} aria-hidden="true" />
              </article>
            </div>
          </section>

          <section className="analytics-instagram-panel analytics-panel" aria-labelledby="analytics-instagram-title">
            <div className="analytics-section-heading">
              <div><p className="card-kicker">Instagram · recent media</p><h2 id="analytics-instagram-title">Account insights</h2></div>
              <span className="analytics-data-source">{instagramLoading ? "Checking access" : instagramError ? "Unavailable" : "Instagram API insights"}</span>
            </div>
            <div className="analytics-instagram-detail" aria-live="polite">
              {instagramError
                ? <p>Instagram insights unavailable: {instagramError}</p>
                : instagramLoading
                  ? <p>Checking connected Instagram insights…</p>
                  : !instagramPosts?.length
                    ? <p>No Instagram posts are available for insights. Connect an eligible professional account with Insights permission.</p>
                    : <>
                      <div><span>Recent-post views</span><strong>{instagramSummary.views === null ? "Unavailable" : instagramSummary.views.toLocaleString()}</strong></div>
                      <div><span>Likes</span><strong>{instagramSummary.likes === null ? "Unavailable" : instagramSummary.likes.toLocaleString()}</strong></div>
                      <div><span>Comments</span><strong>{instagramSummary.comments === null ? "Unavailable" : instagramSummary.comments.toLocaleString()}</strong></div>
                      <div><span>Interactions</span><strong>{instagramSummary.interactions === null ? "Unavailable" : instagramSummary.interactions.toLocaleString()}</strong></div>
                      {instagramSummary.bestPost && (instagramSummary.bestPost.permalink
                        ? <a href={instagramSummary.bestPost.permalink} target="_blank" rel="noreferrer"><span>Highest interaction count · Instagram</span><strong>{instagramSummary.bestPost.caption.trim().slice(0, 90) || instagramSummary.bestPost.mediaType} · {instagramSummary.bestPost.insights.total_interactions ?? ((instagramSummary.bestPost.likes ?? 0) + (instagramSummary.bestPost.commentsCount ?? 0))} interactions</strong></a>
                        : <div><span>Highest interaction count · Instagram</span><strong>{instagramSummary.bestPost.caption.trim().slice(0, 90) || instagramSummary.bestPost.mediaType} · {instagramSummary.bestPost.insights.total_interactions ?? ((instagramSummary.bestPost.likes ?? 0) + (instagramSummary.bestPost.commentsCount ?? 0))} interactions</strong></div>)}
                    </>}
            </div>
          </section>

          <section className="analytics-insights-panel analytics-panel" aria-labelledby="analytics-insights-title">
            <div className="analytics-section-heading">
              <div><p className="card-kicker">Actionable insights</p><h2 id="analytics-insights-title">What to do next</h2></div>
              <Sparkles size={18} aria-hidden="true" />
            </div>
            <div className="analytics-insights-grid">
              <article>
                <span className="analytics-insight-icon"><Lightbulb size={17} aria-hidden="true" /></span>
                <div><strong>Recommended next action</strong><p>{nextAction.title} · {nextAction.detail}</p><Link href={nextAction.href}>{nextAction.link} <ArrowRight size={13} aria-hidden="true" /></Link></div>
              </article>
              <article>
                <span className="analytics-insight-icon is-muted"><Eye size={17} aria-hidden="true" /></span>
                <div><strong>{instagramSummary.bestPost ? "Strongest recent Instagram post" : "Broader performance rankings unavailable"}</strong><p>{instagramSummary.bestPost ? `${instagramSummary.bestPost.caption.trim().slice(0, 140) || instagramSummary.bestPost.mediaType}. Instagram's reported interactions are shown in the snapshot; category and cross-platform rankings need more connected metrics.` : "Best post, content category, and publishing time require platform engagement metrics. Instagram insights are shown when the connected account provides them."}</p></div>
              </article>
            </div>
            <p className="analytics-data-limit">Instagram metrics come from recent media insights and may be unavailable for some formats or permissions. Cross-platform impressions, audience growth, and campaign attribution are not connected. No sample performance figures are shown as real results.</p>
          </section>

          <div className="analytics-dashboard-overview">
            <section className="analytics-panel analytics-activity-panel">
            <div className="analytics-section-heading">
              <div><p className="card-kicker">Publishing over time</p><h2>Daily activity</h2></div>
              <span className="analytics-period-label">Last {period} days</span>
            </div>
            <p className="analytics-chart-caption">Live posts confirmed as published each day. Demo activity is excluded.</p>
            {summary.published ? (
              <ActivityChart values={summary.dailyPublished} period={period} startDate={summary.chartStartDate} />
            ) : (
              <div className="analytics-activity-empty">
                <ArrowUpRight size={20} aria-hidden="true" />
                <div><strong>No live publishing activity in this period</strong><p>Once a connected platform confirms a post, its activity will appear here.</p></div>
                <Link href="/dashboard/create">Create a post <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            )}
            {summary.publishedWithoutTimestamp > 0 && <p className="analytics-data-note">{summary.publishedWithoutTimestamp} published {summary.publishedWithoutTimestamp === 1 ? "post has" : "posts have"} no platform timestamp and {summary.publishedWithoutTimestamp === 1 ? "is" : "are"} not placed on the chart.</p>}
            </section>

            <section className="analytics-panel analytics-channel-panel">
              <div className="analytics-section-heading"><div><p className="card-kicker">Channel performance</p><h2>Published by platform</h2></div></div>
              <p className="analytics-chart-caption">Live publishing targets in the selected period</p>
              {summary.byPlatform.length ? (
                <div className="analytics-platform-chart">
                  {summary.byPlatform.map(([platform, count]) => (
                    <div className="analytics-platform-row" key={platform}>
                      <div><strong>{platform}</strong><span>{count}</span></div>
                      <div className="analytics-platform-track" role="img" aria-label={`${count} published on ${platform}`}><span style={{ width: `${(count / maxPlatformCount) * 100}%` }} /></div>
                    </div>
                  ))}
                </div>
              ) : <p className="analytics-empty-chart">No confirmed publishing in this period yet.</p>}
              <Link href="/dashboard/posts">Open Posts and Queue <ArrowRight size={14} aria-hidden="true" /></Link>
            </section>
          </div>

          <div className="analytics-panels analytics-dashboard-details">
            <section className="analytics-panel analytics-busiest-panel">
              <div className="analytics-section-heading"><div><p className="card-kicker">Scheduled times</p><h2>Upcoming posting pattern</h2></div></div>
              <p className="analytics-chart-caption">Upcoming live posts grouped by their saved local time.</p>
              <SchedulePattern rows={summary.schedulePattern} />
              {!summary.schedulePattern.some((row) => row.some((count) => count > 0)) && <p className="analytics-empty-chart">No upcoming live posts are scheduled yet.</p>}
              <Link href="/dashboard/calendar">Open calendar <ArrowRight size={14} aria-hidden="true" /></Link>
            </section>

            <section className="analytics-panel analytics-status-panel">
              <div className="analytics-section-heading"><div><p className="card-kicker">Delivery status</p><h2>Publishing results</h2></div></div>
              <p className="analytics-chart-caption">Current status across live targets. No reach or engagement metrics are connected.</p>
              <p className="analytics-active-channels"><strong>{summary.activeChannels}</strong> active {summary.activeChannels === 1 ? "channel" : "channels"}</p>
              <StatusChart {...summary.statusCounts} />
              {!summary.hasLiveTargets && <p className="analytics-empty-chart">Schedule a post to start tracking live delivery.</p>}
              <Link href="/dashboard/posts">Review publishing status <ArrowRight size={14} aria-hidden="true" /></Link>
            </section>
          </div>

          <section className="analytics-panel analytics-recent-panel">
            <div className="analytics-section-heading"><div><p className="card-kicker">Latest results</p><h2>Recently published</h2></div><Link href="/dashboard/posts">View all <ArrowRight size={14} aria-hidden="true" /></Link></div>
            {summary.recent.length ? summary.recent.map(({ post, targets }, index) => {
              const publishedAt = targets.map((target) => target.publishedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
              const deletedOnInstagram = targets.some((target) => target.status === "DELETED_ON_PLATFORM");
              return (
              <article key={post.id}>
                <span className="analytics-recent-index">{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{post.title ?? "Untitled post"}</strong><span>{deletedOnInstagram ? "Deleted on Instagram · " : ""}{targets.map((target) => target.platform).join(", ")}</span></div>
                {publishedAt ? <time dateTime={publishedAt}>{formatDay(new Date(publishedAt), { month: "short", day: "numeric", year: "numeric" })}</time> : <span className="analytics-date-unavailable">Date unavailable</span>}
              </article>
              );
            }) : <p className="analytics-empty-chart">No confirmed live posts yet. Demo-publisher activity is not shown as real platform performance.</p>}
          </section>
        </>
      )}
    </section>
  );
}

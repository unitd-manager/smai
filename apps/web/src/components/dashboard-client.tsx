"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Camera,
  Clock3,
  FileText,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { apiRequest } from "@/lib/api";
import { PlatformIcon } from "@/components/platform-icon";

type DashboardData = {
  workspace: { id: string; name: string; trialEndsAt: string };
  brand: { id: string; name: string } | null;
  brandCount: number;
  trialExpired: boolean;
  trialDaysRemaining: number;
  subscriptionStatus: string | null;
};

type Post = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  timezone: string;
  targets: Array<{
    id: string;
    platform: string;
    status: string;
    publishedAt: string | null;
    publishingMode: "live" | "demo";
  }>;
};

type BrainPreview = {
  recommendations: Array<{ id: string; title: string; explanation: string; actionLabel: string; actionHref: string }>;
  contextSummary: { analyticsAvailable: boolean };
};

type SocialAccount = { id: string; displayName: string | null; status: string };

type DashboardApproval = {
  id: string;
  createdAt: string;
  post: {
    title: string | null;
    brand: { name: string };
    targets: Array<{ id: string; platform: string }>;
  };
};

type DashboardActivity = {
  draftCount: number;
  draftPostCount: number;
  scheduledCount: number;
  publishedCount: number;
  failedCount: number;
  dailyPublished: number[];
  upcomingPosts: Post[];
  accounts: SocialAccount[];
};

function getWeekStart(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function sameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();
}

function postTime(post: Post) {
  if (!post.scheduledAt) return "Any time";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: post.timezone || undefined,
    }).format(new Date(post.scheduledAt));
  } catch {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(post.scheduledAt));
  }
}

function DashboardPerformanceChart({ values }: { values: number[] }) {
  const width = 760;
  const height = 160;
  const top = 16;
  const bottom = 122;
  const peak = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = 8 + (index / Math.max(1, values.length - 1)) * (width - 16);
    const y = bottom - (value / peak) * (bottom - top);
    return { x, y, value };
  });
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <div className="dashboard-performance-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-labelledby="dashboard-performance-title dashboard-performance-description">
        <title id="dashboard-performance-title">Confirmed publishing activity this week</title>
        <desc id="dashboard-performance-description">Daily counts of live posts confirmed as published. Demo activity is excluded.</desc>
        {[0, 1, 2].map((step) => {
          const y = top + (step / 2) * (bottom - top);
          return <line key={step} x1="8" x2={width - 8} y1={y} y2={y} className="dashboard-performance-gridline" />;
        })}
        <polygon points={`8,${bottom} ${line} ${width - 8},${bottom}`} className="dashboard-performance-area" />
        <polyline points={line} className="dashboard-performance-line" />
        {points.map(({ x, y, value }, index) => (
          <circle key={index} cx={x} cy={y} r="3" className="dashboard-performance-point">
            <title>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index]}: {value} published</title>
          </circle>
        ))}
        {points.map(({ x }, index) => (
          <text key={index} x={x} y={height - 4} className="dashboard-performance-label" textAnchor="middle">
            {["M", "T", "W", "T", "F", "S", "S"][index]}
          </text>
        ))}
      </svg>
    </div>
  );
}

const shortcuts = [
  { label: "Plan your content", href: "/dashboard/content-plans", icon: CalendarDays },
  { label: "Review drafts", href: "/dashboard/content", icon: FileText },
  { label: "Connect accounts", href: "/dashboard/social-accounts", icon: Camera },
  { label: "Manage campaigns", href: "/dashboard/campaigns", icon: Send },
];

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [brain, setBrain] = useState<BrainPreview | null>(null);
  const [activity, setActivity] = useState<DashboardActivity | null>(null);
  const [approvals, setApprovals] = useState<DashboardApproval[] | null>(null);
  const [approvalError, setApprovalError] = useState("");
  const [error, setError] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<DashboardData>("/api/dashboard")
      .then((response) => { if (active) setData(response); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load your workspace.");
      });

    apiRequest<BrainPreview>("/api/marketing-brain")
      .then((response) => { if (active) setBrain(response); })
      .catch(() => { if (active) setBrain(null); });

    apiRequest<{ approvals: DashboardApproval[] }>("/api/posts/approvals?status=pending&brandId=all")
      .then((response) => { if (active) setApprovals(response.approvals); })
      .catch((requestError: unknown) => {
        if (active) setApprovalError(requestError instanceof Error ? requestError.message : "Could not load approval requests.");
      });

    Promise.all([
      apiRequest<{ posts: Post[] }>("/api/posts?brandId=all&limit=100"),
      apiRequest<{ items: Array<{ status: string }> }>("/api/content?brandId=all"),
      apiRequest<{ accounts: SocialAccount[] }>("/api/social-accounts"),
    ])
      .then(([postResponse, contentResponse, accountResponse]) => {
        if (!active) return;
        const now = new Date();
        const posts = postResponse.posts;
        const isFailed = (post: Post) =>
          post.status === "FAILED" || post.targets.some((target) => target.status === "FAILED");
        const failedPosts = posts.filter(isFailed);
        const publishedPosts = posts.filter((post) =>
          !isFailed(post) && (post.status === "PUBLISHED" || post.targets.some((target) => target.status === "PUBLISHED")),
        );
        const draftPosts = posts.filter((post) => !isFailed(post) && post.status === "DRAFT");
        const upcomingPosts = posts
          .filter((post) => !isFailed(post) && post.status === "SCHEDULED" && post.scheduledAt && new Date(post.scheduledAt) >= now)
          .sort((first, second) => new Date(first.scheduledAt!).getTime() - new Date(second.scheduledAt!).getTime());
        const startOfWeek = getWeekStart(now);
        const dailyPublished = Array.from({ length: 7 }, (_, index) => {
          const date = new Date(startOfWeek);
          date.setDate(startOfWeek.getDate() + index);
          return new Set(posts.filter((post) =>
            post.targets.some((target) =>
              target.publishingMode === "live" &&
              (target.status === "PUBLISHED" || target.status === "DELETED_ON_PLATFORM") &&
              target.publishedAt &&
              sameDay(new Date(target.publishedAt), date),
            ),
          ).map((post) => post.id)).size;
        });
        setActivity({
          draftCount: contentResponse.items.filter((item) => item.status === "DRAFT").length,
          draftPostCount: draftPosts.length,
          scheduledCount: upcomingPosts.length,
          publishedCount: publishedPosts.length,
          failedCount: failedPosts.length,
          dailyPublished,
          upcomingPosts,
          accounts: accountResponse.accounts,
        });
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load your publishing activity.");
      });
    return () => { active = false; };
  }, []);

  const weekDays = useMemo(() => {
    const start = getWeekStart(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [weekOffset]);

  const dateRange = `${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(weekDays[0]!)} – ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(weekDays[6]!)}`;
  const recommendation = brain?.recommendations[0];
  const scheduledCount = activity?.scheduledCount ?? 0;
  const publishedCount = activity?.publishedCount ?? 0;
  const draftCount = activity?.draftCount ?? 0;
  const failedCount = activity?.failedCount ?? 0;

  return (
    <section className="dashboard-content workspace-dashboard">
      <header className="dashboard-welcome">
        <div className="dashboard-welcome-copy">
          <p className="eyebrow">YOUR MARKETING STUDIO</p>
          <h1>Good morning, Team <span aria-hidden="true">👋</span></h1>
          <p>Your AI-powered workspace for planning, creating, and scheduling on-brand content.</p>
        </div>
        <div className="dashboard-welcome-actions">
          <Link className="button button-outline" href="/dashboard/calendar"><CalendarDays size={16} aria-hidden="true" /> View calendar</Link>
          <Link className="button button-gold" href="/dashboard/templates"><Sparkles size={16} aria-hidden="true" /> Create with AI</Link>
        </div>
      </header>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {data?.trialExpired && <div className="notice notice-gold">Your trial has ended. You can still view your workspace; upgrade to create or schedule content.</div>}

      <section className="dashboard-stat-grid" aria-label="Publishing statistics">
        <article className="dashboard-stat-card">
          <span>Upcoming posts</span><strong>{activity ? scheduledCount : "—"}</strong>
          <small>{activity?.upcomingPosts[0]?.scheduledAt
            ? `Next · ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(activity.upcomingPosts[0].scheduledAt))}`
            : "Ready when you are"}</small>
          <span className="dashboard-stat-icon"><CalendarDays size={21} aria-hidden="true" /></span>
        </article>
        <article className="dashboard-stat-card">
          <span>Published posts</span><strong>{activity ? publishedCount : "—"}</strong>
          <small>Across connected channels</small>
          <span className="dashboard-stat-icon"><CheckCircle2 size={21} aria-hidden="true" /></span>
        </article>
        <article className="dashboard-stat-card">
          <span>Content drafts</span><strong>{activity ? draftCount : "—"}</strong>
          <small>Saved and ready to review</small>
          <span className="dashboard-stat-icon"><FileText size={21} aria-hidden="true" /></span>
        </article>
        <article className="dashboard-stat-card">
          <span>Needs attention</span><strong>{activity ? failedCount : "—"}</strong>
          <small>{failedCount ? "Review publishing issues" : "No failed posts"}</small>
          <span className="dashboard-stat-icon"><CircleAlert size={21} aria-hidden="true" /></span>
        </article>
      </section>

      <div className="dashboard-main-grid">
        <section className="dashboard-panel dashboard-calendar-panel" aria-label="Content calendar">
          <div className="dashboard-panel-heading">
            <div><h2>Content calendar</h2><p>Your scheduled posts for the week</p></div>
            <div className="dashboard-week-controls">
              <button type="button" aria-label="Previous week" onClick={() => setWeekOffset((offset) => offset - 1)}><ChevronLeft size={16} /></button>
              <span>{dateRange}</span>
              <button type="button" aria-label="Next week" onClick={() => setWeekOffset((offset) => offset + 1)}><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="dashboard-week-grid">
            {weekDays.map((date) => {
              const dayPosts = activity?.upcomingPosts.filter((post) =>
                post.scheduledAt && sameDay(new Date(post.scheduledAt), date),
              ) ?? [];
              return (
                <article className={`dashboard-day-column${sameDay(date, new Date()) ? " is-today" : ""}`} key={date.toISOString()}>
                  <div className="dashboard-day-heading">
                    <span>{new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date)}</span>
                    <strong>{date.getDate()}</strong>
                  </div>
                  <div className="dashboard-day-posts">
                    {dayPosts.map((post) => (
                      <Link className="dashboard-post-chip" href="/dashboard/posts" key={post.id} title={post.title}>
                        <span className="dashboard-post-chip-top"><span>{post.targets[0]?.platform ?? "Post"}</span><Clock3 size={11} aria-hidden="true" /></span>
                        <strong>{post.title}</strong>
                        <small>{postTime(post)}</small>
                      </Link>
                    ))}
                    {dayPosts.length === 0 && <p className="dashboard-no-posts">{sameDay(date, new Date()) ? "Your day is open" : "No posts"}</p>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="dashboard-side-stack">
          <section className="dashboard-panel dashboard-ai-card" aria-label="AI recommendation">
            <div className="dashboard-ai-heading"><span className="dashboard-ai-icon"><Sparkles size={17} aria-hidden="true" /></span><h2>AI marketing assistant</h2></div>
            {recommendation ? <>
              <strong className="dashboard-ai-title">{recommendation.title}</strong>
              <p>{recommendation.explanation}</p>
              <Link className="dashboard-ai-link" href={recommendation.actionHref}>{recommendation.actionLabel}<ArrowRight size={13} aria-hidden="true" /></Link>
            </> : <>
              <strong className="dashboard-ai-title">Build your strategy from your brand</strong>
              <p>{brain?.contextSummary.analyticsAvailable
                ? "There are no new recommendations right now. Check back as your content performance changes."
                : "Complete your brand profile to get recommendations tailored to your business."}</p>
              <Link className="dashboard-ai-link" href={brain?.contextSummary.analyticsAvailable ? "/dashboard/marketing-brain" : "/onboarding"}>
                {brain?.contextSummary.analyticsAvailable ? "Explore marketing brain" : "Complete your profile"}<ArrowRight size={13} aria-hidden="true" />
              </Link>
            </>}
          </section>

          <section className="dashboard-panel dashboard-approvals-card" aria-label="Approval queue">
            <div className="dashboard-panel-heading">
              <div><h2>Approval queue</h2><p>{approvals ? `${approvals.length} waiting for review` : "Pending review"}</p></div>
            </div>
            {approvalError ? (
              <p className="dashboard-panel-empty" role="status">{approvalError}</p>
            ) : approvals === null ? (
              <p className="dashboard-panel-empty" role="status">Loading approval requests…</p>
            ) : approvals.length ? (
              <div className="dashboard-approval-list">
                {approvals.slice(0, 3).map((approval) => (
                  <Link className="dashboard-approval-item" href="/dashboard/approvals" key={approval.id}>
                    <span className="dashboard-approval-icon"><FileText size={15} aria-hidden="true" /></span>
                    <span className="dashboard-approval-copy">
                      <strong>{approval.post.title ?? "Untitled post"}</strong>
                      <small>{approval.post.brand.name}{approval.post.targets.length ? ` · ${approval.post.targets.map((target) => target.platform).join(", ")}` : ""}</small>
                    </span>
                    <ArrowRight size={13} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="dashboard-panel-empty">No posts are waiting for approval.</p>
            )}
          </section>

          <section className="dashboard-panel" aria-label="Instagram connection">
            <div className="dashboard-panel-heading"><div><h2>Social accounts</h2><p>Publishing connections</p></div><Link href="/dashboard/social-accounts">Manage <ArrowRight size={13} aria-hidden="true" /></Link></div>
            <div className="dashboard-account-row">
              <span className="dashboard-account-provider"><PlatformIcon platform="Instagram" />Instagram</span>
              {activity?.accounts.some((account) => account.status === "CONNECTED")
                ? <span className="dashboard-account-state"><CheckCircle2 size={13} />Connected</span>
                : <Link className="dashboard-account-state is-disconnected" href="/dashboard/social-accounts">Connect <ArrowRight size={12} /></Link>}
            </div>
            {activity?.accounts.filter((account) => account.status === "CONNECTED").map((account) => (
              <p className="dashboard-account-name" key={account.id}>{account.displayName ?? "Instagram account"}</p>
            ))}
          </section>
        </aside>
      </div>

      <section className="dashboard-panel dashboard-analytics-panel" aria-label="Publishing analytics">
        <div className="dashboard-panel-heading">
          <div><h2>Publishing analytics</h2><p>Confirmed live posts this week</p></div>
          <Link href="/dashboard/analytics">View analytics <ArrowRight size={13} aria-hidden="true" /></Link>
        </div>
        {activity
          ? <>
              <div className="dashboard-performance-summary"><strong>{activity.dailyPublished.reduce((sum, count) => sum + count, 0)}</strong><span>live posts confirmed this week</span></div>
              <DashboardPerformanceChart values={activity.dailyPublished} />
              {!activity.dailyPublished.some((count) => count > 0) && <p className="dashboard-chart-empty">The chart will update after a connected platform confirms a published post.</p>}
            </>
          : <p className="dashboard-panel-empty" role="status">Loading live publishing analytics…</p>}
      </section>

      <div className="dashboard-bottom-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading"><div><h2>Your content pipeline</h2><p>Track the work from draft to publication</p></div></div>
          <div className="dashboard-pipeline">
            <div className="dashboard-pipeline-step"><span className="dashboard-pipeline-icon"><Sparkles size={16} /></span><span><strong>Drafts</strong><small>{activity ? draftCount : "—"} to review</small></span></div>
            <div className="dashboard-pipeline-step"><span className="dashboard-pipeline-icon"><Clock3 size={16} /></span><span><strong>Scheduled</strong><small>{activity ? scheduledCount : "—"} in queue</small></span></div>
            <div className="dashboard-pipeline-step"><span className="dashboard-pipeline-icon"><CheckCircle2 size={16} /></span><span><strong>Published</strong><small>{activity ? publishedCount : "—"} completed</small></span></div>
          </div>
        </section>
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading"><div><h2>Quick access</h2><p>Pick up where you left off</p></div></div>
          <div className="dashboard-shortcuts">
            {shortcuts.map((shortcut) => <Link className="dashboard-shortcut" href={shortcut.href} key={shortcut.href}><shortcut.icon size={16} aria-hidden="true" />{shortcut.label}<Plus size={13} aria-hidden="true" /></Link>)}
          </div>
        </section>
      </div>

      {data && data.trialDaysRemaining > 0 && data.subscriptionStatus === "trialing" && (
        <p className="dashboard-trial-note">Your trial has {data.trialDaysRemaining} {data.trialDaysRemaining === 1 ? "day" : "days"} left. <Link href="/pricing">Explore plans <ArrowRight size={12} /></Link></p>
      )}
    </section>
  );
}

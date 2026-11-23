"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FileVideo2,
  Clock3,
  FileText,
  FolderOpen,
  Image,
  Search,
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

type SocialAccount = { id: string; displayName: string | null; status: string };
type DashboardCompetitor = { id: string; name: string; websiteUrl: string | null; snapshots: Array<{ observations: { posts: Array<{ url: string; topic: string; format: string; metrics: { views?: number; likes?: number; comments?: number } }> } }> };
type CompetitorPreview = { competitors: DashboardCompetitor[] };
type AutopilotPreview = { brand: { instagramAutopilotEnabled: boolean; instagramAutopilotNextRunAt: string | null }; latestRun: { status: string; error: string | null } | null; blockers: string[] };

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

const studioFeatures = [
  { label: "Create a post", detail: "Write and design on-brand content", href: "/dashboard/create", icon: Sparkles },
  { label: "Build a campaign", detail: "Plan around a goal or season", href: "/dashboard/campaigns", icon: CalendarDays },
  { label: "Create a video", detail: "Make product and brand videos", href: "/dashboard/videos", icon: FileVideo2 },
  { label: "Browse templates", detail: "Choose an editable layout", href: "/dashboard/templates", icon: Image },
  { label: "Open your gallery", detail: "Find saved brand assets", href: "/dashboard/gallery", icon: FolderOpen },
  { label: "Edit a saved design", detail: "Adjust artwork text and export", href: "/dashboard/designs", icon: Image },
  { label: "View calendar", detail: "Review the publishing schedule", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Marketing Brain", detail: "Turn brand and activity signals into next-step ideas", href: "/dashboard/marketing-brain", icon: Sparkles },
  { label: "Manage publishing", detail: "Review drafts, approvals, and scheduled posts", href: "/dashboard/posts", icon: FileText },
  { label: "Connect social channels", detail: "Manage the accounts used for publishing", href: "/dashboard/social-accounts", icon: FolderOpen },
];

export function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<DashboardActivity | null>(null);
  const [competitors, setCompetitors] = useState<DashboardCompetitor[]>([]);
  const [autopilot, setAutopilot] = useState<AutopilotPreview | null>(null);
  const [error, setError] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<DashboardData>("/api/dashboard")
      .then((response) => { if (active) setData(response); })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load your workspace.");
      });

    apiRequest<CompetitorPreview>("/api/competitors")
      .then((response) => { if (active) setCompetitors(response.competitors); })
      .catch(() => { if (active) setCompetitors([]); });
    apiRequest<AutopilotPreview>("/api/brand-profile/instagram-autopilot/status")
      .then((response) => { if (active) setAutopilot(response); })
      .catch(() => { if (active) setAutopilot(null); });

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
  const scheduledCount = activity?.scheduledCount ?? 0;
  const publishedCount = activity?.publishedCount ?? 0;
  const draftCount = activity?.draftCount ?? 0;
  const failedCount = activity?.failedCount ?? 0;

  return (
    <section className="dashboard-content workspace-dashboard">
      <header className="dashboard-welcome">
        <div className="dashboard-welcome-copy">
          <p className="eyebrow">YOUR MARKETING STUDIO</p>
          <h1>{data?.brand?.name ?? data?.workspace.name ?? "Your workspace"}</h1>
          <p>Your AI-powered workspace for planning, creating, and scheduling on-brand content.</p>
        </div>
        <div className="dashboard-welcome-actions">
          <Link className="button button-outline" href="/dashboard/calendar"><CalendarDays size={16} aria-hidden="true" /> View calendar</Link>
          <Link className="button button-gold" href="/dashboard/create"><Sparkles size={16} aria-hidden="true" /> Create content</Link>
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

      <section className="dashboard-product-grid" aria-label="Product features">
        <div className="dashboard-product-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2>What would you like to work on?</h2></div></div>
        <div className="dashboard-feature-grid">
          {studioFeatures.map((feature) => <Link className="dashboard-feature-card" href={feature.href} key={feature.href}>
            <span className="dashboard-feature-icon"><feature.icon size={19} aria-hidden="true" /></span>
            <span><strong>{feature.label}</strong><small>{feature.detail}</small></span><ArrowRight size={16} aria-hidden="true" />
          </Link>)}
        </div>
      </section>

      <div className="dashboard-insight-grid">
        <section className="dashboard-insight-card" aria-label="Competitor snapshot">
          <header><div><p className="eyebrow">MARKET SNAPSHOT</p><h2>Competitor intelligence</h2></div><Link href="/dashboard/competitors" aria-label="Open competitor intelligence"><ArrowRight size={17} /></Link></header>
          {competitors.length ? competitors.filter((competitor) => competitor.websiteUrl).slice(0, 3).map((competitor) => {
            const posts = competitor.snapshots.flatMap((snapshot) => snapshot.observations.posts);
            const strongest = [...posts].sort((a, b) => ((b.metrics.views ?? 0) + (b.metrics.likes ?? 0) + (b.metrics.comments ?? 0)) - ((a.metrics.views ?? 0) + (a.metrics.likes ?? 0) + (a.metrics.comments ?? 0)))[0];
            return <div className="dashboard-competitor-row" key={competitor.id}><strong>{competitor.name}</strong><span>{strongest ? `${strongest.format || "Post"}${strongest.topic ? ` · ${strongest.topic}` : ""} · ${strongest.metrics.views !== undefined ? `${strongest.metrics.views.toLocaleString()} views` : strongest.metrics.likes !== undefined ? `${strongest.metrics.likes.toLocaleString()} likes` : "metrics saved"}` : "No post performance recorded yet"}</span></div>;
          }) : <p className="dashboard-insight-empty">Add verified competitor profiles to see their standout content here.</p>}
          <Link className="dashboard-insight-link" href="/dashboard/competitors">View competitor findings <ArrowRight size={14} /></Link>
        </section>
        <section className="dashboard-insight-card" aria-label="Weekly Autopilot">
          <header><div><p className="eyebrow">WEEKLY CONTENT</p><h2>Autopilot</h2></div><Sparkles size={18} aria-hidden="true" /></header>
          <strong className="dashboard-autopilot-state">{autopilot?.brand.instagramAutopilotEnabled ? "Weekly generation is on" : "Weekly generation is off"}</strong>
          <p>{autopilot?.brand.instagramAutopilotEnabled
            ? autopilot.brand.instagramAutopilotNextRunAt ? `Next batch · ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(autopilot.brand.instagramAutopilotNextRunAt))}. Sent for your review.` : "The next brand-specific batch will be sent for your review."
            : autopilot?.blockers?.length ? autopilot.blockers[0] : "Turn on weekly generation in Publishing settings."}</p>
          <Link className="dashboard-insight-link" href={autopilot?.brand.instagramAutopilotEnabled ? "/dashboard/instagram-autopilot" : "/dashboard/settings/publishing"}>{autopilot?.brand.instagramAutopilotEnabled ? "View Autopilot" : "Set up Autopilot"} <ArrowRight size={14} /></Link>
        </section>
      </div>

      <section className="dashboard-panel dashboard-analytics-panel" aria-label="Publishing analytics">
        <div className="dashboard-panel-heading"><div><h2>Publishing activity</h2><p>Confirmed live posts this week</p></div><Link href="/dashboard/analytics">Open analytics <ArrowRight size={13} aria-hidden="true" /></Link></div>
        {activity ? <><div className="dashboard-performance-summary"><strong>{activity.dailyPublished.reduce((sum, count) => sum + count, 0)}</strong><span>live posts confirmed this week</span></div><DashboardPerformanceChart values={activity.dailyPublished} />{!activity.dailyPublished.some((count) => count > 0) && <p className="dashboard-chart-empty">Activity will appear after a connected platform confirms published posts.</p>}</> : <p className="dashboard-panel-empty" role="status">Loading publishing activity…</p>}
      </section>

      {activity?.upcomingPosts.length ? <section className="dashboard-upcoming-strip"><header><h2>Coming up</h2><Link href="/dashboard/calendar">Open calendar <ArrowRight size={13} /></Link></header>{activity.upcomingPosts.slice(0, 3).map((post) => <Link href="/dashboard/posts" key={post.id}><span>{post.title}</span><small>{post.scheduledAt ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: post.timezone || undefined }).format(new Date(post.scheduledAt)) : "Draft"}</small></Link>)}</section> : null}
      {data && data.trialDaysRemaining > 0 && data.subscriptionStatus === "trialing" && (
        <p className="dashboard-trial-note">Your trial has {data.trialDaysRemaining} {data.trialDaysRemaining === 1 ? "day" : "days"} left. <Link href="/pricing">Explore plans <ArrowRight size={12} /></Link></p>
      )}
    </section>
  );
}

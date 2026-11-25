"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  FileVideo2,
  FolderOpen,
  Image as ImageIcon,
  Lightbulb,
  Radio,
  Sparkles,
} from "lucide-react";
import { apiRequest } from "@/lib/api";

type DashboardData = {
  workspace: { id: string; name: string; trialEndsAt: string };
  brand: { id: string; name: string } | null;
  trialExpired: boolean;
  trialDaysRemaining: number;
};

type Post = {
  id: string;
  title: string;
  status: string;
  scheduledAt: string | null;
  timezone: string;
  targets: Array<{
    platform: string;
    status: string;
    publishedAt: string | null;
    publishingMode: "live" | "demo";
  }>;
};

type ConfirmedTarget = Post["targets"][number] & { publishedAt: string };

type Campaign = { id: string; name: string; startsAt: string; endsAt: string; status: string; campaign?: { lifecycle?: string } };

type DashboardActivity = {
  draftCount: number;
  failedCount: number;
  dailyPublished: number[];
  posts: Post[];
  scheduledPosts: Post[];
  campaigns: Campaign[];
};

type DashboardCompetitor = {
  id: string;
  name: string;
  websiteUrl: string | null;
  socialProfiles: Partial<Record<string, string>>;
  snapshots: Array<{
    observations: {
      posts: Array<{
        topic: string;
        format: string;
        metrics: { views?: number; likes?: number; comments?: number };
      }>;
    };
  }>;
};

type AutopilotPreview = {
  brand: {
    instagramAutopilotEnabled: boolean;
    instagramAutopilotNextRunAt: string | null;
  };
  blockers: string[];
};

type BrainPreview = {
  recommendations: Array<{ title: string; explanation: string; actionLabel: string; actionHref: string }>;
  priorities: string[];
};

type ConnectedAccountsPreview = {
  accounts: Array<{ id: string; provider: string; displayName: string; status: string }>;
};

type InstagramPreview = {
  posts: Array<{ likes: number | null; commentsCount: number | null; insights: Record<string, number | null> }>;
};

type DashboardState = {
  workspace: DashboardData;
  activity: DashboardActivity;
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

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function scheduledPostDateKey(post: Post) {
  if (!post.scheduledAt) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: post.timezone || undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(post.scheduledAt));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function confirmedLiveTargets(post: Post) {
  return post.targets.filter((target): target is ConfirmedTarget =>
    target.publishingMode === "live" &&
    (target.status === "PUBLISHED" || target.status === "DELETED_ON_PLATFORM") &&
    Boolean(target.publishedAt),
  );
}

function DashboardPerformanceChart({ values }: { values: number[] }) {
  const width = 760;
  const height = 160;
  const top = 16;
  const bottom = 126;
  const left = 34;
  const right = 8;
  const peak = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = left + (index / Math.max(1, values.length - 1)) * (width - left - right);
    const y = bottom - (value / peak) * (bottom - top);
    return { x, y, value };
  });
  const line = points.map(({ x, y }) => `${x},${y}`).join(" ");
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="dashboard-performance-chart">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-labelledby="dashboard-performance-title dashboard-performance-description">
        <title id="dashboard-performance-title">Confirmed publishing activity this week</title>
        <desc id="dashboard-performance-description">Daily counts of live posts confirmed as published. Demo activity is excluded.</desc>
        {[0, 1, 2].map((step) => {
          const y = top + (step / 2) * (bottom - top);
          const label = Math.round(peak * (1 - step / 2));
          return <g key={step}>
            <line x1={left} x2={width - right} y1={y} y2={y} className="dashboard-performance-gridline" />
            <text x="2" y={y + 3} className="dashboard-performance-axis-label">{label}</text>
          </g>;
        })}
        <polygon points={`${left},${bottom} ${line} ${width - right},${bottom}`} className="dashboard-performance-area" />
        <polyline points={line} className="dashboard-performance-line" />
        {points.map(({ x, y, value }, index) => (
          <circle key={index} cx={x} cy={y} r="3" className="dashboard-performance-point">
            <title>{weekdays[index]}: {value} published</title>
          </circle>
        ))}
        {points.map(({ x }, index) => (
          <text key={index} x={x} y={height - 4} className="dashboard-performance-label" textAnchor="middle">
            {weekdays[index]}
          </text>
        ))}
      </svg>
    </div>
  );
}

function DashboardMiniCalendar({ posts, campaigns, error }: { posts: Post[] | null; campaigns: Campaign[]; error: string }) {
  const [month, setMonth] = useState(() => new Date(2000, 0, 1));
  const [today, setToday] = useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const current = new Date();
      const currentDay = new Date(current.getFullYear(), current.getMonth(), current.getDate());
      setToday(currentDay);
      setMonth(new Date(current.getFullYear(), current.getMonth(), 1));
      setSelectedDay(dateKey(currentDay));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleDays = Array.from({ length: 42 }, (_, index) =>
    new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay() + index),
  );
  const postsByDay = new Map<string, Post[]>();
  for (const post of posts ?? []) {
    if (post.status !== "SCHEDULED") continue;
    const key = scheduledPostDateKey(post);
    if (!key) continue;
    const dayPosts = postsByDay.get(key) ?? [];
    dayPosts.push(post);
    postsByDay.set(key, dayPosts);
  }
  const campaignsByDay = new Map<string, Campaign[]>();
  for (const campaign of campaigns) {
    const start = new Date(campaign.startsAt);
    const end = new Date(campaign.endsAt);
    for (const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate()); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const key = dateKey(cursor);
      const entries = campaignsByDay.get(key) ?? [];
      entries.push(campaign);
      campaignsByDay.set(key, entries);
    }
  }
  const selectedPosts = postsByDay.get(selectedDay) ?? [];
  const selectedCampaigns = [...new Map((campaignsByDay.get(selectedDay) ?? []).map((campaign) => [campaign.id, campaign])).values()];
  const selectedDate = selectedDay
    ? new Date(Number(selectedDay.slice(0, 4)), Number(selectedDay.slice(5, 7)) - 1, Number(selectedDay.slice(8, 10)))
    : null;
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(month);
  const todayKey = today ? dateKey(today) : "";

  function moveMonth(amount: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
  }

  return (
    <section className="dashboard-mini-calendar" aria-labelledby="dashboard-mini-calendar-title">
      <header className="dashboard-mini-calendar-header">
        <div>
          <p className="eyebrow">Your schedule</p>
          <h2 id="dashboard-mini-calendar-title">Publishing calendar</h2>
        </div>
        <Link href="/dashboard/calendar">Open calendar <ArrowRight size={14} aria-hidden="true" /></Link>
      </header>
      <div className="dashboard-mini-calendar-month">
        <button type="button" className="dashboard-mini-calendar-arrow" aria-label="Previous month" onClick={() => moveMonth(-1)}>
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <strong aria-live="polite">{monthLabel}</strong>
        <button type="button" className="dashboard-mini-calendar-arrow" aria-label="Next month" onClick={() => moveMonth(1)}>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
      <div className="dashboard-mini-calendar-grid" role="group" aria-label={monthLabel}>
        {["S", "M", "T", "W", "T", "F", "S"].map((weekday, index) => (
          <span className="dashboard-mini-calendar-weekday" key={`${weekday}-${index}`}>{weekday}</span>
        ))}
        {visibleDays.map((date) => {
          const key = dateKey(date);
          const count = postsByDay.get(key)?.length ?? 0;
          const campaignCount = campaignsByDay.get(key)?.length ?? 0;
          const inMonth = date.getMonth() === month.getMonth();
          return (
            <button
              type="button"
              className={[
                "dashboard-mini-calendar-day",
                inMonth ? "" : "is-outside-month",
                key === todayKey ? "is-today" : "",
                key === selectedDay ? "is-selected" : "",
                count ? "has-posts" : "",
                campaignsByDay.has(key) ? "has-campaigns" : "",
              ].filter(Boolean).join(" ")}
              key={key}
              aria-current={key === todayKey ? "date" : undefined}
              aria-pressed={key === selectedDay}
              aria-label={`${new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date)}${count ? `, ${count} scheduled ${count === 1 ? "post" : "posts"}` : ""}${campaignCount ? `, ${campaignCount} campaign ${campaignCount === 1 ? "activity" : "activities"}` : ""}`}
              onClick={() => {
                setSelectedDay(key);
                if (!inMonth) setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
              }}
            >
              <span>{date.getDate()}</span>
              {(count > 0 || campaignsByDay.has(key)) && <i aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="dashboard-mini-calendar-selection" aria-live="polite">
        <strong>{selectedDate
          ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(selectedDate)
          : "Select a date"}</strong>
        {error
          ? <span role="alert">Your schedule could not be loaded.</span>
          : posts === null
          ? <span>Loading your schedule…</span>
          : selectedPosts.length || selectedCampaigns.length
            ? <div className="dashboard-mini-calendar-posts">
              {selectedPosts.slice(0, 2).map((post) => (
                <Link href="/dashboard/posts" key={post.id}>
                  <span>{post.title}</span>
                  <time dateTime={post.scheduledAt ?? undefined}>
                    {post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: post.timezone || undefined,
                    }) : ""}
                  </time>
                </Link>
              ))}
              {selectedPosts.length > 2 && <span className="dashboard-mini-calendar-more">+{selectedPosts.length - 2} more scheduled</span>}
              {selectedCampaigns.map((campaign) => <Link className="dashboard-mini-calendar-campaign" href="/dashboard/campaigns" key={campaign.id}>
                <span>{campaign.name}</span><small>Campaign · {(campaign.campaign?.lifecycle ?? campaign.status).toLowerCase().replaceAll("_", " ")}</small>
              </Link>)}
            </div>
            : <span>No posts scheduled for this day.</span>}
      </div>
    </section>
  );
}

const studioFeatures = [
  { label: "Create a post", detail: "Write and design on-brand content", href: "/dashboard/create", icon: Sparkles },
  { label: "Build a campaign", detail: "Plan around a goal or season", href: "/dashboard/campaigns", icon: CalendarDays },
  { label: "Create a video", detail: "Make product and brand videos", href: "/dashboard/videos", icon: FileVideo2 },
  { label: "Browse templates", detail: "Choose an editable layout", href: "/dashboard/templates", icon: ImageIcon },
  { label: "Open your gallery", detail: "Find saved brand assets", href: "/dashboard/gallery", icon: FolderOpen },
  { label: "Edit a saved design", detail: "Adjust artwork text and export", href: "/dashboard/designs", icon: ImageIcon },
  { label: "View calendar", detail: "Review your publishing schedule", href: "/dashboard/calendar", icon: CalendarDays },
  { label: "Marketing Brain", detail: "Turn brand and activity signals into next-step ideas", href: "/dashboard/marketing-brain", icon: Sparkles },
  { label: "Manage publishing", detail: "Review drafts, approvals, and scheduled posts", href: "/dashboard/posts", icon: FileText },
  { label: "Connect social channels", detail: "Manage the accounts used for publishing", href: "/dashboard/social-accounts", icon: FolderOpen },
];

export function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [competitors, setCompetitors] = useState<DashboardCompetitor[] | null>(null);
  const [competitorError, setCompetitorError] = useState("");
  const [autopilot, setAutopilot] = useState<AutopilotPreview | null>(null);
  const [autopilotError, setAutopilotError] = useState("");
  const [brain, setBrain] = useState<BrainPreview | null>(null);
  const [brainError, setBrainError] = useState("");
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccountsPreview["accounts"] | null>(null);
  const [accountsError, setAccountsError] = useState("");
  const [instagram, setInstagram] = useState<InstagramPreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest<{ competitors: DashboardCompetitor[] }>("/api/competitors")
      .then(({ competitors: loaded }) => { if (active) setCompetitors(loaded); })
      .catch((requestError: unknown) => {
        if (active) setCompetitorError(requestError instanceof Error ? requestError.message : "Could not load competitor findings.");
      });
    apiRequest<AutopilotPreview>("/api/brand-profile/instagram-autopilot/status")
      .then((response) => { if (active) setAutopilot(response); })
      .catch((requestError: unknown) => {
        if (active) setAutopilotError(requestError instanceof Error ? requestError.message : "Could not load Autopilot status.");
      });
    apiRequest<BrainPreview>("/api/marketing-brain")
      .then((response) => { if (active) setBrain(response); })
      .catch((requestError: unknown) => {
        if (active) setBrainError(requestError instanceof Error ? requestError.message : "Could not load the next marketing recommendation.");
      });
    apiRequest<ConnectedAccountsPreview>("/api/social-accounts")
      .then((response) => {
        if (!active) return;
        setConnectedAccounts(response.accounts);
        if (response.accounts.some((account) => account.provider === "instagram" && account.status === "CONNECTED")) {
          apiRequest<InstagramPreview>("/api/listening")
            .then((insights) => { if (active) setInstagram(insights); })
            .catch(() => { if (active) setInstagram(null); });
        }
      })
      .catch((requestError: unknown) => {
        if (active) setAccountsError(requestError instanceof Error ? requestError.message : "Could not load connected channels.");
      });
    Promise.all([
      apiRequest<DashboardData>("/api/dashboard"),
      apiRequest<{ posts: Post[] }>("/api/posts?brandId=all&limit=500"),
      apiRequest<{ items: Array<{ status: string }> }>("/api/content?brandId=all"),
      apiRequest<{ campaigns: Campaign[] }>("/api/campaigns").catch(() => ({ campaigns: [] })),
    ])
      .then(([workspace, postResponse, contentResponse, campaignResponse]) => {
        if (!active) return;

        const now = new Date();
        const posts = postResponse.posts;
        const isFailed = (post: Post) =>
          post.status === "FAILED" || post.targets.some((target) => target.status === "FAILED");
        const failedPosts = posts.filter(isFailed);
        const scheduledPosts = posts.filter((post) => post.status === "SCHEDULED" && post.scheduledAt);
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

        setDashboard({
          workspace,
          activity: {
            draftCount: contentResponse.items.filter((item) => item.status === "DRAFT").length,
            failedCount: failedPosts.length,
            dailyPublished,
            posts,
            scheduledPosts,
            campaigns: campaignResponse.campaigns,
          },
        });
      })
      .catch((requestError: unknown) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load your dashboard.");
      });

    return () => { active = false; };
  }, []);

  const workspace = dashboard?.workspace;
  const activity = dashboard?.activity;
  const verifiedCompetitors = competitors?.filter((competitor) => competitor.websiteUrl) ?? [];
  const recentPosts = [...(activity?.posts ?? [])]
    .map((post) => {
      const failed = post.status === "FAILED" || post.targets.some((target) => target.status === "FAILED");
      const publishedTargets = confirmedLiveTargets(post);
      const publishedAt = publishedTargets
        .map((target) => target.publishedAt)
        .filter((value): value is string => Boolean(value))
        .sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0] ?? null;
      return { post, failed, publishedAt };
    })
    .filter(({ failed, publishedAt }) => failed || publishedAt)
    .sort((first, second) => {
      if (first.failed !== second.failed) return first.failed ? -1 : 1;
      return new Date(second.publishedAt ?? 0).getTime() - new Date(first.publishedAt ?? 0).getTime();
    })
    .slice(0, 5);
  const upcomingPosts = [...(activity?.scheduledPosts ?? [])]
    .sort((first, second) => new Date(first.scheduledAt ?? 0).getTime() - new Date(second.scheduledAt ?? 0).getTime())
    .slice(0, 4);
  const campaignCutoff = new Date();
  campaignCutoff.setHours(0, 0, 0, 0);
  const upcomingCampaigns = [...(activity?.campaigns ?? [])]
    .filter((campaign) => new Date(campaign.endsAt).getTime() >= campaignCutoff.getTime() && (campaign.campaign?.lifecycle ?? campaign.status).toUpperCase() !== "COMPLETED")
    .sort((first, second) => new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime())
    .slice(0, 3);
  const weekStart = getWeekStart(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const publishedThisWeek = activity?.posts.filter((post) =>
    confirmedLiveTargets(post).some((target) => {
      const publishedAt = new Date(target.publishedAt);
      return publishedAt >= weekStart && publishedAt < weekEnd;
    }),
  ).length ?? 0;
  const instagramTotals = instagram?.posts.reduce((totals, post) => ({
    likes: totals.likes + (post.likes ?? 0),
    comments: totals.comments + (post.commentsCount ?? 0),
  }), { likes: 0, comments: 0 });
  const activeAccounts = connectedAccounts?.filter((account) => account.status === "CONNECTED") ?? [];
  const nextRecommendation = brain?.recommendations[0];

  return (
    <section className="dashboard-content workspace-dashboard dashboard-redesign">
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow"><span className="dashboard-hero-dot" /> {workspace?.brand?.name ?? "Your creative workspace"}</p>
          <h1>Your publishing <span>week</span></h1>
          <p>{workspace?.brand?.name
            ? `Plan, publish, and review content for ${workspace.brand.name}.`
            : "Keep upcoming posts, publishing activity, and creative work moving in one place."}</p>
          <div className="dashboard-hero-actions">
            <Link className="button button-gold" href="/dashboard/create"><Sparkles size={16} aria-hidden="true" /> Start creating <ArrowRight size={15} aria-hidden="true" /></Link>
            <Link className="dashboard-hero-secondary" href="/dashboard/analytics">See publishing activity <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </div>
        <Link className="dashboard-hero-next" href={upcomingPosts.length ? "/dashboard/posts" : "/dashboard/calendar"}>
          <span className="dashboard-hero-next-icon"><CalendarClock size={18} aria-hidden="true" /></span>
          <span><small>{upcomingPosts.length ? "Next scheduled" : "Schedule"}</small><strong>{upcomingPosts.length ? upcomingPosts[0]?.title || "Untitled post" : "Plan your next post"}</strong><em>{upcomingPosts.length && upcomingPosts[0]?.scheduledAt
            ? new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: upcomingPosts[0].timezone || undefined }).format(new Date(upcomingPosts[0].scheduledAt))
            : "Open publishing calendar"}</em></span>
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
        <div className="dashboard-hero-art" aria-hidden="true">
          <div className="dashboard-art-orbit" />
          <div className="dashboard-art-card dashboard-art-card-back"><ImageIcon size={20} aria-hidden="true" /><span>Image</span></div>
          <div className="dashboard-art-card dashboard-art-card-front"><FileVideo2 size={22} /><span>Video</span><i /></div>
          <div className="dashboard-art-card dashboard-art-card-side"><Sparkles size={18} /><span>Design</span></div>
          <span className="dashboard-art-spark dashboard-art-spark-one">✦</span>
          <span className="dashboard-art-spark dashboard-art-spark-two">✧</span>
        </div>
      </header>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {workspace?.trialExpired && <div className="notice notice-gold">Your trial has ended. You can still view your workspace; upgrade to create or schedule content.</div>}

      <section className="dashboard-stat-grid dashboard-redesign-stats" aria-label="Publishing overview">
        <article className="dashboard-stat-card">
          <span>Drafts</span><strong>{activity ? activity.draftCount : "—"}</strong>
          <small>Saved content</small>
          <span className="dashboard-stat-icon"><FileText size={21} aria-hidden="true" /></span>
        </article>
        <article className="dashboard-stat-card">
          <span>Scheduled</span><strong>{activity ? activity.scheduledPosts.length : "—"}</strong>
          <small>Posts in your queue</small>
          <span className="dashboard-stat-icon"><CalendarClock size={21} aria-hidden="true" /></span>
        </article>
        <article className="dashboard-stat-card">
          <span>Published this week</span><strong>{activity ? publishedThisWeek : "—"}</strong>
          <small>Confirmed on connected channels</small>
          <span className="dashboard-stat-icon"><CheckCircle2 size={21} aria-hidden="true" /></span>
        </article>
        <article className="dashboard-stat-card dashboard-stat-card-attention">
          <span>Needs attention</span><strong>{activity ? activity.failedCount : "—"}</strong>
          <small>{activity?.failedCount ? "Publishing issues to review" : "No failed posts"}</small>
          <span className="dashboard-stat-icon"><CircleAlert size={21} aria-hidden="true" /></span>
        </article>
      </section>

      <div className="dashboard-priority-grid">
        <section className="dashboard-panel dashboard-analytics-panel" aria-label="Publishing analytics">
          <div className="dashboard-panel-heading">
            <div><p className="eyebrow">Performance</p><h2>Publishing activity</h2><p>Confirmed live posts · this week</p></div>
            <Link href="/dashboard/analytics">Open analytics <ArrowRight size={13} aria-hidden="true" /></Link>
          </div>
          {activity ? (
            <>
              <div className="dashboard-performance-summary">
                <strong>{publishedThisWeek}</strong>
                <span>posts confirmed on connected channels</span>
              </div>
              <DashboardPerformanceChart values={activity.dailyPublished} />
              {!activity.dailyPublished.some((count) => count > 0) && <p className="dashboard-chart-empty">Activity will appear after a connected platform confirms published posts.</p>}
            </>
          ) : <p className="dashboard-panel-empty" role={error ? "alert" : "status"}>{error ? "Publishing activity could not be loaded." : "Loading publishing activity…"}</p>}
        </section>

        <div className="dashboard-side-stack">
          <section className="dashboard-panel dashboard-upcoming-panel" aria-labelledby="dashboard-upcoming-title">
            <header className="dashboard-panel-heading">
              <div><p className="eyebrow">Next in queue</p><h2 id="dashboard-upcoming-title">Upcoming posts</h2></div>
              <Link href="/dashboard/posts">View posts <ArrowRight size={13} aria-hidden="true" /></Link>
            </header>
            {!activity
              ? <p className="dashboard-panel-empty" role="status">Loading scheduled posts…</p>
              : upcomingPosts.length
                ? <div className="dashboard-upcoming-list">
                  {upcomingPosts.map((post) => {
                    const scheduled = new Date(post.scheduledAt as string);
                    const platforms = [...new Set(post.targets.map((target) => target.platform))];
                    const scheduleDate = new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone: post.timezone || undefined }).format(scheduled);
                    const scheduleMonth = new Intl.DateTimeFormat(undefined, { month: "short", timeZone: post.timezone || undefined }).format(scheduled);
                    return <Link className="dashboard-upcoming-item" href="/dashboard/posts" key={post.id}>
                      <span className="dashboard-upcoming-date"><strong>{scheduleDate}</strong><small>{scheduleMonth}</small></span>
                      <span className="dashboard-upcoming-copy"><strong>{post.title || "Untitled post"}</strong><small>{platforms.length ? platforms.join(" · ") : "Scheduled post"}</small></span>
                      <time dateTime={post.scheduledAt ?? undefined}>{post.scheduledAt ? new Date(post.scheduledAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone: post.timezone || undefined }) : ""}</time>
                    </Link>;
                  })}
                </div>
                : <div className="dashboard-empty-state"><p>No posts are scheduled yet</p><Link href="/dashboard/calendar">Plan a post <ArrowRight size={13} aria-hidden="true" /></Link></div>}
          </section>

        </div>
      </div>

      <section className="dashboard-panel dashboard-campaign-panel dashboard-campaign-wide-panel" aria-labelledby="dashboard-campaigns-title">
        <header className="dashboard-panel-heading">
          <div><p className="eyebrow">Campaign planner</p><h2 id="dashboard-campaigns-title">Campaigns</h2><p>Upcoming activity across your saved campaigns.</p></div>
          <Link href="/dashboard/campaigns" aria-label="View campaigns">View all <ArrowRight size={13} aria-hidden="true" /></Link>
        </header>
        {!activity
          ? <p className="dashboard-panel-empty" role="status">Loading campaigns…</p>
          : upcomingCampaigns.length
            ? <div className="dashboard-campaign-list">
              {upcomingCampaigns.map((campaign) => <Link className="dashboard-campaign-item" href="/dashboard/campaigns" key={campaign.id}>
                <span><strong>{campaign.name}</strong><small>{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(campaign.startsAt))} – {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(campaign.endsAt))}</small></span>
                <em>{(campaign.campaign?.lifecycle ?? campaign.status).toLowerCase().replaceAll("_", " ")}</em>
              </Link>)}
            </div>
            : <div className="dashboard-empty-state"><p>No campaigns to preview</p><Link href="/dashboard/campaigns">Create a campaign <ArrowRight size={13} aria-hidden="true" /></Link></div>}
      </section>

      <div className="dashboard-schedule-grid">
        <DashboardMiniCalendar posts={activity?.scheduledPosts ?? null} campaigns={activity?.campaigns ?? []} error={error} />
        <section className="dashboard-panel dashboard-recent-panel" aria-labelledby="dashboard-recent-title">
          <header className="dashboard-panel-heading">
            <div><p className="eyebrow">Workspace activity</p><h2 id="dashboard-recent-title">Recent publishing</h2></div>
            <Link href="/dashboard/posts">Open publishing <ArrowRight size={13} aria-hidden="true" /></Link>
          </header>
          {!activity
            ? <p className="dashboard-panel-empty" role={error ? "alert" : "status"}>{error ? "Recent posts could not be loaded." : "Loading recent posts…"}</p>
            : recentPosts.length
              ? <div className="dashboard-recent-list">
                {recentPosts.map(({ post, failed, publishedAt }) => <Link className="dashboard-recent-item" href="/dashboard/posts" key={post.id}>
                  <span className={`dashboard-recent-mark${failed ? " is-failed" : ""}`}>{failed ? <CircleAlert size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}</span>
                  <span className="dashboard-recent-copy"><strong>{post.title || "Untitled post"}</strong><small>{failed ? "Needs attention" : [...new Set(confirmedLiveTargets(post).map((target) => target.platform))].join(" · ") || "Published"}</small></span>
                  {publishedAt && <time dateTime={publishedAt}>{new Date(publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>}
                </Link>)}
              </div>
              : <div className="dashboard-empty-state"><p>Published posts and issues will appear here</p><Link href="/dashboard/posts">Open publishing <ArrowRight size={13} aria-hidden="true" /></Link></div>}
        </section>
      </div>

      <section className="dashboard-creative-section dashboard-shortcuts-section" aria-labelledby="dashboard-tools-title">
        <div className="dashboard-redesign-heading">
          <div><p className="eyebrow">Workspace</p><h2 id="dashboard-tools-title">Quick actions</h2><p>Go straight to a tool or workflow.</p></div>
          <Link href="/dashboard/create">Open Create <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        <div className="dashboard-shortcut-grid">
          {studioFeatures.map(({ label, detail, href, icon: Icon }) => (
            <Link className="dashboard-shortcut-card" href={href} key={href} title={detail}>
              <span className="dashboard-shortcut-icon"><Icon size={17} aria-hidden="true" /></span>
              <strong>{label}</strong><ArrowRight size={14} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <div className="dashboard-insight-grid dashboard-redesign-insights">
        <section className="dashboard-insight-card dashboard-recommendation-card" aria-label="Marketing recommendation">
          <header>
            <div><p className="eyebrow">Marketing Brain</p><h2>Your next move</h2></div>
            <Lightbulb size={18} aria-hidden="true" />
          </header>
          {brainError
            ? <p className="dashboard-insight-empty">Recommendations are unavailable right now.</p>
            : brain
              ? <>
                <strong className="dashboard-recommendation-title">{nextRecommendation?.title ?? brain.priorities[0] ?? "No new recommendation"}</strong>
                <p>{nextRecommendation?.explanation ?? (brain.priorities.length ? "Review this current workspace priority." : "Your workspace has no open recommendations right now.")}</p>
                {nextRecommendation && <Link className="dashboard-insight-link" href={nextRecommendation.actionHref}>{nextRecommendation.actionLabel} <ArrowRight size={14} aria-hidden="true" /></Link>}
              </>
              : <p className="dashboard-panel-empty" role="status">Loading recommendations…</p>}
          <Link className="dashboard-insight-link" href="/dashboard/marketing-brain">Open Marketing Brain <ArrowRight size={14} aria-hidden="true" /></Link>
        </section>

        <section className="dashboard-insight-card dashboard-channel-card" aria-label="Connected channel status">
          <header>
            <div><p className="eyebrow">Channel status</p><h2>Connected accounts</h2></div>
            <Radio size={18} aria-hidden="true" />
          </header>
          {accountsError
            ? <p className="dashboard-insight-empty">Channel status could not be loaded.</p>
            : connectedAccounts
              ? <>
                <div className="dashboard-channel-total"><strong>{activeAccounts.length}</strong><span>{activeAccounts.length === 1 ? "connected account" : "connected accounts"}</span></div>
                {activeAccounts.length
                  ? <ul className="dashboard-channel-list">{activeAccounts.slice(0, 3).map((account) => <li key={account.id}><span className="dashboard-channel-indicator" /><span>{account.displayName}</span><small>{account.provider}</small></li>)}</ul>
                  : <p className="dashboard-insight-empty">Connect a social account to publish and access channel insights.</p>}
              </>
              : <p className="dashboard-panel-empty" role="status">Loading account status…</p>}
          {instagram && <div className="dashboard-instagram-summary"><span>Recent Instagram posts</span><strong>{instagram.posts.length}</strong><small>{instagramTotals?.likes ?? 0} likes · {instagramTotals?.comments ?? 0} comments</small></div>}
          <Link className="dashboard-insight-link" href="/dashboard/social-accounts">Manage accounts <ArrowRight size={14} aria-hidden="true" /></Link>
        </section>

        <section className="dashboard-insight-card dashboard-competitor-card" aria-label="Competitor snapshot">
          <header>
            <div><p className="eyebrow">Market snapshot</p><h2>Competitor intelligence</h2></div>
            <Link href="/dashboard/competitors" aria-label="Open competitor intelligence"><ArrowRight size={17} aria-hidden="true" /></Link>
          </header>
          {verifiedCompetitors.slice(0, 3).map((competitor) => {
            const posts = competitor.snapshots.flatMap((snapshot) => snapshot.observations.posts);
            const strongest = [...posts].sort((first, second) =>
              ((second.metrics.views ?? 0) + (second.metrics.likes ?? 0) + (second.metrics.comments ?? 0)) -
              ((first.metrics.views ?? 0) + (first.metrics.likes ?? 0) + (first.metrics.comments ?? 0)),
            )[0];
            const engagement = strongest?.metrics.views !== undefined
              ? `${strongest.metrics.views.toLocaleString()} views`
              : strongest?.metrics.likes !== undefined ? `${strongest.metrics.likes.toLocaleString()} likes` : "metrics saved";
            const linkedPlatforms = Object.keys(competitor.socialProfiles ?? {});
            return (
              <div className="dashboard-competitor-row" key={competitor.id}>
                <strong>{competitor.name}</strong>
                <span>{strongest
                  ? `${strongest.format || "Post"}${strongest.topic ? ` · ${strongest.topic}` : ""} · ${engagement}`
                  : linkedPlatforms.length
                    ? `${linkedPlatforms.join(" · ")} linked · Open snapshot for post research`
                    : competitor.websiteUrl ? "Website snapshot saved · Open to review findings" : "Profile saved · Add public post evidence"}</span>
              </div>
            );
          })}
          {competitorError
            ? <p className="dashboard-insight-empty" role="alert">Competitor findings could not be loaded: {competitorError}</p>
            : !competitors
              ? <p className="dashboard-insight-empty" role="status">Loading competitor findings…</p>
              : !verifiedCompetitors.length
              ? <p className="dashboard-insight-empty">Add verified competitor profiles to see their standout content here.</p>
              : null}
          <Link className="dashboard-insight-link" href="/dashboard/competitors">View competitor findings <ArrowRight size={14} aria-hidden="true" /></Link>
        </section>

        <section className="dashboard-insight-card" aria-label="Weekly Autopilot">
          <header>
            <div><p className="eyebrow">Weekly content</p><h2>Autopilot</h2></div>
            <Sparkles size={18} aria-hidden="true" />
          </header>
          {autopilotError
            ? <p className="dashboard-autopilot-state" role="alert">{autopilotError}</p>
            : autopilot
              ? <>
                <strong className="dashboard-autopilot-state">{autopilot.brand.instagramAutopilotEnabled ? "Weekly generation is on" : "Weekly generation is off"}</strong>
                <p>{autopilot.brand.instagramAutopilotEnabled
                  ? autopilot.brand.instagramAutopilotNextRunAt
                    ? `Next batch · ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(autopilot.brand.instagramAutopilotNextRunAt))}. Sent for your review.`
                    : "The next brand-specific batch will be sent for your review."
                  : autopilot.blockers[0] ?? "Turn on weekly generation in Publishing settings."}</p>
              </>
              : <p className="dashboard-panel-empty" role="status">Loading Autopilot status…</p>}
          <Link className="dashboard-insight-link" href={autopilot?.brand.instagramAutopilotEnabled ? "/dashboard/instagram-autopilot" : "/dashboard/settings/publishing"}>
            {autopilot?.brand.instagramAutopilotEnabled ? "View Autopilot" : "Set up Autopilot"} <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </section>
      </div>

      {workspace && workspace.trialDaysRemaining > 0 && (
        <p className="dashboard-trial-note">
          Your trial has {workspace.trialDaysRemaining} {workspace.trialDaysRemaining === 1 ? "day" : "days"} left.
          {" "}<Link href="/dashboard/settings">Explore plans <ArrowRight size={13} aria-hidden="true" /></Link>
        </p>
      )}
    </section>
  );
}

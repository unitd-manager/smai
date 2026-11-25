"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  FileVideo2,
  FolderOpen,
  Image as ImageIcon,
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

type Campaign = { id: string; name: string; startsAt: string; endsAt: string; status: string; campaign?: { lifecycle?: string } };

type DashboardActivity = {
  draftCount: number;
  failedCount: number;
  dailyPublished: number[];
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
          <p className="eyebrow">YOUR SCHEDULE</p>
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

const featuredTools = [
  studioFeatures[0],
  studioFeatures[2],
  studioFeatures[3],
];

export function DashboardClient() {
  const [dashboard, setDashboard] = useState<DashboardState | null>(null);
  const [competitors, setCompetitors] = useState<DashboardCompetitor[] | null>(null);
  const [competitorError, setCompetitorError] = useState("");
  const [autopilot, setAutopilot] = useState<AutopilotPreview | null>(null);
  const [autopilotError, setAutopilotError] = useState("");
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
    Promise.all([
      apiRequest<DashboardData>("/api/dashboard"),
      apiRequest<{ posts: Post[] }>("/api/posts?brandId=all&limit=100"),
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

  return (
    <section className="dashboard-content workspace-dashboard dashboard-redesign">
      <header className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="eyebrow"><span className="dashboard-hero-dot" /> YOUR CREATIVE WORKSPACE</p>
          <h1>Make every scroll <span>stop.</span></h1>
          <p>{workspace?.brand?.name
            ? `Create and plan on-brand content for ${workspace.brand.name}.`
            : "Plan your next idea, then bring it to life with AI images, video, and ready-to-edit designs."}</p>
          <div className="dashboard-hero-actions">
            <Link className="button button-gold" href="/dashboard/create"><Sparkles size={16} aria-hidden="true" /> Start creating <ArrowRight size={15} aria-hidden="true" /></Link>
            <Link className="dashboard-hero-secondary" href="/dashboard/analytics">See publishing activity <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="dashboard-hero-art" aria-hidden="true">
          <div className="dashboard-art-orbit" />
          <div className="dashboard-art-card dashboard-art-card-back"><ImageIcon size={20} aria-hidden="true" /><span>IMAGE</span></div>
          <div className="dashboard-art-card dashboard-art-card-front"><FileVideo2 size={22} /><span>VIDEO</span><i /></div>
          <div className="dashboard-art-card dashboard-art-card-side"><Sparkles size={18} /><span>DESIGN</span></div>
          <span className="dashboard-art-spark dashboard-art-spark-one">✦</span>
          <span className="dashboard-art-spark dashboard-art-spark-two">✧</span>
        </div>
      </header>

      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {workspace?.trialExpired && <div className="notice notice-gold">Your trial has ended. You can still view your workspace; upgrade to create or schedule content.</div>}

      <section className="dashboard-stat-grid dashboard-redesign-stats" aria-label="Publishing statistics">
        <article className="dashboard-stat-card">
          <span>Content drafts</span><strong>{activity ? activity.draftCount : "—"}</strong>
          <small>Saved and ready to review</small>
          <span className="dashboard-stat-icon"><FileText size={21} aria-hidden="true" /></span>
        </article>
        <article className="dashboard-stat-card">
          <span>Needs attention</span><strong>{activity ? activity.failedCount : "—"}</strong>
          <small>{activity?.failedCount ? "Review publishing issues" : "No failed posts"}</small>
          <span className="dashboard-stat-icon"><CircleAlert size={21} aria-hidden="true" /></span>
        </article>
      </section>

      <section className="dashboard-creative-section" aria-labelledby="dashboard-tools-title">
        <div className="dashboard-redesign-heading">
          <div><p className="eyebrow">THE AI STUDIO</p><h2 id="dashboard-tools-title">Start with a spark</h2><p>Choose a format and make it your own.</p></div>
          <Link href="/dashboard/create">Explore all tools <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        <div className="dashboard-creative-grid">
          {featuredTools.map(({ label, detail, href, icon: Icon }, index) => (
            <Link className={`dashboard-creative-card dashboard-creative-card-${index + 1}`} href={href} key={href}>
              <span className="dashboard-creative-art"><Icon size={30} aria-hidden="true" /><span>{index === 0 ? "CREATE" : index === 1 ? "MOTION" : "DESIGN"}</span></span>
              <span className="dashboard-creative-copy"><strong>{label}</strong><small>{detail}</small></span>
              <span className="dashboard-creative-arrow" aria-hidden="true"><ArrowRight size={17} /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-more-tools" aria-labelledby="dashboard-more-tools-title">
        <div className="dashboard-redesign-heading dashboard-more-tools-heading">
          <div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="dashboard-more-tools-title">More ways to move forward</h2></div>
        </div>
        <div className="dashboard-feature-grid">
          {studioFeatures.slice(1, 2).concat(studioFeatures.slice(4)).map(({ label, detail, href, icon: Icon }) => (
            <Link className="dashboard-feature-card" href={href} key={href}>
              <span className="dashboard-feature-icon"><Icon size={19} aria-hidden="true" /></span>
              <span><strong>{label}</strong><small>{detail}</small></span>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <div className="dashboard-redesign-main-grid">
        <section className="dashboard-panel dashboard-analytics-panel" aria-label="Publishing analytics">
          <div className="dashboard-panel-heading">
            <div><p className="eyebrow">CHANNEL PULSE</p><h2>Publishing activity</h2><p>Confirmed live posts this week</p></div>
            <Link href="/dashboard/analytics">Open analytics <ArrowRight size={13} aria-hidden="true" /></Link>
          </div>
          {activity ? (
            <>
              <div className="dashboard-performance-summary">
                <strong>{activity.dailyPublished.reduce((sum, count) => sum + count, 0)}</strong>
                <span>live posts confirmed this week</span>
              </div>
              <DashboardPerformanceChart values={activity.dailyPublished} />
              {!activity.dailyPublished.some((count) => count > 0) && <p className="dashboard-chart-empty">Activity will appear after a connected platform confirms published posts.</p>}
            </>
          ) : <p className="dashboard-panel-empty" role={error ? "alert" : "status"}>{error ? "Publishing activity could not be loaded." : "Loading publishing activity…"}</p>}
        </section>

        <DashboardMiniCalendar posts={activity?.scheduledPosts ?? null} campaigns={activity?.campaigns ?? []} error={error} />
      </div>

      <div className="dashboard-insight-grid dashboard-redesign-insights">
        <section className="dashboard-insight-card" aria-label="Competitor snapshot">
          <header>
            <div><p className="eyebrow">MARKET SNAPSHOT</p><h2>Competitor intelligence</h2></div>
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
            <div><p className="eyebrow">WEEKLY CONTENT</p><h2>Autopilot</h2></div>
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
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type AutopilotStatus = {
  brand: { id: string; name: string; timezone: string; connectedPlatforms: string[]; instagramAutopilotEnabled: boolean };
  latestRun: { id: string; status: string; error: string | null; createdAt: string; completedAt: string | null } | null;
  blockers?: string[];
  videoBlockers?: string[];
  ready: boolean;
};

const formatOptions = [
  { id: "post", label: "Social image", channel: "Instagram" },
  { id: "carousel", label: "Carousel", channel: "Instagram" },
  { id: "brochure", label: "Brochure", channel: "Instagram" },
  { id: "video-product-demo", label: "Product demo video", channel: "Magic Hour" },
  { id: "video-avatar", label: "Presenter avatar video", channel: "Magic Hour" },
  { id: "linkedin-banner", label: "LinkedIn banner", channel: "Draft" },
  { id: "facebook-cover", label: "Facebook cover", channel: "Draft" },
] as const;
type FormatId = typeof formatOptions[number]["id"];
const initialCounts: Record<FormatId, number> = { post: 4, carousel: 3, brochure: 0, "video-product-demo": 0, "video-avatar": 0, "linkedin-banner": 0, "facebook-cover": 0 };

const activeStatuses = new Set(["QUEUED", "GENERATING", "WAITING_FOR_RENDER"]);

function runStatusLabel(status: string) {
  if (status === "QUEUED") return "Queued";
  if (status === "GENERATING") return "Creating your posts";
  if (status === "WAITING_FOR_RENDER") return "Waiting for Magic Hour videos";
  if (status === "IN_REVIEW") return "Ready for email approval";
  if (status === "FAILED") return "Needs attention";
  return status.replaceAll("_", " ").toLowerCase();
}

export function InstagramAutopilotClient() {
  const [status, setStatus] = useState<AutopilotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [days, setDays] = useState(7);
  const [counts, setCounts] = useState<Record<FormatId, number>>(initialCounts);
  const [campaignGoal, setCampaignGoal] = useState("");

  const refreshStatus = useCallback(async () => {
    try {
      const current = await apiRequest<AutopilotStatus>("/api/brand-profile/instagram-autopilot/status");
      setStatus(current);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not check Instagram Autopilot.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshStatus]);

  const isProcessing = Boolean(status?.latestRun && activeStatuses.has(status.latestRun.status));
  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setInterval(() => void refreshStatus(), 10_000);
    return () => window.clearInterval(timer);
  }, [isProcessing, refreshStatus]);

  const latestRun = status?.latestRun;
  const postCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const videoCount = counts["video-product-demo"] + counts["video-avatar"];
  const requestsVideo = videoCount > 0;
  const blockers = status?.blockers ?? [];
  const videoBlockers = status?.videoBlockers;
  const videoReady = !requestsVideo || (videoBlockers?.length ?? 1) === 0;

  async function generateBatch() {
    if (latestRun && !window.confirm(`Generate a fresh ${postCount}-post batch across ${days} days? This creates new AI content and may use Magic Hour credits.`)) return;
    setStarting(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ message: string }>("/api/brand-profile/instagram-autopilot/run", {
        method: "POST",
        body: JSON.stringify({ days, counts, campaignGoal }),
      });
      setNotice(response.message);
      await refreshStatus();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start the Instagram Autopilot batch.");
      await refreshStatus();
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="dashboard-content instagram-autopilot-page">
      <header className="instagram-autopilot-heading">
        <div>
          <p className="eyebrow">YOUR STUDIO · LIBRARY</p>
          <h1>Autopilot</h1>
          <p className="dashboard-lead">
            Every week, Autopilot creates fresh posts and carousels using this brand&apos;s profile, services, audience, voice, and goals. It emails the drafts for your review; it never publishes without your approval.
          </p>
        </div>
        <span className="instagram-autopilot-approval-badge">Approval-first scheduling</span>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      <article className="instagram-autopilot-card">
        <div>
          <p className="eyebrow">WEEKLY AUTOMATION</p>
          <h2>{status?.brand.name ?? "Your brand"} · Brand-specific content</h2>
          <p>When weekly Autopilot is enabled in Brand Profile, it generates a new seven-day batch automatically and emails it to the workspace owner. Drafts stay in review until you approve them.</p>
          {status && <small>Connected channel{status.brand.connectedPlatforms.length === 1 ? "" : "s"}: {status.brand.connectedPlatforms.join(", ") || "none"} · Brand time zone: {status.brand.timezone}</small>}
        </div>
        <button
          type="button"
          className="button button-primary"
          disabled={loading || starting || isProcessing || !status?.ready || !videoReady || postCount < 1 || postCount > 30 || days > postCount}
          onClick={() => void generateBatch()}
        >
          {starting ? "Starting Autopilot…" : isProcessing ? runStatusLabel(latestRun!.status) : `Generate ${postCount} posts`}
        </button>
      </article>

      <section className="instagram-autopilot-config" aria-labelledby="autopilot-mix-heading">
        <div className="instagram-autopilot-config-heading">
          <div>
            <p className="eyebrow">BATCH SETTINGS</p>
            <h2 id="autopilot-mix-heading">Schedule and content mix</h2>
            <p>Choose the formats and timing for this batch. Posts are spread across your selected dates in the brand time zone.</p>
          </div>
          <label className="instagram-autopilot-days">
            <span>Number of days</span>
            <div className="instagram-autopilot-days-input">
              <input
                type="number"
                min={1}
                max={30}
                value={days}
                aria-label="Number of days"
                onChange={(event) => setDays(Math.min(30, Math.max(1, Number(event.target.value) || 1)))}
              />
              <span>days</span>
            </div>
            <small>Schedule from 1 to 30 days</small>
          </label>
        </div>
        <label className="instagram-autopilot-campaign">
          Campaign focus <span>(optional)</span>
          <textarea
            rows={2}
            maxLength={500}
            value={campaignGoal}
            onChange={(event) => setCampaignGoal(event.target.value)}
            placeholder="For example: World AIDS Day awareness, a service launch, or this month's confirmed offer"
          />
          <small>Autopilot uses this only when it fits your saved business profile. It will not invent prices or claims.</small>
        </label>
        <div className="instagram-autopilot-formats-heading">
          <h3>Content formats</h3>
          <span>Set the number of items for each format</span>
        </div>
        <div className="instagram-autopilot-format-grid">
          {formatOptions.map((format) => (
            <label key={format.id}>
              <span>{format.label}<small>{format.channel}</small></span>
              <input
                type="number"
                min={0}
                max={30}
                value={counts[format.id]}
                onChange={(event) => setCounts((current) => ({ ...current, [format.id]: Math.min(30, Math.max(0, Number(event.target.value) || 0)) }))}
                aria-label={`${format.label} count`}
              />
            </label>
          ))}
        </div>
        <p className="instagram-autopilot-total"><span>Batch total</span><strong>{postCount}</strong> posts <span>across</span> {days} days</p>
        {requestsVideo && <p className="notice notice-gold" role="note">This batch sends {videoCount} video request{videoCount === 1 ? "" : "s"} to Magic Hour and uses its account credits. Check the available balance in Video Studio before generating.</p>}
        {requestsVideo && videoBlockers && videoBlockers.length > 0 ? <div className="notice notice-gold" role="status"><strong>Magic Hour video setup:</strong><ul>{videoBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}
        {requestsVideo && !videoBlockers && <p className="notice notice-gold" role="status">Video setup status is unavailable. Restart the API and refresh this page before generating videos.</p>}
        {(counts["linkedin-banner"] > 0 || counts["facebook-cover"] > 0) && <p className="video-music-license">LinkedIn and Facebook formats will be generated and included in review. Live publishing is currently connected to Instagram only, so these channel specific assets remain downloadable drafts.</p>}
      </section>

      {!loading && status && (!status.ready || (requestsVideo && !videoReady)) && (
        <section className="instagram-autopilot-readiness" aria-labelledby="autopilot-readiness-heading">
          <h2 id="autopilot-readiness-heading">Complete setup before generating</h2>
          <p>These are required to generate scheduled posts and send their approval email:</p>
          <ul>{[...blockers, ...(requestsVideo ? (videoBlockers ?? ["Video setup status is unavailable. Restart the API and refresh this page before generating videos."]) : [])].map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          <div className="instagram-autopilot-links">
            <Link href="/onboarding">Review brand profile</Link>
            <Link href="/dashboard/social-accounts">Connect a publishing account</Link>
          </div>
        </section>
      )}

      {loading && <p className="loading-label" role="status">Checking Autopilot setup…</p>}
      {latestRun && (
        <section className={`instagram-autopilot-run${latestRun.status === "FAILED" ? " is-error" : ""}`} aria-live="polite">
          <h2>Latest batch: {runStatusLabel(latestRun.status)}</h2>
          <p>Started {new Date(latestRun.createdAt).toLocaleString()}</p>
          {isProcessing && <p>Keep this page open to follow progress. Autopilot checks rendering and generation automatically.</p>}
          {latestRun.status === "IN_REVIEW" && <p>The drafts are waiting for review. Check the configured approval email inbox; nothing publishes until the posts are approved.</p>}
          {latestRun.error && <p className="form-error" role="alert">{latestRun.error}</p>}
          <div className="instagram-autopilot-links">
            <Link href="/dashboard/approvals">Open approvals</Link>
            <Link href="/dashboard/content">View generated content</Link>
          </div>
        </section>
      )}
    </section>
  );
}

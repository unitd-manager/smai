"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";

type AutopilotStatus = {
  brand: {
    id: string;
    name: string;
    timezone: string;
    connectedPlatforms: string[];
    instagramAutopilotEnabled: boolean;
    instagramAutopilotNextRunAt: string | null;
    automationSettings: { days: number; counts: Record<FormatId, number>; campaignGoal: string; weekday: number; time: string };
  };
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
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [weekday, setWeekday] = useState(2);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      const current = await apiRequest<AutopilotStatus>("/api/brand-profile/instagram-autopilot/status");
      setStatus(current);
      if (current.latestRun?.status === "FAILED") setNotice("");
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

  useEffect(() => {
    if (!status || settingsLoaded) return;
    setDays(status.brand.automationSettings.days);
    setCounts(status.brand.automationSettings.counts);
    setCampaignGoal(status.brand.automationSettings.campaignGoal);
    setWeekday(status.brand.automationSettings.weekday);
    setScheduleTime(status.brand.automationSettings.time);
    setAutomationEnabled(status.brand.instagramAutopilotEnabled);
    setSettingsLoaded(true);
  }, [settingsLoaded, status]);

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

  async function saveAutomation() {
    setSavingAutomation(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ nextRunAt: string | null }>("/api/brand-profile/instagram-autopilot/settings", {
        method: "PUT",
        body: JSON.stringify({ enabled: automationEnabled, weekday, time: scheduleTime, days, counts, campaignGoal }),
      });
      const nextRunLabel = response.nextRunAt && status?.brand.timezone
        ? new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: status.brand.timezone }).format(new Date(response.nextRunAt))
        : "the selected weekly time";
      setNotice(automationEnabled
        ? `Weekly generation is on. Your next batch is ${nextRunLabel} (${status?.brand.timezone ?? "brand time zone"}) and will be emailed for review.`
        : "Weekly generation is paused. You can still generate a batch manually.");
      await refreshStatus();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save the weekly Autopilot schedule.");
    } finally {
      setSavingAutomation(false);
    }
  }

  return (
    <section className="dashboard-content instagram-autopilot-page">
      <header className="instagram-autopilot-heading">
        <div>
          <p className="eyebrow">Weekly content workflow</p>
          <h1>Autopilot</h1>
          <p className="dashboard-lead">Set the content mix once, then generate a batch now or let it run on a weekly schedule.</p>
        </div>
        <span className={`instagram-autopilot-approval-badge${status?.brand.instagramAutopilotEnabled ? " is-on" : ""}`} aria-live="polite">
          <i aria-hidden="true" />
          {status?.brand.instagramAutopilotEnabled ? "Weekly schedule on" : "Weekly schedule off"}
        </span>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      <div className="instagram-autopilot-workspace">
        <section className="instagram-autopilot-overview" aria-label="Autopilot overview">
          <div className="instagram-autopilot-brand-summary">
            <p className="eyebrow">Workspace</p>
            <h2>{status?.brand.name ?? "Your brand"}</h2>
            <p>One content recipe powers both on-demand batches and your recurring schedule.</p>
            {status && <small>{status.brand.connectedPlatforms.join(" · ") || "No connected channels"}<span aria-hidden="true"> · </span>{status.brand.timezone}</small>}
          </div>
          <div className="instagram-autopilot-manual">
            <div className="instagram-autopilot-manual-copy">
              <span>Manual generation</span>
              <strong>{postCount} posts <span>·</span> {days} days</strong>
              <small>Creates a batch now and emails it for review.</small>
            </div>
            <button
              type="button"
              className="button button-primary"
              disabled={loading || starting || isProcessing || !status?.ready || !videoReady || postCount < 1 || postCount > 30 || days > postCount}
              onClick={() => void generateBatch()}
            >
              {starting ? "Starting batch…" : isProcessing ? runStatusLabel(latestRun!.status) : "Generate batch now"}
            </button>
          </div>
          {latestRun && (
            <div className={`instagram-autopilot-run${latestRun.status === "FAILED" ? " is-error" : ""}`} aria-live="polite">
              <div className="instagram-autopilot-run-copy">
                <p className="eyebrow">Latest batch</p>
                <h3><i aria-hidden="true" />{runStatusLabel(latestRun.status)}</h3>
                <p>Started {new Date(latestRun.createdAt).toLocaleString()}</p>
                {isProcessing && <p>Generation is in progress.</p>}
                {latestRun.status === "IN_REVIEW" && <p>Batch ready for email approval.</p>}
                {latestRun.status === "FAILED" && <p>This batch did not reach email approval.</p>}
                {latestRun.error && <details className="instagram-autopilot-error-details">
                  <summary>View error details</summary>
                  <pre>{latestRun.error}</pre>
                </details>}
              </div>
              <div className="instagram-autopilot-links">
                <Link href="/dashboard/approvals">Open approvals</Link>
                <Link href="/dashboard/content">View generated content</Link>
              </div>
            </div>
          )}
        </section>

        <section className="instagram-autopilot-config" aria-labelledby="autopilot-mix-heading">
          <div className="instagram-autopilot-config-heading">
            <div>
              <p className="eyebrow">Batch recipe</p>
              <h2 id="autopilot-mix-heading">Choose what to create</h2>
              <p>This recipe is shared by manual generation and the weekly schedule.</p>
            </div>
            <label className="instagram-autopilot-days">
              <span>Batch window</span>
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
              <small>Choose 1–30 days</small>
            </label>
          </div>
          <label className="instagram-autopilot-campaign">
            <span>Campaign focus <small>Optional</small></span>
            <textarea
              rows={2}
              maxLength={500}
              value={campaignGoal}
              onChange={(event) => setCampaignGoal(event.target.value)}
              placeholder="For example: World AIDS Day awareness, a service launch, or this month's confirmed offer"
            />
            <small>Use a real offer, launch, or seasonal theme. Content is grounded in your saved brand profile.</small>
          </label>
          <div className="instagram-autopilot-formats-heading">
            <div><h3>Content mix</h3><span>Set the quantity for each format</span></div>
            <span className="instagram-autopilot-mix-total">{postCount} total</span>
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
          <p className="instagram-autopilot-total"><span>Batch size</span><strong>{postCount}</strong><span>posts across</span><b>{days} days</b></p>
          {requestsVideo && <p className="notice notice-gold" role="note">This batch sends {videoCount} video request{videoCount === 1 ? "" : "s"} to Magic Hour and uses its account credits. Check the available balance in Video Studio before generating.</p>}
          {requestsVideo && videoBlockers && videoBlockers.length > 0 ? <div className="notice notice-gold" role="status"><strong>Magic Hour video setup:</strong><ul>{videoBlockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul></div> : null}
          {requestsVideo && !videoBlockers && <p className="notice notice-gold" role="status">Video setup status is unavailable. Restart the API and refresh this page before generating videos.</p>}
          {(counts["linkedin-banner"] > 0 || counts["facebook-cover"] > 0) && <p className="video-music-license">LinkedIn and Facebook cover assets are delivered as drafts.</p>}
        </section>

        <section className="instagram-autopilot-weekly" aria-labelledby="autopilot-weekly-heading">
          <div className="instagram-autopilot-weekly-heading">
            <div>
              <p className="eyebrow">Recurring generation</p>
              <h2 id="autopilot-weekly-heading">Run the recipe every week</h2>
              <p>Choose a day and time. Autopilot generates in the background and emails a secure review link; nothing publishes until you approve it.</p>
            </div>
            <label className="instagram-autopilot-toggle">
              <input type="checkbox" checked={automationEnabled} onChange={(event) => setAutomationEnabled(event.target.checked)} />
              <span>{automationEnabled ? "Automation on" : "Automation off"}</span>
            </label>
          </div>
          <div className="instagram-autopilot-weekly-controls">
            <label>
              <span>Generate every</span>
              <CompactSelect aria-label="Generate every weekday" value={weekday} onChange={(event) => setWeekday(Number(event.target.value))}>
                {weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}
              </CompactSelect>
            </label>
            <label>
              <span>At ({status?.brand.timezone ?? "brand time zone"})</span>
              <input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} />
            </label>
            <button className="button button-secondary" type="button" onClick={() => void saveAutomation()} disabled={savingAutomation || loading || postCount < 1 || days > postCount}>
              {savingAutomation ? "Saving schedule…" : "Save weekly schedule"}
            </button>
          </div>
          {status?.brand.instagramAutopilotEnabled && status.brand.instagramAutopilotNextRunAt && (
            <p className="instagram-autopilot-next-run">Next batch <strong>{new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short", timeZone: status.brand.timezone }).format(new Date(status.brand.instagramAutopilotNextRunAt))}</strong><span>·</span>{status.brand.timezone}</p>
          )}
        </section>
      </div>

      {!loading && status && (!status.ready || (requestsVideo && !videoReady)) && (
        <section className="instagram-autopilot-readiness" aria-labelledby="autopilot-readiness-heading">
          <h2 id="autopilot-readiness-heading">Complete setup before generating</h2>
          <p>Finish setup to generate this batch:</p>
          <ul>{[...blockers, ...(requestsVideo ? (videoBlockers ?? ["Video setup status is unavailable. Restart the API and refresh this page before generating videos."]) : [])].map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
          <div className="instagram-autopilot-links">
            <Link href="/onboarding">Review brand profile</Link>
            <Link href="/dashboard/social-accounts">Connect a publishing account</Link>
          </div>
        </section>
      )}

      {loading && <p className="loading-label" role="status">Checking setup…</p>}
    </section>
  );
}

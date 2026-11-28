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
    automationSettings: {
      days: number;
      counts: Record<FormatId, number>;
      campaignGoal: string;
      creationMode: "ai" | "template";
      templateIds: Partial<Record<FormatId, string>>;
      automationCreationMode: "ai" | "template";
      automationTemplateIds: Partial<Record<FormatId, string>>;
      videoSettings: AutopilotVideoSettings;
      automationVideoSettings: AutopilotVideoSettings;
      weekday: number;
      time: string;
    };
  };
  latestRun: { id: string; status: string; error: string | null; createdAt: string; completedAt: string | null } | null;
  blockers?: string[];
  videoBlockers?: string[];
  ready: boolean;
};
type TemplateChoice = { id: string; name: string; format: string };
type AutopilotVideoSettings = {
  videoType: "product-motion" | "realistic-avatar" | "animated-avatar";
  durationSeconds: number;
  narrationEnabled: boolean;
  voiceName: string;
  musicId: string | null;
  musicStyle: "balanced" | "warm" | "bright" | "calm" | "cinematic";
};
type VideoAudioConfig = {
  music: Array<{ id: string; title: string; mood: string; licenseNote: string }>;
  musicStyles: Array<{ id: AutopilotVideoSettings["musicStyle"]; label: string }>;
};
type VideoVoiceConfig = { configured?: boolean; voices?: Array<{ id: string; name: string }>; error?: string };
const defaultVideoSettings: AutopilotVideoSettings = {
  videoType: "product-motion",
  durationSeconds: 15,
  narrationEnabled: true,
  voiceName: "",
  musicId: null,
  musicStyle: "balanced",
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

function VideoSettingsFields({ value, onChange, voices, audio }: {
  value: AutopilotVideoSettings;
  onChange: (next: AutopilotVideoSettings) => void;
  voices: NonNullable<VideoVoiceConfig["voices"]>;
  audio: VideoAudioConfig | null;
}) {
  const isProductMotion = value.videoType === "product-motion";
  return <div className="instagram-autopilot-video-settings">
    <label>
      <span>Video style</span>
      <CompactSelect aria-label="Video style" value={value.videoType} onChange={(event) => onChange({ ...value, videoType: event.target.value as AutopilotVideoSettings["videoType"] })}>
        <option value="product-motion">Product motion</option>
        <option value="realistic-avatar">Realistic presenter</option>
        <option value="animated-avatar">Animated presenter</option>
      </CompactSelect>
    </label>
    <label>
      <span>Video length</span>
      <CompactSelect aria-label="Video length" value={value.durationSeconds} onChange={(event) => onChange({ ...value, durationSeconds: Number(event.target.value) })}>
        {[5, 10, 15, 30, 45, 60].map((seconds) => <option value={seconds} key={seconds}>{seconds} seconds</option>)}
      </CompactSelect>
    </label>
    {isProductMotion && <label className="instagram-autopilot-video-toggle" style={{ display: "flex", alignSelf: "end", minHeight: 40, alignItems: "center", gap: 8, cursor: "pointer" }}>
      <input type="checkbox" checked={value.narrationEnabled} onChange={(event) => onChange({ ...value, narrationEnabled: event.target.checked })} style={{ appearance: "auto", flex: "0 0 16px", width: 16, minWidth: 16, height: 16, minHeight: 16, margin: 0, border: 0, padding: 0, background: "transparent", accentColor: "var(--action-primary)" }} />
      <span>Add voiceover</span>
    </label>}
    {(!isProductMotion || value.narrationEnabled) && <label>
      <span>{isProductMotion ? "Voiceover voice" : "Presenter voice"}</span>
      <CompactSelect aria-label={isProductMotion ? "Voiceover voice" : "Presenter voice"} value={value.voiceName} onChange={(event) => onChange({ ...value, voiceName: event.target.value })}>
        <option value="">Choose a voice</option>
        {voices.map((voice) => <option value={voice.id} key={voice.id}>{voice.name}</option>)}
      </CompactSelect>
    </label>}
    <label>
      <span>Background music</span>
      <CompactSelect aria-label="Background music" value={value.musicId ?? ""} onChange={(event) => onChange({ ...value, musicId: event.target.value || null })}>
        <option value="">Automatic soft bed</option>
        <option value="none">No music</option>
        {(audio?.music ?? []).map((track) => <option value={track.id} key={track.id}>{track.title} · {track.mood}</option>)}
      </CompactSelect>
    </label>
    <label>
      <span>Music treatment</span>
      <CompactSelect aria-label="Music treatment" value={value.musicStyle} onChange={(event) => onChange({ ...value, musicStyle: event.target.value as AutopilotVideoSettings["musicStyle"] })}>
        {(audio?.musicStyles ?? [{ id: "balanced" as const, label: "Balanced" }]).map((style) => <option value={style.id} key={style.id}>{style.label}</option>)}
      </CompactSelect>
    </label>
  </div>;
}

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
  const [creationMode, setCreationMode] = useState<"ai" | "template">("ai");
  const [templateIds, setTemplateIds] = useState<Partial<Record<FormatId, string>>>({});
  const [templates, setTemplates] = useState<TemplateChoice[]>([]);
  const [templateLoadError, setTemplateLoadError] = useState("");
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [automationCreationMode, setAutomationCreationMode] = useState<"ai" | "template">("ai");
  const [automationTemplateIds, setAutomationTemplateIds] = useState<Partial<Record<FormatId, string>>>({});
  const [videoSettings, setVideoSettings] = useState<AutopilotVideoSettings>(defaultVideoSettings);
  const [automationVideoSettings, setAutomationVideoSettings] = useState<AutopilotVideoSettings>(defaultVideoSettings);
  const [videoAudio, setVideoAudio] = useState<VideoAudioConfig | null>(null);
  const [videoVoices, setVideoVoices] = useState<NonNullable<VideoVoiceConfig["voices"]>>([]);
  const [videoConfigError, setVideoConfigError] = useState("");
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
    apiRequest<{ templates: TemplateChoice[] }>("/api/templates")
      .then(({ templates: availableTemplates }) => setTemplates(availableTemplates))
      .catch((requestError: unknown) => setTemplateLoadError(requestError instanceof Error ? requestError.message : "Could not load templates."));
  }, []);

  useEffect(() => {
    apiRequest<VideoAudioConfig>("/api/videos/configuration")
      .then(setVideoAudio)
      .catch((requestError: unknown) => setVideoConfigError(requestError instanceof Error ? requestError.message : "Video music options could not be loaded."));
    apiRequest<VideoVoiceConfig>("/api/videos/magic-hour/configuration")
      .then((configuration) => {
        setVideoVoices(configuration.voices ?? []);
        if (configuration.error) setVideoConfigError(configuration.error);
        const firstVoice = configuration.voices?.[0]?.id;
        if (firstVoice) {
          setVideoSettings((current) => current.voiceName ? current : { ...current, voiceName: firstVoice });
          setAutomationVideoSettings((current) => current.voiceName ? current : { ...current, voiceName: firstVoice });
        }
      })
      .catch((requestError: unknown) => setVideoConfigError(requestError instanceof Error ? requestError.message : "Magic Hour voices could not be loaded."));
  }, []);

  useEffect(() => {
    if (!status || settingsLoaded) return;
    const timer = window.setTimeout(() => {
      setDays(status.brand.automationSettings.days);
      setCounts(status.brand.automationSettings.counts);
      setCampaignGoal(status.brand.automationSettings.campaignGoal);
      setCreationMode(status.brand.automationSettings.creationMode);
      setTemplateIds(status.brand.automationSettings.templateIds);
      setAutomationCreationMode(status.brand.automationSettings.automationCreationMode);
      setAutomationTemplateIds(status.brand.automationSettings.automationTemplateIds);
      setVideoSettings((current) => ({ ...status.brand.automationSettings.videoSettings, voiceName: status.brand.automationSettings.videoSettings.voiceName || current.voiceName }));
      setAutomationVideoSettings((current) => ({ ...status.brand.automationSettings.automationVideoSettings, voiceName: status.brand.automationSettings.automationVideoSettings.voiceName || current.voiceName }));
      setWeekday(status.brand.automationSettings.weekday);
      setScheduleTime(status.brand.automationSettings.time);
      setAutomationEnabled(status.brand.instagramAutopilotEnabled);
      setSettingsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
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
  const selectedStaticFormats = formatOptions.filter((format) => counts[format.id] > 0 && !format.id.startsWith("video-"));
  const templatesReady = creationMode !== "template" || selectedStaticFormats.every((format) =>
    templates.some((template) => template.id === templateIds[format.id] && template.format === format.id),
  );
  const canGenerateMix = templatesReady && (creationMode !== "template" || templates.length > 0);
  const automationTemplatesReady = automationCreationMode !== "template" || selectedStaticFormats.every((format) =>
    templates.some((template) => template.id === automationTemplateIds[format.id] && template.format === format.id),
  );
  const canSaveAutomation = canGenerateMix && automationTemplatesReady &&
    (automationCreationMode !== "template" || templates.length > 0);
  const needsManualVoice = videoSettings.videoType !== "product-motion" || videoSettings.narrationEnabled;
  const needsAutomationVoice = automationVideoSettings.videoType !== "product-motion" || automationVideoSettings.narrationEnabled;
  const musicIsAvailable = (musicId: string | null) => !musicId || musicId === "none" || Boolean(videoAudio?.music.some((track) => track.id === musicId));
  const manualVideoReady = !requestsVideo || ((!needsManualVoice || videoVoices.some((voice) => voice.id === videoSettings.voiceName)) && musicIsAvailable(videoSettings.musicId));
  const automationVideoReady = !requestsVideo || ((!needsAutomationVoice || videoVoices.some((voice) => voice.id === automationVideoSettings.voiceName)) && musicIsAvailable(automationVideoSettings.musicId));

  async function generateBatch() {
    if (latestRun && !window.confirm(`Generate a fresh ${postCount}-post batch across ${days} days? This creates new AI content and may use Magic Hour credits.`)) return;
    setStarting(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ message: string }>("/api/brand-profile/instagram-autopilot/run", {
        method: "POST",
        body: JSON.stringify({ days, counts, campaignGoal, creationMode, templateIds, videoSettings }),
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
        body: JSON.stringify({
          enabled: automationEnabled,
          weekday,
          time: scheduleTime,
          days,
          counts,
          campaignGoal,
          creationMode,
          templateIds,
          videoSettings,
          automationCreationMode,
          automationTemplateIds,
          automationVideoSettings,
        }),
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
            <p>One content recipe powers both on-demand batches and your recurring schedule. Recent competitor analysis can inform original formats and angles; competitor content is never copied.</p>
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
              disabled={loading || starting || isProcessing || !status?.ready || !videoReady || !manualVideoReady || !canGenerateMix || postCount < 1 || postCount > 30 || days > postCount}
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
          <fieldset className="instagram-autopilot-source">
            <legend>How should Autopilot create this batch?</legend>
            <div className="instagram-autopilot-source-options">
              <label><input type="radio" name="autopilot-creation-mode" checked={creationMode === "ai"} onChange={() => setCreationMode("ai")} /><span><strong>Create with AI</strong><small>Cloudflare AI creates original content and flexible designs.</small></span></label>
              <label><input type="radio" name="autopilot-creation-mode" checked={creationMode === "template"} onChange={() => setCreationMode("template")} /><span><strong>Use templates</strong><small>Choose a distinct saved layout; AI writes original copy for it.</small></span></label>
            </div>
            {creationMode === "template" && (
              <div className="instagram-autopilot-template-list">
                {templateLoadError ? <p className="form-error" role="alert">{templateLoadError}</p> : selectedStaticFormats.length > 0
                  ? selectedStaticFormats.map((format) => (
                    <label key={format.id}>
                      <span>{format.label} template</span>
                      <CompactSelect
                        aria-label={`${format.label} template`}
                        value={templateIds[format.id] ?? ""}
                        onChange={(event) => setTemplateIds((current) => ({ ...current, [format.id]: event.target.value }))}
                      >
                        <option value="">Choose a {format.label.toLocaleLowerCase()} template</option>
                        {templates.filter((template) => template.format === format.id).map((template) => (
                          <option value={template.id} key={template.id}>{template.name}</option>
                        ))}
                      </CompactSelect>
                    </label>
                  ))
                  : <p>Video scripts use the AI and Magic Hour workflow. Add a static format to use a design template.</p>}
                {selectedStaticFormats.length > 0 && <small>Each selected static format needs its own matching template. Video formats continue to use AI-written scripts and Magic Hour rendering.</small>}
              </div>
            )}
          </fieldset>
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
          <fieldset className="instagram-autopilot-source">
            <legend>Video settings for this batch</legend>
            <p>Configure this before choosing a video count. It applies to videos included when you generate a batch now.</p>
            <VideoSettingsFields value={videoSettings} onChange={setVideoSettings} voices={videoVoices} audio={videoAudio} />
            {requestsVideo && videoConfigError && <p className="notice notice-gold" role="status">{videoConfigError}</p>}
            {requestsVideo && needsManualVoice && !videoVoices.some((voice) => voice.id === videoSettings.voiceName) && <p className="form-error" role="alert">Choose an available Magic Hour voice before generating narrated videos.</p>}
            {requestsVideo && !musicIsAvailable(videoSettings.musicId) && <p className="form-error" role="alert">The saved music choice is no longer available. Choose another soundtrack.</p>}
          </fieldset>
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
          <fieldset className="instagram-autopilot-source">
            <legend>How should recurring batches be created?</legend>
            <div className="instagram-autopilot-source-options">
              <label><input type="radio" name="scheduled-creation-mode" checked={automationCreationMode === "ai"} onChange={() => setAutomationCreationMode("ai")} /><span><strong>Create with AI</strong><small>Cloudflare AI creates original content and flexible designs.</small></span></label>
              <label><input type="radio" name="scheduled-creation-mode" checked={automationCreationMode === "template"} onChange={() => setAutomationCreationMode("template")} /><span><strong>Use templates</strong><small>Choose a distinct saved layout; AI writes original copy for each batch.</small></span></label>
            </div>
            {automationCreationMode === "template" && (
              <div className="instagram-autopilot-template-list">
                {templateLoadError ? <p className="form-error" role="alert">{templateLoadError}</p> : selectedStaticFormats.length > 0
                  ? selectedStaticFormats.map((format) => (
                    <label key={format.id}>
                      <span>{format.label} template</span>
                      <CompactSelect
                        aria-label={`Recurring ${format.label} template`}
                        value={automationTemplateIds[format.id] ?? ""}
                        onChange={(event) => setAutomationTemplateIds((current) => ({ ...current, [format.id]: event.target.value }))}
                      >
                        <option value="">Choose a {format.label.toLocaleLowerCase()} template</option>
                        {templates.filter((template) => template.format === format.id).map((template) => (
                          <option value={template.id} key={template.id}>{template.name}</option>
                        ))}
                      </CompactSelect>
                    </label>
                  ))
                  : <p>Video scripts use the AI and Magic Hour workflow. Add a static format to use a design template.</p>}
                {selectedStaticFormats.length > 0 && <small>These choices apply to weekly recurring batches and are independent of the manual batch recipe.</small>}
              </div>
            )}
          </fieldset>
          <fieldset className="instagram-autopilot-source">
            <legend>Video settings for weekly batches</legend>
            <p>Configure this before choosing a video count. These saved settings apply to videos in weekly recurring batches.</p>
            <VideoSettingsFields value={automationVideoSettings} onChange={setAutomationVideoSettings} voices={videoVoices} audio={videoAudio} />
            {requestsVideo && videoConfigError && <p className="notice notice-gold" role="status">{videoConfigError}</p>}
            {requestsVideo && needsAutomationVoice && !videoVoices.some((voice) => voice.id === automationVideoSettings.voiceName) && <p className="form-error" role="alert">Choose an available Magic Hour voice before scheduling narrated videos.</p>}
            {requestsVideo && !musicIsAvailable(automationVideoSettings.musicId) && <p className="form-error" role="alert">The saved music choice is no longer available. Choose another soundtrack.</p>}
          </fieldset>
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
            <button className="button button-secondary" type="button" onClick={() => void saveAutomation()} disabled={savingAutomation || loading || !canSaveAutomation || !automationVideoReady || postCount < 1 || days > postCount}>
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

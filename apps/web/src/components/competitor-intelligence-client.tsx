"use client";

import Link from "next/link";
import { Activity, ArrowRight, BarChart3, Brain, Building2, CheckCircle2, Circle, Compass, FileText, Plus, RefreshCw, Search, UsersRound } from "lucide-react";
import { CompactSelect } from "@/components/compact-select";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";

type CompetitorCategory = "direct" | "indirect" | "emerging" | "industry-leader";
type SocialPlatform = "Instagram" | "Facebook" | "LinkedIn" | "TikTok" | "YouTube" | "X" | "Pinterest" | "Other";
type CompetitorProfile = {
  id: string;
  name: string;
  category: CompetitorCategory;
  industry: string | null;
  websiteUrl: string | null;
  location: string | null;
  overview: string | null;
  products: string | null;
  audience: string | null;
  uniqueValue: string | null;
  brandVoice: string | null;
  socialProfiles: Partial<Record<SocialPlatform, string>>;
  keywords: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  snapshots: CompetitorSnapshot[];
};
type CapturedMetrics = {
  followers?: number;
  following?: number;
  totalPosts?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
};
type ObservedPost = {
  platform: string;
  url: string;
  publishedAt?: string;
  format: string;
  topic: string;
  hook: string;
  captionApproach: string;
  callToAction: string;
  metrics: CapturedMetrics;
};
type WebsiteResearchReport = {
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  logoUrl?: string | null;
  logoText?: string | null;
  excerpt: string;
  socialProfiles: Partial<Record<SocialPlatform, string>>;
  collectedAt: string;
};
type CompetitorAnalysis = {
  summary: string;
  positioning: { position: string; valueProposition: string; voiceAndMessaging: string; differentiation: string; evidence: string[] };
  content: {
    pillars: Array<{ name: string; evidence: string }>;
    formats: string[];
    patterns: string[];
    repetitionAndGaps: string[];
    reverseEngineering: Array<{ postReference: string; hook: string; story: string; emotionalTrigger: string; audienceNeed: string; value: string; visualApproach: string; callToAction: string; engagementApproach: string; lesson: string; evidence: string }>;
  };
  audience: { questions: string[]; concerns: string[]; discussionTriggers: string[]; sentiment: string; unmetNeeds: string[]; responsePatterns: string[]; privacyNote: string };
  creative: { identitySignals: string[]; distinctiveApproaches: string[]; differentiationIdeas: string[] };
  websiteAndCampaigns: { websiteFindings: string[]; seoFindings: string[]; conversionFindings: string[]; visibleCampaigns: string[]; evidenceLimits: string[] };
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  opportunities: Array<{ title: string; explanation: string; action: string; evidence: string; impact: number; ease: number; advantage: number; audienceRelevance: number; conversionPotential: number }>;
  actionPlan: { start: string[]; stop: string[]; doDifferently: string[]; formatsToPrioritize: string[]; topicsToOwn: string[]; audienceNeeds: string[]; engagement: string[]; positioning: string[]; conversion: string[] };
  contentIdeas: Array<{ title: string; format: string; opportunity: string; audience: string; hook: string; message: string; callToAction: string; differentiation: string }>;
  dataLimits: string[];
};
type CompetitorSnapshot = {
  id: string;
  observedAt: string;
  sources: Array<{ label: string; url?: string }>;
  observations: {
    platformMetrics: Array<{ platform: string; capturedAt?: string; metrics: CapturedMetrics }>;
    posts: ObservedPost[];
    websiteFindings: string[];
    seoFindings: string[];
    audienceThemes: string[];
    responsePatterns: string[];
    visibleCampaigns: string[];
    creativeNotes: string[];
    notes: string;
    websiteResearch?: {
      brandWebsite: WebsiteResearchReport | null;
      competitorWebsite: WebsiteResearchReport | null;
      warnings: string[];
    };
  };
  analysisJson: CompetitorAnalysis | null;
  analysisProvider: string | null;
};
type CompetitorResponse = {
  brand: { id: string; name: string; industry: string | null; location: string; website: string | null; products: string | null; audience: string | null; tone: string | null; description: string | null };
  competitors: CompetitorProfile[];
  dataCollection: {
    automaticMonitoring: boolean;
    connectedCompetitorPlatforms: string[];
    websiteSearchAvailable: boolean;
    websiteSearchProvider: string | null;
    instagramAccountConnected: boolean;
    instagramCompetitorInsightsAvailable: boolean;
    instagramCompetitorInsightsMessage: string;
    youtubeApiAvailable: boolean;
    xApiAvailable: boolean;
    message: string;
  };
};
type CompetitorWebsiteResult = { title: string; url: string; domain: string };
type ProfileForm = {
  name: string;
  category: CompetitorCategory;
  industry: string;
  websiteUrl: string;
  location: string;
  overview: string;
  products: string;
  audience: string;
  uniqueValue: string;
  brandVoice: string;
  socialProfiles: Record<SocialPlatform, string>;
  keywords: string;
  notes: string;
};
const emptySocialProfiles: Record<SocialPlatform, string> = {
  Instagram: "", Facebook: "", LinkedIn: "", TikTok: "", YouTube: "", X: "", Pinterest: "", Other: "",
};
const emptyProfile: ProfileForm = {
  name: "", category: "direct", industry: "", websiteUrl: "", location: "", overview: "", products: "", audience: "",
  uniqueValue: "", brandVoice: "", socialProfiles: emptySocialProfiles, keywords: "", notes: "",
};
const socialPlatforms = Object.keys(emptySocialProfiles) as SocialPlatform[];
const numberFields: Array<{ key: keyof CapturedMetrics; label: string }> = [
  { key: "followers", label: "Followers" },
  { key: "following", label: "Following" },
  { key: "totalPosts", label: "Total posts" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "views", label: "Views" },
];
const profileMetricFields = numberFields.filter(({ key }) => key === "followers" || key === "following" || key === "totalPosts");
const postMetricFields = numberFields.filter(({ key }) => key !== "followers" && key !== "following" && key !== "totalPosts");

/* Chart palette: used only for graphs and analytics accents; buttons and page theme stay on the app theme. */
const CHART = {
  cyan: "#22d3ee",
  violet: "#a78bfa",
  amber: "#fbbf24",
  pink: "#f472b6",
  green: "#34d399",
  blue: "#60a5fa",
  orange: "#fb923c",
  track: "rgba(148,163,184,0.18)",
};
const categoryMeta: Record<CompetitorCategory, { label: string; color: string }> = {
  direct: { label: "Similar service", color: CHART.cyan },
  indirect: { label: "Related service", color: CHART.violet },
  emerging: { label: "New provider", color: CHART.amber },
  "industry-leader": { label: "Established provider", color: CHART.pink },
};

function metricNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "Not captured";
}

function postInteractions(post: ObservedPost) {
  const values = [post.metrics.likes, post.metrics.comments, post.metrics.shares];
  return values.some((value) => typeof value === "number" && Number.isFinite(value))
    ? values.reduce<number>((total, value) => total + (typeof value === "number" && Number.isFinite(value) ? value : 0), 0)
    : null;
}

function profileChecklist(competitor: CompetitorProfile): Array<{ label: string; done: boolean }> {
  return [
    { label: "Industry", done: Boolean(competitor.industry) },
    { label: "Website", done: Boolean(competitor.websiteUrl) },
    { label: "Location", done: Boolean(competitor.location) },
    { label: "Overview", done: Boolean(competitor.overview) },
    { label: "Products", done: Boolean(competitor.products) },
    { label: "Audience", done: Boolean(competitor.audience) },
    { label: "Unique value", done: Boolean(competitor.uniqueValue) },
    { label: "Brand voice", done: Boolean(competitor.brandVoice) },
    { label: "Social links", done: Object.values(competitor.socialProfiles).some(Boolean) },
  ];
}

function captureMetrics(values: Record<string, string>, fields: Array<{ key: keyof CapturedMetrics }>): CapturedMetrics {
  return Object.fromEntries(fields.flatMap(({ key }) => {
    const value = values[key];
    return value !== undefined && value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0
      ? [[key, Number(value)]]
      : [];
  })) as CapturedMetrics;
}

function exportReport(competitor: CompetitorProfile) {
  const safe = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  const latest = competitor.snapshots[0] ?? null;
  const allPosts = [...new Map(competitor.snapshots.flatMap((snapshot) => snapshot.observations.posts).map((post) => [post.url, post])).values()];
  const topPosts = [...allPosts].sort((left, right) => {
    const leftInteractions = postInteractions(left);
    const rightInteractions = postInteractions(right);
    if (leftInteractions !== null && rightInteractions !== null) return rightInteractions - leftInteractions;
    if (left.metrics.views !== undefined && right.metrics.views !== undefined) return right.metrics.views - left.metrics.views;
    return Number(rightInteractions !== null || right.metrics.views !== undefined) - Number(leftInteractions !== null || left.metrics.views !== undefined);
  }).slice(0, 3);
  const summary = latest?.analysisJson?.summary.slice(0, 700) ?? "No content analysis has been saved for this profile yet.";
  const tactics = latest?.analysisJson?.content.patterns.slice(0, 3) ?? [];
  const platformMetrics = latest?.observations.platformMetrics ?? [];
  const socialLinks = Object.entries(competitor.socialProfiles).filter((entry): entry is [string, string] => Boolean(entry[1]));
  const businessSummary = competitor.products || competitor.overview || latest?.observations.websiteResearch?.competitorWebsite?.description || competitor.industry || "Business summary not yet recorded.";
  const businessFacts = [competitor.audience && `Audience: ${competitor.audience}`, competitor.uniqueValue && `Positioning: ${competitor.uniqueValue}`, competitor.brandVoice && `Voice: ${competitor.brandVoice}`].filter((item): item is string => Boolean(item));
  const platformSummary = platformMetrics.map(({ platform, metrics }) => `${platform}: ${Object.entries(metrics).filter(([, value]) => typeof value === "number").map(([key, value]) => `${key} ${Number(value).toLocaleString()}`).join(", ")}`).filter(Boolean);
  const socialLinksMarkup = socialLinks.length
    ? `<div class="socials">${socialLinks.map(([platform, url]) => `<a href="${safe(url)}">${safe(platform)}</a>`).join("")}</div>`
    : "<p>No public social links were recorded.</p>";
  const metricCards = platformMetrics.length
    ? platformSummary.map((summary) => `<div class="metric-line">${safe(summary)}</div>`).join("")
    : "<p>Platform audience metrics have not been captured.</p>";
  const postsWithViews = topPosts.filter((post) => post.metrics.views !== undefined);
  const postsWithInteractions = topPosts.filter((post) => postInteractions(post) !== null);
  const capturedViews = postsWithViews.reduce((total, post) => total + (post.metrics.views ?? 0), 0);
  const capturedInteractions = postsWithInteractions.reduce((total, post) => total + (postInteractions(post) ?? 0), 0);
  const headlineStats = `<div class="stats"><div><span>Posts captured</span><strong>${allPosts.length}</strong></div><div><span>Views · top ${postsWithViews.length}</span><strong>${postsWithViews.length ? capturedViews.toLocaleString() : "—"}</strong></div><div><span>Interactions · top ${postsWithInteractions.length}</span><strong>${postsWithInteractions.length ? capturedInteractions.toLocaleString() : "—"}</strong></div></div>`;
  const postCards = topPosts.length ? topPosts.map((post, index) => {
    const interactions = postInteractions(post);
    return `<article class="post"><div class="rank">0${index + 1}</div><div class="post-body"><h3>${safe(post.topic || post.format || "Public social post")}</h3><p>${safe(post.platform)} · ${safe(post.format)}</p><div class="metrics"><span><b>${post.metrics.views?.toLocaleString() ?? "—"}</b> views</span><span><b>${post.metrics.likes?.toLocaleString() ?? "—"}</b> likes</span><span><b>${post.metrics.comments?.toLocaleString() ?? "—"}</b> comments</span><span><b>${post.metrics.shares?.toLocaleString() ?? "—"}</b> shares</span></div><a href="${safe(post.url)}">View original post ↗</a><small>${interactions === null && post.metrics.views === undefined ? "No public performance counts recorded" : "Recorded public metrics; counts do not establish why a post performed."}</small></div></article>`;
  }).join("") : `<p class="empty">No public posts with saved evidence yet. Add post links and visible metrics in the Evidence tab.</p>`;
  const reportContent = `${headlineStats}<section class="summary"><div class="eyebrow">Business snapshot</div><h2>What they do</h2><p>${safe(businessSummary)}</p><p>${safe([competitor.industry, competitor.location].filter(Boolean).join(" · ") || "Industry and location not recorded")}</p><p>${competitor.websiteUrl ? `<a href="${safe(competitor.websiteUrl)}">${safe(competitor.websiteUrl)}</a>` : "Website not recorded"}</p>${socialLinksMarkup}${businessFacts.length ? `<ul>${businessFacts.map((item) => `<li>${safe(item)}</li>`).join("")}</ul>` : ""}</section><section><div class="section-heading"><div class="eyebrow">Platform reach</div><h2>Recorded channel metrics</h2></div>${metricCards}</section><section class="summary"><div class="eyebrow">The takeaway</div><h2>What stands out</h2><p>${safe(summary)}</p></section><section><div class="section-heading"><div class="eyebrow">Public post evidence</div><h2>Posts to study</h2></div><p class="muted">Posts are ranked by recorded views, then interactions.</p><div class="posts">${postCards}</div></section>${tactics.length ? `<section><div class="section-heading"><div class="eyebrow">Creative cues</div><h2>Patterns worth exploring</h2></div><ul>${tactics.map((item) => `<li>${safe(item)}</li>`).join("")}</ul><p class="muted">Observed patterns are clues, not proof of what caused engagement.</p></section>` : ""}${latest?.analysisJson?.positioning.differentiation ? `<section class="takeaway"><div class="eyebrow">Your next move</div><h2>Make the idea your own</h2><p>${safe(latest.analysisJson.positioning.differentiation.slice(0, 600))}</p></section>` : ""}`;
  const printWindow = window.open("", "_blank");
  if (!printWindow) { window.alert("Allow pop-ups to export this report as a PDF."); return; }
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><title>${safe(competitor.name)} · Competitor report</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:A4;margin:15mm}*{box-sizing:border-box}body{margin:0;color:#14243a;background:#eef2f8;font:14px/1.65 Inter,"Segoe UI",Arial,sans-serif}.page{max-width:900px;margin:24px auto;padding:42px;background:#fff;border-radius:20px;box-shadow:0 16px 50px #182b451c}header{position:relative;overflow:hidden;padding:34px 38px;border-radius:16px;background:linear-gradient(125deg,#101e36,#283f66 65%,#5146d8);color:white}header:after{position:absolute;right:-44px;top:-95px;width:240px;height:240px;border:1px solid #ffffff30;border-radius:50%;box-shadow:0 0 0 28px #ffffff09,0 0 0 58px #ffffff08;content:""}header .eyebrow{color:#c7c5ff}header h1{position:relative;z-index:1;max-width:650px;margin:10px 0 8px;font-size:34px;line-height:1.13;letter-spacing:-.035em}header p{position:relative;z-index:1;margin:0;color:#d9e2f1}.eyebrow{color:#6558d9;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h2{margin:6px 0 10px;font-size:21px;letter-spacing:-.02em}h3{margin:0 0 7px;font-size:14px}p,li{color:#4b5c70}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}.stats>div{padding:16px 18px;border:1px solid #e2e8f0;border-radius:12px;background:#f8f9fd}.stats span,.stats strong{display:block}.stats span{color:#64748b;font-size:11px}.stats strong{margin-top:5px;color:#172a45;font-size:24px;letter-spacing:-.03em}.section-heading{margin-bottom:8px}.section-heading h2{margin-top:4px}section{margin-top:26px}.summary,.takeaway{padding:21px 23px;border:1px solid #e2e8f0;border-radius:14px;background:linear-gradient(135deg,#f7f8ff,#fff)}.summary{border-left:4px solid #6558d9}.summary p,.takeaway p{margin-bottom:0}.muted,.empty{color:#64748b;font-size:12px}.posts{display:grid;gap:11px}.post{display:grid;grid-template-columns:40px minmax(0,1fr);gap:13px;padding:17px;border:1px solid #e2e8f0;border-radius:13px;background:#fff;box-shadow:0 3px 12px #13243a08;break-inside:avoid}.rank{display:grid;width:36px;height:36px;place-items:center;border-radius:11px;background:#eeeefe;color:#5548c9;font-size:13px;font-weight:800}.post-body{min-width:0}.post p{margin:4px 0 10px;font-size:12px}.metrics{display:flex;flex-wrap:wrap;gap:7px;margin:11px 0}.metrics span{padding:7px 10px;border:1px solid #e7ebf2;border-radius:8px;background:#f7f8fb;color:#64748b;font-size:10px}.metrics b{color:#1e2d42;font-size:12px}.post a{color:#5146d8;font-size:12px;font-weight:700;overflow-wrap:anywhere}.post small{display:block;margin-top:8px;color:#728096;font-size:10px}.takeaway{border-left:4px solid #6558d9;background:#f7f6ff}ul{padding-left:20px}li{margin:7px 0}.notice{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;color:#728096;font-size:10px}.actions{position:sticky;top:0;display:flex;justify-content:flex-end;padding:12px;background:#eef2f8}.actions button{border:0;border-radius:9px;padding:11px 16px;background:#5146d8;color:white;font-weight:700;cursor:pointer;box-shadow:0 5px 14px #5146d833}@media(max-width:640px){.page{margin:10px;padding:16px}header{padding:25px 22px}.stats{grid-template-columns:1fr}header h1{font-size:28px}}@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{background:white}.page{max-width:none;margin:0;padding:0;box-shadow:none;border-radius:0}header{break-inside:avoid}.actions{display:none}a{color:inherit}}</style></head><body><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div><main class="page"><header><div class="eyebrow">Competitor content report · Generated ${new Date().toLocaleDateString()}</div><h1>${safe(competitor.name)}</h1><p>${safe([competitor.industry, competitor.location].filter(Boolean).join(" · ") || "Public profile research")}</p></header>${reportContent}<div class="notice">Public metrics are recorded evidence. Content analysis is an interpretation, not independently verified research.</div></main></body></html>`);
  printWindow.document.close();
  printWindow.focus();
}

function actionBrief(idea: CompetitorAnalysis["contentIdeas"][number]) {
  return `Create an original ${idea.format} for ${idea.audience}. Opportunity: ${idea.opportunity}. Hook: ${idea.hook}. Core message: ${idea.message}. CTA: ${idea.callToAction}. Differentiate from competitor patterns by: ${idea.differentiation}. Do not copy competitor wording, visuals, or claims.`;
}

function MetricGrid({ metrics }: { metrics: CapturedMetrics }) {
  return <div className="competitor-metric-grid">{numberFields.filter(({ key }) => metrics[key] !== undefined).map(({ key, label }) => (
    <div key={key}><span>{label}</span><strong>{metricNumber(metrics[key])}</strong></div>
  ))}</div>;
}

function InsightList({ title, items, empty = "No sourced observations recorded yet." }: { title: string; items: string[]; empty?: string }) {
  return <section className="competitor-insight-section"><h3>{title}</h3>{items.length
    ? <ul>{items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
    : <p>{empty}</p>}</section>;
}

/* ---------- Lightweight chart helpers ---------- */

function shortLabel(text: string, max = 34) {
  const clean = text.replace(/^https?:\/\//, "");
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function HorizontalBars({ rows, emptyText }: { rows: Array<{ label: string; value: number; color: string; display?: string }>; emptyText: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <p style={{ margin: 0, opacity: 0.7 }}>{emptyText}</p>;
  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0, width: "100%" }}>
      {rows.map((row) => (
        <div key={row.label} style={{ display: "grid", gap: 6, minWidth: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, fontSize: 13 }}>
            <span title={row.label} style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortLabel(row.label)}</span>
            <strong style={{ color: row.color }}>{row.display ?? row.value.toLocaleString()}</strong>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: CHART.track, overflow: "hidden" }}>
            <div style={{ width: `${row.value ? Math.max(4, row.value / max * 100) : 0}%`, height: "100%", borderRadius: 999, background: `linear-gradient(90deg, ${row.color}, ${row.color}aa)`, boxShadow: `0 0 12px ${row.color}55` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CompetitorIntelligenceClient() {
  const profileFormRef = useRef<HTMLFormElement>(null);
  const selectedProfileRef = useRef<HTMLDetailsElement>(null);
  const automaticDiscoveryStarted = useRef(false);
  const logoScansStarted = useRef(new Set<string>());
  const [data, setData] = useState<CompetitorResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileFormPlacement, setProfileFormPlacement] = useState<"page" | "empty">("page");
  const [loading, setLoading] = useState(true);
  const [searchBusy, setSearchBusy] = useState(false);
  const [marketSearchInput, setMarketSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<CompetitorWebsiteResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [retryDiscovery, setRetryDiscovery] = useState(false);
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"overview" | "evidence" | "analysis" | "compare" | "posts">("analysis");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [observedPlatform, setObservedPlatform] = useState<SocialPlatform>("Instagram");
  const [metricValues, setMetricValues] = useState<Record<string, string>>({});
  const [postUrl, setPostUrl] = useState("");
  const [postFormat, setPostFormat] = useState("post");
  const [postTopic, setPostTopic] = useState("");
  const [postHook, setPostHook] = useState("");
  const [postApproach, setPostApproach] = useState("");
  const [postCta, setPostCta] = useState("");
  const [websiteFindings, setWebsiteFindings] = useState("");
  const [seoFindings, setSeoFindings] = useState("");
  const [audienceThemes, setAudienceThemes] = useState("");
  const [responsePatterns, setResponsePatterns] = useState("");
  const [visibleCampaigns, setVisibleCampaigns] = useState("");
  const [creativeNotes, setCreativeNotes] = useState("");
  const [observationNotes, setObservationNotes] = useState("");
  const [postPlatformFilter, setPostPlatformFilter] = useState("all");
  const [postFormatFilter, setPostFormatFilter] = useState("all");
  const [postTopicFilter, setPostTopicFilter] = useState("");
  const [postDateFilter, setPostDateFilter] = useState("");
  const [postSort, setPostSort] = useState<"engagement" | "date">("engagement");
  const [comparisonPlatform, setComparisonPlatform] = useState("all");
  const [observationDate, setObservationDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [postPublishedDate, setPostPublishedDate] = useState("");

  const load = useCallback(async (keepSelected = true) => {
    try {
      const response = await apiRequest<CompetitorResponse>("/api/competitors");
      setData(response);
      setError("");
      setRetryDiscovery(false);
      setSelectedId((current) => keepSelected && response.competitors.some((competitor) => competitor.id === current)
        ? current
        : "");
    } catch (requestError) {
      setRetryDiscovery(false);
      setError(requestError instanceof Error ? requestError.message : "Could not load competitor intelligence.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(false), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (loading || !data) return;
    const needingLogo = data.competitors.filter((competitor) => {
      const report = competitor.snapshots[0]?.observations.websiteResearch?.competitorWebsite;
      let hasImage = false;
      try { hasImage = Boolean(report?.logoUrl && new URL(report.logoUrl).pathname !== "/"); } catch { hasImage = false; }
      return Boolean(competitor.websiteUrl && !hasImage && !report?.logoText && !logoScansStarted.current.has(competitor.id));
    });
    if (!needingLogo.length) return;
    for (const competitor of needingLogo) logoScansStarted.current.add(competitor.id);
    void Promise.allSettled(needingLogo.map((competitor) => apiRequest(`/api/competitors/${encodeURIComponent(competitor.id)}/research-website`, { method: "POST", body: JSON.stringify({}) })))
      .then((results) => {
        if (results.some((result) => result.status === "fulfilled")) void load();
      });
  }, [data, load, loading]);

  useEffect(() => {
    if (!showProfileForm) return;
    const formElement = profileFormRef.current;
    if (!formElement) return;
    formElement.scrollIntoView({ behavior: "smooth", block: "start" });
    formElement.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [data?.competitors.length, profileFormPlacement, showProfileForm]);

  useEffect(() => {
    if (selectedId) selectedProfileRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  const selected = data?.competitors.find((competitor) => competitor.id === selectedId) ?? null;
  const latest = selected?.snapshots[0] ?? null;
  const analysis = latest?.analysisJson ?? null;
  const observedPosts = selected ? [...new Map(selected.snapshots.flatMap((snapshot) => snapshot.observations.posts).map((post) => [post.url, post])).values()] : [];
  const excludedCompetitorHosts = new Set(["wanderlog.com", "magicpin.in", "tracxn.com", "rocketreach.co", "tripadvisor.com", "zomato.com", "swiggy.com", "justdial.com", "yelp.com", "google.com", "facebook.com", "instagram.com", "linkedin.com", "tiktok.com", "x.com", "twitter.com"]);
  const competitorIsBusiness = (competitor: CompetitorProfile) => {
    let host = "";
    try { host = new URL(competitor.websiteUrl || "").hostname.toLowerCase().replace(/^www\./, ""); } catch { return false; }
    const titleLooksLikeListing = /\b(?:list of|market trends?|industry report|startups? in|top \d+|directory|business listings?|reviews? and ratings?)\b/i.test(competitor.name);
    return !titleLooksLikeListing && ![...excludedCompetitorHosts].some((excluded) => host === excluded || host.endsWith(`.${excluded}`));
  };
  const rankedCompetitors = [...(data?.competitors ?? [])].filter(competitorIsBusiness).map((competitor) => {
    const posts = [...new Map(competitor.snapshots.flatMap((snapshot) => snapshot.observations.posts).map((post) => [post.url, post])).values()];
    const interactions = posts.reduce((total, post) => total + (postInteractions(post) ?? 0), 0);
    const measuredPosts = posts.filter((post) => postInteractions(post) !== null).length;
    const views = posts.reduce((total, post) => total + (post.metrics.views ?? 0), 0);
    return { competitor, posts, interactions, measuredPosts, views };
  }).sort((left, right) => right.interactions - left.interactions || right.views - left.views || right.measuredPosts - left.measuredPosts || left.competitor.name.localeCompare(right.competitor.name));
  const allCompetitorPosts = rankedCompetitors.flatMap(({ competitor }) => {
    const uniquePosts = new Map<string, { competitor: CompetitorProfile; snapshot: CompetitorSnapshot; post: ObservedPost; interactions: number | null }>();
    for (const snapshot of competitor.snapshots) for (const post of snapshot.observations.posts) {
      if (!uniquePosts.has(post.url)) uniquePosts.set(post.url, { competitor, snapshot, post, interactions: postInteractions(post) });
    }
    return [...uniquePosts.values()];
  });
  const topViewedPosts = [...allCompetitorPosts].filter(({ post }) => typeof post.metrics.views === "number")
    .sort((left, right) => (right.post.metrics.views ?? 0) - (left.post.metrics.views ?? 0)).slice(0, 3);
  const topInteractedPosts = [...allCompetitorPosts].filter(({ interactions }) => interactions !== null)
    .sort((left, right) => (right.interactions ?? 0) - (left.interactions ?? 0)).slice(0, 3);
  const tacticGroups = new Map<string, { interactions: number; count: number }>();
  for (const { post, interactions } of allCompetitorPosts) {
    const format = post.format.trim() || "Unspecified format";
    const current = tacticGroups.get(format) ?? { interactions: 0, count: 0 };
    current.interactions += interactions ?? 0;
    current.count += 1;
    tacticGroups.set(format, current);
  }
  const topTactics = [...tacticGroups].map(([format, values]) => ({ format, ...values }))
    .sort((left, right) => right.interactions - left.interactions || right.count - left.count).slice(0, 5);
  const postsWithInteractions = observedPosts
    .map((post) => ({ post, interactions: postInteractions(post) }))
    .filter((entry): entry is { post: ObservedPost; interactions: number } => entry.interactions !== null)
    .sort((left, right) => right.interactions - left.interactions);
  const topInteractionPost = postsWithInteractions[0] ?? null;
  const topViewedPost = observedPosts
    .filter((post): post is ObservedPost & { metrics: CapturedMetrics & { views: number } } => typeof post.metrics.views === "number" && Number.isFinite(post.metrics.views))
    .sort((left, right) => right.metrics.views - left.metrics.views)[0] ?? null;
  const displayedPosts = [...observedPosts
    .filter((post) => postPlatformFilter === "all" || post.platform === postPlatformFilter)
    .filter((post) => postFormatFilter === "all" || post.format.toLowerCase() === postFormatFilter)
    .filter((post) => !postTopicFilter.trim() || post.topic.toLowerCase().includes(postTopicFilter.trim().toLowerCase()))
    .filter((post) => !postDateFilter || Boolean(post.publishedAt && post.publishedAt.slice(0, 10) >= postDateFilter))]
    .sort((left, right) => {
      if (postSort === "date") return (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
      return (postInteractions(right) ?? -1) - (postInteractions(left) ?? -1);
    });
  const comparisonRows = (data?.competitors ?? []).filter(competitorIsBusiness).map((competitor) => {
    const snapshot = competitor.snapshots[0];
    const platformMetrics = snapshot?.observations.platformMetrics.filter((item) => comparisonPlatform === "all" || item.platform === comparisonPlatform) ?? [];
    const posts = snapshot?.observations.posts.filter((post) => comparisonPlatform === "all" || post.platform === comparisonPlatform) ?? [];
    const sum = (key: "likes" | "comments") => posts.reduce((total, post) => total + (post.metrics[key] ?? 0), 0);
    const followerTotal = platformMetrics.reduce((total, item) => total + (item.metrics.followers ?? 0), 0);
    const hasFollowers = platformMetrics.some((item) => item.metrics.followers !== undefined);
    const byPlatform = (key: "followers" | "following" | "totalPosts") => platformMetrics
      .filter((item) => item.metrics[key] !== undefined)
      .map((item) => `${item.platform}: ${metricNumber(item.metrics[key])}`).join(" · ") || "Not captured";
    return { competitor, snapshot, platformMetrics, posts, sum, byPlatform, followerTotal, hasFollowers };
  });
  const followerBars = comparisonRows.filter((row) => row.hasFollowers).map((row, index) => ({
    label: row.competitor.name,
    value: row.followerTotal,
    color: [CHART.cyan, CHART.violet, CHART.amber, CHART.pink, CHART.green, CHART.blue][index % 6]!,
  }));
  const engagementBars = comparisonRows.filter((row) => row.posts.length).map((row, index) => ({
    label: row.competitor.name,
    value: row.posts.reduce((total, post) => total + (postInteractions(post) ?? 0), 0),
    color: [CHART.green, CHART.pink, CHART.amber, CHART.violet, CHART.cyan, CHART.blue][index % 6]!,
  }));

  function editProfile(competitor: CompetitorProfile) {
    setSelectedId(competitor.id);
    setProfileFormPlacement("page");
    setForm({
      name: competitor.name,
      category: competitor.category,
      industry: competitor.industry ?? "",
      websiteUrl: competitor.websiteUrl ?? "",
      location: competitor.location ?? "",
      overview: competitor.overview ?? "",
      products: competitor.products ?? "",
      audience: competitor.audience ?? "",
      uniqueValue: competitor.uniqueValue ?? "",
      brandVoice: competitor.brandVoice ?? "",
      socialProfiles: { ...emptySocialProfiles, ...competitor.socialProfiles },
      keywords: competitor.keywords.join(", "),
      notes: competitor.notes ?? "",
    });
    setShowProfileForm(true);
    setTab("overview");
  }

  function startNewProfile(prefill?: Partial<ProfileForm>, placement: "page" | "empty" = "page") {
    setSelectedId("");
    setForm({ ...emptyProfile, ...prefill });
    setProfileFormPlacement(placement);
    setShowProfileForm(true);
    setTab("overview");
  }

  async function searchWebsites(query: string) {
    setSearchBusy(true);
    setSearchError("");
    setSearchResults([]);
    setActiveSearchQuery(query);
    try {
      const response = await apiRequest<{ results: CompetitorWebsiteResult[] }>(
        `/api/competitors/search?q=${encodeURIComponent(query)}`,
      );
      setSearchResults(response.results);
    } catch (requestError) {
      setSearchError(requestError instanceof Error ? requestError.message : "Could not search public websites.");
    } finally {
      setSearchBusy(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("profile");
    setError("");
    setRetryDiscovery(false);
    setNotice("");
    const socialProfiles = Object.fromEntries(Object.entries(form.socialProfiles).filter(([, value]) => value.trim()));
    const payload = {
      name: form.name,
      category: form.category,
      industry: form.industry,
      websiteUrl: form.websiteUrl.trim() || null,
      location: form.location,
      overview: form.overview,
      products: form.products,
      audience: form.audience,
      uniqueValue: form.uniqueValue,
      brandVoice: form.brandVoice,
      socialProfiles,
      keywords: form.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean),
      notes: form.notes,
    };
    try {
      const path = selectedId ? `/api/competitors/${encodeURIComponent(selectedId)}` : "/api/competitors";
      const response = await apiRequest<{ competitor: CompetitorProfile }>(path, {
        method: selectedId ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setSelectedId(response.competitor.id);
      setShowProfileForm(false);
      setNotice(`${response.competitor.name} saved.`);
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this competitor.");
    } finally {
      setBusy("");
    }
  }

  function renderProfileForm() {
    return (
      <form ref={profileFormRef} className="competitor-profile-form" onSubmit={(event) => void saveProfile(event)}>
        <div className="created-results-heading"><div><p className="card-kicker">{selectedId ? "EDIT PROFILE" : "COMPETITOR DISCOVERY"}</p><h2>{selectedId ? "Update competitor profile" : "Add a competitor"}</h2><p>Enter known business and profile details. These fields are context, not independently verified facts.</p></div><button className="button button-outline" type="button" onClick={() => setShowProfileForm(false)}>Close</button></div>
        <div className="competitor-form-grid">
          <label>Business name<input required minLength={2} maxLength={191} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Service relationship<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as CompetitorCategory })}><option value="direct">Offers a similar service</option><option value="indirect">Offers a related service</option><option value="emerging">New provider</option><option value="industry-leader">Established provider</option></select></label>
          <label>Industry or category<input value={form.industry} maxLength={500} onChange={(event) => setForm({ ...form, industry: event.target.value })} /></label>
          <label>Website URL<input type="url" value={form.websiteUrl} maxLength={2048} placeholder="https://" onChange={(event) => setForm({ ...form, websiteUrl: event.target.value })} /></label>
          <label>Location or target market<input value={form.location} maxLength={500} onChange={(event) => setForm({ ...form, location: event.target.value })} /></label>
          <label>Unique value proposition<textarea rows={2} value={form.uniqueValue} maxLength={2000} onChange={(event) => setForm({ ...form, uniqueValue: event.target.value })} /></label>
          <label>Business overview<textarea rows={3} value={form.overview} maxLength={4000} onChange={(event) => setForm({ ...form, overview: event.target.value })} /></label>
          <label>Products or services<textarea rows={3} value={form.products} maxLength={4000} onChange={(event) => setForm({ ...form, products: event.target.value })} /></label>
          <label>Target audience<textarea rows={3} value={form.audience} maxLength={3000} onChange={(event) => setForm({ ...form, audience: event.target.value })} /></label>
          <label>Brand voice or messaging<textarea rows={3} value={form.brandVoice} maxLength={2000} onChange={(event) => setForm({ ...form, brandVoice: event.target.value })} /></label>
          <label>Research keywords<input value={form.keywords} maxLength={2000} placeholder="Separate keywords with commas" onChange={(event) => setForm({ ...form, keywords: event.target.value })} /></label>
          <label>Research notes<textarea rows={3} value={form.notes} maxLength={4000} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
        </div>
        <div className="competitor-social-fields"><h3>Public social profile links</h3><div className="competitor-form-grid">{socialPlatforms.map((platform) => <label key={platform}>{platform}<input type="url" value={form.socialProfiles[platform]} placeholder="https://" onChange={(event) => setForm({ ...form, socialProfiles: { ...form.socialProfiles, [platform]: event.target.value } })} /></label>)}</div></div>
        <div className="campaign-workflow-actions"><button className="button button-gold" type="submit" disabled={busy === "profile"}>{busy === "profile" ? "Saving…" : selectedId ? "Save profile" : "Add competitor"}</button><button className="button button-outline" type="button" onClick={() => setShowProfileForm(false)}>Cancel</button></div>
      </form>
    );
  }

  async function removeCompetitor(competitor: CompetitorProfile) {
    if (!window.confirm(`Remove ${competitor.name} and its saved observations from this workspace?`)) return;
    setBusy("remove");
    setError("");
    setRetryDiscovery(false);
    setNotice("");
    try {
      await apiRequest(`/api/competitors/${encodeURIComponent(competitor.id)}`, { method: "DELETE" });
      setSelectedId("");
      setShowProfileForm(false);
      setNotice(`${competitor.name} and its saved intelligence were removed.`);
      await load(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not remove this competitor.");
    } finally {
      setBusy("");
    }
  }

  async function recordSnapshot(event: FormEvent<HTMLFormElement>, target = selected) {
    event.preventDefault();
    if (!target) return;
    setBusy("snapshot");
    setError("");
    setRetryDiscovery(false);
    setNotice("");
    const profileMetrics = captureMetrics(metricValues, postUrl.trim() ? profileMetricFields : numberFields);
    const postMetrics = captureMetrics(metricValues, postMetricFields);
    const platformMetrics = Object.keys(profileMetrics).length
      ? [{ platform: observedPlatform, capturedAt: new Date().toISOString(), metrics: profileMetrics }]
      : [];
    const posts = postUrl.trim() ? [{
      platform: observedPlatform,
      url: postUrl.trim(),
      ...(postPublishedDate ? { publishedAt: new Date(`${postPublishedDate}T12:00:00`).toISOString() } : {}),
      format: postFormat,
      topic: postTopic.trim(),
      hook: postHook.trim(),
      captionApproach: postApproach.trim(),
      callToAction: postCta.trim(),
      metrics: postMetrics,
    }] : [];
    try {
      await apiRequest<{ snapshot: CompetitorSnapshot }>(`/api/competitors/${encodeURIComponent(target.id)}/snapshots`, {
        method: "POST",
        body: JSON.stringify({
          observedAt: new Date(`${observationDate}T12:00:00`).toISOString(),
          sources: [{ label: sourceLabel.trim(), ...(sourceUrl.trim() ? { url: sourceUrl.trim() } : {}) }],
          observations: {
            platformMetrics,
            posts,
            websiteFindings: websiteFindings.split("\n").map((item) => item.trim()).filter(Boolean),
            seoFindings: seoFindings.split("\n").map((item) => item.trim()).filter(Boolean),
            audienceThemes: audienceThemes.split("\n").map((item) => item.trim()).filter(Boolean),
            responsePatterns: responsePatterns.split("\n").map((item) => item.trim()).filter(Boolean),
            visibleCampaigns: visibleCampaigns.split("\n").map((item) => item.trim()).filter(Boolean),
            creativeNotes: creativeNotes.split("\n").map((item) => item.trim()).filter(Boolean),
            notes: observationNotes.trim(),
          },
        }),
      });
      await load();
      setSelectedId(target.id);
      setTab("evidence");
      setNotice("Dated public observations saved with their source. Metrics remain attributed to your recorded source, not a connected competitor API.");
      setMetricValues({});
      setPostUrl("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this observation.");
    } finally {
      setBusy("");
    }
  }

  async function analyzeLatest(target = selected) {
    if (!target) return;
    setBusy("analysis");
    setError("");
    setRetryDiscovery(false);
    setNotice("");
    try {
      const response = await apiRequest<{
        research: { scannedWebsiteCount: number; discoveredSocialProfiles: number; addedSocialProfiles: number; collectedSocialPosts: number; warnings: string[] };
      }>(`/api/competitors/${encodeURIComponent(target.id)}/analyze`, {
        method: "POST",
        body: JSON.stringify(target.snapshots[0] ? { snapshotId: target.snapshots[0].id } : {}),
      });
      await load();
      setSelectedId(target.id);
      setTab("analysis");
      const scanned = response.research.scannedWebsiteCount;
      const accounts = response.research.discoveredSocialProfiles;
      const collectedPosts = response.research.collectedSocialPosts;
      setNotice(collectedPosts
        ? `Research updated · ${collectedPosts} posts across ${accounts} channels.`
        : `Research updated · ${scanned} websites scanned. Review channel access below.`);
    } catch (requestError) {
      // Website and social observations are persisted before AI generation.
      // Reload them even when the analysis provider fails so refreshed logos
      // and social links still appear on the card.
      await load(false).catch(() => undefined);
      setSelectedId(target.id);
      setError(requestError instanceof Error ? requestError.message : "Could not analyze the saved observations.");
    } finally {
      setBusy("");
    }
  }

  async function refreshWebsiteFindings(target: CompetitorProfile) {
    setBusy("website");
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{ logoUrl: string | null; logoText: string | null }>(`/api/competitors/${encodeURIComponent(target.id)}/research-website`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
      setNotice(result.logoUrl || result.logoText
        ? `Website scan saved the ${result.logoUrl ? "logo image" : "brand mark"} for ${target.name}.`
        : `The homepage scan completed, but ${target.name} does not expose a recognizable logo image or brand mark in its public markup.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not scan the competitor website.");
    } finally {
      setBusy("");
    }
  }

  const discoverAndAnalyze = useCallback(async () => {
    setBusy("discovery");
    setError("");
    setRetryDiscovery(false);
    setNotice("");
    try {
      const response = await apiRequest<{
        discovered: Array<{ id: string; name: string; websiteUrl: string | null }>;
        analysisQueue: Array<{ id: string; name: string }>;
        message: string;
        searchWarnings: string[];
      }>("/api/competitors/discover", {
        method: "POST",
        body: JSON.stringify({ maxCandidates: 3 }),
      });
      if (!response.analysisQueue.length) {
        await load();
        setNotice(response.discovered.length ? "Competitor snapshots are up to date." : "No new competitor profiles found. Try a narrower market or location.");
        return true;
      }

      const analyzed: string[] = [];
      const failures: string[] = [];
      for (const competitor of response.analysisQueue) {
        try {
          await apiRequest(`/api/competitors/${encodeURIComponent(competitor.id)}/analyze`, {
            method: "POST",
            body: JSON.stringify({}),
          });
          analyzed.push(competitor.name);
        } catch (requestError) {
          failures.push(`${competitor.name}: ${requestError instanceof Error ? requestError.message : "Analysis failed."}`);
        }
      }

      await load(false);
      setSelectedId(response.analysisQueue[0]!.id);
      setTab("analysis");
      setNotice(response.discovered.length
        ? `${response.discovered.length} competitor snapshot${response.discovered.length === 1 ? "" : "s"} added. Open a card to review profile, channel, and post research.`
        : `${analyzed.length} competitor snapshot${analyzed.length === 1 ? "" : "s"} refreshed.`);
      if (failures.length) {
        setRetryDiscovery(true);
        setError(`Some analyses could not finish: ${failures.join(" ")}`);
      }
      return failures.length === 0;
    } catch (requestError) {
      setRetryDiscovery(true);
      setError(requestError instanceof Error ? requestError.message : "Automatic competitor discovery failed.");
      return false;
    } finally {
      setBusy("");
    }
  }, [load]);

  useEffect(() => {
    if (loading || !data || !data.dataCollection.websiteSearchAvailable || automaticDiscoveryStarted.current) return;
    const hasBrandContext = Boolean(data.brand.industry || data.brand.products || data.brand.description);
    if (!hasBrandContext) return;

    const storageKey = `competitor-auto-discovery:${data.brand.id}`;
    const profileSignature = JSON.stringify([
      data.brand.industry,
      data.brand.location,
      data.brand.products,
      data.brand.audience,
      data.brand.description,
      data.brand.website,
    ]);
    try {
      if (window.localStorage.getItem(storageKey) === profileSignature) return;
      window.localStorage.setItem(storageKey, profileSignature);
    } catch {
      window.setTimeout(() => setError("Automatic discovery could not start because this browser could not save its run marker. Use Auto-discover & analyze to retry."), 0);
      return;
    }

    automaticDiscoveryStarted.current = true;
    window.setTimeout(() => {
      void discoverAndAnalyze().then((success) => {
        if (success) return;
        try {
          if (window.localStorage.getItem(storageKey) === profileSignature) window.localStorage.removeItem(storageKey);
        } catch {
          setError("Automatic discovery failed, and this browser could not reset its retry marker. Use Auto-discover & analyze to retry.");
        }
      });
    }, 0);
  }, [data, discoverAndAnalyze, loading]);

  const searchQueries = data ? [
    {
      label: `${data.brand.industry || "Industry"} alternatives${data.brand.location ? ` · ${data.brand.location}` : ""}`,
      query: `"${data.brand.industry || "your industry"}" ${data.brand.location} alternatives`,
    },
    {
      label: `Businesses${data.brand.location ? ` · ${data.brand.location}` : " in your market"}`,
      query: `${data.brand.industry || "industry"} ${data.brand.location} businesses`,
    },
    {
      label: `Brands serving ${data.brand.location || "your market"}`,
      query: `${data.brand.industry || "industry"} brands serving ${data.brand.location || "your target market"}`,
    },
    ...(selected?.keywords.slice(0, 2).map((keyword) => ({
      label: `Businesses · ${keyword}`,
      query: `${keyword} ${data.brand.location} company`,
    })) ?? []),
  ] : [];

  const accentFor = (index: number) => [CHART.cyan, CHART.violet, CHART.amber, CHART.pink, CHART.green, CHART.blue, CHART.orange][index % 7]!;
  const tabs = [
    { key: "overview", label: "Profile", Icon: UsersRound, color: CHART.cyan, count: 0 },
    { key: "posts", label: "Top posts", Icon: Activity, color: CHART.green, count: 0 },
    { key: "analysis", label: "Why it works", Icon: Brain, color: CHART.amber, count: 0 },
    { key: "compare", label: "Brand fit", Icon: BarChart3, color: CHART.pink, count: 0 },
    { key: "evidence", label: "Sources & metrics", Icon: FileText, color: CHART.violet, count: 0 },
  ] as const;
  const activeTab = tabs.find((item) => item.key === tab) ?? tabs[0];

  return (
    <section className="dashboard-content competitor-page ci-page">
      <style>{`
html[data-theme-preset] body .app-shell .dashboard-content.ci-page { display: flex; flex-direction: column; gap: 20px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page > * { margin: 0 !important; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head h1 { margin: 0 !important; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-pill { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 999px; padding: 6px 12px; font-size: 12px; color: var(--navy-600); cursor: help; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi { position: relative; display: flex; align-items: center; gap: 14px; overflow: hidden; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 14px; padding: 16px 18px 16px 22px; background: var(--studio-panel-raised, var(--ivory-50)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi::before { position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--c); content: ""; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi-icon { display: grid; width: 44px; height: 44px; flex: 0 0 44px; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi strong { display: block; font-size: 28px; line-height: 1.05; color: var(--foreground); white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi strong.is-text { font-size: 18px; padding: 5px 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi small { display: block; margin-top: 3px; color: var(--navy-600); font-size: 12px; font-weight: 600; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card { min-width: 0; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 14px; padding: 18px; background: var(--studio-panel-raised, var(--ivory-50)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 14px; font-size: 14px; font-weight: 700; color: var(--foreground); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card h2 svg { color: var(--accent-500); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card-head h2 { margin: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row { display: flex; align-items: center; gap: 18px; min-width: 0; flex-wrap: wrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-split { display: grid; grid-template-columns: 330px minmax(0, 1fr); align-items: start; gap: 20px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-list { display: grid; gap: 8px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp { display: grid; grid-template-columns: 44px minmax(0, 1fr); align-items: center; gap: 12px; width: 100%; min-height: 0 !important; border: 1px solid var(--studio-line, var(--ivory-300)); border-left: 4px solid var(--c); border-radius: 12px !important; padding: 10px 12px !important; background: var(--studio-panel, var(--ivory-50)); color: var(--foreground); text-align: left; cursor: pointer; transition: border-color .15s, background .15s; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp:hover { background: color-mix(in srgb, var(--c) 8%, var(--studio-panel, var(--ivory-50))); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp.is-selected { border-color: var(--c); background: color-mix(in srgb, var(--c) 12%, var(--studio-panel, var(--ivory-50))); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp strong { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; color: var(--foreground); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp small { display: block; margin-top: 3px; font-size: 11px; color: var(--navy-600); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-queries { display: grid; gap: 8px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-search-form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin: 2px 0 4px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-search-form input { min-width: 0; min-height: 42px; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 9px; padding: 0 12px; background: var(--studio-panel, var(--ivory-50)); color: var(--foreground); font: inherit; font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-search-form input:focus-visible { outline: 2px solid var(--accent-500); outline-offset: 2px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-search-form .button { min-height: 42px; padding: 0 15px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-query { display: grid; grid-template-columns: 32px minmax(0, 1fr) 16px; align-items: center; gap: 10px; width: 100%; min-height: 0 !important; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 10px !important; padding: 9px 10px !important; background: var(--studio-panel, var(--ivory-50)); color: var(--foreground); text-align: left; cursor: pointer; font-size: 13px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-query:hover:not(:disabled) { border-color: var(--c); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-query-icon { display: grid; width: 32px; height: 32px; place-items: center; border-radius: 9px; background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-query span.t { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-note { margin: 10px 0 0; color: var(--navy-600); font-size: 12px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-results { display: grid; gap: 8px; margin-top: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-result { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 10px; padding: 9px 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-result strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-result span { color: var(--navy-600); font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-result-actions { display: flex; align-items: center; gap: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-result-actions a, html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-result-actions button { border: 0; background: transparent; padding: 2px !important; min-height: 0 !important; color: var(--accent-500); font-size: 12px; font-weight: 700; cursor: pointer; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity { display: grid; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity button { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; min-height: 0 !important; border: 0; border-bottom: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 0 !important; padding: 10px 0 !important; background: transparent; color: var(--foreground); text-align: left; cursor: pointer; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity button:last-child { border-bottom: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dot { width: 10px; height: 10px; border-radius: 50%; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity small { color: var(--navy-600); font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity time { color: var(--navy-600); font-size: 11px; white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-head { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-title { min-width: 0; flex: 1 1 260px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-title h2 { margin: 0 !important; font-size: 20px !important; line-height: 1.3; overflow-wrap: anywhere; color: var(--foreground); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-title p { margin: 4px 0 0; color: var(--navy-600); font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-badge { display: inline-block; margin-bottom: 6px; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-weight: 700; text-transform: capitalize; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-actions { display: flex; gap: 8px; flex-wrap: wrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tabs { display: flex; gap: 6px; overflow-x: auto; border-bottom: 1px solid var(--studio-line, var(--ivory-300)); padding-bottom: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tab { display: inline-flex; align-items: center; gap: 7px; flex: 0 0 auto; border: 1px solid transparent; border-radius: 999px; padding: 8px 14px; background: transparent; color: var(--navy-600); font-size: 13px; font-weight: 650; cursor: pointer; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tab:hover { color: var(--foreground); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tab.is-active { border-color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); color: var(--foreground); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tab em { font-style: normal; border-radius: 999px; padding: 1px 7px; background: color-mix(in srgb, var(--c) 25%, transparent); font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: stretch; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-sub { border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 12px; padding: 16px; background: var(--studio-panel, var(--ivory-50)); min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-sub h3 { margin: 0 0 12px; font-size: 14px; color: var(--foreground); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chip { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 10px 14px; margin: 0; font-size: 13px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl dt { color: var(--navy-600); font-weight: 650; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--foreground); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-stack { display: flex; flex-direction: column; gap: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-stack .button { width: 100%; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-links { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-links a { color: var(--accent-500); font-size: 12px; font-weight: 700; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-toolbar label { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 650; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-toolbar select { min-width: 170px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-filters { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-filters label { display: grid; gap: 6px; min-width: 0; font-size: 12px; font-weight: 650; color: var(--navy-600); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-empty { display: grid; justify-items: center; gap: 12px; padding: 40px 20px; text-align: center; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-empty h2 { margin: 0; font-size: 18px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-brand { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 13px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-brand strong { color: var(--foreground); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-brand span, html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-brand a { color: var(--navy-600); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-brand a { color: var(--accent-500); font-weight: 700; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-profile-form { margin: 0 !important; }
@media (max-width: 1150px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-split { grid-template-columns: minmax(0, 1fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-filters { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 760px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts, html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-grid2 { grid-template-columns: minmax(0, 1fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl dd { margin-bottom: 8px; }
}
/* ================================================================
   COMPETITOR INTELLIGENCE — COMPLETE PAGE UI PASS
   Scoped to .ci-page. Preserves the app theme, fonts and button system.
   All existing JSX, state, handlers, API calls and data remain intact.
================================================================ */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page {
  gap: 22px !important;
  width: 100%;
  min-width: 0;
  max-width: 1440px;
  box-sizing: border-box;
  padding: 42px clamp(18px, 3vw, 44px) 80px !important;
  container: competitor-intelligence / inline-size;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page > * {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-error-alert {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  overflow: hidden;
  overflow-wrap: anywhere;
  word-break: break-word;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-error-alert button { margin: 0; white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-error-summary { min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-error-summary p { margin: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-error-summary details { margin-top: 8px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-error-summary summary { cursor: pointer; font-weight: 700; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-error-summary pre {
  max-height: 220px;
  overflow: auto;
  margin: 8px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head > div { min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head > div > p { margin: 7px 0 0; max-width: 760px; color: var(--navy-600); font-size: 13px; line-height: 1.55; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-insight-caption { margin: -5px 0 13px; color: var(--navy-600); font-size: 11px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-insight-empty { margin: 0; color: var(--navy-600); font-size: 12px; line-height: 1.6; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-profile-list,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-post-list { display: grid; gap: 8px; min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-profile-list > button,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-post-list > article {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 9px;
  background: var(--studio-panel, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-profile-list > button { color: var(--foreground); text-align: left; cursor: pointer; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-profile-list > button:hover { border-color: var(--accent-500); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-rank { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 50%; background: color-mix(in srgb, var(--accent-500) 18%, transparent); color: var(--accent-500); font-size: 12px; font-weight: 800; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-profile-name,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-post-list > article > div { min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-profile-list strong,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-post-list strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-profile-list small,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-post-list small { display: block; margin-top: 3px; color: var(--navy-600); font-size: 10px; line-height: 1.4; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-profile-score { color: var(--accent-500); font-variant-numeric: tabular-nums; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-post-list a { color: var(--accent-500); font-size: 11px; font-weight: 700; white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-chart { display: grid; gap: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-chart > div { display: grid; gap: 5px; min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-chart > div > div { display: flex; justify-content: space-between; gap: 10px; min-width: 0; font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-chart strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-chart > div > div > span { color: var(--navy-600); white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-track { display: block; height: 7px; overflow: hidden; border-radius: 99px; background: var(--studio-line, rgba(148,163,184,.2)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-track > i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--accent-500), var(--accent-400)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-selected-rank { width: 42px; height: 42px; flex: 0 0 42px; font-size: 17px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-split { grid-template-columns: minmax(0, 1fr); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp { grid-template-columns: 32px minmax(0, 1fr); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card-head { align-items: flex-start; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card-head > div { min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-search-more > summary { cursor: pointer; color: var(--accent-500); font-size: 12px; font-weight: 700; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-search-more[open] > summary { margin-bottom: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 0 18px;
  border-bottom: 1px solid var(--studio-line, var(--ivory-300));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head h1 {
  display: block;
  min-width: 0;
  margin: 0 !important;
  letter-spacing: -.035em;
  color: var(--foreground);
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-pill {
  white-space: nowrap;
  background: var(--studio-panel, var(--ivory-50));
  border-radius: 8px;
}

/* KPI strip — equal rhythm, quieter surfaces, clear number hierarchy */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi {
  min-width: 0;
  min-height: 104px;
  padding: 17px 18px 17px 20px;
  gap: 14px;
  border-radius: 12px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  background: var(--studio-panel-raised, var(--ivory-50));
  box-shadow: none;
  transition: border-color .18s ease, transform .18s ease;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--c) 55%, var(--studio-line, var(--ivory-300)));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi::before { width: 3px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--c) 13%, transparent);
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi strong {
  font-size: 27px;
  line-height: 1.1;
  letter-spacing: -.035em;
  font-variant-numeric: tabular-nums;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi strong.is-text { font-size: 16px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi small {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.35;
  font-weight: 600;
}

/* Analytics — three balanced panels with consistent height and padding */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card {
  min-height: 194px;
  display: flex;
  flex-direction: column;
  padding: 17px 18px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card {
  min-width: 0;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 12px;
  padding: 18px;
  background: var(--studio-panel-raised, var(--ivory-50));
  box-shadow: none;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card h2 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 15px;
  padding: 0 0 12px;
  border-bottom: 1px solid var(--studio-line, var(--ivory-300));
  font-size: 14px;
  line-height: 1.35;
  font-weight: 700;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card h2 svg { color: var(--accent-500); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 1;
  flex-wrap: nowrap;
  gap: 14px;
  min-width: 0;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row > svg {
  width: 112px;
  height: 112px;
  flex: 0 0 112px !important;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row > div {
  min-width: 0;
  flex: 1 1 0 !important;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row ul { gap: 11px !important; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row li {
  grid-template-columns: 9px minmax(0, 1fr) auto !important;
  gap: 7px !important;
  font-size: 11px !important;
  line-height: 1.35;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row li > span:first-child {
  width: 8px !important;
  height: 8px !important;
  border-radius: 3px !important;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row li strong {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* Horizontal analytics bars — slim, flat, precise; remove neon glow */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row > div > div,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card > div[style*="display: grid"] > div {
  min-width: 0;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card [style*="height: 10px"] {
  height: 7px !important;
  border-radius: 99px !important;
  background: var(--studio-line, rgba(148,163,184,.2)) !important;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card [style*="height: 100%"][style*="linear-gradient"] {
  background: var(--bar-color, #38bdf8) !important;
  box-shadow: none !important;
  border-radius: 99px !important;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card [style*="grid-template-columns: minmax(0,1fr) auto"] strong {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* Main workspace — fixed, calm navigation rail and flexible content area */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-split {
  display: grid;
  grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
  align-items: start;
  gap: 16px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card { padding: 16px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 13px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card-head h2 { margin: 0; padding: 0; border: 0; }

/* Competitor list — compact rows, predictable text wrapping and selection */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-list { display: grid; gap: 8px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 68px !important;
  padding: 10px 11px !important;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-left: 3px solid var(--c);
  border-radius: 9px !important;
  background: var(--studio-panel, var(--ivory-50));
  text-align: left;
  transition: border-color .18s ease, background .18s ease;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp:hover,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp.is-selected {
  border-color: color-mix(in srgb, var(--c) 65%, var(--studio-line, var(--ivory-300)));
  background: color-mix(in srgb, var(--c) 8%, var(--studio-panel, var(--ivory-50)));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp strong {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp small {
  display: block;
  margin-top: 4px;
  font-size: 10px;
  line-height: 1.35;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp > svg { width: 40px; height: 40px; }

/* Discovery queries and activity list */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-queries,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-results { display: grid; gap: 8px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-query {
  min-height: 54px !important;
  grid-template-columns: 32px minmax(0, 1fr) 16px;
  gap: 9px;
  padding: 9px 10px !important;
  border-radius: 9px !important;
  background: var(--studio-panel, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-query-icon { width: 32px; height: 32px; border-radius: 8px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-query span.t { font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-note { font-size: 12px; line-height: 1.6; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity button {
  min-height: 55px !important;
  grid-template-columns: 8px minmax(0, 1fr) auto;
  gap: 9px;
  padding: 10px 0 !important;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity strong { font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity small,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity time { font-size: 10px; }

/* Selected competitor panel */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main {
  display: flex;
  flex-direction: column;
  gap: 17px;
  min-width: 0;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-head {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 19px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 12px;
  background: var(--studio-panel-raised, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-title { flex: 1 1 300px; min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-title h2 {
  margin: 0 !important;
  font-size: 19px !important;
  line-height: 1.35;
  letter-spacing: -.025em;
  overflow-wrap: anywhere;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-title p { margin-top: 6px; line-height: 1.55; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-actions { display: flex; flex-wrap: wrap; gap: 7px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-badge { margin-bottom: 7px; border-radius: 6px; padding: 4px 9px; }

/* Tabs — clean segmented navigation, no excessive colour blocks */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tabs {
  display: flex;
  align-items: center;
  gap: 5px;
  overflow-x: auto;
  border-bottom: 1px solid var(--studio-line, var(--ivory-300));
  padding: 0 0 10px;
  scrollbar-width: thin;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tab {
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  white-space: nowrap;
  font-size: 12px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tab.is-active {
  border-color: color-mix(in srgb, var(--c) 45%, var(--studio-line, var(--ivory-300)));
  background: color-mix(in srgb, var(--c) 10%, transparent);
}

/* Profile cards and business detail rows */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-grid2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-sub {
  min-width: 0;
  padding: 17px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 10px;
  background: var(--studio-panel, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-sub h3 {
  margin: 0 0 13px;
  font-size: 13px;
  font-weight: 700;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-bottom: 16px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chip { padding: 5px 9px; border-radius: 6px; font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl {
  display: grid;
  grid-template-columns: minmax(105px, .8fr) minmax(0, 1.2fr);
  gap: 11px 15px;
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl dt { color: var(--navy-600); font-weight: 600; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-brand { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font-size: 11px; }

/* Forms and evidence: consistent grid and comfortable reading width */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-profile-form,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-evidence-layout > form {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 12px;
  background: var(--studio-panel-raised, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px 15px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-form-grid > label { min-width: 0; align-content: start; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-social-fields { margin-top: 20px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-evidence-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(250px, .8fr);
  gap: 15px;
  align-items: start;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-snapshot-history article {
  display: grid;
  gap: 7px;
  margin-top: 9px;
  padding: 13px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 9px;
  background: var(--studio-panel, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-snapshot-history article strong { font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-snapshot-history article span,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-snapshot-history article small { font-size: 11px; line-height: 1.5; color: var(--navy-600); }

/* Analysis: editorial grid, distinct sections, readable insight blocks */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 15px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-summary {
  min-width: 0;
  padding: 19px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-left: 3px solid #8b7cf6 !important;
  border-radius: 10px;
  background: var(--studio-panel, var(--ivory-50));
  line-height: 1.7;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-summary p { margin: 9px 0 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-grid,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-idea-grid,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-observed-post-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-grid > article,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-idea-grid > article,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-observed-post-grid > article {
  min-width: 0;
  padding: 17px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 10px;
  background: var(--studio-panel-raised, var(--ivory-50));
  line-height: 1.65;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-grid > article h3,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-idea-grid > article h4,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-observed-post-grid > article h4 {
  margin: 0 0 12px;
  font-size: 14px;
  line-height: 1.4;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-grid > article p,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-idea-grid > article p,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-observed-post-grid > article p {
  margin: 8px 0;
  font-size: 12px;
  line-height: 1.65;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-insight-section { margin-top: 13px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-insight-section h3 {
  margin: 0 0 7px;
  color: var(--navy-600);
  font-size: 11px;
  letter-spacing: .015em;
  text-transform: uppercase;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-insight-section ul { margin: 0; padding-left: 17px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-insight-section li { margin: 5px 0; font-size: 12px; line-height: 1.6; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-insight-section p { margin: 0; color: var(--navy-600); font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-opportunities > article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  margin: 10px 0;
  padding: 16px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 10px;
  background: var(--studio-panel-raised, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-opportunities > article h4 { margin: 9px 0 5px; font-size: 13px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-opportunities > article p { margin: 5px 0; font-size: 12px; line-height: 1.6; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-opportunities > article small { font-size: 11px; color: var(--navy-600); line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-action-plan,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-content-ideas { margin-top: 18px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-idea-grid > article,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-observed-post-grid > article { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-idea-grid > article .button { margin-top: auto; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-data-limit {
  margin-top: 16px;
  padding: 15px 17px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 10px;
  background: var(--studio-panel, var(--ivory-50));
  font-size: 12px;
  line-height: 1.6;
}

/* Comparison table and post filters */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-filters {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 11px;
  margin-bottom: 15px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-filters label { min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-comparison-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 10px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-comparison-table { min-width: 850px; border-collapse: collapse; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-comparison-table th,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-comparison-table td {
  padding: 11px 13px;
  border-bottom: 1px solid var(--studio-line, var(--ivory-300));
  text-align: left;
  font-size: 11px;
  line-height: 1.5;
  vertical-align: top;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-comparison-table thead th {
  position: sticky;
  top: 0;
  background: var(--studio-panel, var(--ivory-50));
  color: var(--navy-600);
  font-weight: 700;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-metric-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-metric-grid > div {
  min-width: 78px;
  padding: 8px 10px;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 8px;
  background: var(--studio-panel, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-metric-grid span { display: block; color: var(--navy-600); font-size: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-metric-grid strong { display: block; margin-top: 3px; font-size: 13px; font-variant-numeric: tabular-nums; }

/* Responsive behavior */
@media (max-width: 1180px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-split { grid-template-columns: minmax(230px, .75fr) minmax(0, 1.5fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-filters { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-split,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-evidence-layout { grid-template-columns: minmax(0, 1fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
}
@media (max-width: 680px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head { align-items: flex-start; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head-actions { justify-content: flex-start; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpis,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-grid2,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-grid,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-idea-grid,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-observed-post-grid,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-form-grid { grid-template-columns: minmax(0, 1fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side { grid-template-columns: minmax(0, 1fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row { flex-wrap: wrap; justify-content: flex-start; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl { grid-template-columns: minmax(0, 1fr); gap: 3px; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl dd { margin-bottom: 8px; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-opportunities > article { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 420px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-filters { grid-template-columns: minmax(0, 1fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-head { padding: 14px; }
}

/* ================================================================
   COMPETITOR INTELLIGENCE — LAYOUT REFINEMENT V2
   Layout-only refinement: preserves theme, typography, buttons,
   component behavior, data, state and API integrations.
================================================================ */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page {
  gap: 20px !important;
}

/* Give the top area a clearer, more deliberate rhythm. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head {
  padding: 4px 0 17px;
  margin-bottom: 1px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpis {
  gap: 12px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpi {
  min-height: 96px;
  padding: 15px 16px 15px 19px;
  border-radius: 11px;
  background: color-mix(in srgb, var(--studio-panel-raised, #111c30) 92%, var(--c) 8%);
}

/* Analytics: consistent card heights and more balanced chart placement. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card {
  width: 100%;
  min-width: 0;
  min-height: 190px;
  padding: 16px;
  border-radius: 11px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card:first-child > div {
  display: grid !important;
  flex: 1;
  align-content: start;
  gap: 12px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card h2 {
  margin-bottom: 13px;
  padding-bottom: 10px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row {
  align-items: flex-start;
  gap: 11px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row > svg {
  width: 104px;
  height: 104px;
  flex-basis: 104px !important;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row li {
  font-size: 11px !important;
}

/* Main workspace becomes a clean full-width sequence instead of
   squeezing the profile into a narrow right-hand column. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

/* Competitor selector spans the full row; discovery and activity
   sit neatly beneath it in two equal containers. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  align-items: stretch;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card {
  min-width: 0;
  padding: 15px;
  border-radius: 11px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:first-child {
  grid-column: 1 / -1;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:first-child .ci-list {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp {
  min-height: 70px !important;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 9px;
  padding: 9px 10px !important;
  border-radius: 9px !important;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp > svg {
  width: 36px;
  height: 36px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp strong {
  font-size: 11px;
  line-height: 1.4;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comp small {
  font-size: 10px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:nth-child(2),
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:nth-child(3) {
  height: 100%;
}

/* Discovery actions: equal-height compact rows. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-query {
  min-height: 48px !important;
  padding: 8px 10px !important;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-activity button {
  min-height: 48px !important;
  padding: 8px 0 !important;
}

/* The selected competitor gets the full canvas. Header, tabs and
   profile/action panels align to one shared content width. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main {
  min-width: 0;
  gap: 13px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card {
  padding: 17px;
  border-radius: 11px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-head {
  display: grid;
  grid-template-columns: 60px minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
  padding: 17px;
  border-radius: 10px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-title {
  min-width: 0;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-title h2 {
  font-size: 18px !important;
  line-height: 1.35;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-actions {
  justify-content: flex-end;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tabs {
  gap: 7px;
  padding: 0 0 11px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tab {
  padding: 8px 13px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-grid2 {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, .8fr);
  gap: 12px;
  align-items: stretch;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-sub {
  padding: 17px;
  border-radius: 10px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl {
  grid-template-columns: minmax(115px, .75fr) minmax(0, 1.25fr);
  gap: 10px 13px;
}

/* Make analysis and comparison content follow a consistent card grid. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-grid,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-idea-grid,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-observed-post-grid {
  gap: 12px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-grid > article,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-idea-grid > article,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-observed-post-grid > article {
  border-radius: 10px;
  padding: 16px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-opportunities > article {
  border-radius: 10px;
  padding: 15px 16px;
}

/* Tablet and mobile: gracefully return to stacked containers. */
@media (max-width: 900px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:first-child {
    grid-column: 1 / -1;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-head {
    grid-template-columns: 54px minmax(0, 1fr);
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
  }
}
@media (max-width: 640px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:first-child .ci-list,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-grid2 {
    grid-template-columns: minmax(0, 1fr);
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:first-child {
    grid-column: auto;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts {
    grid-template-columns: minmax(0, 1fr);
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-chart-row {
    flex-wrap: nowrap;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main-head {
    grid-template-columns: 48px minmax(0, 1fr);
    padding: 13px;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl {
    grid-template-columns: minmax(0, 1fr);
    gap: 3px;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-dl dd {
    margin-bottom: 7px;
  }
}

/* ================================================================
   V3 ALIGNMENT FIX — selected competitor profile workspace
   Both inner containers now use one shared full-width column.
   Actions become a compact horizontal action strip, eliminating
   the oversized empty panel and uneven column proportions.
================================================================ */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  align-self: stretch;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-main-head,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-tabs,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}
/* Overview profile and actions align to the same full-width edges. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  align-self: stretch;
}
/* Profile details use a balanced label/value grid across the wider card. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:first-child .ci-dl {
  grid-template-columns: minmax(150px, .32fr) minmax(0, .68fr);
  column-gap: 20px;
  row-gap: 11px;
}
/* Actions are displayed as three equal-width controls, not a tall stack. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:nth-child(2) .ci-stack {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 12px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:nth-child(2) .ci-stack > * {
  width: 100%;
  min-width: 0;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:nth-child(2) .ci-note {
  margin-top: 12px;
}
/* Keep all content areas flush with the same container edges. */
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main {
  width: 100%;
  min-width: 0;
  align-items: stretch;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > * {
  min-width: 0;
  max-width: 100%;
}
@media (max-width: 760px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:nth-child(2) .ci-stack {
    grid-template-columns: minmax(0, 1fr);
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:first-child .ci-dl {
    grid-template-columns: minmax(0, 1fr);
    gap: 3px;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:first-child .ci-dl dd {
    margin-bottom: 7px;
  }
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-analysis-view :is(p, li, dd, small, strong, summary) {
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: normal;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-social-performance,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-full-analysis {
  display: grid;
  gap: 12px;
  min-width: 0;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-social-performance {
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 12px;
  padding: 16px;
  background: var(--studio-panel-raised, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-social-performance .campaign-section-heading {
  margin: 0;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-social-performance .campaign-section-heading h3,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-full-analysis h3 {
  margin: 0;
  color: var(--foreground);
  font-size: 15px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-social-performance .campaign-section-heading p,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-insight-context,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-performance-note,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-performance-empty {
  margin: 5px 0 0;
  color: var(--navy-600);
  font-size: 12px;
  line-height: 1.6;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-performance-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: 10px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-performance-grid > article,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-pillar-list > div {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 9px;
  padding: 12px;
  background: var(--studio-panel, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-performance-grid > article > span {
  color: var(--navy-600);
  font-size: 11px;
  font-weight: 650;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-performance-grid > article > strong {
  color: var(--foreground);
  font-size: 16px;
  line-height: 1.4;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-performance-grid > article > p,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-pillar-list > div > p {
  margin: 0;
  color: var(--navy-600);
  font-size: 12px;
  line-height: 1.55;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-performance-grid > .competitor-performance-note {
  grid-column: 1 / -1;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-pillar-list {
  display: grid;
  gap: 8px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-pillar-list > div > strong {
  color: var(--foreground);
  font-size: 13px;
  line-height: 1.45;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-full-analysis {
  border: 1px solid var(--studio-line, var(--ivory-300));
  border-radius: 11px;
  padding: 14px;
  background: var(--studio-panel-raised, var(--ivory-50));
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-full-analysis > summary {
  color: var(--accent-600);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-full-analysis[open] > summary {
  margin-bottom: 4px;
}

@container competitor-intelligence (max-width: 960px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kpis {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-split {
    grid-template-columns: minmax(0, 1fr);
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:first-child {
    grid-column: 1 / -1;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card {
    height: 100%;
  }
}

@container competitor-intelligence (max-width: 640px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side {
    grid-template-columns: minmax(0, 1fr);
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:first-child {
    grid-column: auto;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head {
    align-items: flex-start;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head-actions {
    justify-content: flex-start;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:nth-child(2) .ci-stack,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:first-child .ci-dl {
    grid-template-columns: minmax(0, 1fr);
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-main > .ci-card.ci-main > .ci-grid2 > .ci-sub:first-child .ci-dl {
    gap: 3px;
  }
}

@media (max-width: 760px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page {
    padding: 26px 16px 48px !important;
  }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-head {
    min-height: 0;
    padding-bottom: 14px;
  }
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-split { grid-template-columns: minmax(0, 1fr) !important; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tabs {
  position: sticky;
  top: 76px;
  z-index: 9;
  margin: 0 -4px;
  padding: 7px 4px 10px;
  background: var(--studio-panel-raised, var(--ivory-50));
  box-shadow: 0 8px 12px -12px var(--foreground);
  scroll-margin-top: 88px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-evidence-layout {
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, .9fr);
  align-items: start;
  gap: 16px;
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-snapshot-history { min-width: 0; align-content: start; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-snapshot-history > article { overflow-wrap: anywhere; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card { display: flex; flex-direction: column; min-height: 244px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card:nth-child(1) { border-top: 3px solid ${CHART.cyan}; background: linear-gradient(155deg, color-mix(in srgb, ${CHART.cyan} 8%, var(--studio-panel-raised, var(--ivory-50))) 0%, var(--studio-panel-raised, var(--ivory-50)) 46%); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card:nth-child(2) { border-top: 3px solid ${CHART.pink}; background: linear-gradient(155deg, color-mix(in srgb, ${CHART.pink} 8%, var(--studio-panel-raised, var(--ivory-50))) 0%, var(--studio-panel-raised, var(--ivory-50)) 46%); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card:nth-child(3) { border-top: 3px solid ${CHART.amber}; background: linear-gradient(155deg, color-mix(in srgb, ${CHART.amber} 8%, var(--studio-panel-raised, var(--ivory-50))) 0%, var(--studio-panel-raised, var(--ivory-50)) 46%); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card > h2 { font-size: 15px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card:nth-child(1) > h2 svg { color: ${CHART.cyan}; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card:nth-child(2) > h2 svg { color: ${CHART.pink}; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card:nth-child(3) > h2 svg { color: ${CHART.amber}; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side { display: flex !important; flex-direction: column; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-list { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-side > .ci-card:first-child { grid-column: auto !important; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card-head > div > h2 { margin: 0 0 7px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-card-head .ci-insight-caption { margin: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-search-more { padding: 14px 16px; }
@container competitor-intelligence (max-width: 760px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-list { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
}
@container competitor-intelligence (max-width: 960px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card:last-child { grid-column: 1 / -1; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-evidence-layout { grid-template-columns: minmax(0, 1.3fr) minmax(260px, .9fr); }
}
@container competitor-intelligence (max-width: 520px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-list,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts { grid-template-columns: minmax(0, 1fr) !important; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-charts > .ci-card:last-child { grid-column: auto; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-profile-list > button,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-top-post-list > article { grid-template-columns: 28px minmax(0, 1fr) auto; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .competitor-evidence-layout { grid-template-columns: minmax(0, 1fr); }
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leaders { display: grid; gap: 16px; min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leaders-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 0 0 15px; border-bottom: 1px solid var(--studio-line, var(--ivory-300)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leaders-heading h2 { margin: 2px 0 5px; font-size: clamp(23px, 2vw, 30px); letter-spacing: -.035em; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leaders-heading p:not(.ci-kicker) { margin: 0; color: var(--navy-600); font-size: 13px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-kicker { margin: 0; color: var(--accent-500); font-size: 10px; font-weight: 800; letter-spacing: .13em; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-setup-note { margin: 0; padding: 10px 13px; border-left: 3px solid var(--accent-500); border-radius: 7px; background: var(--studio-panel, var(--ivory-50)); color: var(--navy-600); font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-card { display: grid; grid-template-columns: minmax(250px, .72fr) minmax(0, 1.6fr); gap: 0; min-width: 0; overflow: hidden; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 16px; background: var(--studio-panel-raised, var(--ivory-50)); box-shadow: 0 8px 24px rgb(2 8 23 / 14%); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-card { grid-template-columns: minmax(280px, .78fr) minmax(0, 1.5fr); border-radius: 20px; box-shadow: 0 18px 44px rgb(2 8 23 / 22%); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-panel,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-content-panel { min-width: 0; padding: clamp(18px, 2.2vw, 28px); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-panel { border-right: 1px solid var(--studio-line, var(--ivory-300)); background: color-mix(in srgb, var(--accent-500) 6%, var(--studio-panel-raised, var(--ivory-50))); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-panel { display: flex; flex-direction: column; align-items: stretch; padding: clamp(20px, 2.1vw, 28px); background: linear-gradient(155deg, color-mix(in srgb, var(--accent-500) 12%, var(--studio-panel-raised, var(--ivory-50))), var(--studio-panel-raised, var(--ivory-50)) 60%); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-heading { display: grid; grid-template-columns: 54px minmax(0, 1fr); align-items: center; gap: 13px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo { position: relative; display: grid; width: 54px; height: 54px; place-items: center; overflow: hidden; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 13px; background: var(--studio-panel, var(--ivory-50)); color: var(--accent-500); font-size: 21px; font-weight: 800; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; background: var(--studio-panel, var(--ivory-50)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo.ci-logo-text-mark { border-color: #d4af37; border-radius: 50%; background: #3e2723; color: #d4af37; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-site-logo-mark { display: none; width: 100%; height: 100%; place-items: center; font-family: Georgia, serif; font-size: 22px; font-weight: 700; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo.ci-logo-missing.ci-logo-has-text .ci-site-logo-mark,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo.ci-logo-text-mark .ci-site-logo-mark { display: grid; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo.ci-logo-missing.ci-logo-has-text .ci-logo-fallback { display: none; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo.ci-logo-text-mark .ci-logo-fallback { display: none; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-logo-fallback { display: none; padding: 5px; color: var(--navy-600); font-size: 9px; font-weight: 600; line-height: 1.2; text-align: center; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo.ci-logo-missing .ci-logo-fallback,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo:not(:has(img)) .ci-logo-fallback { display: block; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-rank-label { color: var(--accent-500); font-size: 9px; font-weight: 800; letter-spacing: .1em; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-heading h3 { margin: 3px 0 0; font-size: 18px; line-height: 1.3; overflow-wrap: anywhere; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-logo { width: 64px; height: 64px; border-radius: 17px; box-shadow: 0 5px 18px rgb(0 0 0 / 15%); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-summary { margin-top: 20px; color: var(--foreground); font-size: 13px; font-weight: 650; line-height: 1.55; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-facts { display: grid; gap: 11px; margin: 20px 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-facts { gap: 0; margin: 14px 0 18px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-facts > div { grid-template-columns: 68px minmax(0, 1fr); padding: 10px 0; border-top: 1px solid color-mix(in srgb, var(--studio-line, var(--ivory-300)) 75%, transparent); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-facts > div { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 10px; min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-facts dt { color: var(--navy-600); font-size: 11px; font-weight: 650; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-facts dd { min-width: 0; margin: 0; color: var(--foreground); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-facts a,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-post a { color: var(--accent-500); font-weight: 700; overflow-wrap: anywhere; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-social-block { padding-top: 13px; border-top: 1px solid var(--studio-line, var(--ivory-300)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-social-block { margin-top: auto; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-social-block > strong { font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-social-block > p { margin: 7px 0 0; color: var(--navy-600); font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-refresh-research { margin-top: 10px; min-height: 30px; padding: 5px 9px; font-size: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-social-links { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-social-links a { padding: 5px 8px; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 7px; color: var(--accent-500); font-size: 10px; font-weight: 700; text-decoration: none; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-actions { padding-top: 14px; border-top: 1px solid var(--studio-line, var(--ivory-300)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-actions .button { flex: 1 1 auto; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-actions .button { min-height: 34px; padding: 7px 10px; font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-company-actions { display: grid; grid-column: 1 / -1; grid-row: 2; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: stretch; gap: 8px; margin: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-company-actions > button.button { box-sizing: border-box; width: 100%; min-width: 0; height: 48px; min-height: 48px; max-height: 48px; justify-content: center; margin: 0; padding: 0 6px; white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-content-heading { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 13px; padding-bottom: 11px; border-bottom: 1px solid var(--studio-line, var(--ivory-300)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-content-panel { padding: clamp(20px, 2.1vw, 28px); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-content-heading h3 { margin: 3px 0 0; font-size: 17px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-content-heading > span { color: var(--navy-600); font-size: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-posts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-posts { grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 12px; align-items: stretch; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-post { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; padding: 13px; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 10px; background: var(--studio-panel, var(--ivory-50)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-post { min-height: 210px; padding: 16px; border-radius: 14px; background: color-mix(in srgb, var(--studio-panel, var(--ivory-50)) 88%, var(--accent-500)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-topline { display: flex; flex-wrap: wrap; gap: 7px; color: var(--navy-600); font-size: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-rank { color: var(--accent-500); font-weight: 800; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-post h4 { margin: 8px 0 2px; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-hook { margin: 7px 0; color: var(--navy-600); font-size: 11px; line-height: 1.45; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-metrics { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-metrics > span { padding: 5px 7px; border-radius: 6px; background: color-mix(in srgb, var(--accent-500) 9%, transparent); color: var(--navy-600); font-size: 9px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-metrics strong { color: var(--foreground); font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-ranking-note { margin: 0 0 9px; color: var(--navy-600); font-size: 10px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-strategy { margin: 7px 0 10px; color: var(--foreground); font-size: 11px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-strategy p { margin: 3px 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-strategy small,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-strategy-summary small { display: block; margin-top: 5px; color: var(--navy-600); font-size: 9px; line-height: 1.45; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-post > a { margin-top: auto; font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leaders-heading { padding: 4px 0 18px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leaders-heading h2 { font-size: clamp(27px, 3vw, 36px); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-automation-note { padding: 12px 15px; border-radius: 12px; background: var(--studio-panel, var(--ivory-50)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-empty-actions { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 15px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-post-ranking-note { padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--accent-500) 6%, var(--studio-panel, var(--ivory-50))); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-strategy-summary { border-radius: 14px; }
@media (max-width: 920px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-card { grid-template-columns: minmax(0, 1fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-panel { border-right: 0; border-bottom: 1px solid var(--studio-line, var(--ivory-300)); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-social-block { margin-top: 0; }
}
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-no-posts { padding: 16px; border: 1px dashed var(--studio-line, var(--ivory-300)); border-radius: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-no-posts p { margin: 5px 0 0; color: var(--navy-600); font-size: 11px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-no-posts { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; gap: 12px; background: color-mix(in srgb, var(--accent-500) 4%, var(--studio-panel, var(--ivory-50))); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-no-posts::before { content: "!"; display: grid; width: 28px; height: 28px; place-items: center; border-radius: 9px; background: color-mix(in srgb, var(--accent-500) 14%, transparent); color: var(--accent-500); font-weight: 800; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-no-posts p { grid-column: 2; margin: -7px 0 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-no-posts { display: block; grid-template-columns: minmax(0, 1fr); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-no-posts::before { display: none; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-no-posts p { margin: 5px 0 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-strategy-summary { margin-top: 14px; padding: 14px 16px; border: 1px solid var(--studio-line, var(--ivory-300)); border-left: 3px solid var(--accent-500); border-radius: 10px; background: color-mix(in srgb, var(--accent-500) 5%, var(--studio-panel, var(--ivory-50))); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-strategy-summary h4 { margin: 0 0 6px; font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-strategy-summary ul { display: grid; gap: 4px; margin: 0; padding-left: 17px; color: var(--navy-600); font-size: 11px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-strategy-summary small { margin-top: 8px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-record-details { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--studio-line, var(--ivory-300)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-record-details > summary { cursor: pointer; color: var(--accent-500); font-size: 11px; font-weight: 700; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-record-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-top: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-record-form > label { display: grid; gap: 4px; min-width: 0; font-size: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-record-form > .button { align-self: end; }
@container competitor-intelligence (max-width: 780px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-card { grid-template-columns: minmax(0, 1fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-company-panel { border-right: 0; border-bottom: 1px solid var(--studio-line, var(--ivory-300)); }
}
@container competitor-intelligence (max-width: 520px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leaders-heading { align-items: flex-start; flex-direction: column; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-leader-posts,
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-record-form { grid-template-columns: minmax(0, 1fr); }
}

html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-market-dashboard { display: grid; gap: 14px; margin: 22px 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-card { min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-card > .ci-card-head { align-items: flex-start; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-platform-filter { display: grid; flex: 0 0 190px; gap: 5px; color: var(--navy-600); font-size: 10px; font-weight: 650; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-platform-filter .compact-select-trigger { min-height: 42px; border-color: var(--studio-line); border-radius: 9px; padding-inline: 10px; background: var(--studio-panel-raised); color: var(--studio-text, var(--foreground)); font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-platform-filter .compact-select-menu { z-index: 100; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-table-wrap { overflow-x: auto; margin-top: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-table { width: 100%; min-width: 690px; border-collapse: separate; border-spacing: 0; text-align: left; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-table th,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-table td { border-bottom: 1px solid var(--studio-line, var(--ivory-300)); padding: 11px 10px; color: var(--studio-text, var(--foreground)); font-size: 11px; vertical-align: middle; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-table thead th { color: var(--studio-muted, var(--navy-600)); font-size: 9px; font-weight: 700; white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-table tbody th { min-width: 120px; font-weight: 600; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-table tbody th small { display: block; margin-top: 3px; color: var(--studio-muted, var(--navy-600)); font-size: 9px; font-weight: 400; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-table-action { border: 0; padding: 4px 0; background: transparent; color: var(--accent-500); cursor: pointer; font: inherit; font-size: 10px; font-weight: 700; white-space: nowrap; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-research-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(250px, .9fr); gap: 14px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-keyword-card,
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-format-card { display: grid; align-self: start; align-content: start; gap: 10px; min-width: 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section { display: grid; gap: 14px; margin: 22px 0; scroll-margin-top: 20px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-snapshot-list { grid-template-columns: minmax(0, 1fr); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-company-facts { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 14px 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-company-facts > div { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: 5px; min-width: 0; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 9px; padding: 10px; background: color-mix(in srgb, var(--accent-500) 5%, var(--studio-panel, var(--ivory-50))); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-company-facts > .ci-company-fact-wide { grid-column: 1 / -1; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-company-facts dt { color: var(--accent-500); font-size: 9px; font-weight: 750; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-company-facts dd { font-size: 11px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-social-block { margin-top: 4px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-no-posts { border: 1px dashed var(--studio-line, var(--ivory-300)); background: color-mix(in srgb, var(--accent-500) 5%, var(--studio-panel)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-no-posts > strong { color: var(--foreground); font-size: 12px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-no-posts > p { margin: 5px 0 8px; color: var(--navy-600); font-size: 10px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-no-posts > details { margin: 8px 0; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-no-posts > details > summary { color: var(--accent-500); cursor: pointer; font-size: 10px; font-weight: 700; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-no-posts > details ul { max-height: 160px; overflow-y: auto; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-channel-analytics { display: grid; gap: 9px; margin: 0 0 14px; border: 1px solid var(--studio-line, var(--ivory-300)); border-radius: 11px; padding: 12px; background: color-mix(in srgb, var(--accent-500) 4%, var(--studio-panel-raised, var(--ivory-50))); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-channel-analytics > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-channel-analytics > header strong { color: var(--foreground); font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-channel-analytics > header span { color: var(--navy-600); font-size: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-channel-analytics > div { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 8px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-channel-analytics article { display: grid; gap: 5px; min-width: 0; border-radius: 8px; padding: 9px; background: var(--studio-panel, var(--ivory-50)); color: var(--navy-600); font-size: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-channel-analytics article > strong { color: var(--accent-500); font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-channel-analytics article b { color: var(--foreground); font-weight: 650; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-analytics-empty { margin: 0 0 14px; border-radius: 10px; padding: 10px 12px; background: color-mix(in srgb, var(--accent-500) 5%, var(--studio-panel)); color: var(--navy-600); font-size: 10px; line-height: 1.5; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-keyword-chips { display: flex; flex-wrap: wrap; gap: 7px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-keyword-query { display: inline-flex; align-items: center; gap: 6px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-search-error { margin: 0; color: var(--danger, #df6b75); font-size: 11px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-search-query { margin: 0; overflow-wrap: anywhere; color: var(--studio-muted, var(--navy-600)); font-size: 10px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-chart > div { gap: 7px; }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-track { height: 7px; border-radius: 99px; background: color-mix(in srgb, var(--accent-500) 10%, var(--studio-panel-raised)); }
html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-tactic-track > i { border-radius: inherit; background: linear-gradient(90deg, var(--accent-500), var(--accent-700)); }
@media (max-width: 900px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-research-grid { grid-template-columns: minmax(0, 1fr); }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-company-actions { grid-row: auto; }
}
@media (max-width: 620px) {
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-comparison-card > .ci-card-head { align-items: stretch; flex-direction: column; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-platform-filter { flex-basis: auto; }
  html[data-theme-preset] body .app-shell .dashboard-content.ci-page .ci-profile-section .ci-company-facts { grid-template-columns: minmax(0, 1fr); }
}

`}</style>

      <div className="ci-head">
        <div><h1>Competitor intelligence</h1><p>Profile the market, find standout posts, and export the strategy.</p></div>
        <div className="ci-head-actions">
          {data?.dataCollection.websiteSearchAvailable && <button className="button button-outline" type="button" onClick={() => void discoverAndAnalyze()} disabled={busy === "discovery"}>{busy === "discovery" ? "Finding and analyzing…" : "Find top 3 & analyze"}</button>}
          <button className="button button-gold" type="button" onClick={() => startNewProfile()}><Plus size={15} aria-hidden="true" /> Add competitor</button>
        </div>
      </div>

      {data && <div className="ci-access-strip" aria-label="Post research access">
        <span className={data.dataCollection.instagramCompetitorInsightsAvailable ? "is-ready" : ""}>Instagram {data.dataCollection.instagramCompetitorInsightsAvailable ? "API ready" : "Meta access needed"}</span>
        <span className={data.dataCollection.youtubeApiAvailable ? "is-ready" : ""}>YouTube {data.dataCollection.youtubeApiAvailable ? "API ready" : "API key needed"}</span>
        <span className={data.dataCollection.xApiAvailable ? "is-ready" : ""}>X {data.dataCollection.xApiAvailable ? "API ready" : "API token needed"}</span>
        <Link href="/dashboard/system-status">Setup details <ArrowRight size={13} aria-hidden="true" /></Link>
      </div>}
      {error && <div className="notice notice-error ci-error-alert" role="alert"><div className="ci-error-summary"><p>{error.length > 260 ? `${error.slice(0, 260).trimEnd()}…` : error}</p>{error.length > 260 && <details><summary>Show full error details</summary><pre>{error}</pre></details>}</div><button className="button button-outline" type="button" onClick={() => void (retryDiscovery ? discoverAndAnalyze() : load())}>{retryDiscovery ? "Retry discovery" : "Try again"}</button></div>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {loading && <p className="loading-label">Loading competitor research…</p>}

      {showProfileForm && (profileFormPlacement === "page" || Boolean(data?.competitors.length)) && renderProfileForm()}

      {data && <section className="ci-market-dashboard" aria-label="Competitor comparison and keyword research">
        <section className="ci-card ci-comparison-card" aria-labelledby="ci-comparison-title">
          <header className="ci-card-head">
            <div><p className="ci-kicker">Market comparison</p><h2 id="ci-comparison-title">Recorded competitor metrics</h2><p className="ci-insight-caption">Compare the latest saved snapshot. Missing values stay marked as not captured.</p></div>
            <label className="ci-platform-filter">Platform
              <CompactSelect value={comparisonPlatform} onChange={(event) => setComparisonPlatform(event.target.value)} aria-label="Filter competitor metrics by platform">
                <option value="all">All captured platforms</option>
                {[...new Set(data.competitors.flatMap((competitor) => competitor.snapshots[0]?.observations.platformMetrics.map((item) => item.platform) ?? []))].sort().map((platform) => <option value={platform} key={platform}>{platform}</option>)}
              </CompactSelect>
            </label>
          </header>
          {comparisonRows.length ? <div className="ci-comparison-table-wrap">
            <table className="ci-comparison-table">
              <thead><tr><th scope="col">Business</th><th scope="col">Followers</th><th scope="col">Posts observed</th><th scope="col">Recorded interactions</th><th scope="col">Snapshot</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{comparisonRows.map((row) => {
                const interactionsByPlatform = new Map<string, { count: number; total: number }>();
                for (const post of row.posts) {
                  const interactions = postInteractions(post);
                  if (interactions === null) continue;
                  const current = interactionsByPlatform.get(post.platform) ?? { count: 0, total: 0 };
                  current.count += 1;
                  current.total += interactions;
                  interactionsByPlatform.set(post.platform, current);
                }
                const interactionSummary = [...interactionsByPlatform].map(([platform, value]) => comparisonPlatform === "all"
                  ? `${platform}: ${value.total.toLocaleString()}`
                  : value.total.toLocaleString()).join(" · ") || "Not captured";
                const followerSummary = row.hasFollowers
                  ? comparisonPlatform === "all" ? row.byPlatform("followers") : metricNumber(row.followerTotal)
                  : "Not captured";
                return <tr key={row.competitor.id}>
                  <th scope="row"><strong>{row.competitor.name}</strong><small>{categoryMeta[row.competitor.category]?.label ?? "Competitor"}</small></th>
                  <td>{followerSummary}</td><td>{row.snapshot ? row.posts.length : "Not captured"}</td><td>{interactionSummary}</td>
                  <td>{row.snapshot ? new Date(row.snapshot.observedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Not captured"}</td>
                  <td><button className="ci-table-action" type="button" aria-expanded={selectedId === row.competitor.id} onClick={() => setSelectedId((current) => current === row.competitor.id ? "" : row.competitor.id)}>{selectedId === row.competitor.id ? "Close profile" : "Open profile"}</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div> : <p className="ci-insight-empty">Add verified business profiles to compare recorded channel metrics.</p>}
          <p className="ci-note">Interactions sum recorded likes, comments, and shares for the selected snapshot. Values across platforms are shown separately.</p>
        </section>

        <div className="ci-research-grid">
          <section className="ci-card ci-keyword-card" aria-labelledby="ci-keyword-title">
            <header className="ci-card-head"><div><p className="ci-kicker">Keyword research</p><h2 id="ci-keyword-title">Search the market</h2></div><Search size={18} aria-hidden="true" /></header>
            <p className="ci-insight-caption">Saved profile keywords and brand context create searches. Search results are public pages, not keyword rankings or volume estimates.</p>
            <form className="ci-search-form" onSubmit={(event) => { event.preventDefault(); const query = marketSearchInput.trim(); if (query.length >= 2) void searchWebsites(query); }}>
              <input aria-label="Search public businesses and websites" placeholder="Search businesses, brands, or keywords…" value={marketSearchInput} maxLength={160} onChange={(event) => setMarketSearchInput(event.target.value)} />
              <button className="button button-gold" type="submit" disabled={searchBusy || marketSearchInput.trim().length < 2}>{searchBusy ? "Searching…" : "Search"}</button>
            </form>
            {selected?.keywords.length ? <div className="ci-chips ci-keyword-chips" aria-label={`Keywords saved for ${selected.name}`}>
              {selected.keywords.map((keyword) => <button type="button" className="ci-chip ci-keyword-query" key={keyword} onClick={() => void searchWebsites(`${keyword} ${data.brand.location}`)} disabled={searchBusy}><Search size={12} aria-hidden="true" />{keyword}<ArrowRight size={12} aria-hidden="true" /></button>)}
            </div> : <p className="ci-note">Choose a competitor with saved keywords or use a market search below.</p>}
            <div className="ci-queries">
              {searchQueries.slice(0, 4).map((query, index) => <button className="ci-query" type="button" key={query.query} style={{ "--c": accentFor(index) } as CSSProperties} onClick={() => { setMarketSearchInput(query.query); void searchWebsites(query.query); }} disabled={searchBusy}>
                <span className="ci-query-icon"><Search size={15} aria-hidden="true" /></span><span className="t">{query.label}</span><ArrowRight size={14} aria-hidden="true" />
              </button>)}
            </div>
            {!data.dataCollection.websiteSearchAvailable && <p className="ci-note">Live results need a Tavily Search API key. Set TAVILY_API_KEY in apps/api/.env and restart the API server to enable searches.</p>}
            {searchBusy && <p className="ci-note" role="status">Searching public websites…</p>}
            {searchError && <p className="ci-search-error" role="alert">{searchError}</p>}
            {activeSearchQuery && <p className="ci-search-query">Results for <strong>{activeSearchQuery}</strong></p>}
            {searchResults.length > 0 && <div className="ci-results">{searchResults.map((result) => <article className="ci-result" key={result.url}>
              <div><strong>{result.title}</strong><span>{result.domain}</span></div>
              <div className="ci-result-actions"><a href={result.url} target="_blank" rel="noreferrer">Open source</a><button type="button" onClick={() => startNewProfile({ name: result.title, websiteUrl: result.url, industry: data.brand.industry ?? "", location: data.brand.location }, "page")}>Add profile</button></div>
            </article>)}</div>}
          </section>

          <section className="ci-card ci-format-card" aria-labelledby="ci-format-title">
            <header className="ci-card-head"><div><p className="ci-kicker">Observed content</p><h2 id="ci-format-title">Formats in saved posts</h2></div><Activity size={18} aria-hidden="true" /></header>
            <p className="ci-insight-caption">Recorded post counts and interactions from the leading profiles.</p>
            {topTactics.length ? <div className="ci-tactic-chart">{topTactics.map((item, index) => {
              const maximum = Math.max(1, ...topTactics.map((tactic) => tactic.interactions));
              return <div key={item.format}>
                <div><strong>{item.format}</strong><span>{item.count} {item.count === 1 ? "post" : "posts"} · {item.interactions.toLocaleString()} interactions</span></div>
                <span className="ci-tactic-track"><i style={{ width: `${item.interactions ? Math.max(4, item.interactions / maximum * 100) : 0}%`, background: `linear-gradient(90deg, ${accentFor(index)}, ${accentFor(index)}aa)` }} /></span>
              </div>;
            })}</div> : <p className="ci-insight-empty">No observed post formats are available yet.</p>}
            <p className="ci-note">Interactions indicate recorded activity only; they do not establish what caused a post’s performance.</p>
          </section>
        </div>
      </section>}

      {data && <section className="ci-profile-section" aria-label="Selected competitor profile">
        {rankedCompetitors.length ? <div className="ci-snapshot-list">{rankedCompetitors.filter(({ competitor }) => competitor.id === selectedId).map(({ competitor }) => {
          const snapshot = competitor.snapshots[0] ?? null;
          const allPosts = [...new Map(competitor.snapshots.flatMap((item) => item.observations.posts).map((post) => [post.url, post])).values()];
          const measuredPostsList = allPosts.filter((post) => postInteractions(post) !== null || typeof post.metrics.views === "number");
          const posts = [...(measuredPostsList.length ? measuredPostsList : allPosts)].sort((left, right) => {
            const leftViews = left.metrics.views;
            const rightViews = right.metrics.views;
            if (typeof leftViews === "number" && typeof rightViews === "number") return rightViews - leftViews;
            if (typeof leftViews === "number") return -1;
            if (typeof rightViews === "number") return 1;
            return (postInteractions(right) ?? -1) - (postInteractions(left) ?? -1);
          }).slice(0, 3);
          const reverseEngineering = snapshot?.analysisJson?.content.reverseEngineering ?? [];
          const patterns = snapshot?.analysisJson?.content.patterns
            .filter((pattern) => !/^(not available|no patterns? (?:were )?available|insufficient (?:data|evidence)|not enough evidence)/i.test(pattern.trim()))
            .slice(0, 3) ?? [];
          const socialLinks = Object.entries(competitor.socialProfiles).filter((entry): entry is [string, string] => Boolean(entry[1]));
          const savedLogoUrl = snapshot?.observations.websiteResearch?.competitorWebsite?.logoUrl || "";
          let logoUrl = savedLogoUrl;
          try { if (logoUrl && new URL(logoUrl).pathname === "/") logoUrl = ""; } catch { logoUrl = ""; }
          const logoText = snapshot?.observations.websiteResearch?.competitorWebsite?.logoText || "";
          const websiteReport = snapshot?.observations.websiteResearch?.competitorWebsite;
          const websiteDescription = websiteReport?.description && websiteReport.description !== competitor.overview ? websiteReport.description : null;
          const postAccessLimits = socialLinks.flatMap(([platform]) => {
            if (platform === "Instagram" && !data.dataCollection.instagramCompetitorInsightsAvailable) return ["Instagram post metrics need an eligible professional account, Facebook Login, and Meta Business Discovery permissions."];
            if (platform === "YouTube" && !data.dataCollection.youtubeApiAvailable) return ["YouTube post metrics need the YouTube Data API key in the API environment."];
            if ((platform === "X" || platform === "Twitter") && !data.dataCollection.xApiAvailable) return ["X post metrics need the X API bearer token in the API environment."];
            if (["Facebook", "LinkedIn", "TikTok", "Pinterest"].includes(platform)) return [`${platform} profiles are linked; post analytics are not connected for this platform.`];
            return [];
          });
          const researchWarnings = snapshot?.observations.websiteResearch?.warnings.filter((warning) => /instagram|youtube|\bx\b|facebook|linkedin|tiktok|pinterest/i.test(warning)) ?? [];
          const topPostViews = measuredPostsList.reduce((total, post) => total + (post.metrics.views ?? 0), 0);
          const topPostInteractions = measuredPostsList.reduce((total, post) => total + (postInteractions(post) ?? 0), 0);
          return <details ref={selectedProfileRef} className="ci-leader-card ci-snapshot-card" key={competitor.id} open onToggle={(event) => {
            if (event.currentTarget.open && selectedId !== competitor.id) setSelectedId(competitor.id);
            else if (!event.currentTarget.open && selectedId === competitor.id) setSelectedId("");
          }}>
            <summary className="ci-snapshot-summary">
              <span className={`ci-company-logo${logoText ? " ci-logo-has-text" : ""}${logoText && !logoUrl ? " ci-logo-text-mark" : ""}`}>{logoUrl ? <img src={logoUrl} alt="" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement?.classList.add("ci-logo-missing"); }} /> : null}{logoText && <span className="ci-site-logo-mark">{logoText}</span>}<span className="ci-logo-fallback">{competitor.name.slice(0, 1)}</span></span>
              <span className="ci-snapshot-identity"><small>PROFILE · {categoryMeta[competitor.category]?.label ?? "Competitor"}</small><strong>{competitor.name}</strong><span>{[competitor.industry, competitor.location].filter(Boolean).join(" · ") || "Business profile"}</span><span className="ci-snapshot-platforms">{socialLinks.length ? socialLinks.map(([platform]) => <em key={platform}>{platform}</em>) : <em>Website research</em>}</span></span>
              <span className="ci-snapshot-metrics"><span><strong>{allPosts.length}</strong><small>saved posts</small></span><span><strong>{measuredPostsList.some((post) => typeof post.metrics.views === "number") ? topPostViews.toLocaleString() : "—"}</strong><small>recorded views</small></span><span><strong>{measuredPostsList.some((post) => postInteractions(post) !== null) ? topPostInteractions.toLocaleString() : "—"}</strong><small>interactions</small></span></span>
              <span className="ci-snapshot-open"><span>Selected profile</span><ArrowRight size={16} aria-hidden="true" /></span>
            </summary>
            <div className="ci-snapshot-details">
            <section className="ci-company-panel">
              <div className="ci-company-heading">
                <span className={`ci-company-logo${logoText ? " ci-logo-has-text" : ""}${logoText && !logoUrl ? " ci-logo-text-mark" : ""}`}>{logoUrl ? <img src={logoUrl} alt={`${competitor.name} logo`} onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement?.classList.add("ci-logo-missing"); }} /> : null}{logoText && <span className="ci-site-logo-mark">{logoText}</span>}<span className="ci-logo-fallback">Logo unavailable</span></span>
                <div><span className="ci-rank-label">PROFILE DETAILS</span><h3>{competitor.name}</h3></div>
              </div>
              <dl className="ci-company-facts">
                {websiteDescription && <div className="ci-company-fact-wide"><dt>Website summary</dt><dd>{websiteDescription}</dd></div>}
                {competitor.industry && <div><dt>Industry</dt><dd>{competitor.industry}</dd></div>}
                <div><dt>Location</dt><dd>{competitor.location || "Not listed"}</dd></div>
                <div><dt>Website</dt><dd>{competitor.websiteUrl ? <a href={competitor.websiteUrl} target="_blank" rel="noreferrer">{new URL(competitor.websiteUrl).hostname} ↗</a> : "No website saved"}</dd></div>
                {competitor.overview && <div className="ci-company-fact-wide"><dt>Business overview</dt><dd>{competitor.overview}</dd></div>}
                {competitor.products && <div className="ci-company-fact-wide"><dt>Products / services</dt><dd>{competitor.products}</dd></div>}
                {competitor.audience && <div className="ci-company-fact-wide"><dt>Audience</dt><dd>{competitor.audience}</dd></div>}
                {competitor.uniqueValue && <div className="ci-company-fact-wide"><dt>Positioning</dt><dd>{competitor.uniqueValue}</dd></div>}
                {competitor.brandVoice && <div><dt>Brand voice</dt><dd>{competitor.brandVoice}</dd></div>}
                {competitor.keywords.length > 0 && <div className="ci-company-fact-wide"><dt>Keywords</dt><dd>{competitor.keywords.join(" · ")}</dd></div>}
                {competitor.notes && <div className="ci-company-fact-wide"><dt>Research notes</dt><dd>{competitor.notes}</dd></div>}
              </dl>
              <div className="ci-social-block"><strong>Social channels</strong>{socialLinks.length ? <div className="ci-social-links">{socialLinks.map(([platform, url]) => <a key={platform} href={url} target="_blank" rel="noreferrer">{platform} ↗</a>)}</div> : <p>No public accounts linked on the company website.</p>}{researchWarnings.length > 0 && <details className="ci-research-warnings"><summary>Data access notes · {researchWarnings.length}</summary><ul>{researchWarnings.slice(0, 6).map((warning, warningIndex) => <li key={`${warningIndex}-${warning}`}>{warning}</li>)}</ul></details>}</div>
            </section>
            <section className="ci-content-panel">
              <div className="ci-content-heading"><div><p className="ci-kicker">SOCIAL CONTENT</p><h3>Standout posts & strategy</h3></div><span>{posts.length} post{posts.length === 1 ? "" : "s"} with saved evidence</span></div>
              {snapshot?.observations.platformMetrics.length ? <section className="ci-profile-channel-analytics" aria-label="Latest recorded channel analytics">
                <header><strong>Latest channel analytics</strong><span>{new Date(snapshot.observedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span></header>
                <div>{snapshot.observations.platformMetrics.map((item) => <article key={`${item.platform}-${item.capturedAt ?? snapshot.observedAt}`}>
                  <strong>{item.platform}</strong>
                  <span><b>{metricNumber(item.metrics.followers)}</b> followers</span>
                  <span><b>{metricNumber(item.metrics.following)}</b> following</span>
                  <span><b>{metricNumber(item.metrics.totalPosts)}</b> profile posts</span>
                </article>)}</div>
              </section> : <p className="ci-profile-analytics-empty">No channel-level metrics have been saved for this profile yet. Add dated public post evidence below to track available figures.</p>}
              {posts.length ? <><div className="ci-post-ranking-note">Top posts ranked by recorded views and interactions.</div><div className="ci-leader-posts">{posts.map((post, postIndex) => {
                const interactions = postInteractions(post);
                const postRef = `${post.url} ${post.topic} ${post.hook}`.toLowerCase();
                const reverse = reverseEngineering.find((item) => item.postReference && (postRef.includes(item.postReference.toLowerCase()) || item.postReference.toLowerCase().includes(post.url.toLowerCase()) || (post.topic.length > 12 && item.postReference.toLowerCase().includes(post.topic.slice(0, 40).toLowerCase()))));
                return <article className="ci-leader-post" key={`${post.url}-${postIndex}`}>
                  <div className="ci-post-topline"><span className="ci-post-rank">{typeof post.metrics.views === "number" ? `TOP VIEWS #${postIndex + 1}` : `POST #${postIndex + 1}`}</span><span>{post.platform} · {post.format || "Format not recorded"}</span></div>
                  <h4>{post.topic || "Post topic not recorded"}</h4>
                  {post.hook && <p className="ci-post-hook">“{post.hook}”</p>}
                  <div className="ci-post-metrics">{post.metrics.views !== undefined && <span><strong>{post.metrics.views.toLocaleString()}</strong> views</span>}{post.metrics.likes !== undefined && <span><strong>{post.metrics.likes.toLocaleString()}</strong> likes</span>}{post.metrics.comments !== undefined && <span><strong>{post.metrics.comments.toLocaleString()}</strong> comments</span>}{post.metrics.shares !== undefined && <span><strong>{post.metrics.shares.toLocaleString()}</strong> shares</span>}{interactions === null && post.metrics.views === undefined && <span>Performance counts unavailable</span>}</div>
                  {reverse ? <div className="ci-post-strategy"><strong>Why it may attract attention</strong><p>{[reverse.hook, reverse.emotionalTrigger, reverse.audienceNeed, reverse.visualApproach, reverse.engagementApproach].filter(Boolean).join(" · ")}</p><small>Content interpretation · {reverse.evidence || "Based on the cited post content; not proof of what caused its results."}</small></div> : (post.hook || post.captionApproach || post.callToAction) ? <div className="ci-post-strategy"><strong>Visible content tactic</strong><p>{[post.hook && `Opening: ${post.hook.slice(0, 180)}`, post.captionApproach && post.captionApproach !== post.hook ? `Caption: ${post.captionApproach.slice(0, 180)}` : "", post.callToAction && `Call to action: ${post.callToAction}`].filter(Boolean).join(" · ")}</p><small>Observed in the post. No causal performance claim.</small></div> : <p className="ci-post-strategy">Post details were not captured, so its attention tactic cannot be assessed yet.</p>}
                  <a href={post.url} target="_blank" rel="noreferrer">View original post ↗</a>
                </article>;
              })}</div></> : <div className="ci-no-posts"><strong>No post analytics captured yet</strong><p>{postAccessLimits.length ? "Some connected platforms need additional access before post metrics can be collected." : "Add a public post and its visible metrics to start tracking this profile."}</p>{postAccessLimits.length > 0 && <details><summary>Platform access details · {postAccessLimits.length}</summary><ul>{[...new Set(postAccessLimits)].map((limit) => <li key={limit}>{limit}</li>)}</ul></details>}<a href="#add-public-post-evidence" onClick={(event) => { event.preventDefault(); const details = event.currentTarget.closest(".ci-content-panel")?.querySelector<HTMLDetailsElement>(".ci-record-details"); if (details) { details.open = true; details.scrollIntoView({ behavior: "smooth", block: "center" }); } }}>Add post evidence</a></div>}
              {patterns.length > 0 && <div className="ci-strategy-summary"><h4>Recurring content tactics</h4><ul>{patterns.map((pattern, patternIndex) => <li key={`${patternIndex}-${pattern}`}>{pattern}</li>)}</ul><small>These are content-based interpretations. The recorded post metrics show association only, not that a tactic caused the results.</small></div>}
              <details className="ci-record-details">
                <summary>Add public post evidence</summary>
                <form className="ci-record-form" onSubmit={(event) => void recordSnapshot(event, competitor)}>
                  <label>Source label<input required minLength={2} maxLength={160} value={sourceLabel} onChange={(event) => setSourceLabel(event.target.value)} /></label>
                  <label>Source URL<input type="url" value={sourceUrl} placeholder="https://" onChange={(event) => setSourceUrl(event.target.value)} /></label>
                  <label>Platform<select value={observedPlatform} onChange={(event) => setObservedPlatform(event.target.value as SocialPlatform)}>{socialPlatforms.map((platform) => <option key={platform}>{platform}</option>)}</select></label>
                  <label>Public post URL<input type="url" value={postUrl} placeholder="https://" onChange={(event) => setPostUrl(event.target.value)} /></label>
                  <label>Format<input value={postFormat} onChange={(event) => setPostFormat(event.target.value)} /></label>
                  <label>Post topic<input value={postTopic} onChange={(event) => setPostTopic(event.target.value)} /></label>
                  <label>Published date<input type="date" value={postPublishedDate} onChange={(event) => setPostPublishedDate(event.target.value)} /></label>
                  <label>Opening hook<input value={postHook} maxLength={1000} onChange={(event) => setPostHook(event.target.value)} placeholder="First line or visual hook" /></label>
                  <label>Caption approach<input value={postApproach} maxLength={1500} onChange={(event) => setPostApproach(event.target.value)} placeholder="How the post frames its message" /></label>
                  <label>Call to action<input value={postCta} maxLength={500} onChange={(event) => setPostCta(event.target.value)} placeholder="What the post asks viewers to do" /></label>
                  {postMetricFields.map(({ key, label }) => <label key={key}>{label}<input type="number" min="0" value={metricValues[key] ?? ""} onChange={(event) => setMetricValues({ ...metricValues, [key]: event.target.value })} /></label>)}
                  <button className="button button-gold" type="submit" disabled={busy === "snapshot"}>{busy === "snapshot" ? "Saving…" : "Save post evidence"}</button>
                </form>
              </details>
            </section>
            <div className="ci-company-actions"><button className="button button-outline" type="button" onClick={() => editProfile(competitor)}>Edit</button><button className="button button-outline" type="button" onClick={() => exportReport(competitor)}>Export report</button><button className="button button-outline ci-refresh-research" type="button" onClick={() => void refreshWebsiteFindings(competitor)} disabled={busy === "website"}>{busy === "website" ? "Scanning…" : "Refresh site"}</button></div>
            </div>
          </details>;
        })}</div> : null}
        {!rankedCompetitors.length && <div className="ci-empty ci-card"><h3>No verified business profiles yet</h3><p>Set your industry and location in Brand Profile, then discover individual businesses with a homepage logo.</p><div className="ci-empty-actions">{data.dataCollection.websiteSearchAvailable && <button className="button button-gold" type="button" onClick={() => void discoverAndAnalyze()} disabled={busy === "discovery"}>{busy === "discovery" ? "Searching…" : "Discover competitors"}</button>}<button className="button button-outline" type="button" onClick={() => startNewProfile()}><Plus size={15} aria-hidden="true" /> Add a profile</button></div></div>}
      </section>}
      {showProfileForm && renderProfileForm()}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {error && <div className="notice notice-error ci-error-alert" role="alert"><div className="ci-error-summary"><p>{error.length > 260 ? `${error.slice(0, 260).trimEnd()}…` : error}</p>{error.length > 260 && <details><summary>Show full error details</summary><pre>{error}</pre></details>}</div><button className="button button-outline" type="button" onClick={() => void (retryDiscovery ? discoverAndAnalyze() : load())}>{retryDiscovery ? "Retry" : "Try again"}</button></div>}
      {loading && <p className="loading-label">Loading competitor intelligence…</p>}    </section>
  );
}

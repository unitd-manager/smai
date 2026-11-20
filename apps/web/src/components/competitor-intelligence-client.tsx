"use client";

import Link from "next/link";
import { Activity, ArrowRight, BarChart3, Brain, Building2, Compass, FileText, Lightbulb, Radio, Search, TrendingUp, UsersRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
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

function metricNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "Not captured";
}

function profileCompleteness(competitor: CompetitorProfile) {
  const signals = [
    competitor.industry,
    competitor.websiteUrl,
    competitor.location,
    competitor.overview,
    competitor.products,
    competitor.audience,
    competitor.uniqueValue,
    competitor.brandVoice,
    Object.values(competitor.socialProfiles).some(Boolean) ? "social profile" : "",
  ];
  return Math.round(signals.filter(Boolean).length / signals.length * 100);
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
  const blob = new Blob([JSON.stringify({
    reportType: "competitor-intelligence",
    exportedAt: new Date().toISOString(),
    competitor,
    evidencePolicy: "Metrics and observations are user-recorded public data; AI analysis is interpretation, not independently verified research.",
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${competitor.name.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "competitor"}-report.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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

export function CompetitorIntelligenceClient() {
  const profileFormRef = useRef<HTMLFormElement>(null);
  const [data, setData] = useState<CompetitorResponse | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<CompetitorWebsiteResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [activeSearchQuery, setActiveSearchQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"overview" | "evidence" | "analysis" | "compare">("overview");
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
      setSelectedId((current) => keepSelected && response.competitors.some((item) => item.id === current)
        ? current
        : response.competitors[0]?.id ?? "");
    } catch (requestError) {
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
    if (!showProfileForm) return;
    const formElement = profileFormRef.current;
    if (!formElement) return;
    formElement.scrollIntoView({ behavior: "smooth", block: "start" });
    formElement.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
  }, [showProfileForm]);

  const selected = data?.competitors.find((competitor) => competitor.id === selectedId) ?? null;
  const latest = selected?.snapshots[0] ?? null;
  const analysis = latest?.analysisJson ?? null;
  const observedPosts = latest?.observations.posts ?? [];
  const displayedPosts = [...observedPosts
    .filter((post) => postPlatformFilter === "all" || post.platform === postPlatformFilter)
    .filter((post) => postFormatFilter === "all" || post.format.toLowerCase() === postFormatFilter)
    .filter((post) => !postTopicFilter.trim() || post.topic.toLowerCase().includes(postTopicFilter.trim().toLowerCase()))
    .filter((post) => !postDateFilter || Boolean(post.publishedAt && post.publishedAt.slice(0, 10) >= postDateFilter))]
    .sort((left, right) => {
      if (postSort === "date") return (right.publishedAt ?? "").localeCompare(left.publishedAt ?? "");
      const engagement = (post: ObservedPost) => (post.metrics.likes ?? 0) + (post.metrics.comments ?? 0) + (post.metrics.shares ?? 0);
      return engagement(right) - engagement(left);
    });
  const activity = (data?.competitors ?? []).flatMap((competitor) => competitor.snapshots.map((snapshot) => ({
    id: snapshot.id,
    competitor: competitor.name,
    competitorId: competitor.id,
    observedAt: snapshot.observedAt,
    sourceCount: snapshot.sources.length,
    postCount: snapshot.observations.posts.length,
    analyzed: Boolean(snapshot.analysisJson),
  }))).sort((left, right) => right.observedAt.localeCompare(left.observedAt)).slice(0, 12);

  function editProfile(competitor: CompetitorProfile) {
    setSelectedId(competitor.id);
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

  function startNewProfile(prefill?: Partial<ProfileForm>) {
    setSelectedId("");
    setForm({ ...emptyProfile, ...prefill });
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

  async function removeCompetitor(competitor: CompetitorProfile) {
    if (!window.confirm(`Remove ${competitor.name} and its saved observations from this workspace?`)) return;
    setBusy("remove");
    setError("");
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

  async function recordSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy("snapshot");
    setError("");
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
      await apiRequest<{ snapshot: CompetitorSnapshot }>(`/api/competitors/${encodeURIComponent(selected.id)}/snapshots`, {
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

  async function analyzeLatest() {
    if (!selected) return;
    setBusy("analysis");
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{
        research: { scannedWebsiteCount: number; discoveredSocialProfiles: number; addedSocialProfiles: number; warnings: string[] };
      }>(`/api/competitors/${encodeURIComponent(selected.id)}/analyze`, {
        method: "POST",
        body: JSON.stringify(latest ? { snapshotId: latest.id } : {}),
      });
      await load();
      setTab("analysis");
      const scanned = response.research.scannedWebsiteCount;
      const accounts = response.research.discoveredSocialProfiles;
      const addedAccounts = response.research.addedSocialProfiles;
      const result = `Analysis saved. Scanned ${scanned} public website${scanned === 1 ? "" : "s"}; found ${accounts} social link${accounts === 1 ? "" : "s"}${addedAccounts ? ` and added ${addedAccounts} to the profile` : ""}.`;
      setNotice(response.research.warnings.length
        ? `${result} ${response.research.warnings.join(" ")}`
        : result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not analyze the saved observations.");
    } finally {
      setBusy("");
    }
  }

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

  return (
    <section className="dashboard-content competitor-page">
      <div className="competitor-hero">
        <div className="competitor-hero-copy">
          <p className="eyebrow competitor-eyebrow"><Activity size={14} aria-hidden="true" /> GROW YOUR BUSINESS · COMPETITIVE RESEARCH</p>
          <h1>Competitor intelligence</h1>
          <p>Turn sourced public observations into a practical, differentiated marketing plan. Nothing is scraped or estimated.</p>
        </div>
        <div className="competitor-hero-visual" aria-hidden="true">
          <div className="competitor-hero-chart">
            <span /><span /><span /><span /><span />
            <TrendingUp />
          </div>
        </div>
        <button className="button competitor-hero-action" type="button" onClick={() => startNewProfile()}>Add competitor <ArrowRight size={15} aria-hidden="true" /></button>
      </div>
      <div className="competitor-evidence-banner" role="note">
        <span className="competitor-evidence-icon"><Lightbulb size={18} aria-hidden="true" /></span>
        <div><strong>Evidence-first research</strong><span>Public homepages can be searched and scanned. Social profile links may be discovered; social posts and private metrics are not collected.</span></div>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}<button className="button button-outline" type="button" onClick={() => void load()}>Try again</button></div>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {loading && <p className="loading-label">Loading competitor research…</p>}

      {showProfileForm && <form ref={profileFormRef} className="competitor-profile-form" onSubmit={(event) => void saveProfile(event)}>
        <div className="created-results-heading"><div><p className="card-kicker">{selectedId ? "EDIT PROFILE" : "COMPETITOR DISCOVERY"}</p><h2>{selectedId ? "Update competitor profile" : "Add a competitor"}</h2><p>Enter known business and profile details. These fields are context, not independently verified facts.</p></div><button className="button button-outline" type="button" onClick={() => setShowProfileForm(false)}>Close</button></div>
        <div className="competitor-form-grid">
          <label>Business name<input required minLength={2} maxLength={191} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Relationship<select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as CompetitorCategory })}><option value="direct">Direct competitor</option><option value="indirect">Indirect competitor</option><option value="emerging">Emerging competitor</option><option value="industry-leader">Industry leader</option></select></label>
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
      </form>}

      <section className="competitor-discovery-section">
        <div className="campaign-section-heading"><div><p className="card-kicker competitor-section-label"><Compass size={15} aria-hidden="true" /> DISCOVERY WORKSPACE</p><h2>Research leads for {data?.brand.name || "your brand"}</h2><p>Search suggestions use your saved business context. Verify each result before adding it.</p></div></div>
        {searchQueries.length ? <div className="competitor-query-grid">{searchQueries.slice(0, 3).map(({ label, query }, index) => {
          const QueryIcon = [Compass, BarChart3, Building2][index] ?? Search;
          return <button key={query} type="button" onClick={() => void searchWebsites(query)} disabled={searchBusy}><span className="competitor-query-icon"><QueryIcon size={17} aria-hidden="true" /></span><span className="competitor-query-label">{label}</span><small>{searchBusy && activeSearchQuery === query ? "Searching…" : "Search public web"}<ArrowRight size={14} aria-hidden="true" /></small></button>;
        })}</div> : <p>Add your industry and market in Brand Profile to get search suggestions.</p>}
        {!data?.dataCollection.websiteSearchAvailable && <p className="competitor-search-setup">In-dashboard search needs a Tavily API key. Add TAVILY_API_KEY to apps/api/.env and restart the API server.</p>}
        {searchQueries.length > 0 && <p className="competitor-discovery-note"><Search size={13} aria-hidden="true" /> Use public company pages and profiles as sources. This app does not fetch arbitrary URLs or scrape social platforms.</p>}
        {searchError && <p className="competitor-search-error" role="alert">{searchError}</p>}
        {searchBusy && <p className="competitor-search-status" role="status">Finding company websites…</p>}
        {!searchBusy && activeSearchQuery && !searchError && <section className="competitor-search-results" aria-live="polite">
          <div className="competitor-search-results-heading"><h3>Websites for “{activeSearchQuery}”</h3><span>{searchResults.length} found · {data?.dataCollection.websiteSearchProvider}</span></div>
          {!searchResults.length ? <p>No website results found. Try a broader search.</p> : <div className="competitor-search-results-list">{searchResults.map((result) => <article key={result.domain}><div><strong>{result.title}</strong><span>{result.domain}</span></div><div><a href={result.url} target="_blank" rel="noreferrer">Open website</a><button type="button" onClick={() => startNewProfile({ name: result.title.slice(0, 191), websiteUrl: result.url })}>Add profile</button></div></article>)}</div>}
        </section>}
      </section>

      {data && <div className="competitor-overview-grid">
        <article><span className="competitor-stat-icon competitor-stat-icon--profiles"><UsersRound size={16} aria-hidden="true" /></span><span className="card-kicker competitor-stat-label">TRACKED PROFILES</span><strong>{data.competitors.length}</strong><p>Competitors in this brand workspace</p></article>
        <article><span className="competitor-stat-icon competitor-stat-icon--observations"><FileText size={16} aria-hidden="true" /></span><span className="card-kicker competitor-stat-label">SOURCED OBSERVATIONS</span><strong>{data.competitors.reduce((total, item) => total + item.snapshots.length, 0)}</strong><p>Dated snapshots in recent history</p></article>
        <article><span className="competitor-stat-icon competitor-stat-icon--analysis"><Brain size={16} aria-hidden="true" /></span><span className="card-kicker competitor-stat-label">AI ANALYSES</span><strong>{data.competitors.reduce((total, item) => total + item.snapshots.filter((snapshot) => snapshot.analysisJson).length, 0)}</strong><p>Saved evidence-based reports</p></article>
        <article><span className="competitor-stat-icon competitor-stat-icon--monitoring"><Radio size={16} aria-hidden="true" /></span><span className="card-kicker competitor-stat-label">AUTOMATIC MONITORING</span><strong>Not connected</strong><p>Refresh with a new sourced observation</p></article>
      </div>}

      {data && data.competitors.length === 0 && <section className="competitor-empty-research">
        <div className="competitor-empty-art" aria-hidden="true"><Compass size={42} /><span /><span /><span /></div>
        <div className="competitor-empty-copy"><p className="card-kicker">YOUR RESEARCH SET STARTS HERE</p><h2>Start your competitive research set</h2><p>Add a competitor profile, then record sourced public observations. Intelligence and reports grow from dated evidence—not guessed statistics.</p>
          <button className="button button-gold" type="button" onClick={() => startNewProfile()}>Add your first competitor <ArrowRight size={15} aria-hidden="true" /></button>
        </div>
      </section>}

      {data && data.competitors.length > 0 && <section className="competitor-directory">
        <div className="campaign-section-heading"><div><p className="card-kicker competitor-section-label"><UsersRound size={15} aria-hidden="true" /> YOUR COMPETITORS</p><h2>Research set</h2></div><button className="button button-outline" type="button" onClick={() => void load()}>Refresh</button></div>
        <div className="competitor-directory-list">{data.competitors.map((competitor) => <button className={`competitor-directory-card${competitor.id === selectedId ? " is-selected" : ""}`} type="button" key={competitor.id} onClick={() => { setSelectedId(competitor.id); setShowProfileForm(false); }}>
          <span>{competitor.category.replace("-", " ")}</span><strong>{competitor.name}</strong><small>{competitor.industry || "Industry not entered"} · {competitor.snapshots.length} snapshots</small>
        </button>)}</div>
      </section>}

      {selected && <section className="competitor-workspace">
        <div className="competitor-workspace-heading"><div><p className="card-kicker">{selected.category.toUpperCase().replace("-", " ")} · {selected.location || "Location not recorded"}</p><h2>{selected.name}</h2><p>{selected.industry || "Industry not recorded"}{latest ? ` · Last observed ${new Date(latest.observedAt).toLocaleString()}` : " · No observation snapshots yet"}</p></div><div className="campaign-workflow-actions"><button className="button button-outline" type="button" onClick={() => editProfile(selected)}>Edit profile</button><button className="button button-outline" type="button" onClick={() => exportReport(selected)}>Export report</button><button className="button button-outline" type="button" onClick={() => void removeCompetitor(selected)} disabled={busy === "remove"}>Remove</button></div></div>
        <nav className="competitor-tabs" aria-label="Competitor intelligence sections">{([
          ["overview", "Profile", UsersRound],
          ["evidence", "Evidence", FileText],
          ["analysis", "Analysis", Brain],
          ["compare", "Compare", BarChart3],
        ] as const).map(([key, label, Icon]) => <button type="button" key={key} className={tab === key ? "is-active" : ""} onClick={() => setTab(key)}><span><Icon size={15} aria-hidden="true" />{label}</span></button>)}</nav>

        {tab === "overview" && <div className="competitor-view-grid">
          <article className="competitor-detail-card"><h3>Business profile</h3><div className="competitor-profile-completeness"><span>Profile completeness</span><strong>{profileCompleteness(selected)}%</strong></div><p>{selected.overview || "No sourced overview entered."}</p><dl>
            <dt>Products/services</dt><dd>{selected.products || "Not recorded"}</dd>
            <dt>Target audience</dt><dd>{selected.audience || "Not recorded"}</dd>
            <dt>Unique value</dt><dd>{selected.uniqueValue || "Not recorded"}</dd>
            <dt>Brand voice</dt><dd>{selected.brandVoice || "Not recorded"}</dd>
            <dt>Research keywords</dt><dd>{selected.keywords.join(", ") || "None recorded"}</dd>
            {selected.websiteUrl && <><dt>Website</dt><dd><a href={selected.websiteUrl} target="_blank" rel="noreferrer">{selected.websiteUrl}</a></dd></>}
          </dl><div className="competitor-link-list">{Object.entries(selected.socialProfiles).filter(([, url]) => Boolean(url)).map(([platform, url]) => <a key={platform} href={url} target="_blank" rel="noreferrer">{platform} profile ↗</a>)}</div></article>
          <article className="competitor-detail-card"><span className="card-kicker competitor-section-label"><FileText size={15} aria-hidden="true" /> NEXT STEP</span><h3>Analyze public evidence</h3><p>Scan the Brand Kit and competitor websites, then analyze observations recorded from Instagram, LinkedIn, Facebook, or other public sources.</p><button className="button button-gold" type="button" onClick={() => void analyzeLatest()} disabled={busy === "analysis"}>{busy === "analysis" ? "Scanning and analyzing…" : "Scan websites & analyze"}</button><p className="competitor-instagram-limit">Profile links alone do not provide post content or metrics. This app does not scrape Instagram, LinkedIn, or Facebook; add dated public observations under Evidence for channel analysis.</p><button className="button button-outline" type="button" onClick={() => { const platform = (["Instagram", "LinkedIn", "Facebook"] as const).find((name) => selected.socialProfiles[name]) ?? "Instagram"; setObservedPlatform(platform); setSourceLabel(`Public ${platform} profile observation`); setSourceUrl(selected.socialProfiles[platform] ?? ""); setTab("evidence"); }}>Add social evidence</button>{latest?.analysisJson && <button className="button button-outline" type="button" onClick={() => setTab("analysis")}>View action plan</button>}</article>
          <div className="competitor-data-limit"><strong>Data available</strong><p>Public website homepages are scanned on request. Social links can be discovered there; private analytics and social post collection are not connected.</p></div>
          {activity.length > 0 && <section className="competitor-activity-feed"><div className="campaign-section-heading"><div><p className="card-kicker">MANUAL ACTIVITY HISTORY</p><h3>Recent research activity</h3></div></div>{activity.map((entry) => <button type="button" key={entry.id} onClick={() => { setSelectedId(entry.competitorId); setTab(entry.analyzed ? "analysis" : "evidence"); }}><strong>{entry.competitor}</strong><span>{entry.postCount} posts · {entry.sourceCount} sources · {entry.analyzed ? "analysis saved" : "observation saved"}</span><time>{new Date(entry.observedAt).toLocaleDateString()}</time></button>)}</section>}
        </div>}

        {tab === "evidence" && <div className="competitor-evidence-layout">
          <form className="competitor-profile-form" onSubmit={(event) => void recordSnapshot(event)}>
            <div className="campaign-section-heading"><div><p className="card-kicker">MANUAL DATA COLLECTION</p><h3>Save a sourced observation</h3><p>Enter only details you can verify from a public or authorized source. Every snapshot is timestamped and retained.</p></div></div>
            <div className="competitor-form-grid">
              <label>Source label<input required minLength={2} maxLength={160} value={sourceLabel} placeholder="Official Instagram profile, public webpage…" onChange={(event) => setSourceLabel(event.target.value)} /></label>
              <label>Source URL<input type="url" value={sourceUrl} placeholder="https://" onChange={(event) => setSourceUrl(event.target.value)} /></label>
              <label>Platform<select value={observedPlatform} onChange={(event) => { const platform = event.target.value as SocialPlatform; setObservedPlatform(platform); setSourceLabel(`Public ${platform} profile observation`); setSourceUrl(selected.socialProfiles[platform] ?? ""); }}><option value="Instagram">Instagram</option><option value="LinkedIn">LinkedIn</option><option value="Facebook">Facebook</option>{socialPlatforms.filter((platform) => !["Instagram", "LinkedIn", "Facebook"].includes(platform)).map((platform) => <option value={platform} key={platform}>{platform}</option>)}</select></label>
              <label>Observation date<input required type="date" max={new Date().toISOString().slice(0, 10)} value={observationDate} onChange={(event) => setObservationDate(event.target.value)} /></label>
              <label>Public post URL (optional)<input type="url" value={postUrl} placeholder="https://" onChange={(event) => setPostUrl(event.target.value)} /></label>
              {postUrl && <label>Post publication date (if known)<input type="date" max={new Date().toISOString().slice(0, 10)} value={postPublishedDate} onChange={(event) => setPostPublishedDate(event.target.value)} /></label>}
              {numberFields.map(({ key, label }) => <label key={key}>{label}<input type="number" min="0" step="1" value={metricValues[key] ?? ""} onChange={(event) => setMetricValues({ ...metricValues, [key]: event.target.value })} /></label>)}
              {postUrl && <>
                <label>Post format<input value={postFormat} maxLength={60} onChange={(event) => setPostFormat(event.target.value)} /></label>
                <label>Post topic<input value={postTopic} maxLength={500} onChange={(event) => setPostTopic(event.target.value)} /></label>
                <label>Hook or opening<textarea rows={2} value={postHook} maxLength={1000} onChange={(event) => setPostHook(event.target.value)} /></label>
                <label>Caption approach<textarea rows={2} value={postApproach} maxLength={1500} onChange={(event) => setPostApproach(event.target.value)} /></label>
                <label>Call to action<input value={postCta} maxLength={500} onChange={(event) => setPostCta(event.target.value)} /></label>
              </>}
              <label>Website or conversion observations<textarea rows={3} value={websiteFindings} placeholder="One observation per line, with page or source context" onChange={(event) => setWebsiteFindings(event.target.value)} /></label>
              <label>SEO observations<textarea rows={3} value={seoFindings} placeholder="Visible titles, headings, or topic coverage; not search rank" onChange={(event) => setSeoFindings(event.target.value)} /></label>
              <label>Audience questions or concern themes<textarea rows={3} value={audienceThemes} placeholder="Summarize themes only; avoid names or sensitive personal data" onChange={(event) => setAudienceThemes(event.target.value)} /></label>
              <label>Visible response patterns<textarea rows={3} value={responsePatterns} onChange={(event) => setResponsePatterns(event.target.value)} /></label>
              <label>Visible offers or campaigns<textarea rows={3} value={visibleCampaigns} onChange={(event) => setVisibleCampaigns(event.target.value)} /></label>
              <label>Brand and creative observations<textarea rows={3} value={creativeNotes} onChange={(event) => setCreativeNotes(event.target.value)} /></label>
              <label>Additional observation notes<textarea rows={3} value={observationNotes} onChange={(event) => setObservationNotes(event.target.value)} /></label>
            </div>
            <button className="button button-gold" type="submit" disabled={busy === "snapshot" || !sourceLabel.trim()}>{busy === "snapshot" ? "Saving observation…" : "Save dated observation"}</button>
          </form>
          <div className="competitor-snapshot-history"><h3>Observation history</h3>{selected.snapshots.length ? selected.snapshots.map((snapshot) => <article key={snapshot.id}>
            <strong>{new Date(snapshot.observedAt).toLocaleString()}</strong><span>{snapshot.sources.map((source) => source.label).join(" · ")}</span>
            <small>{snapshot.observations.platformMetrics.length} platform metric records · {snapshot.observations.posts.length} post records · {snapshot.analysisJson ? "AI analysis saved" : "Not analyzed"}</small>
            {snapshot.sources.map((source) => source.url && <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.url}</a>)}
          </article>) : <p>No observations yet. Save a sourced observation to unlock analysis.</p>}</div>
        </div>}

        {tab === "analysis" && <div className="competitor-analysis-view">
          <div className="competitor-analysis-toolbar"><div><span className="card-kicker">WEBSITE + EVIDENCE ANALYSIS</span><p>{latest ? `Using ${latest.sources.length} source(s), ${latest.observations.posts.length} recorded post(s).` : "Scan the Brand Kit and competitor websites to get started."}{latest?.analysisProvider ? ` Provider: ${latest.analysisProvider}.` : ""}</p></div><button className="button button-gold" type="button" onClick={() => void analyzeLatest()} disabled={busy === "analysis"}>{busy === "analysis" ? "Scanning and analyzing…" : analysis ? "Refresh analysis" : "Scan websites & analyze"}</button></div>
          {!analysis && <div className="section-empty-state"><h3>No saved analysis yet</h3><p>Run website analysis now, then add social posts for deeper channel insights.</p></div>}
          {analysis && <>
            <div className="competitor-analysis-summary"><span className="card-kicker">EXECUTIVE SUMMARY · AI INTERPRETATION</span><p>{analysis.summary}</p></div>
            <div className="competitor-analysis-grid">
              <article><h3>Positioning & differentiation</h3><p><strong>Position:</strong> {analysis.positioning.position}</p><p><strong>Value proposition:</strong> {analysis.positioning.valueProposition}</p><p><strong>Voice:</strong> {analysis.positioning.voiceAndMessaging}</p><p><strong>How your brand could differ:</strong> {analysis.positioning.differentiation}</p><InsightList title="Evidence notes" items={analysis.positioning.evidence} /></article>
              <article><h3>Content intelligence</h3><InsightList title="Observed or inferred pillars" items={analysis.content.pillars.map((pillar) => `${pillar.name} — ${pillar.evidence}`)} /><InsightList title="Formats and patterns" items={[...analysis.content.formats, ...analysis.content.patterns]} /><InsightList title="Repetition and gaps" items={analysis.content.repetitionAndGaps} /></article>
              <article><h3>Audience conversation themes</h3><InsightList title="Questions and concerns" items={[...analysis.audience.questions, ...analysis.audience.concerns]} /><InsightList title="Discussion triggers and unmet needs" items={[...analysis.audience.discussionTriggers, ...analysis.audience.unmetNeeds]} /><p><strong>Sentiment:</strong> {analysis.audience.sentiment}</p><p>{analysis.audience.privacyNote}</p></article>
              <article><h3>Brand & creative signals</h3><InsightList title="Identity signals" items={analysis.creative.identitySignals} /><InsightList title="Distinctive approaches" items={analysis.creative.distinctiveApproaches} /><InsightList title="Differentiate without copying" items={analysis.creative.differentiationIdeas} /></article>
              <article><h3>Website, SEO & visible campaigns</h3><InsightList title="Website and conversion observations" items={[...analysis.websiteAndCampaigns.websiteFindings, ...analysis.websiteAndCampaigns.conversionFindings]} /><InsightList title="Visible SEO evidence" items={analysis.websiteAndCampaigns.seoFindings} /><InsightList title="Public campaign observations" items={analysis.websiteAndCampaigns.visibleCampaigns} /><InsightList title="Limits" items={analysis.websiteAndCampaigns.evidenceLimits} /></article>
              <article><h3>SWOT · evidence-informed hypotheses</h3><InsightList title="Strengths" items={analysis.swot.strengths} /><InsightList title="Weaknesses" items={analysis.swot.weaknesses} /><InsightList title="Opportunities" items={analysis.swot.opportunities} /><InsightList title="Threats" items={analysis.swot.threats} /></article>
            </div>
            <section className="competitor-opportunities"><div className="campaign-section-heading"><div><p className="card-kicker">RANKED STRATEGIC HYPOTHESES · SCORES 1–5</p><h3>Opportunity finder</h3></div></div>{analysis.opportunities.map((item, index) => <article key={`${index}-${item.title}`}><div><span>Impact {item.impact}/5 · Ease {item.ease}/5 · Advantage {item.advantage}/5 · Audience fit {item.audienceRelevance}/5 · Conversion {item.conversionPotential}/5</span><h4>{item.title}</h4><p>{item.explanation}</p><p><strong>Action:</strong> {item.action}</p><small>Evidence or hypothesis: {item.evidence}</small></div><Link className="button button-outline" href={`/dashboard/campaigns?goal=${encodeURIComponent(item.action)}&name=${encodeURIComponent(item.title)}`}>Plan campaign</Link></article>)}</section>
            <section className="competitor-action-plan"><div className="campaign-section-heading"><div><p className="card-kicker">OUTPERFORM ACTION PLAN · RECOMMENDATIONS</p><h3>Specific moves for {data?.brand.name}</h3></div></div><div className="competitor-analysis-grid">
              <InsightList title="Start doing" items={analysis.actionPlan.start} />
              <InsightList title="Stop or reconsider" items={analysis.actionPlan.stop} />
              <InsightList title="Do differently" items={analysis.actionPlan.doDifferently} />
              <InsightList title="Formats and topics to prioritize" items={[...analysis.actionPlan.formatsToPrioritize, ...analysis.actionPlan.topicsToOwn]} />
              <InsightList title="Address these audience needs" items={analysis.actionPlan.audienceNeeds} />
              <InsightList title="Improve engagement" items={analysis.actionPlan.engagement} />
              <InsightList title="Strengthen positioning and conversion" items={[...analysis.actionPlan.positioning, ...analysis.actionPlan.conversion]} />
            </div></section>
            <section className="competitor-content-ideas"><div className="campaign-section-heading"><div><p className="card-kicker">ORIGINAL IDEAS · INSIGHT TO ACTION</p><h3>Content to make next</h3><p>These are original directions informed by evidence, not copied posts.</p></div></div><div className="competitor-idea-grid">{analysis.contentIdeas.map((idea, index) => <article key={`${index}-${idea.title}`}><span>{idea.format}</span><h4>{idea.title}</h4><p>{idea.opportunity}</p><p><strong>Hook:</strong> {idea.hook}</p><p><strong>Message:</strong> {idea.message}</p><p><strong>CTA:</strong> {idea.callToAction}</p><small>{idea.differentiation}</small><Link className="button button-gold" href={`/dashboard/create?idea=${encodeURIComponent(actionBrief(idea))}`}>Create original content</Link></article>)}</div></section>
            <div className="competitor-data-limit"><strong>Data limitations and research confidence</strong><ul>{analysis.dataLimits.map((limit, index) => <li key={`${index}-${limit}`}>{limit}</li>)}</ul><p>AI-generated analysis is interpretation, not verified market research. It cannot establish causes, private performance, market rank, or future results.</p></div>
          </>}
          {analysis && analysis.content.reverseEngineering.length > 0 && <section className="competitor-reverse-engineering"><h3>Post strategy breakdown</h3>{analysis.content.reverseEngineering.map((item, index) => <details key={`${index}-${item.postReference}`}><summary>{item.postReference} · strategic lesson</summary><dl><dt>Hook</dt><dd>{item.hook}</dd><dt>Story and emotion</dt><dd>{item.story} · {item.emotionalTrigger}</dd><dt>Audience need and value</dt><dd>{item.audienceNeed} · {item.value}</dd><dt>Visual and CTA</dt><dd>{item.visualApproach} · {item.callToAction}</dd><dt>Engagement method</dt><dd>{item.engagementApproach}</dd><dt>Evidence</dt><dd>{item.evidence}</dd><dt>Takeaway</dt><dd>{item.lesson}</dd></dl></details>)}</section>}
        </div>}

        {tab === "compare" && <div className="competitor-comparison-view"><div className="competitor-comparison-toolbar"><div><p className="card-kicker">OBSERVED VALUES ONLY</p><h3>Side-by-side comparison</h3><p>Values are shown only when captured in each competitor’s latest sourced snapshot. No score combines missing metrics.</p></div><label>Platform<select value={comparisonPlatform} onChange={(event) => setComparisonPlatform(event.target.value)}><option value="all">All platforms</option>{socialPlatforms.map((platform) => <option key={platform}>{platform}</option>)}</select></label></div>
          <div className="competitor-own-position"><span className="card-kicker">YOUR BRAND · {data?.brand.name}</span><p>{data?.brand.description || data?.brand.products || "Add your offer and positioning in Brand Profile to sharpen comparison."}</p><small>{data?.brand.industry || "Industry not recorded"} · Audience: {data?.brand.audience || "Not recorded"} · Voice: {data?.brand.tone || "Not recorded"}</small>{data?.brand.website && <a href={data.brand.website} target="_blank" rel="noreferrer">Brand Kit website ↗</a>}<Link href="/onboarding">Update Brand Profile</Link></div>
          <div className="competitor-comparison-table-wrap"><table className="competitor-comparison-table"><thead><tr><th>Competitor</th><th>Category</th><th>Platform</th><th>Followers</th><th>Following</th><th>Total posts</th><th>Observed post likes</th><th>Observed comments</th><th>Posts captured</th><th>Last observed</th></tr></thead><tbody>{data?.competitors.map((competitor) => {
            const snapshot = competitor.snapshots[0];
            const platformMetrics = snapshot?.observations.platformMetrics.filter((item) => comparisonPlatform === "all" || item.platform === comparisonPlatform) ?? [];
            const posts = snapshot?.observations.posts.filter((post) => comparisonPlatform === "all" || post.platform === comparisonPlatform) ?? [];
            const sum = (key: "likes" | "comments") => posts.reduce((total, post) => total + (post.metrics[key] ?? 0), 0);
            const byPlatform = (key: "followers" | "following" | "totalPosts") => platformMetrics
              .filter((item) => item.metrics[key] !== undefined)
              .map((item) => `${item.platform}: ${metricNumber(item.metrics[key])}`).join(" · ") || "Not captured";
            return <tr key={competitor.id}><th>{competitor.name}</th><td>{competitor.category}</td><td>{platformMetrics.map((item) => item.platform).join(", ") || "Not captured"}</td><td>{byPlatform("followers")}</td><td>{byPlatform("following")}</td><td>{byPlatform("totalPosts")}</td><td>{posts.length ? sum("likes").toLocaleString() : "Not captured"}</td><td>{posts.length ? sum("comments").toLocaleString() : "Not captured"}</td><td>{posts.length || "Not captured"}</td><td>{snapshot ? new Date(snapshot.observedAt).toLocaleDateString() : "Not captured"}</td></tr>;
          })}</tbody></table></div>
        </div>}
      </section>}

      {selected && <section className="competitor-observed-content">
        <div className="campaign-section-heading"><div><p className="card-kicker">OBSERVED CONTENT · {observedPosts.length} RECORDS</p><h3>Top-performing post evidence</h3><p>Ranked only from engagement counts that you captured. If no metrics were supplied, this is a catalog, not a performance ranking.</p></div></div>
        <div className="competitor-post-filters"><label>Platform<select value={postPlatformFilter} onChange={(event) => setPostPlatformFilter(event.target.value)}><option value="all">All platforms</option>{[...new Set(observedPosts.map((post) => post.platform))].map((platform) => <option key={platform}>{platform}</option>)}</select></label><label>Format<select value={postFormatFilter} onChange={(event) => setPostFormatFilter(event.target.value)}><option value="all">All formats</option>{[...new Set(observedPosts.map((post) => post.format.toLowerCase()))].map((format) => <option key={format}>{format}</option>)}</select></label><label>Topic contains<input value={postTopicFilter} onChange={(event) => setPostTopicFilter(event.target.value)} placeholder="Filter topic" /></label><label>Published since<input type="date" value={postDateFilter} onChange={(event) => setPostDateFilter(event.target.value)} /></label><label>Sort<select value={postSort} onChange={(event) => setPostSort(event.target.value as "engagement" | "date")}><option value="engagement">Captured engagement</option><option value="date">Published date</option></select></label></div>
        {!displayedPosts.length ? <p className="campaign-history-empty">No posts match this filter. Record public post URLs and optional engagement metrics in Evidence.</p> : <div className="competitor-observed-post-grid">{displayedPosts.map((post, index) => <article key={`${post.url}-${index}`}><div><span>{post.platform} · {post.format}</span><h4>{post.topic || "Topic not recorded"}</h4></div><p><strong>Hook:</strong> {post.hook || "Not recorded"}</p><p><strong>Caption:</strong> {post.captionApproach || "Not recorded"}</p><p><strong>CTA:</strong> {post.callToAction || "Not recorded"}</p><MetricGrid metrics={post.metrics} /><a href={post.url} target="_blank" rel="noreferrer">Open source post ↗</a></article>)}</div>}
      </section>}
    </section>
  );
}

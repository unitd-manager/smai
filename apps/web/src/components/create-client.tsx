"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Sparkles, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { renderDesignPageSvg, type DesignDocument } from "@united-technologies/shared/design-document";
import { platformSpecs } from "@united-technologies/shared/platform-specs";
import { apiBaseUrl, apiRequest } from "@/lib/api";
import { downloadDesign, downloadDesignPages, type DesignDownloadFormat } from "@/lib/download-design";
import { getDateTimeInputValue, getTimezoneLabel, localDateTimeToIso } from "@/lib/timezone";
import { SocialFeedPreview } from "@/components/social-feed-preview";
import { CompactSelect } from "@/components/compact-select";
import { CustomAiArtworkClient } from "@/components/custom-ai-artwork-client";

const formats = [
  ["post", "Social post"],
  ["carousel", "Carousel"],
  ["story", "Story"],
  ["poster", "Poster"],
  ["brochure", "Brochure"],
  ["flyer", "Flyer"],
  ["thumbnail", "Thumbnail"],
  ["linkedin-banner", "LinkedIn banner"],
  ["pinterest-pin", "Pinterest pin"],
  ["facebook-cover", "Facebook cover"],
  ["business-card", "Business card"],
  ["festival-greeting", "Festival greeting"],
] as const;
const platforms = Object.keys(platformSpecs);

type CreatedItem = {
  id: string;
  contentJson: {
    format: string;
    title: string;
    caption: string;
    hashtags: string[];
    idea?: string;
    pillar?: string;
    firstComment?: string;
    platformCaptions?: Array<{
      platform: string;
      caption: string;
      hashtags: string[];
      hook?: string;
      title?: string;
      description?: string;
      callToAction?: string;
      altText?: string;
      bestFormat?: string;
      formatReason?: string;
      imageRatio?: string;
      recommendedTemplate?: string;
      firstComment?: string;
    }>;
    posterText?: { headline: string; supportingLine: string; callToAction: string };
    slides?: Array<string | { headline: string; subheading?: string; body?: string }>;
    sections?: string[];
    scenes?: string[];
    importedMediaAssetId?: string;
    videoBrief?: {
      durationSeconds: number;
      visualStyle: string;
      narration: string;
      musicMood: string;
      imageDirection: string;
      onScreenText: boolean;
    };
    platforms: string[];
  };
  provider: string;
  designs: Array<{
    id: string;
    title: string;
    previewUrl: string | null;
    designJson: { document?: DesignDocument };
  }>;
};

type GenerationResponse = {
  provider: string;
  geminiConfigured: boolean;
  groqConfigured: boolean;
  openaiConfigured: boolean;
  configured: boolean;
  usage: { used: number; limit: number | null };
  items: CreatedItem[];
  designWarnings?: string[];
};

type TemplateChoice = { id: string; name: string; format: string };
type TemplateCopy = { headline: string; supportingLine: string; callToAction: string };
type SavedContentResponse = {
  item: {
    id: string;
    contentJson: Record<string, unknown>;
    provider: string;
  };
};

type PostResponse = {
  post: { id: string; status: string };
  demoMode: boolean;
};
type QualityIssue = { severity: "error" | "warning" | "tip"; code: string; platform?: string; message: string };
type QualityReport = { score: number; passed: boolean; issues: QualityIssue[] };
type CaptionOverrides = Record<string, string>;

type PreviewTarget = { itemId: string; pageIndex: number };
type PlatformCaption = NonNullable<CreatedItem["contentJson"]["platformCaptions"]>[number];
type PlatformCaptionField = Exclude<keyof PlatformCaption, "platform" | "hashtags">;

function captionOverrideKey(itemId: string, platform: string) {
  return `${itemId}:${platform}`;
}

function getReviewCaption(item: CreatedItem, platform: string) {
  return item.contentJson.platformCaptions?.find((preview) => preview.platform === platform)?.caption
    ?? item.contentJson.caption;
}

export function CreateClient() {
  const [idea, setIdea] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["post"]);
  const [carouselSlideCount, setCarouselSlideCount] = useState(6);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["Instagram", "LinkedIn"]);
  const [tone, setTone] = useState("Warm and confident");
  const [language, setLanguage] = useState("English");
  const [results, setResults] = useState<CreatedItem[]>([]);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const [configurationError, setConfigurationError] = useState("");
  const [usage, setUsage] = useState<GenerationResponse["usage"] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeDesign, setActiveDesign] = useState<Record<string, number>>({});
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateCopy, setTemplateCopy] = useState<TemplateCopy | null>(null);
  const [useBrandTemplate, setUseBrandTemplate] = useState(false);
  const [scheduleAt, setScheduleAt] = useState<Record<string, string>>({});
  const [timezone, setTimezone] = useState("UTC");
  const [captionOverrides, setCaptionOverrides] = useState<CaptionOverrides>({});
  const [postingId, setPostingId] = useState("");
  const [regeneratingPlatform, setRegeneratingPlatform] = useState("");
  const [checkingQuality, setCheckingQuality] = useState("");
  const [qualityReports, setQualityReports] = useState<Record<string, QualityReport>>({});
  const [qualityOverrideReasons, setQualityOverrideReasons] = useState<Record<string, string>>({});
  const [savingContentSet, setSavingContentSet] = useState("");
  const [calendarDate, setCalendarDate] = useState("");
  const [templates, setTemplates] = useState<TemplateChoice[]>([]);
  const [templateLoadError, setTemplateLoadError] = useState("");
  const [previewTarget, setPreviewTarget] = useState<PreviewTarget | null>(null);
  const [downloadMenuId, setDownloadMenuId] = useState("");

  const previewItem = previewTarget ? results.find((item) => item.id === previewTarget.itemId) : undefined;
  const previewDesign = previewItem?.designs[activeDesign[previewItem.id] ?? 0];
  const previewDocument = previewDesign?.designJson.document;
  const previewPageIndex = previewDocument ? Math.min(previewTarget?.pageIndex ?? 0, previewDocument.pages.length - 1) : 0;
  const previewPage = previewDocument?.pages[previewPageIndex];

  useEffect(() => {
    apiRequest<{ configured: boolean }>("/api/content/configuration")
      .then(({ configured }) => {
        setGeminiConfigured(configured);
        setConfigurationError("");
      })
      .catch((requestError: unknown) => {
        setGeminiConfigured(false);
        setConfigurationError(requestError instanceof Error ? requestError.message : "Could not check Gemini configuration.");
      })
      .finally(() => setConfigurationLoaded(true));
  }, []);

  useEffect(() => {
    apiRequest<{ brand: { timezone: string } }>("/api/brand-profile")
      .then(({ brand }) => setTimezone(brand.timezone))
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Could not load the publishing time zone.");
      });
  }, []);

  useEffect(() => {
    if (!previewTarget) return;
    function handlePreviewKeys(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewTarget(null);
      if (event.key === "ArrowLeft" && previewDocument) {
        setPreviewTarget((current) => current && ({ ...current, pageIndex: Math.max(0, current.pageIndex - 1) }));
      }
      if (event.key === "ArrowRight" && previewDocument) {
        setPreviewTarget((current) => current && ({ ...current, pageIndex: Math.min(previewDocument.pages.length - 1, current.pageIndex + 1) }));
      }
    }
    window.addEventListener("keydown", handlePreviewKeys);
    return () => window.removeEventListener("keydown", handlePreviewKeys);
  }, [previewDocument, previewTarget]);

  async function downloadCreatedDesign(item: CreatedItem, format: DesignDownloadFormat) {
    setDownloadMenuId("");
    const design = item.designs[activeDesign[item.id] ?? 0];
    const document = design?.designJson.document;
    if (document) {
      await downloadDesign(renderDesignPageSvg(document, previewTarget?.itemId === item.id ? previewPageIndex : 0), item.contentJson.title, format);
      return;
    }
    if (design?.previewUrl) {
      await downloadDesign(design.previewUrl, item.contentJson.title, format);
      return;
    }
    throw new Error("No design preview is available to download.");
  }

  async function downloadCreatedDesignPages(item: CreatedItem) {
    setDownloadMenuId("");
    const document = item.designs[activeDesign[item.id] ?? 0]?.designJson.document;
    if (!document) throw new Error("No design preview is available to export.");
    await downloadDesignPages(document, item.contentJson.title);
  }

  function downloadVideoScript(item: CreatedItem) {
    setDownloadMenuId("");
    const content = item.contentJson;
    const script = [
      content.title,
      "",
      content.caption,
      "",
      ...(content.scenes ?? []).map((scene, index) => `Scene ${index + 1}\n${scene}`),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([script], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${content.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const competitorIdea = new URLSearchParams(window.location.search).get("idea");
        if (competitorIdea) setIdea(competitorIdea);
        const requestedDate = new URLSearchParams(window.location.search).get("date");
        if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
          setCalendarDate(`${requestedDate}T09:00`);
        }
        const importedContentId = new URLSearchParams(window.location.search).get("importedContentId");
        if (importedContentId) {
          void apiRequest<SavedContentResponse>(`/api/content/${encodeURIComponent(importedContentId)}`)
            .then(({ item }) => {
              const { format, title, caption, importedMediaAssetId } = item.contentJson;
              if (typeof format !== "string" || typeof title !== "string" || typeof caption !== "string" ||
                typeof importedMediaAssetId !== "string") {
                throw new Error("This saved item is not an imported image or video.");
              }
              const hashtags = Array.isArray(item.contentJson.hashtags)
                ? item.contentJson.hashtags.filter((tag): tag is string => typeof tag === "string")
                : [];
              const itemPlatforms = Array.isArray(item.contentJson.platforms)
                ? item.contentJson.platforms.filter((platform): platform is string => typeof platform === "string")
                : ["Instagram"];
              const importedItem: CreatedItem = {
                id: item.id,
                provider: item.provider,
                designs: [],
                contentJson: {
                  format,
                  title,
                  caption,
                  hashtags,
                  platforms: itemPlatforms.length ? itemPlatforms : ["Instagram"],
                  importedMediaAssetId,
                },
              };
              setResults([importedItem]);
              setSelectedFormats([format]);
              setSelectedPlatforms(importedItem.contentJson.platforms);
              setNotice("Imported media is ready. Add a caption if needed, choose a time, then schedule or publish it.");
            })
            .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load the imported file."));
        }
        const stored = window.localStorage.getItem("united-technologies.selected-template");
        if (stored) {
          const selected = JSON.parse(stored) as { id?: unknown; format?: unknown; name?: unknown; idea?: unknown; templateCopy?: Partial<TemplateCopy> };
          const selectedFormat = selected.format === "video" ? "thumbnail" : selected.format;
          if (typeof selected.id !== "string" || typeof selectedFormat !== "string" ||
            !formats.some(([value]) => value === selectedFormat)) {
            throw new Error("The selected template is not available for content creation.");
          }
          setTemplateId(selected.id);
          setTemplateName(typeof selected.name === "string" ? selected.name : "Selected template");
          if (selected.templateCopy && [selected.templateCopy.headline, selected.templateCopy.supportingLine, selected.templateCopy.callToAction].every((value) => typeof value === "string")) {
            setTemplateCopy(selected.templateCopy as TemplateCopy);
          }
          setSelectedFormats([selectedFormat]);
          if (typeof selected.idea === "string") setIdea(selected.idea);
          setNotice(`Using the ${typeof selected.name === "string" ? selected.name : "selected"} template.`);
          window.localStorage.removeItem("united-technologies.selected-template");
        }
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Could not load the selected template.");
        try {
          window.localStorage.removeItem("united-technologies.selected-template");
        } catch {
          setError("Browser storage is unavailable. Re-select the template and try again.");
        }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    apiRequest<{ templates: TemplateChoice[] }>("/api/templates")
      .then(({ templates: availableTemplates }) => setTemplates(availableTemplates))
      .catch((requestError: unknown) => setTemplateLoadError(requestError instanceof Error ? requestError.message : "Could not load templates."));
  }, []);

  function toggleValue(value: string, values: string[], update: (next: string[]) => void) {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  function clearQualityReport(itemId: string) {
    setQualityReports((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
  }

  async function generate(event?: FormEvent<HTMLFormElement>, onlyFormat?: string, refineText?: string) {
    event?.preventDefault();
    setError("");
    setNotice("");
    setGenerating(true);
    try {
      const requestIdea = refineText ? [idea, refineText].filter(Boolean).join(" — ") : idea;
      const response = await apiRequest<GenerationResponse>("/api/content/generate", {
        method: "POST",
        body: JSON.stringify({
          idea: requestIdea,
          formats: onlyFormat ? [onlyFormat] : selectedFormats,
          ...((onlyFormat === "carousel" || (!onlyFormat && selectedFormats.includes("carousel")))
            ? { carouselSlideCount }
            : {}),
          ...(templateId ? { templateId } : {}),
          ...(templateCopy ? { templateCopy } : {}),
          useBrandTemplate,
          platforms: selectedPlatforms,
          tone,
          language,
        }),
      });
      setResults((current) => [...response.items, ...current]);
      if (calendarDate) {
        setScheduleAt((current) => ({
          ...current,
          ...Object.fromEntries(response.items.map((item) => [item.id, current[item.id] ?? calendarDate])),
        }));
      }
      setGeminiConfigured(response.configured);
      setUsage(response.usage);
      const warningNote = response.designWarnings?.length ? ` Layout note: ${response.designWarnings[0]}` : "";
      setNotice(`${response.items.length} draft${response.items.length === 1 ? " is" : "s are"} ready for your review, generated with ${response.provider} and rendered with the built-in vector templates. Nothing is scheduled or published until you choose an action.${warningNote}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create content.");
    } finally {
      setGenerating(false);
    }
  }

  async function createPost(item: CreatedItem, scheduled: boolean) {
    setError("");
    setNotice("");
    if (scheduled && !scheduleAt[item.id]) {
      setError("Choose a date and time before scheduling this post.");
      return;
    }
    const when = scheduled ? localDateTimeToIso(scheduleAt[item.id]!, timezone) : undefined;
    if (scheduled && !when) {
      setError("That local time is invalid or does not exist in this time zone. Choose another time.");
      return;
    }
    if (when && new Date(when) <= new Date()) {
      setError("Choose a future date and time.");
      return;
    }
    setPostingId(item.id);
    try {
      const qualityResponse = await apiRequest<{ quality: QualityReport }>("/api/posts/quality-check", {
        method: "POST",
        body: JSON.stringify({
          platforms: item.contentJson.platforms,
          captions: Object.fromEntries(item.contentJson.platforms.map((platform) => [
            platform,
            captionOverrides[captionOverrideKey(item.id, platform)] ?? getReviewCaption(item, platform),
          ])),
        }),
      });
      setQualityReports((current) => ({ ...current, [item.id]: qualityResponse.quality }));
      const overrideReason = qualityOverrideReasons[item.id]?.trim() ?? "";
      if (!qualityResponse.quality.passed && overrideReason.length < 10) {
        setError("Resolve the post quality errors or enter a reason to continue with an override.");
        return;
      }
      const response = await apiRequest<PostResponse>("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          contentId: item.id,
          designId: item.designs[activeDesign[item.id] ?? 0]?.id,
          ...(item.contentJson.importedMediaAssetId ? { mediaAssetId: item.contentJson.importedMediaAssetId } : {}),
          captionOverrides: Object.fromEntries(item.contentJson.platforms.map((platform) => [
            platform,
            captionOverrides[captionOverrideKey(item.id, platform)] ?? getReviewCaption(item, platform),
          ])),
          ...(overrideReason.length >= 10 ? { qualityOverrideReason: overrideReason } : {}),
          platforms: item.contentJson.platforms,
          ...(when ? { scheduledAt: when } : {}),
          timezone,
        }),
      });
      setNotice(scheduled
        ? `Post scheduled. Track it in Posts and Queue.`
        : response.demoMode
          ? `Demo only — this was not sent to a social platform. Simulated status: ${response.post.status.toLowerCase().replaceAll("_", " ")}.`
          : `Post created: ${response.post.status.toLowerCase().replaceAll("_", " ")}. Track it in Posts and Queue.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create this post.");
    } finally {
      setPostingId("");
    }
  }

  async function checkQuality(item: CreatedItem) {
    setError("");
    setCheckingQuality(item.id);
    try {
      const response = await apiRequest<{ quality: QualityReport }>("/api/posts/quality-check", {
        method: "POST",
        body: JSON.stringify({
          platforms: item.contentJson.platforms,
          captions: Object.fromEntries(item.contentJson.platforms.map((platform) => [
            platform,
            captionOverrides[captionOverrideKey(item.id, platform)] ?? getReviewCaption(item, platform),
          ])),
        }),
      });
      setQualityReports((current) => ({ ...current, [item.id]: response.quality }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not check this content.");
    } finally {
      setCheckingQuality("");
    }
  }

  async function savePostDraft(item: CreatedItem) {
    setError("");
    setNotice("");
    setPostingId(item.id);
    try {
      await apiRequest<PostResponse>("/api/posts/drafts", {
        method: "POST",
        body: JSON.stringify({
          contentId: item.id,
          designId: item.designs[activeDesign[item.id] ?? 0]?.id,
          platforms: item.contentJson.platforms,
          captionOverrides: Object.fromEntries(item.contentJson.platforms.map((platform) => [
            platform,
            captionOverrides[captionOverrideKey(item.id, platform)] ?? getReviewCaption(item, platform),
          ])),
        }),
      });
      setNotice(`Saved as a draft in Posts. Nothing was scheduled or published.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this content as a Posts draft.");
    } finally {
      setPostingId("");
    }
  }

  function updatePlatformField(itemId: string, platform: string, field: PlatformCaptionField, value: string) {
    setResults((current) => current.map((item) => {
      if (item.id !== itemId) return item;
      const currentCaptions = item.contentJson.platformCaptions ?? [];
      const existing = currentCaptions.find((entry) => entry.platform === platform);
      if (!existing) return item;
      return {
        ...item,
        contentJson: {
          ...item.contentJson,
          platformCaptions: currentCaptions.map((entry) => entry.platform === platform
            ? { ...entry, [field]: value }
            : entry),
        },
      };
    }));
  }

  async function saveContentSet() {
    setError("");
    setNotice("");
    setSavingContentSet("current");
    try {
      const response = await apiRequest<{ set: { id: string; name: string } }>("/api/content-sets", {
        method: "POST",
        body: JSON.stringify({
          name: idea.trim().split(/\r?\n/)[0]?.slice(0, 120) || "Social content set",
          brief: idea.trim() || "Reviewed multi-format content set",
          platforms: [...new Set(results.flatMap((item) => item.contentJson.platforms))],
          items: results.map((item) => ({
            contentId: item.id,
            platformCaptions: item.contentJson.platforms.map((platform) => {
              const saved = item.contentJson.platformCaptions?.find((entry) => entry.platform === platform);
              return {
                ...(saved ?? { platform, hashtags: [] }),
                platform,
                caption: captionOverrides[captionOverrideKey(item.id, platform)] ?? saved?.caption ?? item.contentJson.caption,
              };
            }),
          })),
        }),
      });
      setNotice(`Saved "${response.set.name}" as a Content Set. You can reopen it from the Content Sets page.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this content set.");
    } finally {
      setSavingContentSet("");
    }
  }

  async function regeneratePlatform(item: CreatedItem, platform: string) {
    const key = captionOverrideKey(item.id, platform);
    setError("");
    setNotice("");
    setRegeneratingPlatform(key);
    try {
      const response = await apiRequest<{
        provider: string;
        geminiConfigured: boolean;
        groqConfigured: boolean;
        openaiConfigured: boolean;
        configured: boolean;
        platformCaption: { platform: string; caption: string; hashtags: string[] };
        usage: GenerationResponse["usage"];
      }>(`/api/content/${encodeURIComponent(item.id)}/regenerate-platform`, {
        method: "POST",
        body: JSON.stringify({ platform }),
      });
      setUsage(response.usage);
      setResults((current) => current.map((result) => result.id !== item.id ? result : ({
        ...result,
        contentJson: {
          ...result.contentJson,
          platformCaptions: [
            ...(result.contentJson.platformCaptions ?? []).filter((entry) => entry.platform !== platform),
            response.platformCaption,
          ],
        },
      })));
      setCaptionOverrides((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      clearQualityReport(item.id);
      setNotice(`${platform} copy regenerated with ${response.provider}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Could not regenerate ${platform} copy.`);
    } finally {
      setRegeneratingPlatform("");
    }
  }

  function surpriseMe() {
    const prompts = [
      "Share a small behind-the-scenes moment",
      "Introduce a customer favorite",
      "Offer one useful tip from our team",
      "Celebrate the people in our community",
    ];
    setIdea(prompts[Math.floor(Math.random() * prompts.length)] ?? prompts[0]);
  }

  return (
    <section className="dashboard-content create-page">
      <header className="create-page-heading">
        <div><p className="eyebrow">Create studio</p><h1>Create content</h1><p className="dashboard-lead">Turn a brief into platform-ready posts, designs, and campaign artwork.</p></div>
        <span className="create-page-step"><span>01</span> Brief <i /> <span>02</span> Review <i /> <span>03</span> Publish</span>
      </header>
      <details className="create-artwork-disclosure">
        <summary><span><strong>Custom AI artwork</strong><small>Generate an original visual from a prompt or reference image</small></span><span className="create-artwork-disclosure-action">Open artwork studio</span></summary>
        <CustomAiArtworkClient />
      </details>
      {configurationLoaded && !geminiConfigured && <div className="notice notice-error" role="alert">{configurationError || <>AI generation is unavailable. Add <code>GOOGLE_AI_STUDIO_API_KEY</code>, <code>GROQ_API_KEY</code>, or <code>OPENAI_API_KEY</code> to <code>apps/api/.env</code>, then restart the API.</>}</div>}
      <form className="create-form" onSubmit={(event) => generate(event)}>
        <div className="create-idea-field create-brief-section">
          <div className="create-idea-heading">
            <label htmlFor="create-content-idea"><span className="create-step-number">01</span><span><strong>Your brief</strong><small>Describe the idea, audience, and key message</small></span></label>
            <button type="button" className="text-button surprise-button" onClick={surpriseMe}><Sparkles size={16} aria-hidden="true" /> <span>Surprise me</span></button>
          </div>
          <textarea id="create-content-idea" value={idea} onChange={(event) => setIdea(event.target.value)} placeholder="Share your topic, audience, key points, or existing copy. The chosen format and template shape the result." rows={4} />
        </div>
        <div className="create-configuration-grid">
        <section className="create-config-card" aria-labelledby="create-design-options-title">
          <h2 id="create-design-options-title"><span className="create-step-number">02</span><span><strong>Format and design</strong><small>Choose how your content should look</small></span></h2>
        <fieldset className="create-fieldset">
          <legend>Content format</legend>
          <div className="create-option-grid">
            {formats.map(([value, label]) => <label className="create-check" key={value}><input type="radio" name="content-format" checked={selectedFormats[0] === value} onChange={() => setSelectedFormats([value])} />{label}</label>)}
          </div>
        </fieldset>
        {selectedFormats.includes("carousel") && (
          <label className="create-template-select">Carousel slides
            <CompactSelect aria-label="Carousel slides" value={carouselSlideCount} onChange={(event) => setCarouselSlideCount(Number(event.target.value))}>
              {Array.from({ length: 9 }, (_value, index) => index + 2).map((count) => (
                <option value={count} key={count}>{count} slides</option>
              ))}
            </CompactSelect>
            <small>Each slide is designed with a headline, supporting line, and body copy.</small>
          </label>
        )}
        <label className="create-template-select">Design template
          <CompactSelect
            aria-label="Design template"
            value={templateId}
            onChange={(event) => {
              const selected = templates.find((template) => template.id === event.target.value);
              setTemplateId(selected?.id ?? "");
              setTemplateName(selected?.name ?? "");
              if (selected) setSelectedFormats([selected.format]);
            }}
          >
            <option value="">Use a flexible layout</option>
            {templates.filter((template) => selectedFormats.includes(template.format) || template.format === "video" && selectedFormats.includes("thumbnail")).map((template) => (
              <option value={template.id} key={template.id}>{template.name} · {template.format.replaceAll("-", " ")}</option>
            ))}
          </CompactSelect>
          <small>{templateLoadError || (templateId ? `Using “${templateName}” from your in-app template library.` : "Choose a built-in design for this format, or leave it empty to generate three layout options. Designs stay crisp and editable in the app.")}</small>
        </label>
        {!templateId && <label className="create-check"><input type="checkbox" checked={useBrandTemplate} onChange={(event) => setUseBrandTemplate(event.target.checked)} /> Use my preferred Brand Kit template</label>}
        </section>
        <section className="create-config-card" aria-labelledby="create-channel-options-title">
          <h2 id="create-channel-options-title"><span className="create-step-number">03</span><span><strong>Channels and voice</strong><small>Tailor copy for each selected platform</small></span></h2>
        <fieldset className="create-fieldset">
          <legend>Publish to</legend>
          <div className="create-option-grid create-platform-grid">
            {platforms.map((platform) => <label className="create-check" key={platform}><input type="checkbox" checked={selectedPlatforms.includes(platform)} onChange={() => toggleValue(platform, selectedPlatforms, setSelectedPlatforms)} />{platform}</label>)}
          </div>
        </fieldset>
        <div className="create-select-grid">
          <label>Tone
            <CompactSelect aria-label="Tone" value={tone} onChange={(event) => setTone(event.target.value)}>
              {["Warm and confident", "Playful", "Premium", "Helpful", "Bold", "Professional"].map((item) => <option key={item}>{item}</option>)}
            </CompactSelect>
          </label>
          <label>Language
            <CompactSelect aria-label="Language" value={language} onChange={(event) => setLanguage(event.target.value)}>
              {["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu"].map((item) => <option key={item}>{item}</option>)}
            </CompactSelect>
          </label>
        </div>
        </section>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {error && <button className="button button-outline" type="button" disabled={generating} onClick={() => void generate()}>Retry generation</button>}
        {notice && <p className="form-success" role="status">{notice}{notice.includes("Posts and Queue") && <> <Link href="/dashboard/posts">Open queue</Link></>}</p>}
        {templateName && <p className="template-selected">Selected template: {templateName}</p>}
        <div className="create-submit-row">
          <button type="submit" className="button button-gold" disabled={generating || selectedFormats.length === 0 || selectedPlatforms.length === 0}>
            {generating ? "Creating your content…" : "Generate drafts to review"}
          </button>
          <span className="create-submit-context">Your draft is saved for review. Nothing publishes automatically.</span>
          {usage && <span className="create-usage">{usage.limit === null ? `${usage.used} generations used this month · Unlimited during trial` : `${usage.used} of ${usage.limit} generations used this month`}</span>}
        </div>
      </form>

      {generating && <div className="generation-progress" role="status"><span />Shaping your brief into content and design options…</div>}
      {results.length > 0 && (
        <section className="created-results" aria-label="Generated content">
          <div className="created-results-heading"><div><p className="create-results-kicker">Generated content</p><h2>Review your drafts</h2><p>Refine each platform version, check quality, then choose when to publish.</p></div><div><button type="button" disabled={Boolean(savingContentSet) || Boolean(postingId)} onClick={() => void saveContentSet()}>{savingContentSet ? "Saving set…" : "Save as Content Set"}</button> <Link href="/dashboard/content">View content library →</Link></div></div>
          <div className="created-grid">
            {results.map((item) => {
              const content = item.contentJson;
              const designIndex = activeDesign[item.id] ?? 0;
              const design = item.designs[designIndex];
              const designDocument = design?.designJson.document;
              const platformCaptions = Object.fromEntries(content.platforms.map((platform) => [
                platform,
                captionOverrides[captionOverrideKey(item.id, platform)] ?? getReviewCaption(item, platform),
              ]));
              const feedPreviewImage = designDocument
                ? renderDesignPageSvg(designDocument, 0)
                : design?.previewUrl ?? null;
              const designPageCount = designDocument?.pages.length ?? 1;
              return (
                <article className="created-card create-review-card" key={item.id}>
                  <div className="created-preview-wrap">
                    {designDocument ? (
                      <button type="button" className="created-preview-trigger" onClick={() => setPreviewTarget({ itemId: item.id, pageIndex: 0 })} aria-label={`Open ${content.title} preview`}>
                        <Image className="created-preview" src={renderDesignPageSvg(designDocument, 0)} alt={`${content.title} preview`} width={designDocument.pages[0]?.width ?? 600} height={designDocument.pages[0]?.height ?? 600} unoptimized />
                      </button>
                    ) : design?.previewUrl ? (
                      <button type="button" className="created-preview-trigger" onClick={() => setPreviewTarget({ itemId: item.id, pageIndex: 0 })} aria-label={`Open ${content.title} preview`}>
                        <Image className="created-preview" src={design.previewUrl} alt={`${content.title} preview`} width={600} height={600} unoptimized />
                      </button>
                    ) : content.importedMediaAssetId ? (
                      content.format === "video" ? (
                        <video className="created-preview" src={`${apiBaseUrl}/api/media/uploads/${encodeURIComponent(content.importedMediaAssetId)}/file`} crossOrigin="use-credentials" controls />
                      ) : (
                        <Image className="created-preview" src={`${apiBaseUrl}/api/media/uploads/${encodeURIComponent(content.importedMediaAssetId)}/file`} width={600} height={450} unoptimized crossOrigin="use-credentials" alt={content.title} />
                      )
                    ) : <div className="created-preview-empty">Preview unavailable</div>}
                    <span className="created-format-badge">{content.format}</span>
                  </div>
                  <SocialFeedPreview platforms={content.platforms} title={content.title} imageSrc={feedPreviewImage} captions={platformCaptions} />
                  <div className="created-card-body">
                    <div className="created-card-title"><h3>{content.title}</h3></div>
                    <div className="created-platforms" aria-label="Posting platforms">{content.platforms.map((platform) => <span key={platform}>{platform}</span>)}</div>
                    <div className="platform-content-set">
                      <h4>Platform-specific copy</h4>
                      <p>Edit each version independently. These versions are saved to the corresponding post targets.</p>
                      {content.platforms.map((platform) => {
                        const spec = platformSpecs[platform as keyof typeof platformSpecs];
                        const key = captionOverrideKey(item.id, platform);
                        const caption = captionOverrides[key] ?? getReviewCaption(item, platform);
                        const platformVariant = content.platformCaptions?.find((entry) => entry.platform === platform);
                        const maxLength = spec && "captionCharacters" in spec ? spec.captionCharacters : 63_206;
                        const hashtagCount = (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;
                        return (
                          <div className="platform-caption-field" key={platform}>
                            <label className="refine-input">
                              <span>{platform} · {caption.length}/{maxLength} characters · {hashtagCount} hashtags{spec ? ` / ${spec.hashtags} suggested` : ""}</span>
                              <textarea
                                maxLength={maxLength}
                                value={caption}
                                onChange={(event) => {
                                  setCaptionOverrides((current) => ({ ...current, [key]: event.target.value }));
                                  clearQualityReport(item.id);
                                }}
                                placeholder={`Write a ${platform} caption`}
                              />
                            </label>
                            {([
                              ["hook", "Hook"],
                              ["title", "Platform title"],
                              ["description", "Description"],
                              ["callToAction", "Call to action"],
                              ["altText", "Alt text"],
                              ["bestFormat", "Best format"],
                              ["formatReason", "Format reason"],
                              ["imageRatio", "Image ratio"],
                              ["recommendedTemplate", "Recommended template"],
                              ["firstComment", "First comment"],
                            ] as const).map(([field, label]) => {
                              const value = platformVariant?.[field] ?? "";
                              return (
                                <label className="refine-input" key={field}>{label}
                                  <textarea
                                    rows={field === "description" || field === "formatReason" || field === "altText" ? 3 : 2}
                                    value={value}
                                    onChange={(event) => updatePlatformField(item.id, platform, field, event.target.value)}
                                  />
                                </label>
                              );
                            })}
                            {spec && <small>Recommended formats: {spec.formats.join(", ")} · Ratio guidance: {spec.imageRatios.join(", ")}</small>}
                            <button
                              type="button"
                              disabled={regeneratingPlatform === key || generating || Boolean(postingId)}
                              onClick={() => void regeneratePlatform(item, platform)}
                            >
                              {regeneratingPlatform === key ? "Regenerating…" : `Regenerate ${platform} copy`}
                            </button>
                          </div>
                        );
                      })}
                      <button type="button" disabled={checkingQuality === item.id || Boolean(postingId)} onClick={() => void checkQuality(item)}>
                        {checkingQuality === item.id ? "Checking…" : "Check post quality"}
                      </button>
                      {qualityReports[item.id] && (
                        <div className="post-quality-report" role="status">
                          <strong>{qualityReports[item.id].score}/100 · {qualityReports[item.id].passed ? "Ready with suggestions" : "Needs attention"}</strong>
                          {qualityReports[item.id].issues.length > 0
                            ? <ul>{qualityReports[item.id].issues.map((issue, index) => <li key={`${issue.code}-${issue.platform ?? "post"}-${index}`} data-severity={issue.severity}>{issue.message}</li>)}</ul>
                            : <p>No issues found.</p>}
                          {!qualityReports[item.id].passed && (
                            <label className="refine-input">Override reason (recorded in the audit log)
                              <textarea value={qualityOverrideReasons[item.id] ?? ""} onChange={(event) => setQualityOverrideReasons((current) => ({ ...current, [item.id]: event.target.value }))} rows={2} placeholder="Explain why you want to proceed despite the errors" />
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                    {item.designs.length > 1 && <div className="design-options" aria-label="Design options">
                      {item.designs.map((option, index) => (
                        <button
                          type="button"
                          className={designIndex === index ? "design-option is-active" : "design-option"}
                          key={option.id}
                          aria-label={`Show design option ${index + 1}: ${option.title}`}
                          aria-pressed={designIndex === index}
                          onClick={() => setActiveDesign((current) => ({ ...current, [item.id]: index }))}
                        >
                          {option.previewUrl && <Image src={option.previewUrl} alt="" width={50} height={50} unoptimized />}
                          <span>{option.title.split("·").at(-1)?.trim() ?? `Option ${index + 1}`}</span>
                        </button>
                      ))}
                    </div>}
                    <label className="refine-input">Schedule for
                      <input type="datetime-local" min={getDateTimeInputValue(new Date(), timezone)} value={scheduleAt[item.id] ?? ""} onChange={(event) => setScheduleAt((current) => ({ ...current, [item.id]: event.target.value }))} />
                      <small>Time shown in {getTimezoneLabel(timezone)}. Change it in <Link href="/dashboard/settings/publishing">Publishing settings</Link>.</small>
                    </label>
                    <div className="created-primary-actions">
                      <button type="button" disabled={postingId === item.id} onClick={() => void savePostDraft(item)}>Save as Posts draft</button>
                      <button type="button" disabled={postingId === item.id} onClick={() => void createPost(item, true)}>Schedule post</button>
                      <button type="button" disabled={postingId === item.id} onClick={() => void createPost(item, false)}>Post now</button>
                      <div className="created-download">
                        <button type="button" className="created-download-trigger" aria-expanded={downloadMenuId === item.id} onClick={() => setDownloadMenuId((current) => current === item.id ? "" : item.id)}>Download</button>
                        {downloadMenuId === item.id && <div className="created-download-menu" role="group" aria-label="Download format">
                          <button type="button" onClick={() => void downloadCreatedDesign(item, "png").catch((downloadError: unknown) => setError(downloadError instanceof Error ? downloadError.message : "Could not download PNG."))}>PNG image</button>
                          <button type="button" onClick={() => void downloadCreatedDesign(item, "jpg").catch((downloadError: unknown) => setError(downloadError instanceof Error ? downloadError.message : "Could not download JPEG."))}>JPEG image</button>
                          {designDocument && !["carousel", "video"].includes(content.format) && <button type="button" onClick={() => void downloadCreatedDesign(item, "svg").catch((downloadError: unknown) => setError(downloadError instanceof Error ? downloadError.message : "Could not download SVG."))}>SVG file</button>}
                          {content.format !== "carousel" && ["brochure", "flyer", "poster", "business-card"].includes(content.format) && <button type="button" onClick={() => void (designPageCount > 1 ? downloadCreatedDesignPages(item) : downloadCreatedDesign(item, "pdf")).catch((downloadError: unknown) => setError(downloadError instanceof Error ? downloadError.message : "Could not export PDF."))}>{designPageCount > 1 ? "PDF · all pages" : "Print / save as PDF"}</button>}
                          {content.format === "video" && <>
                            <button type="button" onClick={() => downloadVideoScript(item)}>Video script · TXT</button>
                            <Link href="/dashboard/videos">Render MP4 in Video Studio</Link>
                          </>}
                        </div>}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {previewTarget && previewItem && (previewDocument || previewDesign?.previewUrl) && (
        <div className="design-lightbox-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewTarget(null); }}>
          <section className="design-lightbox" role="dialog" aria-modal="true" aria-label={`${previewItem.contentJson.title} preview`}>
            <header><div><h2>{previewItem.contentJson.title}</h2><p>{previewDocument ? `Page ${previewPageIndex + 1} of ${previewDocument.pages.length}` : "Design preview"}</p></div><button type="button" aria-label="Close preview" onClick={() => setPreviewTarget(null)}><X size={22} /></button></header>
            <div className="design-lightbox-stage">
              {previewDocument && previewDocument.pages.length > 1 && <button type="button" className="design-lightbox-arrow is-previous" aria-label="Previous page" disabled={previewPageIndex === 0} onClick={() => setPreviewTarget((current) => current && ({ ...current, pageIndex: Math.max(0, current.pageIndex - 1) }))}><ChevronLeft size={28} /></button>}
              <div className="design-lightbox-image" style={previewPage ? { aspectRatio: `${previewPage.width} / ${previewPage.height}` } : undefined}>
                {previewDocument
                  ? <Image src={renderDesignPageSvg(previewDocument, previewPageIndex)} alt={`${previewItem.contentJson.title}, page ${previewPageIndex + 1}`} width={previewPage?.width ?? 600} height={previewPage?.height ?? 600} unoptimized />
                  : previewDesign?.previewUrl && <Image src={previewDesign.previewUrl} alt={`${previewItem.contentJson.title} preview`} width={1000} height={1000} unoptimized />}
              </div>
              {previewDocument && previewDocument.pages.length > 1 && <button type="button" className="design-lightbox-arrow is-next" aria-label="Next page" disabled={previewPageIndex === previewDocument.pages.length - 1} onClick={() => setPreviewTarget((current) => current && ({ ...current, pageIndex: Math.min(previewDocument.pages.length - 1, current.pageIndex + 1) }))}><ChevronRight size={28} /></button>}
            </div>
            {previewDocument && previewDocument.pages.length > 1 && <nav className="design-lightbox-pages" aria-label="Carousel pages">{previewDocument.pages.map((page, index) => <button type="button" key={page.id} aria-current={index === previewPageIndex ? "page" : undefined} onClick={() => setPreviewTarget((current) => current && ({ ...current, pageIndex: index }))}>{index + 1}</button>)}</nav>}
            <footer>
              {previewItem.contentJson.platforms.map((platform) => <span key={platform}>{platform}</span>)}
              <button type="button" onClick={() => void downloadCreatedDesign(previewItem, "png").catch((downloadError: unknown) => setError(downloadError instanceof Error ? downloadError.message : "Could not download PNG."))}>Download this page</button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}

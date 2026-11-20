"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Search, Sparkles } from "lucide-react";
import { createDesignDocument, renderDesignPageSvg } from "@united-technologies/shared/design-document";
import { ApiError, apiRequest } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";

const aiDesignFormats = [
  ["flyer", "Flyer"], ["brochure", "Brochure"], ["poster", "Poster"], ["post", "Social post"],
  ["story", "Story"], ["carousel", "Carousel cover"], ["pinterest-pin", "Pinterest pin"],
  ["thumbnail", "Video thumbnail"], ["linkedin-banner", "LinkedIn banner"], ["facebook-cover", "Facebook cover"],
  ["business-card", "Business card"], ["festival-greeting", "Festival greeting"], ["offer-sale", "Offer or sale"],
] as const;
const aiDesignLayouts = [
  ["editorial", "Editorial"], ["split", "Split image"], ["bold", "Bold campaign"],
  ["collage", "Image collage"], ["framed", "Framed photo"], ["magazine", "Magazine cover"],
  ["type-led", "Typography first"], ["triptych", "Three-panel story"], ["spotlight", "Spotlight portrait"],
  ["grid", "Grid layout"], ["sparkle", "Bright accents"], ["radiant", "Radial campaign"],
] as const;

type GeneratedAiDesign = { id: string; contentId: string; title: string; format: string; previewUrl: string };
type ArtworkError = { message: string; quotaProvider: "groq" | "gemini" | null };

async function prepareDesignReference(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a JPEG, PNG, or WebP reference image.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Reference images must be smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the reference image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not prepare the reference image.")), "image/jpeg", 0.82));
  if (blob.size > 2_000_000) throw new Error("This reference image is too large. Choose a smaller image.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1] ?? "") : reject(new Error("Could not read the reference image."));
    reader.onerror = () => reject(new Error("Could not read the reference image."));
    reader.readAsDataURL(blob);
  });
  return { mimeType: "image/jpeg", data };
}

type Template = {
  id: string;
  name: string;
  format: string;
  language: string;
  workspaceId: string | null;
  templateJson: Record<string, unknown>;
};

const templateCollections = [
  { id: "social", name: "Social media", description: "On-brand designs for feeds, stories, and multi-slide posts.", formats: ["post", "story", "carousel", "pinterest-pin"] },
  { id: "video", name: "Video thumbnails & covers", description: "Cover artwork to introduce a video or product walkthrough.", formats: ["thumbnail", "video"] },
  { id: "business", name: "Business", description: "Professional layouts for your team, profile, and company.", formats: ["linkedin-banner", "facebook-cover", "business-card"] },
  { id: "print", name: "Print & campaigns", description: "Flexible starting points for promotions, events, and print.", formats: ["poster", "brochure", "flyer", "festival-greeting", "offer-sale"] },
] as const;

function templateCategory(template: Template) {
  return typeof template.templateJson.category === "string" ? template.templateJson.category : "Other";
}

function templateLayout(template: Template) {
  return typeof template.templateJson.layout === "string" ? template.templateJson.layout : "Flexible";
}

function templateVariant(template: Template) {
  const variant = template.templateJson.variant;
  return typeof variant === "number" && Number.isInteger(variant) && variant >= 0 ? variant % 12 : 0;
}

function templatePalette(template: Template) {
  const palette = template.templateJson.palette;
  if (Array.isArray(palette)) {
    const colors = palette.filter((color): color is string =>
      typeof color === "string" && /^#[\da-f]{6}$/i.test(color));
    if (colors.length >= 3) return colors.slice(0, 3);
  }
  return ["#15345B", "#2563EB", "#FFFFFF"];
}

function templatePreviewContent(template: Template, overrides?: { headline?: string; supportingLine?: string; callToAction?: string }) {
  const concept = template.name.split(" - ")[0] ?? template.name;
  const format = template.format;
  const examples: Record<string, { caption: string; slides?: string[]; sections?: string[]; posterText?: { headline: string; supportingLine: string; callToAction: string } }> = {
    post: { caption: "Thoughtful ideas. Measurable progress. Built around what your customers need." },
    story: { caption: "A little behind the scenes: good work starts with listening." },
    carousel: { caption: "A simple, practical guide your audience can save and use.", slides: ["Start with the real challenge", "Make the next step simple", "Measure what moves forward"] },
    poster: { caption: "A thoughtful moment for the people who make our community.", posterText: { headline: "Ideas worth sharing", supportingLine: "A gathering for curious people and growing businesses", callToAction: "SAVE YOUR PLACE - united.example" } },
    brochure: { caption: "Practical support, clear communication, and a team that stays with you.", sections: ["Strategy that fits: A clear plan shaped around your goals and your audience.", "Thoughtful delivery: Practical support for each stage of the work.", "Progress you can see: Defined steps keep projects moving forward.", "Support from real people: Work with a team that understands your priorities.", "Built around your goals: Focus on the outcomes that matter most.", "Start a conversation: Tell us what you are planning and where to begin."] },
    flyer: { caption: "Meet local makers, find something new, and spend a good afternoon together.", sections: ["Local makers - independent studios", "Saturday, 10 AM - City Hall", "Free entry - Everyone welcome"], posterText: { headline: "A day for good ideas", supportingLine: "Local makers, useful talks, friendly conversations", callToAction: "SATURDAY, 10 AM - FREE ENTRY" } },
    thumbnail: { caption: "A quick, useful walkthrough with clear steps and no extra noise." },
    video: { caption: "See the idea in action, from the first question to the finished result." },
    "linkedin-banner": { caption: "Helping ambitious teams turn clear strategy into steady growth." },
    "pinterest-pin": { caption: "Save this practical checklist for your next planning session." },
    "facebook-cover": { caption: "A warm welcome to the people, places, and ideas we bring together." },
    "festival-greeting": { caption: "Wishing you a season filled with light, connection, and new beginnings." },
    "offer-sale": { caption: "A little something extra to help you take the next step." },
  };
  const sample = examples[format] ?? examples.post!;
  const headlineByFormat: Record<string, string> = {
    post: "Good ideas grow here", story: "A closer look", carousel: "Small steps. Real progress.",
    poster: "Ideas worth sharing", brochure: "A better way forward", flyer: "Come find your next idea",
    thumbnail: "A practical guide", video: "See how it works", "linkedin-banner": "Make room to grow",
    "pinterest-pin": "Keep this idea close", "facebook-cover": "Good things happen together",
    "business-card": "Let us make it happen", "festival-greeting": "A season of bright beginnings",
    "offer-sale": "A little extra, just for you",
  };
  const headline = overrides?.headline?.trim() || headlineByFormat[format] || "Good ideas grow here";
  const supportingLine = overrides?.supportingLine?.trim() || sample.caption;
  const callToAction = overrides?.callToAction?.trim() || sample.posterText?.callToAction || "DISCOVER MORE";
  return {
    brandName: "STUDIO NORTH",
    caption: `${concept}. ${supportingLine}`,
    ...(sample.slides ? { slides: sample.slides.map((slide, index) => ({ headline: index === 0 ? headline : slide, subheading: slide, body: supportingLine })) } : {}),
    ...(sample.sections ? { sections: sample.sections } : {}),
    posterText: { headline, supportingLine, callToAction },
  };
}

export function TemplatesClient() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [format, setFormat] = useState("all");
  const [category, setCategory] = useState("all");
  const [collection, setCollection] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiFormat, setAiFormat] = useState("flyer");
  const [artworkLayout, setArtworkLayout] = useState("editorial");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [imageGenerationConfigured, setImageGenerationConfigured] = useState<boolean | null>(null);
  const [photorealisticAvailable, setPhotorealisticAvailable] = useState(false);
  const [photorealistic, setPhotorealistic] = useState(false);
  const [imageGenerationProvider, setImageGenerationProvider] = useState<string | null>(null);
  const [generatingArtwork, setGeneratingArtwork] = useState(false);
  const [savingArtworkDraft, setSavingArtworkDraft] = useState(false);
  const [artworkDraftSaved, setArtworkDraftSaved] = useState(false);
  const [artworkError, setArtworkError] = useState<ArtworkError | null>(null);
  const [generatedArtwork, setGeneratedArtwork] = useState<GeneratedAiDesign | null>(null);
  const artworkDisclosureRef = useRef<HTMLDetailsElement>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewHeadline, setPreviewHeadline] = useState("");
  const [previewSupportingLine, setPreviewSupportingLine] = useState("");
  const [previewCallToAction, setPreviewCallToAction] = useState("");
  const [previewBrief, setPreviewBrief] = useState("");

  useEffect(() => {
    apiRequest<{ templates: Template[] }>("/api/templates")
      .then((response) => setTemplates(response.templates))
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load templates."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    apiRequest<{ configured: boolean; provider: string; model: string; photorealisticAvailable: boolean }>("/api/designs/image-generation-status")
      .then((response) => {
        setImageGenerationConfigured(response.configured);
        setImageGenerationProvider(response.provider);
        setPhotorealisticAvailable(response.photorealisticAvailable);
      })
      .catch(() => setImageGenerationConfigured(null));
  }, []);

  useEffect(() => {
    if (!previewTemplate) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setPreviewTemplate(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [previewTemplate]);

  async function generateArtwork(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGeneratingArtwork(true);
    setArtworkError(null);
    setGeneratedArtwork(null);
    setArtworkDraftSaved(false);
    try {
      const referenceImage = referenceFile ? await prepareDesignReference(referenceFile) : undefined;
      const response = await apiRequest<{ design: GeneratedAiDesign }>("/api/designs/generate", {
        method: "POST",
        body: JSON.stringify({ prompt: aiPrompt, format: aiFormat, layout: artworkLayout, photorealistic, ...(referenceImage ? { referenceImage } : {}) }),
      });
      setGeneratedArtwork(response.design);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not create this artwork. Try again with a more specific brief.";
      const quotaProvider = requestError instanceof ApiError && requestError.status === 429 && !message.includes("three AI artworks per minute")
        ? imageGenerationProvider?.toLocaleLowerCase().includes("groq") ? "groq" : "gemini"
        : null;
      setArtworkError({ message, quotaProvider });
    } finally {
      setGeneratingArtwork(false);
    }
  }

  async function saveArtworkAsDraft() {
    if (!generatedArtwork) return;
    setSavingArtworkDraft(true);
    setArtworkError(null);
    try {
      await apiRequest("/api/posts/drafts", {
        method: "POST",
        body: JSON.stringify({ contentId: generatedArtwork.contentId, designId: generatedArtwork.id, platforms: ["Instagram"] }),
      });
      setArtworkDraftSaved(true);
    } catch (requestError) {
      setArtworkError({ message: requestError instanceof Error ? requestError.message : "Could not save this design as an Instagram draft.", quotaProvider: null });
    } finally {
      setSavingArtworkDraft(false);
    }
  }

  const formats = useMemo(() => [...new Set(templates.map((template) => template.format))].sort(), [templates]);
  const categories = useMemo(() => [...new Set(templates.map(templateCategory))].sort(), [templates]);
  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const selectedCollection = templateCollections.find((item) => item.id === collection);
    return templates.filter((template) =>
      (!selectedCollection || selectedCollection.formats.some((supportedFormat) => supportedFormat === template.format)) &&
      (format === "all" || template.format === format) &&
      (category === "all" || templateCategory(template) === category) &&
      (!query || `${template.name} ${template.format} ${templateCategory(template)}`.toLocaleLowerCase().includes(query)),
    );
  }, [category, collection, format, search, templates]);

  function selectTemplate(template: Template, copy?: { headline: string; supportingLine: string; callToAction: string; brief: string }) {
    try {
      window.localStorage.setItem("united-technologies.selected-template", JSON.stringify({
        id: template.id,
        format: template.format,
        name: template.name,
        ...(copy ? { templateCopy: copy, idea: copy.brief } : {}),
      }));
      router.push("/dashboard/create");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not select this template.");
    }
  }

  function openTemplatePreview(template: Template) {
    const sample = templatePreviewContent(template);
    const defaultHeadline = sample.posterText?.headline ?? template.name.split(" - ")[0] ?? template.name;
    setPreviewTemplate(template);
    setPreviewHeadline(defaultHeadline);
    setPreviewSupportingLine(sample.posterText?.supportingLine ?? sample.caption);
    setPreviewCallToAction(sample.posterText?.callToAction ?? "DISCOVER MORE");
    setPreviewBrief("");
  }

  function applyTemplateFromPreview() {
    if (!previewTemplate) return;
    selectTemplate(previewTemplate, {
      headline: previewHeadline.trim(),
      supportingLine: previewSupportingLine.trim(),
      callToAction: previewCallToAction.trim(),
      brief: previewBrief.trim(),
    });
  }

  function renderTemplateCard(template: Template) {
    return (
      <article className="template-card" key={template.id} onClick={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest("button, a, input, select, textarea")) openTemplatePreview(template);
      }}>
        <button type="button" className="template-preview-trigger" onClick={() => openTemplatePreview(template)} aria-label={`Preview ${template.name}`}>
        <div className={`template-document-preview template-document-preview-${template.format}`}>
          <Image
            src={renderDesignPageSvg(createDesignDocument({
              id: template.id,
              title: template.name,
              format: template.format,
              colors: templatePalette(template),
              variant: templateVariant(template),
              templateId: template.id,
              template: template.templateJson,
              content: templatePreviewContent(template),
            }))}
            alt=""
            width={600}
            height={600}
            unoptimized
          />
          <span>{template.format.replaceAll("-", " ")}</span>
        </div>
        </button>
        <div className="template-card-body">
          <div><h2>{template.name}</h2><span>{template.workspaceId ? "Workspace" : "Starter"}</span></div>
          <p>{templateCategory(template)} Â· {templateLayout(template)} layout</p>
          <button type="button" className="button button-gold" onClick={() => openTemplatePreview(template)}>Preview and edit</button>
        </div>
      </article>
    );
  }

  const showSearchResults = search.trim().length > 0 || format !== "all" || category !== "all" || collection !== "all";

  return (
    <section className="dashboard-content templates-page">
      <header className="template-gallery-hero">
        <p className="eyebrow">YOUR CREATIVE STUDIO</p>
        <h1>What will you <em>design today?</em></h1>
        <p className="dashboard-lead">{photorealisticAvailable ? "Choose a visual style to create a brand-specific design in the correct format." : "Browse editable social, campaign, and print layouts. Choose one to continue in Create."}</p>
        <label className="template-search">
          <Search size={19} aria-hidden="true" />
          <span className="sr-only">Search templates</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search posts, stories, flyers and more" />
        </label>
        <nav className="template-collection-filters" aria-label="Browse template collections">
          <button type="button" className={collection === "all" ? "is-active" : ""} aria-pressed={collection === "all"} onClick={() => setCollection("all")}>All templates</button>
          {templateCollections.map((item) => (
            <button key={item.id} type="button" className={collection === item.id ? "is-active" : ""} aria-pressed={collection === item.id} onClick={() => setCollection(item.id)}>{item.name}</button>
          ))}
        </nav>
      </header>

      <details className="ai-artwork-disclosure" ref={artworkDisclosureRef}>
        <summary><Sparkles size={17} aria-hidden="true" /><span>Custom AI artwork</span><small>Create photo-rich artwork outside the template gallery</small></summary>
      <section className="ai-artwork-builder" aria-labelledby="ai-artwork-title">
        <div className="ai-artwork-intro">
          <span className="ai-artwork-icon"><Sparkles size={19} aria-hidden="true" /></span>
          <div><p className="eyebrow">{imageGenerationProvider ? imageGenerationProvider.toLocaleUpperCase() : "AI DESIGN STUDIO"}</p><h2 id="ai-artwork-title">Create an image-rich design</h2><p>Start from a gallery style or describe your own. The image is paired with crisp, editable brand copy in your selected format.</p></div>
        </div>
        <form className="ai-artwork-form" onSubmit={(event) => void generateArtwork(event)}>
          <label className="ai-artwork-prompt">What should we create?
            <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} minLength={8} maxLength={2200} required rows={4} placeholder="A welcoming hotel lobby at golden hour, warm natural light, a calm navy-and-ivory palette, and open space for one short headline about the guest experience." />
            <small>Be specific. Name the objects, platform icons, colors, visual style, and feeling you want.</small>
          </label>
          <div className="ai-artwork-controls">
            <label>Design format
              <CompactSelect aria-label="Design format" value={aiFormat} onChange={(event) => setAiFormat(event.target.value)}>
                {aiDesignFormats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </CompactSelect>
            </label>
            <label>Composition style
              <CompactSelect aria-label="Composition style" value={artworkLayout} onChange={(event) => setArtworkLayout(event.target.value)}>
                {aiDesignLayouts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </CompactSelect>
            </label>
            <label className="ai-artwork-reference"><span>Style reference <small>Optional</small></span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)} />
              {referenceFile && <small>{referenceFile.name}</small>}
            </label>
            <button type="submit" className="button button-gold ai-artwork-submit" disabled={generatingArtwork || aiPrompt.trim().length < 8 || imageGenerationConfigured === false}>
              {generatingArtwork ? <><span className="ai-artwork-spinner" /> Creating artwork...</> : <><Sparkles size={17} aria-hidden="true" /> Create with AI</>}
            </button>
          </div>
          <label className="ai-artwork-photo-mode"><input type="checkbox" checked={photorealistic} disabled={!photorealisticAvailable} onChange={(event) => setPhotorealistic(event.target.checked)} /> Create photo-rich artwork with Google AI Studio</label>
          <p className="ai-artwork-note">{photorealisticAvailable ? "Photo-rich mode creates original imagery; the headline, supporting copy, and call to action remain crisp and editable." : imageGenerationProvider?.toLocaleLowerCase().includes("groq") ? "Vector artwork is available. Photo-rich designs need Google AI Studio image generation, which is not configured." : "Artwork is saved to Gallery and Designs, with its copy stored as separate design layers."} Save the finished artwork as an Instagram draft to review and schedule in Posts &amp; Queue. Nothing publishes automatically. One AI generation is used.</p>
          {imageGenerationConfigured === false && <p className="ai-artwork-error" role="status">Image generation needs <code>GROQ_API_KEY</code> or <code>GOOGLE_AI_STUDIO_API_KEY</code> in the API configuration.</p>}
          {artworkError && <p className="ai-artwork-error" role="alert">{artworkError.message}{artworkError.quotaProvider === "groq" && <> <a href="https://console.groq.com/docs/rate-limits" target="_blank" rel="noreferrer">Check Groq limits</a></>}{artworkError.quotaProvider === "gemini" && <> <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Check Gemini image pricing</a> Â· <a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" rel="noreferrer">Check model quota</a></>}</p>}
        </form>
        {generatedArtwork && <article className="ai-artwork-result">
          <div className="ai-artwork-result-preview"><Image src={generatedArtwork.previewUrl} alt={`AI-generated ${generatedArtwork.format} design: ${generatedArtwork.title}`} width={720} height={920} unoptimized /></div>
          <div><p className="eyebrow">YOUR NEW DESIGN</p><h3>{generatedArtwork.title}</h3><p>Saved in your Gallery and Designs. Save it as an Instagram draft to review and schedule from Posts &amp; Queue.</p>
            <div className="ai-artwork-result-actions">
              <button type="button" className="button button-gold" onClick={() => router.push("/dashboard/designs")}>Open Designs <ArrowRight size={16} aria-hidden="true" /></button>
              <button type="button" className="button button-outline" disabled={savingArtworkDraft || artworkDraftSaved} onClick={() => void saveArtworkAsDraft()}>{savingArtworkDraft ? "Saving draft…" : artworkDraftSaved ? "Instagram draft saved" : "Save as Instagram draft"}</button>
              {artworkDraftSaved && <button type="button" className="text-button" onClick={() => router.push("/dashboard/posts")}>Open Posts &amp; Queue <ArrowRight size={15} aria-hidden="true" /></button>}
            </div>
          </div>
        </article>}
      </section>
      </details>


      <div className="template-browse-toolbar">
        <label>Format
          <CompactSelect aria-label="Format filter" value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="all">All formats</option>
            {formats.map((item) => <option key={item} value={item}>{item.replaceAll("-", " ")}</option>)}
          </CompactSelect>
        </label>
        <label>Category
          <CompactSelect aria-label="Category filter" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="all">All categories</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </CompactSelect>
        </label>
        <span>{visibleTemplates.length} templates</span>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {loading ? <p role="status">Loading templates...</p> : visibleTemplates.length === 0 ? (
        <article className="section-empty-state"><h2>No templates match this search.</h2><p>Try a different search or format.</p></article>
      ) : showSearchResults ? (
        <div className="template-results-grid">{visibleTemplates.map(renderTemplateCard)}</div>
      ) : (
        <div className="template-collections">
          {templateCollections
            .filter((item) => collection === "all" || item.id === collection)
            .map((item) => {
              const collectionTemplates = visibleTemplates.filter((template) => item.formats.some((supportedFormat) => supportedFormat === template.format));
              if (!collectionTemplates.length) return null;
              return (
                <section className="template-collection" key={item.id} aria-labelledby={`template-collection-${item.id}`}>
                  <div className="template-collection-heading">
                    <div><h2 id={`template-collection-${item.id}`}>{item.name}</h2><p>{item.description}</p></div>
                    <span>{collectionTemplates.length} designs</span>
                  </div>
                  {item.formats.map((templateFormat) => {
                    const formatTemplates = collectionTemplates.filter((template) => template.format === templateFormat);
                    if (!formatTemplates.length) return null;
                    return (
                      <div className="template-format-shelf" key={templateFormat}>
                        <div className="template-format-heading">
                          <h3>{templateFormat.replaceAll("-", " ")}</h3>
                          <button type="button" onClick={() => { setCollection(item.id); setFormat(templateFormat); }}>
                            View all {formatTemplates.length}
                          </button>
                        </div>
                        <div className="template-collection-row">{formatTemplates.slice(0, 8).map(renderTemplateCard)}</div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
        </div>
      )}
      {previewTemplate && typeof document !== "undefined" && createPortal(<div className="template-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewTemplate(null); }}>
        <section className="template-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="template-preview-title">
          <header className="template-preview-dialog-header">
            <div><p className="eyebrow">{templateCategory(previewTemplate)}</p><h2 id="template-preview-title">{previewTemplate.name}</h2><p>{previewTemplate.format.replaceAll("-", " ")} · {templateLayout(previewTemplate)} layout</p></div>
            <button type="button" className="template-preview-close" aria-label="Close template preview" onClick={() => setPreviewTemplate(null)}>×</button>
          </header>
          <div className="template-preview-dialog-body">
            <div className={`template-preview-large template-document-preview-${previewTemplate.format}`}>
              <Image
                src={renderDesignPageSvg(createDesignDocument({
                  id: `preview-${previewTemplate.id}`,
                  title: previewHeadline,
                  format: previewTemplate.format,
                  colors: templatePalette(previewTemplate),
                  variant: templateVariant(previewTemplate),
                  templateId: previewTemplate.id,
                  template: previewTemplate.templateJson,
                  content: templatePreviewContent(previewTemplate, { headline: previewHeadline, supportingLine: previewSupportingLine, callToAction: previewCallToAction }),
                }))}
                alt={`${previewTemplate.name} editable preview`}
                width={1000}
                height={800}
                unoptimized
              />
            </div>
            <form className="template-preview-editor" onSubmit={(event) => { event.preventDefault(); applyTemplateFromPreview(); }}>
              <p className="eyebrow">EDIT THIS TEMPLATE</p>
              <label>Headline<input value={previewHeadline} onChange={(event) => setPreviewHeadline(event.target.value)} maxLength={100} /></label>
              <label>Supporting line<textarea value={previewSupportingLine} onChange={(event) => setPreviewSupportingLine(event.target.value)} maxLength={240} rows={3} /></label>
              <label>Call to action<input value={previewCallToAction} onChange={(event) => setPreviewCallToAction(event.target.value)} maxLength={70} /></label>
              <label>What should the post be about?<textarea value={previewBrief} onChange={(event) => setPreviewBrief(event.target.value)} maxLength={1200} rows={3} placeholder="Add product details or audience context. Keep it factual." /></label>
              <p className="template-preview-note">The layout and palette carry into Create. Review the generated copy and artwork before scheduling.</p>
              <button type="submit" className="button button-gold">Use this template</button>
            </form>
          </div>
        </section>
      </div>, document.body)}
    </section>
  );
}

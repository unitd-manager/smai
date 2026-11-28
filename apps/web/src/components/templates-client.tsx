"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { createDesignDocument } from "@united-technologies/shared/design-document";
import { apiRequest } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";
import { DesignDocumentPreview } from "@/components/design-document-preview";

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
  const headline = overrides?.headline?.trim() || concept;
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

function templateDesignDocument(template: Template, copy?: { headline?: string; supportingLine?: string; callToAction?: string }) {
  return createDesignDocument({
    id: `template-${template.id}`,
    title: copy?.headline?.trim() || template.name,
    format: template.format,
    colors: templatePalette(template),
    variant: templateVariant(template),
    templateId: template.id,
    template: template.templateJson,
    content: templatePreviewContent(template, copy),
  });
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
    const current = previewTemplate?.id === template.id;
    const sample = templatePreviewContent(template);
    return (
      <article className="template-card" key={template.id} onClick={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest("button, a, input, select, textarea")) openTemplatePreview(template);
      }}>
        <div className={`template-document-preview template-document-preview-${template.format}`}>
          <DesignDocumentPreview
            document={templateDesignDocument(template, current ? { headline: previewHeadline, supportingLine: previewSupportingLine, callToAction: previewCallToAction } : undefined)}
            title={template.name}
            subtitle={`${template.format.replaceAll("-", " ")} · ${templateLayout(template)} layout`}
            compact
            open={current}
            onOpenChange={(open) => { if (open) openTemplatePreview(template); else setPreviewTemplate(null); }}
            modalDetails={<>
              <p className="template-preview-meta">{templateCategory(template)} · {template.format.replaceAll("-", " ")} · {templateLayout(template)} layout</p>
              <form className="template-preview-editor" onSubmit={(event) => { event.preventDefault(); applyTemplateFromPreview(); }}>
                <label>Headline<input value={current ? previewHeadline : sample.posterText?.headline ?? template.name} onChange={(event) => { if (!current) openTemplatePreview(template); setPreviewHeadline(event.target.value); }} maxLength={100} /></label>
                <label>Supporting line<textarea value={current ? previewSupportingLine : sample.posterText?.supportingLine ?? sample.caption} onChange={(event) => { if (!current) openTemplatePreview(template); setPreviewSupportingLine(event.target.value); }} maxLength={240} rows={3} /></label>
                <label>Call to action<input value={current ? previewCallToAction : sample.posterText?.callToAction ?? "DISCOVER MORE"} onChange={(event) => { if (!current) openTemplatePreview(template); setPreviewCallToAction(event.target.value); }} maxLength={70} /></label>
                <label>What should the post be about?<textarea value={current ? previewBrief : ""} onChange={(event) => { if (!current) openTemplatePreview(template); setPreviewBrief(event.target.value); }} maxLength={1200} rows={3} placeholder="Add product details or audience context. Keep it factual." /></label>
                <p className="template-preview-note">The layout and palette carry into Create. Review the generated copy and artwork before scheduling.</p>
                <button type="submit" className="button button-gold">Use this template</button>
              </form>
            </>}
          />
          <span>{template.format.replaceAll("-", " ")}</span>
        </div>
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
        <p className="dashboard-lead">Browse editable social, campaign, and print layouts. Choose a template to continue in Create.</p>
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
    </section>
  );
}

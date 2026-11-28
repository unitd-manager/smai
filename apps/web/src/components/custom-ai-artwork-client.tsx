"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { ApiError, apiRequest } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";

const formats = [
  ["flyer", "Flyer"], ["brochure", "Brochure"], ["poster", "Poster"], ["post", "Social post"],
  ["story", "Story"], ["carousel", "Carousel cover"], ["pinterest-pin", "Pinterest pin"],
  ["thumbnail", "Video thumbnail"], ["linkedin-banner", "LinkedIn banner"], ["facebook-cover", "Facebook cover"],
  ["business-card", "Business card"], ["festival-greeting", "Festival greeting"],
] as const;
const layouts = [
  ["editorial", "Editorial"], ["split", "Split image"], ["bold", "Bold campaign"], ["collage", "Image collage"],
  ["framed", "Framed photo"], ["magazine", "Magazine cover"], ["type-led", "Typography first"],
  ["triptych", "Three-panel story"], ["spotlight", "Spotlight portrait"], ["grid", "Grid layout"],
  ["sparkle", "Bright accents"], ["radiant", "Radial campaign"],
] as const;
type GeneratedDesign = { id: string; contentId: string; title: string; format: string; previewUrl: string };

async function prepareReference(file: File) {
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
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not prepare the reference image.")), "image/jpeg", 0.82));
  if (blob.size > 2_000_000) throw new Error("This reference image is too large. Choose a smaller image.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1] ?? "") : reject(new Error("Could not read the reference image."));
    reader.onerror = () => reject(new Error("Could not read the reference image."));
    reader.readAsDataURL(blob);
  });
  return { mimeType: "image/jpeg", data };
}

export function CustomAiArtworkClient() {
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("flyer");
  const [layout, setLayout] = useState("editorial");
  const [reference, setReference] = useState<File | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [photoAvailable, setPhotoAvailable] = useState(false);
  const [photoMode, setPhotoMode] = useState(false);
  const [provider, setProvider] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [design, setDesign] = useState<GeneratedDesign | null>(null);

  useEffect(() => {
    apiRequest<{ configured: boolean; provider: string; photorealisticAvailable: boolean }>("/api/designs/image-generation-status")
      .then((status) => { setConfigured(status.configured); setProvider(status.provider); setPhotoAvailable(status.photorealisticAvailable); })
      .catch(() => setConfigured(null));
  }, []);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setGenerating(true); setError(""); setDesign(null); setSaved(false);
    try {
      const referenceImage = reference ? await prepareReference(reference) : undefined;
      const response = await apiRequest<{ design: GeneratedDesign }>("/api/designs/generate", {
        method: "POST", body: JSON.stringify({ prompt, format, layout: layout.toLocaleLowerCase().replaceAll(" ", "-"), photorealistic: photoMode, ...(referenceImage ? { referenceImage } : {}) }),
      });
      setDesign(response.design);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not create this artwork. Try a more specific brief.";
      const quota = cause instanceof ApiError && cause.status === 429;
      setError(quota ? `${message} Check your image generation provider’s quota.` : message);
    } finally { setGenerating(false); }
  }

  async function saveDraft() {
    if (!design) return;
    setSaving(true); setError("");
    try {
      await apiRequest("/api/posts/drafts", { method: "POST", body: JSON.stringify({ contentId: design.contentId, designId: design.id, platforms: ["Instagram"] }) });
      setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this design as a draft."); }
    finally { setSaving(false); }
  }

  return (
    <section className="custom-ai-artwork" aria-labelledby="custom-ai-artwork-title">
      <div className="ai-artwork-intro"><span className="ai-artwork-icon"><Sparkles size={19} aria-hidden="true" /></span><div><p className="eyebrow">{provider ? provider.toLocaleUpperCase() : "AI DESIGN STUDIO"}</p><h2 id="custom-ai-artwork-title">Custom AI artwork</h2><p>Describe original artwork for a post, campaign, or print design. The image and copy are saved separately so you can edit and review them.</p></div></div>
      <form className="ai-artwork-form" onSubmit={(event) => void generate(event)}>
        <label className="ai-artwork-prompt">What should we create?
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} minLength={8} maxLength={2200} required rows={4} placeholder="Describe the setting, subject, colors, visual style, and feeling. Keep claims grounded in the services in your brand profile." />
          <small>Be specific about the scene and mood. Do not include unverified claims or promotions.</small>
        </label>
        <div className="ai-artwork-controls">
          <label>Design format<CompactSelect aria-label="Design format" value={format} onChange={(event) => setFormat(event.target.value)}>{formats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CompactSelect></label>
          <label>Composition style<CompactSelect aria-label="Composition style" value={layout} onChange={(event) => setLayout(event.target.value)}>{layouts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CompactSelect></label>
          <label className="ai-artwork-reference"><span>Style reference <small>Optional</small></span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setReference(event.target.files?.[0] ?? null)} />{reference && <small>{reference.name}</small>}</label>
          <button type="submit" className="button button-gold ai-artwork-submit" disabled={generating || prompt.trim().length < 8 || configured === false}>{generating ? "Creating artwork…" : <><Sparkles size={17} /> Create with AI</>}</button>
        </div>
        <label className="ai-artwork-photo-mode"><input type="checkbox" checked={photoMode} disabled={!photoAvailable} onChange={(event) => { setPhotoMode(event.target.checked); setError(""); }} /><span>Create photo-rich artwork with Cloudflare Workers AI</span></label>
        <p className="ai-artwork-note">Saved artwork appears in Gallery and Designs. Save it as a draft to review in Publishing; nothing publishes automatically.</p>
        {configured === false && <p className="ai-artwork-error" role="status">Image generation needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN or GROQ_API_KEY in API configuration.</p>}
        {error && <p className="ai-artwork-error" role="alert">{error}</p>}
      </form>
        {design && <article className="ai-artwork-result"><div className="ai-artwork-result-preview"><Image src={design.previewUrl} alt={`AI-generated ${design.format} design: ${design.title}`} width={720} height={920} unoptimized /></div><div><p className="eyebrow">YOUR NEW DESIGN</p><h3>{design.title}</h3><p>Saved in Gallery and Designs.</p><div className="ai-artwork-result-actions"><Link className="button button-outline" href="/dashboard/designs">Edit design <ArrowRight size={15} /></Link><button type="button" className="button button-gold" disabled={saving || saved} onClick={() => void saveDraft()}>{saving ? "Saving…" : saved ? "Draft saved" : "Save as draft"}</button></div></div></article>}
    </section>
  );
}

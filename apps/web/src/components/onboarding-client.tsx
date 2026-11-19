"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ImageOff, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { colors } from "@/config/brand";
import { apiRequest } from "@/lib/api";

type BrandProfile = {
  id: string;
  name: string;
  timezone?: string | null;
  profile: {
    industry?: string | null;
    description?: string | null;
    products?: string | null;
    audience?: string | null;
    offers?: string | null;
    tone?: string | null;
    brandVoiceRules?: string[] | null;
    bannedWords?: string[] | null;
    city?: string | null;
    country?: string | null;
    languages?: string[] | null;
    competitors?: string[] | null;
    goals?: string[] | null;
    preferredPlatforms?: string[] | null;
    instagramAutopilotEnabled?: boolean;
  } | null;
  kit: { logoUrl?: string | null; colors?: string[] | null; fonts?: string[] | null; templateIds?: string[] | null } | null;
  instagramAutopilotRuns?: AutopilotRunStatus[];
};
type LogoAsset = { id: string; fileName: string; mimeType: string; sizeBytes: string };
type BrandTemplate = { id: string; name: string; format: string };
type AutopilotRunStatus = { status: string; error: string | null; createdAt: string; completedAt: string | null };
type WorkspaceAccess = { trialExpired: boolean; subscriptionStatus: string | null };
const brandTemplateFormats = [
  "post", "carousel", "story", "poster", "brochure", "flyer", "thumbnail", "video",
  "linkedin-banner", "pinterest-pin", "facebook-cover", "business-card", "festival-greeting", "offer-sale",
];

const initialForm = {
  industry: "",
  description: "",
  products: "",
  audience: "",
  offers: "",
  tone: "",
  brandVoiceRules: "",
  bannedWords: "",
  city: "",
  country: "",
  languages: "English",
  competitors: "",
  goals: "",
  preferredPlatforms: "",
  brandColors: `${colors.navy[800]}, ${colors.accent[500]}, ${colors.ivory[100]}`,
  fonts: "Inter",
};

const countryDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
const countryOptions = [...new Set(Array.from({ length: 26 * 26 }, (_, index) => {
  const code = String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26);
  const name = countryDisplayNames.of(code);
  return name && name !== code ? name : null;
}).filter((name, index): name is string => {
  const code = String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26);
  return name !== null && name !== code && name !== "Unknown Region" && !["EU", "EZ", "UN", "XA", "XB", "ZZ"].includes(code);
}))].sort((a, b) => a.localeCompare(b));

async function rasterizeSvgLogo(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = objectUrl;
    await image.decode();
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height || width > 100_000 || height > 100_000) {
      throw new Error("This SVG does not have valid logo dimensions.");
    }

    const scale = Math.min(1, 2048 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this SVG logo.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error("Your browser could not convert this SVG logo to PNG."));
      }, "image/png");
    });
    if (png.size > 4 * 1024 * 1024) {
      throw new Error("The converted logo is larger than 4 MB. Choose a simpler SVG.");
    }
    return new File([png], file.name.replace(/\.svg$/i, ".png"), { type: "image/png" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function OnboardingClient() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [brandName, setBrandName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [instagramAutopilotEnabled, setInstagramAutopilotEnabled] = useState(true);
  const [lastAutopilotRun, setLastAutopilotRun] = useState<AutopilotRunStatus | null>(null);
  const [workspaceCanWrite, setWorkspaceCanWrite] = useState<boolean | null>(null);
  const [trialExpired, setTrialExpired] = useState(false);
  const [logoAssets, setLogoAssets] = useState<LogoAsset[]>([]);
  const [selectedLogoId, setSelectedLogoId] = useState("");
  const [logoPreviewFailed, setLogoPreviewFailed] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<BrandTemplate[]>([]);
  const [preferredTemplateIds, setPreferredTemplateIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const countryPickerRef = useRef<HTMLDivElement>(null);
  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLocaleLowerCase();
    return query ? countryOptions.filter((country) => country.toLocaleLowerCase().includes(query)) : countryOptions;
  }, [countrySearch]);

  useEffect(() => {
    if (!countryOpen) return;
    function closeCountryPicker(event: PointerEvent) {
      if (event.target instanceof Node && !countryPickerRef.current?.contains(event.target)) {
        setCountryOpen(false);
        setCountrySearch("");
      }
    }
    window.addEventListener("pointerdown", closeCountryPicker);
    return () => window.removeEventListener("pointerdown", closeCountryPicker);
  }, [countryOpen]);

  useEffect(() => {
    apiRequest<WorkspaceAccess>("/api/dashboard")
      .then((access) => {
        setTrialExpired(access.trialExpired);
        setWorkspaceCanWrite(access.subscriptionStatus === "active" ||
          (access.subscriptionStatus === "trialing" && !access.trialExpired));
      })
      .catch(() => setWorkspaceCanWrite(false));
    apiRequest<{ brand: BrandProfile }>("/api/brand-profile")
      .then(({ brand }) => {
        setBrandName(brand.name);
        const profile = brand.profile;
        setLastAutopilotRun(brand.instagramAutopilotRuns?.[0] ?? null);
        setTimezone(brand.timezone || "UTC");
        const complete = Boolean(profile?.industry && profile.products && profile.audience && profile.tone && profile.preferredPlatforms?.length);
        setInstagramAutopilotEnabled(complete ? Boolean(profile?.instagramAutopilotEnabled) : true);
        const kit = brand.kit;
        const savedBrandColors = kit?.colors?.filter((color) => /^#[0-9a-f]{6}$/i.test(color)) ?? [];
        const logoId = kit?.logoUrl?.startsWith("media://") ? kit.logoUrl.slice("media://".length) : "";
        setSelectedLogoId(logoId);
        setLogoPreviewFailed(false);
        setPreferredTemplateIds(kit?.templateIds ?? []);
        setForm({
          industry: profile?.industry ?? "",
          description: profile?.description ?? "",
          products: profile?.products ?? "",
          audience: profile?.audience ?? "",
          offers: profile?.offers ?? "",
          tone: profile?.tone ?? "",
          brandVoiceRules: profile?.brandVoiceRules?.join(", ") ?? "",
          bannedWords: profile?.bannedWords?.join(", ") ?? "",
          city: profile?.city ?? "",
          country: profile?.country ?? "",
          languages: profile?.languages?.join(", ") ?? "English",
          competitors: profile?.competitors?.join(", ") ?? "",
          goals: profile?.goals?.join(", ") ?? "",
          preferredPlatforms: profile?.preferredPlatforms?.join(", ") ?? "",
          brandColors: savedBrandColors.length ? savedBrandColors.join(", ") : initialForm.brandColors,
          fonts: kit?.fonts?.join(", ") ?? initialForm.fonts,
        });
        void apiRequest<{ assets: LogoAsset[] }>("/api/media/uploads")
          .then(({ assets }) => setLogoAssets(assets.filter((asset) =>
            ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType) && Number(asset.sizeBytes) <= 4 * 1024 * 1024,
          )))
          .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load logo images from your media library."));
        void apiRequest<{ templates: BrandTemplate[] }>("/api/templates")
          .then(({ templates }) => setAvailableTemplates(templates))
          .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : "Could not load available brand templates."));
      })
      .catch((requestError: unknown) => {
        setError(requestError instanceof Error ? requestError.message : "Could not load your brand profile.");
      })
      .finally(() => setLoading(false));
  }, []);

  function updateField(name: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;
    const isSvg = selectedFile.type === "image/svg+xml" || /\.svg$/i.test(selectedFile.name);
    if ((!isSvg && !["image/jpeg", "image/png", "image/webp"].includes(selectedFile.type)) ||
      selectedFile.size === 0 || selectedFile.size > 4 * 1024 * 1024) {
      setError("Choose a non-empty PNG, JPEG, WebP, or SVG logo no larger than 4 MB.");
      return;
    }
    setUploadingLogo(true);
    setError("");
    try {
      const file = isSvg ? await rasterizeSvgLogo(selectedFile) : selectedFile;
      const { asset } = await apiRequest<{ asset: LogoAsset }>("/api/media/uploads", {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name),
          "X-File-Mime-Type": file.type,
        },
        body: file,
      });
      setLogoAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      setSelectedLogoId(asset.id);
      setLogoPreviewFailed(false);
      setMessage(`${isSvg ? "SVG converted to a high-resolution PNG and uploaded" : "Logo uploaded"} to your workspace media library. Save the profile to apply it to this brand.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not upload this logo.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (workspaceCanWrite !== true) return;
    setSaving(true);
    setError("");
    setMessage("");
    const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

    try {
      if (![brandName, form.industry, form.products, form.audience, form.tone].every((value) => value.trim())) {
        throw new Error("Complete the business name, industry, offer, audience, and tone fields to continue.");
      }
      if (!list(form.goals).length || !list(form.preferredPlatforms).length) {
        throw new Error("Add at least one business goal and one preferred platform to continue.");
      }
      if (!list(form.brandColors).length || list(form.brandColors).some((color) => !/^#[0-9a-f]{6}$/i.test(color))) {
        throw new Error("Enter at least one valid brand color in #RRGGBB format.");
      }
      if (!list(form.fonts).length) {
        throw new Error("Add at least one brand font to continue.");
      }
      await apiRequest("/api/brand-profile", {
        method: "PUT",
        body: JSON.stringify({
          brandName,
          timezone,
          industry: form.industry,
          description: form.description,
          products: form.products,
          audience: form.audience,
          offers: form.offers,
          tone: form.tone,
          brandVoiceRules: list(form.brandVoiceRules),
          bannedWords: list(form.bannedWords),
          city: form.city,
          country: form.country,
          languages: list(form.languages),
          competitors: list(form.competitors),
          goals: list(form.goals),
          preferredPlatforms: list(form.preferredPlatforms),
          instagramAutopilotEnabled,
          brandColors: list(form.brandColors),
          fonts: list(form.fonts),
          logoAssetId: selectedLogoId || null,
          templateIds: preferredTemplateIds,
        }),
      });
      setMessage(instagramAutopilotEnabled
        ? "Your profile is saved and Instagram Autopilot is enabled. It will prepare 13 posts per week, including Reels, for email approval. Connect Instagram and configure approval email delivery to publish approved content."
        : "Your brand profile has been saved. Instagram Autopilot is paused.");
      await new Promise((resolve) => setTimeout(resolve, 900));
      router.replace("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save your brand profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
      <section className="dashboard-content onboarding-content">
        <p className="eyebrow">YOUR BRAND FOUNDATION</p>
        <h1>Brand Kit &amp; Profile</h1>
        <p className="dashboard-lead">This profile guides every idea and design. You can refine it whenever your business evolves.</p>
        {loading ? <p className="loading-label">Loading your brand profile…</p> : (
          <form className="profile-form" onSubmit={handleSubmit}>
            <div className="brand-profile-primary-card">
            <div className="form-section-heading">
              <span>01</span><div><h2>Business & audience</h2><p>Help us understand your offer and who it serves.</p></div>
            </div>
            <div className="field-grid">
              <label>Business or brand name<input required minLength={2} maxLength={120} value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder="The name customers know you by" /></label>
              <label>Industry<input required value={form.industry} onChange={(event) => updateField("industry", event.target.value)} placeholder="e.g. Hospitality" /></label>
              <label>City<input value={form.city} onChange={(event) => updateField("city", event.target.value)} placeholder="e.g. Jaipur" /></label>
              <div className="country-field">
                <span className="country-field-label">Country</span>
                <div className="country-picker" ref={countryPickerRef}>
                  <button type="button" className="country-picker-trigger" aria-label="Country" aria-haspopup="listbox" aria-expanded={countryOpen} onClick={() => setCountryOpen((open) => !open)}>
                    <span className={form.country ? "" : "country-picker-placeholder"}>{form.country || "Select a country"}</span><ChevronDown size={18} aria-hidden="true" />
                  </button>
                  {countryOpen && <div className="country-picker-popover">
                    <label className="country-picker-search">
                      <Search size={16} aria-hidden="true" />
                      <span className="sr-only">Search countries</span>
                      <input
                        autoFocus
                        type="search"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded="true"
                        aria-controls="brand-country-options"
                        value={countrySearch}
                        onChange={(event) => setCountrySearch(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setCountryOpen(false);
                          if (event.key === "Enter" && filteredCountries[0]) {
                            event.preventDefault();
                            updateField("country", filteredCountries[0]);
                            setCountryOpen(false);
                            setCountrySearch("");
                          }
                        }}
                        placeholder="Search countries…"
                      />
                    </label>
                    <div className="country-picker-options" id="brand-country-options" role="listbox" aria-label="Countries">
                      {filteredCountries.length ? filteredCountries.map((country) => (
                        <button key={country} type="button" role="option" aria-selected={form.country === country} onClick={() => {
                          updateField("country", country);
                          setCountryOpen(false);
                          setCountrySearch("");
                        }}>{country}</button>
                      )) : <p>No countries match “{countrySearch}”.</p>}
                    </div>
                  </div>}
                </div>
                <small>Search for and select the country where your business is based.</small>
              </div>
              <label>What do you sell or offer?<textarea required value={form.products} onChange={(event) => updateField("products", event.target.value)} rows={3} placeholder="Products, services and what makes them useful" /></label>
              <label>Who is your audience?<textarea required value={form.audience} onChange={(event) => updateField("audience", event.target.value)} rows={3} placeholder="The people you want to reach" /></label>
              <label>Offers & unique strengths<textarea value={form.offers} onChange={(event) => updateField("offers", event.target.value)} rows={3} placeholder="Offers, differentiators or proof points" /></label>
              <label>Brand description<textarea value={form.description} onChange={(event) => updateField("description", event.target.value)} rows={3} placeholder="A short introduction to your brand" /></label>
              <label>Tone of voice<input required value={form.tone} onChange={(event) => updateField("tone", event.target.value)} placeholder="e.g. Warm, assured and premium" /></label>
              <label>Brand voice rules <small>Comma-separated guidance the AI should follow.</small><textarea value={form.brandVoiceRules} onChange={(event) => updateField("brandVoiceRules", event.target.value)} rows={2} placeholder="e.g. Use plain language, avoid jargon" /></label>
              <label className="brand-banned-words-field">Banned words <small>Words or phrases the AI should avoid.</small><textarea value={form.bannedWords} onChange={(event) => updateField("bannedWords", event.target.value)} rows={2} placeholder="Comma-separated" /></label>
            </div>
            <div className="form-section-heading">
              <span>02</span><div><h2>Content direction</h2><p>Set the context for thoughtful, relevant content.</p></div>
            </div>
            <div className="field-grid">
              <label>Languages <small>Separate multiple values with commas.</small><input value={form.languages} onChange={(event) => updateField("languages", event.target.value)} /></label>
              <label>Competitors<input value={form.competitors} onChange={(event) => updateField("competitors", event.target.value)} placeholder="Optional, comma separated" /></label>
              <label>Goals<input required value={form.goals} onChange={(event) => updateField("goals", event.target.value)} placeholder="e.g. Awareness, enquiries" /></label>
              <label>Preferred platforms <small>Optional planning guidance. Autopilot selects from connected channels automatically.</small><input value={form.preferredPlatforms} onChange={(event) => updateField("preferredPlatforms", event.target.value)} placeholder="Optional, e.g. Instagram, LinkedIn" /></label>
              <label>Publishing time zone<select value={timezone} onChange={(event) => setTimezone(event.target.value)}>{["UTC", ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC")].map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select><small>Autopilot uses this time zone for weekday slots at 10:00 and 15:00. New batches use the latest saved time zone.</small></label>
            </div>
            <label className="autopilot-toggle">
              <input
                type="checkbox"
                checked={instagramAutopilotEnabled}
                disabled={workspaceCanWrite !== true}
                onChange={(event) => setInstagramAutopilotEnabled(event.target.checked)}
              />
                <span><strong>Enable weekly Autopilot</strong><small>Generate 13 posts every week from this brand profile, schedule them in this brand’s time zone, and email them for approval. Connected channels are selected automatically. Instagram is currently the only live publishing integration. Nothing publishes without approval.</small></span>
            </label>
            {lastAutopilotRun?.status === "FAILED" && (
              <p className="autopilot-status-error" role="status">The latest Autopilot attempt needs attention: {lastAutopilotRun.error ?? "The batch could not be completed."}</p>
            )}
            <div className="form-section-heading">
              <span>03</span><div><h2>Visual identity</h2><p>Start with your palette and preferred typefaces.</p></div>
            </div>
            <div className="field-grid brand-visual-grid">
              <label className="brand-kit-logo-field">
                <span className="brand-kit-field-title">Brand logo</span>
                <small>Upload a PNG, JPEG, WebP, or SVG up to 4 MB, or select an existing workspace image. SVG files are converted to PNG for safe previews.</small>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" disabled={uploadingLogo} onChange={(event) => void uploadLogo(event)} />
                <select value={selectedLogoId} onChange={(event) => {
                  setSelectedLogoId(event.target.value);
                  setLogoPreviewFailed(false);
                }}>
                  <option value="">No logo selected</option>
                  {logoAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}</option>)}
                </select>
                {selectedLogoId && (logoPreviewFailed ? (
                  <span className="brand-kit-logo-unavailable" role="status">
                    <ImageOff size={20} aria-hidden="true" />
                    <strong>Logo preview unavailable</strong>
                    <small>Select the logo again or upload a replacement.</small>
                  </span>
                ) : (
                  <Image className="brand-kit-logo-preview" src={`/api/media/uploads/${encodeURIComponent(selectedLogoId)}/file`} alt="Selected brand logo preview" width={220} height={100} unoptimized onError={() => setLogoPreviewFailed(true)} />
                ))}
              </label>
              <label className="brand-kit-color-field">
                <span className="brand-kit-field-title">Brand colors</span>
                <small>These colors guide generated design previews. Enter #RRGGBB values separated by commas.</small>
                <input required value={form.brandColors} onChange={(event) => updateField("brandColors", event.target.value)} />
              </label>
              <label className="brand-kit-font-field">
                <span className="brand-kit-field-title">Fonts</span>
                <input required value={form.fonts} onChange={(event) => updateField("fonts", event.target.value)} />
              </label>
            </div>
            </div>
            <div className="brand-template-preferences">
              <div className="brand-template-heading">
                <strong>Preferred design templates</strong>
                <small>Choose one default per format. Content generation uses these automatically unless you choose a template for that request.</small>
              </div>
              <div className="field-grid">
                {brandTemplateFormats.map((format) => (
                  <label key={format}>
                    <span className="brand-kit-field-title">{format.replaceAll("-", " ")}</span>
                    <select
                      value={preferredTemplateIds.find((id) => availableTemplates.some((template) => template.id === id && template.format === format)) ?? ""}
                      onChange={(event) => setPreferredTemplateIds((current) => [
                        ...current.filter((id) => !availableTemplates.some((template) => template.id === id && template.format === format)),
                        ...(event.target.value ? [event.target.value] : []),
                      ])}
                    >
                      <option value="">Use the standard template</option>
                      {availableTemplates.filter((template) => template.format === format).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
            <p className="brand-kit-help">Your brand profile guides generated copy; these colors are used as accents and palette choices in design previews. You can update them at any time.</p>
            {workspaceCanWrite === false && (
              <p className="profile-readonly-notice" role="status">
                {trialExpired
                  ? "Your 14-day free trial has ended. Upgrade to save profile changes or generate content. "
                  : "An active subscription is required to save profile changes or generate content. "}
                <Link href="/dashboard/billing">View billing and plans</Link>
              </p>
            )}
            {message && <p className="form-success" role="status">{message}</p>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-actions">
              <button className="button button-gold" type="submit" disabled={saving || workspaceCanWrite !== true}>{saving ? "Saving…" : "Save brand profile"}</button>
            </div>
          </form>
        )}
      </section>
  );
}

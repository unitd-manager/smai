"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { platformSpecs } from "@united-technologies/shared/platform-specs";
import type { DesignDocument } from "@united-technologies/shared/design-document";
import { apiRequest } from "@/lib/api";
import { DesignDocumentPreview } from "@/components/design-document-preview";

const platforms = Object.keys(platformSpecs);
const campaignFormats = [
  "post",
  "carousel",
  "story",
  "poster",
  "brochure",
  "flyer",
  "thumbnail",
  "video",
  "linkedin-banner",
  "pinterest-pin",
  "facebook-cover",
  "business-card",
  "festival-greeting",
  "offer-sale",
] as const;
type CampaignFormat = (typeof campaignFormats)[number];
const formatLabels: Record<CampaignFormat, string> = {
  post: "Social post",
  carousel: "Carousel",
  story: "Story",
  poster: "Poster",
  brochure: "Brochure",
  flyer: "Flyer",
  thumbnail: "Thumbnail",
  video: "Video script",
  "linkedin-banner": "LinkedIn banner",
  "pinterest-pin": "Pinterest pin",
  "facebook-cover": "Facebook cover",
  "business-card": "Business card",
  "festival-greeting": "Festival greeting",
  "offer-sale": "Offer / sale",
};
type GeneratedItem = {
  id: string;
  contentJson: { title: string; format: string; platforms: string[]; caption: string };
  designs: Array<{ id: string; designJson: { document?: DesignDocument } }>;
};
type CampaignResponse = {
  provider: string;
  usage: { used: number; limit: number | null };
  items: GeneratedItem[];
};
type ContentPlanResponse = {
  plan: { id: string; name: string };
};

function localDateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const dailyAngles = [
  "Introduce the business and the problem it helps solve",
  "Answer a useful question customers commonly ask",
  "Explain one product or service benefit using confirmed brand facts",
  "Share a practical tip the audience can use today",
  "Show a simple behind-the-scenes process without inventing a customer",
  "Explain how to choose between common options",
  "Address a common misconception in the industry",
  "Break down one step in how the service works",
  "Highlight a product detail and why it matters",
  "Share a short checklist related to the audience's needs",
  "Explain a common mistake and a helpful alternative",
  "Describe the brand's approach using the saved profile",
  "Offer a concise how-to with clear steps",
  "Answer a second frequently asked question from a new angle",
  "Explain what to consider before buying or booking",
  "Share a relevant use case without making a testimonial claim",
  "Compare two approaches fairly and practically",
  "Describe a routine or habit that supports the audience",
  "Explain one detail customers might overlook",
  "Share a short educational myth-versus-fact post",
  "Introduce a team or craft detail only when known from the brief",
  "Give a seasonal or timely idea without inventing an event or offer",
  "Summarize a useful lesson from the campaign topic",
  "Share a simple planning or preparation tip",
  "Answer an objection honestly using only supplied facts",
  "Explain a safe, low-effort first step for the audience",
  "Highlight a confirmed offer only if the brand brief includes one",
  "Share a short glossary or explain an industry term",
  "Recap the audience problem and the brand's relevant solution",
  "Invite the audience to take one clear, natural next step",
];

function getDailyAngle(day: number) {
  return dailyAngles[(day - 1) % dailyAngles.length]!;
}

export function CampaignsClient() {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [formats, setFormats] = useState<CampaignFormat[]>(["post", "carousel"]);
  const [selectedPlatforms, setSelectedPlatforms] = useState(["Instagram", "LinkedIn"]);
  const [startDate, setStartDate] = useState("");
  const [durationDays, setDurationDays] = useState(30);
  const [generated, setGenerated] = useState<CampaignResponse | null>(null);
  const [savedPlan, setSavedPlan] = useState<ContentPlanResponse["plan"] | null>(null);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [showAllDays, setShowAllDays] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [configurationLoaded, setConfigurationLoaded] = useState(false);
  const [configurationError, setConfigurationError] = useState("");

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
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const goalFromUrl = params.get("goal");
      const nameFromUrl = params.get("name");
      if (goalFromUrl) setGoal(goalFromUrl);
      if (nameFromUrl) setName(nameFromUrl);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggle<T extends string>(value: T, values: T[], setValues: (next: T[]) => void) {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }

  async function persistPlan(items: GeneratedItem[]) {
    const start = new Date(`${startDate}T09:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + durationDays - 1);
    const baseName = name.trim() || goal.trim().slice(0, 100);
    const partialSuffix = ` (${items.length}/${durationDays} days)`;
    const planName = items.length < durationDays
      ? `${baseName.slice(0, Math.max(2, 120 - partialSuffix.length)).trim()}${partialSuffix}`
      : baseName;
    const planItems = items.map((item, index) => {
      const scheduledAt = new Date(start);
      scheduledAt.setDate(start.getDate() + index);
      return {
        contentId: item.id,
        scheduledAt: scheduledAt.toISOString(),
        format: item.contentJson.format,
        platforms: item.contentJson.platforms,
      };
    });
    const planResult = await apiRequest<ContentPlanResponse>("/api/content-plans", {
      method: "POST",
      body: JSON.stringify({
        name: planName,
        goal,
        audience,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        platforms: selectedPlatforms,
        items: planItems,
      }),
    });
    setSavedPlan(planResult.plan);
    setNotice(items.length < durationDays
      ? `Saved a partial plan with ${items.length} of ${durationDays} daily drafts. Nothing was scheduled or published.`
      : `${items.length} daily drafts were generated and saved in Content Plans. Nothing was scheduled or published.`);
  }

  async function savePartialPlan() {
    if (!generated || generated.items.length === 0) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      await persistPlan(generated.items);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? `Your drafts are still saved in Content, but the partial plan could not be saved: ${requestError.message}`
        : "Your drafts are still saved in Content, but the partial plan could not be saved.");
    } finally {
      setCreating(false);
    }
  }

  async function createCampaign(event?: FormEvent<HTMLFormElement>, resume = false) {
    event?.preventDefault();
    setError("");
    setNotice("");
    if (!resume) {
      setGenerated(null);
      setSavedPlan(null);
      setGenerationProgress(0);
      setShowAllDays(false);
    }
    if (!startDate || startDate < localDateOffset(1)) {
      setError("Choose a start date beginning tomorrow or later.");
      return;
    }
    if (!goal.trim() || formats.length === 0 || selectedPlatforms.length === 0) {
      setError("Add a campaign goal, at least one format, and at least one platform.");
      return;
    }
    setCreating(true);
    const items = resume ? [...(generated?.items ?? [])] : [];
    setGenerationProgress(items.length);
    try {
      for (let dayIndex = items.length; dayIndex < durationDays; dayIndex += 1) {
        const format = formats[dayIndex % formats.length]!;
        const dayNumber = dayIndex + 1;
        const dailyBrief = `${goal.trim()}\n\nCreate day ${dayNumber} of a ${durationDays}-day campaign. Today's distinct content angle: ${getDailyAngle(dayNumber)}. Do not reuse the same hook or main point from the previous days. Use only confirmed business facts and offers.`;
        const dailyResponse = await apiRequest<CampaignResponse>("/api/content/generate", {
          method: "POST",
          body: JSON.stringify({
            idea: dailyBrief,
            formats: [format],
            platforms: selectedPlatforms,
            tone: "Warm and confident",
            language: "English",
            useBrandProfile: true,
          }),
        });
        items.push(...dailyResponse.items);
        setGenerated({ ...dailyResponse, items: [...items] });
        setGenerationProgress(Math.min(items.length, durationDays));
      }
      await persistPlan(items);
    } catch (requestError) {
      setError(requestError instanceof Error
        ? items.length === durationDays
          ? `All ${durationDays} daily drafts are saved in Content, but the campaign plan could not be saved: ${requestError.message}`
          : items.length
            ? `${items.length} of ${durationDays} daily drafts are ready. Your generated drafts are saved in Content; continue the remaining days or save a partial plan: ${requestError.message}`
            : requestError.message
        : "Could not create this campaign.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="dashboard-content campaign-page">
      <p className="eyebrow">YOUR STUDIO · CAMPAIGNS</p>
      <h1>Campaign builder</h1>
      <p className="dashboard-lead">Plan daily content, preview each design, and review the schedule before publishing.</p>
      {configurationLoaded && !geminiConfigured && <div className="notice notice-error" role="alert">{configurationError || <>AI generation is unavailable. Add <code>GOOGLE_AI_STUDIO_API_KEY</code>, <code>GROQ_API_KEY</code>, or <code>OPENAI_API_KEY</code> to <code>apps/api/.env</code>, then restart the API.</>}</div>}
      <form className="create-form campaign-form" onSubmit={(event) => void createCampaign(event)}>
        <fieldset className="campaign-fields" disabled={creating || Boolean(generated && !savedPlan)}>
        <label className="create-idea-field">Campaign goal and brief
          <textarea required minLength={8} maxLength={1000} rows={3} value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="What are you promoting, who is it for, and what should people do next?" />
        </label>
        <details className="campaign-optional-fields">
          <summary>Campaign name and audience <span>Optional</span></summary>
          <div className="campaign-optional-grid">
            <label className="create-idea-field">Campaign name
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Optional: use a short campaign name" />
            </label>
            <label className="create-idea-field">Audience
              <input value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={500} placeholder="Who should this campaign reach?" />
            </label>
          </div>
        </details>
        <fieldset className="create-fieldset">
          <legend>Content formats</legend>
          <div className="create-option-grid">
            {campaignFormats.map((format) => (
              <label className="create-check" key={format}>
                <input type="checkbox" checked={formats.includes(format)} onChange={() => toggle(format, formats, setFormats)} />
                {formatLabels[format]}
              </label>
            ))}
          </div>
          <small className="campaign-format-help">Selected formats rotate through the daily schedule. Every day gets its own generated visual and draft.</small>
        </fieldset>
        <fieldset className="create-fieldset">
          <legend>Platforms</legend>
          <div className="create-option-grid create-platform-grid">
            {platforms.map((platform) => (
              <label className="create-check" key={platform}>
                <input type="checkbox" checked={selectedPlatforms.includes(platform)} onChange={() => toggle(platform, selectedPlatforms, setSelectedPlatforms)} />
                {platform}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="create-select-grid">
          <label>Start date
            <input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>Campaign duration
            <select value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))}>
              <option value={7}>1 week</option><option value={14}>2 weeks</option><option value={30}>30 days</option>
            </select>
          </label>
        </div>
        <small className="campaign-format-help">A 30-day plan uses 30 monthly AI generations. Nothing is scheduled or published automatically.</small>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        {error && generated && generated.items.length < durationDays && <button type="button" className="button button-outline" disabled={creating} onClick={() => void createCampaign(undefined, true)}>Continue remaining days</button>}
        {error && generated && generated.items.length < durationDays && <button type="button" className="button button-outline" disabled={creating} onClick={() => void savePartialPlan()}>Save partial plan ({generated.items.length}/{durationDays})</button>}
        {error && generated && generated.items.length === durationDays && !savedPlan && <button type="button" className="button button-outline" disabled={creating} onClick={() => void createCampaign(undefined, true)}>Save plan</button>}
        {notice && <p className="form-success" role="status">{notice}{savedPlan && <> <Link href="/dashboard/content-plans">Open plan</Link></>}</p>}
        <button type="submit" className="button button-gold" disabled={creating || formats.length === 0 || selectedPlatforms.length === 0 || Boolean(generated && !savedPlan)}>
          {creating ? `Generating day ${Math.min(generationProgress + 1, durationDays)} of ${durationDays}…` : generated && !savedPlan ? "Continue or save the plan above" : `${generated ? "Regenerate" : "Generate"} ${durationDays}-day plan`}
        </button>
        {creating && <progress className="campaign-generation-progress" max={durationDays} value={generationProgress} aria-label={`Generated ${generationProgress} of ${durationDays} daily drafts`} />}
        {generated && <p className="create-usage">{generated.usage.limit === null ? `${generated.usage.used} generations used this month · Unlimited during trial` : `${generated.usage.used} of ${generated.usage.limit} generations used this month`} · Latest provider: {generated.provider}</p>}
      </form>
      {generated && (
        <section className="campaign-results" aria-label="Generated campaign drafts">
          <div className="created-results-heading"><div><p className="card-kicker">DAILY CONTENT · {generated.items.length}/{durationDays}</p><h2>{savedPlan?.name ?? (name || goal)}</h2><p>Open a day to inspect its artwork and copy.</p></div><Link href="/dashboard/content">Review all drafts →</Link></div>
          <div className="campaign-draft-list">
            {(showAllDays ? generated.items : generated.items.slice(0, 6)).map((item, index) => {
              const scheduledDate = new Date(`${startDate}T09:00:00`);
              scheduledDate.setDate(scheduledDate.getDate() + index);
              const document = item.designs[0]?.designJson.document;
              return (
                <article className="campaign-draft-card" key={item.id}>
                  <header><span>DAY {String(index + 1).padStart(2, "0")}</span><time dateTime={scheduledDate.toISOString()}>{scheduledDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></header>
                  {document && <div className="campaign-draft-visual"><DesignDocumentPreview document={document} title={item.contentJson.title} compact /></div>}
                  <div className="campaign-draft-copy"><span>{item.contentJson.format.replaceAll("-", " ")}</span><h3>{item.contentJson.title}</h3></div>
                  <details className="campaign-draft-details">
                    <summary>Read draft copy</summary>
                    <p>{item.contentJson.caption}</p>
                    <small>{item.contentJson.platforms.join(" · ")}</small>
                  </details>
                </article>
              );
            })}
          </div>
          {generated.items.length > 6 && <button className="button button-outline campaign-show-days" type="button" onClick={() => setShowAllDays((visible) => !visible)}>{showAllDays ? "Show fewer days" : `Show all ${generated.items.length} days`}</button>}
        </section>
      )}
    </section>
  );
}

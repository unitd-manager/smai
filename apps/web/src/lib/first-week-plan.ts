import { apiRequest } from "@/lib/api";
import { localDateTimeToIso } from "@/lib/timezone";

type BrandResponse = {
  brand: {
    name: string;
    timezone: string;
    profile: { audience?: string | null; tone?: string | null; preferredPlatforms?: string[] | null; languages?: string[] | null } | null;
  };
};
type GeneratedResponse = { items: Array<{ id: string; contentJson: Record<string, unknown> }> };

export async function generateFirstWeekPlan() {
  const { brand } = await apiRequest<BrandResponse>("/api/brand-profile");
  const preferredPlatforms = brand.profile?.preferredPlatforms?.filter((platform) => platform.trim().length >= 2) ?? [];
  const preferredInstagram = preferredPlatforms.find((platform) => platform.toLowerCase() === "instagram");
  if (!preferredInstagram) {
    throw new Error("Add Instagram to your preferred platforms. Instagram is the only live publishing integration currently supported.");
  }
  const platforms = [preferredInstagram];
  const timezone = brand.timezone || "UTC";
  const generated = await apiRequest<GeneratedResponse>("/api/content/generate", {
    method: "POST",
    body: JSON.stringify({
      idea: "Create a launch week of useful social content for " + brand.name + ". Introduce what the brand offers, explain practical customer benefits, and invite the audience to take a clear next step. Use the saved brand profile, audience, goals, and voice.",
      formats: ["post", "carousel", "post", "carousel", "post"],
      platforms,
      tone: brand.profile?.tone || "",
      language: brand.profile?.languages?.[0] || "English",
      useBrandProfile: true,
    }),
  });
  const todayParts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const getTodayPart = (name: string) => todayParts.find((part) => part.type === name)?.value ?? "0";
  const today = new Date(Date.UTC(Number(getTodayPart("year")), Number(getTodayPart("month")) - 1, Number(getTodayPart("day"))));
  const formats = ["post", "carousel", "post", "carousel", "post"];
  const times = ["10:00", "12:00", "14:00", "16:00", "18:00"];
  const items = generated.items.slice(0, formats.length).map((item, index) => {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() + index + 1);
    const localDate = day.toISOString().slice(0, 10);
    const localTime = times[index] ?? "10:00";
    const scheduledAt = localDateTimeToIso(localDate + "T" + localTime, timezone);
    if (!scheduledAt) throw new Error("Could not set a valid publishing time in " + timezone + ".");
    const format = item.contentJson.format;
    return {
      contentId: item.id,
      scheduledAt,
      format: typeof format === "string" ? format : formats[index] ?? "post",
      platforms,
    };
  });
  if (items.length !== formats.length) throw new Error("The AI provider did not return every requested starter format. Try again.");
  const orderedTimes = items.map((item) => new Date(item.scheduledAt).getTime()).sort((a, b) => a - b);
  const created = await apiRequest<{ plan: { id: string; name: string; startsAt: string; endsAt: string; status: string; planJson: { goal: string; audience: string; platforms: string[]; items: typeof items } } }>("/api/content-plans", {
    method: "POST",
    body: JSON.stringify({
      name: brand.name + " · First week",
      goal: "Introduce the brand, share useful customer guidance, and invite the audience to take a next step.",
      audience: brand.profile?.audience || "",
      startsAt: new Date(orderedTimes[0]! - 24 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(orderedTimes[orderedTimes.length - 1]! + 24 * 60 * 60 * 1000).toISOString(),
      platforms,
      items,
    }),
  });
  const execution = await apiRequest<{ created: number }>(`/api/content-plans/${encodeURIComponent(created.plan.id)}/execute`, {
    method: "POST",
    body: JSON.stringify({ mode: "approval" }),
  });
  return { plan: { ...created.plan, status: "IN_REVIEW" }, scheduledPosts: execution.created };
}

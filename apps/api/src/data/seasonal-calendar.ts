export type SeasonalMoment = {
  id: string;
  name: string;
  date: string;
  region: string[];
  source: string;
};

const fixedMoments: Array<{
  id: string;
  name: string;
  month: number;
  day: number;
  year?: number;
  region: string[];
  source: string;
}> = [
  { id: "world-kindness-day", name: "World Kindness Day", month: 11, day: 13, region: ["International"], source: "https://www.un.org/en/observances/world-kindness-day" },
  { id: "world-aids-day", name: "World AIDS Day", month: 12, day: 1, region: ["International"], source: "https://www.who.int/campaigns/world-aids-day" },
  { id: "new-years-day", name: "New Year's Day", month: 1, day: 1, region: ["International"], source: "https://www.un.org/en/observances/international-days-and-weeks" },
  { id: "international-womens-day", name: "International Women's Day", month: 3, day: 8, region: ["International"], source: "https://www.un.org/en/observances/womens-day" },
  { id: "world-health-day", name: "World Health Day", month: 4, day: 7, region: ["International"], source: "https://www.who.int/campaigns/world-health-day" },
  { id: "earth-day", name: "Earth Day", month: 4, day: 22, region: ["International"], source: "https://www.earthday.org/earth-day-2026/" },
  { id: "world-environment-day", name: "World Environment Day", month: 6, day: 5, region: ["International"], source: "https://www.un.org/en/observances/environment-day" },
  { id: "diwali-2026", name: "Diwali", month: 11, day: 8, year: 2026, region: ["India"], source: "https://www.timeanddate.com/holidays/india/diwali" },
  { id: "christmas-day", name: "Christmas Day", month: 12, day: 25, region: ["International"], source: "https://www.un.org/en/observances/international-days-and-weeks" },
] as const;

export function getUpcomingSeasonalMoments(now: Date, country: string | null, daysAhead = 45): SeasonalMoment[] {
  const end = new Date(now.getTime() + daysAhead * 86_400_000);
  const normalizedCountry = country?.trim().toLowerCase();
  return fixedMoments.flatMap((moment) => {
    let year = moment.year ?? now.getUTCFullYear();
    let date = new Date(Date.UTC(year, moment.month - 1, moment.day));
    if (date < now && moment.year === undefined) {
      year += 1;
      date = new Date(Date.UTC(year, moment.month - 1, moment.day));
    }
    if (date < now) return [];
    if (date > end || ((moment.region as readonly string[]).includes("India") &&
      normalizedCountry !== "india" && normalizedCountry !== "in")) return [];
    return [{
      id: moment.year === undefined ? `${moment.id}-${year}` : moment.id,
      name: moment.name,
      date: date.toISOString().slice(0, 10),
      region: [...moment.region],
      source: moment.source,
    }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

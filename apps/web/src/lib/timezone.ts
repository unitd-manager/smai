const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string) {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

function getZonedParts(timestamp: number, timezone: string) {
  const parts = getFormatter(timezone).formatToParts(new Date(timestamp));
  const values = new Map(parts.map(({ type, value }) => [type, Number(value)]));
  return {
    year: values.get("year")!,
    month: values.get("month")!,
    day: values.get("day")!,
    hour: values.get("hour")!,
    minute: values.get("minute")!,
    second: values.get("second")!,
  };
}

export function localDateTimeToIso(value: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: 0,
  };
  const desiredTimestamp = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  const normalized = new Date(desiredTimestamp);
  if (
    normalized.getUTCFullYear() !== desired.year ||
    normalized.getUTCMonth() + 1 !== desired.month ||
    normalized.getUTCDate() !== desired.day ||
    desired.hour > 23 ||
    desired.minute > 59
  ) return null;

  let timestamp = desiredTimestamp;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = getZonedParts(timestamp, timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const difference = desiredTimestamp - actualAsUtc;
    if (difference === 0) break;
    timestamp += difference;
  }

  const actual = getZonedParts(timestamp, timezone);
  if (Object.keys(desired).some((key) =>
    actual[key as keyof typeof actual] !== desired[key as keyof typeof desired]
  )) return null;
  return new Date(timestamp).toISOString();
}

export function getDateTimeInputValue(date: Date, timezone: string) {
  const parts = getZonedParts(date.getTime(), timezone);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function getTimezones(): string[] {
  return ["UTC", ...Intl.supportedValuesOf("timeZone").filter((timezone) => timezone !== "UTC")];
}

export function getTimezoneLabel(timezone: string) {
  const offset = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  }).formatToParts(new Date()).find((part) => part.type === "timeZoneName")?.value;
  return `${timezone.replaceAll("_", " ")}${offset ? ` · ${offset}` : ""}`;
}

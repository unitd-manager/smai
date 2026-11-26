
function localDateParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

export function getNextWeeklyAutopilotRunAt(now: Date, timezone: string, weekday: number, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const cursor = localDateParts(now, timezone);
  const currentDate = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day));
  const currentWeekday = currentDate.getUTCDay();
  let dayOffset = (weekday - currentWeekday + 7) % 7;
  let candidate = localDateTimeToDate({
    year: cursor.year,
    month: cursor.month,
    day: cursor.day + dayOffset,
  }, hour!, minute!, timezone);
  if (candidate <= now) {
    dayOffset += 7;
    const nextDate = new Date(currentDate.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    candidate = localDateTimeToDate({
      year: nextDate.getUTCFullYear(),
      month: nextDate.getUTCMonth() + 1,
      day: nextDate.getUTCDate(),
    }, hour!, minute!, timezone);
  }
  return candidate;
}

function localDateTimeToDate(date: { year: number; month: number; day: number }, hour: number, minute: number, timezone: string) {
  const desired = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let result = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(result));
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
    const represented = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"));
    result += desired - represented;
  }
  return new Date(result);
}

export function createInstagramAutopilotSchedule(now: Date, timezone: string, postCount = 13, days = 7) {
  const cursor = localDateParts(now, timezone);
  const day = Date.UTC(cursor.year, cursor.month - 1, cursor.day);
  const slots: Date[] = [];
  for (let index = 0; index < postCount; index += 1) {
    const dayIndex = Math.min(days - 1, Math.floor(index * days / postCount));
    const dayDate = new Date(day + (dayIndex + 1) * 24 * 60 * 60 * 1000);
    const date = { year: dayDate.getUTCFullYear(), month: dayDate.getUTCMonth() + 1, day: dayDate.getUTCDate() };
    const postsThisDay = Math.ceil(postCount / days);
    const withinDay = index % postsThisDay;
    const hour = postsThisDay === 1 ? 10 : Math.round(10 + (withinDay * 10) / (postsThisDay - 1));
    slots.push(localDateTimeToDate(date, hour, 0, timezone));
  }
  return slots;
}

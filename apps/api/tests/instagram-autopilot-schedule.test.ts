import assert from "node:assert/strict";
import test from "node:test";
import { createInstagramAutopilotSchedule } from "../src/services/instagram-autopilot-schedule.js";

test("schedules thirteen weekday posts in the brand timezone", () => {
  const slots = createInstagramAutopilotSchedule(new Date("2026-03-06T15:00:00.000Z"), "America/New_York");
  assert.equal(slots.length, 13);
  const localSlots = slots.map((slot) => new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(slot));
  assert.deepEqual(localSlots, [
    "Mon 10:00", "Mon 13:00", "Mon 16:00",
    "Tue 10:00", "Tue 13:00", "Tue 16:00",
    "Wed 10:00", "Wed 13:00", "Wed 16:00",
    "Thu 10:00", "Thu 15:00",
    "Fri 10:00", "Fri 15:00",
  ]);
});

test("keeps local publishing hours in a non-DST timezone", () => {
  const slots = createInstagramAutopilotSchedule(new Date("2026-05-10T18:00:00.000Z"), "Asia/Kolkata");
  assert.equal(slots.length, 13);
  assert.equal(slots[0]?.toISOString(), "2026-05-11T04:30:00.000Z");
  assert.equal(slots[1]?.toISOString(), "2026-05-11T07:30:00.000Z");
  assert.equal(slots[2]?.toISOString(), "2026-05-11T10:30:00.000Z");
});

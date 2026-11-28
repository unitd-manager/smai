import assert from "node:assert/strict";
import test from "node:test";
import {
  getTargetDialogueWords,
  generateVideoPlan,
  normalizeGeneratedVideoOutline,
  parseVideoPlanJson,
  selectVideoPlanProvider,
  videoPlanSchema,
} from "../src/services/video-plan.js";

test("video outline normalization accepts cast fields returned by an AI provider", () => {
  const normalized = normalizeGeneratedVideoOutline({
    cast: [
      { id: "A", name: "Maya", ageGroup: "adult", skinTone: "warm brown", hairstyle: "curly hair", outfit: "blue jacket", accessory: "gold pin", extra: true },
      { id: "B", name: "Ari", appearance: "A clear visual description", personality: "calm and reassuring", outfit: "green coat" },
      { id: "C", name: "Ravi" },
    ],
  }) as { cast: Array<Record<string, unknown>> };
  assert.deepEqual(normalized.cast[0], { id: "A", name: "Maya", appearance: "adult, warm brown, curly hair, blue jacket, gold pin", personality: "curious and thoughtful" });
  assert.deepEqual(normalized.cast[1], { id: "B", name: "Ari", appearance: "A clear visual description", personality: "calm and reassuring" });
  assert.equal(normalized.cast[2]?.personality, "helpful and upbeat");
});

test("video plan selection prefers Cloudflare Workers AI and configures Groq as an optional fallback", () => {
  assert.deepEqual(selectVideoPlanProvider({
    cloudflareApiToken: "cf-token",
    cloudflareAccountId: "a".repeat(32),
    cloudflareModel: "cloudflare-test",
    groqApiKey: "gsk-test",
    groqModel: "llama-test",
  }), {
    name: "cloudflare",
    model: "cloudflare-test",
    apiKey: "cf-token",
    accountId: "a".repeat(32),
    fallback: { name: "groq", model: "llama-test", apiKey: "gsk-test" },
  });
  assert.deepEqual(selectVideoPlanProvider({ groqApiKey: "gsk-test" }), {
    name: "groq",
    model: "openai/gpt-oss-120b",
    apiKey: "gsk-test",
  });
  assert.deepEqual(selectVideoPlanProvider({}), {
    name: "cloudflare",
    model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  });
});

test("video plan provider chains Cloudflare Workers AI, Groq, and OpenAI when configured", () => {
  assert.deepEqual(selectVideoPlanProvider({
    cloudflareApiToken: "cf-token",
    cloudflareAccountId: "a".repeat(32),
    cloudflareModel: "cloudflare-test",
    groqApiKey: "gsk-test",
    groqModel: "llama-test",
    openAiApiKey: "sk-openai-test",
  }), {
    name: "cloudflare",
    model: "cloudflare-test",
    apiKey: "cf-token",
    accountId: "a".repeat(32),
    fallback: {
      name: "groq",
      model: "llama-test",
      apiKey: "gsk-test",
      fallback: { name: "openai", model: "gpt-4o-mini", apiKey: "sk-openai-test" },
    },
  });
  assert.deepEqual(selectVideoPlanProvider({ openAiApiKey: "sk-openai-test" }), {
    name: "openai",
    model: "gpt-4o-mini",
    apiKey: "sk-openai-test",
  });
});

test("video plans fall through Cloudflare Workers AI and Groq to OpenAI", async () => {
  const provider = selectVideoPlanProvider({
    cloudflareApiToken: "cf.video-test",
    cloudflareAccountId: "a".repeat(32),
    cloudflareModel: "cloudflare-test",
    groqApiKey: "gsk.video-test",
    groqModel: "llama-test",
    openAiApiKey: "sk-openai-video-test",
  });
  const request = {
    idea: "A Pune clinic uses an AI receptionist to route appointment requests.",
    durationSeconds: 60,
    language: "English",
    brand: { name: "HASNA Clinic", colors: ["#123456"], logoUrl: null, handle: null },
  };
  const outline = {
    industry: "Healthcare",
    title: "A calmer clinic visit",
    hook: "A patient arrives as the desk is empty.",
    story: "The AI receptionist captures the appointment and routes the patient.",
    cast: [
      { id: "A", name: "Maya", appearance: "blue sphere with gold star", personality: "curious and thoughtful" },
      { id: "B", name: "Ari", appearance: "teal sphere with orange rim", personality: "calm and reassuring" },
      { id: "C", name: "Ravi", appearance: "purple sphere with a silver stripe", personality: "helpful and upbeat" },
    ],
    callToAction: "Book a demo with the clinic team.",
    scenes: Array.from({ length: 5 }, (_, index) => ({
      goal: `Show appointment step ${index + 1}`,
      setting: "waiting-area",
      ahaMoment: index === 2,
    })),
  };
  const dialogue = [
    { speaker: "A", text: "Could I book this?", emotion: "curious", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0 },
    { speaker: "B", text: "Yes, choose a time.", emotion: "warm", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
    { speaker: "C", text: "I can check availability.", emotion: "thoughtful", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
    { speaker: "A", text: "Can Doctor Rao see me?", emotion: "curious", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
    { speaker: "B", text: "I'll send that request.", emotion: "reassuring", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
    { speaker: "C", text: "Confirmation arrives right away.", emotion: "relieved", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
  ];
  const scenes = Array.from({ length: 5 }, (_, index) => ({
    durationSeconds: 12,
    setting: "waiting-area",
    characters: [
      { role: "Patient", action: "taps the phone and watches confirmation appear" },
      { role: "Receptionist", action: "points toward the appointment confirmation" },
      { role: "Clinic assistant", action: "checks the appointment calendar" },
    ],
    onScreenText: "Appointment confirmed",
    narration: dialogue.map((line) => line.text).join(" "),
    dialogue,
    props: ["phone", "calendar"],
    ahaMoment: index === 2,
  }));
  const originalFetch = globalThis.fetch;
  let cloudflareCalls = 0;
  let groqCalls = 0;
  let openAiCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.cloudflare.com")) {
      cloudflareCalls += 1;
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer cf.video-test");
      return new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), { status: 503 });
    }
    if (String(input).includes("api.groq.com")) {
      groqCalls += 1;
      return new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 });
    }
    if (String(input).includes("api.openai.com")) {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer sk-openai-video-test");
      openAiCalls += 1;
      const result = openAiCalls === 1 ? outline : scenes;
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(result) } }],
      }), { status: 200 });
    }
    assert.equal(String(input), "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer gsk.video-test");
    groqCalls += 1;
    const result = groqCalls === 1 ? outline : scenes;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(result) } }],
    }), { status: 200 });
  };

  try {
    const result = await generateVideoPlan(request, provider);
    assert.equal(cloudflareCalls, 3);
    assert.equal(groqCalls, 1);
    assert.equal(openAiCalls, 2);
    assert.equal(result.provider.name, "openai");
    assert.equal(result.plan.scenes.length, 5);
    assert.deepEqual(result.plan.cast?.map((character) => character.id), ["A", "B", "C"]);
    assert.ok(result.plan.scenes.every((scene) => scene.dialogue?.map((line) => line.speaker).join("") === "ABCABC"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Idea to MP4 generates its outline and scene chunk through Cloudflare Workers AI", async () => {
  const provider = selectVideoPlanProvider({ cloudflareApiToken: "cf.video-test", cloudflareAccountId: "a".repeat(32), cloudflareModel: "cloudflare-test" });
  const request = {
    idea: "A Pune clinic uses an AI receptionist to route appointment requests to the right doctor.",
    durationSeconds: 60,
    language: "English",
    brand: {
      name: "HASNA Clinic",
      industry: "Healthcare",
      description: "A neighborhood clinic.",
      colors: ["#123456"],
      logoUrl: null,
      handle: "@hasnaclinic",
    },
  };
  const outline = {
    industry: "Healthcare",
    title: "A clearer clinic visit",
    hook: "A patient arrives while the front desk is empty.",
    story: "The receptionist captures the request and routes it to the correct doctor.",
    cast: [
      { id: "A", name: "Maya", appearance: "blue sphere with a small gold star", personality: "curious and thoughtful" },
      { id: "B", name: "Ari", appearance: "teal sphere with a warm orange rim", personality: "calm and reassuring" },
      { id: "C", name: "Ravi", appearance: "purple sphere with a silver stripe", personality: "helpful and upbeat" },
    ],
    callToAction: "Book a demo with the clinic team.",
    scenes: Array.from({ length: 5 }, (_, index) => ({
      goal: `Show appointment step ${index + 1}`,
      setting: "waiting-area",
      ahaMoment: index === 2,
    })),
  };
  const dialogue = [
    { speaker: "A", text: "Could I book this?", emotion: "curious", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0 },
    { speaker: "B", text: "Yes, choose a time.", emotion: "warm", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
    { speaker: "C", text: "I can check availability.", emotion: "thoughtful", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
    { speaker: "A", text: "Can Doctor Rao see me?", emotion: "curious", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
    { speaker: "B", text: "I'll send that request.", emotion: "reassuring", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
    { speaker: "C", text: "Confirmation arrives right away.", emotion: "relieved", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
  ];
  const scenes = Array.from({ length: 5 }, (_, index) => ({
    durationSeconds: 12,
    setting: "waiting-area",
    characters: [
      { role: "Patient", action: "taps the phone and watches the confirmation appear" },
      { role: "Receptionist", action: "points toward the appointment confirmation" },
      { role: "Clinic assistant", action: "checks the appointment calendar" },
    ],
    onScreenText: "Appointment confirmed",
    narration: dialogue.map((line) => line.text).join(" "),
    dialogue,
    props: ["phone", "calendar"],
    ahaMoment: index === 2,
  }));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let repairedPrompt = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer cf.video-test");
    assert.equal(new URL(String(input)).search, "");
    calls += 1;
    if (calls < 3) {
      return new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), { status: 503 });
    }
    const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
    if (calls === 5) repairedPrompt = body.messages?.[1]?.content ?? "";
    const responseScenes = calls === 4
      ? []
      : scenes;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(calls === 3 ? outline : responseScenes) } }],
    }), { status: 200 });
  };

  try {
    const result = await generateVideoPlan(request, provider);
    assert.equal(calls, 5);
    assert.match(repairedPrompt, /each line must contain 3 to 12 words/i);
    assert.equal(result.provider.name, "cloudflare");
    assert.equal(result.plan.scenes.length, 5);
    assert.equal(result.plan.scenes.filter((scene) => scene.ahaMoment).length, 1);
    assert.deepEqual(result.plan.cast?.map((character) => character.id), ["A", "B", "C"]);
    assert.ok(result.plan.scenes.every((scene) => scene.dialogue?.map((line) => line.speaker).join("") === "ABCABC"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("video plan schema enforces supported props, bounded scene length, and directed dialogue", () => {
  const scene = {
    durationSeconds: 12,
    setting: "waiting-area",
    characters: [
      { role: "Patient", action: "taps the phone screen and watches the confirmation appear" },
      { role: "Receptionist", action: "points toward the appointment confirmation" },
      { role: "Clinic assistant", action: "checks the appointment calendar" },
    ],
    onScreenText: "Appointment confirmed",
    narration: "Could I book this? Yes, choose a time. I can check availability. Can Doctor Rao see me? I'll send that request. Confirmation arrives right away.",
    dialogue: [
      { speaker: "A", text: "Could I book this?", emotion: "curious", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0 },
      { speaker: "B", text: "Yes, choose a time.", emotion: "warm", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
      { speaker: "C", text: "I can check availability.", emotion: "thoughtful", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
      { speaker: "A", text: "Can Doctor Rao see me?", emotion: "curious", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
      { speaker: "B", text: "I'll send that request.", emotion: "reassuring", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
      { speaker: "C", text: "Confirmation arrives right away.", emotion: "relieved", pace: "natural", volume: "normal", energy: 3, pauseBeforeSeconds: 0.2 },
    ],
    props: ["phone", "calendar"],
    ahaMoment: false,
  };
  const plan = {
    industry: "Healthcare",
    title: "A calmer appointment check-in",
    hook: "A patient arrives while the front desk is empty.",
    story: "An AI receptionist answers the call and routes the patient to the right doctor.",
    cast: [
      { id: "A", name: "Maya", appearance: "blue and teal sphere with a small gold star", personality: "curious and thoughtful" },
      { id: "B", name: "Ari", appearance: "warm orange sphere with a blue rim", personality: "calm and reassuring" },
      { id: "C", name: "Ravi", appearance: "purple sphere with a silver stripe", personality: "helpful and upbeat" },
    ],
    scenes: Array.from({ length: 4 }, (_, index) => ({ ...scene, ahaMoment: index === 1 })),
    callToAction: "Book a demo with the clinic team.",
  };
  assert.equal(videoPlanSchema.safeParse(plan).success, true);
  assert.equal(videoPlanSchema.safeParse({
    ...plan,
    scenes: plan.scenes.map((item, index) => index === 0 ? { ...item, props: ["nonexistent-prop"] } : item),
  }).success, false);
});

test("dialogue word budgets scale with the requested duration", () => {
  assert.equal(getTargetDialogueWords(60, 5), 24);
  assert.equal(getTargetDialogueWords(300, 25), 25);
});

test("video plan JSON parser accepts fenced output and rejects incomplete output", () => {
  const expected = { title: "A {helpful} moment", scenes: [{ setting: "shop-front" }] };
  assert.deepEqual(parseVideoPlanJson(`\`\`\`json\n${JSON.stringify(expected)}\n\`\`\``), expected);
  assert.deepEqual(parseVideoPlanJson(`Provider note: ${JSON.stringify(expected)}`), expected);
  assert.throws(() => parseVideoPlanJson('{"title":"unfinished"'), /complete JSON document/);
});

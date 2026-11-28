import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudflareContentProvider,
  ContentProviderError,
  generatedAssetSchema,
  GroqContentProvider,
  OpenAiContentProvider,
  selectContentProvider,
  type ContentRequest,
} from "../src/services/content-generator.js";

const request: ContentRequest = {
  idea: "Promote the spring tasting menu for nearby guests",
  formats: ["post"],
  platforms: ["Instagram"],
  tone: "Warm and confident",
  language: "English",
  brand: {
    name: "Juniper House",
    industry: "Restaurant",
    description: "A neighborhood restaurant serving seasonal meals.",
    products: "Seasonal meals",
    audience: "Curious local guests",
    offers: "A spring tasting menu",
    tone: "Thoughtful",
    colors: ["#253746", "#C6A477"],
  },
};

const validAsset = {
  format: "post",
  title: "Spring tasting at Juniper House",
  caption: "Explore the spring tasting menu at Juniper House, made with seasonal ingredients.",
  hashtags: ["#SpringTasting"],
  idea: "Promote the spring tasting menu for nearby guests",
  pillar: "Seasonal menu",
  firstComment: "Ask us about the spring tasting menu.",
  platformCaptions: [{
    platform: "Instagram",
    caption: "Spring flavors are on the menu at Juniper House.",
    hashtags: ["#SpringTasting"],
  }],
};

const cloudflareAccountId = "a".repeat(32);
const cloudflareModel = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function cloudflareResponse(text: string) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: text } }],
  }), { status: 200 });
}

test("Cloudflare Workers AI uses chat completions with JSON output and business context", async () => {
  const provider = new CloudflareContentProvider(cloudflareAccountId, "cf-test-token", cloudflareModel);
  const originalFetch = globalThis.fetch;
  let url = "";
  let body: Record<string, unknown> | undefined;
  globalThis.fetch = async (input, init) => {
    url = String(input);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer cf-test-token");
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return cloudflareResponse(JSON.stringify({ items: [validAsset] }));
  };

  try {
    const generated = await provider.generate(request);
    assert.equal(new URL(url).pathname, `/client/v4/accounts/${cloudflareAccountId}/ai/v1/chat/completions`);
    assert.equal(new URL(url).search, "");
    assert.equal(generated[0]?.title, validAsset.title);
    assert.deepEqual(generatedAssetSchema.safeParse(generated[0]).success, true);
    assert.deepEqual(body?.response_format, { type: "json_object" });
    assert.equal(JSON.stringify(body).includes(request.brand.name), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare Workers AI retries invalid JSON once and then returns validated output", async () => {
  const provider = new CloudflareContentProvider(cloudflareAccountId, "cf-test-token", cloudflareModel);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return cloudflareResponse(calls === 1 ? "{not-json" : JSON.stringify({ items: [validAsset] }));
  };

  try {
    const generated = await provider.generate(request);
    assert.equal(calls, 2);
    assert.equal(generated[0]?.title, validAsset.title);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare Workers AI retries temporary overload and reports failure without fallback content", async () => {
  const provider = new CloudflareContentProvider(cloudflareAccountId, "cf-test-token", cloudflareModel);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), { status: 503 });
  };

  try {
    await assert.rejects(
      provider.generate(request),
      (error: unknown) => error instanceof ContentProviderError
        && error.provider === "cloudflare"
        && error.status === 503
        && error.message.includes("attempted 3 times"),
    );
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare Workers AI recovers when a temporary overload clears during retry", async () => {
  const provider = new CloudflareContentProvider(cloudflareAccountId, "cf-test-token", cloudflareModel);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls < 3
      ? new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), { status: 503 })
      : cloudflareResponse(JSON.stringify({ items: [validAsset] }));
  };

  try {
    const generated = await provider.generate(request);
    assert.equal(calls, 3);
    assert.equal(generated[0]?.title, validAsset.title);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("social content automatically falls back to Groq after Cloudflare remains overloaded", async () => {
  const provider = selectContentProvider({
    cloudflareAccountId,
    cloudflareApiToken: "cf-test-token",
    cloudflareModel,
    groqApiKey: "gsk-test",
    groqModel: "llama-test",
  });
  const originalFetch = globalThis.fetch;
  let cloudflareCalls = 0;
  let groqCalls = 0;
  globalThis.fetch = async (input, init) => {
    if (String(input).includes("api.cloudflare.com")) {
      cloudflareCalls += 1;
      return new Response(JSON.stringify({ error: { code: 503, status: "UNAVAILABLE" } }), { status: 503 });
    }
    assert.equal(String(input), "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer gsk-test");
    groqCalls += 1;
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items: [validAsset] }) } }],
    }), { status: 200 });
  };

  try {
    const generated = await provider.generate(request);
    assert.equal(cloudflareCalls, 3);
    assert.equal(groqCalls, 1);
    assert.equal(provider.name, "groq");
    assert.equal(generated[0]?.title, validAsset.title);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("social content falls through Cloudflare and Groq to optional OpenAI", async () => {
  const provider = selectContentProvider({
    cloudflareAccountId,
    cloudflareApiToken: "cf-test-token",
    cloudflareModel,
    groqApiKey: "gsk-test",
    groqModel: "llama-test",
    openAiApiKey: "sk-openai-test",
  });
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("api.cloudflare.com")) {
      return new Response(JSON.stringify({ error: { code: 401, status: "UNAUTHENTICATED" } }), { status: 401 });
    }
    if (url.includes("api.groq.com")) {
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer gsk-test");
      return new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 });
    }
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer sk-openai-test");
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ items: [validAsset] }) } }],
    }), { status: 200 });
  };

  try {
    const generated = await provider.generate(request);
    assert.equal(generated[0]?.title, validAsset.title);
    assert.equal(provider.name, "openai");
    assert.deepEqual(calls, [
      `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/ai/v1/chat/completions`,
      "https://api.groq.com/openai/v1/chat/completions",
      "https://api.openai.com/v1/chat/completions",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OpenAI can be selected as the sole configured text provider", () => {
  const provider = selectContentProvider({ openAiApiKey: "sk-openai-test" });
  assert.ok(provider instanceof OpenAiContentProvider);
  assert.equal(provider.name, "openai");
  assert.equal(provider.model, "gpt-4o-mini");
});

test("Groq can be selected as the sole configured text provider", () => {
  const provider = selectContentProvider({ groqApiKey: "gsk-test", groqModel: "llama-test" });
  assert.ok(provider instanceof GroqContentProvider);
  assert.equal(provider.name, "groq");
});

test("Groq retries a carousel missing slides and requests the exact carousel schema", async () => {
  const provider = new GroqContentProvider("gsk-test", "openai/gpt-oss-120b");
  const carouselRequest: ContentRequest = { ...request, formats: ["carousel"], carouselSlideCount: 6 };
  const validCarousel = {
    ...validAsset,
    format: "carousel",
    slides: Array.from({ length: 6 }, (_, index) => ({
      headline: `Spring menu ${index + 1}`,
      subheading: "Seasonal ingredients",
      body: "Explore a seasonal dish at Juniper House.",
    })),
  };
  const originalFetch = globalThis.fetch;
  const requestBodies: Array<Record<string, unknown>> = [];
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    calls += 1;
    const invalidCarousel = { ...validAsset, format: "carousel" };
    return new Response(JSON.stringify({
      choices: [{ message: { content: calls === 1
        ? JSON.stringify({ items: [invalidCarousel] })
        : JSON.stringify({ items: [validCarousel] }) } }],
    }), { status: 200 });
  };

  try {
    const generated = await provider.generate(carouselRequest);
    assert.equal(calls, 2);
    assert.equal(generated[0]?.slides?.length, 6);
    const firstBody = requestBodies[0]!;
    const responseFormat = firstBody.response_format as {
      type: string;
      json_schema: { strict: boolean; schema: { properties: { items: { items: { anyOf: Array<{ required: string[]; properties: { slides: { minItems: number; maxItems: number } } }> } } } } };
    };
    assert.equal(responseFormat.type, "json_schema");
    assert.equal(responseFormat.json_schema.strict, false);
    assert.equal(responseFormat.json_schema.schema.properties.items.items.anyOf[0]?.required.includes("slides"), true);
    assert.equal(responseFormat.json_schema.schema.properties.items.items.anyOf[0]?.properties.slides.minItems, 6);
    assert.equal(responseFormat.json_schema.schema.properties.items.items.anyOf[0]?.properties.slides.maxItems, 6);
    const retryPrompt = String((requestBodies[1]?.messages as Array<{ content: string }>)[1]?.content);
    assert.match(retryPrompt, /Validation issue:/);
    assert.match(retryPrompt, /slides/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Groq uses the supported default model and reports unavailable model IDs clearly", async () => {
  const defaultProvider = selectContentProvider({ groqApiKey: "gsk-test" });
  assert.ok(defaultProvider instanceof GroqContentProvider);
  assert.equal(defaultProvider.model, "openai/gpt-oss-120b");

  const provider = new GroqContentProvider("gsk-test", "retired-model");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: "model not found" } }), { status: 404 });

  try {
    await assert.rejects(
      provider.generate(request),
      (error: unknown) => error instanceof ContentProviderError
        && error.provider === "groq"
        && error.status === 404
        && error.message.includes("retired-model")
        && error.message.includes("GROQ_MODEL"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("unresolved template placeholders are rejected and never returned as generated content", async () => {
  const provider = new CloudflareContentProvider(cloudflareAccountId, "cf-test-token", cloudflareModel);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => cloudflareResponse(JSON.stringify({
    items: [{ ...validAsset, caption: "A better experience for [Your Brand] customers." }],
  }));

  try {
    await assert.rejects(
      provider.generate(request),
      (error: unknown) => error instanceof ContentProviderError
        && error.status === 502
        && error.message.includes("template placeholder"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generic-sounding but complete copy is not treated as an unresolved placeholder", async () => {
  const provider = new CloudflareContentProvider(cloudflareAccountId, "cf-test-token", cloudflareModel);
  const originalFetch = globalThis.fetch;
  const contextualAsset = {
    ...validAsset,
    caption: "A better everyday experience starts with our spring tasting menu, made with seasonal ingredients.",
    firstComment: "Our social media page shares the latest seasonal menu details.",
  };
  globalThis.fetch = async () => cloudflareResponse(JSON.stringify({ items: [contextualAsset] }));

  try {
    const generated = await provider.generate(request);
    assert.equal(generated[0]?.caption, contextualAsset.caption);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Cloudflare provider selection requires both account ID and API token", () => {
  assert.equal(selectContentProvider({
    cloudflareAccountId,
    cloudflareApiToken: "cf-test-token",
  }).name, "cloudflare");
  assert.throws(
    () => selectContentProvider({ cloudflareAccountId }),
    (error: unknown) => error instanceof ContentProviderError
      && error.message.includes("CLOUDFLARE_API_TOKEN"),
  );
});

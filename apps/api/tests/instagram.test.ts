import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

process.env.INSTAGRAM_APP_ID = "test-instagram-app";
process.env.INSTAGRAM_APP_SECRET = "test-instagram-secret";
process.env.INSTAGRAM_REDIRECT_URI = "https://api.example.test/api/social-accounts/instagram/callback";
process.env.PUBLIC_API_URL = "https://api.example.test";
process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = "a".repeat(64);

const instagram = await import("../src/services/instagram.js");

test("Instagram OAuth URL requests only publishing permissions and carries signed server state", () => {
  const authorizationUrl = new URL(instagram.makeInstagramAuthorizationUrl("oauth-state"));
  assert.equal(authorizationUrl.origin, "https://www.instagram.com");
  assert.equal(authorizationUrl.pathname, "/oauth/authorize");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "test-instagram-app");
  assert.equal(authorizationUrl.searchParams.get("redirect_uri"), process.env.INSTAGRAM_REDIRECT_URI);
  assert.equal(authorizationUrl.searchParams.get("response_type"), "code");
  assert.equal(
    authorizationUrl.searchParams.get("scope"),
    "instagram_business_basic,instagram_business_content_publish",
  );
  assert.equal(authorizationUrl.searchParams.get("state"), "oauth-state");
});

test("Instagram code exchange accepts Meta's short-lived response without expires_in", async () => {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  const responses = [
    { data: [{ access_token: "short-lived-token", user_id: "instagram-user" }] },
    { access_token: "long-lived-token", token_type: "bearer", expires_in: 5_183_944 },
    { data: [{ user_id: "instagram-user", username: "scaleup198" }] },
  ];
  globalThis.fetch = async (input) => {
    requests.push(new URL(input instanceof Request ? input.url : input.toString()));
    const body = responses.shift();
    assert.ok(body);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const account = await instagram.exchangeInstagramCode("authorization-code");
    assert.equal(account.providerAccountId, "instagram-user");
    assert.equal(account.displayName, "@scaleup198");
    assert.ok(account.tokenExpiresAt instanceof Date);
    assert.equal(requests.length, 3);
    assert.equal(requests[0].origin, "https://api.instagram.com");
    assert.equal(requests[1].searchParams.get("access_token"), "short-lived-token");
    assert.equal(requests[2].searchParams.get("fields"), "user_id,username");
    const credentials = await instagram.getInstagramAccessToken({
      id: "unused-account-id",
      encryptedTokens: account.encryptedTokens,
      tokenExpiresAt: account.tokenExpiresAt,
    });
    assert.equal(credentials.accessToken, "long-lived-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram media history follows trusted cursors and returns every visible media ID", async () => {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  const responses = [
    {
      data: [{ id: "published-1" }],
      paging: { next: "https://graph.instagram.com/v26.0/instagram-user/media?after=cursor-2" },
    },
    { data: [{ id: "published-2" }] },
  ];
  globalThis.fetch = async (input) => {
    requests.push(new URL(input instanceof Request ? input.url : input.toString()));
    const body = responses.shift();
    assert.ok(body);
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const mediaIds = await instagram.listInstagramMediaIds({
      id: "instagram-account",
      providerAccountId: "instagram-user",
      encryptedTokens: instagram.encryptInstagramToken("test-access-token"),
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    assert.deepEqual([...mediaIds], ["published-1", "published-2"]);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].pathname, "/v26.0/instagram-user/media");
    assert.equal(requests[0].searchParams.get("fields"), "id");
    assert.equal(requests[1].searchParams.get("after"), "cursor-2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram media conversion accepts the generated 1080 by 1080 square preview", async () => {
  const image = await instagram.convertInstagramSvgToJpeg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#ffffff"/></svg>',
  );
  const metadata = await sharp(image).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.width, 1080);
  assert.equal(metadata.height, 1080);
});

test("Instagram access tokens are encrypted and signed media links expire", () => {
  const accessToken = "private-instagram-access-token";
  const encryptedToken = instagram.encryptInstagramToken(accessToken);
  assert.notEqual(encryptedToken, accessToken);
  assert.ok(!encryptedToken.includes(accessToken));

  const mediaUrl = new URL(instagram.makeInstagramMediaUrl("target-123"));
  const expires = mediaUrl.searchParams.get("expires")!;
  const signature = mediaUrl.searchParams.get("signature")!;
  assert.equal(mediaUrl.origin, "https://api.example.test");
  assert.equal(mediaUrl.pathname, "/api/social-accounts/instagram-media/target-123");
  assert.equal(mediaUrl.searchParams.get("index"), "0");
  assert.equal(instagram.verifyInstagramMediaSignature("target-123", expires, signature), true);
  assert.equal(instagram.verifyInstagramMediaSignature("different-target", expires, signature), false);
  assert.equal(instagram.verifyInstagramMediaSignature("target-123", "1", signature), false);
  const slideUrl = new URL(instagram.makeInstagramMediaUrl("target-123", 5));
  assert.equal(slideUrl.searchParams.get("index"), "5");
  assert.equal(instagram.verifyInstagramMediaSignature("target-123", slideUrl.searchParams.get("expires")!, slideUrl.searchParams.get("signature")!, 5), true);
  assert.equal(instagram.verifyInstagramMediaSignature("target-123", slideUrl.searchParams.get("expires")!, slideUrl.searchParams.get("signature")!, 4), false);

  const videoUrl = new URL(instagram.makeInstagramMediaUrl("target-video", 0, "video"));
  const videoExpires = videoUrl.searchParams.get("expires")!;
  const videoSignature = videoUrl.searchParams.get("signature")!;
  assert.equal(videoUrl.searchParams.get("type"), "video");
  assert.equal(instagram.verifyInstagramMediaSignature("target-video", videoExpires, videoSignature, 0, "video"), true);
  assert.equal(instagram.verifyInstagramMediaSignature("target-video", videoExpires, videoSignature, 0, "image"), false);
});

test("Instagram single-image publishing still creates and publishes one image container", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: URL; method: string; form?: URLSearchParams }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    const form = init?.body instanceof URLSearchParams ? init.body : undefined;
    requests.push({ url, method, form });

    if (method === "POST" && url.pathname.endsWith("/media")) {
      assert.equal(form?.get("caption"), "Single image caption");
      assert.equal(form?.get("media_type"), null);
      assert.equal(form?.get("is_carousel_item"), null);
      return new Response(JSON.stringify({ id: "image-container" }), { status: 200 });
    }
    if (method === "GET" && url.pathname.endsWith("/image-container")) {
      return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
    }
    if (method === "POST" && url.pathname.endsWith("/media_publish")) {
      assert.equal(form?.get("creation_id"), "image-container");
      return new Response(JSON.stringify({ id: "published-image" }), { status: 200 });
    }
    assert.fail(`Unexpected Instagram request: ${method} ${url.pathname}`);
  };

  try {
    const result = await instagram.publishInstagramPost({
      targetId: "image-target",
      socialAccountId: "instagram-account",
      providerAccountId: "instagram-user",
      encryptedTokens: instagram.encryptInstagramToken("test-access-token"),
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      caption: "Single image caption",
      media: ["data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E"],
    });

    assert.equal(result.platformPostId, "published-image");
    const mediaRequest = requests.find((request) => request.method === "POST" && request.url.pathname.endsWith("/media"));
    assert.ok(mediaRequest?.form?.get("image_url"));
    assert.equal(new URL(mediaRequest!.form!.get("image_url")!).searchParams.get("index"), "0");
    assert.equal(requests.filter((request) => request.method === "POST" && request.url.pathname.endsWith("/media_publish")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram publishes all carousel slides in one post with one caption", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: URL; method: string; form?: URLSearchParams }> = [];
  let childCount = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    const form = init?.body instanceof URLSearchParams ? init.body : undefined;
    requests.push({ url, method, form });

    if (method === "POST" && url.pathname.endsWith("/media")) {
      if (form?.get("is_carousel_item") === "true") {
        childCount += 1;
        return new Response(JSON.stringify({ id: `child-${childCount}` }), { status: 200 });
      }
      assert.equal(form?.get("media_type"), "CAROUSEL");
      assert.equal(form?.get("children"), "child-1,child-2,child-3,child-4,child-5,child-6");
      assert.equal(form?.get("caption"), "A useful caption\n\n#smallbusiness #automation");
      return new Response(JSON.stringify({ id: "carousel-container" }), { status: 200 });
    }
    if (method === "GET" && url.pathname.endsWith("/carousel-container")) {
      return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
    }
    if (method === "GET" && /\/child-\d+$/.test(url.pathname)) {
      return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
    }
    if (method === "POST" && url.pathname.endsWith("/media_publish")) {
      assert.equal(form?.get("creation_id"), "carousel-container");
      return new Response(JSON.stringify({ id: "published-carousel" }), { status: 200 });
    }
    assert.fail(`Unexpected Instagram request: ${method} ${url.pathname}`);
  };

  try {
    const result = await instagram.publishInstagramPost({
      targetId: "carousel-target",
      socialAccountId: "instagram-account",
      providerAccountId: "instagram-user",
      encryptedTokens: instagram.encryptInstagramToken("test-access-token"),
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      caption: "A useful caption\n\n#smallbusiness #automation",
      media: Array.from({ length: 6 }, (_value, index) =>
        `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg>${index + 1}</svg>`)}`,
      ),
    });

    assert.equal(result.platformPostId, "published-carousel");
    assert.equal(childCount, 6);
    const children = requests.filter((request) => request.form?.get("is_carousel_item") === "true");
    assert.equal(children.length, 6);
    assert.deepEqual(children.map((request) => new URL(request.form!.get("image_url")!).searchParams.get("index")),
      ["0", "1", "2", "3", "4", "5"]);
    assert.equal(requests.filter((request) => request.method === "POST" && request.url.pathname.endsWith("/media_publish")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram publishes a rendered video as a Reel", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: URL; method: string; form?: URLSearchParams }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    const form = init?.body instanceof URLSearchParams ? init.body : undefined;
    requests.push({ url, method, form });

    if (method === "POST" && url.pathname.endsWith("/media")) {
      assert.equal(form?.get("media_type"), "REELS");
      assert.equal(form?.get("share_to_feed"), "true");
      assert.equal(form?.get("caption"), "Video caption");
      const videoUrl = new URL(form?.get("video_url") ?? "");
      assert.equal(videoUrl.searchParams.get("type"), "video");
      return new Response(JSON.stringify({ id: "reel-container" }), { status: 200 });
    }
    if (method === "GET" && url.pathname.endsWith("/reel-container")) {
      return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
    }
    if (method === "POST" && url.pathname.endsWith("/media_publish")) {
      assert.equal(form?.get("creation_id"), "reel-container");
      return new Response(JSON.stringify({ id: "published-reel" }), { status: 200 });
    }
    assert.fail(`Unexpected Instagram request: ${method} ${url.pathname}`);
  };

  try {
    const result = await instagram.publishInstagramPost({
      targetId: "video-target",
      socialAccountId: "instagram-account",
      providerAccountId: "instagram-user",
      encryptedTokens: instagram.encryptInstagramToken("test-access-token"),
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      caption: "Video caption",
      media: [{ type: "video", storageKey: "rendered/video.mp4" }],
    });

    assert.equal(result.platformPostId, "published-reel");
    assert.equal(requests.filter((request) => request.method === "POST" && request.url.pathname.endsWith("/media_publish")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram publishes an imported video through its signed media link", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: URL; method: string; form?: URLSearchParams }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    const form = init?.body instanceof URLSearchParams ? init.body : undefined;
    requests.push({ url, method, form });

    if (method === "POST" && url.pathname.endsWith("/media")) {
      const videoUrl = new URL(form?.get("video_url") ?? "");
      assert.equal(form?.get("media_type"), "REELS");
      assert.equal(videoUrl.pathname, "/api/social-accounts/instagram-media/upload-target");
      assert.equal(videoUrl.searchParams.get("type"), "video");
      assert.equal(typeof videoUrl.searchParams.get("signature"), "string");
      return new Response(JSON.stringify({ id: "upload-reel-container" }), { status: 200 });
    }
    if (method === "GET" && url.pathname.endsWith("/upload-reel-container")) {
      return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
    }
    if (method === "POST" && url.pathname.endsWith("/media_publish")) {
      return new Response(JSON.stringify({ id: "published-upload-reel" }), { status: 200 });
    }
    assert.fail(`Unexpected Instagram request: ${method} ${url.pathname}`);
  };

  try {
    const result = await instagram.publishInstagramPost({
      targetId: "upload-target",
      socialAccountId: "instagram-account",
      providerAccountId: "instagram-user",
      encryptedTokens: instagram.encryptInstagramToken("test-access-token"),
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      caption: "Imported video",
      media: [{ type: "video", mediaAssetId: "uploaded-video" }],
    });

    assert.equal(result.platformPostId, "published-upload-reel");
    assert.equal(requests.filter((request) => request.method === "POST" && request.url.pathname.endsWith("/media_publish")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Instagram publishes an imported image through its signed media link", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: URL; method: string; form?: URLSearchParams }> = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    const form = init?.body instanceof URLSearchParams ? init.body : undefined;
    requests.push({ url, method, form });

    if (method === "POST" && url.pathname.endsWith("/media")) {
      const imageUrl = new URL(form?.get("image_url") ?? "");
      assert.equal(imageUrl.pathname, "/api/social-accounts/instagram-media/upload-image-target");
      assert.equal(imageUrl.searchParams.get("type"), "image");
      assert.equal(typeof imageUrl.searchParams.get("signature"), "string");
      return new Response(JSON.stringify({ id: "upload-image-container" }), { status: 200 });
    }
    if (method === "GET" && url.pathname.endsWith("/upload-image-container")) {
      return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
    }
    if (method === "POST" && url.pathname.endsWith("/media_publish")) {
      return new Response(JSON.stringify({ id: "published-upload-image" }), { status: 200 });
    }
    assert.fail(`Unexpected Instagram request: ${method} ${url.pathname}`);
  };

  try {
    const result = await instagram.publishInstagramPost({
      targetId: "upload-image-target",
      socialAccountId: "instagram-account",
      providerAccountId: "instagram-user",
      encryptedTokens: instagram.encryptInstagramToken("test-access-token"),
      tokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      caption: "Imported image",
      media: [{ type: "image", mediaAssetId: "uploaded-image" }],
    });

    assert.equal(result.platformPostId, "published-upload-image");
    assert.equal(requests.filter((request) => request.method === "POST" && request.url.pathname.endsWith("/media_publish")).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

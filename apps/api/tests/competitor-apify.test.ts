import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeApifyItems } from "../src/services/competitor-apify.js";

test("normalizes nested public post records and preserves only reported metrics", () => {
  const result = normalizeApifyItems([
    { recentPosts: [
      { url: "https://www.instagram.com/p/one/", caption: "A real caption", postedAt: "2026-11-20T10:00:00Z", likeCount: 18 },
      { url: "https://www.instagram.com/p/two/", caption: "Another caption", postedAt: "2026-11-19T10:00:00Z", commentCount: 4 },
    ] },
  ], "Instagram", "https://www.instagram.com/example/", {
    posts: "recentPosts", url: "url", caption: "caption", publishedAt: "postedAt", likes: "likeCount", comments: "commentCount",
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.topic, "A real caption");
  assert.deepEqual(result[0]?.metrics, { likes: 18 });
  assert.deepEqual(result[1]?.metrics, { comments: 4 });
  assert.equal(result[0]?.publishedAt, "2026-11-20T10:00:00.000Z");
});

test("drops invalid URLs, duplicates, and unavailable metric values without inventing data", () => {
  const result = normalizeApifyItems([
    { url: "http://example.com/post", text: "not secure" },
    { url: "https://example.com/post/1", text: "First", likes: null, views: "unavailable" },
    { url: "https://example.com/post/1", text: "Duplicate", likes: 999 },
  ], "Facebook", "https://facebook.com/example", { url: "url", caption: "text", likes: "likes", views: "views" });

  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.metrics, {});
  assert.equal(result[0]?.hook, "First");
});

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyMetaSignedRequest } from "../src/services/meta-signed-request.js";

function signedRequest(payload: unknown, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

test("verifies Meta signed requests and normalizes a numeric user id", () => {
  const request = signedRequest({ algorithm: "HMAC-SHA256", user_id: 12345 }, "meta-test-secret");
  assert.deepEqual(verifyMetaSignedRequest(request, ["meta-test-secret"]), { userId: "12345" });
});

test("accepts a signature from any configured Meta app secret", () => {
  const request = signedRequest({ algorithm: "HMAC-SHA256", user_id: "meta-user" }, "instagram-test-secret");
  assert.deepEqual(
    verifyMetaSignedRequest(request, ["facebook-test-secret", "instagram-test-secret"]),
    { userId: "meta-user" },
  );
});

test("rejects tampered, malformed, unsupported, or oversized signed requests", () => {
  const valid = signedRequest({ algorithm: "HMAC-SHA256", user_id: "meta-user" }, "meta-test-secret");
  const [signature, payload] = valid.split(".");
  const tampered = `${signature}.${Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "other-user" })).toString("base64url")}`;
  const unsupported = signedRequest({ algorithm: "HMAC-SHA1", user_id: "meta-user" }, "meta-test-secret");

  assert.equal(verifyMetaSignedRequest(tampered, ["meta-test-secret"]), null);
  assert.equal(verifyMetaSignedRequest(unsupported, ["meta-test-secret"]), null);
  assert.equal(verifyMetaSignedRequest(`${signature}.${payload}extra`, ["meta-test-secret"]), null);
  assert.equal(verifyMetaSignedRequest(`${"a".repeat(10_000)}.${payload}`, ["meta-test-secret"]), null);
  assert.equal(verifyMetaSignedRequest(valid, []), null);
});

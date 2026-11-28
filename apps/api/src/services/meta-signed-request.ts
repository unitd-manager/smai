import { createHmac, timingSafeEqual } from "node:crypto";

type MetaSignedRequestPayload = {
  userId: string;
};

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.toString("base64url") === value ? decoded : null;
}

export function verifyMetaSignedRequest(value: unknown, secrets: readonly string[]): MetaSignedRequestPayload | null {
  if (typeof value !== "string" || value.length > 8_192) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;

  const [signaturePart, payloadPart] = parts;
  const signature = decodeBase64Url(signaturePart!);
  const payloadBytes = decodeBase64Url(payloadPart!);
  if (!signature || signature.length !== 32 || !payloadBytes) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.algorithm !== "HMAC-SHA256") return null;

  let validSignature = false;
  for (const secret of secrets) {
    if (!secret) continue;
    const expected = createHmac("sha256", secret).update(payloadPart!).digest();
    if (timingSafeEqual(signature, expected)) validSignature = true;
  }
  if (!validSignature) return null;

  const rawUserId = record.user_id;
  const userId = typeof rawUserId === "string"
    ? rawUserId.trim()
    : typeof rawUserId === "number" && Number.isSafeInteger(rawUserId)
      ? String(rawUserId)
      : "";
  if (!userId || userId.length > 128) return null;

  return { userId };
}

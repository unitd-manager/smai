import { env } from "../env.js";

const apiBaseUrl = "https://api.magichour.ai/v1";

export class MagicHourError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MagicHourError";
  }
}

export type MagicHourJson = Record<string, unknown>;

export function magicHourAccounts() {
  return [env.MAGIC_HOUR_API_KEY, env.MAGIC_HOUR_API_KEY_2].flatMap((key, index) => key ? [{ key, slot: index + 1 }] : []);
}

function requireApiKey(slot = 1) {
  const account = magicHourAccounts().find((item) => item.slot === slot) ?? magicHourAccounts()[0];
  if (!account) throw new MagicHourError(503, "not_configured", "Magic Hour is not configured. Add MAGIC_HOUR_API_KEY to apps/api/.env and restart the API.");
  return account;
}

export async function magicHourRequest<T extends MagicHourJson>(path: string, init: RequestInit = {}, slot = 1): Promise<T> {
  const account = requireApiKey(slot);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${account.key}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(45_000),
    });
  } catch {
    throw new MagicHourError(503, "network_unavailable", "The API server could not reach Magic Hour. Check outbound HTTPS access from the API server, then retry.");
  }
  const text = await response.text();
  let body: MagicHourJson = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as MagicHourJson;
  } catch { /* handled below with a safe HTTP error */ }
  if (!response.ok) {
    const code = typeof body.code === "string" ? body.code : `http_${response.status}`;
    const providerMessage = typeof body.message === "string" ? body.message : "Magic Hour rejected the request.";
    throw new MagicHourError(response.status, code, providerMessage.replaceAll(account.key, "[redacted]").slice(0, 500));
  }
  return body as T;
}

export async function getMagicHourAccount(slot = 1) {
  return magicHourRequest<MagicHourJson>("/account", {}, slot);
}

export async function getMagicHourVoices(slot = 1) {
  return magicHourRequest<MagicHourJson>("/voices?limit=100", {}, slot);
}

export async function uploadMagicHourAsset(input: {
  bytes: Buffer;
  extension: string;
  type: "image" | "video" | "audio";
  contentType: string;
  slot?: number;
}) {
  const uploaded = await magicHourRequest<{ items?: Array<{ upload_url?: string; file_path?: string }> }>("/files/upload-urls", {
    method: "POST",
    body: JSON.stringify({ items: [{ type: input.type, extension: input.extension }] }),
  }, input.slot);
  const target = uploaded.items?.[0];
  if (!target?.upload_url || !target.file_path) throw new MagicHourError(502, "upload_url_missing", "Magic Hour did not return a usable upload URL.");
  const response = await fetch(target.upload_url, {
    method: "PUT",
    headers: { "content-type": input.contentType },
    body: new Uint8Array(input.bytes),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new MagicHourError(502, "asset_upload_failed", `Magic Hour asset upload failed (HTTP ${response.status}).`);
  return target.file_path;
}

export async function getMagicHourVideoProject(id: string, slot = 1) {
  return magicHourRequest<MagicHourJson>(`/video-projects/${encodeURIComponent(id)}`, {}, slot);
}

export async function getMagicHourAudioProject(id: string, slot = 1) {
  return magicHourRequest<MagicHourJson>(`/audio-projects/${encodeURIComponent(id)}`, {}, slot);
}

export async function deleteMagicHourVideoProject(id: string, slot = 1) {
  return magicHourRequest<MagicHourJson>(`/video-projects/${encodeURIComponent(id)}`, { method: "DELETE" }, slot);
}

export async function deleteMagicHourAudioProject(id: string, slot = 1) {
  return magicHourRequest<MagicHourJson>(`/audio-projects/${encodeURIComponent(id)}`, { method: "DELETE" }, slot);
}

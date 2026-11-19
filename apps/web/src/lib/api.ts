"use client";

import { brand } from "@/config/brand";

export const apiBaseUrl = "";
export const postsUpdatedEvent = "united-technologies-posts-updated";
export const apiConnectionEvent = "united-technologies-api-connection";

const requestTimeoutMs = 120_000;
const maxReadRetries = 2;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let refreshRequest: Promise<boolean> | null = null;

function reportConnection(online: boolean) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(apiConnectionEvent, { detail: { online } }));
  }
}

function refreshSession() {
  if (!refreshRequest) {
    refreshRequest = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
      signal: AbortSignal.timeout(15_000),
    })
      .then((response) => response.ok)
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

function retryDelay(response: Response | undefined, attempt: number) {
  const retryAfter = response?.headers.get("retry-after");
  const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : 0;
  return Math.min(4_000, Math.max(retryAfterMs, 300 * 2 ** attempt));
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const requestHeaders = new Headers(init.headers);
  const isFormBody = typeof FormData !== "undefined" && init.body instanceof FormData;
  const blobBody = typeof Blob !== "undefined" && init.body instanceof Blob ? init.body : null;
  const isBlobBody = blobBody !== null;
  if (!isFormBody && !requestHeaders.has("Content-Type")) {
    requestHeaders.set("Content-Type", blobBody?.type || (isBlobBody ? "application/octet-stream" : "application/json"));
  }
  if (typeof window !== "undefined") {
    const workspaceId = window.localStorage.getItem("united-technologies.workspaceId");
    if (workspaceId) requestHeaders.set("x-workspace-id", workspaceId);
    const brandId = window.localStorage.getItem("united-technologies.brandId");
    if (brandId) requestHeaders.set("x-brand-id", brandId);
  }

  const method = (init.method ?? "GET").toUpperCase();
  const canRetry = method === "GET" || method === "HEAD";
  let response: Response | undefined;
  let timedOut = false;
  let networkError: unknown;
  const timeoutMs = isBlobBody ? 5 * 60_000 : requestTimeoutMs;

  for (let attempt = 0; attempt <= (canRetry ? maxReadRetries : 0); attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([controller.signal, init.signal])
      : controller.signal;
    try {
      const request = new Request(new URL(path, window.location.origin), {
        ...init,
        credentials: "include",
        headers: requestHeaders,
        signal,
      });
      response = await fetch(request);
      if (response.status === 401 && path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
        if (await refreshSession()) response = await fetch(new Request(new URL(path, window.location.origin), {
          ...init,
          credentials: "include",
          headers: requestHeaders,
          signal,
        }));
      }
      if (canRetry && [408, 429, 502, 503, 504].includes(response.status) && attempt < maxReadRetries) {
        const delay = retryDelay(response, attempt);
        window.clearTimeout(timeout);
        await wait(delay);
        continue;
      }
      reportConnection(true);
      break;
    } catch (error) {
      networkError = error;
      if (init.signal?.aborted) throw error;
      if (!canRetry || attempt >= maxReadRetries || navigator.onLine === false) {
        reportConnection(false);
        throw new Error(timedOut
          ? `The ${brand.productName} service took too long to respond. Try again.`
          : `Cannot reach the ${brand.productName} API. Check your connection and try again.`);
      }
      await wait(retryDelay(undefined, attempt));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (!response) {
    reportConnection(false);
    throw new Error(networkError instanceof Error
      ? `Cannot reach the ${brand.productName} API. Check your connection and try again.`
      : `The ${brand.productName} API did not return a response. Try again.`);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | {
          error?: string;
          message?: string;
          issues?: Array<{ path?: string; message?: string }>;
        }
      | null;
    const validationDetails = body?.issues
      ?.filter((issue) => typeof issue.message === "string")
      .map((issue) => `${issue.path || "input"}: ${issue.message}`)
      .join("; ");
    const fallbackMessage = response.status === 429 && path.startsWith("/api/auth/")
      ? "Too many sign-in attempts. Wait for the 15-minute cooldown before trying again."
      : body?.error ?? body?.message ?? (
        [502, 503, 504].includes(response.status)
          ? "The service is temporarily unavailable. Please try again shortly."
          : `Request failed (${response.status}).`
      );
    const message = [
      fallbackMessage,
      validationDetails,
    ].filter(Boolean).join(" ");
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("The API returned a response that could not be read. Try again.");
  }
}

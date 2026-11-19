import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingMessage } from "node:http";

type RouteContext = { params: Promise<{ path: string[] }> };

function forwardToApi(targetUrl: URL, request: Request, headers: Headers) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const transport = targetUrl.protocol === "https:" ? httpsRequest : httpRequest;
    const upstreamRequest = transport(targetUrl, {
      method: request.method,
      headers: Object.fromEntries(headers),
    }, resolve);
    upstreamRequest.once("error", reject);

    if (request.body && !["GET", "HEAD"].includes(request.method)) {
      void request.body.pipeTo(new WritableStream<Uint8Array>({
        write(chunk) {
          if (upstreamRequest.write(chunk)) return;
          return new Promise<void>((resolve, reject) => {
            upstreamRequest.once("drain", resolve);
            upstreamRequest.once("error", reject);
          });
        },
        close() {
          upstreamRequest.end();
        },
        abort(reason) {
          upstreamRequest.destroy(reason instanceof Error ? reason : new Error(String(reason)));
        },
      })).catch((error: unknown) => upstreamRequest.destroy(error instanceof Error ? error : new Error(String(error))));
    } else {
      upstreamRequest.end();
    }
  });
}

function responseBody(response: IncomingMessage) {
  const iterator = response[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await iterator.next();
        if (chunk.done) controller.close();
        else controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      response.destroy(reason instanceof Error ? reason : undefined);
    },
  });
}

async function proxyRequest(request: Request, context: RouteContext) {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const apiBaseUrl = configuredApiUrl || (process.env.NODE_ENV === "production" ? "" : "http://localhost:4000");
  if (!apiBaseUrl) {
    return Response.json({ error: "The API service URL is not configured for this deployment." }, { status: 503 });
  }

  const { path } = await context.params;
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(`/api/${path.map(encodeURIComponent).join("/")}${requestUrl.search}`, apiBaseUrl);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("transfer-encoding");

  try {
    const apiResponse = await forwardToApi(targetUrl, request, headers);
    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(apiResponse.headers)) {
      if (value === undefined || name === "set-cookie") continue;
      responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    for (const cookie of apiResponse.headers["set-cookie"] ?? []) {
      responseHeaders.append("set-cookie", cookie);
    }
    responseHeaders.delete("transfer-encoding");
    const status = apiResponse.statusCode;
    if (status === undefined) throw new Error("The API service returned no HTTP status.");
    const body = request.method === "HEAD" || status === 204 || status === 304
      ? null
      : responseBody(apiResponse);
    return new Response(body, {
      status,
      statusText: apiResponse.statusMessage,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error(`API proxy request failed for ${request.method} /api/${path.join("/")}.`, error);
    return Response.json({ error: "The API service is temporarily unreachable. Try again shortly." }, { status: 502 });
  }
}

export const GET = proxyRequest;
export const HEAD = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;

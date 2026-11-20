import { connection } from "next/server";

export async function GET(request: Request) {
  await connection();

  const configuredApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const apiBaseUrl = configuredApiUrl || (process.env.NODE_ENV === "production" ? "" : "http://localhost:4000");
  if (!apiBaseUrl) {
    return Response.json({ error: "The API service URL is not configured for this deployment." }, { status: 503 });
  }

  try {
    const response = await fetch(new URL("/health", apiBaseUrl), {
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: {
        "cache-control": "no-store",
        "content-type": response.headers.get("content-type") ?? "application/json",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("API health proxy request failed.", error);
    return Response.json({ error: "The API health endpoint is temporarily unreachable." }, { status: 502 });
  }
}

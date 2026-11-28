export type CloudflareChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class CloudflareAiError extends Error {
  constructor(readonly status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CloudflareAiError";
  }
}

function modelPath(model: string) {
  const parts = model.split("/");
  if (parts.length < 2 || parts.some((part) => !part || part === "." || part === ".." || !/^[a-z0-9@._-]+$/i.test(part)) ||
    !parts[0]?.startsWith("@")) {
    throw new CloudflareAiError(400, "The configured Cloudflare image model ID is invalid.");
  }
  return parts.map((part, index) => {
    const encoded = encodeURIComponent(part);
    return index === 0 ? encoded.replace(/^%40/i, "@") : encoded;
  }).join("/");
}

async function postCloudflareAi<T>(input: {
  accountId: string;
  apiToken: string;
  path: string;
  body: unknown;
  timeoutMs: number;
}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(input.accountId)}/ai/${input.path}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input.body),
        signal: AbortSignal.timeout(input.timeoutMs),
      },
    );
  } catch (error) {
    throw new CloudflareAiError(502, "Cloudflare Workers AI could not be reached.", { cause: error });
  }

  if (!response.ok) {
    throw new CloudflareAiError(response.status, `Cloudflare Workers AI returned HTTP ${response.status}.`);
  }

  try {
    return await response.json() as T;
  } catch (error) {
    throw new CloudflareAiError(502, "Cloudflare Workers AI returned an invalid response.", { cause: error });
  }
}

export async function cloudflareChatCompletion(input: {
  accountId: string;
  apiToken: string;
  model: string;
  messages: CloudflareChatMessage[];
  responseFormat?: { type: "json_object" };
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}) {
  const payload = await postCloudflareAi<{
    choices?: Array<{ message?: { content?: string | null } }>;
  }>({
    accountId: input.accountId,
    apiToken: input.apiToken,
    path: "v1/chat/completions",
    body: {
      model: input.model,
      messages: input.messages,
      ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
    },
    timeoutMs: input.timeoutMs ?? 60_000,
  });
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new CloudflareAiError(502, "Cloudflare Workers AI returned an empty chat response.");
  return content;
}

export async function cloudflareImageGeneration(input: {
  accountId: string;
  apiToken: string;
  model: string;
  prompt: string;
  imageBase64?: string;
  width?: number;
  height?: number;
  steps?: number;
  numSteps?: number;
  strength?: number;
  timeoutMs?: number;
}) {
  const result = await postCloudflareAi<{
    result?: { image?: string };
    success?: boolean;
  }>({
    accountId: input.accountId,
    apiToken: input.apiToken,
    path: `run/${modelPath(input.model)}`,
    body: {
      prompt: input.prompt,
      ...(input.imageBase64 ? { image_b64: input.imageBase64, strength: input.strength ?? 0.65 } : {}),
      ...(input.width ? { width: input.width } : {}),
      ...(input.height ? { height: input.height } : {}),
      ...(input.steps ? { steps: input.steps } : {}),
      ...(input.numSteps ? { num_steps: input.numSteps } : {}),
    },
    timeoutMs: input.timeoutMs ?? 150_000,
  });

  if (result.success === false || !result.result?.image) {
    throw new CloudflareAiError(502, "Cloudflare Workers AI returned no image.");
  }
  const image = Buffer.from(result.result.image, "base64");
  if (!image.length) throw new CloudflareAiError(502, "Cloudflare Workers AI returned an empty image.");
  return image;
}

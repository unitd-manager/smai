import { Router } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { requireAuth, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";
import { decryptSocialToken } from "../services/social-token-crypto.js";
import { getInstagramAccessToken } from "../services/instagram.js";

const router = Router();
const replySchema = z.object({ text: z.string().trim().min(1).max(2000) });

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function graphRequest(url: URL, token: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body
      ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      : { Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = record(record(payload)?.error);
    throw new Error(typeof error?.message === "string" ? error.message : `Meta messaging request failed (${response.status}).`);
  }
  return payload;
}

function graphUrl(provider: "instagram" | "facebook", path: string) {
  const host = provider === "instagram" ? "graph.instagram.com" : "graph.facebook.com";
  const version = provider === "instagram" ? env.INSTAGRAM_GRAPH_API_VERSION : env.FACEBOOK_GRAPH_API_VERSION;
  return new URL(`https://${host}/${version}/${path}`);
}

function shapeMessage(value: unknown) {
  const item = record(value);
  if (!item || typeof item.id !== "string") return null;
  const from = record(item.from);
  const attachments = record(item.attachments);
  const attachmentItems = Array.isArray(attachments?.data) ? attachments.data.flatMap((attachment) => {
    const data = record(attachment);
    if (!data) return [];
    const payload = record(data.payload);
    return [{
      type: typeof data.type === "string" ? data.type : "attachment",
      url: typeof payload?.url === "string" ? payload.url : null,
      name: typeof data.name === "string" ? data.name : null,
    }];
  }) : [];
  return {
    id: item.id,
    text: typeof item.message === "string" ? item.message : "",
    createdAt: typeof item.created_time === "string" ? item.created_time : null,
    senderId: typeof from?.id === "string" ? from.id : null,
    senderName: typeof from?.username === "string" ? from.username : typeof from?.name === "string" ? from.name : null,
    attachments: attachmentItems,
  };
}

async function connectedAccounts(workspaceId: string) {
  return prisma.socialAccount.findMany({
    where: { workspaceId, status: "CONNECTED", provider: { in: ["instagram", "facebook"] } },
    select: { id: true, provider: true, providerAccountId: true, displayName: true, encryptedTokens: true, tokenExpiresAt: true },
    orderBy: { createdAt: "asc" },
  });
}

async function inboxForAccount(account: Awaited<ReturnType<typeof connectedAccounts>>[number]) {
  const provider = account.provider as "instagram" | "facebook";
  const token = provider === "instagram"
    ? (await getInstagramAccessToken(account)).accessToken
    : decryptSocialToken(account.encryptedTokens);
  const conversationsUrl = graphUrl(provider, `${encodeURIComponent(account.providerAccountId)}/conversations`);
  conversationsUrl.searchParams.set("platform", provider === "instagram" ? "instagram" : "messenger");
  conversationsUrl.searchParams.set("fields", "id,updated_time,participants");
  conversationsUrl.searchParams.set("limit", "30");
  const response = record(await graphRequest(conversationsUrl, token));
  if (!Array.isArray(response?.data)) throw new Error("Meta returned an invalid conversation list.");
  const conversations = await Promise.all(response.data.map(async (value) => {
    const conversation = record(value);
    if (!conversation || typeof conversation.id !== "string") return null;
    const participants = record(conversation.participants);
    const participantList = Array.isArray(participants?.data) ? participants.data.flatMap((person) => {
      const item = record(person);
      if (!item || typeof item.id !== "string") return [];
      return [{ id: item.id, name: typeof item.username === "string" ? item.username : typeof item.name === "string" ? item.name : "Contact", isSelf: item.id === account.providerAccountId }];
    }) : [];
    const messageUrl = graphUrl(provider, `${encodeURIComponent(conversation.id)}/messages`);
    messageUrl.searchParams.set("fields", "id,created_time,from,to,message,attachments");
    messageUrl.searchParams.set("limit", "20");
    const messageResponse = record(await graphRequest(messageUrl, token));
    const messages = Array.isArray(messageResponse?.data)
      ? messageResponse.data.map(shapeMessage).filter((message): message is NonNullable<ReturnType<typeof shapeMessage>> => message !== null)
      : [];
    return {
      id: conversation.id,
      updatedAt: typeof conversation.updated_time === "string" ? conversation.updated_time : null,
      participants: participantList,
      messages: messages.sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? "")),
    };
  }));
  return {
    id: account.id,
    provider,
    displayName: account.displayName,
    providerAccountId: account.providerAccountId,
    conversations: conversations.filter((item): item is NonNullable<typeof item> => item !== null),
    error: null,
  };
}

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res, next) => {
  try {
    const accounts = await connectedAccounts(req.workspace!.id);
    const results = await Promise.all(accounts.map(async (account) => {
      try {
        return await inboxForAccount(account);
      } catch (error) {
        return {
          id: account.id,
          provider: account.provider,
          displayName: account.displayName,
          providerAccountId: account.providerAccountId,
          conversations: [],
          error: error instanceof Error ? error.message : "Could not load messages for this account.",
        };
      }
    }));
    res.json({ accounts: results, fetchedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

router.post("/:accountId/:conversationId/reply", requireWritableWorkspace, async (req, res, next) => {
  try {
    const accountId = z.string().min(1).parse(req.params.accountId);
    const conversationId = z.string().min(1).parse(req.params.conversationId);
    const { text } = replySchema.parse(req.body);
    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, workspaceId: req.workspace!.id, status: "CONNECTED", provider: { in: ["instagram", "facebook"] } },
      select: { id: true, provider: true, providerAccountId: true, encryptedTokens: true, tokenExpiresAt: true },
    });
    if (!account) {
      res.status(404).json({ error: "Connected messaging account not found in this workspace." });
      return;
    }
    const provider = account.provider as "instagram" | "facebook";
    const token = provider === "instagram"
      ? (await getInstagramAccessToken(account)).accessToken
      : decryptSocialToken(account.encryptedTokens);
    const conversationUrl = graphUrl(provider, encodeURIComponent(conversationId));
    conversationUrl.searchParams.set("fields", "id,participants");
    const conversation = record(await graphRequest(conversationUrl, token));
    const participants = record(conversation?.participants);
    const people = Array.isArray(participants?.data) ? participants.data : [];
    const recipient = people.map(record).find((person) => typeof person?.id === "string" && person.id !== account.providerAccountId);
    if (!recipient || typeof recipient.id !== "string") {
      res.status(400).json({ error: "Could not identify the recipient for this conversation." });
      return;
    }
    const sendUrl = graphUrl(provider, provider === "instagram"
      ? `${encodeURIComponent(account.providerAccountId)}/messages`
      : `${encodeURIComponent(account.providerAccountId)}/messages`);
    const payload = provider === "instagram"
      ? { recipient: { id: recipient.id }, message: { text } }
      : { recipient: { id: recipient.id }, messaging_type: "RESPONSE", message: { text } };
    await graphRequest(sendUrl, token, payload);
    res.json({ sent: true });
  } catch (error) {
    next(error);
  }
});

export { router as inboxRouter };

import { Router } from "express";
import { Prisma } from "@prisma/client";
import { getLegacyDesignDocument } from "@united-technologies/shared/design-document";
import { renderDesignPageSvg } from "@united-technologies/shared/design-document";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace, requireWorkspaceRole } from "../middleware/auth.js";
import { assertInstagramMediaHostingAvailable, listInstagramMediaIds, makeInstagramMediaUrl } from "../services/instagram.js";
import { publishDueJobs } from "../services/publishing.js";
import { checkPostQuality } from "../services/post-quality.js";

const router = Router();
const createSchema = z.object({
  contentId: z.string().min(1),
  designId: z.string().min(1).optional(),
  videoJobId: z.string().min(1).optional(),
  mediaAssetId: z.string().min(1).optional(),
  caption: z.string().max(2200).optional(),
  captionOverrides: z.record(z.string(), z.string().max(63_206)).optional(),
  platforms: z.array(z.string().trim().min(2).max(40)).min(1).max(12)
    .refine((platforms) => new Set(platforms).size === platforms.length, "Choose each platform only once."),
  scheduledAt: z.string().datetime().optional(),
  timezone: z.string().trim().min(1).max(100).default("UTC"),
  qualityOverrideReason: z.string().trim().min(10).max(500).optional(),
});
const draftSchema = z.object({
  contentId: z.string().min(1),
  designId: z.string().min(1).optional(),
  platforms: z.array(z.string().trim().min(2).max(40)).min(1).max(12)
    .refine((platforms) => new Set(platforms).size === platforms.length, "Choose each platform only once."),
  captionOverrides: z.record(z.string(), z.string().max(63_206)).default({}),
});
const listSchema = z.object({
  status: z.string().trim().min(1).optional(),
  brandId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
const approvalListSchema = z.object({
  status: z.enum(["all", "pending", "approved", "changes_requested"]).default("pending"),
  brandId: z.string().trim().min(1).optional(),
});
const approvalReviewSchema = z.object({
  status: z.enum(["APPROVED", "CHANGES_REQUESTED"]),
  comment: z.string().trim().default(""),
});
const approvalSubmitSchema = z.object({
  qualityOverrideReason: z.string().trim().min(10).max(500).optional(),
});
const qualityCheckSchema = z.object({
  platforms: z.array(z.string().trim().min(2).max(40)).min(1).max(12),
  captions: z.record(z.string(), z.string().max(63_206)),
});
const rescheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
  timezone: z.string().trim().min(1).max(100),
});
const rescheduleConflict = Symbol("reschedule-conflict");

function isJsonRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function stringArray(value: Prisma.JsonValue | null | undefined): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function getPlatformCaption(content: Prisma.JsonObject, platform: string) {
  const previews = content.platformCaptions;
  if (!Array.isArray(previews)) return undefined;
  const preview = previews.find((item) => isJsonRecord(item) && item.platform === platform);
  if (!preview || !isJsonRecord(preview)) return undefined;
  const caption = preview.caption;
  return typeof caption === "string" ? caption : undefined;
}

function getInstagramCaption(content: Prisma.JsonObject) {
  const preview = Array.isArray(content.platformCaptions)
    ? content.platformCaptions.find((item) => isJsonRecord(item) && item.platform === "Instagram")
    : undefined;
  const caption = preview && isJsonRecord(preview) && typeof preview.caption === "string"
    ? preview.caption
    : typeof content.caption === "string" ? content.caption : "";
  const platformHashtags = preview && isJsonRecord(preview) && Array.isArray(preview.hashtags)
    ? preview.hashtags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    : [];
  const hashtags = platformHashtags.length > 0
    ? platformHashtags
    : Array.isArray(content.hashtags) ? content.hashtags : [];
  const existingTags = new Set((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((tag) => tag.toLowerCase()));
  const missingTags = hashtags
    .filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    .map((tag) => tag.trim().startsWith("#") ? tag.trim() : `#${tag.trim()}`)
    .filter((tag) => !existingTags.has(tag.toLowerCase()));
  return missingTags.length > 0 ? `${caption.trim()}\n\n${missingTags.join(" ")}` : caption;
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.post("/quality-check", async (req, res, next) => {
  try {
    const input = qualityCheckSchema.parse(req.body);
    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { id: brandId } : {}) },
      select: { profile: { select: { bannedWords: true } } },
    });
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }
    res.json({ quality: checkPostQuality(input.platforms, input.captions, stringArray(brand.profile?.bannedWords)) });
  } catch (error) {
    next(error);
  }
});

router.get("/approvals", async (req, res, next) => {
  try {
    const filter = approvalListSchema.parse(req.query);
    const brandId = filter.brandId === "all" ? undefined : filter.brandId ?? req.header("x-brand-id") ?? undefined;
    const approvals = await prisma.approval.findMany({
      where: {
        workspaceId: req.workspace!.id,
        ...(filter.status === "all" ? {} : { status: filter.status.toUpperCase() }),
        ...(brandId ? { post: { brandId } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        comment: true,
        createdAt: true,
        post: {
          select: {
            id: true,
            title: true,
            caption: true,
            status: true,
            scheduledAt: true,
            timezone: true,
            brand: { select: { name: true } },
            targets: { select: { id: true, platform: true, status: true } },
          },
        },
      },
    });
    res.json({ approvals });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/submit-for-approval", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = approvalSubmitSchema.parse(req.body);
    const postId = z.string().parse(req.params.id);
    const post = await prisma.post.findFirst({
      where: { id: postId, workspaceId: req.workspace!.id },
      select: {
        id: true,
        status: true,
        caption: true,
        targets: { select: { platform: true, captionOverride: true } },
        brand: { select: { profile: { select: { bannedWords: true } } } },
      },
    });
    if (!post) {
      res.status(404).json({ error: "Post not found." });
      return;
    }
    if (post.status !== "DRAFT") {
      res.status(409).json({ error: "Only draft posts can be submitted for approval." });
      return;
    }
    const quality = checkPostQuality(
      post.targets.map((target) => target.platform),
      Object.fromEntries(post.targets.map((target) => [target.platform, target.captionOverride ?? post.caption])),
      stringArray(post.brand.profile?.bannedWords),
    );
    if (!quality.passed && !input.qualityOverrideReason) {
      res.status(422).json({ error: "Resolve the post quality errors before requesting approval.", quality });
      return;
    }
    const pendingApproval = await prisma.approval.findFirst({
      where: { postId, workspaceId: req.workspace!.id, status: "PENDING" },
      select: { id: true },
    });
    if (pendingApproval) {
      res.status(409).json({ error: "This post is already waiting for approval." });
      return;
    }
    const approval = await prisma.$transaction(async (tx) => {
      const created = await tx.approval.create({
        data: {
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          postId,
          status: "PENDING",
        },
        select: { id: true, status: true, createdAt: true },
      });
      if (!quality.passed && input.qualityOverrideReason) {
        await tx.auditLog.create({
          data: {
            workspaceId: req.workspace!.id,
            actorId: req.auth!.userId,
            action: "post.quality.override",
            targetType: "post",
            targetId: postId,
            metadata: { reason: input.qualityOverrideReason, issues: quality.issues },
          },
        });
      }
      return created;
    });
    res.status(201).json({ approval });
  } catch (error) {
    next(error);
  }
});

router.post("/approvals/:id/review", requireWorkspaceRole("OWNER", "ADMIN", "EDITOR"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const approvalId = z.string().parse(req.params.id);
    const input = approvalReviewSchema.parse(req.body);
    const approval = await prisma.approval.findFirst({
      where: { id: approvalId, workspaceId: req.workspace!.id },
      select: { id: true, status: true, postId: true, post: { select: { scheduledAt: true, targets: { select: { id: true, workspaceId: true, resellerId: true, platform: true } } } } },
    });
    if (!approval) {
      res.status(404).json({ error: "Approval request not found." });
      return;
    }
    if (approval.status !== "PENDING") {
      res.status(409).json({ error: "This approval request has already been reviewed." });
      return;
    }
    let accountIdByPlatform = new Map<string, string>();
    if (input.status === "APPROVED" && approval.post.scheduledAt) {
      const platforms = [...new Set(approval.post.targets.map((target) => target.platform))];
      const unsupported = platforms.filter((platform) => !["Instagram", "Facebook"].includes(platform));
      if (unsupported.length) {
        res.status(409).json({ error: `Live publishing is not integrated for ${unsupported.join(", ")}. Remove those channels or save them as drafts before approving this post.` });
        return;
      }
      const accounts = await prisma.socialAccount.findMany({
        where: { workspaceId: req.workspace!.id, provider: { in: platforms.map((platform) => platform.toLowerCase()) }, status: "CONNECTED" },
        select: { id: true, provider: true },
      });
      accountIdByPlatform = new Map(accounts.map((account) => [account.provider === "instagram" ? "Instagram" : "Facebook", account.id]));
      const missing = platforms.filter((platform) => !accountIdByPlatform.has(platform));
      if (missing.length) {
        res.status(409).json({ error: `Connect ${missing.join(" and ")} before approving this scheduled post for live publishing.` });
        return;
      }
    }
    const reviewed = await prisma.$transaction(async (tx) => {
      const result = await tx.approval.update({
        where: { id: approval.id },
        data: {
          status: input.status,
          comment: input.comment || null,
          reviewerId: req.auth!.userId,
          emailTokenHash: null,
          emailTokenExpiresAt: null,
        },
        select: { id: true, status: true, comment: true, updatedAt: true, postId: true },
      });
      if (input.status === "APPROVED" && approval.post.scheduledAt) {
        await tx.post.update({ where: { id: approval.postId }, data: { status: "SCHEDULED" } });
        for (const [platform, socialAccountId] of accountIdByPlatform) {
          await tx.postTarget.updateMany({ where: { postId: approval.postId, workspaceId: req.workspace!.id, platform }, data: { status: "PENDING", socialAccountId } });
        }
        await tx.publishJob.createMany({
          data: approval.post.targets.map((target) => ({
            workspaceId: target.workspaceId,
            resellerId: target.resellerId,
            postId: approval.postId,
            targetId: target.id,
            runAt: approval.post.scheduledAt!,
          })),
          skipDuplicates: true,
        });
      } else if (input.status === "CHANGES_REQUESTED") {
        await tx.post.update({ where: { id: approval.postId }, data: { status: "DRAFT" } });
        await tx.postTarget.updateMany({ where: { postId: approval.postId, workspaceId: req.workspace!.id, status: "PENDING" }, data: { status: "DRAFT" } });
      }
      await tx.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: input.status === "APPROVED" ? "post.approved" : "post.changes_requested",
          targetType: "post",
          targetId: result.postId,
          metadata: { approvalId: result.id, comment: result.comment },
        },
      });
      return result;
    });
    res.json({ approval: reviewed });
  } catch (error) {
    next(error);
  }
});

router.post("/sync-instagram", async (req, res, next) => {
  try {
    const workspaceId = req.workspace!.id;
    const [accounts, publishedTargets] = await Promise.all([
      prisma.socialAccount.findMany({
        where: { workspaceId, provider: "instagram", status: "CONNECTED" },
        select: { id: true, providerAccountId: true, encryptedTokens: true, tokenExpiresAt: true },
      }),
      prisma.postTarget.findMany({
        where: {
          workspaceId,
          platform: "Instagram",
          status: "PUBLISHED",
          socialAccountId: { not: null },
          platformPostId: { not: null },
          publishedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
        },
        select: { id: true, socialAccountId: true, platformPostId: true },
      }),
    ]);
    const targetsByAccount = new Map<string, typeof publishedTargets>();
    for (const target of publishedTargets) {
      if (!target.socialAccountId || !target.platformPostId) continue;
      const targets = targetsByAccount.get(target.socialAccountId) ?? [];
      targets.push(target);
      targetsByAccount.set(target.socialAccountId, targets);
    }

    const deletedTargetIds: string[] = [];
    for (const account of accounts) {
      const accountTargets = targetsByAccount.get(account.id) ?? [];
      if (!accountTargets.length) continue;
      let mediaIds: Set<string>;
      try {
        mediaIds = await listInstagramMediaIds(account);
      } catch (error) {
        console.error(`Instagram media sync failed for account ${account.id}.`, error);
        res.status(502).json({
          error: "Could not check Instagram media right now. No local posts were changed. Check the account connection and retry.",
        });
        return;
      }
      deletedTargetIds.push(...accountTargets
        .filter((target) => target.platformPostId && !mediaIds.has(target.platformPostId))
        .map((target) => target.id));
    }

    let updatedTargets = 0;
    if (deletedTargetIds.length) {
      const updates = await prisma.$transaction(deletedTargetIds.map((id) =>
        prisma.postTarget.updateMany({
          where: { id, workspaceId, status: "PUBLISHED" },
          data: {
            status: "DELETED_ON_PLATFORM",
            error: "Deleted on Instagram. Local post history is retained.",
          },
        }),
      ));
      updatedTargets = updates.reduce((count, result) => count + result.count, 0);
    }
    res.json({ deletedTargets: updatedTargets });
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const filter = listSchema.parse(req.query);
    const brandId = filter.brandId === "all" ? undefined : filter.brandId ?? req.header("x-brand-id") ?? undefined;
    const storedPosts = await prisma.post.findMany({
      where: {
        workspaceId: req.workspace!.id,
        ...(brandId ? { brandId } : {}),
        ...(filter.status ? { status: filter.status.toUpperCase() } : {}),
      },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
      take: filter.limit,
      skip: filter.offset,
      select: {
        id: true,
        brandId: true,
        designId: true,
        title: true,
        caption: true,
        hashtags: true,
        status: true,
        scheduledAt: true,
        timezone: true,
        createdAt: true,
        targets: {
          select: {
            id: true,
            platform: true,
            status: true,
            platformPostId: true,
            publishedUrl: true,
            error: true,
            socialAccountId: true,
            publishedAt: true,
            media: true,
            mediaAssetId: true,
          },
        },
        brand: { select: { name: true } },
      },
    });
    const accountIds = [...new Set(storedPosts.flatMap((post) =>
      post.targets.flatMap((target) => target.socialAccountId ? [target.socialAccountId] : []),
    ))];
    const connectedAccounts = accountIds.length > 0
      ? await prisma.socialAccount.findMany({
          where: {
            id: { in: accountIds },
            workspaceId: req.workspace!.id,
          },
          select: { id: true, displayName: true, provider: true, status: true },
        })
      : [];
    const connectedAccountIds = new Set(connectedAccounts.filter((account) => account.status === "CONNECTED").map((account) => account.id));
    const accountById = new Map(connectedAccounts.map((account) => [account.id, account]));
    const designIds = [...new Set(storedPosts.flatMap((post) => post.designId ? [post.designId] : []))];
    const designs = designIds.length > 0
      ? await prisma.design.findMany({
          where: { id: { in: designIds }, workspaceId: req.workspace!.id },
          select: { id: true, previewUrl: true },
        })
      : [];
    const previewByDesignId = new Map(designs.map((design) => [design.id, design.previewUrl]));
    const posts = storedPosts.map((post) => ({
      ...post,
      hashtags: Array.isArray(post.hashtags) ? post.hashtags.filter((tag): tag is string => typeof tag === "string") : [],
      designPreviewUrl: post.designId ? previewByDesignId.get(post.designId) ?? null : null,
      targets: post.targets.map((target) => {
        const sourceMedia = Array.isArray(target.media) ? target.media : target.media === null ? [] : [target.media];
        const media = sourceMedia.flatMap((item, index) => {
          if (typeof item === "string") return [{ type: "image", url: item, index }];
          if (!item || typeof item !== "object" || Array.isArray(item)) return [];
          const mediaItem = item as Record<string, unknown>;
          const type = mediaItem.type === "video" ? "video" : "image";
          if (typeof mediaItem.mediaAssetId === "string") {
            return [{ type, url: `/api/media/uploads/${encodeURIComponent(mediaItem.mediaAssetId)}/file`, index }];
          }
          if (typeof mediaItem.storageKey === "string") {
            try {
              return [{ type, url: makeInstagramMediaUrl(target.id, index, type), index }];
            } catch {
              return [];
            }
          }
          return typeof mediaItem.url === "string" ? [{ type, url: mediaItem.url, index }] : [];
        });
        const account = target.socialAccountId ? accountById.get(target.socialAccountId) : null;
        return {
          ...target,
          media,
          account: account ? { displayName: account.displayName, provider: account.provider } : null,
          publishingMode: ["Instagram", "Facebook"].includes(target.platform) && target.socialAccountId &&
            connectedAccountIds.has(target.socialAccountId) ? "live" : "demo",
        };
      }),
      demoMode: post.targets.some((target) => !["Instagram", "Facebook"].includes(target.platform) || !target.socialAccountId ||
        !connectedAccountIds.has(target.socialAccountId)),
    }));
    res.json({ posts });
  } catch (error) {
    next(error);
  }
});

router.post("/drafts", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = draftSchema.parse(req.body);
    const content = await prisma.generatedContent.findFirst({
      where: { id: input.contentId, workspaceId: req.workspace!.id },
      select: { id: true, brandId: true, contentJson: true },
    });
    if (!content || !isJsonRecord(content.contentJson) || typeof content.contentJson.caption !== "string") {
      res.status(404).json({ error: "Generated content was not found or is not ready to save." });
      return;
    }
    const selectedDesign = input.designId
      ? await prisma.design.findFirst({
          where: {
            id: input.designId,
            workspaceId: req.workspace!.id,
            brandId: content.brandId,
            designJson: { path: "$.generatedContentId", equals: content.id },
          },
          select: { id: true },
        })
      : null;
    if (input.designId && !selectedDesign) {
      res.status(404).json({ error: "The selected design does not belong to this content item." });
      return;
    }
    const contentData = content.contentJson;
    if (typeof contentData.caption !== "string") {
      res.status(500).json({ error: "Stored content is not in the expected format." });
      return;
    }
    const contentCaption = contentData.caption;
    const contentTitle = typeof contentData.title === "string" ? contentData.title : null;
    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          brandId: content.brandId,
          designId: selectedDesign?.id,
          title: contentTitle,
          caption: input.captionOverrides[input.platforms[0]!] ?? getPlatformCaption(contentData, input.platforms[0]!) ?? contentCaption,
          hashtags: Array.isArray(contentData.hashtags) ? contentData.hashtags : Prisma.JsonNull,
          status: "DRAFT",
        },
        select: { id: true, status: true },
      });
      await tx.postTarget.createMany({
        data: input.platforms.map((platform) => ({
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          postId: created.id,
          platform,
          captionOverride: input.captionOverrides[platform] ?? getPlatformCaption(contentData, platform) ?? contentCaption,
          status: "DRAFT",
        })),
      });
      return created;
    });
    res.status(201).json({ post, demoMode: true });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    if (!isValidTimezone(input.timezone)) {
      res.status(400).json({ error: "Choose a valid timezone." });
      return;
    }
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
    const scheduled = Boolean(input.scheduledAt);
    if (scheduled && scheduledAt <= new Date()) {
      res.status(400).json({ error: "Choose a future time to schedule this post." });
      return;
    }
    const content = await prisma.generatedContent.findFirst({
      where: { id: input.contentId, workspaceId: req.workspace!.id },
      select: { id: true, brandId: true, contentJson: true },
    });
    const contentData = content?.contentJson;
    if (!content || !contentData || !isJsonRecord(contentData) || typeof contentData.caption !== "string") {
      res.status(404).json({ error: "Generated content was not found or is not ready to publish." });
      return;
    }
    const contentCaption = input.caption ?? contentData.caption;
    const contentTitle = typeof contentData.title === "string" ? contentData.title : null;
    const brandProfile = await prisma.companyProfile.findFirst({
      where: { brandId: content.brandId, workspaceId: req.workspace!.id },
      select: { bannedWords: true },
    });
    const quality = checkPostQuality(
      input.platforms,
      Object.fromEntries(input.platforms.map((platform) => [
        platform,
        input.captionOverrides?.[platform] ?? input.caption ?? (platform === "Instagram"
          ? getInstagramCaption(contentData)
          : getPlatformCaption(contentData, platform) ?? contentCaption),
      ])),
      stringArray(brandProfile?.bannedWords),
    );
    if (!quality.passed && !input.qualityOverrideReason) {
      res.status(422).json({ error: "Resolve the post quality errors before scheduling or publishing.", quality });
      return;
    }
    if (input.designId && input.mediaAssetId) {
      res.status(400).json({ error: "Choose either a generated design or an imported file for this post." });
      return;
    }
    const storedDesign = input.designId
      ? await prisma.design.findFirst({
          where: {
            id: input.designId,
            workspaceId: req.workspace!.id,
            brandId: content.brandId,
            designJson: { path: "$.generatedContentId", equals: content.id },
          },
          select: { id: true, title: true, previewUrl: true, designJson: true, brand: { select: { kit: { select: { colors: true } } } } },
        })
      : null;
    if (input.designId && !storedDesign) {
      res.status(404).json({ error: "The selected design does not belong to this content item." });
      return;
    }
    const storedColors = Array.isArray(storedDesign?.brand.kit?.colors)
      ? storedDesign.brand.kit.colors.filter((color): color is string => typeof color === "string")
      : [];
    const document = storedDesign
      ? getLegacyDesignDocument(storedDesign.designJson, storedDesign.title, storedColors, "post")
      : null;
    let design: { id: string; previewUrl: string } | null = null;
    if (storedDesign) {
      if (!document) throw new Error(`Saved design "${storedDesign.id}" has no compatible design document.`);
      design = { id: storedDesign.id, previewUrl: renderDesignPageSvg(document) };
    }
    const videoJob = input.videoJobId
      ? await prisma.videoRenderJob.findFirst({
          where: {
            id: input.videoJobId,
            workspaceId: req.workspace!.id,
            contentId: content.id,
            status: "SUCCEEDED",
          },
          select: { id: true, outputKey: true },
        })
      : null;
    if (input.videoJobId && !videoJob?.outputKey) {
      res.status(404).json({ error: "The rendered video is not available in this workspace." });
      return;
    }
    if (input.videoJobId && input.mediaAssetId) {
      res.status(400).json({ error: "Choose either a rendered video or an imported file for this post." });
      return;
    }
    const mediaAsset = input.mediaAssetId
      ? await prisma.mediaAsset.findFirst({
          where: {
            id: input.mediaAssetId,
            workspaceId: req.workspace!.id,
            brandId: content.brandId,
            OR: [{ storageKey: "database-upload" }, { storageKey: { startsWith: "s3://" } }],
          },
          select: { id: true, mimeType: true },
        })
      : null;
    if (input.mediaAssetId && !mediaAsset) {
      res.status(404).json({ error: "The imported file is not available for this brand." });
      return;
    }
    if (mediaAsset && !["image/jpeg", "image/png", "image/webp", "video/mp4"].includes(mediaAsset.mimeType)) {
      res.status(415).json({ error: "PDF files are for reference and cannot be scheduled as social posts." });
      return;
    }
    const [instagramAccount, facebookAccount] = await Promise.all([
      input.platforms.includes("Instagram")
        ? prisma.socialAccount.findFirst({
            where: { workspaceId: req.workspace!.id, provider: "instagram", status: "CONNECTED", OR: [{ brandId: content.brandId }, { brandId: null }] },
            select: { id: true },
          })
        : null,
      input.platforms.includes("Facebook")
        ? prisma.socialAccount.findFirst({
            where: { workspaceId: req.workspace!.id, provider: "facebook", status: "CONNECTED" },
            select: { id: true },
          })
        : null,
    ]);
    if (scheduled && input.platforms.includes("Facebook") && !facebookAccount) {
      res.status(409).json({ error: "Connect a Facebook Page before scheduling this post. Draft-only channels are available from Save as draft." });
      return;
    }
    const importedVideo = mediaAsset?.mimeType === "video/mp4";
    if ((videoJob || importedVideo) && (input.platforms.length !== 1 || input.platforms[0] !== "Instagram")) {
      res.status(400).json({ error: "Live video publishing is currently supported only for Instagram Reels. Select Instagram to publish this video." });
      return;
    }
    if ((videoJob || importedVideo) && input.platforms.includes("Facebook")) {
      res.status(400).json({ error: "Facebook Page video publishing is not supported yet. Select Instagram for live Reel publishing or save the video as a draft." });
      return;
    }
    if ((videoJob || importedVideo) && !instagramAccount) {
      res.status(400).json({ error: "Connect an Instagram Professional account in Social Accounts before publishing this video." });
      return;
    }
    if ((instagramAccount || facebookAccount) && (videoJob || mediaAsset || design)) {
      try {
        await assertInstagramMediaHostingAvailable();
      } catch (error) {
        console.error("Instagram media hosting readiness check failed.", error);
        res.status(503).json({
          error: error instanceof Error
            ? error.message
            : "Instagram media hosting could not be verified. Check the public API URL and HTTPS setup, then retry.",
        });
        return;
      }
    }
    const carouselMedia = contentData.format === "carousel" && document
      ? document.pages.map((_page, index) => renderDesignPageSvg(document, index))
      : null;
    if ((instagramAccount || facebookAccount) && contentData.format === "carousel" &&
      (!carouselMedia || carouselMedia.length < 2 || carouselMedia.length > 10)) {
      res.status(400).json({ error: "The selected Instagram carousel design must contain between 2 and 10 slides." });
      return;
    }
    if (instagramAccount && !videoJob && !mediaAsset && !design?.previewUrl?.startsWith("data:image/svg+xml;charset=utf-8,")) {
      res.status(400).json({ error: "Choose a generated design preview to publish to the connected Instagram account." });
      return;
    }
    const hashtags = Array.isArray(contentData.hashtags) ? contentData.hashtags : Prisma.JsonNull;
    const post = await prisma.$transaction(async (tx) => {
      const created = await tx.post.create({
        data: {
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          brandId: content.brandId,
          designId: design?.id,
          title: contentTitle,
          caption: contentCaption,
          hashtags,
          status: scheduled ? "SCHEDULED" : "PUBLISHING",
          scheduledAt: scheduled ? scheduledAt : null,
          timezone: input.timezone,
        },
        select: { id: true },
      });
      await tx.postTarget.createMany({
        data: input.platforms.map((platform) => ({
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          postId: created.id,
          platform,
          socialAccountId: platform === "Instagram" ? instagramAccount?.id ?? null : platform === "Facebook" ? facebookAccount?.id ?? null : null,
          captionOverride: input.captionOverrides?.[platform] ?? input.caption ?? (platform === "Instagram"
            ? getInstagramCaption(contentData)
            : getPlatformCaption(contentData, platform) ?? contentCaption),
          mediaAssetId: mediaAsset?.id,
          media: mediaAsset
            ? [{ type: importedVideo ? "video" : "image", mediaAssetId: mediaAsset.id }]
            : videoJob?.outputKey
            ? [{ type: "video", storageKey: videoJob.outputKey }]
            : (platform === "Instagram" || platform === "Facebook") && carouselMedia
              ? carouselMedia
              : design?.previewUrl ? [design.previewUrl] : Prisma.JsonNull,
        })),
      });
      if (!quality.passed && input.qualityOverrideReason) {
        await tx.auditLog.create({
          data: {
            workspaceId: req.workspace!.id,
            actorId: req.auth!.userId,
            action: "post.quality.override",
            targetType: "post",
            targetId: created.id,
            metadata: { reason: input.qualityOverrideReason, issues: quality.issues },
          },
        });
      }
      const targets = await tx.postTarget.findMany({
        where: { postId: created.id, workspaceId: req.workspace!.id },
        select: { id: true },
      });
      await tx.publishJob.createMany({
        data: targets.map((target) => ({
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          postId: created.id,
          targetId: target.id,
          runAt: scheduledAt,
        })),
      });
      return { id: created.id };
    });
    if (!scheduled) {
      await publishDueJobs(post.id);
    }
    const response = await prisma.post.findFirst({
      where: { id: post.id, workspaceId: req.workspace!.id },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        targets: {
          select: {
            platform: true,
            status: true,
            platformPostId: true,
            publishedUrl: true,
            error: true,
            publishJobs: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { status: true, lastError: true },
            },
          },
        },
      },
    });
    const publishError = response?.targets.find((target) =>
      target.status !== "PUBLISHED" && (target.error || target.publishJobs[0]?.lastError),
    );
    if (!scheduled && publishError) {
      res.status(502).json({ error: publishError.error ?? publishError.publishJobs[0]?.lastError });
      return;
    }
    if (!scheduled && response?.status === "FAILED") {
      res.status(502).json({
        error: response.targets.find((target) => target.error)?.error ?? "The social platform rejected this post.",
      });
      return;
    }
    const demoMode = input.platforms.some((platform) => platform === "Instagram" ? !instagramAccount : platform === "Facebook" ? !facebookAccount : true);
    res.status(201).json({ post: response, demoMode });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/retry", requireWritableWorkspace, async (req, res, next) => {
  try {
    const postId = z.string().parse(req.params.id);
    const post = await prisma.post.findFirst({
      where: { id: postId, workspaceId: req.workspace!.id },
      select: { id: true, status: true, targets: { select: { id: true, status: true, platform: true, socialAccountId: true } } },
    });
    if (!post) {
      res.status(404).json({ error: "Post not found." });
      return;
    }
    const failedTargets = post.targets.filter((target) => target.status === "FAILED");
    if (failedTargets.length === 0) {
      res.status(409).json({ error: "This post has no failed targets to retry." });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.postTarget.updateMany({
        where: { id: { in: failedTargets.map((target) => target.id) }, workspaceId: req.workspace!.id },
        data: { status: "PENDING", error: null },
      });
      await tx.publishJob.createMany({
        data: failedTargets.map((target) => ({
          workspaceId: req.workspace!.id,
          resellerId: req.workspace!.resellerId,
          postId: post.id,
          targetId: target.id,
          runAt: new Date(),
        })),
      });
      await tx.post.update({ where: { id: post.id }, data: { status: "PUBLISHING" } });
    });
    await publishDueJobs(post.id);
    const updated = await prisma.post.findFirst({
      where: { id: post.id, workspaceId: req.workspace!.id },
      select: { id: true, status: true, targets: { select: { platform: true, status: true, platformPostId: true } } },
    });
    const demoMode = failedTargets.some((target) => target.platform !== "Instagram" || !target.socialAccountId);
    res.json({ post: updated, demoMode });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/cancel", requireWritableWorkspace, async (req, res, next) => {
  try {
    const postId = z.string().parse(req.params.id);
    const post = await prisma.post.findFirst({
      where: { id: postId, workspaceId: req.workspace!.id },
      select: { id: true, status: true },
    });
    if (!post) {
      res.status(404).json({ error: "Post not found." });
      return;
    }
    if (!["DRAFT", "SCHEDULED", "FAILED"].includes(post.status)) {
      res.status(409).json({ error: "Only draft, scheduled, or failed posts can be cancelled." });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.publishJob.updateMany({
        where: { postId, workspaceId: req.workspace!.id, status: { in: ["QUEUED", "FAILED"] } },
        data: { status: "CANCELLED", lockedAt: null },
      });
      await tx.post.update({ where: { id: postId }, data: { status: "CANCELLED" } });
      await tx.postTarget.updateMany({
        where: { postId, workspaceId: req.workspace!.id, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
    });
    res.json({ cancelled: true });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/reschedule", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const input = rescheduleSchema.parse(req.body);
    const scheduledAt = new Date(input.scheduledAt);
    if (!isValidTimezone(input.timezone)) {
      res.status(400).json({ error: "Choose a valid time zone before rescheduling." });
      return;
    }
    if (scheduledAt <= new Date()) {
      res.status(400).json({ error: "Choose a future date and time." });
      return;
    }
    const post = await prisma.post.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { id: true, status: true, targets: { select: { id: true, status: true } } },
    });
    if (!post) {
      res.status(404).json({ error: "Post not found in this workspace." });
      return;
    }
    if (post.status !== "SCHEDULED" || post.targets.length === 0 || post.targets.some((target) => !["PENDING", "QUEUED"].includes(target.status))) {
      res.status(409).json({ error: "Only posts with queued publishing targets can be rescheduled." });
      return;
    }
    const queuedJobs = await prisma.publishJob.count({
      where: { postId: post.id, workspaceId: req.workspace!.id, status: "QUEUED" },
    });
    if (queuedJobs !== post.targets.length) {
      res.status(409).json({ error: "This post's publishing jobs are already running or need attention, so it cannot be rescheduled." });
      return;
    }
    try {
      await prisma.$transaction(async (tx) => {
        const queued = await tx.publishJob.updateMany({
          where: { postId: post.id, workspaceId: req.workspace!.id, status: "QUEUED" },
          data: { runAt: scheduledAt },
        });
        if (queued.count !== post.targets.length) throw rescheduleConflict;
        await tx.post.update({ where: { id: post.id }, data: { scheduledAt, timezone: input.timezone } });
      });
    } catch (error) {
      if (error === rescheduleConflict) {
        res.status(409).json({ error: "A publishing job started while this post was being rescheduled. Refresh the calendar and retry." });
        return;
      }
      throw error;
    }
    res.json({ ok: true, scheduledAt: scheduledAt.toISOString(), timezone: input.timezone });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const postId = z.string().parse(req.params.id);
    const post = await prisma.post.findFirst({
      where: { id: postId, workspaceId: req.workspace!.id },
      select: {
        id: true,
        status: true,
        targets: { select: { status: true } },
        publishJobs: { select: { status: true } },
      },
    });
    if (!post) {
      res.status(404).json({ error: "Post not found." });
      return;
    }
    if (post.status === "PUBLISHING" || post.publishJobs.some((job) => job.status === "PROCESSING")) {
      res.status(409).json({ error: "This post is currently publishing. Wait for publishing to finish before removing it from the workspace." });
      return;
    }
    const deleted = await prisma.$transaction(async (tx) => {
      const current = await tx.post.findFirst({
        where: { id: postId, workspaceId: req.workspace!.id },
        select: {
          status: true,
          targets: { select: { status: true } },
          publishJobs: { select: { status: true } },
        },
      });
      if (!current || current.status === "PUBLISHING" ||
        current.publishJobs.some((job) => job.status === "PROCESSING")) return false;
      await tx.publishJob.updateMany({
        where: { postId, workspaceId: req.workspace!.id, status: { in: ["QUEUED", "FAILED"] } },
        data: { status: "CANCELLED", lockedAt: null },
      });
      const deleted = await tx.post.deleteMany({
        where: {
          id: postId,
          workspaceId: req.workspace!.id,
          status: { not: "PUBLISHING" },
          publishJobs: { none: { status: "PROCESSING" } },
        },
      });
      return deleted.count === 1;
    });
    if (!deleted) {
      res.status(409).json({ error: "This post changed or started publishing while deletion was in progress. Refresh the queue and try again." });
      return;
    }
    res.json({
      removedFromWorkspace: true,
      publishedPostsRemainOnPlatforms: post.targets.some((target) => target.status === "PUBLISHED"),
    });
  } catch (error) {
    next(error);
  }
});

export { router as postsRouter };

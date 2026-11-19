import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router, raw } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { requireAuth, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";
import {
  createUploadUrl,
  deleteStoredObject,
  fromObjectStorageKey,
  getStoredObject,
  inspectStoredObject,
  isObjectStorageConfigured,
  readObjectPrefix,
  toObjectStorageKey,
} from "../services/object-storage.js";

const router = Router();
const megabyte = 1024 * 1024;
const maxUploadBytes = 100 * megabyte;
const maxLargeUploadBytes = 500 * megabyte;
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "application/pdf", "audio/mpeg", "audio/wav"]);
const largeUploadIssuer = "united-technologies-large-media-upload";
const largeUploadClaimsSchema = z.object({
  purpose: z.literal("large-media-upload"),
  workspaceId: z.string().min(1),
  ownerId: z.string().min(1),
  key: z.string().min(1),
  fileName: z.string().min(1).max(180),
  mimeType: z.string().refine((value) => supportedTypes.has(value)),
  sizeBytes: z.number().int().gt(maxUploadBytes).lte(maxLargeUploadBytes),
  inGallery: z.boolean(),
});
const largeUploadPresignSchema = z.object({
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().refine((value) => supportedTypes.has(value)),
  sizeBytes: z.number().int().gt(maxUploadBytes).lte(maxLargeUploadBytes),
  inGallery: z.boolean().default(false),
});

function isAllowedFile(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === "image/webp") return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  if (mimeType === "video/mp4") return buffer.toString("ascii", 4, 8) === "ftyp";
  if (mimeType === "application/pdf") return buffer.toString("ascii", 0, 5) === "%PDF-";
  if (mimeType === "audio/mpeg") return buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer.length > 1 && buffer[0] === 0xff && (buffer[1]! & 0xe0) === 0xe0);
  if (mimeType === "audio/wav") return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE";
  return false;
}

function safeFileName(value: string, encoded = false) {
  const fileName = encoded ? decodeURIComponent(value) : value;
  const name = fileName.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name || name.length > 180 || name === "." || name === "..") {
    throw new URIError("Choose a file with a name between 1 and 180 characters.");
  }
  return name;
}

function inlineFileDisposition(fileName: string) {
  const fallbackName = fileName.replace(/[^\x20-\x7e]|["\\;]/g, "_");
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
}

function contentIdFromMetadata(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    "contentId" in value && typeof value.contentId === "string" ? value.contentId : null;
}

router.use(requireAuth, requireWorkspace);

router.get("/uploads", async (req, res, next) => {
  try {
    const library = z.enum(["media", "gallery"]).optional().parse(req.query.library);
    const assets = await prisma.mediaAsset.findMany({
      where: {
        workspaceId: req.workspace!.id,
        OR: [{ storageKey: "database-upload" }, { storageKey: { startsWith: "s3://" } }],
        ...(library ? { inGallery: library === "gallery" } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, brandId: true, metadata: true, storageKey: true, createdAt: true },
    });
    res.json({
      assets: assets.map((asset) => ({
        ...asset,
        sizeBytes: asset.sizeBytes.toString(),
        canUseMagicHour: asset.storageKey === "database-upload" && asset.sizeBytes <= BigInt(50 * 1024 * 1024),
        contentId: asset.metadata && typeof asset.metadata === "object" &&
          !Array.isArray(asset.metadata) && "contentId" in asset.metadata &&
          typeof asset.metadata.contentId === "string" ? asset.metadata.contentId : null,
        url: `/api/media/uploads/${encodeURIComponent(asset.id)}/file`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/uploads",
  requireWritableWorkspace,
  rateLimit({ windowMs: 60_000, limit: 3, standardHeaders: "draft-8", legacyHeaders: false }),
  raw({ type: "application/octet-stream", limit: maxUploadBytes }),
  async (req, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: "Choose a non-empty supported image, video, PDF, MP3, or WAV file." });
        return;
      }
      const mimeType = z.string().parse(req.header("x-file-mime-type"));
      if (!supportedTypes.has(mimeType)) {
        res.status(415).json({ error: "Supported imports are JPEG, PNG, WebP, MP4, PDF, MP3, and WAV files." });
        return;
      }
      if (!isAllowedFile(req.body, mimeType)) {
        res.status(415).json({ error: "The file content does not match its declared type or is damaged." });
        return;
      }
      const fileName = safeFileName(z.string().min(1).parse(req.header("x-file-name")), true);
      const inGallery = z.enum(["true", "false"]).default("false").parse(req.header("x-in-gallery") ?? "false") === "true";
      const requestedBrandId = req.header("x-brand-id");
      const brand = await prisma.brand.findFirst({
        where: {
          workspaceId: req.workspace!.id,
          ...(requestedBrandId ? { id: requestedBrandId } : {}),
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!brand) {
        res.status(404).json({ error: "Create a brand profile before importing files." });
        return;
      }

      const contentFormat = mimeType.startsWith("image/") ? "post" : mimeType === "video/mp4" ? "video" : null;
      const result = await prisma.$transaction(async (tx) => {
        const asset = await tx.mediaAsset.create({
          data: {
            workspaceId: req.workspace!.id,
            resellerId: req.workspace!.resellerId,
            brandId: brand.id,
            ownerId: req.auth!.userId,
            inGallery,
            fileName,
            storageKey: "database-upload",
            mimeType,
            sizeBytes: BigInt(req.body.length),
          },
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, brandId: true, metadata: true, createdAt: true },
        });
        // Store the complete upload in one binary column update. MariaDB's
        // max_allowed_packet must be configured above the upload limit.
        await tx.mediaAsset.update({
          where: { id: asset.id },
          data: { fileData: req.body },
          select: { id: true },
        });
        const storedFile = await tx.mediaAsset.findUnique({
          where: { id: asset.id },
          select: { fileData: true },
        });
        if (!storedFile?.fileData || storedFile.fileData.byteLength !== req.body.length) {
          throw new Error("The database did not store the complete upload. Increase MariaDB max_allowed_packet and restart MySQL before retrying.");
        }
        const content = contentFormat
          ? await tx.generatedContent.create({
              data: {
                workspaceId: req.workspace!.id,
                resellerId: req.workspace!.resellerId,
                brandId: brand.id,
                request: `Imported media: ${fileName}`,
                contentJson: {
                  format: contentFormat,
                  title: fileName.replace(/\.[^.]+$/, ""),
                  caption: "",
                  hashtags: [],
                  platforms: ["Instagram"],
                  importedMediaAssetId: asset.id,
                } satisfies Prisma.InputJsonObject,
                provider: "media-upload",
                status: "COMPLETED",
              },
              select: { id: true },
            })
          : null;
        const updatedAsset = content
          ? await tx.mediaAsset.update({
              where: { id: asset.id },
              data: { metadata: { contentId: content.id } satisfies Prisma.InputJsonObject },
              select: { id: true, fileName: true, mimeType: true, sizeBytes: true, brandId: true, metadata: true, createdAt: true },
            })
          : asset;
        return { asset: updatedAsset, content };
      });
      res.status(201).json({
        asset: {
          ...result.asset,
          sizeBytes: result.asset.sizeBytes.toString(),
          url: `/api/media/uploads/${encodeURIComponent(result.asset.id)}/file`,
        },
        contentId: result.content?.id ?? null,
      });
    } catch (error) {
      if (error instanceof URIError) {
        res.status(400).json({ error: error.message || "The uploaded file name is invalid." });
        return;
      }
      next(error);
    }
  },
);

router.post(
  "/uploads/large/presign",
  requireWritableWorkspace,
  rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false }),
  async (req, res, next) => {
  try {
    if (!isObjectStorageConfigured()) {
      res.status(503).json({ error: "Large uploads require configured S3-compatible storage. Add the S3 storage settings to the API service, then retry." });
      return;
    }
    const input = largeUploadPresignSchema.parse(req.body);
    const fileName = safeFileName(input.fileName);
    const requestedBrandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(requestedBrandId ? { id: requestedBrandId } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!brand) {
      res.status(404).json({ error: "Create a brand profile before importing files." });
      return;
    }

    const key = `workspaces/${req.workspace!.id}/media/${randomUUID()}`;
    const signed = await createUploadUrl({
      key,
      mimeType: input.mimeType,
      workspaceId: req.workspace!.id,
      ownerId: req.auth!.userId,
    });
    const uploadToken = jwt.sign({
      purpose: "large-media-upload",
      workspaceId: req.workspace!.id,
      ownerId: req.auth!.userId,
      key,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      inGallery: input.inGallery,
    } satisfies z.infer<typeof largeUploadClaimsSchema>, env.JWT_ACCESS_SECRET, {
      issuer: largeUploadIssuer,
      expiresIn: "20m",
    });
    res.status(201).json({ uploadUrl: signed.url, headers: signed.headers, uploadToken });
  } catch (error) {
    if (error instanceof URIError) {
      res.status(400).json({ error: error.message || "The uploaded file name is invalid." });
      return;
    }
    next(error);
  }
  },
);

router.post(
  "/uploads/large/complete",
  requireWritableWorkspace,
  rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false }),
  async (req, res, next) => {
  try {
    const token = z.string().min(32).max(4096).parse(req.body?.uploadToken);
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: largeUploadIssuer });
    const claims = largeUploadClaimsSchema.parse(payload);
    if (claims.workspaceId !== req.workspace!.id || claims.ownerId !== req.auth!.userId) {
      res.status(403).json({ error: "This upload does not belong to the signed-in user and workspace." });
      return;
    }
    const requestedBrandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: claims.workspaceId, ...(requestedBrandId ? { id: requestedBrandId } : {}) },
      orderBy: { createdAt: "asc" },
      select: { id: true },
      },
    );
    if (!brand) {
      res.status(404).json({ error: "The selected brand is no longer available." });
      return;
    }

    const storageKey = toObjectStorageKey(claims.key);
    const existing = await prisma.mediaAsset.findFirst({
      where: { workspaceId: claims.workspaceId, storageKey },
      select: { id: true, fileName: true, mimeType: true, sizeBytes: true, brandId: true, metadata: true, createdAt: true },
    });
    if (existing) {
      res.json({
        asset: {
          ...existing,
          sizeBytes: existing.sizeBytes.toString(),
          url: `/api/media/uploads/${encodeURIComponent(existing.id)}/file`,
        },
        contentId: contentIdFromMetadata(existing.metadata),
      });
      return;
    }

    const stored = await inspectStoredObject(claims.key);
    if (stored.workspaceId !== claims.workspaceId || stored.ownerId !== claims.ownerId ||
      stored.sizeBytes !== claims.sizeBytes || stored.mimeType !== claims.mimeType) {
      res.status(400).json({ error: "The uploaded object does not match the signed upload details." });
      return;
    }
    if (!isAllowedFile(await readObjectPrefix(claims.key), claims.mimeType)) {
      res.status(415).json({ error: "The file content does not match its declared type or is damaged." });
      return;
    }

    const contentFormat = claims.mimeType.startsWith("image/") ? "post" : claims.mimeType === "video/mp4" ? "video" : null;
    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          workspaceId: claims.workspaceId,
          resellerId: req.workspace!.resellerId,
          brandId: brand.id,
          ownerId: claims.ownerId,
          inGallery: claims.inGallery,
          fileName: claims.fileName,
          storageKey,
          mimeType: claims.mimeType,
          sizeBytes: BigInt(claims.sizeBytes),
        },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, brandId: true, metadata: true, createdAt: true },
      });
      const content = contentFormat
        ? await tx.generatedContent.create({
            data: {
              workspaceId: claims.workspaceId,
              resellerId: req.workspace!.resellerId,
              brandId: brand.id,
              request: `Imported media: ${claims.fileName}`,
              contentJson: {
                format: contentFormat,
                title: claims.fileName.replace(/\.[^.]+$/, ""),
                caption: "",
                hashtags: [],
                platforms: ["Instagram"],
                importedMediaAssetId: asset.id,
              } satisfies Prisma.InputJsonObject,
              provider: "media-upload",
              status: "COMPLETED",
            },
            select: { id: true },
          })
        : null;
      const updatedAsset = content
        ? await tx.mediaAsset.update({
            where: { id: asset.id },
            data: { metadata: { contentId: content.id } satisfies Prisma.InputJsonObject },
            select: { id: true, fileName: true, mimeType: true, sizeBytes: true, brandId: true, metadata: true, createdAt: true },
          })
        : asset;
      return { asset: updatedAsset, content };
    });
    res.status(201).json({
      asset: {
        ...result.asset,
        sizeBytes: result.asset.sizeBytes.toString(),
        url: `/api/media/uploads/${encodeURIComponent(result.asset.id)}/file`,
      },
      contentId: result.content?.id ?? null,
    });
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof z.ZodError) {
      res.status(410).json({ error: "This upload session is invalid or expired. Please start the upload again." });
      return;
    }
    next(error);
  }
});

router.get("/uploads/:id/file", async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id,
        workspaceId: req.workspace!.id,
        OR: [{ storageKey: "database-upload" }, { storageKey: { startsWith: "s3://" } }],
      },
      select: { fileName: true, mimeType: true, fileData: true, storageKey: true, sizeBytes: true },
    });
    if (!asset) {
      res.status(404).json({ error: "This imported file is no longer available." });
      return;
    }
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Disposition": inlineFileDisposition(asset.fileName),
      "Content-Type": asset.mimeType,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
    const objectKey = fromObjectStorageKey(asset.storageKey);
    if (objectKey) {
      const range = req.header("range");
      if (range && !/^bytes=\d*-\d*$/.test(range)) {
        res.status(416).setHeader("Content-Range", `bytes */${asset.sizeBytes}`);
        res.end();
        return;
      }
      const object = await getStoredObject(objectKey, range);
      if (!object.Body) {
        res.status(404).json({ error: "This imported file is no longer available." });
        return;
      }
      res.setHeader("Accept-Ranges", "bytes");
      if (object.ContentLength !== undefined) res.setHeader("Content-Length", object.ContentLength);
      if (object.ContentRange) res.setHeader("Content-Range", object.ContentRange);
      if (object.$metadata.httpStatusCode) res.status(object.$metadata.httpStatusCode);
      await pipeline(Readable.from(object.Body.transformToWebStream() as AsyncIterable<Uint8Array>), res);
      return;
    }
    if (!asset.fileData) {
      res.status(404).json({ error: "This imported file is no longer available." });
      return;
    }
    res.send(Buffer.from(asset.fileData));
  } catch (error) {
    next(error);
  }
});

router.delete("/uploads/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const asset = await prisma.mediaAsset.findFirst({
      where: {
        id,
        workspaceId: req.workspace!.id,
        OR: [{ storageKey: "database-upload" }, { storageKey: { startsWith: "s3://" } }],
      },
      select: { id: true, storageKey: true },
    });
    if (!asset) {
      res.status(404).json({ error: "Imported file not found." });
      return;
    }
    const deletion = await prisma.$transaction(async (tx) => {
      const referenced = await tx.postTarget.count({
        where: { workspaceId: req.workspace!.id, mediaAssetId: id },
      });
      if (referenced) return { deleted: false, reason: "post" as const };
      const activeVideoReference = await tx.videoRenderJob.count({
        where: {
          workspaceId: req.workspace!.id,
          status: { in: ["QUEUED", "PROCESSING"] },
          OR: [
            { inputJson: { path: "$.sourceAssetId", equals: id } },
            { inputJson: { path: "$.sourceVideoAssetId", equals: id } },
            { inputJson: { path: "$.voiceSampleAssetId", equals: id } },
          ],
        },
      });
      if (activeVideoReference) return { deleted: false, reason: "video" as const };
      await tx.generatedContent.deleteMany({
        where: {
          workspaceId: req.workspace!.id,
          contentJson: { path: "$.importedMediaAssetId", equals: id },
        },
      });
      const result = await tx.mediaAsset.deleteMany({
        where: {
          id,
          workspaceId: req.workspace!.id,
          OR: [{ storageKey: "database-upload" }, { storageKey: { startsWith: "s3://" } }],
        },
      });
      return { deleted: result.count === 1, reason: null };
    });
    if (!deletion.deleted) {
      res.status(409).json({ error: deletion.reason === "video"
        ? "This file is being used by a queued or rendering video. Wait for the job to finish or cancel it before deleting the file."
        : "This file is attached to a queued or published post. Remove the post record before deleting the file." });
      return;
    }
    const objectKey = fromObjectStorageKey(asset.storageKey);
    if (objectKey) await deleteStoredObject(objectKey);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export { router as mediaRouter };

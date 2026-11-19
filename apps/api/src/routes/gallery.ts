import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";

const router = Router();
const locationSchema = z.object({ inGallery: z.boolean() });
const kindSchema = z.enum(["design", "content", "video", "upload"]);

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.patch("/:kind/:id", requireWritableWorkspace, async (req, res, next) => {
  try {
    const kind = kindSchema.parse(req.params.kind);
    const id = z.string().min(1).parse(req.params.id);
    const { inGallery } = locationSchema.parse(req.body);
    const workspaceId = req.workspace!.id;

    const updated = kind === "design"
      ? await prisma.design.updateMany({ where: { id, workspaceId }, data: { inGallery } })
      : kind === "content"
        ? await prisma.generatedContent.updateMany({
            where: { id, workspaceId, provider: { not: "platform-regeneration" } },
            data: { inGallery },
          })
        : kind === "video"
          ? await prisma.videoRenderJob.updateMany({
              where: { id, workspaceId, status: "SUCCEEDED", outputKey: { not: null } },
              data: { inGallery },
            })
          : await prisma.mediaAsset.updateMany({
              where: {
                id,
                workspaceId,
                OR: [{ storageKey: "database-upload" }, { storageKey: { startsWith: "s3://" } }],
              },
              data: { inGallery },
            });

    if (updated.count !== 1) {
      res.status(404).json({ error: "This workspace asset could not be found." });
      return;
    }

    res.json({ ok: true, inGallery });
  } catch (error) {
    next(error);
  }
});

export { router as galleryRouter };

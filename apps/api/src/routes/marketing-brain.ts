import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWritableWorkspace, requireWorkspace } from "../middleware/auth.js";
import { getMarketingIntelligence } from "../services/marketing-brain.js";

const router = Router();
const decisionSchema = z.object({
  decision: z.enum(["accept", "snooze", "dismiss"]),
});

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.get("/", async (req, res, next) => {
  try {
    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace!.id, ...(brandId ? { id: brandId } : {}) },
      select: { id: true },
    });
    if (!brand) {
      res.status(404).json({ error: "No brand profile exists in this workspace." });
      return;
    }

    const intelligence = await getMarketingIntelligence(req.workspace!.id, brand.id);
    res.setHeader("Cache-Control", "no-store");
    res.json(intelligence);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/decision", requireWritableWorkspace, async (req, res, next) => {
  try {
    const id = z.string().trim().min(1).parse(req.params.id);
    const { decision } = decisionSchema.parse(req.body);
    const recommendation = await prisma.marketingRecommendation.findFirst({
      where: { id, workspaceId: req.workspace!.id },
      select: { id: true, brandId: true, status: true, recommendationKey: true },
    });
    if (!recommendation) {
      res.status(404).json({ error: "Recommendation not found in this workspace." });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.marketingRecommendation.update({
        where: { id: recommendation.id },
        data: {
          status: decision === "accept" ? "ACCEPTED" : decision === "snooze" ? "SNOOZED" : "DISMISSED",
          snoozedUntil: decision === "snooze" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: `marketing.recommendation.${decision}`,
          targetType: "marketing-recommendation",
          targetId: recommendation.id,
          metadata: { recommendationKey: recommendation.recommendationKey },
        },
      });
      return saved;
    });
    res.json({ recommendation: updated });
  } catch (error) {
    next(error);
  }
});

export { router as marketingBrainRouter };

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWritableWorkspace, requireWorkspace, requireWorkspaceRole } from "../middleware/auth.js";

export const notificationSettingsRouter = Router();
notificationSettingsRouter.use(requireAuth, requireWorkspace);

notificationSettingsRouter.get("/approval-email", async (req, res, next) => {
  try {
    const [workspace, user] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: req.workspace!.id }, select: { approvalEmailRecipient: true } }),
      prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { email: true } }),
    ]);
    res.json({
      recipient: workspace?.approvalEmailRecipient ?? user?.email ?? "",
      isCustom: Boolean(workspace?.approvalEmailRecipient),
      accountEmail: user?.email ?? "",
    });
  } catch (error) {
    next(error);
  }
});

notificationSettingsRouter.put(
  "/approval-email",
  requireWorkspaceRole("OWNER", "ADMIN"),
  requireWritableWorkspace,
  async (req, res, next) => {
    try {
      const input = z.object({
        recipient: z.union([z.string().trim().email().max(320), z.null()]),
      }).parse(req.body);
      const workspace = await prisma.workspace.update({
        where: { id: req.workspace!.id },
        data: { approvalEmailRecipient: input.recipient },
        select: { approvalEmailRecipient: true },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: "workspace.approval_email_recipient.updated",
          targetType: "workspace",
          targetId: req.workspace!.id,
          metadata: { usesAccountEmail: input.recipient === null },
        },
      });
      res.json({ recipient: workspace.approvalEmailRecipient });
    } catch (error) {
      next(error);
    }
  },
);

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWorkspace } from "../middleware/auth.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, requireWorkspace);

notificationsRouter.get("/", async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { workspaceId: req.workspace!.id, userId: req.auth!.userId },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, kind: true, title: true, body: true, readAt: true, createdAt: true },
    });
    res.json({ notifications, unreadCount: notifications.filter((item) => !item.readAt).length });
  } catch (error) {
    next(error);
  }
});

notificationsRouter.patch("/:id/read", async (req, res, next) => {
  try {
    const id = z.string().min(1).parse(req.params.id);
    const result = await prisma.notification.updateMany({
      where: { id, workspaceId: req.workspace!.id, userId: req.auth!.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await prisma.notification.findFirst({
        where: { id, workspaceId: req.workspace!.id, userId: req.auth!.userId },
        select: { id: true },
      });
      if (!exists) {
        res.status(404).json({ error: "Notification not found." });
        return;
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

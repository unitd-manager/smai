import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWorkspace } from "../middleware/auth.js";

const router = Router();

const settingsSchema = z.object({
  preset: z.enum([
    "midnight-blue-purple", "teal-gold", "ocean-blue", "royal-purple", "charcoal-orange", "forest-green",
    "rose-plum", "slate-sky", "sunset-coral", "midnight-silver", "midnight-electric-purple", "classic-white-blue", "custom",
  ]),
  mode: z.enum(["light", "dark", "system"]),
  sidebarStyle: z.enum(["colored", "light"]),
  density: z.enum(["comfortable", "compact"]),
  corners: z.enum(["subtle", "rounded", "pill"]),
  fontPairing: z.enum(["modern", "editorial", "classic"]),
  cardStyle: z.enum(["bordered", "elevated"]),
  customPrimary: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  customAccent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res, next) => {
  try {
    const [user, workspace] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.auth!.userId },
        select: { themePreference: true },
      }),
      prisma.workspace.findUnique({
        where: { id: req.workspace!.id },
        select: { themeDefaults: true },
      }),
    ]);
    res.json({
      userSettings: user?.themePreference ?? null,
      workspaceSettings: workspace?.themeDefaults ?? null,
      canManageWorkspaceDefault: req.workspace!.role === "OWNER",
    });
  } catch (error) {
    next(error);
  }
});

router.put("/", async (req, res, next) => {
  try {
    const input = z.object({
      scope: z.enum(["user", "workspace"]),
      settings: settingsSchema,
    }).parse(req.body);

    if (input.scope === "workspace") {
      if (req.workspace!.role !== "OWNER") {
        res.status(403).json({ error: "Only the workspace owner can set the workspace theme default." });
        return;
      }
      const workspace = await prisma.workspace.update({
        where: { id: req.workspace!.id },
        data: { themeDefaults: input.settings as Prisma.InputJsonValue },
        select: { themeDefaults: true },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: "workspace.theme.updated",
          targetType: "workspace",
          targetId: req.workspace!.id,
          metadata: { preset: input.settings.preset, mode: input.settings.mode },
        },
      });
      res.json({ settings: workspace.themeDefaults });
      return;
    }

    const user = await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { themePreference: input.settings as Prisma.InputJsonValue },
      select: { themePreference: true },
    });
    res.json({ settings: user.themePreference });
  } catch (error) {
    next(error);
  }
});

router.delete("/user", async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.auth!.userId },
      data: { themePreference: Prisma.DbNull },
      select: { id: true },
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export { router as themeSettingsRouter };

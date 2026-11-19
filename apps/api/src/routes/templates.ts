import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWorkspace } from "../middleware/auth.js";
import { starterTemplates } from "../services/template-library.js";

const router = Router();
const filterSchema = z.object({
  format: z.string().trim().min(1).optional(),
  search: z.string().trim().max(100).optional(),
});

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res, next) => {
  try {
    const filter = filterSchema.parse(req.query);
    const storedTemplates = await prisma.template.findMany({
      where: {
        active: true,
        ...(filter.format ? { format: filter.format } : {}),
        OR: [
          { workspaceId: null, resellerId: null },
          { workspaceId: req.workspace!.id },
        ],
      },
      orderBy: [{ format: "asc" }, { name: "asc" }],
      take: 100,
      select: {
        id: true,
        name: true,
        format: true,
        language: true,
        templateJson: true,
        workspaceId: true,
      },
    });
    const starterIds = new Set(starterTemplates.map((template) => template.id));
    const templates = [
      ...starterTemplates.map((template) => ({ ...template, workspaceId: null })),
      ...storedTemplates.filter((template) => !starterIds.has(template.id)),
    ].filter((template) => filter.format === undefined || template.format === filter.format);
    const search = filter.search?.toLocaleLowerCase();
    const items = templates.filter((template) => {
      if (!search) return true;
      const details = JSON.stringify(template.templateJson).toLocaleLowerCase();
      return `${template.name} ${template.format} ${details}`.toLocaleLowerCase().includes(search);
    });
    res.json({ templates: items, total: items.length });
  } catch (error) {
    next(error);
  }
});

export { router as templatesRouter };

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth, requireWritableWorkspace, requireWorkspace, requireWorkspaceRole } from "../middleware/auth.js";

const router = Router();
const createClientSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

async function getAgencyContext(req: Request, res: Response) {
  const workspaceId = req.workspace?.billingWorkspaceId ?? req.workspace?.id;
  const userId = req.auth?.userId;
  if (!workspaceId || !userId || req.workspace?.role !== "OWNER") {
    res.status(403).json({ error: "Only the agency owner can manage client workspaces." });
    return null;
  }

  const [workspace, agencyProfile] = await Promise.all([
    prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        status: "ACTIVE",
        memberships: { some: { userId, role: "OWNER" } },
      },
      select: { id: true, name: true, resellerId: true, trialStartsAt: true, trialEndsAt: true },
    }),
    prisma.companyProfile.findFirst({
      where: { workspaceId, accountType: "AGENCY" },
      select: { id: true },
    }),
  ]);
  if (!workspace || !agencyProfile) {
    res.status(403).json({ error: "Agency workspace management is available only to the owner of an agency account." });
    return null;
  }

  const reseller = await prisma.$transaction(async (tx) => {
    const existing = await tx.reseller.findUnique({ where: { ownerUserId: userId } });
    if (existing && workspace.resellerId && existing.id !== workspace.resellerId) {
      throw new Error("This agency workspace is linked to a different reseller account.");
    }
    const current = await tx.reseller.upsert({
      where: { ownerUserId: userId },
      create: {
        ownerUserId: userId,
        name: workspace.name,
        status: "ACTIVE",
        plan: "agency",
      },
      update: {},
    });
    if (workspace.resellerId !== current.id) {
      await tx.workspace.update({ where: { id: workspace.id }, data: { resellerId: current.id } });
      await tx.brand.updateMany({ where: { workspaceId: workspace.id }, data: { resellerId: current.id } });
      await tx.companyProfile.updateMany({ where: { workspaceId: workspace.id }, data: { resellerId: current.id } });
      await tx.brandKit.updateMany({ where: { workspaceId: workspace.id }, data: { resellerId: current.id } });
    }
    return current;
  });

  return { workspace, reseller };
}

router.use(requireAuth, requireWorkspace);

router.get("/clients", async (req, res, next) => {
  try {
    const context = await getAgencyContext(req, res);
    if (!context) return;
    const clients = await prisma.workspace.findMany({
      where: {
        resellerId: context.reseller.id,
        billingWorkspaceId: context.workspace.id,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        brands: { select: { id: true, name: true }, orderBy: { createdAt: "asc" }, take: 1 },
        _count: { select: { memberships: true } },
      },
    });
    res.json({
      agency: { name: context.reseller.name, workspaceId: context.workspace.id },
      clients: clients.map((client) => ({
        id: client.id,
        name: client.name,
        brandId: client.brands[0]?.id ?? null,
        memberCount: client._count.memberships,
        createdAt: client.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/clients", requireWorkspaceRole("OWNER"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = createClientSchema.parse(req.body);
    const context = await getAgencyContext(req, res);
    if (!context) return;
    const client = await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name: input.name,
          resellerId: context.reseller.id,
          billingWorkspaceId: context.workspace.id,
          trialStartsAt: context.workspace.trialStartsAt,
          trialEndsAt: context.workspace.trialEndsAt,
          memberships: { create: { userId: req.auth!.userId, role: "OWNER" } },
        },
      });
      const brand = await tx.brand.create({
        data: { workspaceId: workspace.id, resellerId: context.reseller.id, name: input.name },
        select: { id: true },
      });
      await tx.companyProfile.create({
        data: {
          workspaceId: workspace.id,
          resellerId: context.reseller.id,
          brandId: brand.id,
          accountType: "BUSINESS",
          emailType: "WORK",
          segment: "agency-client",
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorId: req.auth!.userId,
          action: "agency.client_workspace.created",
          targetType: "workspace",
          targetId: workspace.id,
          metadata: { name: input.name, billingWorkspaceId: context.workspace.id },
        },
      });
      return { id: workspace.id, name: workspace.name, brandId: brand.id, createdAt: workspace.createdAt };
    });
    res.status(201).json({ client });
  } catch (error) {
    next(error);
  }
});

export { router as agencyRouter };

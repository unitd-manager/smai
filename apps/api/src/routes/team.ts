import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../env.js";
import { prisma } from "../db.js";
import { hashToken, requireAuth, requireWritableWorkspace, requireWorkspace, requireWorkspaceRole } from "../middleware/auth.js";
import { sendTeamInviteEmail } from "../services/team-invite-email.js";

const router = Router();
const inviteSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(["ADMIN", "EDITOR", "CONTRIBUTOR", "VIEWER"]),
});
const roleSchema = z.object({
  role: z.enum(["ADMIN", "EDITOR", "CONTRIBUTOR", "VIEWER"]),
});

router.use(requireAuth, requireWorkspace);

router.get("/", async (req, res, next) => {
  try {
    const [members, invites] = await Promise.all([
      prisma.membership.findMany({
        where: { workspaceId: req.workspace!.id },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.teamInvite.findMany({
        where: { workspaceId: req.workspace!.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      }),
    ]);
    res.json({
      members,
      invites: ["OWNER", "ADMIN"].includes(req.workspace!.role) ? invites : [],
      currentRole: req.workspace!.role,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/invites", requireWorkspaceRole("OWNER", "ADMIN"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const input = inviteSchema.parse(req.body);
    if (req.workspace!.role === "ADMIN" && input.role === "ADMIN") {
      res.status(403).json({ error: "Only the workspace owner can invite another administrator." });
      return;
    }
    const [existingMember, existingInvite] = await Promise.all([
      prisma.membership.findFirst({
        where: { workspaceId: req.workspace!.id, user: { email: input.email } },
        select: { id: true },
      }),
      prisma.teamInvite.findUnique({
        where: { workspaceId_email: { workspaceId: req.workspace!.id, email: input.email } },
        select: { id: true, acceptedAt: true, expiresAt: true },
      }),
    ]);
    if (existingMember) {
      res.status(409).json({ error: "This person is already a workspace member." });
      return;
    }
    if (existingInvite?.acceptedAt) {
      res.status(409).json({ error: "This invitation was already accepted." });
      return;
    }
    if (existingInvite && existingInvite.expiresAt > new Date()) {
      res.status(409).json({ error: "An active invitation already exists for this email." });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = existingInvite
      ? await prisma.teamInvite.update({
          where: { id: existingInvite.id },
          data: { inviterId: req.auth!.userId, role: input.role, tokenHash: hashToken(token), expiresAt, createdAt: new Date() },
          select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        })
      : await prisma.teamInvite.create({
          data: {
            workspaceId: req.workspace!.id,
            inviterId: req.auth!.userId,
            email: input.email,
            role: input.role,
            tokenHash: hashToken(token),
            expiresAt,
          },
          select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        });
    const inviteUrl = new URL("/accept-invite", env.WEB_ORIGIN);
    inviteUrl.searchParams.set("token", token);
    await prisma.auditLog.create({
      data: {
        workspaceId: req.workspace!.id,
        actorId: req.auth!.userId,
        action: "team.invite.created",
        targetType: "team-invite",
        targetId: invite.id,
        metadata: { email: invite.email, role: invite.role },
      },
    });
    const emailStatus = await sendTeamInviteEmail(invite.email, input.role, inviteUrl.toString());
    res.status(201).json({
      invite,
      inviteUrl: inviteUrl.toString(),
      emailStatus: emailStatus.status,
      emailMessage: emailStatus.status === "sent" ? undefined : emailStatus.message,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/invites/:id/resend", requireWorkspaceRole("OWNER", "ADMIN"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const inviteId = z.string().min(1).parse(req.params.id);
    const existingInvite = await prisma.teamInvite.findFirst({
      where: { id: inviteId, workspaceId: req.workspace!.id },
      select: { id: true, email: true, role: true, acceptedAt: true },
    });
    if (!existingInvite) {
      res.status(404).json({ error: "Invitation not found." });
      return;
    }
    if (existingInvite.acceptedAt) {
      res.status(409).json({ error: "This invitation was already accepted." });
      return;
    }
    if (existingInvite.role === "OWNER") {
      res.status(409).json({ error: "Workspace invitations cannot grant owner access." });
      return;
    }
    const inviteRole = roleSchema.shape.role.parse(existingInvite.role);

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invite = await prisma.teamInvite.update({
      where: { id: existingInvite.id },
      data: {
        inviterId: req.auth!.userId,
        tokenHash: hashToken(token),
        expiresAt,
        createdAt: new Date(),
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
    const inviteUrl = new URL("/accept-invite", env.WEB_ORIGIN);
    inviteUrl.searchParams.set("token", token);
    await prisma.auditLog.create({
      data: {
        workspaceId: req.workspace!.id,
        actorId: req.auth!.userId,
        action: "team.invite.resent",
        targetType: "team-invite",
        targetId: invite.id,
        metadata: { email: invite.email, role: invite.role },
      },
    });
    const emailStatus = await sendTeamInviteEmail(invite.email, inviteRole, inviteUrl.toString());
    res.json({
      invite,
      inviteUrl: inviteUrl.toString(),
      emailStatus: emailStatus.status,
      emailMessage: emailStatus.status === "sent" ? undefined : emailStatus.message,
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/invites/:id", requireWorkspaceRole("OWNER", "ADMIN"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const inviteId = z.string().min(1).parse(req.params.id);
    const deleted = await prisma.teamInvite.deleteMany({
      where: { id: inviteId, workspaceId: req.workspace!.id, acceptedAt: null },
    });
    if (!deleted.count) {
      res.status(404).json({ error: "Active invitation not found." });
      return;
    }
    await prisma.auditLog.create({
      data: {
        workspaceId: req.workspace!.id,
        actorId: req.auth!.userId,
        action: "team.invite.cancelled",
        targetType: "team-invite",
        targetId: inviteId,
      },
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.patch("/members/:id/owner", requireWorkspaceRole("OWNER"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const membershipId = z.string().min(1).parse(req.params.id);
    const ownerMembership = await prisma.membership.findFirst({
      where: { workspaceId: req.workspace!.id, userId: req.auth!.userId, role: "OWNER" },
      select: { id: true },
    });
    const target = await prisma.membership.findFirst({
      where: { id: membershipId, workspaceId: req.workspace!.id },
      select: { id: true, role: true, userId: true, user: { select: { name: true, email: true } } },
    });
    if (!ownerMembership || !target || target.role === "OWNER" || target.userId === req.auth!.userId) {
      res.status(404).json({ error: "A transferable workspace member was not found." });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.membership.update({ where: { id: target.id }, data: { role: "OWNER" } });
      await tx.membership.update({ where: { id: ownerMembership.id }, data: { role: "ADMIN" } });
      await tx.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: "team.owner.transferred",
          targetType: "membership",
          targetId: target.id,
          metadata: { newOwnerUserId: target.userId },
        },
      });
    });
    res.json({ member: { id: target.id, role: "OWNER", user: target.user } });
  } catch (error) {
    next(error);
  }
});

router.patch("/members/:id", requireWorkspaceRole("OWNER", "ADMIN"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const membershipId = z.string().min(1).parse(req.params.id);
    const input = roleSchema.parse(req.body);
    const target = await prisma.membership.findFirst({
      where: { id: membershipId, workspaceId: req.workspace!.id },
      select: { id: true, role: true, userId: true },
    });
    if (!target || target.role === "OWNER") {
      res.status(404).json({ error: "Editable workspace member not found." });
      return;
    }
    if (req.workspace!.role === "ADMIN" && (target.role === "ADMIN" || input.role === "ADMIN")) {
      res.status(403).json({ error: "Only the workspace owner can change administrator access." });
      return;
    }
    const updated = await prisma.membership.update({
      where: { id: target.id },
      data: { role: input.role },
      select: { id: true, role: true, user: { select: { name: true, email: true } } },
    });
    await prisma.auditLog.create({
      data: {
        workspaceId: req.workspace!.id,
        actorId: req.auth!.userId,
        action: "team.member.role_changed",
        targetType: "membership",
        targetId: target.id,
        metadata: { from: target.role, to: updated.role },
      },
    });
    res.json({ member: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/members/:id", requireWorkspaceRole("OWNER", "ADMIN"), requireWritableWorkspace, async (req, res, next) => {
  try {
    const membershipId = z.string().min(1).parse(req.params.id);
    const target = await prisma.membership.findFirst({
      where: { id: membershipId, workspaceId: req.workspace!.id },
      select: { id: true, userId: true, role: true },
    });
    if (!target || target.role === "OWNER") {
      res.status(404).json({ error: "Removable workspace member not found." });
      return;
    }
    if (req.workspace!.role === "ADMIN" && target.role === "ADMIN") {
      res.status(403).json({ error: "Only the workspace owner can remove another administrator." });
      return;
    }
    await prisma.$transaction([
      prisma.membership.delete({ where: { id: target.id } }),
      prisma.auditLog.create({
        data: {
          workspaceId: req.workspace!.id,
          actorId: req.auth!.userId,
          action: "team.member.removed",
          targetType: "membership",
          targetId: target.id,
          metadata: { removedUserId: target.userId, role: target.role },
        },
      }),
    ]);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export { router as teamRouter };

import { randomBytes } from "node:crypto";
import { Router, type Response } from "express";
import type { AccountType as PrismaAccountType } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { approvalEmailConfigured, env } from "../env.js";
import { prisma } from "../db.js";
import { hashToken, requireAuth } from "../middleware/auth.js";
import { sendPasswordResetEmail } from "../services/password-reset-email.js";

const router = Router();
const freeEmailDomains = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
]);
const disposableDomains = new Set(["mailinator.com", "10minutemail.com", "tempmail.com"]);

const signupSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(72).refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Password must not exceed 72 bytes.",
    ),
    companyName: z.string().trim().min(2).max(120),
    companyWebsite: z
      .union([z.string().trim().url(), z.literal("")])
      .optional()
      .transform((value) => value || undefined),
    accountType: z.enum(["business", "agency", "creator", "personal"]),
    noWebsite: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (
      (data.accountType === "business" || data.accountType === "agency") &&
      !data.companyWebsite &&
      !data.noWebsite
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["companyWebsite"],
        message: "A company website is required for business and agency accounts.",
      });
    }
    if (data.companyWebsite && !/^https?:\/\//i.test(data.companyWebsite)) {
      ctx.addIssue({
        code: "custom",
        path: ["companyWebsite"],
        message: "Use a website URL that starts with http:// or https://.",
      });
    }
  });

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
});
const resetPasswordSchema = z.object({
  token: z.string().min(32).max(128),
  password: z.string().min(12).max(72).refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed 72 bytes.",
  ),
});
const passwordResetRequestMessage = "If an account exists for that email, a password reset link will be sent shortly.";
const invalidPasswordResetMessage = "This password reset link is invalid or has expired. Request a new one.";
const inviteSignupSchema = z.object({
  token: z.string().min(32).max(128),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(72).refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed 72 bytes.",
  ),
});
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(72).refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must not exceed 72 bytes.",
  ),
});
const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  confirmation: z.literal("DELETE"),
});

function issueSessionCookies(res: Response, userId: string) {
  const { accessToken, refreshToken } = createSessionTokens(userId);
  setSessionCookies(res, accessToken, refreshToken);
  return refreshToken;
}

function createSessionTokens(userId: string) {
  const accessToken = jwt.sign({}, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign(
    { jti: randomBytes(16).toString("hex") },
    env.JWT_REFRESH_SECRET,
    { subject: userId, expiresIn: "30d" },
  );
  return { accessToken, refreshToken };
}

function setSessionCookies(res: Response, accessToken: string, refreshToken: string) {
  const cookieOptions = {
    httpOnly: true,
    secure: env.COOKIE_SECURE === "true" || env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };

  res.cookie("pf_access", accessToken, { ...cookieOptions, path: "/api", maxAge: 15 * 60 * 1000 });
  res.cookie("pf_refresh", refreshToken, {
    ...cookieOptions,
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

router.get("/invite/:token", async (req, res, next) => {
  try {
    const token = z.string().min(32).max(128).parse(req.params.token);
    const invite = await prisma.teamInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        workspace: { select: { name: true, status: true } },
      },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date() || invite.workspace.status !== "ACTIVE" || invite.role === "OWNER") {
      res.status(410).json({ error: "This invitation is invalid, expired, or already used. Ask the workspace owner for a new link." });
      return;
    }
    res.json({
      invite: {
        email: invite.email,
        role: invite.role,
        workspaceName: invite.workspace.name,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post("/signup-invite", async (req, res, next) => {
  try {
    const input = inviteSignupSchema.parse(req.body);
    const emailDomain = input.email.split("@")[1];
    if (!emailDomain || disposableDomains.has(emailDomain)) {
      res.status(400).json({ error: "Please use a non-disposable email address." });
      return;
    }

    const tokenHash = hashToken(input.token);
    const invite = await prisma.teamInvite.findUnique({
      where: { tokenHash },
      select: {
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        workspace: { select: { id: true, name: true, status: true } },
      },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date() || invite.workspace.status !== "ACTIVE" || invite.role === "OWNER") {
      res.status(410).json({ error: "This invitation is invalid, expired, or already used. Ask the workspace owner for a new link." });
      return;
    }
    if (input.email !== invite.email.toLowerCase()) {
      res.status(403).json({ error: `Use ${invite.email} to create the account for this invitation.` });
      return;
    }
    if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
      res.status(409).json({ error: "An account with this email already exists. Sign in with it to accept the invitation." });
      return;
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const joinResult = await prisma.$transaction(async (tx) => {
      const currentInvite = await tx.teamInvite.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          workspace: { select: { id: true, name: true, status: true } },
        },
      });
      if (!currentInvite || currentInvite.acceptedAt || currentInvite.expiresAt <= new Date() ||
        currentInvite.workspace.status !== "ACTIVE" || currentInvite.role === "OWNER") {
        return { kind: "unavailable" as const };
      }
      if (input.email !== currentInvite.email.toLowerCase()) {
        return { kind: "email_mismatch" as const, email: currentInvite.email };
      }
      if (await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
        return { kind: "account_exists" as const };
      }

      const claimed = await tx.teamInvite.updateMany({
        where: { id: currentInvite.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) return { kind: "unavailable" as const };

      const user = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash },
        select: { id: true, email: true },
      });
      await tx.membership.create({
        data: { userId: user.id, workspaceId: currentInvite.workspace.id, role: currentInvite.role },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: currentInvite.workspace.id,
          actorId: user.id,
          action: "team.invite.accepted",
          targetType: "team-invite",
          targetId: currentInvite.id,
          metadata: { role: currentInvite.role, signup: true },
        },
      });
      return {
        kind: "joined" as const,
        user,
        workspace: { id: currentInvite.workspace.id, name: currentInvite.workspace.name },
        role: currentInvite.role,
      };
    });

    if (joinResult.kind === "unavailable") {
      res.status(410).json({ error: "This invitation is invalid, expired, or already used. Ask the workspace owner for a new link." });
      return;
    }
    if (joinResult.kind === "email_mismatch") {
      res.status(403).json({ error: `Use ${joinResult.email} to create the account for this invitation.` });
      return;
    }
    if (joinResult.kind === "account_exists") {
      res.status(409).json({ error: "An account with this email already exists. Sign in with it to accept the invitation." });
      return;
    }

    const refreshToken = issueSessionCookies(res, joinResult.user.id);
    await prisma.refreshToken.create({
      data: {
        userId: joinResult.user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    res.status(201).json({
      accepted: true,
      user: joinResult.user,
      workspace: joinResult.workspace,
      role: joinResult.role,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/signup", async (req, res, next) => {
  try {
    const input = signupSchema.parse(req.body);
    const emailDomain = input.email.split("@")[1];
    if (!emailDomain || disposableDomains.has(emailDomain)) {
      res.status(400).json({ error: "Please use a non-disposable email address." });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const accountTypes: Record<typeof input.accountType, PrismaAccountType> = {
      business: "BUSINESS",
      agency: "AGENCY",
      creator: "CREATOR",
      personal: "PERSONAL",
    };
    const accountType = accountTypes[input.accountType];
    const emailType = freeEmailDomains.has(emailDomain) ? "FREE" : "WORK";
    const segment =
      input.accountType === "business" && input.companyWebsite
        ? "business-unverified"
        : input.accountType;
    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { name: input.name, email: input.email, passwordHash },
      });
      const reseller = input.accountType === "agency"
        ? await tx.reseller.create({
            data: {
              ownerUserId: createdUser.id,
              name: input.companyName,
              status: "ACTIVE",
              plan: "agency",
            },
          })
        : null;
      const workspace = await tx.workspace.create({
        data: {
          name: input.companyName,
          resellerId: reseller?.id,
          trialStartsAt: now,
          trialEndsAt,
          approvalEmailRecipient: input.email,
          subscription: { create: { plan: "trial", status: "trialing" } },
          memberships: { create: { userId: createdUser.id, role: "OWNER" } },
        },
      });
      const brand = await tx.brand.create({
        data: { workspaceId: workspace.id, resellerId: workspace.resellerId, name: input.companyName },
      });
      await tx.companyProfile.create({
        data: {
          workspaceId: workspace.id,
          resellerId: workspace.resellerId,
          brandId: brand.id,
          companyWebsite: input.companyWebsite,
          accountType,
          emailType,
          segment,
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorId: createdUser.id,
          action: "workspace.created",
          targetType: "workspace",
          targetId: workspace.id,
          metadata: { accountType: input.accountType, segment },
        },
      });
      return createdUser;
    });

    const refreshToken = issueSessionCookies(res, user.id);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      res.status(401).json({ error: "Email or password is incorrect." });
      return;
    }
    const refreshToken = issueSessionCookies(res, user.id);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    next(error);
  }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const input = forgotPasswordSchema.parse(req.body);
    if (!approvalEmailConfigured) {
      res.status(503).json({
        error: "Password reset email is not configured. Set up SMTP or Resend in the API environment, then try again.",
      });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true },
    });
    if (!user) {
      res.status(202).json({ message: passwordResetRequestMessage });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
    ]);

    const resetUrl = new URL("/reset-password", env.WEB_ORIGIN);
    resetUrl.searchParams.set("token", token);
    const emailResult = await sendPasswordResetEmail(user.email, resetUrl.toString());
    if (emailResult.status !== "sent") {
      await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
      if (emailResult.status === "not_configured") {
        res.status(503).json({ error: emailResult.message });
        return;
      }
      console.error("Password reset request could not send its email.", { reason: emailResult.message });
    }
    res.status(202).json({ message: passwordResetRequestMessage });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const input = resetPasswordSchema.parse(req.body);
    const tokenHash = hashToken(input.token);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const now = new Date();
    const reset = await prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        select: { id: true, userId: true, expiresAt: true, usedAt: true },
      });
      if (!token || token.usedAt || token.expiresAt <= now) return false;

      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return false;

      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash, emailVerifiedAt: now },
      });
      await tx.refreshToken.deleteMany({ where: { userId: token.userId } });
      await tx.passwordResetToken.deleteMany({ where: { userId: token.userId } });
      return true;
    });
    if (!reset) {
      res.status(400).json({ error: invalidPasswordResetMessage });
      return;
    }
    res.json({ ok: true, message: "Your password has been reset. Sign in with your new password." });
  } catch (error) {
    next(error);
  }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const oldToken = req.cookies?.pf_refresh;
    if (typeof oldToken !== "string") {
      res.status(401).json({ error: "Refresh token is required." });
      return;
    }
    let subject: string;
    try {
      const payload = jwt.verify(oldToken, env.JWT_REFRESH_SECRET);
      if (typeof payload === "string" || typeof payload.sub !== "string") {
        throw new Error("Refresh token has no subject.");
      }
      subject = payload.sub;
    } catch {
      res.clearCookie("pf_access", { path: "/api" });
      res.clearCookie("pf_refresh", { path: "/api/auth" });
      res.status(401).json({ error: "Your session has expired. Please sign in again." });
      return;
    }
    const tokenHash = hashToken(oldToken);
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.userId !== subject || stored.expiresAt <= new Date()) {
      if (stored) await prisma.refreshToken.delete({ where: { id: stored.id } });
      res.clearCookie("pf_access", { path: "/api" });
      res.clearCookie("pf_refresh", { path: "/api/auth" });
      res.status(401).json({ error: "Your session has expired. Please sign in again." });
      return;
    }

    const nextToken = issueSessionCookies(res, stored.userId);
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: stored.id } }),
      prisma.refreshToken.create({
        data: {
          userId: stored.userId,
          tokenHash: hashToken(nextToken),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.pf_refresh;
    if (typeof refreshToken === "string") {
      await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(refreshToken) } });
    }
    res.clearCookie("pf_access", { path: "/api" });
    res.clearCookie("pf_refresh", { path: "/api/auth" });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: {
        id: true,
        name: true,
        email: true,
        memberships: {
          select: {
            role: true,
            workspace: {
              select: {
                id: true,
                name: true,
                trialStartsAt: true,
                trialEndsAt: true,
                resellerId: true,
              },
            },
          },
        },
      },
    });
    if (!user) {
      res.status(401).json({ error: "Account not found." });
      return;
    }
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const input = changePasswordSchema.parse(req.body);
    if (input.currentPassword === input.newPassword) {
      res.status(400).json({ error: "Choose a new password different from your current password." });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      res.status(400).json({ error: "Your current password is incorrect." });
      return;
    }
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    const tokens = createSessionTokens(user.id);
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: hashToken(tokens.refreshToken),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);
    setSessionCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.delete("/account", requireAuth, async (req, res, next) => {
  try {
    const input = deleteAccountSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user || !(await bcrypt.compare(input.currentPassword, user.passwordHash))) {
      res.status(400).json({ error: "Your current password is incorrect." });
      return;
    }

    const blockers = await prisma.$transaction(async (tx) => {
      const ownerMemberships = await tx.membership.findMany({
        where: { userId: user.id, role: "OWNER" },
        select: { workspaceId: true, workspace: { select: { name: true } } },
      });
      const workspacesWithoutAnotherOwner: string[] = [];
      for (const membership of ownerMemberships) {
        const otherOwners = await tx.membership.count({
          where: { workspaceId: membership.workspaceId, userId: { not: user.id }, role: "OWNER" },
        });
        if (!otherOwners) workspacesWithoutAnotherOwner.push(membership.workspace.name);
      }
      const ownsReseller = await tx.reseller.count({ where: { ownerUserId: user.id } }) > 0;
      if (workspacesWithoutAnotherOwner.length || ownsReseller) {
        return { workspacesWithoutAnotherOwner, ownsReseller };
      }

      await tx.mediaAsset.updateMany({ where: { ownerId: user.id }, data: { ownerId: null } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.auditLog.updateMany({ where: { actorId: user.id }, data: { actorId: null } });
      await tx.membership.deleteMany({ where: { userId: user.id } });
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
      return null;
    });

    if (blockers) {
      const details = blockers.workspacesWithoutAnotherOwner.length
        ? ` Transfer ownership of these workspaces first: ${blockers.workspacesWithoutAnotherOwner.join(", ")}.`
        : "";
      const resellerDetails = blockers.ownsReseller
        ? " Transfer reseller ownership through support before deleting this account."
        : "";
      res.status(409).json({ error: `Your account still owns data that needs another owner.${details}${resellerDetails}` });
      return;
    }

    res.clearCookie("pf_access", { path: "/api" });
    res.clearCookie("pf_refresh", { path: "/api/auth" });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.post("/accept-invite", requireAuth, async (req, res, next) => {
  try {
    const token = z.string().min(32).max(128).parse(req.body?.token);
    const invite = await prisma.teamInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        workspace: { select: { name: true, status: true } },
      },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date() || invite.workspace.status !== "ACTIVE") {
      res.status(410).json({ error: "This invitation is invalid, expired, or already used. Ask the workspace owner for a new link." });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.auth!.userId },
      select: { id: true, email: true },
    });
    if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
      res.status(403).json({ error: `Sign in with ${invite.email} to accept this invitation.` });
      return;
    }
    const membership = await prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId: invite.workspaceId } },
      select: { id: true },
    });
    if (membership) {
      res.status(409).json({ error: "You are already a member of this workspace." });
      return;
    }
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.teamInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new Error("This invitation has already been accepted or expired.");
      await tx.membership.create({
        data: { userId: user.id, workspaceId: invite.workspaceId, role: invite.role },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: invite.workspaceId,
          actorId: user.id,
          action: "team.invite.accepted",
          targetType: "team-invite",
          targetId: invite.id,
          metadata: { role: invite.role },
        },
      });
    });
    res.json({ accepted: true, workspace: { id: invite.workspaceId, name: invite.workspace.name }, role: invite.role });
  } catch (error) {
    next(error);
  }
});

export {
  router as authRouter,
  deleteAccountSchema,
  forgotPasswordSchema,
  inviteSignupSchema,
  resetPasswordSchema,
  signupSchema,
};

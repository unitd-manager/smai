import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../env.js";
import { prisma } from "../db.js";

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.pf_access;
  if (!token) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    if (typeof payload.sub !== "string") {
      res.status(401).json({ error: "Invalid access token." });
      return;
    }
    req.auth = { userId: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: "Your session has expired. Please sign in again." });
  }
}

export async function requireWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const requestedId = req.header("x-workspace-id");
  const membership = await prisma.membership.findFirst({
    where: {
      userId: req.auth.userId,
      ...(requestedId ? { workspaceId: requestedId } : {}),
    },
    select: {
      role: true,
      workspace: {
        select: {
          id: true,
          resellerId: true,
          billingWorkspaceId: true,
          status: true,
          trialEndsAt: true,
          subscription: { select: { status: true, plan: true } },
          billingWorkspace: {
            select: {
              trialEndsAt: true,
              subscription: { select: { status: true, plan: true } },
            },
          },
        },
      },
    },
  });

  if (!membership || membership.workspace.status !== "ACTIVE") {
    res.status(404).json({ error: "Workspace not found." });
    return;
  }

  req.workspace = {
    id: membership.workspace.id,
    resellerId: membership.workspace.resellerId,
    billingWorkspaceId: membership.workspace.billingWorkspaceId,
    status: membership.workspace.status,
    role: membership.role,
    trialEndsAt: membership.workspace.billingWorkspace?.trialEndsAt ?? membership.workspace.trialEndsAt,
    subscriptionStatus: membership.workspace.billingWorkspace?.subscription?.status ??
      membership.workspace.subscription?.status ?? null,
    subscriptionPlan: membership.workspace.billingWorkspace?.subscription?.plan ??
      membership.workspace.subscription?.plan ?? null,
  };
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && membership.role === "VIEWER") {
    res.status(403).json({ error: "Viewer access is read-only. Ask a workspace administrator for editing access." });
    return;
  }
  next();
}

export async function requireCompleteBrandProfile(req: Request, res: Response, next: NextFunction) {
  if (!req.workspace) {
    res.status(500).json({ error: "Workspace context is missing." });
    return;
  }
  try {
    const brandId = req.header("x-brand-id");
    const brand = await prisma.brand.findFirst({
      where: { workspaceId: req.workspace.id, ...(brandId ? { id: brandId } : {}) },
      select: {
        name: true,
        profile: {
          select: {
            industry: true,
            products: true,
            audience: true,
            tone: true,
            goals: true,
            preferredPlatforms: true,
          },
        },
        kit: { select: { colors: true, fonts: true } },
      },
    });
    if (!brand) {
      res.status(403).json({
        error: "Complete your brand profile before using this feature.",
        code: "BRAND_SETUP_REQUIRED",
      });
      return;
    }
    const hasText = (value: string | null | undefined) => Boolean(value?.trim());
    const hasList = (value: unknown) => Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim());
    const hasColors = Array.isArray(brand.kit?.colors) &&
      brand.kit.colors.some((color) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color));
    const complete = hasText(brand.name) &&
      hasText(brand.profile?.industry) &&
      hasText(brand.profile?.products) &&
      hasText(brand.profile?.audience) &&
      hasText(brand.profile?.tone) &&
      hasList(brand.profile?.goals) &&
      hasList(brand.profile?.preferredPlatforms) &&
      hasColors &&
      hasList(brand.kit?.fonts);
    if (!complete) {
      res.status(403).json({
        error: "Complete your brand profile before using this feature.",
        code: "BRAND_SETUP_REQUIRED",
      });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireWritableWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!req.workspace) {
    res.status(500).json({ error: "Workspace context is missing." });
    return;
  }
  const canWrite =
    req.workspace.subscriptionStatus === "active" ||
    (req.workspace.subscriptionStatus === "trialing" &&
      req.workspace.trialEndsAt > new Date());
  if (!canWrite && req.method !== "GET") {
    res.status(403).json({
      error: "Your trial has ended. Upgrade your plan to make changes.",
      code: "TRIAL_EXPIRED",
    });
    return;
  }
  next();
}

export function requireWorkspaceRole(...roles: NonNullable<Request["workspace"]>["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.workspace) {
      res.status(500).json({ error: "Workspace context is missing." });
      return;
    }
    if (!roles.includes(req.workspace.role)) {
      res.status(403).json({ error: "You do not have permission to change this workspace." });
      return;
    }
    next();
  };
}

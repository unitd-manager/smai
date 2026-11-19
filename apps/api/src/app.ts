import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { profileRouter } from "./routes/profile.js";
import { contentRouter } from "./routes/content.js";
import { templatesRouter } from "./routes/templates.js";
import { designsRouter } from "./routes/designs.js";
import { postsRouter } from "./routes/posts.js";
import { socialAccountsRouter } from "./routes/social-accounts.js";
import { videosRouter } from "./routes/videos.js";
import { mediaRouter } from "./routes/media.js";
import { galleryRouter } from "./routes/gallery.js";
import { systemRouter } from "./routes/system.js";
import { marketingBrainRouter } from "./routes/marketing-brain.js";
import { contentPlansRouter } from "./routes/content-plans.js";
import { contentSetsRouter } from "./routes/content-sets.js";
import { teamRouter } from "./routes/team.js";
import { themeSettingsRouter } from "./routes/theme-settings.js";
import { notificationsRouter } from "./routes/notifications.js";
import { notificationSettingsRouter } from "./routes/notification-settings.js";
import { approvalEmailRouter } from "./routes/approval-email.js";
import { requireAuth, requireWorkspace } from "./middleware/auth.js";
import { prisma } from "./db.js";
import { Prisma } from "@prisma/client";
import { isClientDisconnectError } from "./http-errors.js";

export const app = express();

app.disable("x-powered-by");
// The web app proxies API requests from the same machine. Trust loopback only so
// rate limits can use the forwarded client address without trusting public proxies.
app.set("trust proxy", "loopback");
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: "Too many authentication requests. Wait for the rate-limit cooldown before trying again.",
      code: "AUTH_RATE_LIMIT",
    });
  },
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});
app.get("/health/ready", async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: "ok" });
});
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/brand-profile", profileRouter);
app.use("/api/content", contentRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/designs", designsRouter);
app.use("/api/posts", postsRouter);
app.use("/api/social-accounts", socialAccountsRouter);
app.use("/api/videos", videosRouter);
app.use("/api/media", mediaRouter);
app.use("/api/gallery", galleryRouter);
app.use("/api/system", systemRouter);
app.use("/api/marketing-brain", marketingBrainRouter);
app.use("/api/content-plans", contentPlansRouter);
app.use("/api/content-sets", contentSetsRouter);
app.use("/api/team", teamRouter);
app.use("/api/theme-settings", themeSettingsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/notification-settings", notificationSettingsRouter);
app.use("/api/approval-email", approvalEmailRouter);

app.get("/api/workspaces", requireAuth, async (req, res, next) => {
  try {
    const [user, memberships] = await Promise.all([
      prisma.user.findUnique({
        where: { id: req.auth!.userId },
        select: { name: true, email: true },
      }),
      prisma.membership.findMany({
        where: { userId: req.auth!.userId, workspace: { status: "ACTIVE" } },
        orderBy: { createdAt: "asc" },
        select: {
          role: true,
          workspace: {
            select: {
              id: true,
              name: true,
              trialEndsAt: true,
              subscription: { select: { status: true } },
              brands: { select: { id: true, name: true }, orderBy: { createdAt: "asc" } },
            },
          },
        },
      }),
    ]);
    res.json({
      workspaces: memberships.map(({ role, workspace }) => {
        const { subscription, ...workspaceData } = workspace;
        return {
          ...workspaceData,
          role,
          subscriptionStatus: subscription?.status ?? null,
          trialDaysRemaining:
            subscription?.status === "trialing"
              ? Math.max(0, Math.ceil((workspace.trialEndsAt.getTime() - Date.now()) / 86400000))
              : 0,
        };
      }),
      user: user ? { name: user.name, email: user.email } : null,
      isSuperAdmin: Boolean(
        user?.email &&
          env.SUPER_ADMIN_EMAIL &&
          user.email.toLowerCase() === env.SUPER_ADMIN_EMAIL.toLowerCase(),
      ),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const workspaceId = req.workspace!.id;
    const brandId = req.header("x-brand-id");
    const now = new Date();
    const trialing = req.workspace!.subscriptionStatus === "trialing";
    const [brandCount, profile] = await Promise.all([
      prisma.brand.count({ where: { workspaceId } }),
      prisma.brand.findFirst({
        where: { workspaceId, ...(brandId ? { id: brandId } : {}) },
        select: { id: true, name: true, profile: true, kit: true },
      }),
    ]);
    res.json({
      workspace: req.workspace,
      brandCount,
      brand: profile,
      trialExpired: trialing && req.workspace!.trialEndsAt <= now,
      trialDaysRemaining: trialing
        ? Math.max(0, Math.ceil((req.workspace!.trialEndsAt.getTime() - now.getTime()) / 86400000))
        : 0,
      subscriptionStatus: req.workspace!.subscriptionStatus,
    });
  } catch (error) {
    next(error);
  }
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.destroyed || isClientDisconnectError(error)) return;
  if (res.headersSent) {
    _next(error);
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Please check the submitted information.",
      issues: error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
    });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    res.status(409).json({ error: "That value is already in use." });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P1001", "P1002"].includes(error.code)) {
    res.status(503).json({ error: "The workspace database is unavailable. Start MySQL in XAMPP and confirm it is listening on localhost:3306, then retry." });
    return;
  }
  if (error instanceof Error && "type" in error && error.type === "entity.too.large") {
    res.status(413).json({ error: "The uploaded file exceeds the 100 MB per-file limit." });
    return;
  }
  console.error("Unhandled API error", error);
  res.status(500).json({ error: "An unexpected error occurred." });
};

app.use(errorHandler);

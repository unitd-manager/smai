import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stat, statfs } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { Router } from "express";
import { prisma } from "../db.js";
import { approvalEmailConfigured, approvalEmailProvider, env, hasPartialSmtpConfiguration } from "../env.js";
import { requireAuth, requireWorkspace, requireWorkspaceRole } from "../middleware/auth.js";
import { getInstagramAccessToken } from "../services/instagram.js";
import { listMusicTracks, remotionBrowserStatus, videoToolStatus } from "../services/video-renderer.js";
import { ttsConfiguration } from "../services/video-tts.js";

const router = Router();
const execFileAsync = promisify(execFile);
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function optionalExecutableAvailable(executable: string) {
  if (path.isAbsolute(executable) || executable.includes(path.sep)) return existsSync(executable);
  const command = process.platform === "win32" ? "where.exe" : "which";
  try {
    await execFileAsync(command, [executable], { windowsHide: true, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

type Check = {
  id: string;
  label: string;
  status: "ready" | "warning" | "error";
  message: string;
  action?: string;
};

export async function runStartupPreflight() {
  const checks = await Promise.all([
    prisma.$queryRaw`SELECT 1`
      .then(() => true)
      .catch((error: unknown) => {
        console.error("Startup preflight: database is unavailable.", error);
        return false;
      }),
    statfs(apiRoot)
      .then((disk) => disk.bavail * disk.bsize > 1024 ** 3)
      .catch((error: unknown) => {
        console.error("Startup preflight: disk space could not be checked.", error);
        return false;
      }),
    videoToolStatus().then((tools) => tools.ffmpeg && tools.ffprobe),
    remotionBrowserStatus().then((browser) => browser.available),
    execFileAsync(env.PIPER_EXECUTABLE, ["--help"], { windowsHide: true, timeout: 8_000 })
      .then(() => ttsConfiguration().providers.piper)
      .catch((error: unknown) => {
        console.error("Startup preflight: Piper is unavailable.", error);
        return false;
      }),
    listMusicTracks()
      .then(async (tracks) => {
        await Promise.all(tracks.map((track) => stat(track.file)));
        return tracks.length > 0;
      })
      .catch((error: unknown) => {
        console.error("Startup preflight: the music library is unavailable.", error);
        return false;
      }),
    optionalExecutableAvailable(env.RHUBARB_EXECUTABLE),
  ]);
  const readyCount = checks.filter(Boolean).length;
  console.info(`Startup preflight completed: ${readyCount}/${checks.length} core checks ready.`);
}

router.use(requireAuth, requireWorkspace, requireWorkspaceRole("OWNER", "ADMIN"));

router.get("/status", async (req, res, next) => {
  try {
    const checks: Check[] = [];
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.push({ id: "database", label: "Database", status: "ready", message: "The workspace database is responding." });
    } catch (error) {
      console.error("System status database check failed.", error);
      checks.push({ id: "database", label: "Database", status: "error", message: "The database is not responding.", action: "Start MySQL in XAMPP and confirm the API database connection." });
    }

    try {
      const disk = await statfs(apiRoot);
      const freeBytes = disk.bavail * disk.bsize;
      const freeGb = freeBytes / 1024 ** 3;
      checks.push({
        id: "disk",
        label: "Disk space",
        status: freeGb < 1 ? "error" : freeGb < 5 ? "warning" : "ready",
        message: `${freeGb.toFixed(1)} GB available for renders and uploads.`,
        ...(freeGb < 5 ? { action: "Free up disk space before rendering large videos." } : {}),
      });
    } catch (error) {
      console.error("System status disk check failed.", error);
      checks.push({ id: "disk", label: "Disk space", status: "warning", message: "Available storage could not be checked.", action: "Verify that the API process can read its application directory." });
    }

    const tools = await videoToolStatus();
    checks.push({
      id: "ffmpeg",
      label: "FFmpeg and FFprobe",
      status: tools.ffmpeg && tools.ffprobe ? "ready" : "error",
      message: tools.ffmpeg && tools.ffprobe ? "Video processing tools are available." : "One or more video processing tools are unavailable.",
      ...(!tools.ffmpeg || !tools.ffprobe ? { action: "Install FFmpeg and add ffmpeg.exe and ffprobe.exe to PATH, or configure their paths for the API." } : {}),
    });

    const browser = await remotionBrowserStatus();
    checks.push({
      id: "chromium",
      label: "Remotion Chromium",
      status: browser.available ? "ready" : "warning",
      message: browser.message,
      ...(!browser.available ? { action: "Allow the API to download Remotion's Chrome Headless Shell on the first render; verify outbound network access." } : {}),
    });

    const tts = ttsConfiguration();
    let piperReady = false;
    try {
      await execFileAsync(env.PIPER_EXECUTABLE, ["--help"], { windowsHide: true, timeout: 8_000 });
      piperReady = tts.providers.piper;
    } catch (error) {
      console.error("System status Piper check failed.", error);
    }
    checks.push({
      id: "piper",
      label: "Voice generation",
      status: piperReady ? "ready" : "error",
      message: piperReady ? "Piper and a voice model are ready." : "Piper or its configured voice model is unavailable.",
      ...(!piperReady ? { action: "Install the Piper executable and configure a local Piper voice model." } : {}),
    });

    const rhubarbAvailable = await optionalExecutableAvailable(env.RHUBARB_EXECUTABLE);
    checks.push({
      id: "rhubarb",
      label: "Rhubarb Lip Sync",
      status: rhubarbAvailable ? "ready" : "warning",
      message: rhubarbAvailable ? "The optional Rhubarb executable is available." : "Rhubarb is not installed; current renders do not include lip-synced mouth animation.",
      ...(!rhubarbAvailable ? { action: "Install Rhubarb and set RHUBARB_EXECUTABLE to its command or full path when lip-sync rendering is enabled." } : {}),
    });

    try {
      const tracks = await listMusicTracks();
      const missingTracks = [];
      for (const track of tracks) {
        try {
          await stat(track.file);
        } catch {
          missingTracks.push(track.id);
        }
      }
      checks.push({
        id: "music",
        label: "Background music",
        status: tracks.length > 0 && missingTracks.length === 0 ? "ready" : "warning",
        message: missingTracks.length === 0 ? `${tracks.length} licensed tracks are available.` : `${missingTracks.length} music files are missing.`,
        ...(missingTracks.length ? { action: "Restore the missing files listed in the music manifest." } : {}),
      });
    } catch (error) {
      console.error("System status music check failed.", error);
      checks.push({ id: "music", label: "Background music", status: "error", message: "The music library could not be loaded.", action: "Check the local music manifest and audio files." });
    }

    const contentProviderConfigured = Boolean(env.GOOGLE_AI_STUDIO_API_KEY || env.GROQ_API_KEY || env.OPENAI_API_KEY);
    const configuredProviders = [
      env.GOOGLE_AI_STUDIO_API_KEY ? "Gemini" : null,
      env.GROQ_API_KEY ? "Groq" : null,
      env.OPENAI_API_KEY ? "OpenAI" : null,
    ].filter((provider): provider is string => provider !== null);
    checks.push({
      id: "ai",
      label: "AI content provider",
      status: contentProviderConfigured ? "ready" : "warning",
      message: contentProviderConfigured
        ? `Configured AI text providers in fallback order: ${configuredProviders.join(" → ")}.`
        : "AI content generation is unavailable until a provider key is configured.",
      ...(!contentProviderConfigured ? { action: "Add GOOGLE_AI_STUDIO_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY to apps/api/.env and restart the API." } : {}),
    });
    checks.push({
      id: "approval-email",
      label: "Email approvals",
      status: approvalEmailConfigured ? "ready" : "warning",
      message: approvalEmailConfigured
        ? `Scheduled post approvals can be sent by ${approvalEmailProvider}.`
        : "Posts remain approval-gated, but approval email delivery is not configured.",
      ...(!approvalEmailConfigured ? {
        action: hasPartialSmtpConfiguration
          ? "Complete SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in apps/api/.env, then restart the API."
          : "Configure SMTP_HOST, SMTP_USER, and SMTP_PASSWORD, or set RESEND_API_KEY and EMAIL_FROM in apps/api/.env, then restart the API.",
      } : {}),
    });
    checks.push({
      id: "images",
      label: "Image provider",
      status: env.PEXELS_API_KEY ? "ready" : "warning",
      message: env.PEXELS_API_KEY ? "Optional stock-image credentials are configured." : "Generated brand backgrounds are used; stock imagery is not configured.",
    });

    try {
      const accounts = await prisma.socialAccount.findMany({
        where: { workspaceId: req.workspace!.id, status: "CONNECTED" },
        orderBy: { createdAt: "asc" },
        select: { id: true, provider: true, displayName: true, providerAccountId: true, encryptedTokens: true, tokenExpiresAt: true },
      });
      if (accounts.length === 0) {
        checks.push({ id: "social-accounts", label: "Social accounts", status: "warning", message: "No social accounts are connected to this workspace.", action: "Connect an account from Social Accounts before scheduling live posts." });
      } else {
        for (const account of accounts) {
          const expired = account.tokenExpiresAt !== null && account.tokenExpiresAt.getTime() <= Date.now();
          let valid = !expired && account.provider === "instagram";
          if (valid) {
            try {
              const { accessToken } = await getInstagramAccessToken(account);
              const tokenCheckUrl = new URL(`https://graph.instagram.com/${env.INSTAGRAM_GRAPH_API_VERSION}/me`);
              tokenCheckUrl.searchParams.set("fields", "id");
              tokenCheckUrl.searchParams.set("access_token", accessToken);
              const tokenResponse = await fetch(tokenCheckUrl, { signal: AbortSignal.timeout(10_000) });
              valid = tokenResponse.ok;
            } catch (error) {
              console.error(`System status Instagram token check failed for account ${account.id}.`, error);
              valid = false;
            }
          }
          checks.push({
            id: `social-${account.id}`,
            label: `${account.provider} · ${account.displayName}`,
            status: valid ? "ready" : "error",
            message: valid ? "Instagram confirmed this account token." : expired ? "The saved connection has expired." : "The account token could not be verified.",
            ...(!valid ? { action: "Reconnect this account from Social Accounts and retry the check." } : {}),
          });
        }
      }
    } catch (error) {
      console.error("System status social-account check failed.", error);
      checks.push({ id: "social-accounts", label: "Social accounts", status: "error", message: "Connected account status could not be checked.", action: "Check the database connection and retry." });
    }

    const status = checks.some((check) => check.status === "error")
      ? "attention"
      : checks.some((check) => check.status === "warning")
        ? "degraded"
        : "ready";
    res.json({ status, checkedAt: new Date().toISOString(), checks });
  } catch (error) {
    next(error);
  }
});

export { router as systemRouter };

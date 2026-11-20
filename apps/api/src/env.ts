import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { brand } from "@united-technologies/shared/brand";

const localEnv = loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });
for (const [key, value] of Object.entries(localEnv.parsed ?? {})) {
  if (process.env[key] === "") process.env[key] = value;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.preprocess(
    (value) => {
      if (typeof value !== "string" || value.trim() === "") return "http://localhost:3000";
      const origin = value.trim();
      return /^[a-z][a-z\d+.-]*:\/\//i.test(origin) ? origin : `https://${origin}`;
    },
    z.string().url(),
  ),
  PUBLIC_API_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  INSTAGRAM_APP_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  INSTAGRAM_APP_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  INSTAGRAM_REDIRECT_URI: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  SOCIAL_TOKEN_ENCRYPTION_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  ),
  INSTAGRAM_GRAPH_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v26.0"),
  FFMPEG_PATH: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  FFPROBE_PATH: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  PRODUCT_NAME: z.string().min(1).default(brand.productName),
  TAVILY_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().min(1).optional()),
  GOOGLE_AI_STUDIO_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  GOOGLE_AI_STUDIO_MODEL: z.string().min(1).default("gemini-3.5-flash-lite"),
  OPENAI_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
  DESIGN_IMAGE_MODEL: z.string().min(1).default("gemini-3.1-flash-image"),
  GROQ_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  GROQ_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  RESEND_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  EMAIL_FROM: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  SMTP_HOST: z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : undefined, z.string().optional()),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(["true", "false"]).default("false"),
  SMTP_USER: z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : undefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess((value) => typeof value === "string" && value ? value : undefined, z.string().optional()),
  SMTP_FROM: z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : undefined, z.string().min(1).max(320).optional()),
  PIPER_EXECUTABLE: z.string().min(1).default("piper"),
  PIPER_VOICE_MODEL: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  PIPER_MULTISPEAKER_VOICE_MODEL: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  RHUBARB_EXECUTABLE: z.string().min(1).default("rhubarb"),
  PEXELS_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  MAGIC_HOUR_API_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().min(1).optional()),
  MAGIC_HOUR_API_KEY_2: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().min(1).optional()),
  S3_BUCKET: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().min(1).optional()),
  S3_REGION: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().min(1).optional()),
  S3_ENDPOINT: z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional()),
  S3_ACCESS_KEY_ID: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  S3_SECRET_ACCESS_KEY: z.preprocess((value) => (value === "" ? undefined : value), z.string().optional()),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),
  SUPER_ADMIN_EMAIL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().email().optional(),
  ),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
});

export const env = envSchema.parse({
  ...process.env,
  PUBLIC_API_URL: process.env.PUBLIC_API_URL || process.env.RENDER_EXTERNAL_URL,
});

export const smtpApprovalEmailConfigured = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD && (env.SMTP_FROM || env.SMTP_USER));
export const resendApprovalEmailConfigured = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
export const approvalEmailConfigured = smtpApprovalEmailConfigured || resendApprovalEmailConfigured;
export const approvalEmailProvider = smtpApprovalEmailConfigured ? "SMTP" : resendApprovalEmailConfigured ? "Resend" : undefined;
export const hasPartialSmtpConfiguration = Boolean(env.SMTP_HOST || env.SMTP_USER || env.SMTP_PASSWORD || env.SMTP_FROM) && !smtpApprovalEmailConfigured;

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../env.js";

export function getSocialTokenEncryptionKey() {
  if (!env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    throw new Error("Social token encryption is not configured.");
  }
  return Buffer.from(env.SOCIAL_TOKEN_ENCRYPTION_KEY, "hex");
}

export function encryptSocialToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSocialTokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptSocialToken(encrypted: string) {
  const [version, iv, tag, ciphertext] = encrypted.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) {
    throw new Error("The stored social access token has an unsupported format. Reconnect the account.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getSocialTokenEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

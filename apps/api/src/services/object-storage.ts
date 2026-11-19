import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env.js";

const s3ObjectPrefix = "s3://";
let client: S3Client | null = null;

function storageConfiguration() {
  if (!env.S3_BUCKET) {
    throw new Error("Large uploads need S3-compatible storage. Configure S3_BUCKET, S3_REGION, S3_ENDPOINT (if required), and credentials on the API.");
  }
  if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
    throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or leave both empty to use the hosting platform's IAM role.");
  }
  return {
    bucket: env.S3_BUCKET,
    region: env.S3_REGION ?? "us-east-1",
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    credentials: env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
      : undefined,
  };
}

function getClient() {
  const config = storageConfiguration();
  client ??= new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    ...(config.credentials ? { credentials: config.credentials } : {}),
  });
  return { client, bucket: config.bucket };
}

export function isObjectStorageConfigured() {
  return Boolean(env.S3_BUCKET && env.S3_REGION);
}

export function toObjectStorageKey(key: string) {
  if (!key || key.includes("\0")) throw new Error("Invalid object-storage key.");
  return `${s3ObjectPrefix}${key}`;
}

export function fromObjectStorageKey(storageKey: string) {
  return storageKey.startsWith(s3ObjectPrefix) ? storageKey.slice(s3ObjectPrefix.length) : null;
}

export async function createUploadUrl(input: {
  key: string;
  mimeType: string;
  workspaceId: string;
  ownerId: string;
}) {
  const { client: s3, bucket } = getClient();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.key,
    ContentType: input.mimeType,
    Metadata: { workspaceid: input.workspaceId, ownerid: input.ownerId },
  });
  const url = await getSignedUrl(s3, command, { expiresIn: 15 * 60 });
  return {
    url,
    headers: {
      "Content-Type": input.mimeType,
      "x-amz-meta-workspaceid": input.workspaceId,
      "x-amz-meta-ownerid": input.ownerId,
    },
  };
}

export async function inspectStoredObject(key: string) {
  const { client: s3, bucket } = getClient();
  const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return {
    sizeBytes: object.ContentLength ?? 0,
    mimeType: object.ContentType ?? "",
    workspaceId: object.Metadata?.workspaceid ?? "",
    ownerId: object.Metadata?.ownerid ?? "",
  };
}

export async function readObjectPrefix(key: string) {
  const { client: s3, bucket } = getClient();
  const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-15" }));
  if (!result.Body) throw new Error("The uploaded object has no readable content.");
  return Buffer.from(await result.Body.transformToByteArray());
}

export async function getStoredObject(key: string, range?: string) {
  const { client: s3, bucket } = getClient();
  return s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) }));
}

export async function deleteStoredObject(key: string) {
  const { client: s3, bucket } = getClient();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

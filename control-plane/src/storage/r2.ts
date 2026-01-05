import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Env } from "../config.js";

export type PresignPutResult = {
  key: string;
  url: string;
  expiresInSeconds: number;
  headers: Record<string, string>;
};

export type PresignGetResult = {
  key: string;
  url: string;
  expiresInSeconds: number;
};

export function createR2Client(env: Env): S3Client {
  // Cloudflare R2 is S3-compatible and typically requires a custom endpoint.
  // forcePathStyle keeps URLs stable across providers.
  return new S3Client({
    region: env.R2_REGION,
    endpoint: env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export function sanitizeFilename(input: string): string {
  // Prevent path traversal and keep keys predictable.
  const base = input.split(/[\\/]/).pop() ?? "artifact";
  const cleaned = base
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 128);
  return cleaned.length ? cleaned : "artifact";
}

// Alias used by route code to make intent clearer (key name component)
export const sanitizeObjectName = sanitizeFilename;

export function buildArtifactKey(params: {
  projectId: string;
  sessionId: string;
  iteration: number;
  filename: string;
}): string {
  const safe = sanitizeFilename(params.filename);
  return `projects/${params.projectId}/sessions/${params.sessionId}/iter/${params.iteration}/reports/${safe}`;
}

export async function presignPut(env: Env, s3: S3Client, args: {
  key: string;
  contentType: string;
}): Promise<PresignPutResult> {
  const cmd = new PutObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: args.key,
    ContentType: args.contentType,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn: env.R2_PRESIGN_EXPIRES_SECONDS });
  return {
    key: args.key,
    url,
    expiresInSeconds: env.R2_PRESIGN_EXPIRES_SECONDS,
    headers: { "Content-Type": args.contentType },
  };
}

export async function presignGet(env: Env, s3: S3Client, args: {
  key: string;
}): Promise<PresignGetResult> {
  const cmd = new GetObjectCommand({
    Bucket: env.R2_BUCKET,
    Key: args.key,
  });
  const url = await getSignedUrl(s3, cmd, { expiresIn: env.R2_PRESIGN_EXPIRES_SECONDS });
  return {
    key: args.key,
    url,
    expiresInSeconds: env.R2_PRESIGN_EXPIRES_SECONDS,
  };
}

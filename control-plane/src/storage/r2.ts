import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Env } from "../config";

export function createR2(env: Env): S3Client {
  return new S3Client({
    region: env.R2_REGION,
    endpoint: env.R2_ENDPOINT,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
  });
}

export async function presignPut(args: {
  env: Env;
  r2: S3Client;
  key: string;
  contentType: string;
  contentLength: number;
}) {
  const cmd = new PutObjectCommand({
    Bucket: args.env.R2_BUCKET,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.contentLength,
  });
  return getSignedUrl(args.r2, cmd, { expiresIn: args.env.R2_PRESIGN_EXPIRES_SECONDS });
}

export async function presignGet(args: { env: Env; r2: S3Client; key: string }) {
  const cmd = new GetObjectCommand({ Bucket: args.env.R2_BUCKET, Key: args.key });
  return getSignedUrl(args.r2, cmd, { expiresIn: args.env.R2_PRESIGN_EXPIRES_SECONDS });
}

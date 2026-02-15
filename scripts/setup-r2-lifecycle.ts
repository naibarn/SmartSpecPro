/**
 * @file scripts/setup-r2-lifecycle.ts
 * One-time script to apply lifecycle rules to the R2 bucket.
 * Run: npx tsx scripts/setup-r2-lifecycle.ts
 *
 * Requires env vars: R2_ACCESS_KEY, R2_SECRET_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME
 *
 * Lifecycle rules applied:
 * 1. temp/*             -> Delete objects older than 12 days
 * 2. renders/preview/*  -> Delete objects older than 7 days
 * 3. renders/final/*    -> Delete objects older than 12 days
 * 4. All prefixes       -> Abort incomplete multipart uploads after 1 day
 * 5. gallery/*          -> No lifecycle rule (permanent)
 */

import {
  S3Client,
  PutBucketLifecycleConfigurationCommand,
  GetBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";

const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY = process.env.R2_SECRET_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

if (!R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_ACCOUNT_ID || !R2_BUCKET_NAME) {
  console.error(
    "Missing required env vars: R2_ACCESS_KEY, R2_SECRET_KEY, R2_ACCOUNT_ID, R2_BUCKET_NAME",
  );
  process.exit(1);
}

const client = new S3Client({
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: "auto",
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

const lifecycleRules = [
  {
    ID: "cleanup-temp",
    Filter: { Prefix: "temp/" },
    Expiration: { Days: 12 },
    Status: "Enabled" as const,
  },
  {
    ID: "cleanup-preview",
    Filter: { Prefix: "renders/preview/" },
    Expiration: { Days: 7 },
    Status: "Enabled" as const,
  },
  {
    ID: "cleanup-final-renders",
    Filter: { Prefix: "renders/final/" },
    Expiration: { Days: 12 },
    Status: "Enabled" as const,
  },
  {
    ID: "abort-multipart",
    Filter: { Prefix: "" },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    Status: "Enabled" as const,
  },
];

async function main() {
  console.log(`Applying lifecycle rules to bucket: ${R2_BUCKET_NAME}`);
  console.log(`Endpoint: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);

  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: R2_BUCKET_NAME,
      LifecycleConfiguration: { Rules: lifecycleRules },
    }),
  );

  console.log("Lifecycle rules applied successfully.");

  // Verify
  const result = await client.send(
    new GetBucketLifecycleConfigurationCommand({ Bucket: R2_BUCKET_NAME }),
  );
  console.log("Current lifecycle rules:", JSON.stringify(result.Rules, null, 2));
}

main().catch((err) => {
  console.error("Failed to apply lifecycle rules:", err.message);
  process.exit(1);
});

/**
 * Generates signed URLs for sandbox artifacts with tenant isolation.
 */

import { db } from "../../db";
import { sandboxArtifacts, sandboxJobs } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { storagePresignGet } from "../../storage";

/**
 * Generate a presigned GET URL for a sandbox artifact.
 * Enforces tenant isolation by joining sandbox_artifacts with sandbox_jobs.
 */
export async function getArtifactUrl(params: {
  artifactId: number;
  tenantId: string;
  ttlSeconds?: number;
}): Promise<{ url: string; key: string } | null> {
  const ttl = params.ttlSeconds ?? 900;

  // Join artifacts to jobs and verify tenant ownership
  const rows = await db
    .select({
      objectKey: sandboxArtifacts.objectKey,
      tenantId: sandboxJobs.tenantId,
    })
    .from(sandboxArtifacts)
    .innerJoin(sandboxJobs, eq(sandboxArtifacts.sandboxJobId, sandboxJobs.id))
    .where(
      and(
        eq(sandboxArtifacts.id, params.artifactId),
        eq(sandboxJobs.tenantId, params.tenantId),
      ),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const result = await storagePresignGet(rows[0].objectKey, ttl);
  return result;
}

/**
 * Generate signed URLs for all artifacts of a sandbox job.
 * Enforces tenant isolation.
 */
export async function getJobArtifactUrls(params: {
  jobId: string;
  tenantId: string;
  ttlSeconds?: number;
}): Promise<
  Array<{
    artifactId: number;
    url: string;
    key: string;
    mimeType: string;
    isPrimary: boolean;
  }>
> {
  const ttl = params.ttlSeconds ?? 900;

  // Verify job belongs to tenant and get artifacts
  const rows = await db
    .select({
      artifactId: sandboxArtifacts.id,
      objectKey: sandboxArtifacts.objectKey,
      mimeType: sandboxArtifacts.mimeType,
      isPrimary: sandboxArtifacts.isPrimary,
      tenantId: sandboxJobs.tenantId,
    })
    .from(sandboxArtifacts)
    .innerJoin(sandboxJobs, eq(sandboxArtifacts.sandboxJobId, sandboxJobs.id))
    .where(
      and(
        eq(sandboxArtifacts.sandboxJobId, params.jobId),
        eq(sandboxJobs.tenantId, params.tenantId),
      ),
    );

  const results = [];
  for (const row of rows) {
    const signed = await storagePresignGet(row.objectKey, ttl);
    if (signed) {
      results.push({
        artifactId: row.artifactId,
        url: signed.url,
        key: signed.key,
        mimeType: row.mimeType ?? "application/octet-stream",
        isPrimary: row.isPrimary,
      });
    }
  }

  return results;
}

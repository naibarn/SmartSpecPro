import { and, eq } from "drizzle-orm";
import { mediaAssets } from "../../drizzle/schema";
import { getDb } from "../db";
import { CLOUDFLARE_CONTAINER_ON_DEMAND, CLOUDFLARE_MEDIA_PROBE, parseMediaProbeCandidate, requiresContainerMediaProbe, validateMediaProbeSource } from "./cloudflareMediaProbeContracts";
import type { LeaseContext } from "./jobControlPlaneTypes";

type MediaJob = {
  jobId: string; tenantId: string; requestedByUserId: number | null; runtimeType: string;
  jobType: string; executionClass: string; input: unknown; requiredCapabilities?: unknown; contractVersion: string; status: string;
  leaseExpiresAt: Date | null; startedAt: Date | null; timeoutPolicyJson: unknown; timeoutSeconds: number;
};
type Plane = { assertActive(lease: LeaseContext): Promise<void>; heartbeat(lease: LeaseContext): Promise<void> };
/** Resolves a reference through tenant+actor-owned ready assets after canonical
 * claim. A client URL is an equality lookup only, never a network destination. */
export async function prepareCloudflareMediaProbe(job: MediaJob, lease: LeaseContext, plane: Plane) {
  const now = Date.now(), candidate = parseMediaProbeCandidate(job);
  const timeout = (job.timeoutPolicyJson as { hardTimeoutMs?: number } | null)?.hardTimeoutMs;
  const hardTimeout = typeof timeout === "number" && Number.isFinite(timeout) && timeout > 0 ? timeout : job.timeoutSeconds * 1000;
  const expiresAtMs = Math.min(now + 50_000, job.leaseExpiresAt?.getTime() ?? 0,
    (job.startedAt?.getTime() ?? 0) + hardTimeout, Date.parse(process.env.CLOUDFLARE_WORKFLOW_EXPIRES_AT ?? ""));
  if (process.env.CLOUDFLARE_CONTAINER_POLICY !== CLOUDFLARE_CONTAINER_ON_DEMAND || process.env.CLOUDFLARE_MEDIA_PROBE !== CLOUDFLARE_MEDIA_PROBE || !candidate || !requiresContainerMediaProbe(job) || job.runtimeType !== "python_job_worker" ||
      job.contractVersion !== "feature-186-v1" || job.status !== "running" || candidate.userId !== job.requestedByUserId ||
      job.tenantId !== process.env.CLOUDFLARE_WORKFLOW_TENANT_ID?.trim() || !(expiresAtMs > now) || lease.jobId !== job.jobId) {
    throw Object.assign(new Error("CLOUDFLARE_MEDIA_PROBE_NOT_ADMITTED"), { code: "JOB_STATE_CONFLICT" });
  }
  await plane.assertActive(lease);
  await plane.heartbeat(lease); // Also enforces the persisted hard execution deadline.
  const key = candidate.uri.startsWith("r2://") ? candidate.uri.slice(5) : null;
  const [asset] = await getDb().select({ id: mediaAssets.id, tenantId: mediaAssets.tenantId, userId: mediaAssets.userId,
    objectKey: mediaAssets.storageKey, checksumSha256: mediaAssets.checksumSha256, sizeBytes: mediaAssets.fileSize,
    contentType: mediaAssets.mimeType }).from(mediaAssets).where(and(
      eq(mediaAssets.tenantId, job.tenantId), eq(mediaAssets.userId, candidate.userId), eq(mediaAssets.status, "ready"),
      key ? eq(mediaAssets.storageKey, key) : eq(mediaAssets.originalUrl, candidate.uri),
    )).limit(1);
  if (!asset) throw Object.assign(new Error("CLOUDFLARE_MEDIA_ASSET_NOT_OWNED"), { code: "JOB_STATE_CONFLICT" });
  const source = validateMediaProbeSource({ ...asset, assetId: asset.id, checksumSha256: asset.checksumSha256 ?? "",
    sizeBytes: asset.sizeBytes ?? 0, expiresAt: new Date(expiresAtMs).toISOString() }, job.tenantId, candidate.userId, now);
  await plane.assertActive(lease);
  return { mediaSource: source };
}

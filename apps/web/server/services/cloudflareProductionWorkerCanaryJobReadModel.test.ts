import { describe, expect, it, vi } from "vitest";
import { readLatestCloudflareProductionWorkerCanaryJob } from "./cloudflareProductionWorkerCanaryJobReadModel";

function database(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { db: { select } as never, select, from, where, orderBy, limit };
}

describe("latest Production Worker canary job read model", () => {
  it("returns null for a legitimate empty canonical registry", async () => {
    const query = database([]);
    await expect(readLatestCloudflareProductionWorkerCanaryJob(query.db, { tenantId: "tenant-a", projectId: "project-a" })).resolves.toBeNull();
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it.each(["queued", "running", "succeeded", "failed"] as const)("reads a %s job and preserves nullable JSON fields", async status => {
    const job = { jobId: "job-1", status, errorCode: null, output: null, input: null, progress: null,
      attempt: 1, maxAttempts: 1, requesterUserId: 7, createdAt: new Date("2026-10-28T00:00:00Z"),
      updatedAt: new Date("2026-10-28T00:00:01Z"), heartbeatAt: null, leaseExpiresAt: null };
    const query = database([job]);
    await expect(readLatestCloudflareProductionWorkerCanaryJob(query.db, { tenantId: "tenant-a", projectId: "project-a" }))
      .resolves.toEqual(job);
    expect(query.where).toHaveBeenCalledOnce();
    expect(query.orderBy).toHaveBeenCalledOnce();
  });

  it("lets query failures propagate for sanitized router-level SQLSTATE diagnostics", async () => {
    const failure = Object.assign(new Error("private database detail"), { code: "08006" });
    const query = database([]);
    query.limit.mockRejectedValueOnce(failure);
    await expect(readLatestCloudflareProductionWorkerCanaryJob(query.db, { tenantId: "tenant-a", projectId: "project-a" }))
      .rejects.toBe(failure);
  });
});

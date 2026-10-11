import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: new Map<string, any>() }));

vi.mock("../../_core/logger", () => ({ debugError: vi.fn() }));
vi.mock("../verticalDramaCanonicalPromptJobs", () => ({
  readCanonicalPromptJob: vi.fn(
    async ({ jobId, tenantId, userId, jobType }) => {
      const row = state.rows.get(jobId);
      return row?.input.tenantId === tenantId &&
        row?.input.userId === userId &&
        row?.jobType === jobType
        ? row
        : null;
    }
  ),
  findCanonicalPromptJobByIdempotencyKey: vi.fn(
    async ({ tenantId, userId, jobType, idempotencyKey }) =>
      [...state.rows.values()].find(
        row =>
          row.input.tenantId === tenantId &&
          row.input.userId === userId &&
          row.jobType === jobType &&
          row.input.input.idempotencyKey === idempotencyKey
      ) ?? null
  ),
  listCanonicalPromptJobs: vi.fn(
    async ({ tenantId, userId, jobType, activeOnly }) =>
      [...state.rows.values()]
        .reverse()
        .filter(
          row =>
            row.input.tenantId === tenantId &&
            row.input.userId === userId &&
            row.jobType === jobType &&
            (!activeOnly || ["queued", "running"].includes(row.status))
        )
  ),
}));
vi.mock("../feature186VerticalDramaJobAdapter", () => ({
  createFeature186VerticalDramaJob: vi.fn(
    async ({ jobId, jobType, payload }) => {
      const now = new Date().toISOString();
      state.rows.set(jobId, {
        jobId,
        jobType,
        status: "queued",
        canonicalStatus: "queued",
        input: payload,
        output: null,
        error: null,
        createdAt: now,
        updatedAt: now,
      });
      return jobId;
    }
  ),
}));

import {
  enqueueVerticalDramaShotPromptJob,
  getActiveVerticalDramaShotPromptJob,
  getVerticalDramaShotPromptJobStatus,
  type VerticalDramaShotPromptJobPayload,
} from "../verticalDramaShotPromptJobs";

function payload(
  overrides: Partial<VerticalDramaShotPromptJobPayload> = {}
): VerticalDramaShotPromptJobPayload {
  return {
    tenantId: "tenant-1",
    userId: 42,
    seriesId: 21,
    episodeId: 134,
    shotNumber: 9,
    publicUrl: "https://smartaihub.app",
    input: {
      seriesId: "21",
      episodeId: "134",
      shotNumber: 9,
      idempotencyKey: "request-1",
    },
    ...overrides,
  };
}

const owner = {
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 21,
  episodeId: 134,
  shotNumber: 9,
};

beforeEach(() => {
  state.rows.clear();
  vi.clearAllMocks();
});

describe("canonical vertical drama shot prompt jobs", () => {
  it("creates a worker_jobs-backed request and reads it only for its owner", async () => {
    const submitted = await enqueueVerticalDramaShotPromptJob(payload());
    expect(submitted).toMatchObject({ status: "queued", deduped: false });
    await expect(
      getVerticalDramaShotPromptJobStatus(submitted.jobId, owner)
    ).resolves.toMatchObject({
      jobId: submitted.jobId,
      status: "queued",
      shotNumber: 9,
    });
    await expect(
      getVerticalDramaShotPromptJobStatus(submitted.jobId, {
        ...owner,
        tenantId: "other-tenant",
      })
    ).resolves.toBeNull();
  });

  it("deduplicates by idempotency key and active shot role", async () => {
    const first = await enqueueVerticalDramaShotPromptJob(payload());
    await expect(enqueueVerticalDramaShotPromptJob(payload())).resolves.toEqual(
      { jobId: first.jobId, status: "queued", deduped: true }
    );
    await expect(
      enqueueVerticalDramaShotPromptJob(
        payload({ input: { ...payload().input, idempotencyKey: "request-2" } })
      )
    ).resolves.toEqual({ jobId: first.jobId, status: "queued", deduped: true });
    const stop = await enqueueVerticalDramaShotPromptJob(
      payload({
        input: {
          ...payload().input,
          frameRole: "stop",
          idempotencyKey: "stop-1",
        },
      })
    );
    expect(stop.jobId).not.toBe(first.jobId);
    await expect(
      getActiveVerticalDramaShotPromptJob({ ...owner, frameRole: "stop" })
    ).resolves.toMatchObject({ jobId: stop.jobId });
  });

  it("keeps independent shots as separate canonical jobs", async () => {
    const first = await enqueueVerticalDramaShotPromptJob(payload());
    const second = await enqueueVerticalDramaShotPromptJob(
      payload({
        shotNumber: 8,
        input: { ...payload().input, shotNumber: 8, idempotencyKey: "shot-8" },
      })
    );
    expect(first.jobId).not.toBe(second.jobId);
    expect(first.deduped).toBe(false);
    expect(second.deduped).toBe(false);
  });
});

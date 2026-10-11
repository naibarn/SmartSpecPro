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
  enqueueVerticalDramaShotVideoPromptJob,
  getActiveVerticalDramaShotVideoPromptJob,
  getActiveVerticalDramaShotVideoPromptJobs,
  getVerticalDramaShotVideoPromptJobStatus,
  VerticalDramaShotVideoPromptConflictError,
  type VerticalDramaShotVideoPromptJobPayload,
} from "../verticalDramaShotVideoPromptJobs";

function payload(
  overrides: Partial<VerticalDramaShotVideoPromptJobPayload> = {}
): VerticalDramaShotVideoPromptJobPayload {
  return {
    tenantId: "tenant-1",
    userId: 42,
    seriesId: 21,
    episodeId: 137,
    shotNumber: 9,
    publicUrl: "https://smartaihub.app",
    input: {
      seriesId: "21",
      episodeId: "137",
      shotNumber: 9,
      attachShotImage: true,
      qualityLoop: true,
      idempotencyKey: "request-1",
    },
    ...overrides,
  };
}

const owner = {
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 21,
  episodeId: 137,
  shotNumber: 9,
};

beforeEach(() => {
  state.rows.clear();
  vi.clearAllMocks();
});

describe("canonical vertical drama shot video prompt jobs", () => {
  it("creates and reads a canonical worker job with tenant ownership enforced", async () => {
    const submitted = await enqueueVerticalDramaShotVideoPromptJob(payload());
    expect(submitted).toMatchObject({
      status: "queued",
      deduplicated: false,
      queuePosition: 1,
    });
    await expect(
      getVerticalDramaShotVideoPromptJobStatus(submitted.jobId, owner)
    ).resolves.toMatchObject({ jobId: submitted.jobId, status: "queued" });
    await expect(
      getVerticalDramaShotVideoPromptJobStatus(submitted.jobId, {
        ...owner,
        tenantId: "other-tenant",
      })
    ).resolves.toBeNull();
  });

  it("deduplicates identical active requests and rejects conflicting instructions", async () => {
    const first = await enqueueVerticalDramaShotVideoPromptJob(payload());
    await expect(
      enqueueVerticalDramaShotVideoPromptJob(payload())
    ).resolves.toMatchObject({ jobId: first.jobId, deduplicated: true });
    await expect(
      enqueueVerticalDramaShotVideoPromptJob(
        payload({
          input: {
            ...payload().input,
            instruction: "เปลี่ยนเป็น close-up",
            idempotencyKey: "request-2",
          },
        })
      )
    ).rejects.toBeInstanceOf(VerticalDramaShotVideoPromptConflictError);
  });

  it("enforces one active prompt job per shot across variants", async () => {
    const first = await enqueueVerticalDramaShotVideoPromptJob(payload());
    await expect(
      enqueueVerticalDramaShotVideoPromptJob(
        payload({
          variantId: "enhanced",
          input: {
            ...payload().input,
            variantId: "enhanced",
            idempotencyKey: "enhanced-1",
          },
        })
      )
    ).rejects.toBeInstanceOf(VerticalDramaShotVideoPromptConflictError);
    await expect(
      getActiveVerticalDramaShotVideoPromptJob({
        ...owner,
        variantId: "legacy",
      })
    ).resolves.toMatchObject({ jobId: first.jobId });
  });

  it("lists active jobs with canonical queue positions", async () => {
    const first = await enqueueVerticalDramaShotVideoPromptJob(payload());
    const second = await enqueueVerticalDramaShotVideoPromptJob(
      payload({
        shotNumber: 10,
        input: {
          ...payload().input,
          shotNumber: 10,
          idempotencyKey: "shot-10",
        },
      })
    );
    const active = await getActiveVerticalDramaShotVideoPromptJobs({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
      episodeId: owner.episodeId,
    });
    expect(active).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobId: first.jobId, queuePosition: 1 }),
        expect.objectContaining({ jobId: second.jobId, queuePosition: 2 }),
      ])
    );
  });
});

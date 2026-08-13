import { describe, expect, it } from "vitest";
import {
  cancelVerticalDramaDraftQualityQc,
  enqueueVerticalDramaDraftQualityQc,
  getVerticalDramaDraftQualityQcStatus,
  getVerticalDramaDraftQualityQcStatusBySession,
} from "../verticalDramaDraftQualityQcJobs";

function fakeRedis() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    },
    del: async (key: string) => {
      store.delete(key);
      return 1;
    },
  };
}

describe("vertical drama pre-create Draft QC jobs", () => {
  it("deduplicates the same owner/session/request and hides other owners", async () => {
    const redis = fakeRedis();
    const payload = {
      tenantId: "tenant-a",
      userId: 7,
      draftSessionId: "session-1",
      draft: { title: "Proof of Us" },
      immutableConstraints: {},
      maxImprovementRounds: 3 as const,
    };
    const first = await enqueueVerticalDramaDraftQualityQc(payload, {
      redis,
      enqueueBullmqJob: async () => undefined,
    });
    const second = await enqueueVerticalDramaDraftQualityQc(payload, {
      redis,
      enqueueBullmqJob: async () => undefined,
    });
    expect(second).toEqual({ runId: first.runId, deduped: true });
    expect(
      await getVerticalDramaDraftQualityQcStatus(
        first.runId,
        { tenantId: "tenant-b", userId: 7 },
        { redis }
      )
    ).toBeNull();
    expect(
      (
        await getVerticalDramaDraftQualityQcStatusBySession(
          "session-1",
          { tenantId: "tenant-a", userId: 7 },
          { redis }
        )
      )?.runId
    ).toBe(first.runId);
  });

  it("cancels an active run idempotently", async () => {
    const redis = fakeRedis();
    const { runId } = await enqueueVerticalDramaDraftQualityQc(
      {
        tenantId: "tenant-a",
        userId: 7,
        draftSessionId: "session-2",
        draft: { title: "Proof of Us" },
        immutableConstraints: {},
        maxImprovementRounds: 0,
      },
      { redis, enqueueBullmqJob: async () => undefined }
    );
    expect(
      await cancelVerticalDramaDraftQualityQc(
        runId,
        { tenantId: "tenant-a", userId: 7 },
        { redis }
      )
    ).toBe(true);
    expect(
      (
        await getVerticalDramaDraftQualityQcStatus(
          runId,
          { tenantId: "tenant-a", userId: 7 },
          { redis }
        )
      )?.status
    ).toBe("cancelled");
    expect(
      await cancelVerticalDramaDraftQualityQc(
        runId,
        { tenantId: "tenant-a", userId: 7 },
        { redis }
      )
    ).toBe(true);
  });

  it("records queue admission failure instead of leaving the wizard polling forever", async () => {
    const redis = fakeRedis();
    await expect(
      enqueueVerticalDramaDraftQualityQc(
        {
          tenantId: "tenant-a",
          userId: 7,
          draftSessionId: "session-3",
          draft: { title: "Proof of Us" },
          immutableConstraints: {},
          maxImprovementRounds: 0,
        },
        {
          redis,
          enqueueBullmqJob: async () => {
            throw new Error("worker unavailable");
          },
        }
      )
    ).rejects.toThrow("queue is unavailable");

    const pointerRun = await redis.get(
      "vd:draft-qc:active:tenant-a:7:session-3"
    );
    expect(pointerRun).toBeNull();
  });
});

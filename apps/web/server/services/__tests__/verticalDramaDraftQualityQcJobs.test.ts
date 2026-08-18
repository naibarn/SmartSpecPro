import { describe, expect, it } from "vitest";
import {
  cancelVerticalDramaDraftQualityQc,
  enqueueVerticalDramaDraftQualityQc,
  getVerticalDramaDraftQualityQcStatus,
  getVerticalDramaDraftQualityQcStatusBySession,
  reconcileVerticalDramaDraftQualityQc,
  recoverVerticalDramaDraftQualityQcResultFromFailure,
  DRAFT_QC_STALE_AFTER_MS,
} from "../verticalDramaDraftQualityQcJobs";
import {
  computeDraftQualityQcReport,
  DRAFT_QC_CRITERIA,
  fingerprintDraftQualityQcCandidate,
} from "@shared/verticalDramaSeries/draftQualityQc";

function durableReport() {
  return computeDraftQualityQcReport(
    {
      criteria: DRAFT_QC_CRITERIA.map(({ id: criterionId }) => ({
        criterionId,
        rawScore: 4,
        evidence: "Durable evidence",
      })) as never,
      criticalFails: [],
      strengths: ["Strong hook"],
      weaknesses: [],
      recommendations: [],
    },
    "2026-08-13T00:00:00.000Z"
  );
}

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

  it("closes a stale queued run and releases its active pointer", async () => {
    const redis = fakeRedis();
    const createdAt = Date.parse("2026-08-13T00:00:00.000Z");
    const { runId } = await enqueueVerticalDramaDraftQualityQc(
      {
        tenantId: "tenant-a",
        userId: 7,
        draftSessionId: "session-stale",
        draftId: "draft-stale",
        draft: { title: "Stale draft" },
        immutableConstraints: {},
        maxImprovementRounds: 0,
      },
      {
        redis,
        now: () => createdAt,
        enqueueBullmqJob: async () => undefined,
        persistJobStatus: async () => true,
      }
    );
    const result = await reconcileVerticalDramaDraftQualityQc(
      runId,
      { tenantId: "tenant-a", userId: 7 },
      {
        redis,
        now: () => createdAt + DRAFT_QC_STALE_AFTER_MS + 1,
        persistJobStatus: async () => true,
        getLedgerByQcRunId: async () => null,
      }
    );
    expect(result.stale).toBe(true);
    expect(result.record?.status).toBe("failed");
    expect(result.message).toContain("เคลียร์คิว");
    expect(
      await redis.get("vd:draft-qc:active:tenant-a:7:session-stale")
    ).toBeNull();
    expect(
      (
        await getVerticalDramaDraftQualityQcStatus(
          runId,
          { tenantId: "tenant-a", userId: 7 },
          { redis }
        )
      )?.status
    ).toBe("failed");
  });

  it("reconciles a missing Redis record from the durable ledger", async () => {
    const redis = fakeRedis();
    const result = await reconcileVerticalDramaDraftQualityQc(
      "run-missing",
      { tenantId: "tenant-a", userId: 7 },
      {
        redis,
        persistJobStatus: async () => true,
        getLedgerByQcRunId: async () =>
          ({
            id: "draft-1",
            qcRunId: "run-missing",
            jobStatus: "qc_running",
          }) as any,
        getQcSnapshotsByRunId: async () => [],
        getQcSnapshotsByDraftId: async () => [],
      }
    );
    expect(result).toMatchObject({
      stale: true,
      message: expect.stringContaining("ไม่อยู่ในคิวแล้ว"),
      draftId: "draft-1",
    });
  });

  it("recovers the immutable QC scorecard when the live Redis record is gone", async () => {
    const redis = fakeRedis();
    const report = durableReport();
    const result = await reconcileVerticalDramaDraftQualityQc(
      "run-expired-with-snapshot",
      { tenantId: "tenant-a", userId: 7 },
      {
        redis,
        persistJobStatus: async () => true,
        getLedgerByQcRunId: async () =>
          ({
            id: "draft-2",
            qcRunId: "run-expired-with-snapshot",
            jobStatus: "qc_running",
          }) as any,
        getQcSnapshotsByRunId: async () => [],
        getQcSnapshotsByDraftId: async () => [
          {
            draftId: "draft-2",
            runId: "old-qc-run",
            contentJson: { title: "Proof of Us" },
            metadata: {
              report,
              round: 1,
              stopReason: "bounded",
              history: [
                {
                  round: 0,
                  score: report.overallScore,
                  status: report.status,
                  kept: true,
                  reason: "baseline",
                  report,
                },
              ],
            },
          },
        ],
      }
    );

    expect(result.historicalResult?.best.report.overallScore).toBe(8);
    expect(result.historicalResult?.best.draft).toEqual({
      title: "Proof of Us",
    });
    expect(result.historicalResult?.runId).toBe("old-qc-run");
    expect(result.message).toContain("กู้ผล QC รอบก่อน");
  });

  it("recovers a valid prior candidate when the current run fails before scoring", async () => {
    const report = durableReport();
    const draft = { title: "Proof of Us", storyDesign: { totalEpisodeCount: 50 } };
    const fingerprint = fingerprintDraftQualityQcCandidate(draft);
    const recovered = await recoverVerticalDramaDraftQualityQcResultFromFailure(
      {
        runId: "run-failed",
        tenantId: "tenant-a",
        userId: 7,
        draftSessionId: "session-failed",
        requestFingerprint: "request",
        draftId: "draft-failed",
        draft,
        immutableConstraints: {},
        maxImprovementRounds: 5,
        model: "recommended-model",
        status: "failed",
        progress: null,
        result: null,
        error: "incomplete scorecard",
        failure: null,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:01.000Z",
      },
      {
        phase: "evaluate",
        round: 2,
        message: "incomplete scorecard",
        callsDone: 4,
        callsMax: 11,
        roundsAttempted: 2,
        evaluationsCompleted: 2,
        history: [
          {
            round: 0,
            score: report.overallScore,
            status: report.status,
            kept: true,
            reason: "baseline",
            candidateVersion: 1,
            candidateFingerprint: fingerprint,
            report,
          },
        ],
        lastReport: report,
      },
      {
        getDraftVersion: async () => ({
          draftId: "draft-failed",
          version: 1,
          runId: "run-failed",
          stage: "qc-baseline",
          contentJson: draft,
        }) as any,
      }
    );

    expect(recovered?.recoveredFromFailure).toBe(true);
    expect(recovered?.best.draft).toEqual(draft);
    expect(recovered?.best.fingerprint).toBe(fingerprint);
    expect(recovered?.best.report).toEqual(report);
  });
});

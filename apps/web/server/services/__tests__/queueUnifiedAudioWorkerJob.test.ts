import { describe, expect, it, vi } from "vitest";
import { queueUnifiedAudioWorkerJob, type WorkerSchedulerRepository } from "../workerSchedulerService";

function deps() {
  const rows: any[] = [];
  const repo: WorkerSchedulerRepository = {
    findJobByIdempotencyKey: async (_tenant, key) => rows.find((row) => row.idempotencyKey === key) ?? null,
    findWorkerById: async () => null,
    insertJob: async (values) => {
      const row = { id: "job-unified-1", ...values };
      rows.push(row);
      return row;
    },
  };
  return {
    repo,
    rows,
    getFeatureFlags: async () => ({ verticalDramaSeries: true, verticalDramaSeriesVoiceChain: true } as any),
    reserveCredits: vi.fn(async () => ({ reservationId: "res-1", reservedCredits: 5, sourceType: "worker_runtime" as const })),
  };
}

describe("queueUnifiedAudioWorkerJob", () => {
  it("uses one scheduler path for billing, capability admission and idempotency", async () => {
    const testDeps = deps();
    const input = { tenantId: "tenant-1", requestedByUserId: 7, jobType: "tts_utterance_generate" as const, inputJson: { schemaVersion: "unified-audio.v2", jobId: "audio-1" }, idempotencyKey: "idem-1" };
    const first = await queueUnifiedAudioWorkerJob(input, testDeps);
    const second = await queueUnifiedAudioWorkerJob(input, testDeps);
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, job: { id: "job-unified-1" } });
    expect(testDeps.reserveCredits).toHaveBeenCalledTimes(1);
    expect(first.job.capabilityRequirementsJson.capabilityFamilies).toContain("unified-audio-v2");
  });

  it("rejects the same idempotency key when the payload changes", async () => {
    const testDeps = deps();
    await queueUnifiedAudioWorkerJob({ tenantId: "tenant-1", requestedByUserId: 7, jobType: "voice_training_run", inputJson: { schemaVersion: "unified-audio.v2", jobId: "train-1" }, idempotencyKey: "idem-2" }, testDeps);
    await expect(queueUnifiedAudioWorkerJob({ tenantId: "tenant-1", requestedByUserId: 7, jobType: "voice_training_run", inputJson: { schemaVersion: "unified-audio.v2", jobId: "train-2" }, idempotencyKey: "idem-2" }, testDeps)).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("blocks ASR queueing before billing until a signed runtime gate is present", async () => {
    const testDeps = deps();
    await expect(queueUnifiedAudioWorkerJob({
      tenantId: "tenant-1", requestedByUserId: 7, jobType: "audio_transcribe",
      inputJson: { schemaVersion: "audio-transcript.v1", sourceArtifactId: "audio-1" }, idempotencyKey: "idem-asr-1",
    }, testDeps)).rejects.toMatchObject({ code: "runtime_unavailable" });
    expect(testDeps.reserveCredits).not.toHaveBeenCalled();
  });

  it("projects the ASR executionTarget into worker capability admission", async () => {
    const testDeps = deps();
    const result = await queueUnifiedAudioWorkerJob({
      tenantId: "tenant-1", requestedByUserId: 7, jobType: "audio_transcribe",
      inputJson: { schemaVersion: "audio-transcript.v1", sourceArtifactId: "audio-1", runtimeGate: "signed_ready", executionTarget: "worker_local" },
      idempotencyKey: "idem-asr-2",
    }, testDeps);
    expect(result.job.capabilityRequirementsJson.executionTarget).toBe("worker_local");
  });

  it("does not dispatch a cloud ASR request to the desktop Worker", async () => {
    const testDeps = deps();
    await expect(queueUnifiedAudioWorkerJob({
      tenantId: "tenant-1", requestedByUserId: 7, jobType: "audio_transcribe",
      inputJson: { schemaVersion: "audio-transcript.v1", sourceArtifactId: "audio-1", runtimeGate: "signed_ready", profile: "cloud", executionTarget: "server_cloud" },
      idempotencyKey: "idem-asr-cloud",
    }, testDeps)).rejects.toMatchObject({ code: "runtime_unavailable" });
    expect(testDeps.reserveCredits).not.toHaveBeenCalled();
  });
});

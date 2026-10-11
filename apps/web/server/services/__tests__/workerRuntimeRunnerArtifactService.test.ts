import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  storageDelete: vi.fn(),
  storageHeadFile: vi.fn(),
  storagePresignPut: vi.fn(),
  storagePutFromPath: vi.fn(),
  storageStreamFile: vi.fn(),
}));

vi.mock("../../storage", () => storageMocks);

import { finalizeWorkerRuntimeRunnerArtifactUpload } from "../workerRuntimeRunnerArtifactService";

describe("worker runtime runner artifact service", () => {
  it("validates the storage key from the finalize upload payload", async () => {
    await expect(
      finalizeWorkerRuntimeRunnerArtifactUpload({
        upload: {
          fileName: "speaker-aware-runner.exe",
          contentType: "application/octet-stream",
          fileSizeBytes: 442,
          storageKey: "worker-runtime-runners/not-a-staged-upload.exe",
        },
        uploadedByUserId: 1,
      })
    ).rejects.toMatchObject({
      code: "worker_runtime_runner_storage_key_invalid",
      statusCode: 400,
    });
  });

  it("rejects a staged upload when its nested checksum does not match", async () => {
    const bytes = Buffer.from("runner payload");
    const storageKey = "worker-runtime-runner-uploads/staged.exe";
    storageMocks.storageHeadFile.mockResolvedValue({ contentLength: bytes.byteLength });
    storageMocks.storageStreamFile.mockResolvedValue({
      stream: Readable.from([bytes]),
      contentType: "application/octet-stream",
      isPartial: false,
    });
    storageMocks.storageDelete.mockResolvedValue(true);

    await expect(
      finalizeWorkerRuntimeRunnerArtifactUpload({
        upload: {
          fileName: "speaker-aware-runner.exe",
          contentType: "application/octet-stream",
          fileSizeBytes: bytes.byteLength,
          storageKey,
          fileSha256: "0".repeat(64),
        },
        uploadedByUserId: 1,
      })
    ).rejects.toMatchObject({
      code: "worker_runtime_runner_hash_mismatch",
      statusCode: 422,
    });
    expect(storageMocks.storageDelete).toHaveBeenCalledWith(storageKey);
  });
});

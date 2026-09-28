import { describe, expect, it } from "vitest";

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
});

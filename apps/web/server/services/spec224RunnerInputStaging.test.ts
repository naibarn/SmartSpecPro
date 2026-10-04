import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  createSpec224RunnerInputStagingService,
  type Spec224RunnerInputSource,
  type Spec224RunnerInputStagingStore,
  type Spec224StagedRunnerInput,
} from "./spec224RunnerInputStaging";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function memoryStore(): Spec224RunnerInputStagingStore {
  const inputs = new Map<string, Spec224StagedRunnerInput>();
  const sources = new Map<string, Spec224RunnerInputSource>();
  const sourceJobs = new Map<string, string>();
  let consumed = false;
  return {
    async findByInputRef(inputRef) {
      return inputs.get(inputRef) ?? null;
    },
    async findByCommandId(commandId) {
      return [...inputs.values()].find(input => input.commandId === commandId) ?? null;
    },
    async insert(input) {
      inputs.set(input.inputRef, input);
      return input;
    },
    async currentLease() {
      return true;
    },
    async markMaterialized(inputRef, at) {
      const input = inputs.get(inputRef);
      if (input) input.materializedAt = at;
    },
    async rotateFetchGrant(inputRef, fetchGrantHash) {
      const input = inputs.get(inputRef);
      if (input) input.fetchGrantHash = fetchGrantHash;
      consumed = false;
    },
    async consumeFetchGrant({ inputRef, fetchGrantHash }) {
      const input = inputs.get(inputRef);
      if (!input || consumed || input.fetchGrantHash !== fetchGrantHash) return false;
      consumed = true;
      return true;
    },
    async isCurrentRunnerSession() {
      return true;
    },
    async findSourceByRef(inputSourceRef) {
      return sources.get(inputSourceRef) ?? null;
    },
    async findSourceByStart({ tenantId, startRef }) {
      return [...sources.values()].find(
        source => source.tenantId === tenantId && source.startRef === startRef
      ) ?? null;
    },
    async insertSource(source) {
      sources.set(source.inputSourceRef, source);
      return source;
    },
    async bindSourceToWorkerJob(input) {
      const source = sources.get(input.inputSourceRef);
      if (!source || source.tenantId !== input.tenantId || source.startRef !== input.startRef) return false;
      const current = sourceJobs.get(input.inputSourceRef);
      if (current && current !== input.workerJobId) return false;
      sourceJobs.set(input.inputSourceRef, input.workerJobId);
      return true;
    },
  };
}

describe("Spec224 Runner input staging", () => {
  it("pre-stages immutable bytes, binds them to a lease, then rejects fetch-grant replay", async () => {
    const service = createSpec224RunnerInputStagingService(memoryStore(), {
      inputSourceRef: () => "spec224-source:one",
      inputRef: () => "spec224-input:one",
      now: () => new Date("2026-10-04T00:00:00.000Z"),
    });
    const source = await service.preStageRunnerInput({
      tenantId: "tenant-1",
      startRef: "development-run:one",
      files: [
        {
          path: "prompt.md",
          contentBase64: Buffer.from("Implement the selected package.").toString("base64"),
        },
        {
          path: "specs/feature.md",
          contentBase64: Buffer.from("# Feature").toString("base64"),
        },
      ],
    });
    const bound = await service.bindPreStagedRunnerInput({
      inputSourceRef: source.inputSourceRef,
      tenantId: "tenant-1",
      commandId: "command-1",
      workerJobId: "job-1",
      attemptId: "attempt-1",
      attempt: 1,
      leaseId: "lease:job-1:attempt-1",
      fencingToken: 1,
      runnerId: "runner-1",
      runnerSessionId: "session-1",
      authorizationGrantRef: "grant-1",
      workspaceRef: "workspace-1",
    });

    const request = {
      inputRef: bound.inputRef,
      tenantId: "tenant-1",
      runnerId: "runner-1",
      runnerSessionId: "session-1",
      authorizationGrantRef: "grant-1",
      inputFetchGrant: bound.inputFetchGrant,
    };
    const manifestBinding = {
      inputRef: bound.inputRef,
      inputDigest: source.inputDigest,
      totalBytes: source.totalBytes,
      commandId: "command-1",
      workerJobId: "job-1",
      attemptId: "attempt-1",
      attempt: 1,
      leaseId: "lease:job-1:attempt-1",
      fencingToken: 1,
      tenantId: "tenant-1",
      runnerId: "runner-1",
      runnerSessionId: "session-1",
      authorizationGrantRef: "grant-1",
      workspaceRef: "workspace-1",
    };
    await expect(service.isStagedInputBoundToManifest(manifestBinding)).resolves.toBe(true);
    await expect(service.isStagedInputBoundToManifest({ ...manifestBinding, inputDigest: "f".repeat(64) })).resolves.toBe(false);
    const fetched = await service.getRunnerInputForMaterialization(request);
    expect(fetched.inputDigest).toBe(source.inputDigest);
    await expect(service.getRunnerInputForMaterialization(request)).rejects.toMatchObject({
      code: "SPEC224_RUNNER_INPUT_FETCH_GRANT_REPLAYED",
    });

    const regranted = await service.rotateInputFetchGrant({
      inputRef: bound.inputRef,
      tenantId: "tenant-1",
      runnerId: "runner-1",
      runnerSessionId: "session-1",
    });
    expect(hash(regranted.inputFetchGrant)).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      service.getRunnerInputForMaterialization({ ...request, inputFetchGrant: regranted.inputFetchGrant })
    ).resolves.toMatchObject({ inputRef: bound.inputRef });
  });

  it("rejects a conflicting source for the same durable Start", async () => {
    const service = createSpec224RunnerInputStagingService(memoryStore(), {
      inputSourceRef: () => "spec224-source:one",
    });
    const first = {
      tenantId: "tenant-1",
      startRef: "development-run:one",
      files: [{ path: "prompt.md", contentBase64: Buffer.from("first").toString("base64") }],
    };
    await service.preStageRunnerInput(first);
    await expect(
      service.preStageRunnerInput({
        ...first,
        files: [{ path: "prompt.md", contentBase64: Buffer.from("second").toString("base64") }],
      })
    ).rejects.toMatchObject({ code: "SPEC224_RUNNER_INPUT_START_CONFLICT" });
  });

  it("binds the staged source to the canonical worker job idempotently", async () => {
    const service = createSpec224RunnerInputStagingService(memoryStore(), {
      inputSourceRef: () => "spec224-source:bind",
    });
    const source = await service.preStageRunnerInput({
      tenantId: "tenant-1",
      startRef: "development-run:bind",
      files: [{ path: "prompt.md", contentBase64: Buffer.from("implement").toString("base64") }],
    });
    const binding = {
      tenantId: "tenant-1",
      startRef: "development-run:bind",
      inputSourceRef: source.inputSourceRef,
      workerJobId: "canonical-job-1",
    };

    await expect(service.bindSourceToWorkerJob(binding)).resolves.toBeUndefined();
    await expect(service.bindSourceToWorkerJob(binding)).resolves.toBeUndefined();
    await expect(service.bindSourceToWorkerJob({ ...binding, workerJobId: "other-job" }))
      .rejects.toMatchObject({ code: "SPEC224_RUNNER_INPUT_SOURCE_JOB_CONFLICT" });
  });
});

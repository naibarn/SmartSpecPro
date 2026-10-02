import { describe, expect, it, vi } from "vitest";

import { POSTGRES_NODE_JOB_TYPES } from "../../jobs/feature186JobTypes";
import {
  createIntelligenceResearchJobExecutor,
  defaultJobExecutorRegistry,
} from "../jobExecutorRegistry";
import type { JobExecutor } from "../jobExecutor";

const lease = { jobId: "job-research-1", attemptId: "attempt-research-1", leaseToken: "lease", fencingVersion: 1, expiresAt: "2026-10-02T00:01:00.000Z" };
const reporter = {
  assertActive: vi.fn(async () => undefined),
  heartbeat: vi.fn(async () => undefined),
  progress: vi.fn(async () => undefined),
};

function executorInput(input: unknown): Parameters<JobExecutor>[0] {
  return {
    context: { tenantId: "tenant-1", input } as Parameters<JobExecutor>[0]["context"],
    lease,
    reporter: reporter as Parameters<JobExecutor>[0]["reporter"],
    controlPlane: {} as Parameters<JobExecutor>[0]["controlPlane"],
  };
}

const envelope = { contractVersion: "spec266-research-v1", researchRequestId: "research-request-1" };

describe("intelligence.research.execute canonical worker registration", () => {
  it("registers on the Postgres worker with the versioned long-running contract", () => {
    expect(POSTGRES_NODE_JOB_TYPES.has("intelligence.research.execute")).toBe(true);
    expect(defaultJobExecutorRegistry.resolve("intelligence.research.execute", "spec266-research-v1")).toMatchObject({
      executionClass: "long",
      jobType: "intelligence.research.execute",
    });
  });

  it("fails closed when the server-owned research runtime is not composed", async () => {
    const executor = defaultJobExecutorRegistry.resolve("intelligence.research.execute", "spec266-research-v1")!.executor;
    await expect(executor(executorInput(envelope))).rejects.toMatchObject({
      diagnosticCode: "INTELLIGENCE_RESEARCH_RUNTIME_NOT_CONFIGURED",
      class: "retryable",
    });
  });

  it("passes only the tenant and admitted request reference to the injected runtime", async () => {
    const execute = vi.fn(async () => ({ researchRunId: "research-run-1", status: "completed" as const, candidateCount: 2 }));
    const executor = createIntelligenceResearchJobExecutor({ execute });

    await expect(executor(executorInput(envelope))).resolves.toEqual({
      output: { researchRunId: "research-run-1", status: "completed", candidateCount: 2 },
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      researchRequestId: "research-request-1",
      canonicalJobId: "job-research-1",
      lease,
      reporter,
      signal: expect.any(AbortSignal),
    }));
  });

  it("rejects payloads carrying caller-selected URLs, prompts, providers, or credentials", async () => {
    const execute = vi.fn();
    const executor = createIntelligenceResearchJobExecutor({ execute });
    await expect(executor(executorInput({ ...envelope, url: "https://attacker.invalid", providerId: "provider-x" }))).rejects.toMatchObject({
      diagnosticCode: "INTELLIGENCE_RESEARCH_JOB_INVALID",
      class: "permanent",
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects invalid runtime receipts rather than completing a job with untrusted output", async () => {
    const executor = createIntelligenceResearchJobExecutor({
      execute: async () => ({ researchRunId: "not valid spaces", status: "completed", candidateCount: -1 } as never),
    });
    await expect(executor(executorInput(envelope))).rejects.toMatchObject({
      diagnosticCode: "INTELLIGENCE_RESEARCH_RUNTIME_RESULT_INVALID",
      class: "permanent",
    });
  });

  it("heartbeats the canonical lease while the research runtime is still executing", async () => {
    vi.useFakeTimers();
    try {
      let complete!: (value: { researchRunId: string; status: "completed"; candidateCount: number }) => void;
      const execute = vi.fn(() => new Promise<{ researchRunId: string; status: "completed"; candidateCount: number }>(resolve => {
        complete = resolve;
      }));
      const executor = createIntelligenceResearchJobExecutor({ execute });
      const running = executor(executorInput(envelope));
      await vi.advanceTimersByTimeAsync(15_000);
      expect(reporter.heartbeat).toHaveBeenCalledWith(lease);
      complete({ researchRunId: "research-run-2", status: "completed", candidateCount: 0 });
      await expect(running).resolves.toEqual({
        output: { researchRunId: "research-run-2", status: "completed", candidateCount: 0 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts runtime work and requires operator review when its lease heartbeat is lost", async () => {
    vi.useFakeTimers();
    const heartbeat = reporter.heartbeat as ReturnType<typeof vi.fn>;
    heartbeat.mockRejectedValueOnce(new Error("lease lost"));
    try {
      const execute = vi.fn(({ signal }: { signal: AbortSignal }) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      }));
      const executor = createIntelligenceResearchJobExecutor({ execute });
      const running = executor(executorInput(envelope));
      const rejection = expect(running).rejects.toMatchObject({
        diagnosticCode: "INTELLIGENCE_RESEARCH_LEASE_HEARTBEAT_FAILED",
        class: "unknown",
      });
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(execute.mock.calls[0]?.[0].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
      heartbeat.mockResolvedValue(undefined);
    }
  });

  it("does not leave the executor waiting when a runtime ignores abort, and avoids unsafe automatic retry", async () => {
    vi.useFakeTimers();
    const heartbeat = reporter.heartbeat as ReturnType<typeof vi.fn>;
    heartbeat.mockRejectedValueOnce(new Error("lease lost"));
    try {
      const execute = vi.fn(() => new Promise<never>(() => undefined));
      const executor = createIntelligenceResearchJobExecutor({ execute });
      const running = executor(executorInput(envelope));
      const rejection = expect(running).rejects.toMatchObject({
        diagnosticCode: "INTELLIGENCE_RESEARCH_LEASE_HEARTBEAT_FAILED",
        class: "unknown",
      });
      await vi.advanceTimersByTimeAsync(15_000);
      await rejection;
      expect(execute.mock.calls[0]?.[0].signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
      heartbeat.mockResolvedValue(undefined);
    }
  });
});

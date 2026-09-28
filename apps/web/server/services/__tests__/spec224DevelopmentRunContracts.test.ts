import { describe, expect, it } from "vitest";

import {
  buildDevelopmentHarnessJob,
  buildDevelopmentRun,
  decideNextSafeAction,
  DevelopmentRunContractError,
  enqueueDevelopmentHarnessJob,
  recordDevelopmentEvent,
  transitionDevelopmentRun,
  classifyDevelopmentFailure,
} from "../spec224DevelopmentRunContracts";

const baseRun = {
  runId: "run-224-001",
  tenantId: "tenant-acme",
  actorId: 42,
  goal: "Implement a governed Skill",
  repositoryRef: "repo:smartspecpro",
  baseRevision: "git:base123",
  contextPackHash: "a".repeat(64),
  workspaceId: "workspace:run-224-001",
};

describe("Spec 224 DevelopmentRun kernel", () => {
  it("starts in discovery and keeps the canonical worker job as its execution reference", () => {
    const run = buildDevelopmentRun(baseRun);
    expect(run).toMatchObject({
      contractVersion: "spec-224-v1",
      state: "DISCOVERY",
      phaseAttempt: 0,
      workerJobId: null,
    });
    expect(decideNextSafeAction(run)).toEqual({
      command: "RUN_PHASE",
      phase: "DISCOVERY",
    });
  });

  it("enforces resumable transitions and blocks completion without final verification", () => {
    const run = buildDevelopmentRun(baseRun);
    expect(() => transitionDevelopmentRun(run, "COMPLETED")).toThrow(
      "RUN_TRANSITION_INVALID"
    );
    const verified = transitionDevelopmentRun(
      { ...run, state: "FINAL_VERIFY", evidenceRefs: ["evidence:final-pass"] },
      "COMPLETED"
    );
    expect(verified.state).toBe("COMPLETED");
    expect(() => transitionDevelopmentRun(verified, "DISCOVERY")).toThrow(
      "RUN_TERMINAL"
    );
  });

  it("deduplicates durable events and rejects cross-run or secret payloads", () => {
    const run = buildDevelopmentRun(baseRun);
    const first = recordDevelopmentEvent(run, {
      eventId: "event-1",
      idempotencyKey: "phase:discovery:0",
      type: "PHASE_STARTED",
      payload: { phase: "DISCOVERY" },
    });
    expect(first.accepted).toBe(true);
    expect(
      recordDevelopmentEvent(first.run, {
        eventId: "event-2",
        idempotencyKey: "phase:discovery:0",
        type: "PHASE_STARTED",
        payload: { phase: "DISCOVERY" },
      }).accepted
    ).toBe(false);
    expect(() =>
      recordDevelopmentEvent(run, {
        eventId: "event-secret",
        idempotencyKey: "phase:secret",
        type: "PHASE_STARTED",
        payload: { apiKey: "never-persist" },
      })
    ).toThrow("RAW_SECRET_FORBIDDEN");
  });

  it("bounds recovery and turns exhausted or policy failures into explicit pauses", () => {
    expect(
      classifyDevelopmentFailure({
        phase: "TEST",
        errorClass: "retryable",
        attempt: 1,
        maxAttempts: 2,
      })
    ).toEqual({
      outcome: "RETRY_PHASE",
      nextState: "RECOVERY",
    });
    expect(
      classifyDevelopmentFailure({
        phase: "TEST",
        errorClass: "retryable",
        attempt: 2,
        maxAttempts: 2,
      })
    ).toEqual({
      outcome: "WAITING_HUMAN_DECISION",
      nextState: "WAITING_HUMAN_DECISION",
    });
    expect(
      classifyDevelopmentFailure({
        phase: "IMPLEMENT",
        errorClass: "policy",
        attempt: 1,
        maxAttempts: 3,
      })
    ).toEqual({
      outcome: "PAUSED_POLICY",
      nextState: "PAUSED_POLICY",
    });
  });

  it("reuses the existing external_agent_task contract instead of inventing a second queue", () => {
    const run = buildDevelopmentRun(baseRun);
    const job = buildDevelopmentHarnessJob({
      run,
      provider: "codex",
      runtime: "local_runner",
      planId: "plan-224-001",
      planRevision: 1,
      skillIds: ["skill:spec224-core"],
      requestedCapabilities: ["workspace.edit", "workspace.test"],
    });
    expect(job.definition.jobType).toBe("external_agent_task");
    expect(job.definition.contractVersion).toBe("feature-186-v1");
    expect(job.manifest.workspaceId).toBe("workspace:run-224-001");
    expect(job.definition.input).not.toHaveProperty("apiKey");
  });

  it("admits the harness only through the canonical worker control-plane gateway", async () => {
    const run = buildDevelopmentRun(baseRun);
    const definitions: unknown[] = [];
    const controlPlane = {
      create: async (definition: unknown) => {
        definitions.push(definition);
        return { jobId: "worker-job-224-001", created: true };
      },
    } as never;
    const executorRegistry = { has: () => true } as never;
    const result = await enqueueDevelopmentHarnessJob({
      run,
      provider: "claude_code",
      runtime: "local_runner",
      planId: "plan-224-001",
      planRevision: 1,
      skillIds: [],
      requestedCapabilities: ["workspace.edit"],
      authorizationScope: "spec224.development.run",
      controlPlane,
      executorRegistry,
    });
    expect(result.jobRef).toEqual({
      jobId: "worker-job-224-001",
      created: true,
    });
    expect(result.run.workerJobId).toBe("worker-job-224-001");
    expect(definitions).toHaveLength(1);
    expect((definitions[0] as { jobType: string }).jobType).toBe(
      "external_agent_task"
    );
  });

  it("rejects raw secrets at the run boundary", () => {
    expect(() =>
      buildDevelopmentRun({ ...baseRun, metadata: { token: "secret" } })
    ).toThrow(DevelopmentRunContractError);
  });
});

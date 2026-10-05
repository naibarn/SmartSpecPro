import { describe, expect, it } from "vitest";
import {
  canTransitionExecutionSession,
  validateExecutionSessionEventPayload,
  validateExecutionSessionProjection,
  validateRunnerSessionInventory,
  type ExecutionSessionProjectionInput,
} from "../runnerExecutionSessionContracts";

const valid: ExecutionSessionProjectionInput = {
  sessionId: "ses-1",
  tenantId: "tenant-1",
  workerJobId: "job-1",
  workerJobAttempt: 1,
  leaseFencingVersion: 2,
  runnerId: "runner-1",
  generation: 1,
  authorityEpoch: 1,
  placementEpoch: 1,
  jobControlRevision: 1,
  state: "provisioning",
  desiredState: "running",
  continuityClass: "reattachable",
  enforcementLevel: "PROCESS_PAUSE",
  driverId: "local.pty.v1",
};

describe("Spec 278 execution session contracts", () => {
  it("accepts only bounded, uniquely keyed process inventory records", () => {
    const record = {
      sessionId: "session-1",
      workerJobId: "123e4567-e89b-42d3-a456-426614174000",
      generation: 1,
      workerJobAttempt: 2,
      leaseFencingVersion: 3,
      authorityEpoch: 4,
      placementEpoch: 5,
      jobControlRevision: 6,
      lastState: "running",
      commandSequence: 7,
      eventSequence: 8,
      processIdentity: {
        pid: 42,
        startedAt: "123456",
        hostBootId: "123e4567-e89b-42d3-a456-426614174000",
        identityDigest: `sha256:${"a".repeat(64)}`,
      },
      hostIdentity: {
        pid: 41,
        startedAt: "123450",
        hostBootId: "123e4567-e89b-42d3-a456-426614174000",
        identityDigest: `sha256:${"b".repeat(64)}`,
      },
    };
    expect(
      validateRunnerSessionInventory({ records: [record] })?.records
    ).toHaveLength(1);
    expect(
      validateRunnerSessionInventory({ records: [record, record] })
    ).toBeNull();
    const withoutHostIdentity: Record<string, unknown> = { ...record };
    delete withoutHostIdentity.hostIdentity;
    expect(
      validateRunnerSessionInventory({ records: [withoutHostIdentity] })
    ).toBeNull();
    expect(
      validateRunnerSessionInventory({
        records: [{ ...record, unexpected: true }],
      })
    ).toBeNull();
    expect(
      validateRunnerSessionInventory({
        records: Array.from({ length: 65 }, () => record),
      })
    ).toBeNull();
  });

  it("validates projection identity and revision fields", () => {
    expect(validateExecutionSessionProjection(valid)).toBeNull();
    expect(
      validateExecutionSessionProjection({ ...valid, generation: 0 })
    ).toBe("RUNNER_SESSION_REVISION_INVALID");
  });

  it("rejects impossible transitions and terminal resurrection", () => {
    expect(canTransitionExecutionSession("provisioning", "starting")).toBe(
      true
    );
    expect(canTransitionExecutionSession("provisioning", "running")).toBe(
      false
    );
    expect(canTransitionExecutionSession("completed", "recovering")).toBe(
      false
    );
  });

  it("rejects false isolation claims and sensitive event payloads", () => {
    expect(
      validateExecutionSessionProjection({
        ...valid,
        continuityClass: "ephemeral",
        enforcementLevel: "SANDBOX_ENFORCED",
      })
    ).toBe("RUNNER_SESSION_ENFORCEMENT_CLAIM_INVALID");
    expect(
      validateExecutionSessionEventPayload({ safe: { apiKey: "hidden" } })
    ).toBe("RUNNER_SESSION_EVENT_SENSITIVE_FIELD");
    expect(
      validateExecutionSessionEventPayload({ state: "running" })
    ).toBeNull();
    expect(
      validateExecutionSessionEventPayload({
        detail: "path /home/alice/workspace",
      })
    ).toBe("RUNNER_SESSION_EVENT_SENSITIVE_VALUE");
    expect(
      validateExecutionSessionEventPayload({
        detail: "Bearer eyJ123456789012.a123456789012.b123456789",
      })
    ).toBe("RUNNER_SESSION_EVENT_SENSITIVE_VALUE");
    expect(
      validateExecutionSessionProjection({
        ...valid,
        desiredState: "invalid" as never,
      })
    ).toBe("RUNNER_SESSION_IDENTITY_INVALID");
  });
});

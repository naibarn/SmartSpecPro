import { describe, expect, it } from "vitest";
import {
  computeSpec224ProtectedStartAuthorityDigest,
  isMatchingSpec224ProtectedStartEvent,
} from "../spec224RuntimeAdmission";

describe("Spec 224 protected execution-start identity", () => {
  const authority = {
    tenantId: "tenant-a",
    tenantOwnerId: 41,
    actorId: 41,
    runId: "run-a",
    workerJobId: "job-a",
    attemptId: "attempt-a",
    grantId: "grant-a",
  };

  it("binds the authority digest to the authenticated actor", () => {
    const actorDigest = computeSpec224ProtectedStartAuthorityDigest(authority);
    const otherActorDigest = computeSpec224ProtectedStartAuthorityDigest({
      ...authority,
      actorId: 42,
    });

    expect(otherActorDigest).not.toBe(actorDigest);
  });

  it("binds the authority digest to the tenant owner", () => {
    const ownerDigest = computeSpec224ProtectedStartAuthorityDigest(authority);
    const otherOwnerDigest = computeSpec224ProtectedStartAuthorityDigest({
      ...authority,
      tenantOwnerId: 42,
    });

    expect(otherOwnerDigest).not.toBe(ownerDigest);
  });

  it("rejects a persisted start whose authenticated principal differs", () => {
    const identity = {
      authority,
      authorityDigest: computeSpec224ProtectedStartAuthorityDigest(authority),
      operationId: "operation-a",
      eventIdempotencyKey: "start-a",
    };
    const event = {
      eventType: "SPEC224_PROTECTED_EXECUTION_STARTED",
      attemptId: "attempt-a",
      eventIdempotencyKey: "start-a",
      eventSequence: 17,
      payloadJson: {
        schemaVersion: "spec224.protected-execution-start.v2",
        ...authority,
        operationId: "operation-a",
        authorityDigest: identity.authorityDigest,
        authorizedCommandId: "b1817e44-46a5-4623-97c9-9f01713aad0f",
      },
    };

    expect(
      isMatchingSpec224ProtectedStartEvent(event, identity, "attempt-a")
    ).toBe(true);
    expect(
      isMatchingSpec224ProtectedStartEvent(
        {
          ...event,
          payloadJson: { ...event.payloadJson, actorId: 99 },
        },
        identity,
        "attempt-a"
      )
    ).toBe(false);
  });

  it("rejects a key collision from another attempt or event type", () => {
    const identity = {
      authority,
      authorityDigest: computeSpec224ProtectedStartAuthorityDigest(authority),
      operationId: "operation-a",
      eventIdempotencyKey: "start-a",
    };
    const event = {
      eventType: "SPEC224_PROTECTED_EXECUTION_STARTED",
      attemptId: "attempt-a",
      eventIdempotencyKey: "start-a",
      eventSequence: 17,
      payloadJson: {
        schemaVersion: "spec224.protected-execution-start.v2",
        ...authority,
        operationId: "operation-a",
        authorityDigest: identity.authorityDigest,
        authorizedCommandId: "b1817e44-46a5-4623-97c9-9f01713aad0f",
      },
    };

    expect(
      isMatchingSpec224ProtectedStartEvent(
        { ...event, attemptId: "attempt-b" },
        identity,
        "attempt-a"
      )
    ).toBe(false);
    expect(
      isMatchingSpec224ProtectedStartEvent(
        { ...event, eventType: "JOB_COMPLETED" },
        identity,
        "attempt-a"
      )
    ).toBe(false);
  });
});

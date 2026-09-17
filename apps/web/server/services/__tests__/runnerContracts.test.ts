import { describe, expect, it } from "vitest";

import {
  acceptRunnerEvent,
  assertOfferClaim,
  buildWorkOffer,
  isWorkspacePathAllowed,
  validateRunnerCapabilitySnapshot,
  validateRunnerIdentity,
  type RunnerCapabilitySnapshot,
  type RunnerIdentity,
} from "../runnerContracts";

const runner: RunnerIdentity = {
  runnerId: "runner-1",
  tenantId: "tenant-1",
  deviceId: "device-1",
  runtime: "desktop",
  trustState: "trusted",
  registeredAt: "2026-09-17T00:00:00Z",
};
const snapshot: RunnerCapabilitySnapshot = {
  runnerId: "runner-1",
  revision: "r1",
  observedAt: "2026-09-17T00:00:00Z",
  expiresAt: "2026-09-17T00:10:00Z",
  capabilities: ["code.edit"],
  workspaceIds: ["workspace-1"],
  resourceClass: "medium",
};

describe("Feature 197 Runner contracts", () => {
  it("offers only trusted, fresh, same-tenant capability snapshots", () => {
    const offer = buildWorkOffer({
      jobId: "job-1",
      tenantId: "tenant-1",
      requiredCapabilities: ["code.edit"],
      runner,
      snapshot,
      now: new Date("2026-09-17T00:01:00Z"),
    });
    expect(offer).toMatchObject({
      jobId: "job-1",
      runnerId: "runner-1",
      capabilitySnapshotRevision: "r1",
    });
    expect(
      buildWorkOffer({
        jobId: "job-1",
        tenantId: "tenant-2",
        requiredCapabilities: ["code.edit"],
        runner,
        snapshot,
      })
    ).toBeNull();
  });

  it("separates offer claims from the canonical lease fence", () => {
    const offer = buildWorkOffer({
      jobId: "job-2",
      tenantId: "tenant-1",
      requiredCapabilities: ["code.edit"],
      runner,
      snapshot,
      now: new Date("2026-09-17T00:01:00Z"),
    })!;
    expect(() =>
      assertOfferClaim({
        offer,
        tenantId: "tenant-1",
        runnerId: "runner-1",
        snapshotRevision: "stale",
        lease: {
          jobId: "job-2",
          attemptId: "a1",
          leaseToken: "token",
          fencingVersion: 1,
          expiresAt: offer.expiresAt,
        },
      })
    ).toThrowError(expect.objectContaining({ code: "RUNNER_OFFER_STALE" }));
  });

  it("deduplicates control events and confines workspace paths", () => {
    expect(
      acceptRunnerEvent(3, {
        eventId: "e",
        commandId: "c",
        jobId: "j",
        sequence: 3,
        observed: "applied",
      })
    ).toBe("duplicate");
    expect(
      acceptRunnerEvent(3, {
        eventId: "e",
        commandId: "c",
        jobId: "j",
        sequence: 5,
        observed: "applied",
      })
    ).toBe("out_of_order");
    expect(
      acceptRunnerEvent(3, {
        eventId: "e",
        commandId: "c",
        jobId: "j",
        sequence: 4,
        observed: "applied",
      })
    ).toBe("accepted");
    expect(
      isWorkspacePathAllowed(
        "/workspace/project",
        "/workspace/project/src/index.ts"
      )
    ).toBe(true);
    expect(
      isWorkspacePathAllowed(
        "/workspace/project",
        "/workspace/project/../secrets.env"
      )
    ).toBe(false);
  });

  it("rejects malformed runtime identity, snapshots, and paths safely", () => {
    expect(() =>
      validateRunnerIdentity({ runnerId: 123 } as unknown as RunnerIdentity)
    ).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(() =>
      validateRunnerCapabilitySnapshot({
        ...snapshot,
        capabilities: ["code.edit", "code.edit"],
      })
    ).toThrowError(
      expect.objectContaining({ code: "RUNNER_CONTRACT_INVALID" })
    );
    expect(
      buildWorkOffer({
        jobId: "job-1",
        tenantId: "tenant-1",
        requiredCapabilities: 123 as unknown as string[],
        runner,
        snapshot,
      })
    ).toBeNull();
    expect(
      isWorkspacePathAllowed("/workspace/project", 123 as unknown as string)
    ).toBe(false);
  });
});

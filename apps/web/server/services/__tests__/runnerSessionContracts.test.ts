import { describe, expect, it } from "vitest";

import {
  RunnerSessionController,
  RunnerSessionError,
} from "../runnerSessionContracts";

describe("authenticated Runner session contract", () => {
  it("keeps connected, paired, authorized and capability-ready distinct", () => {
    const controller = new RunnerSessionController({ now: () => new Date("2026-09-20T12:00:00.000Z") });
    const challenge = controller.start({
      runnerId: "runner-1",
      tenantId: "tenant-1",
      deviceId: "device-1",
      ownerUserId: 7,
      ttlMs: 60_000,
    });

    expect(challenge.state).toBe("connected");
    expect(() => controller.assertCapabilityReady(challenge.runnerSessionId)).toThrowError(
      new RunnerSessionError("CAPABILITY_NOT_READY"),
    );

    const paired = controller.approve({
      runnerSessionId: challenge.runnerSessionId,
      nonce: challenge.nonce,
      ownerUserId: 7,
    });
    expect(paired.state).toBe("paired");
    expect(() => controller.assertCapabilityReady(challenge.runnerSessionId)).toThrowError(
      new RunnerSessionError("CAPABILITY_NOT_READY"),
    );

    const authorized = controller.authorize({
      runnerSessionId: challenge.runnerSessionId,
      deviceProofVerified: true,
    });
    expect(authorized.state).toBe("authorized");
    expect(controller.authorize({
      runnerSessionId: challenge.runnerSessionId,
      deviceProofVerified: true,
    }).state).toBe("authorized");

    const ready = controller.publishCapability({
      runnerSessionId: challenge.runnerSessionId,
      probeState: "ready",
      capabilitySnapshotId: "snapshot-1",
      snapshotRevision: "1",
    });
    expect(ready.state).toBe("capability_ready");
    expect(ready.capabilitySnapshotId).toBe("snapshot-1");
  });

  it("rejects wrong owner, nonce, expired challenge and unverified credentials", () => {
    const controller = new RunnerSessionController({ now: () => new Date("2026-09-20T12:00:00.000Z") });
    const challenge = controller.start({
      runnerId: "runner-2",
      tenantId: "tenant-2",
      deviceId: "device-2",
      ownerUserId: 8,
      ttlMs: 1,
    });
    expect(() => controller.approve({ runnerSessionId: challenge.runnerSessionId, nonce: "wrong", ownerUserId: 8 })).toThrowError(
      new RunnerSessionError("CHALLENGE_INVALID"),
    );
    expect(() => controller.approve({ runnerSessionId: challenge.runnerSessionId, nonce: challenge.nonce, ownerUserId: 9 })).toThrowError(
      new RunnerSessionError("OWNER_MISMATCH"),
    );
    controller.approve({ runnerSessionId: challenge.runnerSessionId, nonce: challenge.nonce, ownerUserId: 8 });
    expect(() => controller.authorize({ runnerSessionId: challenge.runnerSessionId, deviceProofVerified: false })).toThrowError(
      new RunnerSessionError("DEVICE_PROOF_REQUIRED"),
    );
  });

  it("fences old sessions after re-pair and records revocation/audit state", () => {
    const controller = new RunnerSessionController({ now: () => new Date("2026-09-20T12:00:00.000Z") });
    const first = controller.start({ runnerId: "runner-3", tenantId: "tenant-3", deviceId: "device-3", ownerUserId: 9, ttlMs: 60_000 });
    controller.approve({ runnerSessionId: first.runnerSessionId, nonce: first.nonce, ownerUserId: 9 });
    controller.authorize({ runnerSessionId: first.runnerSessionId, deviceProofVerified: true });
    const second = controller.repair({ runnerId: "runner-3", tenantId: "tenant-3", deviceId: "device-3", ownerUserId: 9, ttlMs: 60_000 });

    expect(second.runnerSessionId).not.toBe(first.runnerSessionId);
    expect(() => controller.assertAuthorized(first.runnerSessionId)).toThrowError(new RunnerSessionError("SESSION_REVOKED"));
    expect(controller.auditEvents().map(event => event.type)).toEqual([
      "runner_pairing_started",
      "runner_pairing_approved",
      "runner_authorized",
      "runner_session_revoked",
      "runner_pairing_started",
    ]);
  });

  it("can restore an authorized session only from a persisted active-session fence", () => {
    const controller = new RunnerSessionController({ now: () => new Date("2026-09-20T12:00:00.000Z") });
    expect(controller.restoreAuthorized({
      runnerSessionId: "persisted-session",
      runnerId: "runner-4",
      tenantId: "tenant-4",
      deviceId: "device-4",
      ownerUserId: 10,
    })).toMatchObject({ state: "authorized", runnerSessionId: "persisted-session" });
    expect(controller.assertAuthorized("persisted-session")).toMatchObject({ state: "authorized" });
  });
});

import { describe, expect, it } from "vitest";
import {
  LocalBrowserRunnerService,
  LocalBrowserRunnerError,
} from "../localBrowserRunnerService";

describe("localBrowserRunnerService", () => {
  it("binds a session to one authenticated owner/device and fences commands", () => {
    const service = new LocalBrowserRunnerService();
    const binding = service.bind({
      tenantId: "tenant-1",
      ownerId: "user-1",
      deviceId: "device-1",
      sessionId: "session-1",
      profile: "browser",
      runnerId: "runner-1",
      runnerSessionId: "runner-session-1",
      capabilitySnapshotId: "snapshot-1",
      snapshotRevision: "rev-1",
      snapshotExpiresAt: "2026-09-21T00:00:00.000Z",
    });
    expect(
      service.command(binding, {
        tenantId: "tenant-1",
        ownerId: "user-1",
        deviceId: "device-1",
        sequence: 1,
        action: "navigate",
        runnerId: "runner-1",
        runnerSessionId: "runner-session-1",
        capabilitySnapshotId: "snapshot-1",
        snapshotRevision: "rev-1",
        observationRevision: 1,
        now: "2026-09-20T12:00:00.000Z",
      })
    ).toMatchObject({ status: "accepted" });
    expect(() =>
      service.command(binding, {
        tenantId: "tenant-1",
        ownerId: "user-2",
        deviceId: "device-1",
        sequence: 2,
        action: "navigate",
        runnerId: "runner-1",
        runnerSessionId: "runner-session-1",
        capabilitySnapshotId: "snapshot-1",
        snapshotRevision: "rev-1",
        observationRevision: 2,
        now: "2026-09-20T12:00:00.000Z",
      })
    ).toThrowError(new LocalBrowserRunnerError("OWNER_MISMATCH"));
    expect(() =>
      service.command(binding, {
        tenantId: "tenant-1",
        ownerId: "user-1",
        deviceId: "device-2",
        sequence: 2,
        action: "navigate",
        runnerId: "runner-1",
        runnerSessionId: "runner-session-1",
        capabilitySnapshotId: "snapshot-1",
        snapshotRevision: "rev-1",
        observationRevision: 2,
        now: "2026-09-20T12:00:00.000Z",
      })
    ).toThrowError(new LocalBrowserRunnerError("DEVICE_MISMATCH"));
  });

  it("handles auth-required, stale sequence, cancellation and rebind", () => {
    const service = new LocalBrowserRunnerService();
    expect(() =>
      service.bind({
        tenantId: "tenant-1",
        ownerId: "user-1",
        deviceId: "device-1",
        sessionId: "session-2",
        profile: "browser",
        runnerId: "runner-1",
        runnerSessionId: "runner-session-1",
        capabilitySnapshotId: "snapshot-1",
        snapshotRevision: "rev-1",
        snapshotExpiresAt: "2026-09-21T00:00:00.000Z",
        authenticated: false,
      })
    ).toThrowError(new LocalBrowserRunnerError("AUTH_REQUIRED"));
    const binding = service.bind({
      tenantId: "tenant-1",
      ownerId: "user-1",
      deviceId: "device-1",
      sessionId: "session-2",
      profile: "browser",
      runnerId: "runner-1",
      runnerSessionId: "runner-session-1",
      capabilitySnapshotId: "snapshot-1",
      snapshotRevision: "rev-1",
      snapshotExpiresAt: "2026-09-21T00:00:00.000Z",
    });
    service.command(binding, {
      tenantId: "tenant-1",
      ownerId: "user-1",
      deviceId: "device-1",
      sequence: 2,
      action: "navigate",
      runnerId: "runner-1",
      runnerSessionId: "runner-session-1",
      capabilitySnapshotId: "snapshot-1",
      snapshotRevision: "rev-1",
      observationRevision: 1,
      now: "2026-09-20T12:00:00.000Z",
    });
    expect(() =>
      service.command(binding, {
        tenantId: "tenant-1",
        ownerId: "user-1",
        deviceId: "device-1",
        sequence: 1,
        action: "navigate",
        runnerId: "runner-1",
        runnerSessionId: "runner-session-1",
        capabilitySnapshotId: "snapshot-1",
        snapshotRevision: "rev-1",
        observationRevision: 1,
        now: "2026-09-20T12:00:00.000Z",
      })
    ).toThrowError(new LocalBrowserRunnerError("SEQUENCE_STALE"));
    expect(
      service.rebind(binding, {
        deviceId: "device-2",
        runnerSessionId: "runner-session-2",
        capabilitySnapshotId: "snapshot-2",
        snapshotRevision: "rev-2",
        snapshotExpiresAt: "2026-09-22T00:00:00.000Z",
      })
    ).toMatchObject({
      generation: 2,
      deviceId: "device-2",
      runnerSessionId: "runner-session-2",
      capabilitySnapshotId: "snapshot-2",
    });
    expect(service.cancel(binding)).toMatchObject({ status: "cancelled" });
    expect(service.cancel(binding)).toMatchObject({
      status: "already_cancelled",
    });
  });

  it("rejects actions from a reconnected runner or stale observation", () => {
    const service = new LocalBrowserRunnerService();
    const binding = service.bind({
      tenantId: "tenant-1",
      ownerId: "user-1",
      deviceId: "device-1",
      sessionId: "session-3",
      profile: "browser",
      runnerId: "runner-1",
      runnerSessionId: "runner-session-1",
      capabilitySnapshotId: "snapshot-1",
      snapshotRevision: "rev-1",
      snapshotExpiresAt: "2026-09-21T00:00:00.000Z",
    });

    expect(() =>
      service.command(binding, {
        tenantId: "tenant-1",
        ownerId: "user-1",
        deviceId: "device-1",
        sequence: 1,
        action: "click",
        runnerId: "runner-1",
        runnerSessionId: "runner-session-old",
        capabilitySnapshotId: "snapshot-1",
        snapshotRevision: "rev-1",
        observationRevision: 1,
        now: "2026-09-20T12:00:00.000Z",
      })
    ).toThrowError(new LocalBrowserRunnerError("RUNNER_SNAPSHOT_STALE"));

    expect(() =>
      service.command(binding, {
        tenantId: "tenant-1",
        ownerId: "user-1",
        deviceId: "device-1",
        sequence: 1,
        action: "click",
        runnerId: "runner-1",
        runnerSessionId: "runner-session-1",
        capabilitySnapshotId: "snapshot-1",
        snapshotRevision: "rev-1",
        observationRevision: 0,
        now: "2026-09-20T12:00:00.000Z",
      })
    ).toThrowError(new LocalBrowserRunnerError("OBSERVATION_STALE"));
  });

  it("rejects cross-tenant commands even when owner and device identifiers match", () => {
    const service = new LocalBrowserRunnerService();
    const binding = service.bind({
      tenantId: "tenant-1",
      ownerId: "user-1",
      deviceId: "device-1",
      sessionId: "session-cross-tenant",
      profile: "browser",
      runnerId: "runner-1",
      runnerSessionId: "runner-session-1",
      capabilitySnapshotId: "snapshot-1",
      snapshotRevision: "rev-1",
      snapshotExpiresAt: "2026-09-21T00:00:00.000Z",
    });
    expect(() => service.command(binding, {
      tenantId: "tenant-2",
      ownerId: "user-1",
      deviceId: "device-1",
      runnerId: "runner-1",
      runnerSessionId: "runner-session-1",
      capabilitySnapshotId: "snapshot-1",
      snapshotRevision: "rev-1",
      observationRevision: 1,
      now: "2026-09-20T12:00:00.000Z",
      sequence: 1,
      action: "click",
    })).toThrowError(new LocalBrowserRunnerError("TENANT_MISMATCH"));
  });
});

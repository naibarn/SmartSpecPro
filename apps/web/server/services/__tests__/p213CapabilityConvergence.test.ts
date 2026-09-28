import { describe, expect, it } from "vitest";

import {
  isRunnerSnapshotFresh,
  validateRunnerCapabilitySnapshot,
  type RunnerCapabilitySnapshot,
} from "../runnerContracts";
import {
  RunnerSessionController,
  RunnerSessionError,
} from "../runnerSessionContracts";

const NOW = new Date("2026-09-20T15:00:00.000Z");

function browserSnapshot(input: {
  availabilityState: "unavailable" | "available";
  authState: "auth_required" | "authenticated";
  probeState: "pairing_required" | "degraded" | "ready";
  expiresAt?: string;
}): RunnerCapabilitySnapshot {
  const observedAt = "2026-09-20T14:59:00.000Z";
  const expiresAt = input.expiresAt ?? "2026-09-20T15:05:00.000Z";
  const ready = input.availabilityState === "available" && input.probeState === "ready";
  return {
    runnerId: "runner-p213",
    tenantId: "tenant-p213",
    runnerSessionId: "session-p213",
    capabilitySnapshotId: "capability-p213",
    runnerVersion: "0.1.0",
    revision: "snapshot:p213:2",
    observedAt,
    expiresAt,
    capabilities: ["tool.execute.browser"],
    workspaceIds: [],
    resourceClass: "medium",
    platform: { os: "linux", architecture: "x86_64", target: "x86_64-unknown-linux-gnu" },
    computerUse: {
      browser: {
        availabilityState: input.availabilityState,
        authState: input.authState,
        probeState: input.probeState,
        reasonCodes: ready ? ["probe_ready"] : ["probe_not_ready"],
        manifest: {
          runnerId: "runner-p213",
          runnerSessionId: "session-p213",
          capabilitySnapshotId: "capability-p213",
          runtimeVersion: "0.1.0",
          adapterVersion: "browser.v1",
          browserEngine: ready ? "chromium" : null,
          browserVersion: ready ? "153.0.8010.12" : null,
          ...(ready
            ? {
                authorizationEvidenceRef: "runner-auth:sha256:p213",
                probeEvidenceRef: "browser-probe:sha256:p213",
              }
            : {}),
          supports: {
            structuredObservation: ready,
            semanticClick: ready,
            semanticType: ready,
            screenshot: ready,
            visualFallback: ready,
            cancellation: ready,
            evidence: ready,
          },
          authState: input.authState,
          probeState: input.probeState,
          observedAt,
          expiresAt,
        },
      },
      desktop: {
        availabilityState: "unavailable",
        authState: "unavailable",
        probeState: "unavailable",
        reasonCodes: ["desktop_adapter_not_configured"],
      },
    },
  };
}

function authorizedController() {
  const controller = new RunnerSessionController({ now: () => NOW });
  const challenge = controller.start({
    runnerId: "runner-p213",
    tenantId: "tenant-p213",
    deviceId: "device-p213",
    ownerUserId: 109,
    ttlMs: 60_000,
  });
  controller.approve({
    runnerSessionId: challenge.runnerSessionId,
    nonce: challenge.nonce,
    ownerUserId: 109,
  });
  controller.authorize({ runnerSessionId: challenge.runnerSessionId, deviceProofVerified: true });
  return { controller, sessionId: challenge.runnerSessionId };
}

describe("P213 browser capability convergence", () => {
  it("keeps a paired Runner without browser auth/probe out of CAPABILITY_READY", () => {
    const { controller, sessionId } = authorizedController();
    expect(controller.assertAuthorized(sessionId).state).toBe("authorized");
    expect(() => controller.assertCapabilityReady(sessionId)).toThrowError(
      new RunnerSessionError("CAPABILITY_NOT_READY"),
    );
  });

  it("does not promote discovered Chromium without browser authorization", () => {
    const snapshot = validateRunnerCapabilitySnapshot(
      browserSnapshot({ availabilityState: "unavailable", authState: "auth_required", probeState: "pairing_required" }),
    );
    expect(snapshot.computerUse?.browser).toMatchObject({
      availabilityState: "unavailable",
      authState: "auth_required",
      probeState: "pairing_required",
    });
  });

  it("does not promote authorized browser state when the probe fails", () => {
    const snapshot = validateRunnerCapabilitySnapshot(
      browserSnapshot({ availabilityState: "unavailable", authState: "authenticated", probeState: "degraded" }),
    );
    expect(snapshot.computerUse?.browser).toMatchObject({
      availabilityState: "unavailable",
      authState: "authenticated",
      probeState: "degraded",
    });
  });

  it("accepts null optional provenance from an unavailable cross-language manifest", () => {
    const snapshot = browserSnapshot({
      availabilityState: "unavailable",
      authState: "unavailable",
      probeState: "degraded",
    }) as unknown as Record<string, any>;
    snapshot.computerUse.browser.manifest.authorizationEvidenceRef = null;
    snapshot.computerUse.browser.manifest.probeEvidenceRef = null;

    const normalized = validateRunnerCapabilitySnapshot(snapshot as RunnerCapabilitySnapshot);

    expect(normalized.computerUse?.browser.manifest).not.toHaveProperty(
      "authorizationEvidenceRef",
    );
    expect(normalized.computerUse?.browser.manifest).not.toHaveProperty(
      "probeEvidenceRef",
    );
  });

  it("does not treat an expired capability snapshot as fresh", () => {
    const snapshot = validateRunnerCapabilitySnapshot(
      browserSnapshot({
        availabilityState: "available",
        authState: "authenticated",
        probeState: "ready",
        expiresAt: "2026-09-20T14:59:59.000Z",
      }),
    );
    expect(isRunnerSnapshotFresh(snapshot, NOW)).toBe(false);
  });

  it("reaches CAPABILITY_READY only with fresh authorized probe evidence", () => {
    const snapshot = validateRunnerCapabilitySnapshot(
      browserSnapshot({ availabilityState: "available", authState: "authenticated", probeState: "ready" }),
    );
    expect(isRunnerSnapshotFresh(snapshot, NOW)).toBe(true);
    const { controller, sessionId } = authorizedController();
    const ready = controller.publishCapability({
      runnerSessionId: sessionId,
      probeState: snapshot.computerUse?.browser.probeState === "ready" ? "ready" : "degraded",
      capabilitySnapshotId: snapshot.capabilitySnapshotId ?? "",
      snapshotRevision: snapshot.revision,
    });
    expect(ready.state).toBe("capability_ready");
  });

  it("invalidates old capability readiness after reconnect/session change", () => {
    const { controller, sessionId } = authorizedController();
    controller.publishCapability({
      runnerSessionId: sessionId,
      probeState: "ready",
      capabilitySnapshotId: "capability-p213",
      snapshotRevision: "snapshot:p213:2",
    });
    const next = controller.repair({
      runnerId: "runner-p213",
      tenantId: "tenant-p213",
      deviceId: "device-p213",
      ownerUserId: 109,
      ttlMs: 60_000,
    });
    expect(() => controller.assertCapabilityReady(sessionId)).toThrowError(
      new RunnerSessionError("SESSION_REVOKED"),
    );
    expect(next.state).toBe("connected");
  });
});

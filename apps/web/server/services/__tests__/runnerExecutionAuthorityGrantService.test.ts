import { generateKeyPairSync, verify as verifyBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  issueRunnerExecutionAuthorityGrant,
  RUNNER_EXECUTION_AUTHORITY_GRANT_MAX_TTL_MS,
  validateRunnerExecutionAuthorityGrant,
} from "../runnerExecutionAuthorityGrantService";

afterEach(() => vi.unstubAllEnvs());

describe("Spec 278 execution authority grants", () => {
  it("issues an RSA signature scoped to the session and bounded by the lease", () => {
    vi.stubEnv("SMARTAIHUB_SPEC278_SESSION_HOST", "true");
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    const privateKeyPem = privateKey.export({
      type: "pkcs8",
      format: "pem",
    }).toString();
    const publicKeyPem = publicKey.export({
      type: "spki",
      format: "pem",
    }).toString();
    const now = new Date("2026-10-05T00:00:00.000Z");
    const session = {
      sessionId: "s278_session_1",
      tenantId: "tenant-1",
      workerJobId: "job-1",
      workerJobAttempt: 3,
      leaseFencingVersion: 9,
      runnerId: "runner-1",
      generation: 3,
      authorityEpoch: 4,
      placementEpoch: 2,
      jobControlRevision: 7,
      state: "starting",
      continuityClass: "process_persistent",
      enforcementLevel: "PROCESS_PAUSE",
      driverId: "codex.v1",
      driverVersion: "0.1.0",
    } as const;
    const grant = issueRunnerExecutionAuthorityGrant({
      session,
      effectClass: "external_agent_task",
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      commandDeadline: new Date(now.getTime() + 120_000),
      requiredSafetyFeatures: ["workspace_write_sandbox", "fenced_command"],
      now,
      privateKeyPem,
      keyId: "runner-authority-2026-10",
      grantId: "grant-1",
    });

    expect(grant).not.toBeNull();
    expect(grant?.claims).toMatchObject({
      grantId: "grant-1",
      workerJobId: "job-1",
      sessionId: "s278_session_1",
      runnerId: "runner-1",
      sessionGeneration: 3,
      authorityEpoch: 4,
      placementEpoch: 2,
      jobControlRevision: 7,
      notAfterUnixMs: now.getTime() + 60_000,
    });
    expect(
      verifyBytes(
        "RSA-SHA256",
        Buffer.from(JSON.stringify(grant?.claims), "utf8"),
        publicKeyPem,
        Buffer.from(grant?.signatureBase64 ?? "", "base64")
      )
    ).toBe(true);
    expect(
      validateRunnerExecutionAuthorityGrant(
        grant,
        { jobId: "job-1", attempt: 3, fencingToken: 9, runnerId: "runner-1" },
        session
      )
    ).toBeNull();
    expect(
      validateRunnerExecutionAuthorityGrant(
        grant,
        { jobId: "job-1", attempt: 3, fencingToken: 10, runnerId: "runner-1" },
        session
      )
    ).toBe("RUNNER_AUTHORITY_GRANT_SCOPE_INVALID");
  });

  it("fails closed if the Session Host path is enabled without a signing key", () => {
    vi.stubEnv("SMARTAIHUB_SPEC278_SESSION_HOST", "true");
    expect(() =>
      issueRunnerExecutionAuthorityGrant({
        session: {
          sessionId: "session-1",
          tenantId: "tenant-1",
          workerJobId: "job-1",
          workerJobAttempt: 1,
          leaseFencingVersion: 1,
          runnerId: "runner-1",
          generation: 1,
          authorityEpoch: 1,
          placementEpoch: 1,
          jobControlRevision: 1,
          state: "starting",
          continuityClass: "process_persistent",
          enforcementLevel: "PROCESS_PAUSE",
          driverId: "codex.v1",
        },
        effectClass: "external_agent_task",
        leaseExpiresAt: new Date(Date.now() + 60_000),
        commandDeadline: new Date(Date.now() + 60_000),
        requiredSafetyFeatures: [],
      })
    ).toThrow("RUNNER_AUTHORITY_SIGNING_KEY_UNAVAILABLE");
  });

  it("is inert by default even when no signer is provisioned", () => {
    vi.stubEnv("SMARTAIHUB_SPEC278_SESSION_HOST", "false");
    const result = issueRunnerExecutionAuthorityGrant({
      session: {} as never,
      effectClass: "external_agent_task",
      leaseExpiresAt: new Date(0),
      commandDeadline: new Date(0),
      requiredSafetyFeatures: [],
    });
    expect(result).toBeNull();
    expect(RUNNER_EXECUTION_AUTHORITY_GRANT_MAX_TTL_MS).toBe(900_000);
  });
});

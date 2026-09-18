import express from "express";
import crypto from "node:crypto";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/authz", () => ({
  authorizeRequest: vi.fn(),
}));

import {
  createRunnerControlToken,
  createRunnerRegistrationToken,
  issueRunnerAccessTokens,
} from "../../services/runnerAuthService";
import {
  InMemoryRunnerRepository,
  RunnerGateway,
} from "../../services/runnerGateway";
import { registerRunnerControlRoutes } from "../runnerControl";
import { authorizeRequest } from "../../_core/authz";

const validPublicKey = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
}).publicKey;

function envelope(runnerId: string) {
  return {
    protocolVersion: "sah-runner-v1",
    profile: "shared_container",
    nodeKind: "managed_container",
    runnerId,
    nodeId: runnerId,
    jobId: "job-1",
    attemptId: "attempt-1",
    leaseId: "lease-1",
    fencingVersion: null,
    correlationId: `runner:${runnerId}`,
    sequence: 0,
    idempotencyKey: `runner:${runnerId}:0`,
    payload: {
      type: "runner.capabilities.update",
      snapshot: {
        runnerId,
        revision: "snapshot:1",
        observedAt: "2026-09-18T00:00:00.000Z",
        expiresAt: "2026-09-18T00:05:00.000Z",
        capabilities: ["tool.execute.codex"],
        workspaceIds: [],
        resourceClass: "medium",
        platform: {
          os: "linux",
          architecture: "x86_64",
          target: "x86_64-unknown-linux-gnu",
        },
        toolInventory: [],
        capabilityInventory: [],
      },
    },
  };
}

describe("Runner control transport routes", () => {
  beforeEach(() => {
    vi.mocked(authorizeRequest).mockReset();
  });

  it("supports authenticated browser setup without accepting a private key", async () => {
    vi.mocked(authorizeRequest).mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 7, currentTenantId: "tenant-setup" },
      sub: "7",
      scopes: [],
      tenantId: "tenant-setup",
      userId: 7,
    });
    const app = express();
    app.use(express.json());
    const repository = new InMemoryRunnerRepository();
    const gateway = new RunnerGateway(repository);
    registerRunnerControlRoutes(app, gateway);

    const response = await request(app)
      .post("/api/runners/setup")
      .send({
        displayName: "Mac Runner",
        deviceId: "macbook-pro-01",
        machineFingerprint: "fingerprint-1",
        publicKey: validPublicKey,
        privateKey: "must-not-be-accepted",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      displayName: "Mac Runner",
      profile: "local_device",
      nodeKind: "local_device",
      privateKeyRequiredLocally: true,
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body).not.toHaveProperty("privateKey");
  });

  it("rejects browser Runner setup without a session", async () => {
    vi.mocked(authorizeRequest).mockResolvedValue({
      ok: false,
      error: "Unauthorized",
    });
    const app = express();
    app.use(express.json());
    registerRunnerControlRoutes(
      app,
      new RunnerGateway(new InMemoryRunnerRepository())
    );

    await request(app)
      .post("/api/runners/setup")
      .send({
        displayName: "Unauthenticated Runner",
        deviceId: "device",
        machineFingerprint: "fingerprint",
        publicKey: validPublicKey,
      })
      .expect(401, { error: "RUNNER_SETUP_AUTH_REQUIRED" });
  });

  it("rotates control credentials and refreshes execution credentials through Runner routes", async () => {
    const app = express();
    app.use(express.json());
    const gateway = new RunnerGateway(new InMemoryRunnerRepository());
    registerRunnerControlRoutes(app, gateway);
    const runnerId = "runner-credentials";
    const registrationToken = createRunnerRegistrationToken({
      runnerId,
      tenantId: "tenant-http",
      profile: "shared_container",
      nodeKind: "managed_container",
    });
    await request(app)
      .post(`/api/runners/${runnerId}/enroll`)
      .set("Authorization", `Bearer ${registrationToken}`)
      .send({ displayName: "Credential Runner" })
      .expect(200);

    const controlToken = createRunnerControlToken({
      runnerId,
      tenantId: "tenant-http",
      profile: "shared_container",
      nodeKind: "managed_container",
    });
    const rotated = await request(app)
      .post(`/api/runners/${runnerId}/control/rotate`)
      .set("Authorization", `Bearer ${controlToken}`)
      .expect(200);
    expect(rotated.body).toMatchObject({
      accessToken: expect.any(String),
      expiresInSeconds: 900,
    });
    await request(app)
      .get(`/api/runners/${runnerId}/status`)
      .set("Authorization", `Bearer ${controlToken}`)
      .expect(401, { error: "runner_auth_invalid" });

    const refresh = issueRunnerAccessTokens({
      runnerId,
      tenantId: "tenant-http",
      profile: "shared_container",
      nodeKind: "managed_container",
    });
    const refreshed = await request(app)
      .post(`/api/runners/${runnerId}/access/refresh`)
      .set("Authorization", `Bearer ${refresh.refreshToken}`)
      .expect(200);
    expect(refreshed.body).toMatchObject({
      executionToken: expect.any(String),
      uploadToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresInSeconds: 900,
    });
  });

  it("revokes a local Runner only for its authenticated owner", async () => {
    vi.mocked(authorizeRequest).mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 7, currentTenantId: "tenant-setup" },
      sub: "7",
      scopes: [],
      tenantId: "tenant-setup",
      userId: 7,
    });
    const app = express();
    app.use(express.json());
    const gateway = new RunnerGateway(new InMemoryRunnerRepository());
    registerRunnerControlRoutes(app, gateway);
    const setup = await request(app)
      .post("/api/runners/setup")
      .send({
        displayName: "Revocable Runner",
        deviceId: "device-revoke",
        machineFingerprint: "fingerprint-revoke",
        publicKey: validPublicKey,
      })
      .expect(201);

    const revoked = await request(app)
      .post(`/api/runners/${setup.body.runnerId}/revoke`)
      .expect(200);
    expect(revoked.body).toMatchObject({
      runnerId: setup.body.runnerId,
      status: "revoked",
      trustState: "revoked",
      revokedAt: expect.any(String),
    });
  });

  it("accepts the camelCase HTTPS envelope and deduplicates it", async () => {
    const app = express();
    app.use(express.json());
    const repository = new InMemoryRunnerRepository();
    const gateway = new RunnerGateway(repository);
    registerRunnerControlRoutes(app, gateway);
    const runnerId = "runner-http-1";
    const registrationToken = createRunnerRegistrationToken({
      runnerId,
      tenantId: "tenant-http",
      profile: "shared_container",
      nodeKind: "managed_container",
    });
    await request(app)
      .post(`/api/runners/${runnerId}/enroll`)
      .set("Authorization", `Bearer ${registrationToken}`)
      .send({ displayName: "HTTP Runner", ownerUserId: 999 })
      .expect(200);
    expect(repository.nodes.get(runnerId)).toMatchObject({ ownerUserId: null });

    const controlToken = createRunnerControlToken({
      runnerId,
      tenantId: "tenant-http",
      profile: "shared_container",
      nodeKind: "managed_container",
    });
    const first = await request(app)
      .post(`/api/runners/${runnerId}/control`)
      .set("Authorization", `Bearer ${controlToken}`)
      .send(envelope(runnerId))
      .expect(200);
    expect(first.body).toMatchObject({
      ackState: "applied",
      idempotencyKey: `runner:${runnerId}:0`,
    });

    const duplicate = await request(app)
      .post(`/api/runners/${runnerId}/control`)
      .set("Authorization", `Bearer ${controlToken}`)
      .send(envelope(runnerId))
      .expect(200);
    expect(duplicate.body.ackState).toBe("duplicate");
  });

  it("requires Runner authorization before parsing control work", async () => {
    const app = express();
    app.use(express.json());
    registerRunnerControlRoutes(
      app,
      new RunnerGateway(new InMemoryRunnerRepository())
    );
    await request(app)
      .post("/api/runners/runner-http-unauth/control")
      .send({})
      .expect(401, { error: "RUNNER_AUTH_REQUIRED" });
  });

  it("rejects an envelope whose node identity differs from the authenticated Runner", async () => {
    const app = express();
    app.use(express.json());
    const gateway = new RunnerGateway(new InMemoryRunnerRepository());
    registerRunnerControlRoutes(app, gateway);
    const runnerId = "runner-http-scope";
    const registrationToken = createRunnerRegistrationToken({
      runnerId,
      tenantId: "tenant-http",
      profile: "shared_container",
      nodeKind: "managed_container",
    });
    await request(app)
      .post(`/api/runners/${runnerId}/enroll`)
      .set("Authorization", `Bearer ${registrationToken}`)
      .send({ displayName: "Scoped Runner" })
      .expect(200);
    const controlToken = createRunnerControlToken({
      runnerId,
      tenantId: "tenant-http",
      profile: "shared_container",
      nodeKind: "managed_container",
    });
    await request(app)
      .post(`/api/runners/${runnerId}/control`)
      .set("Authorization", `Bearer ${controlToken}`)
      .send({ ...envelope(runnerId), nodeId: "other-node" })
      .expect(403, { error: "runner_scope_mismatch" });
  });
});

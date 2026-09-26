import express from "express";
import crypto from "node:crypto";
import { createServer } from "node:http";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.mock("../../_core/authz", () => ({
  authorizeRequest: vi.fn(),
}));

vi.mock("../../services/redisEphemeralKeyRegistry", () => {
  const values = new Map<string, string>();
  class RedisEphemeralKeyRegistryError extends Error {
    readonly code = "redis_ephemeral_store_unavailable";
  }
  return {
    RedisEphemeralKeyRegistryError,
    setEphemeralJson: async (key: string, value: unknown) => {
      values.set(key, JSON.stringify(value));
    },
    getEphemeralJson: async <T>(key: string): Promise<T | null> => {
      const value = values.get(key);
      return value ? (JSON.parse(value) as T) : null;
    },
  };
});

import {
  createRunnerControlToken,
  createRunnerRegistrationToken,
  issueRunnerAccessTokens,
  runnerDeviceProofPayload,
} from "../../services/runnerAuthService";
import {
  InMemoryRunnerRepository,
  RunnerGateway,
} from "../../services/runnerGateway";
import { auditLogger } from "../../services/auditLogger";
import {
  handleRunnerSocketMessage,
  handleRunnerUpgrade,
  registerRunnerControlRoutes,
  runnerSessionController,
  sendRunnerReceiptAckBeforeProcessing,
  validateRunnerCommandControlPlaneOrigin,
} from "../runnerControl";
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
  const auditLog = vi
    .spyOn(auditLogger, "log")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    vi.mocked(authorizeRequest).mockReset();
    auditLog.mockClear();
  });

  it("sends a receipt ACK before semantic follow-up processing can dispatch the next command", async () => {
    const events: string[] = [];
    const ws = {
      readyState: 1,
      send: () => events.push("receipt_ack"),
    } as unknown as WebSocket;

    await sendRunnerReceiptAckBeforeProcessing({
      ws,
      ack: { ackState: "applied", receiptEventId: "receipt-1", sequence: 4 },
      process: async () => {
        events.push("semantic_follow_up");
      },
    });

    expect(events).toEqual(["receipt_ack", "semantic_follow_up"]);
  });

  it("fails closed with a rejected ACK when a Runner event is invalid", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const ws = {
      readyState: 1,
      send: (raw: string) =>
        sent.push(JSON.parse(raw) as Record<string, unknown>),
      close: vi.fn(),
    } as unknown as WebSocket;

    await expect(
      handleRunnerSocketMessage(
        ws,
        {
          token: "redacted-test-token",
          runnerId: "runner-invalid-event",
          tenantId: "tenant-invalid-event",
          runnerSessionId: "session-invalid-event",
          controlPlaneOrigin: "http://localhost:3000",
          deviceProofVerified: true,
        },
        Buffer.from("{}"),
        {} as RunnerGateway
      )
    ).resolves.toBeUndefined();

    expect(sent).toContainEqual({
      ackState: "rejected",
      reason: "runner_event_rejected",
    });
  });

  it("accepts the public Runner origin when internal dispatch uses a private host", () => {
    expect(
      validateRunnerCommandControlPlaneOrigin(
        "https://smartaihub.app",
        "https://smartaihub.app",
      )
    ).toBe("https://smartaihub.app");

    try {
      validateRunnerCommandControlPlaneOrigin(
        "http://localhost:3000",
        "https://smartaihub.app",
      );
      throw new Error("expected origin validation to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "RUNNER_CONTROL_PLANE_MISMATCH" });
    }
  });

  it("starts a browser approval session without accepting a private key or browser credentials", async () => {
    const app = express();
    app.use(express.json());
    registerRunnerControlRoutes(
      app,
      new RunnerGateway(new InMemoryRunnerRepository())
    );

    const response = await request(app)
      .post("/api/runners/connect/start")
      .send({
        runnerId: "runner-browser-1",
        displayName: "Local Runner",
        deviceId: "device-browser-1",
        machineFingerprint: "machine-browser-1",
        publicKey: validPublicKey,
        privateKey: "must-not-be-accepted",
        accessToken: "must-not-be-accepted",
      })
      .expect(201);

    expect(response.body).toMatchObject({
      runnerId: "runner-browser-1",
      verificationUri: expect.stringContaining("/runners/connect"),
      verificationUriComplete: expect.stringContaining("code="),
      pairingNonce: expect.any(String),
      runnerSessionId: expect.any(String),
      controlPlaneContractVersion: "sah-runner-v1",
      connectSchemaRevision: "sah-runner-connect-v2",
      minRunnerVersion: "0.1.0",
    });
    expect(response.body).not.toHaveProperty("privateKey");
    expect(response.body).not.toHaveProperty("accessToken");
  });

  it("carries the verified device-proof state from WSS handshake into capability publication", async () => {
    const runnerId = `runner-wss-proof-${Date.now()}`;
    const tenantId = "tenant-wss-proof";
    const deviceId = "device-wss-proof";
    const machineFingerprint = "machine-wss-proof";
    const keyPair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const session = runnerSessionController.start({
      runnerId,
      tenantId,
      deviceId,
      ownerUserId: 7,
      ttlMs: 60_000,
    });
    runnerSessionController.approve({
      runnerSessionId: session.runnerSessionId,
      nonce: session.nonce,
      ownerUserId: 7,
      tenantId,
    });
    const repository = new InMemoryRunnerRepository();
    const gateway = new RunnerGateway(repository);
    await repository.saveNode({
      runnerId,
      tenantId,
      ownerUserId: 7,
      nodeKind: "local_device",
      profile: "local_device",
      deviceId,
      displayName: "WSS Proof Runner",
      trustState: "trusted",
      status: "online",
      currentSnapshotRevision: null,
      currentSnapshot: null,
      lastSeenAt: new Date().toISOString(),
      revokedAt: null,
      activeSessionId: session.runnerSessionId,
    });
    const token = createRunnerControlToken({
      runnerId,
      tenantId,
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: {
        deviceId,
        machineFingerprint,
        publicKey: keyPair.publicKey,
      },
      runnerSessionId: session.runnerSessionId,
    });
    const path = `/api/runners/${encodeURIComponent(runnerId)}/control`;
    const bodyHash = crypto.createHash("sha256").update("{}").digest("hex");
    const nonce = `nonce-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8")
    ) as { jti: string };
    const signature = crypto
      .sign(
        "sha256",
        Buffer.from(
          runnerDeviceProofPayload({
            bodyHash,
            jti: claims.jti,
            method: "GET",
            nonce,
            path,
            timestamp,
          })
        ),
        keyPair.privateKey
      )
      .toString("base64");
    const snapshot = {
      runnerId,
      tenantId,
      runnerSessionId: session.runnerSessionId,
      capabilitySnapshotId: "capability:wss-proof:1",
      runnerVersion: "0.1.0",
      revision: "snapshot:wss-proof:1",
      observedAt: "2026-09-21T00:00:00.000Z",
      expiresAt: "2026-09-21T00:05:00.000Z",
      capabilities: [],
      workspaceIds: [],
      resourceClass: "medium",
      platform: {
        os: "linux",
        architecture: "x86_64",
        target: "x86_64-unknown-linux-gnu",
      },
      toolInventory: [],
      capabilityInventory: [],
    };
    const envelope = {
      protocolVersion: "sah-runner-v1",
      profile: "local_device",
      nodeKind: "local_device",
      runnerId,
      nodeId: runnerId,
      jobId: null,
      attemptId: null,
      leaseId: null,
      fencingVersion: null,
      correlationId: `runner:${runnerId}`,
      sequence: 1,
      idempotencyKey: `runner:${runnerId}:capability:1`,
      payload: { type: "runner.capabilities.update", snapshot },
      ackState: null,
    };
    const server = createServer();
    server.on("upgrade", (req, socket, head) =>
      handleRunnerUpgrade(req, socket, head, gateway)
    );
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("test server address unavailable");
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-SmartAIHub-Runner-Protocol": "sah-runner-v1",
        "X-Runner-Device-Id": deviceId,
        "X-Runner-Device-Public-Key": keyPair.publicKey.replace(/\n/g, "\\n"),
        "X-Runner-Machine-Fingerprint": machineFingerprint,
        "X-Runner-Device-Nonce": nonce,
        "X-Runner-Device-Timestamp": timestamp,
        "X-Runner-Device-Signature": signature,
        "X-Runner-Body-Sha256": bodyHash,
      },
    });
    const messages: Array<Record<string, unknown>> = [];
    const ack = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("WSS test timed out")),
          2_000
        );
        ws.on("message", raw => {
          const message = JSON.parse(raw.toString()) as Record<string, unknown>;
          messages.push(message);
          if (
            message.ackState === "applied" ||
            message.ackState === "rejected"
          ) {
            clearTimeout(timer);
            resolve(message);
          }
        });
        ws.on("error", error => {
          clearTimeout(timer);
          reject(error);
        });
        ws.on("open", () => ws.send(JSON.stringify(envelope)));
      }
    );
    ws.close();
    await new Promise<void>(resolve => server.close(() => resolve()));

    expect(messages[0]).toMatchObject({
      type: "runner.handshake",
      ackState: "accepted",
    });
    expect(ack).toMatchObject({ ackState: "applied" });
    expect(
      (await repository.getNode(runnerId, tenantId))?.currentSnapshotRevision
    ).toBe("snapshot:wss-proof:1");
  });

  it("carries the verified device-proof state from WSS handshake into reconciliation authorization", async () => {
    const runnerId = `runner-wss-reconcile-proof-${Date.now()}`;
    const tenantId = "tenant-wss-reconcile-proof";
    const deviceId = "device-wss-reconcile-proof";
    const machineFingerprint = "machine-wss-reconcile-proof";
    const keyPair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const session = runnerSessionController.start({
      runnerId,
      tenantId,
      deviceId,
      ownerUserId: 7,
      ttlMs: 60_000,
    });
    runnerSessionController.approve({
      runnerSessionId: session.runnerSessionId,
      nonce: session.nonce,
      ownerUserId: 7,
      tenantId,
    });
    const repository = new InMemoryRunnerRepository();
    const gateway = new RunnerGateway(repository);
    await repository.saveNode({
      runnerId,
      tenantId,
      ownerUserId: 7,
      nodeKind: "local_device",
      profile: "local_device",
      deviceId,
      displayName: "WSS Reconcile Proof Runner",
      trustState: "trusted",
      status: "online",
      currentSnapshotRevision: null,
      currentSnapshot: null,
      lastSeenAt: new Date().toISOString(),
      revokedAt: null,
      activeSessionId: session.runnerSessionId,
    });
    const token = createRunnerControlToken({
      runnerId,
      tenantId,
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: {
        deviceId,
        machineFingerprint,
        publicKey: keyPair.publicKey,
      },
      runnerSessionId: session.runnerSessionId,
    });
    const path = `/api/runners/${encodeURIComponent(runnerId)}/control`;
    const bodyHash = crypto.createHash("sha256").update("{}").digest("hex");
    const nonce = `nonce-${Date.now()}`;
    const timestamp = new Date().toISOString();
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8")
    ) as { jti: string };
    const signature = crypto
      .sign(
        "sha256",
        Buffer.from(
          runnerDeviceProofPayload({
            bodyHash,
            jti: claims.jti,
            method: "GET",
            nonce,
            path,
            timestamp,
          })
        ),
        keyPair.privateKey
      )
      .toString("base64");
    const envelope = {
      protocolVersion: "sah-runner-v1",
      profile: "local_device",
      nodeKind: "local_device",
      runnerId,
      nodeId: runnerId,
      jobId: null,
      attemptId: null,
      leaseId: null,
      fencingVersion: null,
      correlationId: `runner:${runnerId}`,
      sequence: 1,
      idempotencyKey: `runner:${runnerId}:reconcile:1`,
      payload: { type: "runner.reconcile" },
      ackState: null,
    };
    const server = createServer();
    server.on("upgrade", (req, socket, head) =>
      handleRunnerUpgrade(req, socket, head, gateway)
    );
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("test server address unavailable");
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-SmartAIHub-Runner-Protocol": "sah-runner-v1",
        "X-Runner-Device-Id": deviceId,
        "X-Runner-Device-Public-Key": keyPair.publicKey.replace(/\n/g, "\\n"),
        "X-Runner-Machine-Fingerprint": machineFingerprint,
        "X-Runner-Device-Nonce": nonce,
        "X-Runner-Device-Timestamp": timestamp,
        "X-Runner-Device-Signature": signature,
        "X-Runner-Body-Sha256": bodyHash,
      },
    });
    const ack = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("WSS reconcile test timed out")),
          2_000
        );
        ws.on("message", raw => {
          const message = JSON.parse(raw.toString()) as Record<string, unknown>;
          if (
            message.ackState === "applied" ||
            message.ackState === "rejected"
          ) {
            clearTimeout(timer);
            resolve(message);
          }
        });
        ws.on("error", error => {
          clearTimeout(timer);
          reject(error);
        });
        ws.on("open", () => ws.send(JSON.stringify(envelope)));
      }
    );
    ws.close();
    await new Promise<void>(resolve => server.close(() => resolve()));

    expect(ack).toMatchObject({ ackState: "applied" });
    expect(
      runnerSessionController.assertAuthorized(session.runnerSessionId).state
    ).toBe("authorized");
  });

  it("fails closed when a local Runner handshake has no verified device proof", async () => {
    const runnerId = `runner-wss-no-proof-${Date.now()}`;
    const tenantId = "tenant-wss-no-proof";
    const deviceId = "device-wss-no-proof";
    const keyPair = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const session = runnerSessionController.start({
      runnerId,
      tenantId,
      deviceId,
      ownerUserId: 7,
      ttlMs: 60_000,
    });
    runnerSessionController.approve({
      runnerSessionId: session.runnerSessionId,
      nonce: session.nonce,
      ownerUserId: 7,
      tenantId,
    });
    const repository = new InMemoryRunnerRepository();
    const gateway = new RunnerGateway(repository);
    await repository.saveNode({
      runnerId,
      tenantId,
      ownerUserId: 7,
      nodeKind: "local_device",
      profile: "local_device",
      deviceId,
      displayName: "WSS No Proof Runner",
      trustState: "trusted",
      status: "online",
      currentSnapshotRevision: null,
      currentSnapshot: null,
      lastSeenAt: new Date().toISOString(),
      revokedAt: null,
      activeSessionId: session.runnerSessionId,
    });
    const token = createRunnerControlToken({
      runnerId,
      tenantId,
      profile: "local_device",
      nodeKind: "local_device",
      deviceBinding: {
        deviceId,
        machineFingerprint: "machine-wss-no-proof",
        publicKey: keyPair.publicKey,
      },
      runnerSessionId: session.runnerSessionId,
    });
    const path = `/api/runners/${encodeURIComponent(runnerId)}/control`;
    const server = createServer();
    server.on("upgrade", (req, socket, head) =>
      handleRunnerUpgrade(req, socket, head, gateway)
    );
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("test server address unavailable");
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-SmartAIHub-Runner-Protocol": "sah-runner-v1",
      },
    });
    const closeCode = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("WSS no-proof test timed out")),
        2_000
      );
      ws.on("close", code => {
        clearTimeout(timer);
        resolve(code);
      });
      ws.on("error", error => {
        clearTimeout(timer);
        reject(error);
      });
    });
    await new Promise<void>(resolve => server.close(() => resolve()));

    expect(closeCode).toBe(1008);
    expect(() =>
      runnerSessionController.assertAuthorized(session.runnerSessionId)
    ).toThrow("SESSION_STATE_INVALID");
  });

  it("rejects a Runner that advertises an unsupported control contract", async () => {
    const app = express();
    app.use(express.json());
    registerRunnerControlRoutes(
      app,
      new RunnerGateway(new InMemoryRunnerRepository())
    );

    await request(app)
      .post("/api/runners/connect/start")
      .send({
        runnerId: "runner-incompatible",
        displayName: "Old Runner",
        deviceId: "device-old",
        machineFingerprint: "machine-old",
        publicKey: validPublicKey,
        runnerVersion: "0.1.0",
        supportedRunnerContractVersions: ["sah-runner-v0"],
        supportedConnectSchemaRevisions: ["sah-runner-connect-v1"],
      })
      .expect(409, {
        error: "UNSUPPORTED_RUNNER_CONTRACT",
        compatibility: {
          controlPlaneContractVersion: "sah-runner-v1",
          connectSchemaRevision: "sah-runner-connect-v2",
          minRunnerVersion: "0.1.0",
        },
      });
  });

  it("derives the approved tenant from the authenticated session and keeps credentials out of browser responses", async () => {
    vi.mocked(authorizeRequest).mockResolvedValue({
      ok: true,
      mode: "session",
      user: { id: 7, currentTenantId: "tenant-runner" },
      sub: "7",
      scopes: [],
      tenantId: "tenant-runner",
      userId: 7,
    });
    const app = express();
    app.use(express.json());
    registerRunnerControlRoutes(
      app,
      new RunnerGateway(new InMemoryRunnerRepository())
    );

    const start = await request(app)
      .post("/api/runners/connect/start")
      .send({
        runnerId: "runner-browser-2",
        displayName: "Local Runner",
        deviceId: "device-browser-2",
        machineFingerprint: "machine-browser-2",
        publicKey: validPublicKey,
        runnerVersion: "0.1.0",
      })
      .expect(201);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runner_pairing_started",
        metadata: expect.objectContaining({
          pairingChallengeId: start.body.runnerSessionId,
          nonceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          issuedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          sourceBuildIdentity: expect.objectContaining({
            runnerVersion: "0.1.0",
            controlPlaneContractVersion: expect.any(String),
            connectSchemaRevision: expect.any(String),
          }),
        }),
      })
    );

    const status = await request(app)
      .get(`/api/runners/connect/status?user_code=${start.body.userCode}`)
      .expect(200);
    expect(status.body.session).toMatchObject({
      request: { displayName: "Local Runner", deviceId: "device-browser-2" },
    });
    expect(status.body.session).not.toHaveProperty("request.publicKey");
    expect(status.body.session).not.toHaveProperty(
      "request.machineFingerprint"
    );

    const approved = await request(app)
      .post("/api/runners/connect/approve")
      .send({ user_code: start.body.userCode, tenantId: "attacker-tenant" })
      .expect(200);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "runner_pairing_approved",
        metadata: expect.objectContaining({
          pairingChallengeId: start.body.runnerSessionId,
          nonceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          approvedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          issuedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          sourceBuildIdentity: expect.objectContaining({
            runnerVersion: "0.1.0",
            controlPlaneContractVersion: expect.any(String),
            connectSchemaRevision: expect.any(String),
          }),
        }),
      })
    );
    expect(approved.body.session.runner).toMatchObject({
      id: "runner-browser-2",
      nodeKind: "local_device",
    });
    expect(approved.body.session).not.toHaveProperty("controlToken");
    expect(approved.body.session).not.toHaveProperty("accessToken");

    const token = await request(app)
      .post("/api/runners/connect/token")
      .send({
        deviceCode: start.body.deviceCode,
        pairingNonce: start.body.pairingNonce,
      })
      .expect(200);
    expect(token.body).toMatchObject({
      status: "approved",
      runner: { id: "runner-browser-2" },
    });
    expect(token.body.controlToken).toEqual(expect.any(String));
    expect(token.body.refreshToken).toEqual(expect.any(String));
    expect(token.body.runnerSessionId).toEqual(expect.any(String));
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

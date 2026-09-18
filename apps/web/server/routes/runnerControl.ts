import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { z } from "zod";
import { WebSocketServer, type WebSocket } from "ws";

import {
  createRunnerControlToken,
  createRunnerRegistrationToken,
  extractRunnerBearerToken,
  extractRunnerDeviceProofFromRequest,
  refreshRunnerAccessTokens,
  RunnerAuthError,
  rotateRunnerControlToken,
  verifyRunnerRegistrationToken,
  verifyRunnerControlToken,
  verifyRunnerRefreshToken,
} from "../services/runnerAuthService";
import { authorizeRequest } from "../_core/authz";
import {
  defaultRunnerGateway,
  RunnerGatewayError,
  type RunnerGateway,
} from "../services/runnerGateway";
import {
  RUNNER_CONTRACT_VERSION,
  validateRunnerCapabilitySnapshot,
  validateRunnerProtocolEnvelope,
  type RunnerProtocolEnvelope,
} from "../services/runnerContracts";

let runnerWss: WebSocketServer | null = null;

function getRunnerWss(): WebSocketServer {
  if (!runnerWss) runnerWss = new WebSocketServer({ noServer: true });
  return runnerWss;
}

function runnerRequestShape(req: IncomingMessage) {
  return {
    body: {},
    headers: req.headers,
    method: req.method ?? "GET",
    originalUrl: req.url ?? "",
    path: req.url ?? "",
    url: req.url ?? "",
  } as Pick<
    Request,
    "body" | "headers" | "method" | "originalUrl" | "path" | "url"
  >;
}

function sendRunnerSocket(
  ws: WebSocket,
  payload: Record<string, unknown>
): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload));
}

function assertRunnerEnvelopeBinding(
  envelope: RunnerProtocolEnvelope,
  auth: { runnerId: string; profile: string; nodeKind: string }
): void {
  if (
    envelope.runnerId !== auth.runnerId ||
    envelope.nodeId !== auth.runnerId ||
    envelope.profile !== auth.profile ||
    envelope.nodeKind !== auth.nodeKind
  ) {
    throw new RunnerAuthError(
      "runner_scope_mismatch",
      403,
      "Runner envelope identity does not match the authenticated node"
    );
  }
}

/** Handles the authenticated WSS fast path. HTTPS routes remain the durable fallback. */
export function handleRunnerUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  gateway: RunnerGateway = defaultRunnerGateway
): void {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`
  );
  const match = url.pathname.match(/^\/api\/runners\/([^/]+)\/control$/);
  if (!match) return;
  const protocol = String(req.headers["x-smartaihub-runner-protocol"] ?? "");
  if (protocol !== RUNNER_CONTRACT_VERSION) {
    socket.write("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  const runnerId = decodeURIComponent(match[1]);
  getRunnerWss().handleUpgrade(req, socket, head, ws => {
    void handleRunnerSocket(ws, req, runnerId, gateway);
  });
}

async function handleRunnerSocket(
  ws: WebSocket,
  req: IncomingMessage,
  runnerId: string,
  gateway: RunnerGateway
): Promise<void> {
  const token = extractRunnerBearerToken({ headers: req.headers });
  if (!token) {
    ws.close(1008, "runner_auth_required");
    return;
  }
  let initialAuth: Awaited<ReturnType<typeof verifyRunnerControlToken>>;
  try {
    initialAuth = await verifyRunnerControlToken(token, {
      runnerId,
      requiredScopes: ["runner:status"],
      requestProof: extractRunnerDeviceProofFromRequest(
        runnerRequestShape(req)
      ),
    });
    const node = await gateway.getStatus(initialAuth);
    if (node.revokedAt || node.trustState === "revoked")
      throw new RunnerAuthError("runner_revoked", 403, "Runner is revoked");
  } catch {
    ws.close(1008, "runner_auth_invalid");
    return;
  }
  ws.on("message", raw => {
    void handleRunnerSocketMessage(
      ws,
      token,
      runnerId,
      initialAuth.tenantId,
      raw,
      gateway
    );
  });
  sendRunnerSocket(ws, {
    ackState: "accepted",
    type: "runner.handshake",
    runnerId,
  });
}

async function handleRunnerSocketMessage(
  ws: WebSocket,
  token: string,
  runnerId: string,
  tenantId: string,
  raw: Buffer | ArrayBuffer | Buffer[],
  gateway: RunnerGateway
): Promise<void> {
  const message = Buffer.isBuffer(raw)
    ? raw
    : Array.isArray(raw)
      ? Buffer.concat(raw)
      : Buffer.from(raw);
  if (message.byteLength > 256 * 1024) {
    ws.close(1009, "runner_message_too_large");
    return;
  }
  try {
    const envelope = validateRunnerProtocolEnvelope(
      JSON.parse(message.toString("utf8")) as RunnerProtocolEnvelope
    );
    if (envelope.runnerId !== runnerId)
      throw new Error("runner_scope_mismatch");
    const type = envelope.payload.type;
    if (type === "runner.capabilities.update") {
      const auth = await verifyRunnerControlToken(token, {
        runnerId,
        tenantId,
        requiredScopes: ["runner:capabilities"],
      });
      assertRunnerEnvelopeBinding(envelope, auth);
      const snapshot = validateRunnerCapabilitySnapshot(
        envelope.payload.snapshot as Parameters<
          typeof validateRunnerCapabilitySnapshot
        >[0]
      );
      const result = await gateway.publishCapabilities({
        auth,
        snapshot,
        idempotencyKey: envelope.idempotencyKey,
      });
      sendRunnerSocket(ws, {
        ackState: result.status === "duplicate" ? "duplicate" : "applied",
        sequence: envelope.sequence,
        idempotencyKey: envelope.idempotencyKey,
      });
      return;
    }
    if (type === "runner.reconcile") {
      const auth = await verifyRunnerControlToken(token, {
        runnerId,
        tenantId,
        requiredScopes: ["runner:heartbeat"],
      });
      assertRunnerEnvelopeBinding(envelope, auth);
      await gateway.heartbeat(auth);
      sendRunnerSocket(ws, {
        ackState: "applied",
        sequence: envelope.sequence,
        idempotencyKey: envelope.idempotencyKey,
      });
      return;
    }
    throw new Error("runner_event_type_not_supported");
  } catch {
    sendRunnerSocket(ws, {
      ackState: "rejected",
      reason: "runner_event_rejected",
    });
  }
}

const enrollmentSchema = z.object({
  deviceId: z.string().trim().min(1).max(160).nullable().optional(),
  displayName: z.string().trim().min(1).max(255),
});

const capabilityPublicationSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(200),
  snapshot: z.record(z.unknown()),
});

const runnerSetupSchema = z.object({
  runnerId: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
    .optional(),
  displayName: z.string().trim().min(1).max(255),
  deviceId: z.string().trim().min(1).max(160),
  machineFingerprint: z.string().trim().min(1).max(512),
  publicKey: z
    .string()
    .trim()
    .min(1)
    .max(16 * 1024),
});

function sendError(res: Response, error: unknown): void {
  if (error instanceof RunnerAuthError) {
    res.status(error.statusCode).json({ error: error.code });
    return;
  }
  if (error instanceof RunnerGatewayError) {
    const statusCode = error.code.endsWith("_NOT_FOUND")
      ? 404
      : error.code.endsWith("PERMISSION_DENIED")
        ? 403
        : 409;
    res.status(statusCode).json({ error: error.code });
    return;
  }
  res.status(400).json({ error: "RUNNER_REQUEST_INVALID" });
}

async function authenticate(
  req: Request,
  res: Response,
  runnerId: string,
  requiredScope: string
) {
  const token = extractRunnerBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "RUNNER_AUTH_REQUIRED" });
    return null;
  }
  try {
    return await verifyRunnerControlToken(token, {
      runnerId,
      requiredScopes: [requiredScope],
      requestProof: extractRunnerDeviceProofFromRequest(req),
    });
  } catch (error) {
    sendError(res, error);
    return null;
  }
}

async function authenticateRegistration(
  req: Request,
  res: Response,
  runnerId: string
) {
  const token = extractRunnerBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "RUNNER_AUTH_REQUIRED" });
    return null;
  }
  try {
    return await verifyRunnerRegistrationToken(token, {
      runnerId,
      requiredScopes: ["runner:enroll"],
      requestProof: extractRunnerDeviceProofFromRequest(req),
    });
  } catch (error) {
    sendError(res, error);
    return null;
  }
}

export function registerRunnerControlRoutes(
  app: Express,
  gateway: RunnerGateway = defaultRunnerGateway
): void {
  app.post("/api/runners/setup", async (req, res) => {
    const browserAuth = await authorizeRequest(req, {
      allowBearer: false,
      allowSession: true,
    });
    if (!browserAuth.ok || browserAuth.mode !== "session") {
      return res.status(401).json({ error: "RUNNER_SETUP_AUTH_REQUIRED" });
    }
    const parsed = runnerSetupSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "RUNNER_SETUP_REQUEST_INVALID" });
    const tenantId = String(
      browserAuth.tenantId ?? browserAuth.user?.currentTenantId ?? ""
    ).trim();
    const ownerUserId = Number(browserAuth.userId ?? browserAuth.user?.id ?? 0);
    if (!tenantId || !Number.isInteger(ownerUserId) || ownerUserId <= 0) {
      return res.status(400).json({ error: "RUNNER_SETUP_TENANT_REQUIRED" });
    }
    const runnerId = parsed.data.runnerId ?? `runner-${randomUUID()}`;
    const deviceBinding = {
      deviceId: parsed.data.deviceId,
      machineFingerprint: parsed.data.machineFingerprint,
      publicKey: parsed.data.publicKey,
    };
    try {
      const registrationToken = createRunnerRegistrationToken({
        runnerId,
        tenantId,
        subject: `runner-setup:${ownerUserId}`,
        profile: "local_device",
        nodeKind: "local_device",
        deviceBinding,
        ownerUserId,
      });
      const registrationAuth =
        await verifyRunnerRegistrationToken(registrationToken);
      const node = await gateway.enroll({
        auth: registrationAuth,
        deviceId: parsed.data.deviceId,
        displayName: parsed.data.displayName,
        ownerUserId,
      });
      const controlToken = createRunnerControlToken({
        runnerId,
        tenantId,
        subject: `runner-setup:${ownerUserId}`,
        profile: "local_device",
        nodeKind: "local_device",
        deviceBinding,
      });
      return res.status(201).json({
        runnerId: node.runnerId,
        displayName: node.displayName,
        profile: node.profile,
        nodeKind: node.nodeKind,
        controlPath: `/api/runners/${encodeURIComponent(node.runnerId)}/control`,
        accessToken: controlToken,
        expiresInSeconds: 900,
        privateKeyRequiredLocally: true,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runners/:runnerId/enroll", async (req, res) => {
    const auth = await authenticateRegistration(req, res, req.params.runnerId);
    if (!auth) return;
    const parsed = enrollmentSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "RUNNER_REQUEST_INVALID" });
    try {
      const node = await gateway.enroll({
        auth,
        deviceId: parsed.data.deviceId ?? null,
        displayName: parsed.data.displayName,
      });
      return res.json({
        runnerId: node.runnerId,
        profile: node.profile,
        nodeKind: node.nodeKind,
        status: node.status,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runners/:runnerId/control/rotate", async (req, res) => {
    const token = extractRunnerBearerToken(req);
    if (!token) return res.status(401).json({ error: "RUNNER_AUTH_REQUIRED" });
    try {
      const auth = await verifyRunnerControlToken(token, {
        runnerId: req.params.runnerId,
        requiredScopes: ["runner:status"],
        requestProof: extractRunnerDeviceProofFromRequest(req),
      });
      const node = await gateway.getStatus(auth);
      if (node.revokedAt || node.trustState === "revoked")
        throw new RunnerAuthError("runner_revoked", 403, "Runner is revoked");
      const accessToken = await rotateRunnerControlToken(token);
      return res.json({ accessToken, expiresInSeconds: 900 });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runners/:runnerId/access/refresh", async (req, res) => {
    const token = extractRunnerBearerToken(req);
    if (!token) return res.status(401).json({ error: "RUNNER_AUTH_REQUIRED" });
    try {
      const auth = await verifyRunnerRefreshToken(token, {
        runnerId: req.params.runnerId,
        requestProof: extractRunnerDeviceProofFromRequest(req),
      });
      const node = await gateway.getStatus(auth);
      if (node.revokedAt || node.trustState === "revoked")
        throw new RunnerAuthError("runner_revoked", 403, "Runner is revoked");
      const tokens = await refreshRunnerAccessTokens(token, {
        runnerId: req.params.runnerId,
      });
      return res.json({ ...tokens, expiresInSeconds: 900 });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runners/:runnerId/revoke", async (req, res) => {
    const browserAuth = await authorizeRequest(req, {
      allowBearer: false,
      allowSession: true,
    });
    if (!browserAuth.ok || browserAuth.mode !== "session") {
      return res.status(401).json({ error: "RUNNER_SETUP_AUTH_REQUIRED" });
    }
    const tenantId = String(
      browserAuth.tenantId ?? browserAuth.user?.currentTenantId ?? ""
    ).trim();
    const ownerUserId = Number(browserAuth.userId ?? browserAuth.user?.id ?? 0);
    if (!tenantId || !Number.isInteger(ownerUserId) || ownerUserId <= 0) {
      return res.status(400).json({ error: "RUNNER_SETUP_TENANT_REQUIRED" });
    }
    try {
      const node = await gateway.revoke({
        runnerId: req.params.runnerId,
        tenantId,
        ownerUserId,
      });
      return res.json({
        runnerId: node.runnerId,
        status: node.status,
        trustState: node.trustState,
        revokedAt: node.revokedAt,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runners/:runnerId/control", async (req, res) => {
    const token = extractRunnerBearerToken(req);
    if (!token) return res.status(401).json({ error: "RUNNER_AUTH_REQUIRED" });
    try {
      const envelope = validateRunnerProtocolEnvelope(
        req.body as RunnerProtocolEnvelope
      );
      if (envelope.runnerId !== req.params.runnerId)
        throw new RunnerAuthError(
          "runner_scope_mismatch",
          403,
          "Runner envelope does not match the requested runner"
        );
      const scope =
        envelope.payload.type === "runner.capabilities.update"
          ? "runner:capabilities"
          : envelope.payload.type === "runner.reconcile"
            ? "runner:heartbeat"
            : "runner:status";
      const auth = await verifyRunnerControlToken(token, {
        runnerId: req.params.runnerId,
        requiredScopes: [scope],
        requestProof: extractRunnerDeviceProofFromRequest(req),
      });
      assertRunnerEnvelopeBinding(envelope, auth);
      if (envelope.payload.type === "runner.capabilities.update") {
        const snapshot = validateRunnerCapabilitySnapshot(
          envelope.payload.snapshot as Parameters<
            typeof validateRunnerCapabilitySnapshot
          >[0]
        );
        const result = await gateway.publishCapabilities({
          auth,
          snapshot,
          idempotencyKey: envelope.idempotencyKey,
        });
        return res.json({
          ackState: result.status === "duplicate" ? "duplicate" : "applied",
          sequence: envelope.sequence,
          idempotencyKey: envelope.idempotencyKey,
        });
      }
      if (envelope.payload.type === "runner.reconcile") {
        await gateway.heartbeat(auth);
        return res.json({
          ackState: "applied",
          sequence: envelope.sequence,
          idempotencyKey: envelope.idempotencyKey,
        });
      }
      return res.status(400).json({
        ackState: "rejected",
        reason: "runner_event_type_not_supported",
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runners/:runnerId/capabilities", async (req, res) => {
    const auth = await authenticate(
      req,
      res,
      req.params.runnerId,
      "runner:capabilities"
    );
    if (!auth) return;
    const parsed = capabilityPublicationSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: "RUNNER_REQUEST_INVALID" });
    try {
      const snapshot = validateRunnerCapabilitySnapshot(
        parsed.data.snapshot as unknown as Parameters<
          typeof validateRunnerCapabilitySnapshot
        >[0]
      );
      const result = await gateway.publishCapabilities({
        auth,
        snapshot,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      return res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/runners/:runnerId/heartbeat", async (req, res) => {
    const auth = await authenticate(
      req,
      res,
      req.params.runnerId,
      "runner:heartbeat"
    );
    if (!auth) return;
    try {
      const node = await gateway.heartbeat(auth);
      return res.json({
        runnerId: node.runnerId,
        status: node.status,
        lastSeenAt: node.lastSeenAt,
        snapshotRevision: node.currentSnapshotRevision,
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.get("/api/runners/:runnerId/status", async (req, res) => {
    const auth = await authenticate(
      req,
      res,
      req.params.runnerId,
      "runner:status"
    );
    if (!auth) return;
    try {
      const node = await gateway.getStatus(auth);
      return res.json({
        runnerId: node.runnerId,
        profile: node.profile,
        nodeKind: node.nodeKind,
        status: node.status,
        trustState: node.trustState,
        snapshotRevision: node.currentSnapshotRevision,
        snapshotExpiresAt: node.currentSnapshot?.expiresAt ?? null,
      });
    } catch (error) {
      sendError(res, error);
    }
  });
}

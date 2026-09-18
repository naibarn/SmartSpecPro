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
import { getDb } from "../db";
import { runnerNodes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
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
import {
  acknowledgeRunnerUpdate,
  claimNextRunnerUpdate,
  getRunnerUpdateStatus,
  requestRunnerUpdate,
  RunnerUpdateError,
  runnerUpdateStatuses,
} from "../services/runnerUpdateService";

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
  if (error instanceof RunnerUpdateError) {
    res.status(error.statusCode).json({ error: error.code });
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
  app.get("/api/runners", async (req, res) => {
    const browserAuth = await authorizeRequest(req, {
      allowBearer: false,
      allowSession: true,
    });
    if (!browserAuth.ok || browserAuth.mode !== "session") {
      return res.status(401).json({ error: "RUNNER_LIST_AUTH_REQUIRED" });
    }
    const tenantId = String(
      browserAuth.tenantId ?? browserAuth.user?.currentTenantId ?? "",
    ).trim();
    if (!tenantId) return res.status(400).json({ error: "RUNNER_LIST_TENANT_REQUIRED" });
    try {
      const rows = await getDb().select().from(runnerNodes).where(eq(runnerNodes.tenantId, tenantId));
      return res.json({
        runners: rows.map(row => {
          const toolInventory = Array.isArray(row.currentSnapshotJson?.toolInventory)
            ? row.currentSnapshotJson.toolInventory
            : [];
          const capabilityInventory = Array.isArray(row.currentSnapshotJson?.capabilityInventory)
            ? row.currentSnapshotJson.capabilityInventory
            : [];
          return {
            runnerId: row.runnerId,
            displayName: row.displayName,
            profile: row.profile,
            nodeKind: row.nodeKind,
            status: row.status,
            trustState: row.trustState,
            lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
            runnerVersion: typeof row.currentSnapshotJson?.runnerVersion === "string"
              ? row.currentSnapshotJson.runnerVersion
              : null,
            platform: row.currentSnapshotJson?.platform ?? null,
            toolCount: toolInventory.length,
            readyToolCount: toolInventory.filter(item => item && typeof item === "object" && ["ready", "available"].includes(String((item as Record<string, unknown>).trustState ?? (item as Record<string, unknown>).availabilityState ?? ""))).length,
            capabilityCount: capabilityInventory.length,
            readyCapabilityCount: capabilityInventory.filter(item => item && typeof item === "object" && String((item as Record<string, unknown>).policyDecision ?? "") === "allowed").length,
          };
        }),
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

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

  app.post("/api/runners/:runnerId/update", async (req, res) => {
    const browserAuth = await authorizeRequest(req, {
      allowBearer: false,
      allowSession: true,
    });
    if (!browserAuth.ok || browserAuth.mode !== "session") {
      return res.status(401).json({ error: "RUNNER_UPDATE_SESSION_REQUIRED" });
    }
    const tenantId = String(
      browserAuth.tenantId ?? browserAuth.user?.currentTenantId ?? "",
    ).trim();
    const requestedBy = Number(browserAuth.userId ?? browserAuth.user?.id ?? 0);
    const requesterRole = typeof browserAuth.user?.role === "string" ? browserAuth.user.role : null;
    const releaseAssetId = Number(req.body?.releaseAssetId);
    const idempotencyKey = String(req.body?.idempotencyKey ?? "").trim();
    if (!tenantId || !Number.isInteger(requestedBy) || requestedBy <= 0) {
      return res.status(400).json({ error: "RUNNER_UPDATE_TENANT_REQUIRED" });
    }
    if (!Number.isInteger(releaseAssetId) || releaseAssetId <= 0 || !idempotencyKey || idempotencyKey.length > 200) {
      return res.status(400).json({ error: "RUNNER_UPDATE_REQUEST_INVALID" });
    }
    try {
      return res.status(202).json(await requestRunnerUpdate({
        tenantId,
        runnerId: req.params.runnerId,
        releaseAssetId,
        idempotencyKey,
        requestedBy,
        requesterRole,
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/runners/:runnerId/update/:commandId", async (req, res) => {
    const browserAuth = await authorizeRequest(req, {
      allowBearer: false,
      allowSession: true,
    });
    if (!browserAuth.ok || browserAuth.mode !== "session") {
      return res.status(401).json({ error: "RUNNER_UPDATE_SESSION_REQUIRED" });
    }
    const tenantId = String(
      browserAuth.tenantId ?? browserAuth.user?.currentTenantId ?? "",
    ).trim();
    const requestedBy = Number(browserAuth.userId ?? browserAuth.user?.id ?? 0);
    const requesterRole = typeof browserAuth.user?.role === "string" ? browserAuth.user.role : null;
    try {
      return res.json(await getRunnerUpdateStatus({
        tenantId,
        runnerId: req.params.runnerId,
        commandId: req.params.commandId,
        requestedBy,
        requesterRole,
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/runners/:runnerId/update-commands/next", async (req, res) => {
    const auth = await authenticate(req, res, req.params.runnerId, "runner:update");
    if (!auth) return;
    try {
      return res.json(await claimNextRunnerUpdate({
        runnerId: req.params.runnerId,
        tenantId: auth.tenantId,
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/runners/:runnerId/update-commands/:commandId/download", async (req, res) => {
    const auth = await authenticate(req, res, req.params.runnerId, "runner:update");
    if (!auth) return;
    try {
      const command = await getRunnerUpdateStatus({
        tenantId: auth.tenantId,
        runnerId: req.params.runnerId,
        commandId: req.params.commandId,
      });
      if (!command.downloadUrl) return res.status(404).json({ error: "RUNNER_UPDATE_DOWNLOAD_UNAVAILABLE" });
      const assetId = command.releaseAssetId;
      const { streamRunnerReleaseAsset } = await import("../services/runnerReleaseService");
      const result = await streamRunnerReleaseAsset(assetId, typeof req.headers.range === "string" ? req.headers.range : undefined);
      res.setHeader("Content-Type", result.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${result.fileName.replace(/"/g, "\\\"")}"`);
      if (result.contentLength !== undefined) res.setHeader("Content-Length", String(result.contentLength));
      if (result.totalLength !== undefined) res.setHeader("Accept-Ranges", "bytes");
      if (result.isPartial) res.status(206);
      const stream = result.stream as any;
      if (typeof stream.pipe === "function") return stream.pipe(res);
      const reader = stream.getReader();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        res.write(Buffer.from(chunk.value));
      }
      return res.end();
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.post("/api/runners/:runnerId/update-commands/:commandId/ack", async (req, res) => {
    const auth = await authenticate(req, res, req.params.runnerId, "runner:update");
    if (!auth) return;
    const status = String(req.body?.status ?? "");
    if (!(runnerUpdateStatuses as readonly string[]).includes(status)) {
      return res.status(400).json({ error: "RUNNER_UPDATE_STATUS_INVALID" });
    }
    try {
      return res.json(await acknowledgeRunnerUpdate({
        runnerId: req.params.runnerId,
        commandId: req.params.commandId,
        status: status as (typeof runnerUpdateStatuses)[number],
        phase: typeof req.body?.phase === "string" ? req.body.phase : undefined,
        errorCode: typeof req.body?.errorCode === "string" ? req.body.errorCode : null,
        errorMessage: typeof req.body?.errorMessage === "string" ? req.body.errorMessage : null,
      }));
    } catch (error) {
      return sendError(res, error);
    }
  });
}

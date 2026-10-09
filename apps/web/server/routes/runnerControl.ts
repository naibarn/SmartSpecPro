import type { Express, Request, Response } from "express";
import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { z } from "zod";
import { WebSocketServer, type WebSocket } from "ws";

import {
  createRunnerControlToken,
  createRunnerRegistrationToken,
  extractRunnerBearerToken,
  extractRunnerDeviceProofFromRequest,
  issueRunnerAccessTokens,
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
  type RunnerGatewayNode,
} from "../services/runnerGateway";
import {
  EphemeralAuthorizationStoreError,
  ephemeralAuthorizationSessionStore,
} from "../services/ephemeralAuthorizationSessionStore";
import { enforceJsonBodyMaxBytes, rateLimit } from "../_core/limits";
import { auditLogger } from "../services/auditLogger";
import {
  compareCachedInternalToken,
  getCachedRunnerControlPlaneOrigin,
} from "../services/appRuntimeConfig";
import { createJobControlPlane } from "../services/jobControlPlane";
import { recordSpec224RunnerDispatchDenied } from "../services/spec224AdmissionAudit";
import { dispatchWithPersistedSpec224RunnerStart } from "../services/spec224RuntimeAdmission";
import {
  CONNECT_SCHEMA_REVISION,
  RUNNER_CONTRACT_VERSION,
  RunnerCompatibilityError,
  getRunnerCompatibilityMetadata,
  negotiateRunnerCompatibility,
  normalizeControlPlaneOrigin,
  validateRunnerCapabilitySnapshot,
  validateRunnerProtocolEnvelope,
  type RunnerJobCommand,
  type RunnerJobReceipt,
  type RunnerProtocolEnvelope,
} from "../services/runnerContracts";
import {
  acceptRunnerJobReceiptDurably,
  assertRunnerExecutionEligibility,
  shouldDeferRunnerExecutionCompletion,
  validateRunnerJobCommand,
  validateRunnerJobReceipt,
  type RunnerReceiptState,
} from "../services/runnerJobCommandContracts";
import { handleSemanticRunnerReceipt } from "../services/computerUseSemanticHandshakeRuntime";
import {
  SEMANTIC_ACTION_STAGE,
  SEMANTIC_OBSERVE_STAGE,
  SEMANTIC_POST_ACTION_OBSERVE_STAGE,
} from "../services/computerUseSemanticHandshake";
import {
  acknowledgeRunnerUpdate,
  claimNextRunnerUpdate,
  getRunnerUpdateStatus,
  requestRunnerUpdate,
  RunnerUpdateError,
  runnerUpdateStatuses,
} from "../services/runnerUpdateService";
import {
  RunnerSessionController,
  RunnerSessionError,
} from "../services/runnerSessionContracts";
import {
  defaultSpec224RunnerInputStagingService,
  Spec224RunnerInputStagingError,
} from "../services/spec224RunnerInputStaging";
import {
  projectRunnerReceiptToExecutionSession,
  recordRunnerSessionInventory,
} from "../services/runnerExecutionSessionService";

let runnerWss: WebSocketServer | null = null;
export const runnerSessionController = new RunnerSessionController();

type ActiveRunnerChannel = {
  ws: WebSocket;
  token: string;
  runnerId: string;
  tenantId: string;
  runnerSessionId: string | null;
  controlPlaneOrigin: string;
  nextServerSequence: number;
  sentCommands: Map<string, RunnerCommandCacheEntry>;
  receiptStates: Map<string, RunnerReceiptState>;
};

type RunnerCommandCacheEntry = {
  fingerprint: string;
  state: "dispatching" | "sent" | "unknown";
};

type RunnerSocketAuthContext = {
  token: string;
  runnerId: string;
  tenantId: string;
  runnerSessionId: string | null;
  controlPlaneOrigin: string;
  deviceProofVerified: boolean;
};

const activeRunnerChannels = new Map<string, ActiveRunnerChannel>();

type PendingSpec224InputGrant = {
  runnerId: string;
  tenantId: string;
  runnerSessionId: string;
  jobId: string;
  attempt: number;
  leaseId: string;
  fencingToken: number;
  inputRef: string;
  inputFetchGrant: string;
};

/**
 * Process-memory bridge between the durable input binding and the protected
 * command dispatch. The raw credential never enters a job record or command.
 */
const pendingSpec224InputGrants = new Map<string, PendingSpec224InputGrant>();

export function requestControlPlaneOrigin(_req: IncomingMessage): string {
  try {
    const configuredOrigin = getCachedRunnerControlPlaneOrigin();
    if (!configuredOrigin)
      throw new Error("runner control-plane origin is not configured");
    return normalizeControlPlaneOrigin(configuredOrigin);
  } catch {
    throw new RunnerAuthError(
      "RUNNER_CONTROL_PLANE_MISMATCH",
      409,
      "Runner control-plane origin is not configured or invalid"
    );
  }
}

/**
 * Internal dispatch may arrive through localhost or a private service name,
 * but the command identity must match the public origin used by the Runner
 * WSS session and capability snapshot.
 */
export function validateRunnerCommandControlPlaneOrigin(
  commandOrigin: unknown,
  configuredOrigin: unknown = getCachedRunnerControlPlaneOrigin()
): string {
  try {
    const normalizedCommandOrigin = normalizeControlPlaneOrigin(commandOrigin);
    const normalizedConfiguredOrigin =
      normalizeControlPlaneOrigin(configuredOrigin);
    if (normalizedCommandOrigin !== normalizedConfiguredOrigin)
      throw new Error("origin mismatch");
    return normalizedCommandOrigin;
  } catch {
    throw new RunnerAuthError(
      "RUNNER_CONTROL_PLANE_MISMATCH",
      409,
      "Runner command control-plane origin does not match the configured public origin"
    );
  }
}

function hashPairingNonce(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}

function runnerSourceBuildIdentity(payload: z.infer<typeof runnerSetupSchema>) {
  const runnerVersion = payload.runnerVersion ?? "unknown";
  return {
    source: "smartaihub-runner",
    runnerVersion,
    controlPlaneContractVersion: RUNNER_CONTRACT_VERSION,
    connectSchemaRevision: CONNECT_SCHEMA_REVISION,
    buildIdentity: `runner:${runnerVersion}:${RUNNER_CONTRACT_VERSION}:${CONNECT_SCHEMA_REVISION}`,
  };
}

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
  payload: Record<string, unknown>,
  callback?: (error?: Error) => void
): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(payload), callback);
  else callback?.(new Error("runner_websocket_not_open"));
}

export function sendRunnerSocketAndWait(
  ws: WebSocket,
  payload: Record<string, unknown>,
  timeoutMs?: number
): Promise<void> {
  if (timeoutMs === undefined) {
    return new Promise((resolve, reject) =>
      sendRunnerSocket(ws, payload, error =>
        error ? reject(error) : resolve()
      )
    );
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      const error = new Error("runner_websocket_send_timeout");
      Object.assign(error, { code: "runner_websocket_send_timeout" });
      reject(error);
    }, timeoutMs);
    sendRunnerSocket(ws, payload, error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve();
    });
  });
}

export function resolveRunnerCommandCache(
  cache: Map<string, RunnerCommandCacheEntry>,
  commandId: string,
  fingerprint: string
): { commandId: string } | null {
  const direct = cache.get(commandId);
  if (direct && direct.fingerprint !== fingerprint) {
    throw new RunnerAuthError(
      "runner_command_replay",
      409,
      "Runner command identity was replayed with different data"
    );
  }
  const match: [string, RunnerCommandCacheEntry] | undefined = direct
    ? [commandId, direct]
    : [...cache.entries()].find(
        ([, entry]) => entry.fingerprint === fingerprint
      );
  if (!match) return null;
  if (match[1].state !== "sent") {
    throw new RunnerAuthError(
      "SPEC224_RUNNER_DISPATCH_OUTCOME_UNKNOWN",
      409,
      "Runner command delivery is in progress or has an unknown outcome"
    );
  }
  return { commandId: match[0] };
}

export function reserveRunnerCommandDispatch(
  cache: Map<string, RunnerCommandCacheEntry>,
  commandId: string,
  fingerprint: string
): { commandId: string } | null {
  const existing = resolveRunnerCommandCache(cache, commandId, fingerprint);
  if (existing) return existing;
  cache.set(commandId, { fingerprint, state: "dispatching" });
  return null;
}

const PROTECTED_RUNNER_SEND_TIMEOUT_MS = 5_000;

type RunnerReceiptTestHooks = {
  afterChannelAuthenticated?: (
    controlPlaneOrigin: string,
    ws: WebSocket
  ) => void;
  afterReceiptPersisted?: (
    receiptEventId: string,
    ws: WebSocket
  ) => Promise<void>;
  afterAckWritten?: (receiptEventId: string) => Promise<void>;
};

/**
 * Receipt senders wait synchronously for this acknowledgement before they can
 * read the next server command. Keep the acknowledgement ahead of any
 * semantic follow-up dispatch on the same WSS channel.
 */
export async function sendRunnerReceiptAckBeforeProcessing(input: {
  ws: WebSocket;
  ack: Record<string, unknown>;
  process: () => Promise<void>;
}): Promise<void> {
  sendRunnerSocket(input.ws, input.ack);
  await input.process();
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

function assertRunnerCapabilitySessionBinding(
  auth: {
    runnerId: string;
    tenantId?: string | null;
    profile: string;
    runnerSessionId?: string | null;
  },
  snapshot: Parameters<typeof validateRunnerCapabilitySnapshot>[0]
): void {
  if (auth.profile !== "local_device") return;
  if (!auth.tenantId || snapshot.tenantId !== auth.tenantId)
    throw new RunnerAuthError(
      "runner_tenant_mismatch",
      403,
      "Local Runner capability snapshot is not bound to the authenticated tenant"
    );
  if (
    !auth.runnerSessionId ||
    snapshot.runnerSessionId !== auth.runnerSessionId
  )
    throw new RunnerAuthError(
      "runner_session_mismatch",
      403,
      "Local Runner capability snapshot is not bound to the authenticated session"
    );
  const browser = snapshot.computerUse?.browser;
  if (browser?.availabilityState === "available") {
    const manifest = browser.manifest;
    if (
      !snapshot.capabilitySnapshotId ||
      !manifest ||
      manifest.runnerSessionId !== auth.runnerSessionId ||
      manifest.capabilitySnapshotId !== snapshot.capabilitySnapshotId
    )
      throw new RunnerAuthError(
        "runner_capability_binding_invalid",
        403,
        "Ready browser capability is missing its session and snapshot binding"
      );
  }
}

function markRunnerCapabilityReady(
  auth: { profile: string; runnerSessionId?: string | null },
  snapshot: Parameters<typeof validateRunnerCapabilitySnapshot>[0]
): void {
  if (auth.profile !== "local_device" || !auth.runnerSessionId) return;
  const browser = snapshot.computerUse?.browser;
  if (
    browser?.availabilityState !== "available" ||
    browser.probeState !== "ready"
  )
    return;
  if (!snapshot.capabilitySnapshotId)
    throw new RunnerAuthError(
      "runner_capability_binding_invalid",
      403,
      "Capability snapshot identity is required"
    );
  try {
    runnerSessionController.publishCapability({
      runnerSessionId: auth.runnerSessionId,
      probeState: "ready",
      capabilitySnapshotId: snapshot.capabilitySnapshotId,
      snapshotRevision: snapshot.revision,
    });
  } catch (error) {
    if (error instanceof RunnerSessionError)
      throw new RunnerAuthError("runner_capability_not_ready", 409, error.code);
    throw error;
  }
}

async function authorizeRunnerSession(
  auth: { profile: string; runnerSessionId?: string | null },
  deviceProofVerified: boolean,
  gateway: RunnerGateway,
  identity?: {
    runnerId: string;
    tenantId: string;
    deviceId: string | null;
    ownerUserId: number | null;
  }
): Promise<void> {
  if (!auth.runnerSessionId) return;
  await gateway.getStatus(auth);
  try {
    runnerSessionController.authorize({
      runnerSessionId: auth.runnerSessionId,
      deviceProofVerified:
        auth.profile !== "local_device" || deviceProofVerified,
    });
  } catch (error) {
    if (
      error instanceof RunnerSessionError &&
      (error.code === "CHALLENGE_INVALID" || error.code === "SESSION_EXPIRED") &&
      identity
    ) {
      runnerSessionController.restoreAuthorized({
        runnerSessionId: auth.runnerSessionId,
        runnerId: identity.runnerId,
        tenantId: identity.tenantId,
        deviceId: identity.deviceId ?? identity.runnerId,
        ownerUserId: identity.ownerUserId,
      });
      return;
    }
    if (error instanceof RunnerSessionError)
      throw new RunnerAuthError("runner_session_invalid", 403, error.code);
    throw error;
  }
}

/** Handles the authenticated WSS fast path. HTTPS routes remain the durable fallback. */
export function handleRunnerUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  gateway: RunnerGateway = defaultRunnerGateway,
  testHooks?: RunnerReceiptTestHooks
): void {
  if (testHooks && process.env.NODE_ENV !== "test")
    throw new Error("runner receipt test hooks require NODE_ENV=test");
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
    void handleRunnerSocket(ws, req, runnerId, gateway, testHooks);
  });
}

async function handleRunnerSocket(
  ws: WebSocket,
  req: IncomingMessage,
  runnerId: string,
  gateway: RunnerGateway,
  testHooks?: RunnerReceiptTestHooks
): Promise<void> {
  let controlPlaneOrigin: string;
  try {
    controlPlaneOrigin = requestControlPlaneOrigin(req);
  } catch {
    ws.close(1008, "runner_control_plane_invalid");
    return;
  }
  const token = extractRunnerBearerToken({ headers: req.headers });
  if (!token) {
    ws.close(1008, "runner_auth_required");
    return;
  }
  let initialAuth: Awaited<ReturnType<typeof verifyRunnerControlToken>>;
  const initialDeviceProof = extractRunnerDeviceProofFromRequest(
    runnerRequestShape(req)
  );
  try {
    initialAuth = await verifyRunnerControlToken(token, {
      runnerId,
      requiredScopes: ["runner:status"],
      requestProof: initialDeviceProof,
    });
    const node = await gateway.getStatus(initialAuth);
    if (node.revokedAt || node.trustState === "revoked")
      throw new RunnerAuthError("runner_revoked", 403, "Runner is revoked");
  } catch {
    ws.close(1008, "runner_auth_invalid");
    return;
  }
  const previous = activeRunnerChannels.get(runnerId);
  if (previous && previous.ws !== ws) {
    previous.ws.close(4001, "runner_reconnected");
  }
  const channel: ActiveRunnerChannel = {
    ws,
    token,
    runnerId,
    tenantId: initialAuth.tenantId,
    runnerSessionId: initialAuth.runnerSessionId ?? null,
    controlPlaneOrigin,
    nextServerSequence: 0,
    sentCommands: new Map(),
    receiptStates: new Map(),
  };
  activeRunnerChannels.set(runnerId, channel);
  testHooks?.afterChannelAuthenticated?.(controlPlaneOrigin, ws);
  const socketAuthContext: RunnerSocketAuthContext = {
    token,
    runnerId,
    tenantId: initialAuth.tenantId,
    runnerSessionId: initialAuth.runnerSessionId ?? null,
    controlPlaneOrigin,
    deviceProofVerified: Boolean(initialDeviceProof),
  };
  ws.on("close", () => {
    if (activeRunnerChannels.get(runnerId)?.ws === ws)
      activeRunnerChannels.delete(runnerId);
  });
  ws.on("message", raw => {
    void handleRunnerSocketMessage(
      ws,
      socketAuthContext,
      raw,
      gateway,
      testHooks
    );
  });
  sendRunnerSocket(ws, {
    ackState: "accepted",
    type: "runner.handshake",
    runnerId,
  });
}

function runnerCapabilityEligibility(
  node: RunnerGatewayNode,
  command: RunnerJobCommand
) {
  const snapshot = node.currentSnapshot;
  const browser = snapshot?.computerUse?.browser;
  const manifest = browser?.manifest;
  const externalAgentTool = (snapshot?.toolInventory ?? []).find(
    tool =>
      tool.adapterId === command.adapterId &&
      (command.executionKind !== "external_agent_task" ||
        tool.adapterId === "codex.v1" ||
        tool.adapterId === "claude.v1")
  );
  return {
    runner: {
      runnerId: node.runnerId,
      tenantId: node.tenantId,
      trustState: node.trustState,
      status: node.status,
      activeSessionId: node.activeSessionId,
      revokedAt: node.revokedAt,
    },
    capability: {
      runnerSessionId: snapshot?.runnerSessionId,
      tenantId: snapshot?.tenantId,
      capabilitySnapshotId: snapshot?.capabilitySnapshotId,
      controlPlaneOrigin: snapshot?.controlPlaneOrigin,
      revision: snapshot?.revision ?? "",
      observedAt: snapshot?.observedAt ?? "",
      expiresAt: snapshot?.expiresAt ?? "",
      browserReady:
        browser?.availabilityState === "available" &&
        browser.authState === "authenticated" &&
        browser.probeState === "ready" &&
        manifest?.supports.structuredObservation === true,
      externalAgentAdapters: (snapshot?.toolInventory ?? [])
        .filter(
          tool =>
            (tool.adapterId === "codex.v1" || tool.adapterId === "claude.v1") &&
            tool.trustState === "ready" &&
            (tool.availabilityState === "available" ||
              tool.availabilityState === "busy") &&
            (tool.authState === "authenticated" ||
              tool.authState === "not_required") &&
            tool.healthState === "healthy" &&
            tool.installState === "installed" &&
            tool.configurationState === "configured"
        )
        .map(tool => tool.adapterId as string),
      authorizationEvidenceRef:
        command.executionKind === "external_agent_task"
          ? externalAgentTool?.authorizationEvidenceRef
          : manifest?.authorizationEvidenceRef,
    },
    command,
  };
}

/**
 * Runner commands are a second dispatch boundary. Until the canonical runtime
 * admission proof is represented in this command contract, a protected
 * DevelopmentRun may not be dispatched through this internal route directly.
 * Cancellation remains available as a containment operation.
 */
export function assertSpec224RunnerCommandAdmissionBoundary(input: {
  commandType: RunnerJobCommand["commandType"];
  requiresSpec224Admission: boolean;
  persistedStartProofValid?: boolean;
}): void {
  if (
    input.commandType === "execute" &&
    input.requiresSpec224Admission &&
    input.persistedStartProofValid !== true
  ) {
    throw new RunnerAuthError(
      "DENIED_CANONICAL_START_NOT_COMMITTED",
      403,
      "Protected DevelopmentRun dispatch requires a durable canonical execution-start"
    );
  }
}

/** Sends a typed generic command over the already authenticated Runner WSS. */
export async function dispatchRunnerJobCommand(
  rawCommand: RunnerJobCommand,
  gateway: RunnerGateway = defaultRunnerGateway
): Promise<{
  status: "accepted" | "duplicate";
  commandId: string;
  runnerId: string;
  runnerSessionId: string;
}> {
  const command = validateRunnerJobCommand(rawCommand);
  const nodeBeforeChannel = await gateway.getNode(
    command.runnerId,
    command.tenantId
  );
  if (
    !nodeBeforeChannel?.currentSnapshot?.controlPlaneOrigin ||
    nodeBeforeChannel.currentSnapshot.controlPlaneOrigin !==
      command.controlPlaneOrigin
  ) {
    throw new RunnerAuthError(
      "RUNNER_CONTROL_PLANE_MISMATCH",
      409,
      "Runner capability snapshot belongs to a different control plane"
    );
  }
  const channel = activeRunnerChannels.get(command.runnerId);
  if (!channel || channel.ws.readyState !== 1)
    throw new RunnerAuthError(
      "runner_channel_unavailable",
      409,
      "Runner control channel is not connected"
    );
  if (
    channel.tenantId !== command.tenantId ||
    channel.runnerSessionId !== command.runnerSessionId
  )
    throw new RunnerAuthError(
      "runner_session_mismatch",
      409,
      "Runner command targets a stale session"
    );
  const auth = await verifyRunnerControlToken(channel.token, {
    runnerId: command.runnerId,
    tenantId: command.tenantId,
    requiredScopes: ["runner:status"],
  });
  const node = await gateway.getStatus(auth);
  if (
    node.currentSnapshot?.controlPlaneOrigin !== channel.controlPlaneOrigin ||
    channel.controlPlaneOrigin !== command.controlPlaneOrigin
  ) {
    throw new RunnerAuthError(
      "RUNNER_CONTROL_PLANE_MISMATCH",
      409,
      "Runner command, capability snapshot and channel control plane differ"
    );
  }
  if (!node)
    throw new RunnerAuthError(
      "runner_not_found",
      404,
      "Runner is not registered"
    );
  const eligibility = runnerCapabilityEligibility(node, command);
  assertRunnerExecutionEligibility({ ...eligibility, now: new Date() });
  const controlPlane = createJobControlPlane();
  const jobStatus = await controlPlane.getStatus(command.jobId, {
    tenantId: command.tenantId,
  });
  if (
    !jobStatus ||
    jobStatus.lease.fencingVersion !== command.fencingToken ||
    jobStatus.attempt !== command.attempt ||
    !jobStatus.lease.active ||
    jobStatus.lease.stale
  )
    throw new RunnerAuthError(
      "runner_lease_stale",
      409,
      "Runner command lease fence is stale"
    );
  const jobContext = await controlPlane.getContext(command.jobId, {
    tenantId: command.tenantId,
  });
  const requiresSpec224Admission = Boolean(
    jobContext?.requiresSpec224Admission
  );
  const pendingInputGrant = pendingSpec224InputGrants.get(command.commandId);
  if (command.inputRef.startsWith("spec224-input:")) {
    const mismatch =
      !pendingInputGrant ||
      pendingInputGrant.runnerId !== command.runnerId ||
      pendingInputGrant.tenantId !== command.tenantId ||
      pendingInputGrant.runnerSessionId !== command.runnerSessionId ||
      pendingInputGrant.jobId !== command.jobId ||
      pendingInputGrant.attempt !== command.attempt ||
      pendingInputGrant.leaseId !== command.leaseId ||
      pendingInputGrant.fencingToken !== command.fencingToken ||
      pendingInputGrant.inputRef !== command.inputRef ||
      !requiresSpec224Admission;
    if (mismatch)
      throw new RunnerAuthError(
        "SPEC224_RUNNER_INPUT_GRANT_REQUIRED",
        409,
        "Staged Runner input is missing its protected ephemeral grant"
      );
  }
  if (command.commandType === "cancel") {
    const externalWait = jobStatus.progress?.externalWait;
    const metadata = externalWait?.metadata ?? {};
    const cancelMismatch = !jobStatus.errorMessage?.startsWith(
      "cancel_requested:"
    )
      ? "RUNNER_CANCEL_INTENT_MISSING"
      : externalWait?.operationKey === undefined
        ? "RUNNER_CANCEL_EXTERNAL_WAIT_MISSING"
        : metadata.commandId !== command.payload.targetCommandId
          ? "RUNNER_CANCEL_TARGET_STALE"
          : metadata.runnerId !== command.runnerId ||
              metadata.runnerSessionId !== command.runnerSessionId
            ? "RUNNER_CANCEL_SESSION_STALE"
            : metadata.capabilitySnapshotId !== command.capabilitySnapshotId ||
                metadata.capabilitySnapshotRevision !==
                  command.capabilitySnapshotRevision
              ? "RUNNER_CANCEL_CAPABILITY_STALE"
              : command.payload.cancellationOperationId !==
                  command.idempotencyKey.replace("spec224-cancel:", "")
                ? "RUNNER_CANCEL_OPERATION_MISMATCH"
                : null;
    if (cancelMismatch)
      throw new RunnerAuthError(
        cancelMismatch,
        409,
        "Runner cancellation no longer matches the canonical job intent"
      );
  }
  const fingerprint = JSON.stringify(command);
  const cached = reserveRunnerCommandDispatch(
    channel.sentCommands,
    command.commandId,
    fingerprint
  );
  if (cached) {
    return {
      status: "duplicate",
      commandId: cached.commandId,
      runnerId: command.runnerId,
      runnerSessionId: command.runnerSessionId,
    };
  }
  const sequence = channel.nextServerSequence++;
  const envelope = {
    protocolVersion: RUNNER_CONTRACT_VERSION,
    profile: auth.profile,
    nodeKind: auth.nodeKind,
    runnerId: command.runnerId,
    nodeId: command.runnerId,
    jobId: command.jobId,
    attemptId: null,
    leaseId: command.leaseId,
    fencingVersion: command.fencingToken,
    correlationId: command.commandId,
    sequence,
    idempotencyKey: command.idempotencyKey,
    payload: { type: "runner.job.command", command },
  };
  let dispatchAttempted = false;
  const dispatch = async () => {
    dispatchAttempted = true;
    if (pendingInputGrant) await deliverSpec224RunnerInputGrant(pendingInputGrant);
    await sendRunnerSocketAndWait(
      channel.ws,
      envelope,
      PROTECTED_RUNNER_SEND_TIMEOUT_MS
    );
  };
  if (command.commandType === "execute" && requiresSpec224Admission) {
    try {
      const result = await dispatchWithPersistedSpec224RunnerStart({
        tenantId: command.tenantId,
        workerJobId: command.jobId,
        command,
        dispatch,
      });
      if (!result.authorized) {
        channel.sentCommands.delete(command.commandId);
        await recordSpec224RunnerDispatchDenied({
          workerJobId: command.jobId,
          attemptId: jobStatus.lease.attemptId,
          commandId: command.commandId,
          attempt: command.attempt,
          fencingToken: command.fencingToken,
        });
        assertSpec224RunnerCommandAdmissionBoundary({
          commandType: command.commandType,
          requiresSpec224Admission,
          persistedStartProofValid: false,
        });
      }
      channel.sentCommands.set(command.commandId, {
        fingerprint,
        state: "sent",
      });
      if (pendingInputGrant) pendingSpec224InputGrants.delete(command.commandId);
    } catch (error) {
      const cachedCommand = channel.sentCommands.get(command.commandId);
      if (cachedCommand?.state === "dispatching") {
        if (dispatchAttempted) {
          channel.sentCommands.set(command.commandId, {
            ...cachedCommand,
            state: "unknown",
          });
        } else {
          channel.sentCommands.delete(command.commandId);
        }
      }
      throw error;
    }
  } else {
    assertSpec224RunnerCommandAdmissionBoundary({
      commandType: command.commandType,
      requiresSpec224Admission,
      persistedStartProofValid: false,
    });
    try {
      if (pendingInputGrant) await deliverSpec224RunnerInputGrant(pendingInputGrant);
      sendRunnerSocket(channel.ws, envelope);
      channel.sentCommands.set(command.commandId, {
        fingerprint,
        state: "sent",
      });
      if (pendingInputGrant) pendingSpec224InputGrants.delete(command.commandId);
    } catch (error) {
      channel.sentCommands.set(command.commandId, {
        fingerprint,
        state: "unknown",
      });
      throw error;
    }
  }
  return {
    status: "accepted",
    commandId: command.commandId,
    runnerId: command.runnerId,
    runnerSessionId: command.runnerSessionId,
  };
}

/**
 * Delivers the only raw input-fetch credential over the already authenticated
 * Runner socket. It is intentionally absent from RunnerJobCommand, events and
 * journals; the Runner keeps it only in RAM until materialization succeeds.
 */
export async function deliverSpec224RunnerInputGrant(input: {
  runnerId: string;
  tenantId: string;
  runnerSessionId: string;
  jobId: string;
  attempt: number;
  leaseId: string;
  fencingToken: number;
  inputRef: string;
  inputFetchGrant: string;
}): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(input.inputRef))
    throw new RunnerAuthError("SPEC224_RUNNER_INPUT_REF_INVALID", 400, "Input reference is invalid");
  if (!/^[A-Za-z0-9_-]{40,96}$/.test(input.inputFetchGrant))
    throw new RunnerAuthError("SPEC224_RUNNER_INPUT_GRANT_INVALID", 400, "Input grant is invalid");
  const channel = activeRunnerChannels.get(input.runnerId);
  if (
    !channel ||
    channel.ws.readyState !== 1 ||
    channel.tenantId !== input.tenantId ||
    channel.runnerSessionId !== input.runnerSessionId
  )
    throw new RunnerAuthError("runner_session_mismatch", 409, "Runner input grant targets a stale session");
  const auth = await verifyRunnerControlToken(channel.token, {
    runnerId: input.runnerId,
    tenantId: input.tenantId,
    runnerSessionId: input.runnerSessionId,
    requiredScopes: ["runner:status"],
  });
  const sequence = channel.nextServerSequence++;
  await sendRunnerSocketAndWait(channel.ws, {
    protocolVersion: RUNNER_CONTRACT_VERSION,
    profile: auth.profile,
    nodeKind: auth.nodeKind,
    runnerId: input.runnerId,
    nodeId: input.runnerId,
    jobId: input.jobId,
    attemptId: null,
    leaseId: input.leaseId,
    fencingVersion: input.fencingToken,
    correlationId: `spec224-input:${input.inputRef}`,
    sequence,
    idempotencyKey: `spec224-input-grant:${input.inputRef}:${input.fencingToken}`,
    payload: {
      type: "runner.spec224.input-grant",
      inputRef: input.inputRef,
      inputFetchGrant: input.inputFetchGrant,
      runnerSessionId: input.runnerSessionId,
    },
  }, PROTECTED_RUNNER_SEND_TIMEOUT_MS);
}

export function registerSpec224RunnerInputGrant(input: {
  commandId: string;
  runnerId: string;
  tenantId: string;
  runnerSessionId: string;
  jobId: string;
  attempt: number;
  leaseId: string;
  fencingToken: number;
  inputRef: string;
  inputFetchGrant: string;
}): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(input.commandId))
    throw new RunnerAuthError("SPEC224_RUNNER_INPUT_COMMAND_INVALID", 400, "Command is invalid");
  const candidate: PendingSpec224InputGrant = {
    runnerId: input.runnerId, tenantId: input.tenantId,
    runnerSessionId: input.runnerSessionId, jobId: input.jobId,
    attempt: input.attempt, leaseId: input.leaseId,
    fencingToken: input.fencingToken, inputRef: input.inputRef,
    inputFetchGrant: input.inputFetchGrant,
  };
  const existing = pendingSpec224InputGrants.get(input.commandId);
  if (existing && JSON.stringify(existing) !== JSON.stringify(candidate))
    throw new RunnerAuthError("SPEC224_RUNNER_INPUT_GRANT_CONFLICT", 409, "Input grant conflicts with pending command");
  pendingSpec224InputGrants.set(input.commandId, candidate);
}

export async function handleRunnerSocketMessage(
  ws: WebSocket,
  socketAuthContext: RunnerSocketAuthContext,
  raw: Buffer | ArrayBuffer | Buffer[],
  gateway: RunnerGateway,
  testHooks?: RunnerReceiptTestHooks
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
    if (envelope.runnerId !== socketAuthContext.runnerId)
      throw new Error("runner_scope_mismatch");
    const type = envelope.payload.type;
    if (type === "runner.capabilities.update") {
      const auth = await verifyRunnerControlToken(socketAuthContext.token, {
        runnerId: socketAuthContext.runnerId,
        tenantId: socketAuthContext.tenantId,
        requiredScopes: ["runner:capabilities"],
      });
      if ((auth.runnerSessionId ?? null) !== socketAuthContext.runnerSessionId)
        throw new RunnerAuthError(
          "runner_session_mismatch",
          403,
          "Runner WSS session context changed"
        );
      assertRunnerEnvelopeBinding(envelope, auth);
      await authorizeRunnerSession(
        auth,
        socketAuthContext.deviceProofVerified,
        gateway,
        auth
      );
      await gateway.getStatus(auth);
      const snapshot = validateRunnerCapabilitySnapshot(
        envelope.payload.snapshot as Parameters<
          typeof validateRunnerCapabilitySnapshot
        >[0]
      );
      assertRunnerCapabilitySessionBinding(auth, snapshot);
      const result = await gateway.publishCapabilities({
        auth,
        snapshot,
        idempotencyKey: envelope.idempotencyKey,
      });
      markRunnerCapabilityReady(auth, snapshot);
      sendRunnerSocket(ws, {
        ackState: result.status === "duplicate" ? "duplicate" : "applied",
        sequence: envelope.sequence,
        idempotencyKey: envelope.idempotencyKey,
      });
      return;
    }
    if (type === "runner.reconcile") {
      const auth = await verifyRunnerControlToken(socketAuthContext.token, {
        runnerId: socketAuthContext.runnerId,
        tenantId: socketAuthContext.tenantId,
        requiredScopes: ["runner:heartbeat"],
      });
      if ((auth.runnerSessionId ?? null) !== socketAuthContext.runnerSessionId)
        throw new RunnerAuthError(
          "runner_session_mismatch",
          403,
          "Runner WSS session context changed"
        );
      assertRunnerEnvelopeBinding(envelope, auth);
      await authorizeRunnerSession(
        auth,
        socketAuthContext.deviceProofVerified,
        gateway,
        auth
      );
      await gateway.heartbeat(auth);
      sendRunnerSocket(ws, {
        ackState: "applied",
        sequence: envelope.sequence,
        idempotencyKey: envelope.idempotencyKey,
      });
      return;
    }
    if (type === "runner.session.inventory") {
      const auth = await verifyRunnerControlToken(socketAuthContext.token, {
        runnerId: socketAuthContext.runnerId,
        tenantId: socketAuthContext.tenantId,
        requiredScopes: ["runner:heartbeat"],
      });
      if ((auth.runnerSessionId ?? null) !== socketAuthContext.runnerSessionId)
        throw new RunnerAuthError(
          "runner_session_mismatch",
          403,
          "Runner WSS session context changed"
        );
      assertRunnerEnvelopeBinding(envelope, auth);
      await authorizeRunnerSession(
        auth,
        socketAuthContext.deviceProofVerified,
        gateway,
        auth
      );
      if (
        !auth.runnerSessionId ||
        envelope.payload.runnerSessionId !== auth.runnerSessionId
      )
        throw new RunnerAuthError(
          "runner_session_mismatch",
          403,
          "Inventory reporter session does not match the authenticated session"
        );
      const result = await recordRunnerSessionInventory({
        tenantId: auth.tenantId,
        runnerId: auth.runnerId,
        runnerSessionId: auth.runnerSessionId,
        batchId: envelope.idempotencyKey,
        inventory: { records: envelope.payload.records },
      });
      sendRunnerSocket(ws, {
        ackState:
          result.observed === 0 && result.rejected === 0
            ? "duplicate"
            : "applied",
        sequence: envelope.sequence,
        idempotencyKey: envelope.idempotencyKey,
        observed: result.observed,
        duplicate: result.duplicate,
        rejected: result.rejected,
      });
      return;
    }
    if (type === "runner.job.receipt") {
      const auth = await verifyRunnerControlToken(socketAuthContext.token, {
        runnerId: socketAuthContext.runnerId,
        tenantId: socketAuthContext.tenantId,
        requiredScopes: ["runner:status"],
      });
      if ((auth.runnerSessionId ?? null) !== socketAuthContext.runnerSessionId)
        throw new RunnerAuthError(
          "runner_session_mismatch",
          403,
          "Runner WSS session context changed"
        );
      assertRunnerEnvelopeBinding(envelope, auth);
      const receipt = validateRunnerJobReceipt(
        envelope.payload.receipt as RunnerJobReceipt
      );
      if (
        receipt.runnerId !== socketAuthContext.runnerId ||
        receipt.runnerSessionId !== auth.runnerSessionId
      )
        throw new Error("runner_receipt_scope_mismatch");
      const channel = activeRunnerChannels.get(socketAuthContext.runnerId);
      if (
        !channel ||
        channel.ws !== ws ||
        channel.runnerSessionId !== receipt.runnerSessionId
      )
        throw new Error("runner_receipt_session_stale");
      const state = channel.receiptStates.get(receipt.commandId) ?? {
        lastSequence: 0,
        terminal: false,
      };
      const controlPlane = createJobControlPlane();
      const { persistenceDisposition: normalizedDisposition } =
        await acceptRunnerJobReceiptDurably(state, receipt, () =>
          controlPlane.recordRunnerReceipt({
            jobId: receipt.jobId,
            commandId: receipt.commandId,
            eventId: receipt.eventId,
            eventType: receipt.eventType,
            sequence: receipt.sequence,
            runnerId: receipt.runnerId,
            runnerSessionId: receipt.runnerSessionId,
            recoveryReporterSessionId:
              receipt.eventType === "UNKNOWN_OUTCOME" &&
              typeof receipt.payload?.recoveredFromRunnerSessionId === "string"
                ? auth.runnerSessionId
                : undefined,
            controlPlaneOrigin: channel.controlPlaneOrigin,
            tenantId: auth.tenantId,
            payload: {
              status: receipt.status,
              ...(receipt.resultRef ? { resultRef: receipt.resultRef } : {}),
              ...(receipt.evidenceRefs
                ? { evidenceRefs: receipt.evidenceRefs }
                : {}),
              ...(receipt.errorCode ? { errorCode: receipt.errorCode } : {}),
              ...(receipt.errorSummary
                ? { errorSummary: receipt.errorSummary }
                : {}),
              ...(receipt.correlation ?? {}),
              ...(receipt.payload ?? {}),
            },
          })
        );
      const durableReceiptAccepted =
        normalizedDisposition === "recorded" ||
        normalizedDisposition === "duplicate";
      if (durableReceiptAccepted && receipt.payload?.executionSession) {
        try {
          await projectRunnerReceiptToExecutionSession({
            tenantId: auth.tenantId,
            runnerId: auth.runnerId,
            receipt,
          });
        } catch (error) {
          // The session row is an observational projection. Never delay or
          // reject acknowledgement of the canonical durable job receipt.
          console.warn("[RunnerControl] session receipt projection failed", {
            runnerId: auth.runnerId,
            tenantId: auth.tenantId,
            reason:
              error instanceof Error &&
              /^[A-Z0-9_]{1,100}$/.test(error.message)
                ? error.message
                : "RUNNER_SESSION_PROJECTION_FAILED",
          });
        }
      }
      if (
        durableReceiptAccepted &&
        receipt.eventType === "INPUT_MATERIALIZED"
      ) {
        const inputRef = receipt.payload?.inputRef;
        const inputDigest = receipt.payload?.inputDigest;
        const totalBytes = receipt.payload?.totalBytes;
        const fileCount = receipt.payload?.fileCount;
        if (
          typeof inputRef !== "string" ||
          typeof inputDigest !== "string" ||
          !Number.isSafeInteger(totalBytes) ||
          !Number.isSafeInteger(fileCount)
        )
          throw new RunnerAuthError(
            "SPEC224_RUNNER_INPUT_RECEIPT_INVALID",
            400,
            "Runner input materialization receipt is invalid"
          );
        await defaultSpec224RunnerInputStagingService.recordInputMaterialized({
          inputRef,
          commandId: receipt.commandId,
          tenantId: auth.tenantId,
          runnerId: receipt.runnerId,
          runnerSessionId: receipt.runnerSessionId,
          inputDigest,
          totalBytes,
          fileCount,
        });
      }
      // The test-only hook is deliberately after recordRunnerReceipt resolves:
      // that promise returns only after the receipt/continuation intent commit.
      if (
        normalizedDisposition === "recorded" &&
        receipt.eventType === "EXECUTION_COMPLETED"
      ) {
        await testHooks?.afterReceiptPersisted?.(receipt.eventId, ws);
      }
      if (durableReceiptAccepted) {
        channel.receiptStates.set(receipt.commandId, state);
        const receiptJobStatus = await controlPlane.getStatus(receipt.jobId, {
          tenantId: auth.tenantId,
        });
        const operationKey =
          typeof receiptJobStatus?.progress?.externalWait?.operationKey ===
          "string"
            ? receiptJobStatus.progress.externalWait.operationKey
            : `runner-command:${receipt.commandId}`;
        if (
          durableReceiptAccepted &&
          receipt.eventType === "EXECUTION_COMPLETED"
        ) {
          const semanticStage = receipt.payload?.stage;
          const isSemanticHandshake =
            semanticStage === SEMANTIC_OBSERVE_STAGE ||
            semanticStage === SEMANTIC_ACTION_STAGE ||
            semanticStage === SEMANTIC_POST_ACTION_OBSERVE_STAGE;
          const ack = {
            ackState: "applied",
            receiptEventId: receipt.eventId,
            sequence: receipt.sequence,
          };
          if (isSemanticHandshake && normalizedDisposition === "recorded") {
            await sendRunnerReceiptAckBeforeProcessing({
              ws,
              ack,
              process: async () => {
                try {
                  await handleSemanticRunnerReceipt({
                    receipt,
                    tenantId: auth.tenantId,
                    controlPlane,
                    dispatch: command =>
                      dispatchRunnerJobCommand(command, gateway),
                  });
                } catch (error) {
                  await controlPlane.failExternalWait(
                    receipt.jobId,
                    error instanceof Error
                      ? error.message
                      : "SEMANTIC_HANDSHAKE_FAILED",
                    true,
                    new Date(),
                    `computer-use:${receipt.jobId}:${(await controlPlane.getContext(receipt.jobId, { tenantId: auth.tenantId }))?.attempt ?? 1}`
                  );
                }
              },
            });
            return;
          }
          if (shouldDeferRunnerExecutionCompletion(receipt)) {
            await controlPlane.markComputerUseVerificationPending(
              receipt.jobId,
              operationKey,
              {
                executionReceiptEventId: receipt.eventId,
                executionResultRef:
                  receipt.resultRef ?? `runner-receipt:${receipt.eventId}`,
                evidenceRefs: receipt.evidenceRefs ?? [],
                ...(receipt.payload ?? {}),
              }
            );
          } else {
            await controlPlane.completeExternal(
              receipt.jobId,
              receipt.resultRef ?? `runner-receipt:${receipt.eventId}`,
              operationKey
            );
          }
        } else if (
          durableReceiptAccepted &&
          ["EXECUTION_FAILED", "COMMAND_REJECTED", "UNKNOWN_OUTCOME"].includes(
            receipt.eventType
          )
        ) {
          await controlPlane.failExternalWait(
            receipt.jobId,
            receipt.errorCode ?? receipt.eventType,
            receipt.eventType === "UNKNOWN_OUTCOME" ||
              (receipt.payload?.cancellationOperationId !== undefined &&
                receipt.eventType === "COMMAND_REJECTED"),
            new Date(),
            operationKey
          );
        }
      }
      await sendRunnerSocketAndWait(ws, {
        ackState: durableReceiptAccepted ? "applied" : "rejected",
        receiptEventId: receipt.eventId,
        sequence: receipt.sequence,
      });
      if (
        durableReceiptAccepted &&
        receipt.eventType === "EXECUTION_COMPLETED"
      ) {
        await testHooks?.afterAckWritten?.(receipt.eventId);
      }
      return;
    }
    throw new Error("runner_event_type_not_supported");
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "unknown_runner_event_error";
    let receiptDiagnostics: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(message.toString("utf8")) as {
        payload?: { type?: unknown; receipt?: Record<string, unknown> };
      };
      if (parsed.payload?.type === "runner.job.receipt") {
        const receipt = parsed.payload.receipt ?? {};
        const resultRef = receipt.resultRef;
        const evidenceRefs = receipt.evidenceRefs;
        receiptDiagnostics = {
          resultRefType: typeof resultRef,
          resultRefLength:
            typeof resultRef === "string" ? resultRef.length : null,
          resultRefPrefix:
            typeof resultRef === "string"
              ? resultRef.split(":").slice(0, 2).join(":")
              : null,
          resultRefKeys:
            resultRef &&
            typeof resultRef === "object" &&
            !Array.isArray(resultRef)
              ? Object.keys(resultRef as Record<string, unknown>).slice(0, 8)
              : null,
          evidenceRefsType: Array.isArray(evidenceRefs)
            ? "array"
            : typeof evidenceRefs,
          evidenceRefLengths: Array.isArray(evidenceRefs)
            ? evidenceRefs
                .map(ref => (typeof ref === "string" ? ref.length : null))
                .slice(0, 8)
            : null,
        };
      }
    } catch {
      // Keep rejection handling fail-closed even if diagnostics cannot parse the frame.
    }
    console.warn("[RunnerControl] runner event rejected", {
      runnerId: socketAuthContext.runnerId,
      tenantId: socketAuthContext.tenantId,
      reason: reason.slice(0, 160),
      ...(receiptDiagnostics ? { receiptDiagnostics } : {}),
    });
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
  runnerVersion: z.string().trim().min(1).max(64).optional(),
  supportedRunnerContractVersions: z
    .array(z.string().trim().min(1).max(64))
    .max(16)
    .optional(),
  supportedConnectSchemaRevisions: z
    .array(z.string().trim().min(1).max(64))
    .max(16)
    .optional(),
});

const runnerConnectCodeSchema = z.object({
  user_code: z.string().trim().min(1).max(32).optional(),
  userCode: z.string().trim().min(1).max(32).optional(),
  device_code: z.string().trim().min(1).max(256).optional(),
  deviceCode: z.string().trim().min(1).max(256).optional(),
});

type RunnerConnectSession = {
  deviceCode: string;
  userCode: string;
  payload: z.infer<typeof runnerSetupSchema>;
  createdAt: string;
  expiresAt: string;
  status: "pending" | "approved" | "expired" | "error";
  approvedAt?: string;
  approvedByUserId?: number | null;
  tenantId?: string;
  errorMessage?: string;
  result?: { runner: RunnerGatewayNode };
  runnerSessionId?: string;
  pairingNonce?: string;
};

const RUNNER_CONNECT_TTL_SECONDS = 15 * 60;
const RUNNER_CONNECT_POLL_INTERVAL_SECONDS = 3;

function publicBaseUrl(req: Request): string {
  const configured = String(
    process.env.PUBLIC_APP_URL || process.env.APP_URL || ""
  )
    .trim()
    .replace(/\/$/, "");
  if (configured) return configured;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    ?.trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    ?.trim();
  const proto = forwardedProto || req.protocol || "https";
  const host = forwardedHost || String(req.get("host") || "localhost");
  return `${proto}://${host}`;
}

function randomRunnerUserCode(): string {
  return randomUUID()
    .replace(/[^A-Z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase();
}

async function saveRunnerConnectSession(
  session: RunnerConnectSession
): Promise<void> {
  const ttl = Math.max(
    1,
    Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
  );
  await ephemeralAuthorizationSessionStore.save(session, ttl);
}

async function getRunnerConnectSessionByDevice(
  deviceCode: string
): Promise<RunnerConnectSession | null> {
  return ephemeralAuthorizationSessionStore.getByDeviceCode<RunnerConnectSession>(
    deviceCode
  );
}

async function getRunnerConnectSessionByUser(
  userCode: string
): Promise<RunnerConnectSession | null> {
  return ephemeralAuthorizationSessionStore.getByUserCode<RunnerConnectSession>(
    userCode
  );
}

function runnerConnectExpired(session: RunnerConnectSession): boolean {
  return new Date(session.expiresAt).getTime() <= Date.now();
}

function normalizeRunnerUserCode(input: unknown): string {
  const parsed = runnerConnectCodeSchema.parse(input ?? {});
  const code = (parsed.user_code ?? parsed.userCode ?? "").trim().toUpperCase();
  if (!code)
    throw new RunnerAuthError(
      "runner_connect_missing_code",
      400,
      "Missing runner approval code"
    );
  return code;
}

function normalizeRunnerDeviceCode(input: unknown): string {
  const parsed = runnerConnectCodeSchema.parse(input ?? {});
  const code = parsed.device_code ?? parsed.deviceCode ?? "";
  if (!code)
    throw new RunnerAuthError(
      "runner_connect_missing_code",
      400,
      "Missing runner device code"
    );
  return code;
}

function runnerBrowserSessionPayload(session: RunnerConnectSession) {
  return {
    status: session.status,
    userCode: session.userCode,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    pairingState: session.status === "approved" ? "paired" : "connected",
    runnerSessionId: session.runnerSessionId ?? null,
    request: {
      displayName: session.payload.displayName,
      deviceId: session.payload.deviceId,
    },
    runner: session.result
      ? {
          id: session.result.runner.runnerId,
          displayName: session.result.runner.displayName,
          profile: session.result.runner.profile,
          nodeKind: session.result.runner.nodeKind,
          deviceId: session.result.runner.deviceId,
        }
      : null,
    errorMessage: session.errorMessage ?? null,
  };
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof Spec224RunnerInputStagingError) {
    const statusCode = /NOT_FOUND$/.test(error.code)
      ? 404
      : /STALE|CONFLICT|REPLAYED$/.test(error.code)
        ? 409
        : 400;
    res.status(statusCode).json({ error: error.code });
    return;
  }
  if (error instanceof RunnerCompatibilityError) {
    res.status(409).json({
      error: error.code,
      compatibility: getRunnerCompatibilityMetadata(),
    });
    return;
  }
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
  if (error instanceof EphemeralAuthorizationStoreError) {
    res.status(503).json({ error: error.code });
    return;
  }
  res.status(400).json({ error: "RUNNER_REQUEST_INVALID" });
}

async function authenticate(
  req: Request,
  res: Response,
  runnerId: string,
  requiredScope: string,
  gateway: RunnerGateway = defaultRunnerGateway
) {
  const token = extractRunnerBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "RUNNER_AUTH_REQUIRED" });
    return null;
  }
  try {
    const auth = await verifyRunnerControlToken(token, {
      runnerId,
      requiredScopes: [requiredScope],
      requestProof: extractRunnerDeviceProofFromRequest(req),
    });
    await authorizeRunnerSession(
      auth,
      Boolean(extractRunnerDeviceProofFromRequest(req)),
      gateway,
      auth
    );
    return auth;
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
  app.post(
    "/api/internal/runners/:runnerId/job-command",
    enforceJsonBodyMaxBytes(96 * 1024),
    async (req, res) => {
      if (!compareCachedInternalToken(req.header("x-internal-token"))) {
        return res.status(401).json({ error: "RUNNER_INTERNAL_AUTH_REQUIRED" });
      }
      if (req.params.runnerId !== String(req.body?.runnerId ?? "")) {
        return res.status(400).json({ error: "RUNNER_COMMAND_SCOPE_MISMATCH" });
      }
      const body = req.body as Record<string, unknown>;
      const inputFetchGrant = body.spec224InputFetchGrant;
      const rawCommand = { ...body };
      delete rawCommand.spec224InputFetchGrant;
      let registeredInputCommandId: string | null = null;
      try {
        const command = validateRunnerJobCommand(rawCommand);
        if (command.inputRef.startsWith("spec224-input:")) {
          if (typeof inputFetchGrant !== "string")
            throw new RunnerAuthError("SPEC224_RUNNER_INPUT_GRANT_REQUIRED", 400, "Input fetch grant is required");
          registerSpec224RunnerInputGrant({
            commandId: command.commandId,
            runnerId: command.runnerId,
            tenantId: command.tenantId,
            runnerSessionId: command.runnerSessionId,
            jobId: command.jobId,
            attempt: command.attempt,
            leaseId: command.leaseId,
            fencingToken: command.fencingToken,
            inputRef: command.inputRef,
            inputFetchGrant,
          });
          registeredInputCommandId = command.commandId;
        } else if (inputFetchGrant !== undefined) {
          throw new RunnerAuthError("SPEC224_RUNNER_INPUT_GRANT_UNEXPECTED", 400, "Input fetch grant is not valid for this command");
        }
        validateRunnerCommandControlPlaneOrigin(command.controlPlaneOrigin);
        const result = await dispatchRunnerJobCommand(
          command,
          gateway
        );
        return res.json(result);
      } catch (error) {
        return sendError(res, error);
      } finally {
        if (registeredInputCommandId)
          pendingSpec224InputGrants.delete(registeredInputCommandId);
      }
    }
  );

  app.get(
    "/api/runners/:runnerId/spec224-inputs/:inputRef",
    async (req, res) => {
      const inputFetchGrant = String(req.header("x-spec224-input-grant") ?? "");
      const runnerSessionId = String(req.header("x-spec224-runner-session-id") ?? "");
      const authorizationGrantRef = String(req.header("x-spec224-authorization-grant-ref") ?? "");
      try {
        const staged =
          await defaultSpec224RunnerInputStagingService.getRunnerInputForMaterialization({
            inputRef: req.params.inputRef,
            runnerId: req.params.runnerId,
            runnerSessionId,
            authorizationGrantRef,
            inputFetchGrant,
            // The opaque grant was delivered only over the authenticated WSS
            // session; tenant identity remains server-side on the staged row.
            tenantId: String(req.header("x-spec224-tenant-id") ?? ""),
          });
        res.setHeader("cache-control", "no-store");
        return res.json({
          inputRef: staged.inputRef,
          workerJobId: staged.workerJobId,
          commandId: staged.commandId,
          attemptId: staged.attemptId,
          attempt: staged.attempt,
          leaseId: staged.leaseId,
          fencingToken: staged.fencingToken,
          tenantId: staged.tenantId,
          runnerId: staged.runnerId,
          runnerSessionId: staged.runnerSessionId,
          authorizationGrantRef: staged.authorizationGrantRef,
          workspaceRef: staged.workspaceRef,
          inputDigest: staged.inputDigest,
          totalBytes: staged.totalBytes,
          files: staged.files.map(file => ({
            path: file.path,
            digest: file.digest,
            bytes: file.bytes,
            contentBase64: file.contentBase64,
          })),
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  app.get("/api/runners", async (req, res) => {
    const browserAuth = await authorizeRequest(req, {
      allowBearer: false,
      allowSession: true,
    });
    if (!browserAuth.ok || browserAuth.mode !== "session") {
      return res.status(401).json({ error: "RUNNER_LIST_AUTH_REQUIRED" });
    }
    const tenantId = String(
      browserAuth.tenantId ?? browserAuth.user?.currentTenantId ?? ""
    ).trim();
    if (!tenantId)
      return res.status(400).json({ error: "RUNNER_LIST_TENANT_REQUIRED" });
    try {
      const rows = await getDb()
        .select()
        .from(runnerNodes)
        .where(eq(runnerNodes.tenantId, tenantId));
      return res.json({
        runners: rows.map(row => {
          const toolInventory = Array.isArray(
            row.currentSnapshotJson?.toolInventory
          )
            ? row.currentSnapshotJson.toolInventory
            : [];
          const capabilityInventory = Array.isArray(
            row.currentSnapshotJson?.capabilityInventory
          )
            ? row.currentSnapshotJson.capabilityInventory
            : [];
          return {
            runnerId: row.runnerId,
            deviceId: row.deviceId,
            machineFingerprintHash:
              typeof row.currentSnapshotJson?._machineFingerprintHash === "string"
                ? row.currentSnapshotJson._machineFingerprintHash
                : null,
            displayName: row.displayName,
            profile: row.profile,
            nodeKind: row.nodeKind,
            status: row.status,
            trustState: row.trustState,
            lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
            runnerVersion:
              typeof row.currentSnapshotJson?.runnerVersion === "string"
                ? row.currentSnapshotJson.runnerVersion
                : null,
            platform: row.currentSnapshotJson?.platform ?? null,
            toolInventory: toolInventory.map(item => {
              const tool = item && typeof item === "object" ? item as Record<string, unknown> : {};
              return {
                toolId: typeof tool.toolId === "string" ? tool.toolId : "unknown",
                displayName: typeof tool.displayName === "string" ? tool.displayName : String(tool.toolId ?? "Unknown tool"),
                version: typeof tool.version === "string" ? tool.version : null,
                availabilityState: typeof tool.availabilityState === "string" ? tool.availabilityState : "unknown",
                trustState: typeof tool.trustState === "string" ? tool.trustState : "unknown",
                reasonCodes: Array.isArray(tool.reasonCodes) ? tool.reasonCodes.filter((code): code is string => typeof code === "string") : [],
              };
            }),
            toolCount: toolInventory.length,
            readyToolCount: toolInventory.filter(
              item =>
                item &&
                typeof item === "object" &&
                String((item as Record<string, unknown>).trustState ?? "") === "ready" &&
                String((item as Record<string, unknown>).availabilityState ?? "") === "available"
            ).length,
            capabilityCount: capabilityInventory.length,
            readyCapabilityCount: capabilityInventory.filter(
              item =>
                item &&
                typeof item === "object" &&
                String(
                  (item as Record<string, unknown>).policyDecision ?? ""
                ) === "allowed"
            ).length,
          };
        }),
      });
    } catch (error) {
      return sendError(res, error);
    }
  });

  const runnerConnectLimiter = rateLimit("runner-connect", { rpm: 60 });

  app.post(
    "/api/runners/connect/start",
    runnerConnectLimiter,
    enforceJsonBodyMaxBytes(96 * 1024),
    async (req, res) => {
      try {
        const payload = runnerSetupSchema.parse(req.body ?? {});
        const compatibility = negotiateRunnerCompatibility(payload);
        if (!compatibility.compatible) {
          throw new RunnerCompatibilityError(
            compatibility.code,
            compatibility.reason
          );
        }
        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + RUNNER_CONNECT_TTL_SECONDS * 1000
        );
        const deviceCode = `runner-${randomUUID()}`;
        let userCode = randomRunnerUserCode();
        for (
          let attempt = 0;
          attempt < 5 && (await getRunnerConnectSessionByUser(userCode));
          attempt += 1
        ) {
          userCode = randomRunnerUserCode();
        }
        const session: RunnerConnectSession = {
          deviceCode,
          userCode,
          payload: {
            ...payload,
            runnerId: payload.runnerId ?? `runner-${randomUUID()}`,
          },
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          status: "pending",
        };
        const pairing = runnerSessionController.start({
          runnerId: session.payload.runnerId!,
          tenantId: "pending",
          deviceId: session.payload.deviceId,
          ownerUserId: null,
          ttlMs: RUNNER_CONNECT_TTL_SECONDS * 1000,
        });
        session.runnerSessionId = pairing.runnerSessionId;
        session.pairingNonce = pairing.nonce;
        await saveRunnerConnectSession(session);
        auditLogger.log({
          eventType: "runner_pairing_started",
          userId: null,
          metadata: {
            runnerId: session.payload.runnerId,
            deviceId: session.payload.deviceId,
            runnerSessionId: pairing.runnerSessionId,
            pairingChallengeId: pairing.runnerSessionId,
            nonceHash: hashPairingNonce(pairing.nonce),
            issuedAt: session.createdAt,
            expiresAt: session.expiresAt,
            sourceBuildIdentity: runnerSourceBuildIdentity(session.payload),
          },
        });
        const verificationUri = `${publicBaseUrl(req)}/runners/connect`;
        return res.status(201).json({
          deviceCode,
          runnerId: session.payload.runnerId,
          userCode,
          verificationUri,
          verificationUriComplete: `${verificationUri}?code=${encodeURIComponent(userCode)}`,
          expiresIn: RUNNER_CONNECT_TTL_SECONDS,
          interval: RUNNER_CONNECT_POLL_INTERVAL_SECONDS,
          pairingNonce: pairing.nonce,
          runnerSessionId: pairing.runnerSessionId,
          ...getRunnerCompatibilityMetadata(),
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  app.get(
    "/api/runners/connect/status",
    runnerConnectLimiter,
    async (req, res) => {
      try {
        const userCode = normalizeRunnerUserCode(req.query);
        const session = await getRunnerConnectSessionByUser(userCode);
        if (!session)
          return res.status(404).json({ error: "runner_connect_not_found" });
        return res.json({ session: runnerBrowserSessionPayload(session) });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

  app.post(
    "/api/runners/connect/approve",
    runnerConnectLimiter,
    enforceJsonBodyMaxBytes(8 * 1024),
    async (req, res) => {
      let session: RunnerConnectSession | null = null;
      try {
        const userCode = normalizeRunnerUserCode(req.body);
        session = await getRunnerConnectSessionByUser(userCode);
        if (!session)
          return res.status(404).json({ error: "runner_connect_not_found" });
        if (runnerConnectExpired(session)) {
          session.status = "expired";
          await saveRunnerConnectSession(session);
          return res.status(410).json({ error: "runner_connect_expired" });
        }
        if (session.status === "approved") {
          return res.json({ session: runnerBrowserSessionPayload(session) });
        }
        if (session.status !== "pending") {
          return res.status(409).json({ error: "runner_connect_not_pending" });
        }

        const auth = await authorizeRequest(req, {
          allowBearer: false,
          allowSession: true,
        });
        if (!auth.ok || auth.mode !== "session") {
          return res
            .status(401)
            .json({ error: "runner_connect_auth_required" });
        }
        const tenantId = String(
          auth.tenantId ?? auth.user?.currentTenantId ?? ""
        ).trim();
        const ownerUserId = Number(auth.userId ?? auth.user?.id ?? 0);
        if (!tenantId || !Number.isInteger(ownerUserId) || ownerUserId <= 0) {
          return res
            .status(400)
            .json({ error: "runner_connect_tenant_required" });
        }

        const deviceBinding = {
          deviceId: session.payload.deviceId,
          machineFingerprint: session.payload.machineFingerprint,
          publicKey: session.payload.publicKey,
        };
        const registrationToken = createRunnerRegistrationToken({
          runnerId: session.payload.runnerId!,
          tenantId,
          subject: `runner-connect:${tenantId}:${session.userCode}`,
          profile: "local_device",
          nodeKind: "local_device",
          deviceBinding,
          ownerUserId,
        });
        const registrationAuth =
          await verifyRunnerRegistrationToken(registrationToken);
        const runner = await gateway.enroll({
          auth: registrationAuth,
          deviceId: session.payload.deviceId,
          displayName: session.payload.displayName,
          ownerUserId,
        });
        if (!session.runnerSessionId || !session.pairingNonce)
          throw new RunnerAuthError(
            "runner_pairing_missing",
            409,
            "Runner pairing challenge is missing"
          );
        runnerSessionController.approve({
          runnerSessionId: session.runnerSessionId,
          nonce: session.pairingNonce,
          ownerUserId,
          tenantId,
        });
        await gateway.bindSession({
          runnerId: runner.runnerId,
          tenantId,
          ownerUserId,
          runnerSessionId: session.runnerSessionId,
        });
        session.status = "approved";
        session.approvedAt = new Date().toISOString();
        session.approvedByUserId = ownerUserId;
        session.tenantId = tenantId;
        session.errorMessage = undefined;
        session.result = { runner };
        await saveRunnerConnectSession(session);
        auditLogger.log({
          eventType: "runner_pairing_approved",
          userId: ownerUserId,
          tenantId,
          metadata: {
            runnerId: runner.runnerId,
            runnerSessionId: session.runnerSessionId,
            pairingChallengeId: session.runnerSessionId,
            nonceHash: hashPairingNonce(session.pairingNonce),
            issuedAt: session.createdAt,
            expiresAt: session.expiresAt,
            approvedAt: session.approvedAt,
            sourceBuildIdentity: runnerSourceBuildIdentity(session.payload),
          },
        });
        return res.json({ session: runnerBrowserSessionPayload(session) });
      } catch (error) {
        if (session) {
          session.status = "error";
          session.errorMessage =
            error instanceof Error ? error.message : "Runner approval failed";
          await saveRunnerConnectSession(session).catch(() => undefined);
        }
        return sendError(res, error);
      }
    }
  );

  app.post(
    "/api/runners/connect/token",
    runnerConnectLimiter,
    enforceJsonBodyMaxBytes(8 * 1024),
    async (req, res) => {
      try {
        const deviceCode = normalizeRunnerDeviceCode(req.body);
        const pairingNonce = String(req.body?.pairingNonce ?? "").trim();
        const session = await getRunnerConnectSessionByDevice(deviceCode);
        if (!session)
          return res.status(404).json({ error: "runner_connect_not_found" });
        if (!session.pairingNonce || pairingNonce !== session.pairingNonce)
          return res
            .status(403)
            .json({ error: "runner_pairing_challenge_invalid" });
        if (runnerConnectExpired(session) && session.status === "pending") {
          session.status = "expired";
          await saveRunnerConnectSession(session);
        }
        if (
          session.status !== "approved" ||
          !session.result ||
          !session.tenantId
        ) {
          return res.json({
            status: session.status,
            interval: RUNNER_CONNECT_POLL_INTERVAL_SECONDS,
            expiresAt: session.expiresAt,
            errorMessage: session.errorMessage ?? null,
          });
        }
        const deviceBinding = {
          deviceId: session.payload.deviceId,
          machineFingerprint: session.payload.machineFingerprint,
          publicKey: session.payload.publicKey,
        };
        const subject = `runner-connect:${session.tenantId}:${session.userCode}`;
        const controlToken = createRunnerControlToken({
          runnerId: session.result.runner.runnerId,
          tenantId: session.tenantId,
          subject,
          profile: "local_device",
          nodeKind: "local_device",
          deviceBinding,
          runnerSessionId: session.runnerSessionId,
        });
        const tokens = issueRunnerAccessTokens({
          runnerId: session.result.runner.runnerId,
          tenantId: session.tenantId,
          subject,
          profile: "local_device",
          nodeKind: "local_device",
          deviceBinding,
          runnerSessionId: session.runnerSessionId,
        });
        return res.json({
          status: "approved",
          interval: RUNNER_CONNECT_POLL_INTERVAL_SECONDS,
          expiresAt: session.expiresAt,
          runner: {
            id: session.result.runner.runnerId,
            displayName: session.result.runner.displayName,
            profile: session.result.runner.profile,
            nodeKind: session.result.runner.nodeKind,
            deviceId: session.result.runner.deviceId,
          },
          tenantId: session.tenantId,
          controlToken,
          ...tokens,
          expiresInSeconds: 900,
          runnerSessionId: session.runnerSessionId,
        });
      } catch (error) {
        return sendError(res, error);
      }
    }
  );

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
      const pairing = runnerSessionController.start({
        runnerId,
        tenantId,
        deviceId: parsed.data.deviceId,
        ownerUserId,
        ttlMs: 15 * 60 * 1000,
      });
      runnerSessionController.approve({
        runnerSessionId: pairing.runnerSessionId,
        nonce: pairing.nonce,
        ownerUserId,
        tenantId,
      });
      await gateway.bindSession({
        runnerId,
        tenantId,
        ownerUserId,
        runnerSessionId: pairing.runnerSessionId,
      });
      const controlToken = createRunnerControlToken({
        runnerId,
        tenantId,
        subject: `runner-setup:${ownerUserId}`,
        profile: "local_device",
        nodeKind: "local_device",
        deviceBinding,
        runnerSessionId: pairing.runnerSessionId,
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
        runnerSessionId: pairing.runnerSessionId,
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
      if (auth.runnerSessionId) {
        runnerSessionController.restoreAuthorized({
          runnerSessionId: auth.runnerSessionId,
          runnerId: auth.runnerId,
          tenantId: auth.tenantId,
          deviceId: auth.deviceId ?? auth.runnerId,
          ownerUserId: auth.ownerUserId,
        });
      }
      const tokens = await refreshRunnerAccessTokens(token, {
        runnerId: req.params.runnerId,
      });
      const controlToken = createRunnerControlToken({
        runnerId: auth.runnerId,
        tenantId: auth.tenantId,
        subject: auth.subject,
        profile: auth.profile,
        nodeKind: auth.nodeKind,
        runnerSessionId: auth.runnerSessionId ?? undefined,
        deviceBinding:
          auth.deviceId && auth.devicePublicKey && auth.machineFingerprintHash
            ? {
                deviceId: auth.deviceId,
                machineFingerprint: auth.machineFingerprintHash,
                publicKey: auth.devicePublicKey,
              }
            : undefined,
      });
      return res.json({
        ...tokens,
        controlToken,
        runnerSessionId: auth.runnerSessionId,
        expiresInSeconds: 900,
      });
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
      auditLogger.log({
        eventType: "runner_session_revoked",
        userId: ownerUserId,
        tenantId,
        metadata: { runnerId: node.runnerId, reason: "user_revoked_runner" },
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
            : envelope.payload.type === "runner.session.inventory"
              ? "runner:heartbeat"
              : "runner:status";
      const auth = await verifyRunnerControlToken(token, {
        runnerId: req.params.runnerId,
        requiredScopes: [scope],
        requestProof: extractRunnerDeviceProofFromRequest(req),
      });
      await authorizeRunnerSession(
        auth,
        Boolean(extractRunnerDeviceProofFromRequest(req)),
        gateway,
        auth
      );
      assertRunnerEnvelopeBinding(envelope, auth);
      if (envelope.payload.type === "runner.capabilities.update") {
        const snapshot = validateRunnerCapabilitySnapshot(
          envelope.payload.snapshot as Parameters<
            typeof validateRunnerCapabilitySnapshot
          >[0]
        );
        assertRunnerCapabilitySessionBinding(auth, snapshot);
        const result = await gateway.publishCapabilities({
          auth,
          snapshot,
          idempotencyKey: envelope.idempotencyKey,
        });
        markRunnerCapabilityReady(auth, snapshot);
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
      if (envelope.payload.type === "runner.session.inventory") {
        if (
          !auth.runnerSessionId ||
          envelope.payload.runnerSessionId !== auth.runnerSessionId
        )
          throw new RunnerAuthError(
            "runner_session_mismatch",
            403,
            "Inventory reporter session does not match the authenticated session"
          );
        const result = await recordRunnerSessionInventory({
          tenantId: auth.tenantId,
          runnerId: auth.runnerId,
          runnerSessionId: auth.runnerSessionId,
          batchId: envelope.idempotencyKey,
          inventory: { records: envelope.payload.records },
        });
        return res.json({
          ackState:
            result.observed === 0 && result.rejected === 0
              ? "duplicate"
              : "applied",
          sequence: envelope.sequence,
          idempotencyKey: envelope.idempotencyKey,
          ...result,
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
      "runner:capabilities",
      gateway
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
      assertRunnerCapabilitySessionBinding(auth, snapshot);
      const result = await gateway.publishCapabilities({
        auth,
        snapshot,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      markRunnerCapabilityReady(auth, snapshot);
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
      "runner:heartbeat",
      gateway
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
      "runner:status",
      gateway
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
        connectionState:
          auth.runnerSessionId &&
          node.currentSnapshot?.runnerSessionId === auth.runnerSessionId &&
          node.currentSnapshot?.computerUse?.browser.availabilityState ===
            "available"
            ? "capability_ready"
            : auth.runnerSessionId
              ? "authorized"
              : "paired",
        runnerSessionId: auth.runnerSessionId,
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
      browserAuth.tenantId ?? browserAuth.user?.currentTenantId ?? ""
    ).trim();
    const requestedBy = Number(browserAuth.userId ?? browserAuth.user?.id ?? 0);
    const requesterRole =
      typeof browserAuth.user?.role === "string" ? browserAuth.user.role : null;
    const releaseAssetId = Number(req.body?.releaseAssetId);
    const idempotencyKey = String(req.body?.idempotencyKey ?? "").trim();
    if (!tenantId || !Number.isInteger(requestedBy) || requestedBy <= 0) {
      return res.status(400).json({ error: "RUNNER_UPDATE_TENANT_REQUIRED" });
    }
    if (
      !Number.isInteger(releaseAssetId) ||
      releaseAssetId <= 0 ||
      !idempotencyKey ||
      idempotencyKey.length > 200
    ) {
      return res.status(400).json({ error: "RUNNER_UPDATE_REQUEST_INVALID" });
    }
    try {
      return res.status(202).json(
        await requestRunnerUpdate({
          tenantId,
          runnerId: req.params.runnerId,
          releaseAssetId,
          idempotencyKey,
          requestedBy,
          requesterRole,
        })
      );
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
      browserAuth.tenantId ?? browserAuth.user?.currentTenantId ?? ""
    ).trim();
    const requestedBy = Number(browserAuth.userId ?? browserAuth.user?.id ?? 0);
    const requesterRole =
      typeof browserAuth.user?.role === "string" ? browserAuth.user.role : null;
    try {
      return res.json(
        await getRunnerUpdateStatus({
          tenantId,
          runnerId: req.params.runnerId,
          commandId: req.params.commandId,
          requestedBy,
          requesterRole,
        })
      );
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get("/api/runners/:runnerId/update-commands/next", async (req, res) => {
    const auth = await authenticate(
      req,
      res,
      req.params.runnerId,
      "runner:update",
      gateway
    );
    if (!auth) return;
    try {
      return res.json(
        await claimNextRunnerUpdate({
          runnerId: req.params.runnerId,
          tenantId: auth.tenantId,
        })
      );
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.get(
    "/api/runners/:runnerId/update-commands/:commandId/download",
    async (req, res) => {
      const auth = await authenticate(
        req,
        res,
        req.params.runnerId,
        "runner:update",
        gateway
      );
      if (!auth) return;
      try {
        const command = await getRunnerUpdateStatus({
          tenantId: auth.tenantId,
          runnerId: req.params.runnerId,
          commandId: req.params.commandId,
        });
        if (!command.downloadUrl)
          return res
            .status(404)
            .json({ error: "RUNNER_UPDATE_DOWNLOAD_UNAVAILABLE" });
        const assetId = command.releaseAssetId;
        const { streamRunnerReleaseAsset } =
          await import("../services/runnerReleaseService");
        const result = await streamRunnerReleaseAsset(
          assetId,
          typeof req.headers.range === "string" ? req.headers.range : undefined
        );
        res.setHeader("Content-Type", result.contentType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${result.fileName.replace(/"/g, '\\"')}"`
        );
        if (result.contentLength !== undefined)
          res.setHeader("Content-Length", String(result.contentLength));
        if (result.totalLength !== undefined)
          res.setHeader("Accept-Ranges", "bytes");
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
    }
  );

  app.post(
    "/api/runners/:runnerId/update-commands/:commandId/ack",
    async (req, res) => {
      const auth = await authenticate(
        req,
        res,
        req.params.runnerId,
        "runner:update",
        gateway
      );
      if (!auth) return;
      const status = String(req.body?.status ?? "");
      if (!(runnerUpdateStatuses as readonly string[]).includes(status)) {
        return res.status(400).json({ error: "RUNNER_UPDATE_STATUS_INVALID" });
      }
      try {
        return res.json(
          await acknowledgeRunnerUpdate({
            runnerId: req.params.runnerId,
            commandId: req.params.commandId,
            status: status as (typeof runnerUpdateStatuses)[number],
            phase:
              typeof req.body?.phase === "string" ? req.body.phase : undefined,
            errorCode:
              typeof req.body?.errorCode === "string"
                ? req.body.errorCode
                : null,
            errorMessage:
              typeof req.body?.errorMessage === "string"
                ? req.body.errorMessage
                : null,
          })
        );
      } catch (error) {
        return sendError(res, error);
      }
    }
  );
}

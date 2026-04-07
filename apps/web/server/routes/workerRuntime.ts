import type { Express, Request, Response } from "express";

import {
  workerArtifactCompletePayloadSchema,
  workerArtifactInitPayloadSchema,
  workerClaimRequestSchema,
  workerDiagnosticsPayloadSchema,
  workerHeartbeatPayloadSchema,
  workerJobEventPayloadSchema,
  workerRegistrationPayloadSchema,
} from "../../shared/workerRuntime";
import {
  delegatedSessionRequestSchema,
  delegatedWorkerCallbackPayloadSchema,
} from "../../shared/workerDelegation";
import { sendApiError } from "../middleware/publicApiHeaders";
import { enforceJsonBodyMaxBytes, rateLimit } from "../_core/limits";
import {
  WorkerAuthError,
  extractBearerTokenFromRequest,
  verifyWorkerAccessToken,
  verifyWorkerRegistrationToken,
} from "../services/workerAuthService";
import {
  createDelegatedWorkerSession,
  getDelegatedWorkerManifest,
  WorkerDelegationError,
} from "../services/workerDelegationService";
import {
  publishWorkerCallback,
  WorkerCallbackError,
} from "../services/workerCallbackService";
import {
  WorkerRuntimeServiceError,
  claimWorkerJob,
  completeWorkerArtifact,
  initWorkerArtifactUpload,
  recordWorkerDiagnostics,
  recordWorkerHeartbeat,
  recordWorkerJobEvent,
  registerWorker,
} from "../services/workerRegistryService";
import { getWorkerPolicySnapshot } from "../services/workerPolicyService";

interface WorkerRuntimeRouteDeps {
  workerCallbacks?: {
    publishWorkerCallback: typeof publishWorkerCallback;
  };
  workerDelegation?: {
    createDelegatedWorkerSession: typeof createDelegatedWorkerSession;
    getDelegatedWorkerManifest: typeof getDelegatedWorkerManifest;
  };
  workerPolicy?: {
    getWorkerPolicySnapshot: typeof getWorkerPolicySnapshot;
  };
  workerRegistry?: {
    claimWorkerJob: typeof claimWorkerJob;
    completeWorkerArtifact: typeof completeWorkerArtifact;
    initWorkerArtifactUpload: typeof initWorkerArtifactUpload;
    recordWorkerDiagnostics: typeof recordWorkerDiagnostics;
    recordWorkerHeartbeat: typeof recordWorkerHeartbeat;
    recordWorkerJobEvent: typeof recordWorkerJobEvent;
    registerWorker: typeof registerWorker;
  };
}

function handleWorkerRouteError(error: unknown, res: Response): void {
  if (
    error instanceof WorkerAuthError
    || error instanceof WorkerRuntimeServiceError
    || error instanceof WorkerDelegationError
    || error instanceof WorkerCallbackError
  ) {
    sendApiError(res, error.statusCode, error.code, error.message, error.type);
    return;
  }
  if (error && typeof error === "object" && "issues" in (error as any)) {
    const issues = Array.isArray((error as any).issues) ? (error as any).issues : [];
    sendApiError(
      res,
      400,
      "invalid_request",
      issues.map((issue: any) => issue?.message).filter(Boolean).join("; ") || "Invalid request",
    );
    return;
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  sendApiError(res, 500, "internal_error", message, "internal_error");
}

function requireBearerToken(req: Request): string {
  const token = extractBearerTokenFromRequest(req);
  if (!token) {
    throw new WorkerAuthError("worker_auth_invalid", 401, "Worker authentication required");
  }
  return token;
}

export function registerWorkerRuntimeRoutes(
  app: Express,
  deps: WorkerRuntimeRouteDeps = {},
): void {
  const workerDelegation = deps.workerDelegation ?? {
    createDelegatedWorkerSession,
    getDelegatedWorkerManifest,
  };
  const workerCallbacks = deps.workerCallbacks ?? {
    publishWorkerCallback,
  };
  const workerRegistry = deps.workerRegistry ?? {
    claimWorkerJob,
    completeWorkerArtifact,
    initWorkerArtifactUpload,
    recordWorkerDiagnostics,
    recordWorkerHeartbeat,
    recordWorkerJobEvent,
    registerWorker,
  };
  const workerPolicy = deps.workerPolicy ?? { getWorkerPolicySnapshot };

  const registrationLimiter = rateLimit("workers-register", { rpm: 10 });
  const heartbeatLimiter = rateLimit("workers-heartbeat", { rpm: 120 });
  const claimLimiter = rateLimit("workers-claim", { rpm: 60 });
  const delegatedSessionLimiter = rateLimit("worker-delegated-session", { rpm: 60 });
  const eventLimiter = rateLimit("worker-job-events", { rpm: 240 });
  const artifactLimiter = rateLimit("worker-job-artifacts", { rpm: 120 });
  const diagnosticsLimiter = rateLimit("worker-diagnostics", { rpm: 30 });
  const callbackLimiter = rateLimit("worker-job-callbacks", { rpm: 60 });

  app.post(
    "/api/workers/register",
    registrationLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerRegistrationPayloadSchema.parse(req.body);
        const auth = await verifyWorkerRegistrationToken(token, {
          runtimeType: parsed.runtimeType,
        });
        const result = await workerRegistry.registerWorker({ auth, payload: parsed });
        res.status(result.created ? 201 : 200).json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/workers/:workerId/heartbeat",
    heartbeatLimiter,
    enforceJsonBodyMaxBytes(48 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerHeartbeatPayloadSchema.parse(req.body);
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:heartbeat"],
          runtimeType: parsed.runtimeType,
          workerId: req.params.workerId,
        });
        const worker = await workerRegistry.recordWorkerHeartbeat({
          auth,
          payload: parsed,
          workerId: req.params.workerId,
        });
        res.json({
          status: worker.status,
          workerId: worker.id,
          lastSeenAt: worker.lastSeenAt ?? null,
        });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.get("/api/workers/:workerId/policy", async (req, res) => {
    try {
      const token = requireBearerToken(req);
      const auth = await verifyWorkerAccessToken(token, {
        allowedTokenUses: ["worker_execution"],
        requiredScopes: ["workers:heartbeat"],
        workerId: req.params.workerId,
      });
      const snapshot = await workerPolicy.getWorkerPolicySnapshot({
        auth,
        workerId: req.params.workerId,
      });
      res.json(snapshot);
    } catch (error) {
      handleWorkerRouteError(error, res);
    }
  });

  app.post(
    "/api/workers/:workerId/jobs/claim",
    claimLimiter,
    enforceJsonBodyMaxBytes(16 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerClaimRequestSchema.parse(req.body ?? {});
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:claim"],
          workerId: req.params.workerId,
        });
        const result = await workerRegistry.claimWorkerJob({
          auth,
          payload: parsed,
          workerId: req.params.workerId,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/delegated-session",
    delegatedSessionLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = delegatedSessionRequestSchema.parse(req.body ?? {});
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:claim"],
        });
        const result = await workerDelegation.createDelegatedWorkerSession({
          auth,
          jobId: req.params.jobId,
          payload: parsed,
        });
        res.status(201).json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.get(
    "/api/worker-jobs/:jobId/delegated-manifest",
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:claim"],
        });
        const manifest = await workerDelegation.getDelegatedWorkerManifest({
          auth,
          jobId: req.params.jobId,
        });
        res.json({ manifest });
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/publish-room-update",
    callbackLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = delegatedWorkerCallbackPayloadSchema.parse(req.body ?? {});
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:report"],
        });
        const idempotencyKey = String(req.get("Idempotency-Key") || "").trim();
        const result = await workerCallbacks.publishWorkerCallback({
          tenantId: auth.tenantId,
          jobId: req.params.jobId,
          channel: "room_update",
          idempotencyKey,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/publish-workflow-update",
    callbackLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = delegatedWorkerCallbackPayloadSchema.parse(req.body ?? {});
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:report"],
        });
        const idempotencyKey = String(req.get("Idempotency-Key") || "").trim();
        const result = await workerCallbacks.publishWorkerCallback({
          tenantId: auth.tenantId,
          jobId: req.params.jobId,
          channel: "workflow_update",
          idempotencyKey,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/publish-user-notification",
    callbackLimiter,
    enforceJsonBodyMaxBytes(64 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = delegatedWorkerCallbackPayloadSchema.parse(req.body ?? {});
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:report"],
        });
        const idempotencyKey = String(req.get("Idempotency-Key") || "").trim();
        const result = await workerCallbacks.publishWorkerCallback({
          tenantId: auth.tenantId,
          jobId: req.params.jobId,
          channel: "user_notification",
          idempotencyKey,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/events",
    eventLimiter,
    enforceJsonBodyMaxBytes(128 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerJobEventPayloadSchema.parse(req.body);
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:report"],
        });
        const result = await workerRegistry.recordWorkerJobEvent({
          auth,
          jobId: req.params.jobId,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/artifacts/init-upload",
    artifactLimiter,
    enforceJsonBodyMaxBytes(32 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerArtifactInitPayloadSchema.parse(req.body);
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_upload"],
          requiredScopes: ["workers:report"],
        });
        const result = await workerRegistry.initWorkerArtifactUpload({
          auth,
          jobId: req.params.jobId,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/worker-jobs/:jobId/artifacts/complete",
    artifactLimiter,
    enforceJsonBodyMaxBytes(48 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerArtifactCompletePayloadSchema.parse(req.body);
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_upload"],
          requiredScopes: ["workers:report"],
        });
        const result = await workerRegistry.completeWorkerArtifact({
          auth,
          jobId: req.params.jobId,
          payload: parsed,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );

  app.post(
    "/api/workers/:workerId/diagnostics",
    diagnosticsLimiter,
    enforceJsonBodyMaxBytes(128 * 1024),
    async (req, res) => {
      try {
        const token = requireBearerToken(req);
        const parsed = workerDiagnosticsPayloadSchema.parse(req.body);
        const auth = await verifyWorkerAccessToken(token, {
          allowedTokenUses: ["worker_execution"],
          requiredScopes: ["workers:diagnostics"],
          workerId: req.params.workerId,
        });
        const result = await workerRegistry.recordWorkerDiagnostics({
          auth,
          payload: parsed,
          workerId: req.params.workerId,
        });
        res.json(result);
      } catch (error) {
        handleWorkerRouteError(error, res);
      }
    },
  );
}

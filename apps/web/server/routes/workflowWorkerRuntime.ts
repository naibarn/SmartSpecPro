import type { Application, Request, Response } from "express";

import { authorizeRequest, type AuthResult } from "../_core/authz";
import { sdk } from "../_core/sdk";
import { getUserById, getUserByOpenId } from "../db";
import { sendApiError } from "../middleware/publicApiHeaders";
import { enforceJsonBodyMaxBytes, rateLimit } from "../_core/limits";
import {
  dispatchWorkflowWorkerJob,
  getWorkflowWorkerJobStatus,
  publishWorkflowWorkerArtifacts,
  triggerWorkflowWorkerRagIndex,
  workflowWorkerDispatchRequestSchema,
  workflowWorkerPublishRequestSchema,
  WorkflowWorkerRuntimeError,
  type WorkflowWorkerRuntimeActor,
} from "../services/workflowWorkerRuntimeService";

interface WorkflowWorkerRuntimeRouteDeps {
  services?: {
    dispatchWorkflowWorkerJob: typeof dispatchWorkflowWorkerJob;
    getWorkflowWorkerJobStatus: typeof getWorkflowWorkerJobStatus;
    publishWorkflowWorkerArtifacts: typeof publishWorkflowWorkerArtifacts;
    triggerWorkflowWorkerRagIndex: typeof triggerWorkflowWorkerRagIndex;
  };
}

function parseAuthHeaderToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader !== "string" || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  return token || null;
}

async function resolveActorFromAuth(auth: Extract<AuthResult, { ok: true }>): Promise<WorkflowWorkerRuntimeActor | null> {
  if (auth.mode === "delegated_worker") {
    throw new WorkflowWorkerRuntimeError(
      "forbidden",
      403,
      "Delegated worker tokens cannot invoke workflow worker-runtime routes",
    );
  }

  if (auth.mode === "api_key") {
    return {
      userId: auth.userId,
      tenantId: auth.tenantId,
      role: "user",
    };
  }

  if (auth.mode === "session") {
    const tenantId = auth.user?.currentTenantId ? String(auth.user.currentTenantId) : "";
    const userId = typeof auth.user?.id === "number" ? auth.user.id : 0;
    if (!tenantId || userId <= 0) {
      return null;
    }
    return {
      userId,
      tenantId,
      role: typeof auth.user?.role === "string" ? auth.user.role : null,
    };
  }

  if (auth.mode === "bearer") {
    if (auth.sub === "static") {
      throw new WorkflowWorkerRuntimeError(
        "forbidden",
        403,
        "Static internal bearer tokens cannot invoke workflow worker-runtime routes",
      );
    }

    let user = auth.userId ? await getUserById(auth.userId) : undefined;
    if (!user && auth.sub) {
      user = await getUserByOpenId(auth.sub);
    }
    if (!user && auth.sub) {
      const numericId = Number.parseInt(auth.sub, 10);
      if (Number.isInteger(numericId) && String(numericId) === auth.sub) {
        user = await getUserById(numericId);
      }
    }
    if (!user) {
      return null;
    }

    const tenantId = auth.tenantId?.trim() || (user.currentTenantId ? String(user.currentTenantId) : "");
    if (!tenantId) {
      return null;
    }

    return {
      userId: user.id,
      tenantId,
      role: user.role ?? null,
    };
  }

  return null;
}

async function authenticateWorkflowWorkerRuntimeActor(req: Request): Promise<WorkflowWorkerRuntimeActor> {
  const bearerToken = parseAuthHeaderToken(req);
  if (bearerToken) {
    const auth = await authorizeRequest(req, { allowBearer: true, allowSession: false });
    if (auth.ok) {
      const actor = await resolveActorFromAuth(auth);
      if (actor) {
        return actor;
      }
    }
  }

  try {
    const user = await sdk.authenticateRequest(req);
    const tenantId = user.currentTenantId ? String(user.currentTenantId) : "";
    if (!tenantId) {
      throw new WorkflowWorkerRuntimeError("forbidden", 403, "Authenticated user is not bound to an active tenant");
    }
    return {
      userId: user.id,
      tenantId,
      role: user.role ?? null,
    };
  } catch (error) {
    if (error instanceof WorkflowWorkerRuntimeError) {
      throw error;
    }
    throw new WorkflowWorkerRuntimeError("unauthorized", 401, "Workflow worker-runtime authentication required");
  }
}

function handleWorkflowWorkerRuntimeError(error: unknown, res: Response): void {
  if (error instanceof WorkflowWorkerRuntimeError) {
    sendApiError(res, error.statusCode, error.code, error.message);
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

export function registerWorkflowWorkerRuntimeRoutes(
  app: Application,
  deps: WorkflowWorkerRuntimeRouteDeps = {},
): void {
  const services = deps.services ?? {
    dispatchWorkflowWorkerJob,
    getWorkflowWorkerJobStatus,
    publishWorkflowWorkerArtifacts,
    triggerWorkflowWorkerRagIndex,
  };

  const dispatchLimiter = rateLimit("workflow-worker-runtime-dispatch", { rpm: 60 });
  const readLimiter = rateLimit("workflow-worker-runtime-read", { rpm: 180 });
  const mutateLimiter = rateLimit("workflow-worker-runtime-mutate", { rpm: 120 });

  app.post(
    "/api/internal/workflow-worker-jobs/dispatch",
    dispatchLimiter,
    enforceJsonBodyMaxBytes(512 * 1024),
    async (req: Request, res: Response) => {
      try {
        const actor = await authenticateWorkflowWorkerRuntimeActor(req);
        const payload = workflowWorkerDispatchRequestSchema.parse(req.body ?? {});
        const result = await services.dispatchWorkflowWorkerJob({ actor, payload });
        res.status(result.created === false ? 200 : 201).json(result);
      } catch (error) {
        handleWorkflowWorkerRuntimeError(error, res);
      }
    },
  );

  app.get(
    "/api/internal/workflow-worker-jobs/:jobId",
    readLimiter,
    async (req: Request, res: Response) => {
      try {
        const actor = await authenticateWorkflowWorkerRuntimeActor(req);
        const result = await services.getWorkflowWorkerJobStatus({
          actor,
          jobId: req.params.jobId,
        });
        res.status(200).json(result);
      } catch (error) {
        handleWorkflowWorkerRuntimeError(error, res);
      }
    },
  );

  app.post(
    "/api/internal/workflow-worker-jobs/:jobId/publish",
    mutateLimiter,
    enforceJsonBodyMaxBytes(8 * 1024),
    async (req: Request, res: Response) => {
      try {
        const actor = await authenticateWorkflowWorkerRuntimeActor(req);
        workflowWorkerPublishRequestSchema.parse(req.body ?? {});
        const result = await services.publishWorkflowWorkerArtifacts({
          actor,
          jobId: req.params.jobId,
        });
        res.status(200).json(result);
      } catch (error) {
        handleWorkflowWorkerRuntimeError(error, res);
      }
    },
  );

  app.post(
    "/api/internal/workflow-worker-jobs/:jobId/trigger-index",
    mutateLimiter,
    enforceJsonBodyMaxBytes(8 * 1024),
    async (req: Request, res: Response) => {
      try {
        const actor = await authenticateWorkflowWorkerRuntimeActor(req);
        workflowWorkerPublishRequestSchema.parse(req.body ?? {});
        const result = await services.triggerWorkflowWorkerRagIndex({
          actor,
          jobId: req.params.jobId,
        });
        res.status(200).json(result);
      } catch (error) {
        handleWorkflowWorkerRuntimeError(error, res);
      }
    },
  );
}

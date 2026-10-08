import { createHash } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { auditLogger, type AuditEventType } from "../services/auditLogger";
import { defaultSpec226DevelopmentControlBridge } from "../services/spec226DevelopmentControlBridge";
import {
  defaultSpec224AuthorizationService,
  type Spec224AuthorizationContext,
} from "../services/spec224AuthorizationService";
import { bindSpec224RecoveryGrant } from "../services/spec224RecoveryGrantBinding";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { buildDevelopmentRun } from "../services/spec224DevelopmentRunContracts";
import {
  createDevelopmentRunService,
  createPersistedDevelopmentRun,
  defaultDevelopmentRunPersistenceAdapter,
} from "../services/spec224DevelopmentRunPersistence";
import { defaultSpec224WorkspaceSpecSetService, SPEC224_MAX_RAW_REQUEST_BYTES } from "../services/spec224WorkspaceSpecSet";
import { defaultSpec224RunnerInputStagingService } from "../services/spec224RunnerInputStaging";
import { getWorkspaceAuthorityProjectReadModel } from "../services/workspaceAuthorityProjectReadModel";
import {
  enqueueWorkspaceAuthorityAction,
  getWorkspaceAuthorityActionStatus,
  WorkspaceAuthorityActionError,
  type WorkspaceAuthorityAction,
} from "../services/workspaceAuthoritySafeActions";

const developmentRunService = createDevelopmentRunService(
  defaultDevelopmentRunPersistenceAdapter
);

function requireScope(ctx: {
  tenantId: string | null;
  user?: {
    id?: number | null;
    role?: string | null;
    currentTenantId?: string | number | null;
  } | null;
}) {
  const tenantId = resolveTenantIdVarchar(
    ctx.tenantId,
    ctx.user?.currentTenantId
  );
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context required",
    });
  }
  if (!ctx.user?.id) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "User context required",
    });
  }
  return { tenantId, actorId: ctx.user.id };
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "CONTROL_BRIDGE_FAILED";
}

function asTrpcError(error: unknown): never {
  const code = errorCode(error);
  if (error instanceof WorkspaceAuthorityActionError) {
    if (code === "WORKSPACE_ACTION_AUTHENTICATION_REQUIRED")
      throw new TRPCError({ code: "UNAUTHORIZED", message: code });
    if (["WORKSPACE_ACTION_AUTHORITY_NOT_FOUND", "WORKSPACE_ACTION_NOT_FOUND"].includes(code))
      throw new TRPCError({ code: "FORBIDDEN", message: code });
    if (code === "WORKSPACE_ACTION_ROLE_REQUIRED")
      throw new TRPCError({ code: "FORBIDDEN", message: code });
    if (["WORKSPACE_ACTION_AUTHORITY_CONFLICT", "WORKSPACE_ACTION_IDEMPOTENCY_CONFLICT"].includes(code))
      throw new TRPCError({ code: "CONFLICT", message: code });
    throw new TRPCError({ code: "BAD_REQUEST", message: code });
  }
  if (code === "SPEC224_GRANT_BINDING_OWNER_REQUIRED") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant owner authorization required",
    });
  }
  if (code === "RUN_NOT_FOUND" || code === "RUN_SCOPE_FORBIDDEN") {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Development run not found",
    });
  }
  if (
    code === "RUN_PROJECTION_STALE" ||
    code === "RUN_FENCE_STALE" ||
    code === "RUN_DECISION_EPOCH_STALE"
  ) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Development run changed; refresh and retry",
    });
  }
  if (code === "SPEC_SET_REVISION_STALE") {
    throw new TRPCError({ code: "CONFLICT", message: "Spec Set changed; refresh and retry" });
  }
  if (
    [
      "CONTROL_ACTION_INVALID_STATE",
      "CONTROL_ACTION_UNSUPPORTED",
      "RUN_IDEMPOTENCY_CONFLICT",
      "RUN_IDEMPOTENCY_KEY_INVALID",
      "EVENT_CURSOR_INVALID",
      "EVENT_LIMIT_INVALID",
      "RUNNER_NOT_FOUND",
      "RUNNER_BINDING_REQUIRED",
      "APPROVAL_AUTHENTICATION_REQUIRED",
      "APPROVAL_REQUEST_REJECTED",
      "APPROVAL_REFERENCE_MISSING",
      "APPROVAL_AUTHORITY_UNAVAILABLE",
      "ECONOMIC_LEDGER_ACCOUNTS_NOT_CONFIGURED",
      "BUDGET_REQUIRED",
      "AUTH_BINDING_JOB_NOT_QUEUED",
      "AGENT_MANIFEST_MISSING",
      "APPROVAL_REVOCATION_REJECTED",
      "BUDGET_BINDING_MISMATCH",
      "HOLD_RELEASE_NOT_ALLOWED",
      "SPEC224_GRANT_BINDING_REQUEST_INVALID",
      "SPEC224_GRANT_BINDING_OWNER_REQUIRED",
      "SPEC224_GRANT_BINDING_JOB_STATE_INVALID",
      "SPEC224_GRANT_BINDING_CANONICAL_STATE_INVALID",
      "SPEC224_GRANT_BINDING_ATTEMPT_MISSING",
      "SPEC224_GRANT_BINDING_ATTESTATION_MISSING",
      "SPEC224_GRANT_BINDING_ATTESTATION_INVALID",
      "SPEC224_GRANT_BINDING_ATTESTATION_STALE",
      "SPEC224_GRANT_BINDING_ATTESTATION_INVALIDATED",
      "SPEC224_GRANT_BINDING_RUNNER_SNAPSHOT_MISSING",
      "SPEC224_GRANT_BINDING_CANONICAL_STATE_CHANGED",
      "SPEC224_GRANT_BINDING_CONFLICT",
      "SPEC224_GRANT_BINDING_UNKNOWN",
      "SPEC224_GRANT_BINDING_INVALID_NOT_FOUND",
      "SPEC224_GRANT_BINDING_INVALID_TENANT",
      "SPEC224_GRANT_BINDING_INVALID_OWNER",
      "SPEC224_GRANT_BINDING_INVALID_AUTHORITY",
      "SPEC224_GRANT_BINDING_INVALID_SCOPE",
      "SPEC224_GRANT_BINDING_INVALID_BINDING",
      "SPEC224_GRANT_BINDING_INVALID_AUDIT",
      "SPEC224_GRANT_BINDING_INVALID_EXPIRED",
      "SPEC224_GRANT_BINDING_INVALID_REVOKED",
      "SPEC224_GRANT_BINDING_REQUIRES_REMOTE_TRUST",
      "CONVERSATION_ID_INVALID",
      "CONVERSATION_SCOPE_FORBIDDEN",
      "WORKSPACE_BINDING_REQUIRED",
      "WORKSPACE_BINDING_STALE",
      "WORKSPACE_BINDING_FORBIDDEN",
      "WORKSPACE_BINDING_REVOKED",
      "WORKSPACE_NOT_TRUSTED_OR_CURRENT",
      "WORKSPACE_SOURCE_REVISION_UNAVAILABLE",
      "SPEC_SET_ARTIFACT_COUNT_INVALID",
      "SPEC_SET_ARTIFACT_INVALID",
      "SPEC_SET_BASE64_INVALID",
      "SPEC_SET_RAW_SIZE_INVALID",
      "SPEC_SET_RAW_AGGREGATE_LIMIT",
      "SPEC_SET_MANIFEST_OVERSIZED",
      "SPEC_SET_PATH_INVALID",
      "SPEC_SET_PATH_DUPLICATE",
      "SPEC_SET_UTF8_INVALID",
      "SPEC_SET_JSON_INVALID",
      "SPEC_SET_FILE_OVERSIZED",
      "SPEC_SET_EXPANSION_LIMIT",
      "SPEC_SET_ZIP_INVALID",
      "SPEC_SET_ZIP_ENTRY_COUNT_INVALID",
      "SPEC_SET_ZIP_ENCRYPTED",
      "SPEC_SET_ZIP_COMPRESSION_UNSUPPORTED",
      "SPEC_SET_ZIP_SYMLINK",
      "SPEC_SET_IDEMPOTENCY_KEY_INVALID",
      "SPEC_SET_IDEMPOTENCY_CONFLICT",
      "SPEC_SET_REVISION_NOT_FOUND",
      "PREPARE_PROMPT_INVALID",
      "SPEC_SET_WORK_PACKAGE_NOT_READY",
    ].includes(code)
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: code });
  }
  throw error;
}

const runIdSchema = z.string().trim().min(1).max(160);
const actionInput = z.object({
  runId: runIdSchema,
  action: z.enum(["pause", "cancel"]),
  expectedRevision: z.number().int().min(0),
  expectedFencingVersion: z.number().int().min(0),
  expectedDecisionEpoch: z.number().int().min(0),
  idempotencyKey: z.string().trim().min(1).max(200),
});

const authorizationContext = (ctx: {
  tenantId: string | null;
  userToken?: string | null;
  user?: {
    id?: number | null;
    currentTenantId?: string | number | null;
  } | null;
}): Spec224AuthorizationContext => ({
  ...requireScope(ctx),
  userToken: ctx.userToken,
});

const providerInput = z.object({
  runId: runIdSchema,
  runnerId: z.string().trim().min(1).max(160),
  provider: z.literal("codex").default("codex"),
});

const safeActionInput = z.object({
  projectId: z.string().trim().min(1).max(200),
  repositoryId: z.string().trim().min(1).max(200),
  workspaceId: z.string().trim().min(1).max(200).optional(),
  action: z.enum(["SYNC_WORKSPACE_SAFELY", "INSPECT_LOCAL_CHANGES", "OPEN_CANONICAL_WORKSPACE", "RECOVER_WORK", "INTEGRATE_COMPLETED_WORK", "RETIRE_SAFE_WORKTREE", "VERIFY_PROJECT_CONVERGENCE"]),
  idempotencyKey: z.string().trim().min(1).max(200),
  integratedSha: z.string().regex(/^[a-f0-9]{40,64}$/).optional(),
  pullRequestNumber: z.number().int().positive().optional(),
  expectedHeadSha: z.string().regex(/^[a-f0-9]{40,64}$/).optional(),
}).strict();

function safeActionPayload(input: z.infer<typeof safeActionInput>): Record<string, string | number | boolean | null> {
  const workspaceRequired = ["INSPECT_LOCAL_CHANGES", "RECOVER_WORK", "RETIRE_SAFE_WORKTREE"].includes(input.action);
  if (workspaceRequired && !input.workspaceId) throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_WORKSPACE_REQUIRED");
  if (input.action === "INTEGRATE_COMPLETED_WORK" && (!input.pullRequestNumber || !input.expectedHeadSha))
    throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_PULL_REQUEST_REQUIRED");
  if (input.action === "SYNC_WORKSPACE_SAFELY" || input.action === "VERIFY_PROJECT_CONVERGENCE")
    return input.integratedSha ? { integratedSha: input.integratedSha } : {};
  if (input.action === "INTEGRATE_COMPLETED_WORK")
    return { pullRequestNumber: input.pullRequestNumber!, expectedHeadSha: input.expectedHeadSha! };
  return {};
}

/**
 * Spec 226 user-surface adapter. Creation persists a pending canonical job;
 * dispatch remains gated by the Spec 224 authorization authority.
 */
export const spec226DevelopmentControlRouter = router({
  projectMissionControl: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      try {
        return await getWorkspaceAuthorityProjectReadModel(requireScope(ctx));
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  executeWorkspaceAuthoritySafeAction: protectedProcedure
    .input(safeActionInput)
    .mutation(async ({ ctx, input }) => {
      try {
        const scope = requireScope(ctx);
        const action = input.action as WorkspaceAuthorityAction;
        if (action === "RETIRE_SAFE_WORKTREE" && !["admin", "system_agent"].includes(ctx.user?.role ?? ""))
          throw new WorkspaceAuthorityActionError("WORKSPACE_ACTION_ROLE_REQUIRED");
        const queued = await enqueueWorkspaceAuthorityAction({
          ...scope,
          projectId: input.projectId,
          repositoryId: input.repositoryId,
          workspaceId: input.workspaceId,
          action,
          idempotencyKey: input.idempotencyKey,
          payload: safeActionPayload(input),
        });
        auditLogger.log({
          eventType: "workspace_authority_action_queued" as AuditEventType,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: { jobId: queued.jobId, projectId: input.projectId, repositoryId: input.repositoryId,
            workspaceId: input.workspaceId ?? null, action, status: queued.status,
            runnerId: queued.authority.runnerId, snapshotRevision: queued.authority.snapshotRevision },
        });
        return { status: queued.status, jobId: queued.jobId };
      } catch (error) {
        auditLogger.log({
          eventType: "workspace_authority_action_queued" as AuditEventType,
          tenantId: ctx.tenantId ?? undefined,
          userId: ctx.user?.id ?? null,
          metadata: { projectId: input.projectId, repositoryId: input.repositoryId,
            workspaceId: input.workspaceId ?? null, action: input.action,
            accepted: false, errorCode: errorCode(error) },
        });
        return asTrpcError(error);
      }
    }),

  workspaceAuthoritySafeActionStatus: protectedProcedure
    .input(z.object({ jobId: z.string().trim().min(1).max(36) }))
    .query(async ({ ctx, input }) => {
      try {
        return await getWorkspaceAuthorityActionStatus({ ...requireScope(ctx), jobId: input.jobId });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  availableWorkspaces: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      try {
        return { workspaces: await defaultSpec224WorkspaceSpecSetService.availableWorkspaces(requireScope(ctx)) };
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  bindConversationWorkspace: protectedProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      runnerId: z.string().trim().min(1).max(160),
      workspaceId: z.string().trim().min(1).max(200),
      repositoryRef: z.string().trim().min(1).max(200).optional(),
      baseRevision: z.string().trim().min(1).max(200).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { repositoryRef: _repositoryRef, baseRevision: _baseRevision, ...binding } = input;
        return await defaultSpec224WorkspaceSpecSetService.bindConversationWorkspace({ ...requireScope(ctx), ...binding });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  getConversationWorkspace: protectedProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      try {
        const scope = requireScope(ctx);
        const workspaceState = await defaultSpec224WorkspaceSpecSetService.getConversationWorkspace({ ...scope, ...input });
        if (!workspaceState) return null;
        const runs = await defaultSpec226DevelopmentControlBridge.list({
          ...scope,
          limit: 20,
          workspaceId: workspaceState.workspace.workspaceId,
        });
        return {
          ...workspaceState,
          developmentRuns: runs.filter(run => run.workspaceId === workspaceState.workspace.workspaceId).map(run => ({
              runId: run.runId,
              state: run.state,
              workPackageId: run.workPackageId,
              workPackageExternalId: run.workPackageExternalId,
              specSetRevision: run.specSetRevision,
              revision: run.revision,
            })),
        };
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  ingestSpecSet: protectedProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      artifacts: z.array(z.object({ path: z.string().min(1).max(260), contentBase64: z.string().min(1).max(3_000_000) })).min(1).max(64),
      idempotencyKey: z.string().trim().min(1).max(160),
    }).superRefine((input, refinement) => {
      const encodedBytes = input.artifacts.reduce((total, artifact) => total + Buffer.byteLength(artifact.contentBase64, "ascii"), 0);
      if (encodedBytes > Math.ceil(SPEC224_MAX_RAW_REQUEST_BYTES * 4 / 3)) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "aggregate artifacts too large" });
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await defaultSpec224WorkspaceSpecSetService.ingestSpecSet({ ...requireScope(ctx), ...input });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  prepareWorkspaceRun: protectedProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      mode: z.enum(["prompt", "spec_set"]),
      prompt: z.string().max(4_000).optional(),
      specSetRevision: z.number().int().positive().optional(),
    }).superRefine((input, refinement) => {
      if (input.mode === "prompt" && !input.prompt?.trim()) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "prompt required" });
      if (input.mode === "spec_set" && input.prompt) refinement.addIssue({ code: z.ZodIssueCode.custom, message: "prompt not allowed for spec set" });
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await defaultSpec224WorkspaceSpecSetService.prepareWorkspaceRun({ ...requireScope(ctx), ...input });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  startWorkspaceRun: protectedProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      mode: z.enum(["prompt", "spec_set"]),
      prompt: z.string().max(4_000).optional(),
      specSetRevision: z.number().int().positive().optional(),
      workPackageId: z.string().trim().min(1).max(160).optional(),
      idempotencyKey: z.string().trim().min(16).max(160),
      provider: z.enum(["codex", "claude_code"]).default("codex"),
    }).superRefine((input, refinement) => {
      if (input.mode === "prompt" && (!input.prompt?.trim() || input.workPackageId))
        refinement.addIssue({ code: z.ZodIssueCode.custom, message: "valid prompt required" });
      if (input.mode === "spec_set" && (input.prompt || !input.workPackageId))
        refinement.addIssue({ code: z.ZodIssueCode.custom, message: "work package required" });
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      const runDigest = createHash("sha256")
        .update(`${scope.tenantId}:${scope.actorId}:${input.idempotencyKey}`, "utf8")
        .digest("hex")
        .slice(0, 40);
      const runId = `run-${runDigest}`;
      try {
        const prepared = await defaultSpec224WorkspaceSpecSetService.resolveWorkspaceRunInput({
          ...scope,
          conversationId: input.conversationId,
          mode: input.mode,
          ...(input.prompt === undefined ? {} : { prompt: input.prompt }),
          ...(input.specSetRevision === undefined ? {} : { specSetRevision: input.specSetRevision }),
          ...(input.workPackageId === undefined ? {} : { workPackageId: input.workPackageId }),
        });
        const workPackageId = prepared.workPackageId ?? "prompt";
        const runContext = {
          workspace: prepared.workspace.workspaceId,
          runnerId: prepared.runner.runnerId,
          runnerSnapshotRevision: prepared.runner.snapshotRevision,
          gitHead: prepared.runner.gitHead,
          gitBranch: prepared.runner.gitBranch,
          dirty: prepared.runner.dirty,
          contentFingerprint: prepared.runner.contentFingerprint,
          specSetRevision: prepared.specSetRevision,
          workPackageId,
          workPackageExternalId: prepared.workPackageExternalId ?? null,
          executionMode: prepared.workPackageId ? "work_package" : "prompt",
          allowedWriteSet: prepared.allowedWriteSet,
        };
        const inputFiles = [
          ...prepared.inputFiles,
          { path: "spec224-run-context.json", contentBase64: Buffer.from(JSON.stringify(runContext), "utf8").toString("base64") },
        ];
        const stagedSource = await defaultSpec224RunnerInputStagingService.preStageRunnerInput({
          tenantId: scope.tenantId,
          startRef: runId,
          files: inputFiles,
        });
        const run = buildDevelopmentRun({
          runId,
          ...scope,
          goal: prepared.goal,
          repositoryRef: prepared.repositoryRef,
          baseRevision: prepared.baseRevision,
          contextPackHash: prepared.contextPackHash,
          workspaceId: prepared.workspace.workspaceId,
          workPackageId,
          metadata: {
            spec224Workspace: runContext,
            spec224Input: {
              inputSourceRef: stagedSource.inputSourceRef,
              inputDigest: stagedSource.inputDigest,
              totalBytes: stagedSource.totalBytes,
            },
            spec224Execution: {
              sourceFingerprint: prepared.runner.contentFingerprint,
              mode: prepared.workPackageId ? "work_package" : "prompt",
              allowedWriteSet: prepared.allowedWriteSet,
            },
          },
        });
        const created = await createPersistedDevelopmentRun({
          run,
          provider: input.provider,
          runtime: "local_runner",
          planId: prepared.planId,
          planRevision: prepared.planRevision,
          skillIds: [],
          requestedCapabilities: [],
          deferredAdmission: true,
          authorizationScope: "spec226-development-control",
          correlationId: traceId,
        });
        await defaultSpec224RunnerInputStagingService.bindSourceToWorkerJob({
          tenantId: scope.tenantId,
          startRef: runId,
          inputSourceRef: stagedSource.inputSourceRef,
          workerJobId: created.jobRef.jobId,
        });
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId,
            jobId: created.jobRef.jobId,
            status: "pending_authorization",
            workspaceId: prepared.workspace.workspaceId,
            specSetRevision: prepared.specSetRevision,
            workPackageId: prepared.workPackageId,
            inputDigest: stagedSource.inputDigest,
          },
        });
        return {
          runId,
          jobId: created.jobRef.jobId,
          state: created.run.state,
          dispatchStatus: "PENDING_AUTHORIZATION" as const,
          inputDigest: stagedSource.inputDigest,
          specSetRevision: prepared.specSetRevision,
          workPackageId: prepared.workPackageId,
        };
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: { runId, action: "start_workspace_run", accepted: false, errorCode: errorCode(error) },
        });
        return asTrpcError(error);
      }
    }),

  create: protectedProcedure
    .input(
      z.object({
        goal: z.string().trim().min(1).max(4_000),
        repositoryRef: z.string().trim().min(1).max(200),
        baseRevision: z.string().trim().min(1).max(200),
        contextPackHash: z.string().regex(/^[a-f0-9]{64}$/),
        workspaceId: z.string().trim().min(1).max(200),
        planId: z.string().trim().min(1).max(200),
        planRevision: z.number().int().min(1),
        idempotencyKey: z.string().trim().min(16).max(160),
        provider: z.enum(["codex", "claude_code"]).default("codex"),
        skillIds: z
          .array(z.string().trim().min(1).max(200))
          .max(32)
          .default([]),
        requestedCapabilities: z
          .array(z.string().trim().min(1).max(200))
          .max(32)
          .default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      const runDigest = createHash("sha256")
        .update(`${scope.tenantId}:${scope.actorId}:${input.idempotencyKey}`, "utf8")
        .digest("hex")
        .slice(0, 40);
      const runId = `run-${runDigest}`;
      try {
        const run = buildDevelopmentRun({
          runId,
          ...scope,
          goal: input.goal,
          repositoryRef: input.repositoryRef,
          baseRevision: input.baseRevision,
          contextPackHash: input.contextPackHash,
          workspaceId: input.workspaceId,
        });
        const created = await createPersistedDevelopmentRun({
          run,
          provider: input.provider ?? "codex",
          runtime: "local_runner",
          planId: input.planId,
          planRevision: input.planRevision,
          skillIds: input.skillIds,
          requestedCapabilities: input.requestedCapabilities,
          deferredAdmission: true,
          authorizationScope: "spec226-development-control",
          correlationId: traceId,
        });
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId,
            jobId: created.jobRef.jobId,
            status: "pending_authorization",
          },
        });
        return {
          runId,
          jobId: created.jobRef.jobId,
          state: created.run.state,
          dispatchStatus: "PENDING_AUTHORIZATION" as const,
        };
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId,
            action: "create",
            accepted: false,
            errorCode: errorCode(error),
          },
        });
        return asTrpcError(error);
      }
    }),

  list: protectedProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(100).default(25) })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      try {
        return await defaultSpec226DevelopmentControlBridge.list({
          ...requireScope(ctx),
          limit: input?.limit ?? 25,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  get: protectedProcedure
    .input(z.object({ runId: runIdSchema }))
    .query(async ({ ctx, input }) => {
      try {
        return await defaultSpec226DevelopmentControlBridge.get({
          ...requireScope(ctx),
          runId: input.runId,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  events: protectedProcedure
    .input(
      z.object({
        runId: runIdSchema,
        afterSequence: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await defaultSpec226DevelopmentControlBridge.events({
          ...requireScope(ctx),
          runId: input.runId,
          afterSequence: input.afterSequence,
          limit: input.limit,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  command: protectedProcedure
    .input(actionInput)
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      try {
        const result = await defaultSpec226DevelopmentControlBridge.command({
          ...scope,
          ...input,
        });
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            action: input.action,
            accepted: result.accepted,
            revision: result.revision,
          },
        });
        return result;
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            action: input.action,
            accepted: false,
            errorCode: errorCode(error),
          },
        });
        return asTrpcError(error);
      }
    }),

  authorizationStatus: protectedProcedure
    .input(
      z.object({
        runId: runIdSchema,
        runnerId: z.string().trim().min(1).max(160).optional(),
        provider: z.literal("codex").default("codex"),
      })
    )
    .query(async ({ ctx, input }) => {
      try {
        return await defaultSpec224AuthorizationService.status({
          context: authorizationContext(ctx),
          ...input,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  requestAuthorizationApproval: protectedProcedure
    .input(
      providerInput.extend({
        deadline: z.string().datetime({ offset: true }),
        budgetCapMinorUnits: z.number().int().positive().max(10_000_000),
        currency: z.string().regex(/^[A-Za-z]{3}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await defaultSpec224AuthorizationService.requestApproval({
          context: authorizationContext(ctx),
          ...input,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  reserveAuthorizationBudget: protectedProcedure
    .input(
      providerInput.extend({
        approvalRef: z.string().trim().min(1).max(200),
        budgetId: z.string().trim().min(1).max(160),
        amountMinorUnits: z.number().int().positive().max(10_000_000),
        currency: z.string().regex(/^[A-Za-z]{3}$/),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await defaultSpec224AuthorizationService.reserveBudget({
          context: authorizationContext(ctx),
          ...input,
        });
      } catch (error) {
        return asTrpcError(error);
      }
    }),

  bindAuthorization: protectedProcedure
    .input(
      z.object({
        runId: runIdSchema,
        runnerId: z.string().trim().min(1).max(160),
        approvalRef: z.string().trim().min(1).max(200),
        budgetReservationRef: z.string().trim().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      try {
        const result = await defaultSpec224AuthorizationService.bind({
          context: authorizationContext(ctx),
          ...input,
        });
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            status: result.status,
            reasonCount: result.reasons.length,
            // References are opaque policy handles; raw provider credentials
            // never enter this audit record.
            approvalRef: input.approvalRef,
            budgetReservationRef: input.budgetReservationRef,
          },
        });
        return result;
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            status: "error",
            errorCode: errorCode(error),
          },
        });
        return asTrpcError(error);
      }
    }),

  requestFullVerification: protectedProcedure
    .input(z.object({
      runId: runIdSchema,
      expectedRevision: z.number().int().min(0),
      expectedFencingVersion: z.number().int().min(0),
      idempotencyKey: z.string().trim().min(16).max(160),
    }))
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      try {
        const result = await developmentRunService.requestFullVerification({
          ...scope,
          ...input,
        });
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            action: "request_full_verification",
            state: result.state,
            accepted: result.accepted,
            jobId: result.jobId,
          },
        });
        return result;
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_control" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            action: "request_full_verification",
            errorCode: errorCode(error),
          },
        });
        return asTrpcError(error);
      }
    }),

  bindRecoveryGrant: protectedProcedure
    .input(
      z.object({
        runId: runIdSchema,
        grantId: z.string().uuid(),
        operation: z.enum([
          "read_source",
          "modify_owned_paths",
          "run_focused_tests",
          "commit_owned_changes",
        ]),
        path: z.string().trim().min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      try {
        const result = await bindSpec224RecoveryGrant({
          ...scope,
          runId: input.runId,
          grantId: input.grantId,
          operation: input.operation,
          path: input.path,
        });
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            grantId: input.grantId,
            action: "bind_recovery_grant",
            replayed: result.replayed,
          },
        });
        return { status: "BOUND" as const, ...result };
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            grantId: input.grantId,
            action: "bind_recovery_grant",
            errorCode: errorCode(error),
          },
        });
        return asTrpcError(error);
      }
    }),

  revokeAuthorization: protectedProcedure
    .input(
      z.object({
        runId: runIdSchema,
        approvalRef: z.string().trim().min(1).max(200),
        budgetReservationRef: z.string().trim().min(1).max(200),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scope = requireScope(ctx);
      const traceId = auditLogger.createTrace();
      try {
        const result = await defaultSpec224AuthorizationService.revoke({
          context: authorizationContext(ctx),
          ...input,
        });
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            status: result.status,
            action: "revoke",
          },
        });
        return result;
      } catch (error) {
        auditLogger.log({
          eventType: "spec226_development_authorization" as AuditEventType,
          traceId,
          tenantId: scope.tenantId,
          userId: scope.actorId,
          metadata: {
            runId: input.runId,
            status: "error",
            action: "revoke",
            errorCode: errorCode(error),
          },
        });
        return asTrpcError(error);
      }
    }),
});

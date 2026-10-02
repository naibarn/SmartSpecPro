import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  workflowStudioDefinitions,
  workflowStudioCheckpoints,
  workflowStudioRunEvents,
  workflowStudioRuns,
  workflowStudioNodeRuns,
  workflowStudioNodeAttempts,
  workflowStudioApps,
  workflowStudioVersions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  createWorkflowDraft,
  assertWorkflowDraftRevision,
  publishWorkflowVersion,
  workflowContentHash,
  type WorkflowDefinition,
} from "../services/workflowStudioContracts";
import { compileWorkflowEdit, compileWorkflowIntent } from "../services/workflowBuilderCompiler";
import {
  listCanonicalNodeTypes,
  toCanonicalWorkflowDefinition,
  type LegacyStudioGraph,
} from "../services/workflowStudioCanonicalAdapter";
import {
  CORE_NODE_TYPE_IDS,
  getNodeTypeManifest,
  validateNodeInstance,
} from "../services/workflowNodeContracts";
import {
  buildWorkflowExecutionPlan,
  normalizeWorkflowRunRequest,
  pinWorkflowRunPlan,
  workflowControlActionBlocker,
  workflowInputFingerprint,
  workflowRunIntentMatches,
  type WorkflowRunMode,
} from "../services/workflowStudioRuntime";
import { createControlPlaneJob } from "../services/jobControlPlaneGateway";
import { createJobControlPlane } from "../services/jobControlPlane";
import { defaultJobExecutorRegistry } from "../services/jobExecutorRegistry";
import { getWorkflowWorkerJobStatus } from "../services/workflowWorkerRuntimeService";
import { stableWorkflowDigest } from "../services/workflowCompilerRuntimeContracts";
import { isWorkflowNodeTaskDispatcherConfigured } from "../services/workflowNodeTaskExecutor";

const workflowDefinitionSchema = z
  .record(z.string(), z.unknown());

const workflowBuilderOptionSchema = z.object({
  id: z.string().min(1).max(128),
  typeId: z.enum(CORE_NODE_TYPE_IDS),
  binding: z.object({
    kind: z.enum([
      "trigger-source", "capability", "model", "agent", "workflow",
      "retrieval-source", "computer-use-profile", "verifier",
    ]),
    ref: z.string().min(1).max(256),
  }).passthrough().optional(),
  ready: z.boolean().optional(),
  reasonCode: z.string().max(128),
});

function canonicalizeStudioDefinition(
  input: unknown,
  workflowId: string,
  version: string
): WorkflowDefinition {
  if (
    input &&
    typeof input === "object" &&
    (input as { schemaVersion?: unknown }).schemaVersion === "2"
  ) {
    return input as WorkflowDefinition;
  }
  return toCanonicalWorkflowDefinition({
    graph: input as LegacyStudioGraph,
    workflowId,
    version,
  }).definition;
}

export const tenantIdFromContext = (ctx: {
  tenantId: unknown;
  user: { currentTenantId?: unknown };
}): string => {
  const tenantId = resolveTenantIdVarchar(
    ctx.tenantId,
    ctx.user.currentTenantId
  );
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Tenant context required",
    });
  }
  return tenantId;
};

export function canEditWorkflow(
  ctx: { user: { id: number; role: string } },
  ownerUserId: number
): boolean {
  return (
    ctx.user.id === ownerUserId ||
    ctx.user.role === "admin" ||
    ctx.user.role === "system_agent"
  );
}

function safeDefinition(row: typeof workflowStudioDefinitions.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    accessMode: row.accessMode,
    currentVersionNumber: row.currentVersionNumber,
    draftRevision: row.draftRevision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getPublicMarketplacePackage(input: {
  appId?: string;
  slug?: string;
}) {
  const db = getDb();
  const [item] = await db
    .select({
      app: workflowStudioApps,
      definition: workflowStudioDefinitions,
      version: workflowStudioVersions,
    })
    .from(workflowStudioApps)
    .innerJoin(
      workflowStudioDefinitions,
      eq(workflowStudioApps.definitionId, workflowStudioDefinitions.id)
    )
    .innerJoin(
      workflowStudioVersions,
      eq(workflowStudioApps.versionId, workflowStudioVersions.id)
    )
    .where(
      and(
        input.appId
          ? eq(workflowStudioApps.id, input.appId)
          : eq(workflowStudioApps.slug, input.slug!),
        eq(workflowStudioApps.status, "published"),
        eq(workflowStudioApps.accessMode, "public"),
        eq(workflowStudioDefinitions.status, "published"),
        eq(workflowStudioVersions.status, "published")
      )
    )
    .limit(1);
  if (!item) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Published Marketplace workflow not found",
    });
  }
  const definition = item.version.semanticDefinitionJson as WorkflowDefinition;
  const capabilities = definition.nodes.map(node => {
    let ready = false;
    let reasonCode = "workflow_node_runtime_adapter_required";
    try {
      validateNodeInstance(node);
      getNodeTypeManifest(node.typeId, node.typeVersion);
    } catch {
      ready = false;
      reasonCode = "canonical_node_invalid";
    }
    return {
      nodeId: node.id,
      capability: node.typeId,
      ready,
      reasonCode: ready ? "ready" : reasonCode,
    };
  });
  return {
    app: {
      id: item.app.id,
      slug: item.app.slug,
      tags: item.app.tagsJson,
      accessMode: item.app.accessMode,
      publishedAt: item.app.publishedAt,
    },
    definition: {
      id: item.definition.id,
      name: item.definition.name,
      description: item.definition.description,
    },
    version: {
      id: item.version.id,
      versionNumber: item.version.versionNumber,
      contentHash: item.version.contentHash,
      inputSchema: item.version.inputSchemaJson,
      outputSchema: item.version.outputSchemaJson,
      publishedAt: item.version.publishedAt,
    },
    targets: definition.nodes.map(node => ({ id: node.id, type: node.typeId })),
    readiness: {
      ready: capabilities.every(item => item.ready),
      reasonCode: capabilities.every(item => item.ready)
        ? "ready"
        : "workflow_node_runtime_adapter_required",
      capabilities,
    },
    pricing: { disclosed: false, reasonCode: "pricing_not_configured" },
  };
}

export const workflowStudioRouter = router({
  nodeTypes: protectedProcedure
    .input(z.object({ query: z.string().max(200).optional() }).optional())
    .query(({ input }) => listCanonicalNodeTypes(input)),

  previewCandidate: protectedProcedure
    .input(
      z.object({
        intent: z.string().trim().min(1).max(2000),
        options: z
          .array(workflowBuilderOptionSchema)
          .min(1)
          .max(32),
      })
    )
    .query(({ input }) => compileWorkflowIntent(input)),

  generateDraft: protectedProcedure
    .input(
      z.object({
        intent: z.string().trim().min(1).max(2000),
        options: z.array(workflowBuilderOptionSchema).min(1).max(32),
      })
    )
    .mutation(({ input }) => compileWorkflowIntent(input)),

  editDraft: protectedProcedure
    .input(
      z.object({
        intent: z.string().trim().min(1).max(2000),
        options: z.array(workflowBuilderOptionSchema).min(1).max(32),
        currentDefinition: workflowDefinitionSchema.optional(),
        targetNodeId: z.string().min(1).max(128).optional(),
      })
    )
    .mutation(({ input }) => input.currentDefinition
      ? compileWorkflowEdit({
          intent: input.intent,
          options: input.options,
          currentDefinition: canonicalizeStudioDefinition(
            input.currentDefinition,
            "builder-edit",
            "1.0.0"
          ),
          targetNodeId: input.targetNodeId,
        })
      : compileWorkflowIntent(input)),

  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = tenantIdFromContext(ctx);
    const rows = await getDb()
      .select()
      .from(workflowStudioDefinitions)
      .where(eq(workflowStudioDefinitions.tenantId, tenantId))
      .orderBy(desc(workflowStudioDefinitions.updatedAt))
      .limit(100);
    return rows.map(safeDefinition);
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const [definition] = await getDb()
        .select()
        .from(workflowStudioDefinitions)
        .where(
          and(
            eq(workflowStudioDefinitions.id, input.id),
            eq(workflowStudioDefinitions.tenantId, tenantId)
          )
        )
        .limit(1);
      if (!definition) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }
      const versions = await getDb()
        .select()
        .from(workflowStudioVersions)
        .where(
          and(
            eq(workflowStudioVersions.definitionId, definition.id),
            eq(workflowStudioVersions.tenantId, tenantId)
          )
        )
        .orderBy(desc(workflowStudioVersions.versionNumber));
      return {
        definition: safeDefinition(definition),
        semanticDefinitionJson: definition.semanticDefinitionJson,
        miniAppSchemaJson: definition.miniAppSchemaJson,
        draftRevision: definition.draftRevision,
        versions: versions.map(version => ({
          id: version.id,
          versionNumber: version.versionNumber,
          contentHash: version.contentHash,
          status: version.status,
          publishedAt: version.publishedAt,
          createdAt: version.createdAt,
        })),
      };
    }),

  createDraft: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(200),
        description: z.string().max(1000).optional(),
        definition: workflowDefinitionSchema,
        miniAppSchema: z.record(z.string(), z.unknown()).default({}),
        accessMode: z.enum(["private", "tenant", "public"]).default("private"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const definitionId = randomUUID();
      const canonicalDefinition = canonicalizeStudioDefinition(
        input.definition,
        definitionId,
        "1.0.0"
      );
      const draft = createWorkflowDraft({
        id: definitionId,
        tenantId,
        ownerUserId: ctx.user.id,
        name: input.name,
        definition: canonicalDefinition,
      });
      await getDb().insert(workflowStudioDefinitions).values({
        id: draft.id,
        tenantId,
        ownerUserId: ctx.user.id,
        name: draft.name,
        description: input.description,
        status: "draft",
        semanticDefinitionJson: draft.semanticDefinitionJson,
        miniAppSchemaJson: input.miniAppSchema,
        accessMode: input.accessMode,
      });
      const versionId = randomUUID();
      await getDb()
        .insert(workflowStudioVersions)
        .values({
          id: versionId,
          definitionId: draft.id,
          tenantId,
          versionNumber: 1,
          contentHash: workflowContentHash(draft.semanticDefinitionJson),
          semanticDefinitionJson: draft.semanticDefinitionJson,
          inputSchemaJson: {},
          outputSchemaJson: {},
          status: "draft",
        });
      return {
        id: draft.id,
        versionId,
        draftRevision: 0,
        status: "draft" as const,
      };
    }),

  saveDraft: protectedProcedure
    .input(
      z.object({
        definitionId: z.string().uuid(),
        expectedRevision: z.number().int().nonnegative(),
        definition: workflowDefinitionSchema,
        name: z.string().trim().min(1).max(200).optional(),
        description: z.string().max(1000).nullable().optional(),
        miniAppSchema: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const db = getDb();
      const [existing] = await db
        .select()
        .from(workflowStudioDefinitions)
        .where(
          and(
            eq(workflowStudioDefinitions.id, input.definitionId),
            eq(workflowStudioDefinitions.tenantId, tenantId)
          )
        )
        .limit(1);
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }
      if (!canEditWorkflow(ctx, existing.ownerUserId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Workflow edit access required",
        });
      }
      if (existing.status !== "draft") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Published workflow versions are immutable; create a new draft",
        });
      }
      try {
        assertWorkflowDraftRevision(
          input.expectedRevision,
          existing.draftRevision
        );
      } catch {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Workflow draft changed in another tab; reload before saving",
        });
      }
      const normalized = createWorkflowDraft({
        tenantId,
        ownerUserId: existing.ownerUserId,
        name: input.name ?? existing.name,
        definition: canonicalizeStudioDefinition(
          input.definition,
          existing.id,
          "1.0.0"
        ),
      });
      const nextRevision = existing.draftRevision + 1;
      const [updated] = await db
        .update(workflowStudioDefinitions)
        .set({
          name: normalized.name,
          ...(input.description === undefined
            ? {}
            : { description: input.description }),
          semanticDefinitionJson: normalized.semanticDefinitionJson,
          ...(input.miniAppSchema === undefined
            ? {}
            : { miniAppSchemaJson: input.miniAppSchema }),
          draftRevision: nextRevision,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowStudioDefinitions.id, input.definitionId),
            eq(workflowStudioDefinitions.tenantId, tenantId),
            eq(workflowStudioDefinitions.draftRevision, input.expectedRevision),
            eq(workflowStudioDefinitions.status, "draft")
          )
        )
        .returning({
          id: workflowStudioDefinitions.id,
          draftRevision: workflowStudioDefinitions.draftRevision,
          updatedAt: workflowStudioDefinitions.updatedAt,
        });
      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Workflow draft changed in another tab; reload before saving",
        });
      }
      await db
        .update(workflowStudioVersions)
        .set({
          contentHash: workflowContentHash(normalized.semanticDefinitionJson),
          semanticDefinitionJson: normalized.semanticDefinitionJson,
        })
        .where(
          and(
            eq(workflowStudioVersions.definitionId, input.definitionId),
            eq(workflowStudioVersions.tenantId, tenantId),
            eq(workflowStudioVersions.versionNumber, 1),
            eq(workflowStudioVersions.status, "draft")
          )
        );
      return {
        id: updated.id,
        draftRevision: updated.draftRevision,
        updatedAt: updated.updatedAt,
        status: "saved" as const,
      };
    }),

  run: protectedProcedure
    .input(
      z.object({
        definitionId: z.string().uuid(),
        versionId: z.string().uuid(),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        marketplaceAppId: z.string().uuid().optional(),
        input: z.record(z.string(), z.unknown()).default({}),
        mode: z.enum([
          "full",
          "run_until",
          "run_from",
          "run_node",
          "run_subflow",
        ]),
        targetNodeId: z.string().min(1).max(128).optional(),
        checkpointId: z.string().uuid().optional(),
        idempotencyKey: z.string().trim().min(1).max(160),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const db = getDb();
      let definitionTenantId = tenantId;
      let marketplaceApp: typeof workflowStudioApps.$inferSelect | undefined;
      if (input.marketplaceAppId) {
        const [publicApp] = await db
          .select()
          .from(workflowStudioApps)
          .where(
            and(
              eq(workflowStudioApps.id, input.marketplaceAppId),
              eq(workflowStudioApps.status, "published"),
              eq(workflowStudioApps.accessMode, "public")
            )
          )
          .limit(1);
        if (!publicApp) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Published Marketplace workflow not found",
          });
        }
        if (
          publicApp.definitionId !== input.definitionId ||
          publicApp.versionId !== input.versionId
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Marketplace version changed; reload before running",
          });
        }
        marketplaceApp = publicApp;
        definitionTenantId = publicApp.tenantId;
      }
      const [definition] = await db
        .select()
        .from(workflowStudioDefinitions)
        .where(
          and(
            eq(workflowStudioDefinitions.id, input.definitionId),
            eq(workflowStudioDefinitions.tenantId, definitionTenantId)
          )
        )
        .limit(1);
      if (!definition)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      const canRunDraft =
        !marketplaceApp &&
        definition.status === "draft" &&
        canEditWorkflow(ctx, definition.ownerUserId);
      if (
        (definition.status !== "published" ||
          (marketplaceApp && definition.status !== "published")) &&
        !canRunDraft
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Workflow run access required",
        });
      }
      const [version] = await db
        .select()
        .from(workflowStudioVersions)
        .where(
          and(
            eq(workflowStudioVersions.id, input.versionId),
            eq(workflowStudioVersions.definitionId, input.definitionId),
            eq(workflowStudioVersions.tenantId, definitionTenantId),
            ...(marketplaceApp
              ? [eq(workflowStudioVersions.status, "published")]
              : [])
          )
        )
        .limit(1);
      if (!version)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow version not found",
        });
      if (
        workflowContentHash(
          version.semanticDefinitionJson as WorkflowDefinition
        ) !== input.contentHash ||
        version.contentHash !== input.contentHash
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Workflow version changed; reload before running",
        });
      }
      let normalized;
      try {
        normalized = normalizeWorkflowRunRequest(input);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            error instanceof Error
              ? error.message
              : "Invalid workflow run request",
        });
      }
      let completedNodeIds: string[] | undefined;
      let completedOutputRefs: Record<string, string[]> | undefined;
      if (normalized.mode === "run_from") {
        const [checkpoint] = await db
          .select()
          .from(workflowStudioCheckpoints)
          .where(
            and(
              eq(workflowStudioCheckpoints.id, normalized.checkpointId!),
              eq(workflowStudioCheckpoints.tenantId, tenantId),
              eq(workflowStudioCheckpoints.versionId, input.versionId),
              eq(workflowStudioCheckpoints.contentHash, input.contentHash),
              eq(
                workflowStudioCheckpoints.inputFingerprint,
                workflowInputFingerprint(normalized.input)
              ),
              eq(workflowStudioCheckpoints.status, "ready")
            )
          )
          .limit(1);
        if (!checkpoint) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "Checkpoint is stale, missing, or belongs to another version",
          });
        }
        const checkpointOutput = checkpoint.outputJson;
        const artifactRefsByNode = checkpointOutput?.artifactRefsByNode;
        const sourcePlanHash = checkpointOutput?.planHash;
        if (!Array.isArray(artifactRefsByNode) || typeof sourcePlanHash !== "string") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Checkpoint does not contain verifiable node output references",
          });
        }
        const refs: Record<string, string[]> = {};
        const verifiedOutputs: Array<{ nodeId: string; refs: string[]; digest: string }> = [];
        for (const entry of artifactRefsByNode) {
          if (!entry || typeof entry !== "object")
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkpoint output reference record is invalid" });
          const nodeOutput = entry as { nodeId?: unknown; refs?: unknown; digest?: unknown };
          if (typeof nodeOutput.nodeId !== "string" || typeof nodeOutput.digest !== "string" || !/^[a-f0-9]{64}$/i.test(nodeOutput.digest) || !Array.isArray(nodeOutput.refs) || !nodeOutput.refs.length || !nodeOutput.refs.every(ref => typeof ref === "string"))
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkpoint output reference record is invalid" });
          if (refs[nodeOutput.nodeId])
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkpoint repeats a node output record" });
          const nodeRefs = [...(nodeOutput.refs as string[])].sort();
          refs[nodeOutput.nodeId] = nodeRefs;
          verifiedOutputs.push({ nodeId: nodeOutput.nodeId, refs: nodeRefs, digest: nodeOutput.digest });
        }
        verifiedOutputs.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
        const expectedCheckpointDigest = stableWorkflowDigest({
          runId: checkpoint.runId,
          planHash: sourcePlanHash,
          completedNodeIds: [...checkpoint.completedNodeIdsJson].sort(),
          artifactRefsByNode: verifiedOutputs,
        });
        if (
          expectedCheckpointDigest !== checkpoint.digest ||
          stableWorkflowDigest(Object.keys(refs).sort()) !== stableWorkflowDigest([...checkpoint.completedNodeIdsJson].sort()) ||
          stableWorkflowDigest(Object.values(refs).flat().sort()) !== stableWorkflowDigest([...checkpoint.artifactRefsJson].sort())
        )
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Checkpoint integrity validation failed" });
        completedNodeIds = checkpoint.completedNodeIdsJson;
        completedOutputRefs = refs;
      }
      const runId = randomUUID();
      let plan;
      try {
        plan = buildWorkflowExecutionPlan({
          tenantId,
          actorId: ctx.user.id,
          runId,
          definitionId: input.definitionId,
          versionId: input.versionId,
          contentHash: input.contentHash,
          definition: version.semanticDefinitionJson as WorkflowDefinition,
          input: normalized.input,
          mode: normalized.mode as WorkflowRunMode,
          targetNodeId: normalized.targetNodeId,
          checkpointId: normalized.checkpointId,
          completedNodeIds,
          completedOutputRefs,
          idempotencyKey: input.idempotencyKey,
        });
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Workflow is not ready to run",
        });
      }
      const resolvedInput = plan.input.input;
      const inputFingerprint = workflowInputFingerprint(resolvedInput);
      const planSnapshot = pinWorkflowRunPlan({ plan, inputFingerprint });
      const planHash = stableWorkflowDigest(planSnapshot);
      const [existing] = await db
        .select()
        .from(workflowStudioRuns)
        .where(
          and(
            eq(workflowStudioRuns.tenantId, tenantId),
            eq(workflowStudioRuns.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      if (existing) {
        if (!workflowRunIntentMatches(existing, {
          contentHash: input.contentHash,
          versionId: input.versionId,
          inputFingerprint,
          mode: plan.input.mode,
          targetNodeId: plan.input.targetNodeId,
          checkpointId: plan.input.checkpointId,
          selectedNodeIds: plan.input.selectedNodeIds,
          planHash,
        })) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Idempotency key was already used for another workflow intent",
          });
        }
        return {
          runId: existing.id,
          status: existing.status,
          jobRefs: existing.canonicalJobRefsJson,
          replayed: true as const,
        };
      }
      if (plan.jobs.some(job =>
        !defaultJobExecutorRegistry.has(job.jobType, job.contractVersion)
      ) || !isWorkflowNodeTaskDispatcherConfigured()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Workflow node executor or adapter dispatcher is not configured",
        });
      }
      if (plan.initialJobs.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No selected workflow node has all required committed inputs",
        });
      }
      await db.insert(workflowStudioRuns).values({
        id: runId,
        tenantId,
        actorUserId: ctx.user.id,
        definitionId: input.definitionId,
        versionId: input.versionId,
        contentHash: input.contentHash,
        inputFingerprint,
        inputJson: resolvedInput,
        mode: normalized.mode,
        targetNodeId: normalized.targetNodeId,
        checkpointId: normalized.checkpointId,
        selectedNodeIdsJson: plan.input.selectedNodeIds,
        idempotencyKey: input.idempotencyKey,
        executionPlanJson: planSnapshot as unknown as Record<string, unknown>,
        planHash,
        status: "admitting",
        runRevision: 0,
      });
      try {
        const nodeRunIds = new Map<string, string>();
        const plannedNodeRunIds = new Map(plan.jobs.map(job => [
          String(job.input.nodeId),
          String(job.input.nodeRunId),
        ]));
        const initialNodeIds = new Set(plan.initialJobs.map(job => String(job.input.nodeId)));
        const compiledNodes = new Map(plan.workflowPlan.nodes.map(node => [node.nodeId, node]));
        await db.insert(workflowStudioNodeRuns).values(plan.input.selectedNodeIds.map(nodeId => {
          const compiled = compiledNodes.get(nodeId);
          const nodeRunId = plannedNodeRunIds.get(nodeId);
          const plannedNodeJob = plan.jobs.find(job => String(job.input.nodeId) === nodeId);
          if (!compiled || !nodeRunId) throw new Error("PLANNED_NODE_RUN_INVALID");
          nodeRunIds.set(nodeId, nodeRunId);
          return {
            id: nodeRunId,
            tenantId,
            runId,
            nodeId,
            nodeType: compiled.typeId,
            adapterVersion: compiled.typeVersion,
            status: initialNodeIds.has(nodeId) ? "ready" : "pending",
            inputArtifactRefsJson: Array.isArray(plannedNodeJob?.input.inputArtifactRefs)
              ? plannedNodeJob.input.inputArtifactRefs.filter((ref): ref is string => typeof ref === "string")
              : [],
          };
        }));
        const jobs = [] as Array<{ jobId: string; created: boolean }>;
        for (const nodeJob of plan.initialJobs) {
          const job = await createControlPlaneJob({
            context: {
              tenantId,
              actorType: "user",
              actorId: ctx.user.id,
              authorizationScope: "workflow-studio.run",
              correlationId: `${runId}:${String(nodeJob.input.nodeRunId)}`,
              idempotencyKey: nodeJob.idempotencyKey,
            },
            definition: nodeJob,
            executorRegistry: defaultJobExecutorRegistry,
            createOptions: {
              admissionMode: "durable_queue",
              runtimeType: "node_job_worker",
            },
          });
          jobs.push({ jobId: job.jobId, created: job.created });
          const nodeId = String(nodeJob.input.nodeId);
          await db.insert(workflowStudioNodeAttempts).values({
            tenantId,
            runId,
            nodeRunId: nodeRunIds.get(nodeId)!,
            attemptNumber: 1,
            idempotencyKey: nodeJob.idempotencyKey,
            workerJobId: job.jobId,
            status: "admitted",
          }).onConflictDoNothing();
          await db.update(workflowStudioNodeRuns).set({ status: "admitted", updatedAt: new Date() })
            .where(and(
              eq(workflowStudioNodeRuns.id, nodeRunIds.get(nodeId)!),
              eq(workflowStudioNodeRuns.tenantId, tenantId),
              eq(workflowStudioNodeRuns.status, "ready")
            ));
        }
        const jobRefs = jobs.map(job => job.jobId);
        const created = jobs.some(job => job.created);
        await db
          .update(workflowStudioRuns)
          .set({
            status: "admitted",
            canonicalJobRefsJson: jobRefs,
            runRevision: 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workflowStudioRuns.id, runId),
              eq(workflowStudioRuns.tenantId, tenantId)
            )
          );
        await db
          .insert(workflowStudioRunEvents)
          .values({
            runId,
            tenantId,
            sequence: 1,
            eventType: "ADMITTED",
            eventIdempotencyKey: `admitted:${runId}`,
            payloadJson: { jobIds: jobRefs, mode: normalized.mode },
          })
          .onConflictDoNothing();
        return {
          runId,
          status: "admitted" as const,
          jobRefs,
          replayed: !created,
        };
      } catch (error) {
        await db
          .update(workflowStudioRuns)
          .set({
            status: "failed",
            errorJson: {
              reasonCode:
                error instanceof Error ? error.name : "ADMISSION_FAILED",
            },
            runRevision: 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workflowStudioRuns.id, runId),
              eq(workflowStudioRuns.tenantId, tenantId)
            )
          );
        throw error;
      }
    }),

  getRun: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const [run] = await getDb()
        .select()
        .from(workflowStudioRuns)
        .where(
          and(
            eq(workflowStudioRuns.id, input.runId),
            eq(workflowStudioRuns.tenantId, tenantId)
          )
        )
        .limit(1);
      if (!run)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow run not found",
        });
      const events = await getDb()
        .select()
        .from(workflowStudioRunEvents)
        .where(
          and(
            eq(workflowStudioRunEvents.runId, run.id),
            eq(workflowStudioRunEvents.tenantId, tenantId)
          )
        )
        .orderBy(workflowStudioRunEvents.sequence);
      const checkpoints = await getDb()
        .select()
        .from(workflowStudioCheckpoints)
        .where(
          and(
            eq(workflowStudioCheckpoints.runId, run.id),
            eq(workflowStudioCheckpoints.tenantId, tenantId)
          )
        )
        .orderBy(desc(workflowStudioCheckpoints.createdAt));
      const jobs = await Promise.all(
        run.canonicalJobRefsJson.map(jobId =>
          getWorkflowWorkerJobStatus({
            actor: {
              userId: ctx.user.id,
              tenantId,
              role: ctx.user.role,
            },
            jobId,
          }).catch(error => ({
            workerJobId: jobId,
            status: "unavailable",
            error:
              error instanceof Error ? error.message : "Job status unavailable",
          }))
        )
      );
      return { run, events, checkpoints, jobs };
    }),

  controlRun: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        action: z.enum([
          "approve",
          "reject",
          "submit_input",
          "retry",
          "cancel",
          "resume",
        ]),
        expectedRunRevision: z.number().int().nonnegative(),
        actionId: z.string().trim().min(1).max(128),
        reason: z.string().trim().max(500).optional(),
        input: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const db = getDb();
      const [run] = await db
        .select()
        .from(workflowStudioRuns)
        .where(
          and(
            eq(workflowStudioRuns.id, input.runId),
            eq(workflowStudioRuns.tenantId, tenantId)
          )
        )
        .limit(1);
      if (!run)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow run not found",
        });
      if (
        run.actorUserId !== ctx.user.id &&
        !["admin", "system_agent"].includes(ctx.user.role)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Workflow run control access required",
        });
      }
      if (run.runRevision !== input.expectedRunRevision) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Workflow run changed; refresh before acting",
        });
      }
      const eventKey = `control:${input.actionId}`;
      const [replayed] = await db
        .select()
        .from(workflowStudioRunEvents)
        .where(
          and(
            eq(workflowStudioRunEvents.runId, run.id),
            eq(workflowStudioRunEvents.eventIdempotencyKey, eventKey)
          )
        )
        .limit(1);
      if (replayed)
        return {
          runId: run.id,
          status: run.status,
          runRevision: run.runRevision,
          replayed: true as const,
        };
      const blockedAction = workflowControlActionBlocker(input.action);
      if (blockedAction)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: blockedAction,
        });
      const jobIds = [...new Set(run.canonicalJobRefsJson)];
      if (jobIds.length === 0)
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Workflow run has no canonical Jobs" });
      const controlPlane = createJobControlPlane();
      const scope = {
        tenantId,
        requestedByUserId: ctx.user.id,
        authorizationScope: "workflow-studio.control",
      };
      const reason = input.reason ?? `workflow_${input.action}`;
      try {
        const statuses = await Promise.all(jobIds.map(jobId =>
          getWorkflowWorkerJobStatus({ actor: { userId: ctx.user.id, tenantId, role: ctx.user.role }, jobId })
        ));
        if (statuses.some(status => typeof status.terminal !== "boolean"))
          throw new Error("WORKFLOW_JOB_STATUS_UNVERIFIED");
        const activeJobIds = jobIds.filter((_, index) => statuses[index].terminal === false);
        if (activeJobIds.length === 0)
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Workflow run has no cancellable jobs" });
        for (const jobId of activeJobIds) {
          const jobActionId = `workflow-cancel:${createHash("sha256").update(`${input.actionId}:${jobId}`).digest("hex").slice(0, 48)}`;
          await controlPlane.requestCancel(jobId, reason, jobActionId, ctx.user.id, scope);
        }
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Workflow control action failed",
        });
      }
      const nextStatus = input.action === "cancel" ? "cancelling" : "resuming";
      const nextRevision = run.runRevision + 1;
      await db
        .update(workflowStudioRuns)
        .set({
          status: nextStatus,
          runRevision: nextRevision,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowStudioRuns.id, run.id),
            eq(workflowStudioRuns.tenantId, tenantId),
            eq(workflowStudioRuns.runRevision, input.expectedRunRevision)
          )
        );
      await db
        .insert(workflowStudioRunEvents)
        .values({
          runId: run.id,
          tenantId,
          sequence: nextRevision,
          eventType: `CONTROL_${input.action.toUpperCase()}`,
          eventIdempotencyKey: eventKey,
          payloadJson: {
            action: input.action,
            actionId: input.actionId,
            reason,
          },
        })
        .onConflictDoNothing();
      return {
        runId: run.id,
        status: nextStatus,
        runRevision: nextRevision,
        replayed: false as const,
      };
    }),

  publishVersion: protectedProcedure
    .input(
      z.object({
        definitionId: z.string().uuid(),
        versionNumber: z.number().int().positive(),
        contentHash: z.string().regex(/^[a-f0-9]{64}$/),
        semanticDefinition: workflowDefinitionSchema,
        inputSchema: z.record(z.string(), z.unknown()).default({}),
        outputSchema: z.record(z.string(), z.unknown()).default({}),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const db = getDb();
      const [definition] = await db
        .select()
        .from(workflowStudioDefinitions)
        .where(
          and(
            eq(workflowStudioDefinitions.id, input.definitionId),
            eq(workflowStudioDefinitions.tenantId, tenantId)
          )
        )
        .limit(1);
      if (!definition) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      }
      if (!canEditWorkflow(ctx, definition.ownerUserId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Workflow edit access required",
        });
      }
      const expectedContentHash = workflowContentHash(
        input.semanticDefinition as WorkflowDefinition
      );
      if (expectedContentHash !== input.contentHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "contentHash does not match the semantic workflow definition",
        });
      }

      const [existing] = await db
        .select()
        .from(workflowStudioVersions)
        .where(
          and(
            eq(workflowStudioVersions.definitionId, input.definitionId),
            eq(workflowStudioVersions.tenantId, tenantId),
            eq(workflowStudioVersions.versionNumber, input.versionNumber)
          )
        )
        .limit(1);
      if (existing) {
        if (existing.contentHash !== input.contentHash) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Published version is immutable",
          });
        }
        if (existing.status === "published") {
          return {
            id: existing.id,
            versionNumber: existing.versionNumber,
            status: existing.status,
          };
        }
        const published = publishWorkflowVersion({
          definitionId: input.definitionId,
          version: input.versionNumber,
          contentHash: input.contentHash,
          status: "draft",
          accessMode: definition.accessMode as "private" | "tenant" | "public",
        });
        await db
          .update(workflowStudioVersions)
          .set({
            status: published.status,
            publishedAt: new Date(published.publishedAt ?? Date.now()),
          })
          .where(
            and(
              eq(workflowStudioVersions.id, existing.id),
              eq(workflowStudioVersions.tenantId, tenantId)
            )
          );
        await db
          .update(workflowStudioDefinitions)
          .set({
            status: "published",
            currentVersionNumber: input.versionNumber,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(workflowStudioDefinitions.id, input.definitionId),
              eq(workflowStudioDefinitions.tenantId, tenantId)
            )
          );
        return {
          id: existing.id,
          versionNumber: existing.versionNumber,
          status: published.status,
        };
      }

      const published = publishWorkflowVersion({
        definitionId: input.definitionId,
        version: input.versionNumber,
        contentHash: input.contentHash,
        status: "draft",
        accessMode: definition.accessMode as "private" | "tenant" | "public",
      });
      const versionId = randomUUID();
      await db.insert(workflowStudioVersions).values({
        id: versionId,
        definitionId: input.definitionId,
        tenantId,
        versionNumber: input.versionNumber,
        contentHash: input.contentHash,
        semanticDefinitionJson: input.semanticDefinition,
        inputSchemaJson: input.inputSchema,
        outputSchemaJson: input.outputSchema,
        status: published.status,
        publishedAt: new Date(published.publishedAt ?? Date.now()),
      });
      await db
        .update(workflowStudioDefinitions)
        .set({
          status: "published",
          currentVersionNumber: input.versionNumber,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(workflowStudioDefinitions.id, input.definitionId),
            eq(workflowStudioDefinitions.tenantId, tenantId)
          )
        );
      return {
        id: versionId,
        versionNumber: input.versionNumber,
        status: "published" as const,
      };
    }),

  publishApp: protectedProcedure
    .input(
      z.object({
        definitionId: z.string().uuid(),
        versionId: z.string().uuid(),
        slug: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .regex(/^[a-z0-9][a-z0-9-]*$/),
        accessMode: z.enum(["private", "tenant", "public"]),
        tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = tenantIdFromContext(ctx);
      const db = getDb();
      const [definition] = await db
        .select()
        .from(workflowStudioDefinitions)
        .where(
          and(
            eq(workflowStudioDefinitions.id, input.definitionId),
            eq(workflowStudioDefinitions.tenantId, tenantId)
          )
        )
        .limit(1);
      if (!definition)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        });
      if (!canEditWorkflow(ctx, definition.ownerUserId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Workflow edit access required",
        });
      }
      const [version] = await db
        .select({
          id: workflowStudioVersions.id,
          status: workflowStudioVersions.status,
        })
        .from(workflowStudioVersions)
        .where(
          and(
            eq(workflowStudioVersions.id, input.versionId),
            eq(workflowStudioVersions.definitionId, input.definitionId),
            eq(workflowStudioVersions.tenantId, tenantId),
            eq(workflowStudioVersions.status, "published")
          )
        )
        .limit(1);
      if (!version)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Published workflow version is required",
        });

      const [existing] = await db
        .select()
        .from(workflowStudioApps)
        .where(
          and(
            eq(workflowStudioApps.tenantId, tenantId),
            eq(workflowStudioApps.slug, input.slug)
          )
        )
        .limit(1);
      if (existing) {
        if (
          existing.versionId !== input.versionId ||
          existing.accessMode !== input.accessMode
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Published Mini App slug is immutable",
          });
        }
        return {
          id: existing.id,
          status: existing.status as "published",
          replayed: true,
        };
      }
      const appId = randomUUID();
      await db.insert(workflowStudioApps).values({
        id: appId,
        definitionId: input.definitionId,
        versionId: input.versionId,
        tenantId,
        slug: input.slug,
        tagsJson: [...new Set(input.tags)],
        accessMode: input.accessMode,
        status: "published",
        publishedAt: new Date(),
      });
      return { id: appId, status: "published" as const, replayed: false };
    }),

  marketplaceDetail: publicProcedure
    .input(
      z
        .object({
          appId: z.string().uuid().optional(),
          slug: z.string().trim().min(1).max(160).optional(),
        })
        .refine(value => Boolean(value.appId || value.slug), {
          message: "appId or slug is required",
        })
    )
    .query(({ input }) => getPublicMarketplacePackage(input)),

  dependencyCheck: protectedProcedure
    .input(
      z
        .object({
          appId: z.string().uuid().optional(),
          slug: z.string().trim().min(1).max(160).optional(),
        })
        .refine(value => Boolean(value.appId || value.slug), {
          message: "appId or slug is required",
        })
    )
    .query(async ({ input }) => {
      const detail = await getPublicMarketplacePackage(input);
      return {
        ...detail.readiness,
        checkedAt: new Date().toISOString(),
        revision: detail.version.contentHash,
      };
    }),

  entitlement: protectedProcedure
    .input(
      z
        .object({
          appId: z.string().uuid().optional(),
          slug: z.string().trim().min(1).max(160).optional(),
        })
        .refine(value => Boolean(value.appId || value.slug), {
          message: "appId or slug is required",
        })
    )
    .query(async ({ input }) => {
      const detail = await getPublicMarketplacePackage(input);
      return {
        inspect: { allowed: true, reasonCode: "public_published" },
        run: {
          allowed: detail.readiness.ready,
          reasonCode: detail.readiness.ready
            ? "public_published"
            : detail.readiness.reasonCode,
        },
        clone: { allowed: false, reasonCode: "clone_contract_not_enabled" },
      };
    }),

  marketplace: publicProcedure
    .input(z.object({ tag: z.string().trim().max(80).optional() }).optional())
    .query(async ({ input }) => {
      const rows = await getDb()
        .select({
          id: workflowStudioApps.id,
          definitionId: workflowStudioApps.definitionId,
          versionId: workflowStudioApps.versionId,
          slug: workflowStudioApps.slug,
          tags: workflowStudioApps.tagsJson,
          name: workflowStudioDefinitions.name,
          description: workflowStudioDefinitions.description,
          accessMode: workflowStudioApps.accessMode,
          updatedAt: workflowStudioApps.publishedAt,
        })
        .from(workflowStudioApps)
        .innerJoin(
          workflowStudioDefinitions,
          eq(workflowStudioApps.definitionId, workflowStudioDefinitions.id)
        )
        .innerJoin(
          workflowStudioVersions,
          eq(workflowStudioApps.versionId, workflowStudioVersions.id)
        )
        .where(
          and(
            eq(workflowStudioApps.status, "published"),
            eq(workflowStudioApps.accessMode, "public"),
            eq(workflowStudioDefinitions.status, "published"),
            eq(workflowStudioVersions.status, "published")
          )
        )
        .orderBy(desc(workflowStudioApps.publishedAt))
        .limit(100);
      return input?.tag
        ? rows.filter(row => row.tags.includes(input.tag!))
        : rows;
    }),
});

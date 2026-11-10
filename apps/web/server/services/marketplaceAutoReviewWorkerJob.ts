import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { workerJobs } from "../../drizzle/schema";
import { createCanonicalJobInTransaction } from "./jobControlPlane";
import { createControlPlaneJob } from "./jobControlPlaneGateway";

export const MARKETPLACE_AUTO_REVIEW_WORKER_JOB_TYPE =
  "marketplace.auto_review.execute";
export const MARKETPLACE_AUTO_REVIEW_WORKER_CONTRACT_VERSION =
  "feature-186-v1" as const;

const runIdSchema = z.string().trim().min(1).max(64);
const operationIdempotencySchema = z.string().trim().min(8).max(200);
const stagedSelectedConceptSchema = z
  .object({
    conceptId: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(160),
    angle: z.string().trim().min(1).max(400),
    storySummary: z.string().trim().min(1).max(500),
  })
  .strict();

export const marketplaceAutoReviewWorkerInputSchema = z.discriminatedUnion(
  "operation",
  [
    z
      .object({
        operation: z.enum([
          "advance_run",
          "initialize_run",
          "initialize_staged_metadata",
          "draft_quality_qc",
        ]),
        runId: runIdSchema,
        operationId: z.string().trim().min(1).max(80).optional(),
      })
      .strict(),
    z
      .object({
        operation: z.literal("sequential_image_edit_reconciliation"),
        runId: runIdSchema,
        shotId: z.number().int().min(1).max(30),
        taskId: z.string().trim().min(1).max(200),
        pollAttempt: z.number().int().min(0).max(1000),
      })
      .strict(),
    z
      .object({
        operation: z.literal("staged_story_redraft"),
        runId: runIdSchema,
        expectedStateDigest: z.string().trim().min(1).max(256),
        requestIdempotencyKey: operationIdempotencySchema,
        notes: z.string().trim().max(1200).optional(),
        model: z.string().trim().max(128).optional(),
        selectedConcept: stagedSelectedConceptSchema.optional(),
      })
      .strict(),
    z
      .object({
        operation: z.literal("staged_prompt_generation"),
        runId: runIdSchema,
        shotId: z.number().int().min(1).max(30),
        stage: z.enum(["image", "video"]),
        expectedStateDigest: z.string().trim().min(1).max(256),
        expectedShotRevision: z.number().int().min(0).optional(),
        promptContextDigest: z.string().trim().min(1).max(256).optional(),
        requestIdempotencyKey: operationIdempotencySchema,
        instruction: z.string().trim().max(2000).optional(),
        model: z.string().trim().max(128).optional(),
      })
      .strict(),
    z
      .object({
        operation: z.literal("staged_bulk_generation"),
        runId: runIdSchema,
        expectedStateDigest: z.string().trim().min(1).max(256),
        requestIdempotencyKey: operationIdempotencySchema,
        targets: z
          .array(
            z
              .object({
                shotId: z.number().int().min(1).max(30),
                stage: z.enum(["image", "video"]),
                model: z.string().trim().max(200).optional(),
                promptModel: z.string().trim().max(128).optional(),
                refreshPrompt: z.boolean().optional(),
                promptOnly: z.boolean().optional(),
                replaceExisting: z.boolean().optional(),
              })
              .strict()
          )
          .min(1)
          .max(30),
      })
      .strict(),
    z
      .object({
        operation: z.literal("sequential_shot_regeneration"),
        runId: runIdSchema,
        shotId: z.number().int().min(1).max(9),
        refreshPrompt: z.boolean(),
        requestIdempotencyKey: operationIdempotencySchema,
      })
      .strict(),
    z
      .object({
        operation: z.literal("sequential_shot_prompt_generation"),
        runId: runIdSchema,
        shotId: z.number().int().min(1).max(9),
        stage: z.enum(["image", "video", "summary", "dialogue"]),
        requestIdempotencyKey: operationIdempotencySchema,
      })
      .strict(),
    z
      .object({
        operation: z.literal("plan_redraft"),
        runId: runIdSchema,
        notes: z.string().trim().max(2000).optional(),
        requestIdempotencyKey: operationIdempotencySchema,
      })
      .strict(),
  ]
);

export type MarketplaceAutoReviewWorkerInput = z.infer<
  typeof marketplaceAutoReviewWorkerInputSchema
>;

export type MarketplaceAutoReviewJobOperation =
  MarketplaceAutoReviewWorkerInput["operation"];

type MarketplaceAutoReviewAdmission = {
  tenantId: string;
  userId: number;
  runId: string;
  operation: MarketplaceAutoReviewWorkerInput;
  idempotencyKey: string;
  priority?: number;
  scheduledAt?: Date;
};

function canonicalIdempotencyKey(value: string): string {
  const digest = createHash("sha256").update(value).digest("hex");
  return `marketplace-auto-review:${digest}`;
}

function buildDefinition(input: MarketplaceAutoReviewAdmission) {
  const parsedOperation = marketplaceAutoReviewWorkerInputSchema.parse(
    input.operation
  );
  // Zod preserves optional object keys that were explicitly supplied as
  // `undefined`. That is valid in a TypeScript object but is not a JSON value,
  // so worker job canonicalization correctly rejects it. Round-trip the
  // schema-validated operation through JSON to omit undefined object fields
  // before it crosses the durable job boundary.
  const serializedOperation = JSON.stringify(parsedOperation);
  if (typeof serializedOperation !== "string") {
    throw new Error("MARKETPLACE_AUTO_REVIEW_JOB_INPUT_NOT_JSON");
  }
  const operation = JSON.parse(
    serializedOperation
  ) as MarketplaceAutoReviewWorkerInput;
  if (operation.runId !== input.runId) {
    throw new Error("MARKETPLACE_AUTO_REVIEW_JOB_RUN_MISMATCH");
  }
  const idempotencyKey = canonicalIdempotencyKey(input.idempotencyKey);
  const waitsForShotMedia =
    operation.operation === "staged_prompt_generation" ||
    (operation.operation === "staged_bulk_generation" &&
      operation.targets.some(target => target.promptOnly === true));
  return {
    definition: {
      tenantId: input.tenantId,
      requestedByUserId: input.userId,
      contractVersion: MARKETPLACE_AUTO_REVIEW_WORKER_CONTRACT_VERSION,
      jobType: MARKETPLACE_AUTO_REVIEW_WORKER_JOB_TYPE,
      executionClass: "long" as const,
      priority: input.priority ?? 30,
      input: operation as unknown as Record<string, unknown>,
      idempotencyKey,
      retryPolicy: {
        // Prompt repair can be queued while the previous render completes.
        // Retries are short, bounded metadata checks; no provider work starts
        // until the shot's media task is settled.
        maxAttempts: waitsForShotMedia ? 60 : 3,
        baseDelayMs: waitsForShotMedia ? 10_000 : 5_000,
        maxDelayMs: waitsForShotMedia ? 60_000 : 5 * 60_000,
        jitter: "bounded" as const,
        deadlineMs: 6 * 60 * 60_000,
        allowedErrorClasses: ["retryable", "timeout", "unavailable"],
      },
      timeoutPolicy: {
        softTimeoutMs: 10 * 60_000,
        hardTimeoutMs: 60 * 60_000,
      },
      ...(input.scheduledAt
        ? { scheduledAt: input.scheduledAt.toISOString() }
        : {}),
    },
    idempotencyKey,
  };
}

/**
 * Admit Auto Review work through the canonical `worker_jobs` plus outbox
 * gateway. Job payloads contain bounded references and user input only; the
 * worker reloads the authoritative run under its requester/tenant binding.
 */
export async function enqueueMarketplaceAutoReviewWorkerJob(
  input: MarketplaceAutoReviewAdmission
) {
  if (
    !input.tenantId.trim() ||
    !Number.isSafeInteger(input.userId) ||
    input.userId <= 0
  ) {
    throw new Error("MARKETPLACE_AUTO_REVIEW_JOB_OWNER_INVALID");
  }
  const { definition, idempotencyKey } = buildDefinition(input);
  return createControlPlaneJob({
    context: {
      tenantId: input.tenantId,
      actorType: "user",
      actorId: input.userId,
      authorizationScope: `marketplace-auto-review:${input.operation.operation}`,
      correlationId: `marketplace-auto-review:${input.runId}`,
      idempotencyKey,
    },
    definition,
    createOptions: {
      runtimeType: "node_job_worker",
      admissionMode: "durable_queue",
    },
  });
}

/**
 * Transaction variant used when the job admission must commit atomically with
 * the Marketplace Auto Review checkpoint/run transition that caused it.
 */
export async function enqueueMarketplaceAutoReviewWorkerJobInTransaction(input: {
  query: any;
  admission: MarketplaceAutoReviewAdmission;
  canonicalJobId?: string;
}) {
  const { definition, idempotencyKey } = buildDefinition(input.admission);
  const [existing] = await input.query
    .select({
      id: workerJobs.id,
      jobType: workerJobs.jobType,
      inputJson: workerJobs.inputJson,
    })
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.tenantId, input.admission.tenantId),
        eq(workerJobs.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  if (existing) {
    const existingInput = marketplaceAutoReviewWorkerInputSchema.safeParse(
      existing.inputJson
    );
    if (
      existing.jobType !== MARKETPLACE_AUTO_REVIEW_WORKER_JOB_TYPE ||
      !existingInput.success ||
      JSON.stringify(existingInput.data) !==
        JSON.stringify(input.admission.operation)
    ) {
      throw new Error("MARKETPLACE_AUTO_REVIEW_IDEMPOTENCY_CONFLICT");
    }
    return { jobId: existing.id, created: false };
  }

  return createCanonicalJobInTransaction({
    query: input.query,
    definition,
    options: {
      runtimeType: "node_job_worker",
      admissionMode: "durable_queue",
      ...(input.canonicalJobId ? { canonicalJobId: input.canonicalJobId } : {}),
    },
    createdPayload: {
      source: "marketplace_auto_review",
      operation: input.admission.operation.operation,
    },
    queuedPayload: {
      source: "marketplace_auto_review",
      operation: input.admission.operation.operation,
    },
  });
}

export async function findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
  query: any,
  tenantId: string,
  idempotencyKey: string
) {
  const [job] = await query
    .select({
      id: workerJobs.id,
      jobType: workerJobs.jobType,
      inputJson: workerJobs.inputJson,
      status: workerJobs.status,
    })
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.tenantId, tenantId),
        eq(workerJobs.idempotencyKey, canonicalIdempotencyKey(idempotencyKey))
      )
    )
    .limit(1);
  return job ?? null;
}

export function marketplaceAutoReviewOperationFromLegacyJobType(
  jobType: string,
  payload: Record<string, unknown> = {}
): MarketplaceAutoReviewWorkerInput | null {
  const runId = typeof payload.runId === "string" ? payload.runId : "";
  if (!runId) return null;
  switch (jobType) {
    case "initialize_run":
      return { operation: "initialize_run", runId };
    case "advance_run":
    case "provider_reconciliation_recovery":
      return { operation: "advance_run", runId };
    case "draft_quality_qc":
      return { operation: "draft_quality_qc", runId };
    case "initialize_staged_metadata":
      return { operation: "initialize_staged_metadata", runId };
    case "sequential_image_edit_reconciliation":
      return marketplaceAutoReviewWorkerInputSchema.parse({
        operation: "sequential_image_edit_reconciliation",
        runId,
        shotId: Number(payload.shotId),
        taskId: payload.taskId,
        pollAttempt: Number(payload.pollAttempt ?? 0),
      });
    case "sequential_shot_regeneration":
      return marketplaceAutoReviewWorkerInputSchema.parse({
        operation: "sequential_shot_regeneration",
        runId,
        shotId: Number(payload.shotId),
        refreshPrompt: payload.refreshPrompt === true,
        requestIdempotencyKey: String(payload.requestIdempotencyKey ?? ""),
      });
    case "sequential_shot_prompt_generation":
      return marketplaceAutoReviewWorkerInputSchema.parse({
        operation: "sequential_shot_prompt_generation",
        runId,
        shotId: Number(payload.shotId),
        stage: payload.stage,
        requestIdempotencyKey: String(payload.requestIdempotencyKey ?? ""),
      });
    default:
      return null;
  }
}

export async function executeMarketplaceAutoReviewWorkerJob(input: {
  job: MarketplaceAutoReviewWorkerInput;
  tenantId: string;
  userId: number;
  jobId: string;
}) {
  const auth = { userId: input.userId, tenantId: input.tenantId };
  switch (input.job.operation) {
    case "initialize_run": {
      const [{ initializeMarketplaceAutoReviewRun }, runtime] =
        await Promise.all([
          import("./marketplaceAutoReviewService"),
          import("./marketplaceAutoReviewWorkerRuntime"),
        ]);
      return initializeMarketplaceAutoReviewRun(
        input.job.runId,
        auth,
        await runtime.createMarketplaceAutoReviewWorkerRuntime({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.job.runId,
          jobId: input.jobId,
          schedulerSource: "worker_jobs:initialize_run",
        })
      );
    }
    case "advance_run": {
      const [{ advanceMarketplaceAutoReviewRun }, runtime] = await Promise.all([
        import("./marketplaceAutoReviewService"),
        import("./marketplaceAutoReviewWorkerRuntime"),
      ]);
      return advanceMarketplaceAutoReviewRun(
        input.job.runId,
        auth,
        await runtime.createMarketplaceAutoReviewWorkerRuntime({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.job.runId,
          jobId: input.jobId,
          schedulerSource: "worker_jobs:advance_run",
        })
      );
    }
    case "draft_quality_qc": {
      const { processMarketplaceAutoReviewDraftQualityQc } =
        await import("./marketplaceAutoReviewService");
      return processMarketplaceAutoReviewDraftQualityQc(input.job.runId, auth);
    }
    case "initialize_staged_metadata": {
      const { initializeStagedMarketplaceAutoReviewMetadataForWorker } =
        await import("./marketplaceAutoReviewStagedCheckpointRouterService");
      return initializeStagedMarketplaceAutoReviewMetadataForWorker({
        runId: input.job.runId,
        auth,
      });
    }
    case "sequential_image_edit_reconciliation": {
      const { reconcileMarketplaceAutoReviewSequentialShotImageEdit } =
        await import("./marketplaceAutoReviewService");
      const runtimeModule =
        await import("./marketplaceAutoReviewWorkerRuntime");
      return reconcileMarketplaceAutoReviewSequentialShotImageEdit(
        {
          runId: input.job.runId,
          shotId: input.job.shotId,
          taskId: input.job.taskId,
          pollAttempt: input.job.pollAttempt,
        },
        auth,
        await runtimeModule.createMarketplaceAutoReviewWorkerRuntime({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.job.runId,
          jobId: input.jobId,
          schedulerSource: "worker_jobs:sequential_image_edit_reconciliation",
        })
      );
    }
    case "staged_story_redraft": {
      const { redraftStagedAutoReviewPlan } =
        await import("./marketplaceAutoReviewStagedCheckpointRouterService");
      return redraftStagedAutoReviewPlan({
        runId: input.job.runId,
        expectedStateDigest: input.job.expectedStateDigest,
        idempotencyKey: input.job.requestIdempotencyKey,
        notes: input.job.notes,
        model: input.job.model,
        selectedConcept: input.job.selectedConcept,
        auth,
        workerExecution: true,
      });
    }
    case "staged_prompt_generation": {
      const { generateStagedAutoReviewShotPrompt } =
        await import("./marketplaceAutoReviewStagedCheckpointRouterService");
      const runtimeModule =
        await import("./marketplaceAutoReviewWorkerRuntime");
      const runtime =
        await runtimeModule.createMarketplaceAutoReviewWorkerRuntime({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.job.runId,
          jobId: input.jobId,
          schedulerSource: "worker_jobs:staged_prompt_generation",
        });
      return generateStagedAutoReviewShotPrompt({
        runId: input.job.runId,
        shotId: input.job.shotId,
        stage: input.job.stage,
        expectedStateDigest: input.job.expectedStateDigest,
        expectedShotRevision: input.job.expectedShotRevision,
        promptContextDigest: input.job.promptContextDigest,
        idempotencyKey: input.job.requestIdempotencyKey,
        instruction: input.job.instruction,
        model: input.job.model,
        auth,
        runtime: { publicUrl: runtime.publicUrl },
        workerExecution: true,
      });
    }
    case "staged_bulk_generation": {
      const { executeStagedAutoReviewBulkGeneration } =
        await import("./marketplaceAutoReviewStagedCheckpointRouterService");
      const runtimeModule =
        await import("./marketplaceAutoReviewWorkerRuntime");
      const runtime =
        await runtimeModule.createMarketplaceAutoReviewWorkerRuntime({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.job.runId,
          jobId: input.jobId,
          schedulerSource: "worker_jobs:staged_bulk_generation",
        });
      return executeStagedAutoReviewBulkGeneration({
        runId: input.job.runId,
        expectedStateDigest: input.job.expectedStateDigest,
        requestIdempotencyKey: input.job.requestIdempotencyKey,
        targets: input.job.targets,
        auth,
        runtime: { publicUrl: runtime.publicUrl },
      });
    }
    case "sequential_shot_regeneration": {
      const { regenerateMarketplaceAutoReviewSequentialShot } =
        await import("./marketplaceAutoReviewService");
      const runtimeModule =
        await import("./marketplaceAutoReviewWorkerRuntime");
      return regenerateMarketplaceAutoReviewSequentialShot(
        {
          runId: input.job.runId,
          shotId: input.job.shotId,
          refreshPrompt: input.job.refreshPrompt,
        },
        auth,
        await runtimeModule.createMarketplaceAutoReviewWorkerRuntime({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.job.runId,
          jobId: input.jobId,
          schedulerSource: "worker_jobs:sequential_shot_regeneration",
        }),
        {
          workerExecution: true,
          requestIdempotencyKey: input.job.requestIdempotencyKey,
        }
      );
    }
    case "sequential_shot_prompt_generation": {
      const { generateMarketplaceAutoReviewSequentialShotPrompt } =
        await import("./marketplaceAutoReviewService");
      const runtimeModule =
        await import("./marketplaceAutoReviewWorkerRuntime");
      const runtime =
        await runtimeModule.createMarketplaceAutoReviewWorkerRuntime({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.job.runId,
          jobId: input.jobId,
          schedulerSource: "worker_jobs:sequential_shot_prompt_generation",
        });
      return generateMarketplaceAutoReviewSequentialShotPrompt(
        {
          runId: input.job.runId,
          shotId: input.job.shotId,
          stage: input.job.stage,
        },
        auth,
        { publicUrl: runtime.publicUrl },
        {
          workerExecution: true,
          requestIdempotencyKey: input.job.requestIdempotencyKey,
        }
      );
    }
    case "plan_redraft": {
      const { requestMarketplaceAutoReviewPlanRedraft } =
        await import("./marketplaceAutoReviewService");
      const runtimeModule =
        await import("./marketplaceAutoReviewWorkerRuntime");
      const runtime =
        await runtimeModule.createMarketplaceAutoReviewWorkerRuntime({
          userId: input.userId,
          tenantId: input.tenantId,
          runId: input.job.runId,
          jobId: input.jobId,
          schedulerSource: "worker_jobs:plan_redraft",
        });
      return requestMarketplaceAutoReviewPlanRedraft(
        {
          runId: input.job.runId,
          notes: input.job.notes,
        },
        auth,
        { publicUrl: runtime.publicUrl },
        {
          workerExecution: true,
          requestIdempotencyKey: input.job.requestIdempotencyKey,
        }
      );
    }
  }
}

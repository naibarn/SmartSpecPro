import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  mediaAssets,
  videoEditorExecutionSnapshots,
  videoEditorProjectJobs,
  videoEditorProjectRevisions,
  videoEditorProjects,
  workerJobOutbox,
  workerJobs,
} from "../../drizzle/schema";
import { contentProtectionSettings } from "../../drizzle/schema";
import {
  buildEditorWorkerJobProjection,
  resolveEditorRuntimeRouting,
  type EditorMediaJobInput,
} from "../services/editorMediaJobContract";
import {
  reserveWorkerJobCredits,
  type WorkerJobBillingEnvelope,
} from "../services/workerBillingService";
import { refundReservation } from "../services/creditService";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { isDesktopWorkerDispatchEnabled } from "../services/workerSchedulerService";
import { isPostgresNodeJobWorkerEnabled } from "../jobs/postgresNodeJobWorker";
import { mediaOperationClaimCapability } from "@smartspec/shared";
import { enqueueCompositionScanJob, isCompositionEvidencePromotable, validateCompositionScanInput } from "../services/compositionScanJob";
import { buildVideoEditorExecutionSnapshot } from "../services/videoEditorExecutionAdmission";
import { contentProtectionIntentSchema, type ContentProtectionIntent } from "../../shared/contentProtectionWorker";

const envelopeSchema = z.record(z.string(), z.unknown());
const idempotencyKeySchema = z.string().trim().regex(/^[A-Za-z0-9._:-]{8,160}$/);

const RESOURCE_PROFILES = new Set([
  "cpu_light",
  "cpu_heavy",
  "gpu_required",
  "large_disk_temp",
  "network_heavy",
  "long_running",
  "sandbox_required",
  "human_observable",
] as const);

type Auth = { tenantId: string; userId: number };

function requireEditorAuth(ctx: { tenantId?: string | null; user?: { id?: number | null } | null }): Auth {
  if (!ctx.tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context required" });
  if (!ctx.user?.id) throw new TRPCError({ code: "UNAUTHORIZED", message: "User context required" });
  return { tenantId: ctx.tenantId, userId: ctx.user.id };
}

type ManagedAssetReference = { namespace: string; id: string | number };

function collectManagedAssetRefs(envelope: Record<string, unknown>): ManagedAssetReference[] {
  const refs: ManagedAssetReference[] = [];
  const addRef = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const ref = value as { namespace?: unknown; id?: unknown };
    if (typeof ref.namespace !== "string") return;
    if (typeof ref.id !== "string" && typeof ref.id !== "number") return;
    refs.push({ namespace: ref.namespace, id: ref.id });
  };
  const inputs = envelope.inputs;
  if (inputs && typeof inputs === "object" && !Array.isArray(inputs)) {
    const assets = (inputs as { assets?: unknown }).assets;
    if (Array.isArray(assets)) assets.forEach(addRef);
    const project = (inputs as { project?: unknown }).project;
    if (project && typeof project === "object" && !Array.isArray(project)) {
      const tracks = (project as { tracks?: unknown }).tracks;
      if (Array.isArray(tracks)) {
        tracks.forEach((track) => {
          if (!track || typeof track !== "object" || Array.isArray(track)) return;
          const clips = (track as { clips?: unknown }).clips;
          if (Array.isArray(clips)) clips.forEach((clip) => {
            if (clip && typeof clip === "object" && !Array.isArray(clip)) addRef((clip as { asset?: unknown }).asset);
          });
        });
      }
    }
  }
  return refs;
}

function collectMediaAssetIds(envelope: Record<string, unknown>): number[] {
  const ids = new Set<number>();
  for (const ref of collectManagedAssetRefs(envelope)) {
    if (ref.namespace !== "media_asset") continue;
    const id = typeof ref.id === "number" ? ref.id : Number(ref.id);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

function buildBillingMetadata(billing: WorkerJobBillingEnvelope | null): Record<string, unknown> | null {
  if (!billing) return null;
  return {
    reservationId: billing.reservationId,
    reservedCredits: billing.reservedCredits,
    sourceType: billing.sourceType,
  };
}

function normalizeResourceProfile(value: unknown): string {
  return typeof value === "string" && RESOURCE_PROFILES.has(value as never) ? value : "cpu_heavy";
}

function parseWebEditorProjectId(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(?:project|web-project)-(\d+)$/.exec(value);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const PROTECTED_EDITOR_OPERATIONS = new Set<MediaJobOperation>([
  "video.render",
  "video.render_still",
  "media.audio_export",
]);

type MediaJobOperation = EditorMediaJobInput["operation"];

async function resolveEditorProtectionIntent(
  tenantId: string,
  userId: number,
  operation: MediaJobOperation,
  rawIntent: unknown,
  flags: Record<string, unknown>,
): Promise<ContentProtectionIntent | undefined> {
  if (!PROTECTED_EDITOR_OPERATIONS.has(operation)) {
    if (rawIntent !== undefined) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Content protection is only available for final media exports" });
    }
    return undefined;
  }
  if (flags.contentProtectionEnabled !== true) {
    if (rawIntent !== undefined) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Content protection is not enabled for this tenant" });
    }
    return undefined;
  }

  const intent = rawIntent === undefined
    ? null
    : contentProtectionIntentSchema.safeParse(rawIntent);
  if (intent && !intent.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid content protection choice" });
  }
  const resolved = intent && intent.success
    ? {
        ...intent.data,
        choiceSource: intent.data.choiceSource ?? (intent.data.choice === "on" ? "per_export" : "disabled_by_user"),
      }
    : undefined;
  let protectionIntent = resolved;
  if (!protectionIntent) {
    const [settings] = await getDb()
      .select({ defaultChoice: contentProtectionSettings.defaultChoice })
      .from(contentProtectionSettings)
      .where(and(
        eq(contentProtectionSettings.tenantId, tenantId),
        eq(contentProtectionSettings.userId, userId),
      ))
      .limit(1);
    protectionIntent = {
      choice: settings?.defaultChoice === "on" ? "on" : "off",
      choiceSource: "user_default",
      requireBeforePublish: true,
    };
  }
  if (protectionIntent.choice === "on" && operation === "video.render_still" && flags.contentProtectionImageProviderEnabled !== true) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Image content protection provider is not enabled for this tenant" });
  }
  return protectionIntent;
}

export const editorMediaJobsRouter = router({
  submit: protectedProcedure
    .input(z.object({
      envelope: envelopeSchema,
      idempotencyKey: idempotencyKeySchema,
      expectedRevisionId: z.string().trim().min(1).max(160).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const auth = requireEditorAuth(ctx);
      if (!isDesktopWorkerDispatchEnabled()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Worker dispatch is temporarily disabled" });
      }
      const flags = await getTenantFeatureFlags(auth.tenantId);
      if (!flags.desktopZeroClawWorker) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Desktop Worker is not enabled for this tenant" });
      }

      const envelope = {
        ...input.envelope,
        tenantId: auth.tenantId,
        jobId: typeof input.envelope.jobId === "string" && input.envelope.jobId.trim()
          ? input.envelope.jobId
          : `editor-job-${randomUUID().replaceAll("-", "")}`,
      };
      const projectionInput: EditorMediaJobInput = {
        ...(envelope as Omit<EditorMediaJobInput, "idempotencyKey" | "expectedRevisionId">),
        tenantId: auth.tenantId,
        idempotencyKey: input.idempotencyKey,
        ...(input.expectedRevisionId ? { expectedRevisionId: input.expectedRevisionId } : {}),
      };

      let projection;
      try {
        projection = buildEditorWorkerJobProjection(projectionInput);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid media job envelope";
        const code = message === "TENANT_MISMATCH" ? "FORBIDDEN" : "BAD_REQUEST";
        throw new TRPCError({ code, message });
      }
      const operation = projectionInput.operation;
      const protectionIntent = await resolveEditorProtectionIntent(
        auth.tenantId,
        auth.userId,
        operation,
        projection.inputJson.protectionIntent,
        flags as unknown as Record<string, unknown>,
      );
      if (protectionIntent) {
        projection.inputJson = { ...projection.inputJson, protectionIntent };
      }
      const project = projection.inputJson.inputs.project;
      const requiresVideoTimeline = operation === "video.render" || operation === "video.render_still";
      if (requiresVideoTimeline && (!project || !project.tracks.some((track) => track.kind === "video" && track.clips.length > 0))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A video timeline with at least one clip is required for Worker render",
        });
      }
      if (operation === "media.audio_export" && protectionIntent?.choice === "on" && (!project || !project.tracks.some((track) => track.kind === "audio" && track.clips.length > 0))) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A protected audio export requires an audio timeline with at least one clip",
        });
      }
      if (!requiresVideoTimeline && operation !== "media.ai_music" && operation !== "media.ai_media_studio" && projection.inputJson.inputs.assets.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "At least one managed media asset is required for this operation" });
      }

      const db = getDb();
      const numericProjectId = parseWebEditorProjectId(projection.inputJson.projectId);
      const existing = await db
        .select({ id: workerJobs.id, jobType: workerJobs.jobType, status: workerJobs.status })
        .from(workerJobs)
        .where(and(eq(workerJobs.tenantId, auth.tenantId), eq(workerJobs.idempotencyKey, projection.idempotencyKey)))
        .limit(1);
      if (existing[0]) {
        if (existing[0].jobType !== projection.jobType) {
          throw new TRPCError({ code: "CONFLICT", message: "Idempotency key is already bound to another job" });
        }
        const [existingSnapshot] = numericProjectId !== null
          ? await db
            .select({ id: videoEditorExecutionSnapshots.id, revisionId: videoEditorExecutionSnapshots.revisionId, snapshotHash: videoEditorExecutionSnapshots.snapshotHash, workerJobId: videoEditorExecutionSnapshots.workerJobId })
            .from(videoEditorExecutionSnapshots)
            .where(and(
              eq(videoEditorExecutionSnapshots.tenantId, auth.tenantId),
              eq(videoEditorExecutionSnapshots.workerJobId, existing[0].id),
            ))
            .limit(1)
          : [];
        return {
          created: false,
          job: existing[0],
          snapshot: existingSnapshot ?? null,
          snapshotReady: numericProjectId === null || Boolean(existingSnapshot),
        };
      }

      // Composition scan is currently a server-owned PostgreSQL Node
      // capability, not a Windows Worker capability. Fail closed before
      // reserving credits or creating a job that no enabled executor can
      // claim. The legacy composition adapter retains durable-queue behavior;
      // this guard is for the active Web generic-submit path only.
      const runtimeRouting = resolveEditorRuntimeRouting(
        projection.jobType,
        isPostgresNodeJobWorkerEnabled(),
      );
      if (!runtimeRouting.available) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "CAPABILITY_BLOCKED: Node composition-scan executor is unavailable",
        });
      }

      const assetIds = collectMediaAssetIds(projection.inputJson as unknown as Record<string, unknown>);
      const unsupportedNamespaces = [...new Set(
        collectManagedAssetRefs(projection.inputJson as unknown as Record<string, unknown>)
          .map((ref) => ref.namespace)
          .filter((namespace) => namespace !== "media_asset"),
      )];
      if (unsupportedNamespaces.length > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Web Worker editor currently accepts tenant-owned media_asset references only (unsupported: ${unsupportedNamespaces.join(", ")})`,
        });
      }
      if (assetIds.length > 0) {
        const rows = await db
          .select({ id: mediaAssets.id, status: mediaAssets.status })
          .from(mediaAssets)
          .where(and(
            eq(mediaAssets.tenantId, auth.tenantId),
            eq(mediaAssets.userId, auth.userId),
            inArray(mediaAssets.id, assetIds),
          ));
        const readyIds = new Set(rows.filter((row) => row.status === "ready").map((row) => row.id));
        if (readyIds.size !== assetIds.length) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "One or more media assets are not ready or do not belong to this user" });
        }
      }

      let revisionAuthority: {
        projectId: number;
        revisionId: string;
        revision: number;
        document: Record<string, unknown>;
        documentHash: string;
      } | null = null;
      let admissionSnapshot: Awaited<ReturnType<typeof buildVideoEditorExecutionSnapshot>> | null = null;
      if (numericProjectId !== null) {
        if (!projection.inputJson.revisionId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A persisted editor revision is required before dispatch" });
        const [ownedProject] = await db
          .select({ id: videoEditorProjects.id })
          .from(videoEditorProjects)
          .where(and(eq(videoEditorProjects.id, numericProjectId), eq(videoEditorProjects.userId, auth.userId)))
          .limit(1);
        const [revision] = await db
          .select()
          .from(videoEditorProjectRevisions)
          .where(and(
            eq(videoEditorProjectRevisions.id, projection.inputJson.revisionId),
            eq(videoEditorProjectRevisions.projectId, numericProjectId),
            eq(videoEditorProjectRevisions.tenantId, auth.tenantId),
          ))
          .limit(1);
        if (!ownedProject || !revision) throw new TRPCError({ code: "CONFLICT", message: "Editor revision is stale or not accessible" });
        revisionAuthority = {
          projectId: numericProjectId,
          revisionId: revision.id,
          revision: revision.revision,
          document: revision.document,
          documentHash: revision.documentHash,
        };
        const sourceFingerprint = typeof projection.inputJson.options?.sourceFingerprint === "string"
          && /^(?:sha256:[a-f0-9]{8,128}|managed:[A-Za-z0-9._:-]{1,160})$/i.test(projection.inputJson.options.sourceFingerprint)
          ? projection.inputJson.options.sourceFingerprint
          : `managed:${assetIds.join("-") || projection.inputJson.projectId}`;
        admissionSnapshot = await buildVideoEditorExecutionSnapshot({
          tenantId: auth.tenantId,
          projectId: numericProjectId,
          revisionId: revision.id,
          revisionNumber: revision.revision,
          idempotencyKey: projection.idempotencyKey,
          operation: projection.inputJson.operation,
          contractVersion: projection.inputJson.version,
          sourceFingerprints: [sourceFingerprint],
          projectDocument: revision.document,
          capabilityProfile: projection.inputJson.requirements,
          policy: { protectionIntent: projection.inputJson.protectionIntent ?? null },
        });
      }

      const billing = projection.inputJson.billing.required
        ? await reserveWorkerJobCredits({
            userId: auth.userId,
            tenantId: auth.tenantId,
            requestedCredits: projection.inputJson.billing.estimateCredits,
            metadata: {
              jobType: projection.jobType,
              operation: projection.inputJson.operation,
              projectId: projection.inputJson.projectId ?? null,
              revisionId: projection.inputJson.revisionId ?? null,
            },
          })
        : null;

      try {
        const capabilityFamilies = projection.inputJson.requirements.capabilities;
        const job = await db.transaction(async (tx) => {
          const insertedJob = await tx
          .insert(workerJobs)
          .values({
            tenantId: auth.tenantId,
            workerId: null,
            runtimeType: runtimeRouting.runtimeType,
            requestedByUserId: auth.userId,
            requestedBySystemComponent: "web_video_editor",
            jobType: projection.jobType,
            status: "queued",
            statusReason: runtimeRouting.runtimeType === "node_job_worker"
              ? "web_video_editor_node_handoff"
              : "web_video_editor_worker_handoff",
            priority: projection.inputJson.operation === "video.render" ? 40 : 20,
            resourceProfile: normalizeResourceProfile(projection.inputJson.requirements.resourceProfile) as never,
            capabilityRequirementsJson: {
              ...projection.capabilityRequirementsJson,
              capabilityFamilies,
              // The protocol token alone used to let an FFmpeg-only Worker
              // claim every editor job, including operations that require an
              // AI/ASR/vision adapter.  Keep the protocol family in the
              // envelope, but gate selection on the exact operation token.
              requiredClaimCapability: mediaOperationClaimCapability(operation),
              protocolClaimCapability: "editor-media-contract-1.0",
            },
            inputJson: projection.inputJson,
            instructionsJson: {
              ...projection.instructionsJson,
              intent: projection.inputJson.operation,
              requiredProgressStages: ["validate_contract", "stage_inputs", "execute", "verify_outputs", "upload_artifacts", "publish_artifacts"],
              workerBilling: buildBillingMetadata(billing),
            },
            timeoutSeconds: Math.min(7200, Math.max(60, Math.ceil(projection.inputJson.requirements.maxDurationSeconds ?? 3600))),
            retryPolicyJson: projection.inputJson.retry,
            idempotencyKey: projection.idempotencyKey,
          })
          .returning({ id: workerJobs.id, jobType: workerJobs.jobType, status: workerJobs.status });
          const createdJob = insertedJob[0];
          if (!createdJob) throw new Error("EDITOR_JOB_INSERT_FAILED");
          if (revisionAuthority) {
            await tx.insert(videoEditorExecutionSnapshots).values({
              id: admissionSnapshot?.snapshotId ?? `snapshot-${randomUUID().replaceAll("-", "")}`,
              tenantId: auth.tenantId,
              projectId: revisionAuthority.projectId,
              revisionId: revisionAuthority.revisionId,
              workerJobId: createdJob.id,
              idempotencyKey: projection.idempotencyKey,
              operation: projection.inputJson.operation,
              contractVersion: projection.inputJson.version,
              document: revisionAuthority.document,
              documentHash: revisionAuthority.documentHash,
              snapshotHash: admissionSnapshot?.snapshotHash ?? revisionAuthority.documentHash,
              sourceFingerprints: admissionSnapshot?.sourceFingerprints ?? [`managed:${assetIds.join("-") || projection.inputJson.projectId}`],
              capabilityProfile: projection.inputJson.requirements,
              policy: { protectionIntent: projection.inputJson.protectionIntent ?? null },
            });
            await tx.insert(videoEditorProjectJobs).values({
              projectId: revisionAuthority.projectId,
              tenantId: auth.tenantId,
              revisionId: revisionAuthority.revisionId,
              workerJobId: createdJob.id,
              planHash: projection.inputJson.plan.planHash,
            });
          }
          await tx.insert(workerJobOutbox).values({
            workerJobId: createdJob.id,
            envelopeVersion: projection.inputJson.version,
            envelopeJson: projection.inputJson as unknown as Record<string, unknown>,
            dedupeKey: `editor:${auth.tenantId}:${projection.idempotencyKey}`,
          });
          return { created: true, job: createdJob };
        });
        return job;
      } catch (error) {
        if (billing?.reservationId) await refundReservation(billing.reservationId).catch(() => undefined);
        throw error;
      }
    }),
  submitCompositionScan: protectedProcedure
    .input(z.object({
      jobId: z.string().trim().min(8).max(256).optional(),
      projectRevisionId: z.string().trim().min(1).max(160).optional(),
      sourceFingerprint: z.string().trim().min(1).max(256),
      markRevision: z.number().int().min(0),
      policyFingerprint: z.string().trim().min(1).max(256),
      capabilityProfileFingerprint: z.string().trim().min(1).max(256),
      analysisMode: z.enum(["quick", "full_scan"]),
      trimRange: z.object({ startMs: z.number().int().min(0), endMs: z.number().int().positive() }),
      aspectProfile: z.string().trim().min(1).max(80),
      durationMs: z.number().int().positive().max(86_400_000),
      evidenceRef: z.string().trim().max(256).optional(),
      compositionContractVersion: z.literal("feature-191.v1").optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const auth = requireEditorAuth(ctx);
      const jobId = input.jobId || `editor-composition-${randomUUID().replaceAll("-", "")}`;
      try {
        validateCompositionScanInput({ ...input, jobId, tenantId: auth.tenantId, userId: auth.userId });
        const createdJobId = await enqueueCompositionScanJob({ ...input, jobId, tenantId: auth.tenantId, userId: auth.userId });
        return { created: true, job: { id: createdJobId, jobType: "video.composition_scan", status: "queued" as const } };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid composition scan request";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),
  getAnalysisStatus: protectedProcedure
    .input(z.object({ jobId: z.string().trim().min(8).max(256) }))
    .query(async ({ ctx, input }) => {
      const auth = requireEditorAuth(ctx);
      const db = getDb();
      const rows = await db.select({
        id: workerJobs.id,
        jobType: workerJobs.jobType,
        status: workerJobs.status,
        statusReason: workerJobs.statusReason,
        outputJson: workerJobs.outputJson,
        resultRef: workerJobs.resultRef,
        errorCode: workerJobs.errorCode,
        errorMessage: workerJobs.errorMessage,
        attempt: workerJobs.attempt,
      }).from(workerJobs).where(and(eq(workerJobs.tenantId, auth.tenantId), eq(workerJobs.id, input.jobId))).limit(1);
      const row = rows[0];
      if (!row || row.jobType !== "video.composition_scan") throw new TRPCError({ code: "NOT_FOUND", message: "Composition scan job not found" });
      const output = row.outputJson && typeof row.outputJson === "object" ? row.outputJson as Record<string, unknown> : null;
      return {
        jobId: row.id,
        status: row.status,
        statusReason: row.statusReason,
        attempt: row.attempt,
        evidence: output ? {
          sourceFingerprint: typeof output.sourceFingerprint === "string" ? output.sourceFingerprint : null,
          projectRevisionId: typeof output.projectRevisionId === "string" ? output.projectRevisionId : null,
          evidenceRef: typeof output.evidenceRef === "string" ? output.evidenceRef : row.resultRef,
          analysisMode: output.analysisMode === "quick" || output.analysisMode === "full_scan" ? output.analysisMode : null,
          warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 10) : [],
          status: output.status === "degraded" ? "degraded" : output ? "available" : "pending",
        } : null,
        error: row.errorCode || row.errorMessage ? { code: row.errorCode, message: row.errorMessage } : null,
      };
    }),
  promoteCompositionScan: protectedProcedure
    .input(z.object({ jobId: z.string().trim().min(8).max(256), expectedSourceFingerprint: z.string().trim().min(1).max(256), expectedRevisionId: z.string().trim().min(1).max(160) }))
    .mutation(async ({ ctx, input }) => {
      const auth = requireEditorAuth(ctx);
      const db = getDb();
      const rows = await db.select({ id: workerJobs.id, jobType: workerJobs.jobType, status: workerJobs.status, outputJson: workerJobs.outputJson }).from(workerJobs).where(and(eq(workerJobs.tenantId, auth.tenantId), eq(workerJobs.id, input.jobId))).limit(1);
      const row = rows[0];
      if (!row || row.jobType !== "video.composition_scan") throw new TRPCError({ code: "NOT_FOUND", message: "Composition scan job not found" });
      if (String(row.status) !== "completed" && String(row.status) !== "succeeded") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Composition scan is not complete" });
      const output = row.outputJson && typeof row.outputJson === "object" ? row.outputJson as Record<string, unknown> : {};
      if (!isCompositionEvidencePromotable(output)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Composition evidence is degraded or not ready for promotion" });
      if (output.sourceFingerprint !== input.expectedSourceFingerprint) throw new TRPCError({ code: "CONFLICT", message: "Composition evidence is stale for this source" });
      if (typeof output.projectRevisionId === "string" && output.projectRevisionId !== input.expectedRevisionId) throw new TRPCError({ code: "CONFLICT", message: "Composition evidence is stale for this project revision" });
      const evidenceRef = typeof output.evidenceRef === "string" && output.evidenceRef.trim() ? output.evidenceRef : null;
      if (!evidenceRef) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Composition evidence reference is missing" });
      return { promoted: true, jobId: row.id, revisionId: input.expectedRevisionId, evidenceRef, sourceFingerprint: input.expectedSourceFingerprint, warnings: Array.isArray(output.warnings) ? output.warnings.slice(0, 10) : [] };
    }),
});

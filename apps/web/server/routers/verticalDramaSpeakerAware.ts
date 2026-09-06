import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { verticalDramaSeries, workerArtifacts, workerJobs } from "../../drizzle/schema";
import { hashAdapterPolicy, speakerAwareJobPayloadSchema } from "../../shared/verticalDramaMedia/speakerAwareContracts";
import { queueSpeakerAwareWorkerJob } from "../services/workerSchedulerService";

const speakerAwareProcedure = protectedProcedure.use(requireFeatureFlag("verticalDramaSeries"));
const id = z.string().trim().min(1).max(160);

function requireTenant(tenantId: string | null | undefined): string {
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tenantId;
}

const requestSchema = z.object({
  seriesId: id.nullable(),
  inputArtifact: speakerAwareJobPayloadSchema.shape.inputArtifact,
  analysisArtifacts: speakerAwareJobPayloadSchema.shape.analysisArtifacts,
  workflowMode: speakerAwareJobPayloadSchema.shape.workflowMode,
  requestedStages: speakerAwareJobPayloadSchema.shape.requestedStages,
  parentEditMapHash: speakerAwareJobPayloadSchema.shape.parentEditMapHash,
  adapterPolicy: speakerAwareJobPayloadSchema.shape.adapterPolicy,
  outputStage: speakerAwareJobPayloadSchema.shape.outputStage,
  idempotencyKey: id.max(128),
  approvalRequired: z.boolean().default(true),
});

async function queue({ ctx, input, kind }: { ctx: { tenantId: string | null; user: { id: number } }; input: z.infer<typeof requestSchema>; kind: "speaker_aware_media_scan" | "speaker_aware_edit_plan" }) {
  const tenantId = requireTenant(ctx.tenantId);
  if (input.seriesId !== null) {
    const parsedSeriesId = Number(input.seriesId);
    if (!Number.isSafeInteger(parsedSeriesId) || parsedSeriesId <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
    const [ownedSeries] = await db.select({ id: verticalDramaSeries.id })
      .from(verticalDramaSeries)
      .where(and(eq(verticalDramaSeries.id, parsedSeriesId), eq(verticalDramaSeries.tenantId, tenantId), eq(verticalDramaSeries.userId, ctx.user.id)))
      .limit(1);
    if (!ownedSeries) throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
  }
  const payload = speakerAwareJobPayloadSchema.parse({ ...input, kind, seriesId: input.seriesId, adapterPolicyHash: hashAdapterPolicy(input.adapterPolicy) });
  return queueSpeakerAwareWorkerJob({ tenantId, requestedByUserId: ctx.user.id, payload });
}

export const verticalDramaSpeakerAwareRouter = router({
  queueScan: speakerAwareProcedure.input(requestSchema).mutation(({ ctx, input }) => queue({ ctx, input, kind: "speaker_aware_media_scan" })),
  queueEditPlan: speakerAwareProcedure.input(requestSchema).mutation(({ ctx, input }) => queue({ ctx, input, kind: "speaker_aware_edit_plan" })),
  status: speakerAwareProcedure.input(z.object({ seriesId: id.nullable() })).query(async ({ ctx, input }) => {
    const tenantId = requireTenant(ctx.tenantId);
    const parsedSeriesId = input.seriesId === null ? null : Number(input.seriesId);
    if (parsedSeriesId !== null) {
      if (!Number.isSafeInteger(parsedSeriesId) || parsedSeriesId <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series id" });
      const [ownedSeries] = await db.select({ id: verticalDramaSeries.id })
        .from(verticalDramaSeries)
        .where(and(eq(verticalDramaSeries.id, parsedSeriesId), eq(verticalDramaSeries.tenantId, tenantId), eq(verticalDramaSeries.userId, ctx.user.id)))
        .limit(1);
      if (!ownedSeries) throw new TRPCError({ code: "NOT_FOUND", message: "Series not found" });
    }
    const jobs = await db.select({
      id: workerJobs.id,
      jobType: workerJobs.jobType,
      status: workerJobs.status,
      statusReason: workerJobs.statusReason,
      failureReason: workerJobs.failureReason,
      createdAt: workerJobs.createdAt,
      startedAt: workerJobs.startedAt,
      finishedAt: workerJobs.finishedAt,
    }).from(workerJobs)
      .where(and(
        eq(workerJobs.tenantId, tenantId),
        eq(workerJobs.requestedByUserId, ctx.user.id),
        inArray(workerJobs.jobType, ["speaker_aware_media_scan", "speaker_aware_edit_plan"]),
        parsedSeriesId === null
          ? sql`${workerJobs.inputJson}->>'seriesId' IS NULL`
          : sql`${workerJobs.inputJson}->>'seriesId' = ${String(parsedSeriesId)}`,
      ))
      .orderBy(desc(workerJobs.createdAt))
      .limit(12);
    const artifacts = jobs.length > 0
      ? await db.select({ id: workerArtifacts.id, workerJobId: workerArtifacts.workerJobId, artifactType: workerArtifacts.artifactType, metadataJson: workerArtifacts.metadataJson })
        .from(workerArtifacts)
        .where(inArray(workerArtifacts.workerJobId, jobs.map((job) => job.id)))
      : [];
    const artifactsByJob = new Map<string, typeof artifacts>();
    for (const artifact of artifacts) artifactsByJob.set(artifact.workerJobId, [...(artifactsByJob.get(artifact.workerJobId) ?? []), artifact]);
    return {
      items: jobs.map((job) => ({
        ...job,
        artifacts: (artifactsByJob.get(job.id) ?? []).map((artifact) => ({
          id: artifact.id,
          artifactType: artifact.artifactType,
          verificationState: typeof artifact.metadataJson?.verificationState === "string" ? artifact.metadataJson.verificationState : null,
        })),
      })),
    };
  }),
  getPolicyHash: speakerAwareProcedure.input(z.object({ adapterPolicy: speakerAwareJobPayloadSchema.shape.adapterPolicy })).query(({ input }) => ({ contractVersion: "feature-179-v1", adapterPolicyHash: hashAdapterPolicy(input.adapterPolicy) })),
});

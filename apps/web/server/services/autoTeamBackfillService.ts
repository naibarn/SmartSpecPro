import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import {
  autoTeamExecutionStages,
  autoTeamFinalResults,
  type AutoTeamFinalResultRow,
  type AutoTeamRouteDecisionRow,
} from "../../drizzle/schema";
import * as roomService from "./roomService";
import * as runEngine from "./runEngine";
import * as workOsService from "./workOsService";
import { ensureRouteDecision, ensureStagePlan, getRunSnapshot } from "./autoTeamExecutionService";
import { getAutoTeamRolloutFlags, resolveAutoTeamExecutionMode } from "./autoTeamFeatureFlags";
import { getWorkRequest } from "./workOsService";

export interface AutoTeamBackfillInput {
  tenantId: string;
  roomId?: string | null;
  runId?: string | null;
  workRequestId?: string | null;
  workCaseId?: string | null;
  initiatedByUserId?: number | null;
  initiatedByActorRole?: "admin" | "domain_admin" | null;
  createRetryRun?: boolean;
  dryRun?: boolean;
}

export interface AutoTeamBackfillResult {
  tenantId: string;
  roomId: string | null;
  runId: string | null;
  retryRunId: string | null;
  routeDecisionId: string | null;
  finalResultId: string | null;
  legacyUnverified: boolean;
  sourceMessageIds: string[];
  rolloutMode: ReturnType<typeof resolveAutoTeamExecutionMode>;
  routeDecision: AutoTeamRouteDecisionRow | null;
  finalResult: AutoTeamFinalResultRow | null;
}

function summarizeObjective(
  roomGoal: string | null | undefined,
  messages: Array<{ content: string }>,
): string {
  if (roomGoal?.trim()) return roomGoal.trim();
  const latestUserMessage = [...messages].reverse().find((message) => message.content.trim().length > 0);
  return latestUserMessage?.content.trim() ?? "Legacy auto-team backfill";
}

async function resolveBackfillContext(input: AutoTeamBackfillInput): Promise<{
  roomId: string | null;
  runId: string | null;
  room: Awaited<ReturnType<typeof roomService.getRoom>> | null;
  request: Awaited<ReturnType<typeof getWorkRequest>> | null;
  sourceMessageIds: string[];
  objective: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let request: Awaited<ReturnType<typeof getWorkRequest>> | null = null;
  let workCaseId = input.workCaseId ?? null;
  if (input.workRequestId) {
    const actorRole = input.initiatedByActorRole ?? null;
    request = await workOsService.getWorkRequest({
      tenantId: input.tenantId,
      requestId: input.workRequestId,
      actorUserId: input.initiatedByUserId ?? null,
      actorRole: actorRole ?? undefined,
    }).catch(() => null);
    if (!workCaseId) {
      workCaseId = request?.case?.id ?? null;
    }
  }

  const room = input.roomId ? await roomService.getRoom(input.roomId, input.tenantId).catch(() => null) : null;
  const runId = input.runId ?? request?.case?.automationRunId ?? room?.lastRunId ?? null;
  const messages = room
    ? await roomService.getMessages(room.id, input.tenantId, {
        limit: 20,
        callerType: "user",
      }).catch(() => [])
    : [];
  const sourceMessageIds = messages.map((message) => message.id);
  const objective = summarizeObjective(room?.goalPrompt ?? request?.request.objective ?? request?.request.title ?? null, messages);

  return {
    roomId: room?.id ?? input.roomId ?? null,
    runId,
    room,
    request,
    sourceMessageIds,
    objective,
  };
}

async function createLegacyFinalResult(input: {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId: string;
  routeDecision: AutoTeamRouteDecisionRow;
  sourceMessageIds: string[];
  objective: string;
}): Promise<AutoTeamFinalResultRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const idempotencyKey = crypto
    .createHash("sha256")
    .update([input.tenantId, input.runId, input.routeDecision.id ?? "", "legacy_unverified", input.objective].join("|"))
    .digest("hex");

  const [existing] = await db
    .select()
    .from(autoTeamFinalResults)
    .where(
      and(
        eq(autoTeamFinalResults.tenantId, input.tenantId),
        eq(autoTeamFinalResults.runId, input.runId),
        eq(autoTeamFinalResults.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [inserted] = await db.insert(autoTeamFinalResults).values({
    tenantId: input.tenantId,
    teamId: input.teamId ?? null,
    roomId: input.roomId ?? null,
    runId: input.runId,
    routeDecisionId: input.routeDecision.id ?? null,
    status: "legacy_unverified",
    finalArtifactRefsJson: [],
    mediaJobRefIdsJson: [],
    reviewRecordRefIdsJson: [],
    humanApprovalStatus: "not_required",
    summary: input.objective,
    failureReason: null,
    blockedReason: "legacy_unverified",
    idempotencyKey,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  return inserted;
}

async function markStagesLegacyUnverified(
  tenantId: string,
  runId: string,
  sourceMessageIds: string[],
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(autoTeamExecutionStages)
    .set({
      status: "superseded",
      blockedReason: "legacy_unverified",
      metadataJson: {
        legacyUnverified: true,
        sourceMessageIds,
      },
      updatedAt: new Date(),
    })
    .where(and(eq(autoTeamExecutionStages.tenantId, tenantId), eq(autoTeamExecutionStages.runId, runId)));
}

export async function backfillAutoTeamRoom(
  input: AutoTeamBackfillInput,
): Promise<AutoTeamBackfillResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rolloutFlags = await getAutoTeamRolloutFlags();
  const rolloutMode = resolveAutoTeamExecutionMode(rolloutFlags);
  const context = await resolveBackfillContext(input);

  if (input.dryRun) {
    return {
      tenantId: input.tenantId,
      roomId: context.roomId,
      runId: context.runId,
      retryRunId: null,
      routeDecisionId: null,
      finalResultId: null,
      legacyUnverified: true,
      sourceMessageIds: context.sourceMessageIds,
      rolloutMode,
      routeDecision: null,
      finalResult: null,
    };
  }

  if (!context.runId) {
    if (!input.createRetryRun || !context.room) {
      return {
        tenantId: input.tenantId,
        roomId: context.roomId,
        runId: null,
        retryRunId: null,
        routeDecisionId: null,
        finalResultId: null,
        legacyUnverified: true,
        sourceMessageIds: context.sourceMessageIds,
        rolloutMode,
        routeDecision: null,
        finalResult: null,
      };
    }

    const retryRun = await runEngine.startRun({
      roomId: context.room.id,
      tenantId: input.tenantId,
      initiatedByUserId: input.initiatedByUserId ?? context.room.orchestratorUserId,
      executionMode: "auto_team",
      objective: context.objective,
      stopPolicy: {
        maxRounds: 12,
        maxDurationMinutes: 30,
        maxBudgetCredits: 250,
        stopOnConsensus: false,
        stopOnArtifactReady: false,
        stopOnLeadSummary: false,
        requireFinalSummary: true,
        idleTimeoutSeconds: 120,
      },
    });

    return {
      tenantId: input.tenantId,
      roomId: context.room.id,
      runId: retryRun.id,
      retryRunId: retryRun.id,
      routeDecisionId: null,
      finalResultId: null,
      legacyUnverified: false,
      sourceMessageIds: context.sourceMessageIds,
      rolloutMode,
      routeDecision: null,
      finalResult: null,
    };
  }

  const existingSnapshot = await getRunSnapshot({ tenantId: input.tenantId, runId: context.runId }).catch(() => null);
  if (existingSnapshot?.routeDecision && existingSnapshot.finalResult) {
      return {
        tenantId: input.tenantId,
        roomId: existingSnapshot.roomId,
        runId: existingSnapshot.runId,
        retryRunId: null,
        routeDecisionId: existingSnapshot.routeDecision.id ?? null,
        finalResultId: existingSnapshot.finalResult?.id ?? null,
        legacyUnverified: false,
        sourceMessageIds: context.sourceMessageIds,
        rolloutMode,
        routeDecision: existingSnapshot.routeDecision as unknown as AutoTeamRouteDecisionRow,
        finalResult: existingSnapshot.finalResult as unknown as AutoTeamFinalResultRow,
      };
  }

  const routeDecision = existingSnapshot?.routeDecision
    ? (existingSnapshot.routeDecision as unknown as AutoTeamRouteDecisionRow)
    : await ensureRouteDecision({
      tenantId: input.tenantId,
      teamId: context.room?.teamId ?? existingSnapshot?.teamId ?? null,
      roomId: context.roomId,
      runId: context.runId,
      workRequestId: input.workRequestId ?? null,
      workCaseId: input.workCaseId ?? null,
      objective: context.objective,
      requestTitle: context.request?.request?.title ?? null,
      requestSummary: context.request?.request?.objective ?? context.request?.request?.title ?? null,
      workType: "auto_team_legacy_backfill",
      language: (context.room?.language === "th" ? "th" : "en"),
      availableCapabilities: null,
      teamPersonas: null,
    });

  const stagePlan = await ensureStagePlan({
    tenantId: input.tenantId,
    teamId: context.room?.teamId ?? existingSnapshot?.teamId ?? null,
    roomId: context.roomId,
    runId: context.runId,
    routeDecision,
    workItemId: null,
    objective: context.objective,
    language: (context.room?.language === "th" ? "th" : "en"),
  });

  await markStagesLegacyUnverified(input.tenantId, context.runId, context.sourceMessageIds);
  const finalResult = await createLegacyFinalResult({
    tenantId: input.tenantId,
    teamId: context.room?.teamId ?? stagePlan.routeDecision.teamId ?? null,
    roomId: context.roomId,
    runId: context.runId,
    routeDecision: routeDecision as AutoTeamRouteDecisionRow,
    sourceMessageIds: context.sourceMessageIds,
    objective: context.objective,
  });

  return {
    tenantId: input.tenantId,
    roomId: context.roomId,
    runId: context.runId,
    retryRunId: null,
    routeDecisionId: routeDecision.id ?? null,
    finalResultId: finalResult.id ?? null,
    legacyUnverified: true,
    sourceMessageIds: context.sourceMessageIds,
    rolloutMode,
    routeDecision: routeDecision as AutoTeamRouteDecisionRow,
    finalResult: finalResult as AutoTeamFinalResultRow,
  };
}

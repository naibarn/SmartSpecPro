/**
 * Run Engine — orchestrated execution lifecycle for team conversations.
 *
 * Manages start, pause, resume, stop, stop-policy evaluation,
 * and per-agent budget tracking.
 */

import { eq, and, sql, count, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  teamRuns,
  teamRooms,
  teamRoomMessages,
  assistantProfiles,
  agentActivityEvents,
  agentRunSummaries,
  type TeamRun,
  type StopPolicy,
  type BudgetSnapshot,
} from "../../drizzle/schema";
import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export type StopPolicyInput = StopPolicy;

export interface StopEvaluation {
  shouldStop: boolean;
  reason: string | null;
}

export interface StartRunInput {
  roomId: string;
  tenantId: string;
  initiatedByUserId: number;
  executionMode: "team_chat" | "auto_team" | "review";
  objective: string;
  stopPolicy: StopPolicyInput;
  constraintsJson?: Record<string, unknown>;
  approvalPolicyJson?: Record<string, unknown>;
}

export interface TurnCost {
  inputTokens: number;
  outputTokens: number;
  costCredits: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_STOP_POLICY: StopPolicyInput = {
  maxRounds: 20,
  maxDurationMinutes: 30,
  maxBudgetCredits: 100,
  stopOnConsensus: false,
  stopOnArtifactReady: false,
  stopOnLeadSummary: true,
  requireFinalSummary: true,
  idleTimeoutSeconds: 120,
};

const MAX_CONCURRENT_RUNS_PER_USER = 3;
const MAX_CONCURRENT_RUNS_PER_TENANT = 10;

// ─── Budget Tracking (pure functions, exported for testing) ─────────────────

export function initBudgetSnapshot(): BudgetSnapshot {
  return {
    totalCreditsUsed: 0,
    perAgent: {},
  };
}

export function accumulateBudget(
  snapshot: BudgetSnapshot,
  agentId: string,
  cost: TurnCost,
): BudgetSnapshot {
  const existing = snapshot.perAgent[agentId] ?? {
    creditsUsed: 0,
    inputTokens: 0,
    outputTokens: 0,
    turnCount: 0,
  };

  return {
    totalCreditsUsed: snapshot.totalCreditsUsed + cost.costCredits,
    perAgent: {
      ...snapshot.perAgent,
      [agentId]: {
        creditsUsed: existing.creditsUsed + cost.costCredits,
        inputTokens: existing.inputTokens + cost.inputTokens,
        outputTokens: existing.outputTokens + cost.outputTokens,
        turnCount: existing.turnCount + 1,
      },
    },
  };
}

// ─── Stop Policy Evaluation (pure function, exported for testing) ───────────

export interface StopConditionContext {
  currentRound: number;
  totalCreditsUsed: number;
  startedAt: Date;
  lastActivityAt: Date;
  leadSummaryDetected?: boolean;
  consensusDetected?: boolean;
  artifactReady?: boolean;
}

export function evaluateStopConditions(
  policy: StopPolicyInput,
  context: StopConditionContext,
): StopEvaluation {
  // 1. Max rounds
  if (context.currentRound >= policy.maxRounds) {
    return { shouldStop: true, reason: "max_rounds_reached" };
  }

  // 2. Max duration
  const elapsedMs = Date.now() - context.startedAt.getTime();
  if (elapsedMs >= policy.maxDurationMinutes * 60 * 1000) {
    return { shouldStop: true, reason: "max_duration" };
  }

  // 3. Budget exceeded
  if (context.totalCreditsUsed >= policy.maxBudgetCredits) {
    return { shouldStop: true, reason: "budget_exceeded" };
  }

  // 4. Idle timeout
  const idleMs = Date.now() - context.lastActivityAt.getTime();
  if (idleMs >= policy.idleTimeoutSeconds * 1000) {
    return { shouldStop: true, reason: "idle_timeout" };
  }

  // 5. Lead summary
  if (policy.stopOnLeadSummary && context.leadSummaryDetected) {
    return { shouldStop: true, reason: "lead_summary" };
  }

  // 6. Consensus
  if (policy.stopOnConsensus && context.consensusDetected) {
    return { shouldStop: true, reason: "consensus_reached" };
  }

  // 7. Artifact ready
  if (policy.stopOnArtifactReady && context.artifactReady) {
    return { shouldStop: true, reason: "artifact_ready" };
  }

  return { shouldStop: false, reason: null };
}

// ─── Run Lifecycle ──────────────────────────────────────────────────────────

export async function startRun(input: StartRunInput): Promise<TeamRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Load room — verify it belongs to the caller's tenant
  const [room] = await db
    .select()
    .from(teamRooms)
    .where(and(eq(teamRooms.id, input.roomId), eq(teamRooms.tenantId, input.tenantId)))
    .limit(1);

  if (!room || room.status !== "active") {
    throw new Error(`Room ${input.roomId} not found or not active`);
  }

  // Check concurrent run limits (user)
  const [userRunCount] = await db
    .select({ cnt: count() })
    .from(teamRuns)
    .where(
      and(
        eq(teamRuns.initiatedByUserId, input.initiatedByUserId),
        sql`${teamRuns.status} IN ('queued', 'running')`,
      ),
    );

  if (Number(userRunCount.cnt) >= MAX_CONCURRENT_RUNS_PER_USER) {
    throw new Error("Maximum concurrent runs per user reached");
  }

  // Find lead agent
  const [leadProfile] = await db
    .select()
    .from(assistantProfiles)
    .where(
      and(
        eq(assistantProfiles.teamId, room.teamId),
        eq(assistantProfiles.isLead, true),
      ),
    )
    .limit(1);

  const runId = crypto.randomUUID();
  const now = new Date();

  const [run] = await db
    .insert(teamRuns)
    .values({
      id: runId,
      roomId: input.roomId,
      teamId: room.teamId,
      initiatedByUserId: input.initiatedByUserId,
      executionMode: input.executionMode,
      objective: input.objective,
      constraintsJson: input.constraintsJson ?? null,
      approvalPolicyJson: input.approvalPolicyJson ?? null,
      stopPolicyJson: input.stopPolicy,
      budgetSnapshotJson: initBudgetSnapshot(),
      status: "running",
      activeAssistantId: leadProfile?.id ?? null,
      startedAt: now,
    })
    .returning();

  // Update room's lastRunId
  await db
    .update(teamRooms)
    .set({ lastRunId: runId, updatedAt: now })
    .where(eq(teamRooms.id, input.roomId));

  // TODO: Publish run_started event to Redis (Section 11)
  // TODO: Schedule first turn via BullMQ or setImmediate (Section 06 dependency)

  return run;
}

/**
 * Load a run by ID, verifying it belongs to the given tenant via its room.
 * Returns null if not found or tenant mismatch.
 */
async function loadRunWithTenantCheck(
  db: Awaited<ReturnType<typeof getDb>>,
  runId: string,
  tenantId?: string,
): Promise<TeamRun | null> {
  if (!db) return null;
  const [run] = await db
    .select()
    .from(teamRuns)
    .where(eq(teamRuns.id, runId))
    .limit(1);
  if (!run) return null;
  if (tenantId) {
    // Verify via room
    const [room] = await db
      .select({ tenantId: teamRooms.tenantId })
      .from(teamRooms)
      .where(and(eq(teamRooms.id, run.roomId), eq(teamRooms.tenantId, tenantId)))
      .limit(1);
    if (!room) return null;
  }
  return run;
}

export async function pauseRun(runId: string, tenantId?: string): Promise<TeamRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunWithTenantCheck(db, runId, tenantId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== "running") {
    throw new Error(`Run must be 'running' to pause, current status: ${run.status}`);
  }

  const [updated] = await db
    .update(teamRuns)
    .set({ status: "paused" })
    .where(eq(teamRuns.id, runId))
    .returning();

  return updated;
}

export async function resumeRun(runId: string, tenantId?: string): Promise<TeamRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunWithTenantCheck(db, runId, tenantId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== "paused") {
    throw new Error(`Run must be 'paused' to resume, current status: ${run.status}`);
  }

  const [updated] = await db
    .update(teamRuns)
    .set({ status: "running" })
    .where(eq(teamRuns.id, runId))
    .returning();

  // TODO: Schedule next turn

  return updated;
}

export async function stopRun(
  runId: string,
  reason: string,
  tenantId?: string,
): Promise<TeamRun> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const run = await loadRunWithTenantCheck(db, runId, tenantId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== "running" && run.status !== "paused") {
    throw new Error(`Run must be 'running' or 'paused' to stop, current status: ${run.status}`);
  }

  const now = new Date();

  const [updated] = await db.transaction(async (tx) => {
    // Update run status
    const [updatedRun] = await tx
      .update(teamRuns)
      .set({
        status: "completed",
        stopReason: reason,
        endedAt: now,
      })
      .where(eq(teamRuns.id, runId))
      .returning();

    // Generate agent run summaries
    const participants = await tx
      .select()
      .from(assistantProfiles)
      .where(eq(assistantProfiles.teamId, run.teamId));

    const budget = (run.budgetSnapshotJson as BudgetSnapshot) ?? initBudgetSnapshot();

    for (const participant of participants) {
      const agentBudget = budget.perAgent[participant.id] ?? {
        creditsUsed: 0,
        inputTokens: 0,
        outputTokens: 0,
        turnCount: 0,
      };

      await tx.insert(agentRunSummaries).values({
        runId,
        assistantId: participant.id,
        turnCount: agentBudget.turnCount,
        totalInputTokens: agentBudget.inputTokens,
        totalOutputTokens: agentBudget.outputTokens,
        totalCostCredits: String(agentBudget.creditsUsed),
      });
    }

    return [updatedRun];
  });

  // TODO: Publish run_completed event
  // TODO: Call summary service if requireFinalSummary

  return updated;
}

export async function getRun(runId: string, tenantId?: string): Promise<TeamRun | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return loadRunWithTenantCheck(db, runId, tenantId);
}

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

  // Start auto-stop policy checker
  startAutoStopChecker(runId);

  // Publish run_started event to Redis for SSE
  try {
    const { publishEvent, createEvent } = await import("./orchestratorEventBus");
    await publishEvent(createEvent("run_started", {
      tenantId: input.tenantId,
      teamId: room.teamId,
      roomId: input.roomId,
      runId,
      actorType: "user",
      actorId: String(input.initiatedByUserId),
      data: { executionMode: input.executionMode, objective: input.objective.slice(0, 200) },
      userId: input.initiatedByUserId,
    }));
  } catch {
    // Non-critical — SSE notification missed
  }

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

  stopAutoStopChecker(runId);
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

  // Restart auto-stop checker
  startAutoStopChecker(runId);

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

  stopAutoStopChecker(runId);

  // Publish run_completed event to Redis for SSE
  try {
    const { publishEvent, createEvent } = await import("./orchestratorEventBus");
    await publishEvent(createEvent("run_completed", {
      tenantId: tenantId ?? "",
      teamId: run.teamId,
      roomId: run.roomId,
      runId,
      actorType: "system",
      actorId: "system",
      data: { reason, status: "completed" },
    }));
  } catch {
    // Non-critical
  }

  // Generate final summary if stop policy requires it
  const stopPolicy = run.stopPolicyJson as StopPolicy | null;
  if (stopPolicy?.requireFinalSummary) {
    try {
      const bridge = await import("./teamOrchestrationBridge");
      if ("generateSummary" in bridge && typeof bridge.generateSummary === "function") {
        (bridge.generateSummary as Function)(run.roomId, runId).catch(() => {});
      }
    } catch {
      // Summary generation is best-effort
    }
  }

  return updated;
}

export async function getRun(runId: string, tenantId?: string): Promise<TeamRun | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return loadRunWithTenantCheck(db, runId, tenantId);
}

// ─── Auto-Stop Policy Checker ───────────────────────────────────────────────

/** Check a single run's stop policy and auto-stop if conditions are met. */
export async function checkAndAutoStop(runId: string): Promise<StopEvaluation> {
  const db = await getDb();
  if (!db) return { shouldStop: false, reason: null };

  const [run] = await db.select().from(teamRuns).where(eq(teamRuns.id, runId)).limit(1);
  if (!run || run.status !== "running") return { shouldStop: false, reason: null };

  const policy = run.stopPolicyJson as StopPolicyInput | null;
  if (!policy) return { shouldStop: false, reason: null };

  const budget = (run.budgetSnapshotJson as BudgetSnapshot) ?? initBudgetSnapshot();

  // Count rounds (turns completed)
  const [roundCount] = await db
    .select({ cnt: count() })
    .from(agentActivityEvents)
    .where(and(eq(agentActivityEvents.runId, runId), sql`${agentActivityEvents.eventType} = 'agent_turn'`));

  // Get latest activity timestamp
  const [latestActivity] = await db
    .select({ ts: agentActivityEvents.createdAt })
    .from(agentActivityEvents)
    .where(eq(agentActivityEvents.runId, runId))
    .orderBy(desc(agentActivityEvents.createdAt))
    .limit(1);

  const evaluation = evaluateStopConditions(policy, {
    currentRound: Number(roundCount?.cnt ?? 0),
    totalCreditsUsed: budget.totalCreditsUsed,
    startedAt: run.startedAt ?? new Date(),
    lastActivityAt: latestActivity?.ts ?? run.startedAt ?? new Date(),
  });

  if (evaluation.shouldStop) {
    await stopRun(runId, evaluation.reason ?? "auto_stop_policy");
  }

  return evaluation;
}

const AUTO_STOP_CHECK_INTERVAL_MS = 30_000; // 30 seconds
const activeCheckers = new Map<string, ReturnType<typeof setInterval>>();

/** Start periodic auto-stop checking for a run. Call after startRun. */
export function startAutoStopChecker(runId: string): void {
  if (activeCheckers.has(runId)) return;

  const interval = setInterval(async () => {
    try {
      const result = await checkAndAutoStop(runId);
      if (result.shouldStop) {
        stopAutoStopChecker(runId);
      }
    } catch {
      // Checker error — will retry next interval
    }
  }, AUTO_STOP_CHECK_INTERVAL_MS);

  activeCheckers.set(runId, interval);
}

/** Stop the periodic checker (on manual stop, pause, or completion). */
export function stopAutoStopChecker(runId: string): void {
  const interval = activeCheckers.get(runId);
  if (interval) {
    clearInterval(interval);
    activeCheckers.delete(runId);
  }
}

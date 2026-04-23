import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { teamRooms, teamRuns } from "../../drizzle/schema";
import * as runEngine from "./runEngine";

const AUTO_TEAM_RECOVERY_INTERVAL_MS = 30_000;
let recoveryTimer: ReturnType<typeof setInterval> | null = null;

export async function sweepPendingAutoTeamRuns(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const candidateRuns = await db
    .select({
      id: teamRuns.id,
      tenantId: teamRooms.tenantId,
      status: teamRuns.status,
      stopReason: teamRuns.stopReason,
    })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(eq(teamRuns.executionMode, "auto_team"))
    .limit(100);

  let resumed = 0;
  for (const run of candidateRuns) {
    if (runEngine.hasQueuedAutoAdvance(run.id)) {
      continue;
    }

    const currentRun = await runEngine.getRun(run.id, run.tenantId).catch(() => null);
    if (!currentRun) {
      continue;
    }

    if (currentRun.status === "paused" && currentRun.stopReason === "awaiting_human_choice") {
      const deadline = currentRun.runtimeState?.choiceDeadlineAt ? new Date(currentRun.runtimeState.choiceDeadlineAt) : null;
      if (deadline && Number.isFinite(deadline.getTime()) && deadline > new Date()) {
        continue;
      }
      try {
        await runEngine.resumeRun(run.id, run.tenantId);
        resumed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already advancing") && !message.includes("must be 'running' to resume")) {
          console.warn("[auto-team-recovery] failed to resume timed-out exploration choice", {
            runId: run.id,
            tenantId: run.tenantId,
            error: message,
          });
        }
      }
      continue;
    }

    if (currentRun.status === "paused" && currentRun.stopReason === "awaiting_final_approval") {
      const deadline = currentRun.runtimeState?.choiceDeadlineAt ? new Date(currentRun.runtimeState.choiceDeadlineAt) : null;
      if (deadline && Number.isFinite(deadline.getTime()) && deadline > new Date()) {
        continue;
      }
      try {
        await runEngine.approveFinalReview(run.id, run.tenantId, "Auto-approved after final review timeout.");
        resumed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already advancing") && !message.includes("must be paused for final approval")) {
          console.warn("[auto-team-recovery] failed to approve timed-out final review", {
            runId: run.id,
            tenantId: run.tenantId,
            error: message,
          });
        }
      }
      continue;
    }

    if (currentRun.status !== "running") {
      continue;
    }

    if (!(await runEngine.isAutoTeamPlanReady(run.id, run.tenantId))) {
      continue;
    }

    try {
      await runEngine.advanceRun(run.id, run.tenantId, 1);
      resumed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("already advancing") && !message.includes("must be 'running' to advance")) {
        console.warn("[auto-team-recovery] failed to advance run", {
          runId: run.id,
          tenantId: run.tenantId,
          error: message,
        });
      }
    }
  }

  return resumed;
}

export function startAutoTeamRecoverySweep(): void {
  if (recoveryTimer) return;
  recoveryTimer = setInterval(() => {
    void sweepPendingAutoTeamRuns().catch((error) => {
      console.warn("[auto-team-recovery] sweep failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, AUTO_TEAM_RECOVERY_INTERVAL_MS);
  recoveryTimer.unref?.();
}

export function stopAutoTeamRecoverySweep(): void {
  if (!recoveryTimer) return;
  clearInterval(recoveryTimer);
  recoveryTimer = null;
}

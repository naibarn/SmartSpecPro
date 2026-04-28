import { and, asc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../db";
import { teamRooms, teamRuns } from "../../drizzle/schema";
import * as runEngine from "./runEngine";
import * as automationFabricService from "./workAutomationFabricService";
import * as autoTeamMediaCompletionService from "./autoTeamMediaCompletionService";

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
    .where(
      and(
        eq(teamRuns.executionMode, "auto_team"),
        inArray(teamRuns.status, ["running", "paused"]),
        or(
          eq(teamRuns.status, "running"),
          inArray(teamRuns.stopReason, [
            "awaiting_human_choice",
            "awaiting_final_approval",
            "runtime_dispatch_blocked:budget_cap_exceeded",
            "auto_team_step_validation_failed",
            "auto_team_final_evidence_unresolved",
            "auto_team_media_final_evidence_unresolved",
            "awaiting_async_media_pipeline",
          ]),
        ),
      ),
    )
    .orderBy(asc(teamRuns.startedAt), asc(teamRuns.id))
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
        const completed = await runEngine.autoCompleteFinalReviewIfEvidenceReady(
          run.id,
          run.tenantId,
          "Auto-completed after final review timeout with resolved final evidence.",
        );
        if (completed) resumed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already advancing")) {
          console.warn("[auto-team-recovery] failed to auto-complete timed-out final review", {
            runId: run.id,
            tenantId: run.tenantId,
            error: message,
          });
        }
      }
      continue;
    }

    if (
      currentRun.status === "paused" &&
      currentRun.stopReason === "runtime_dispatch_blocked:budget_cap_exceeded" &&
      Boolean(
        currentRun.runtimeState &&
          typeof currentRun.runtimeState === "object" &&
          (currentRun.runtimeState as unknown as Record<string, unknown>).autoReplanRequested === true,
      )
    ) {
      try {
        const recovered = await runEngine.recoverBudgetBlockedAutoTeamRun(
          run.id,
          run.tenantId,
        );
        if (recovered) resumed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already advancing")) {
          console.warn("[auto-team-recovery] failed to recover budget-blocked run", {
            runId: run.id,
            tenantId: run.tenantId,
            error: message,
          });
        }
      }
      continue;
    }

    if (
      currentRun.status === "paused" &&
      currentRun.stopReason === "auto_team_step_validation_failed" &&
      Boolean(
        currentRun.runtimeState &&
          typeof currentRun.runtimeState === "object" &&
          (currentRun.runtimeState as unknown as Record<string, unknown>)
            .capabilityGapResumeRequested === true,
      )
    ) {
      try {
        const recovered = await runEngine.recoverCapabilityGapAutoTeamRun(
          run.id,
          run.tenantId,
        );
        if (recovered) resumed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already advancing")) {
          console.warn("[auto-team-recovery] failed to recover capability-gap run", {
            runId: run.id,
            tenantId: run.tenantId,
            error: message,
          });
        }
      }
      continue;
    }

    if (
      currentRun.status === "paused" &&
      [
        "auto_team_final_evidence_unresolved",
        "auto_team_media_final_evidence_unresolved",
      ].includes(currentRun.stopReason ?? "")
    ) {
      try {
        const recovered = await runEngine.recoverFinalEvidenceGateIfReady(
          run.id,
          run.tenantId,
        );
        if (recovered) resumed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already advancing")) {
          console.warn("[auto-team-recovery] failed to recover final evidence gate", {
            runId: run.id,
            tenantId: run.tenantId,
            error: message,
          });
        }
      }
      continue;
    }

    if (
      currentRun.status === "paused" &&
      currentRun.stopReason === "awaiting_async_media_pipeline"
    ) {
      const runtimeState = currentRun.runtimeState as unknown as Record<string, unknown> | null;
      const pipeline =
        runtimeState &&
        typeof runtimeState === "object" &&
        runtimeState.autoTeamMediaPipeline &&
        typeof runtimeState.autoTeamMediaPipeline === "object"
          ? (runtimeState.autoTeamMediaPipeline as Record<string, unknown>)
          : null;
      const status = typeof pipeline?.status === "string" ? pipeline.status : null;
      if (
        !status ||
        ![
          "collecting_assets",
          "waiting_for_video_tasks",
          "rendering_final_video",
          "probing_final_video",
          "finalizing_evidence",
        ].includes(status)
      ) {
        console.warn("[auto-team-recovery] async media wait has no active pipeline state", {
          runId: run.id,
          tenantId: run.tenantId,
          mediaPipelineStatus: status,
        });
        await db
          .update(teamRuns)
          .set({
            stopReason: "auto_team_media_pipeline_state_missing",
            runtimeTerminalReason:
              "Async media pipeline wait cannot continue because the pipeline state is missing or inactive.",
          })
          .where(eq(teamRuns.id, run.id));
        const constraints =
          currentRun.constraintsJson &&
          typeof currentRun.constraintsJson === "object" &&
          !Array.isArray(currentRun.constraintsJson)
            ? (currentRun.constraintsJson as Record<string, unknown>)
            : {};
        const workAutomationRunId =
          typeof constraints.workOsAutomationRunId === "string"
            ? constraints.workOsAutomationRunId
            : null;
        const workCaseId =
          typeof constraints.workCaseId === "string"
            ? constraints.workCaseId
            : null;
        if (workAutomationRunId && workCaseId) {
          await automationFabricService
            .recordAutomationRunStepProgress({
              tenantId: run.tenantId,
              caseId: workCaseId,
              runId: workAutomationRunId,
              stepKey: "async_media_pipeline",
              stepIndex: 999,
              title: "Async media pipeline",
              status: "failed",
              surface: "media_studio",
              summary:
                "Async media pipeline wait cannot continue because the pipeline state is missing or inactive.",
              runStatus: "failed",
              finalDisposition: "failed",
              finalDispositionReason: "auto_team_media_pipeline_state_missing",
              detailJson: {
                teamRunId: run.id,
                mediaPipelineStatus: status,
              },
            })
            .catch(error => {
              console.warn("[auto-team-recovery] failed to sync missing media pipeline to Work OS", {
                runId: run.id,
                tenantId: run.tenantId,
                error: error instanceof Error ? error.message : String(error),
              });
            });
        }
      } else {
        try {
          await autoTeamMediaCompletionService.advanceAutoTeamMediaPipeline(run.id);
          resumed += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn("[auto-team-recovery] failed to advance async media pipeline", {
            runId: run.id,
            tenantId: run.tenantId,
            mediaPipelineStatus: status,
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

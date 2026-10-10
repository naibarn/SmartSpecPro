import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { teamRooms, teamRuns, workerJobs } from "../../drizzle/schema";
import * as runEngine from "./runEngine";
import * as automationFabricService from "./workAutomationFabricService";
import * as autoTeamMediaCompletionService from "./autoTeamMediaCompletionService";
import { createCanonicalJobInTransaction } from "./jobControlPlane";
import {
  AUTO_TEAM_RECOVERY_POLL_INTERVAL_MS,
  buildAutoTeamRecoveryEvaluationJob,
  fingerprintAutoTeamRecoveryState,
} from "./autoTeamRecoveryEvaluationJob";

export interface AutoTeamRecoverySweepResult {
  actionsDispatched: number;
  usefulWorkVerified: boolean;
  usefulWorkEvidence: string[];
}

export async function sweepPendingAutoTeamRuns(options: {
  onlyRunId?: string;
  expectedStateFingerprint?: string;
} = {}): Promise<AutoTeamRecoverySweepResult> {
  const db = await getDb();
  if (!db) return { actionsDispatched: 0, usefulWorkVerified: false, usefulWorkEvidence: [] };

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
        options.onlyRunId ? eq(teamRuns.id, options.onlyRunId) : undefined,
      ),
    )
    .orderBy(asc(teamRuns.startedAt), asc(teamRuns.id))
    .limit(100);

  let resumed = 0;
  const usefulWorkEvidence: string[] = [];
  for (const run of candidateRuns) {
    if (runEngine.hasQueuedAutoAdvance(run.id)) {
      continue;
    }

    const currentRun = await runEngine.getRun(run.id, run.tenantId).catch(() => null);
    if (!currentRun) {
      continue;
    }
    if (
      options.expectedStateFingerprint &&
      fingerprintAutoTeamRecoveryState(currentRun) !== options.expectedStateFingerprint
    ) {
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
        if (completed) {
          resumed += 1;
          usefulWorkEvidence.push("final_review_completed");
        }
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

    const runtimeState =
      currentRun.runtimeState && typeof currentRun.runtimeState === "object"
        ? (currentRun.runtimeState as unknown as Record<string, unknown>)
        : {};
    const runtimeTerminalReason =
      typeof (currentRun as unknown as Record<string, unknown>).runtimeTerminalReason === "string"
        ? ((currentRun as unknown as Record<string, unknown>).runtimeTerminalReason as string)
        : "";
    const stopReason = currentRun.stopReason ?? "";
    const isBudgetRecoveryCandidate =
      currentRun.status === "paused" &&
      (stopReason === "runtime_dispatch_blocked:budget_cap_exceeded" ||
        runtimeTerminalReason === "budget_cap_exceeded" ||
        (stopReason.includes("budget") && stopReason.includes("exceed"))) &&
      runtimeState.autoReplanRequested === true;
    if (isBudgetRecoveryCandidate) {
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
      String(
        (currentRun as unknown as Record<string, unknown>).runtimeTerminalReason ?? "",
      ).includes("media_step_missing_artifact_reference")
    ) {
      try {
        const recovered = await runEngine.recoverPromptPackageValidationAutoTeamRun(
          run.id,
          run.tenantId,
        );
        if (recovered) resumed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already advancing")) {
          console.warn("[auto-team-recovery] failed to recover prompt-package validation run", {
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
        runtimeState.capabilityGapResumeRequested === true,
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
      // A capacity wait is a valid resource wait, not missing pipeline state.
      // Leave it persisted for the normal capacity signal/poll to resume; a
      // recovery scan must not treat this as permission to dispatch more work.
      if (status === "capacity_wait") {
        continue;
      }
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
      const turns = await runEngine.advanceRun(run.id, run.tenantId, 1);
      if (turns.length > 0 && turns.some(turn => turn.messageId && turn.content.trim())) {
        usefulWorkEvidence.push("assistant_turn_persisted");
      }
      if (turns.length > 0) resumed += 1;
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

  return {
    actionsDispatched: resumed,
    usefulWorkVerified: usefulWorkEvidence.length > 0,
    usefulWorkEvidence,
  };
}

export function isRecoveryEvaluationEligible(
  run: Awaited<ReturnType<typeof runEngine.getRun>>,
  now: Date,
): boolean {
  if (!run || runEngine.hasQueuedAutoAdvance(run.id)) return false;
  if (run.status === "running") return true;
  if (run.status !== "paused") return false;

  if (["awaiting_human_choice", "awaiting_final_approval"].includes(run.stopReason ?? "")) {
    const deadline = run.runtimeState?.choiceDeadlineAt
      ? new Date(run.runtimeState.choiceDeadlineAt)
      : null;
    return !deadline || !Number.isFinite(deadline.getTime()) || deadline <= now;
  }
  if (run.stopReason === "runtime_dispatch_blocked:budget_cap_exceeded") {
    return run.runtimeState?.autoReplanRequested === true;
  }
  if (run.stopReason === "auto_team_step_validation_failed") {
    return (
      String((run as unknown as Record<string, unknown>).runtimeTerminalReason ?? "")
        .includes("media_step_missing_artifact_reference") ||
      run.runtimeState?.capabilityGapResumeRequested === true
    );
  }
  if (
    ["auto_team_final_evidence_unresolved", "auto_team_media_final_evidence_unresolved"].includes(
      run.stopReason ?? "",
    )
  ) return true;
  if (run.stopReason !== "awaiting_async_media_pipeline") return false;

  const pipeline = run.runtimeState?.autoTeamMediaPipeline;
  if (!pipeline || typeof pipeline !== "object" || Array.isArray(pipeline)) return true;
  const status = (pipeline as Record<string, unknown>).status;
  return [
    "collecting_assets",
    "waiting_for_video_tasks",
    "rendering_final_video",
    "probing_final_video",
    "finalizing_evidence",
    "capacity_wait",
  ].includes(String(status));
}

/** Queue independent, durable evaluation jobs so one waiting run cannot block others. */
export async function dispatchPendingAutoTeamEvaluations(
  now = new Date(),
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const candidates = await db
    .select({ id: teamRuns.id, tenantId: teamRooms.tenantId })
    .from(teamRuns)
    .innerJoin(teamRooms, eq(teamRooms.id, teamRuns.roomId))
    .where(and(
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
    ))
    .orderBy(asc(teamRuns.startedAt), asc(teamRuns.id))
    .limit(100);

  let queued = 0;
  const evaluationSlot = Math.floor(now.getTime() / AUTO_TEAM_RECOVERY_POLL_INTERVAL_MS);
  for (const candidate of candidates) {
    try {
      const currentRun = await runEngine.getRun(candidate.id, candidate.tenantId).catch(() => null);
      if (!currentRun || !isRecoveryEvaluationEligible(currentRun, now)) continue;
      if (
        currentRun.status === "running" &&
        !(await runEngine.isAutoTeamPlanReady(candidate.id, candidate.tenantId))
      ) continue;
      const stateFingerprint = fingerprintAutoTeamRecoveryState(currentRun);
      const definition = buildAutoTeamRecoveryEvaluationJob({
        tenantId: candidate.tenantId,
        runId: candidate.id,
        stateFingerprint,
        evaluationSlot,
      });
      const created = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`auto-team-recovery:${candidate.tenantId}:${candidate.id}`}, 0))`);
        const failedStateJob = await tx
          .select({ id: workerJobs.id })
          .from(workerJobs)
          .where(and(
            eq(workerJobs.tenantId, candidate.tenantId),
            eq(workerJobs.jobType, "auto-team.recovery.evaluate"),
            inArray(workerJobs.status, ["failed", "cancelled", "expired"]),
            like(
              workerJobs.idempotencyKey,
              `auto-team-recovery:${candidate.id}:${stateFingerprint}:%`,
            ),
          ))
          .limit(1);
        if (failedStateJob[0]) return false;

        if (currentRun.status === "running") {
          const recentEvaluations = await tx
            .select({ outputJson: workerJobs.outputJson })
            .from(workerJobs)
            .where(and(
              eq(workerJobs.tenantId, candidate.tenantId),
              eq(workerJobs.jobType, "auto-team.recovery.evaluate"),
              eq(workerJobs.status, "completed"),
              like(workerJobs.idempotencyKey, `auto-team-recovery:${candidate.id}:${stateFingerprint}:%`),
            ))
            .orderBy(desc(workerJobs.createdAt))
            .limit(3);
          const noProgressOutcomes = new Set([
            "no_action",
            "recovery_action_applied_unverified",
            "recovery_dispatched_unverified",
          ]);
          const repeatedNoProgress = recentEvaluations.length === 3 && recentEvaluations.every(row => {
            const output = row.outputJson && typeof row.outputJson === "object"
              ? row.outputJson as Record<string, unknown>
              : {};
            return noProgressOutcomes.has(String(output.outcome ?? ""));
          });
          if (repeatedNoProgress) return false;
        }

        const [previous] = await tx
          .select({ id: workerJobs.id })
          .from(workerJobs)
          .where(and(
            eq(workerJobs.tenantId, candidate.tenantId),
            eq(workerJobs.idempotencyKey, definition.idempotencyKey!),
          ))
          .limit(1);
        if (previous) return false;
        const job = await createCanonicalJobInTransaction({
          query: tx,
          definition,
          options: {
            runtimeType: "node_job_worker",
            requestedBySystemComponent: "auto_team_recovery",
          },
          createdPayload: { source: "auto_team_recovery" },
          queuedPayload: { source: "auto_team_recovery" },
        });
        return job.created;
      });
      if (created) queued += 1;
    } catch (error) {
      console.warn("[auto-team-recovery] failed to enqueue run evaluation", {
        runId: candidate.id,
        tenantId: candidate.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return queued;
}

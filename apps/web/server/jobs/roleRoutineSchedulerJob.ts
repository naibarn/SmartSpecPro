import { reconcileRoleRoutineRuns, executeRoleRoutineRun } from "../services/roleExecutionService";
import { runRoleGovernanceMaintenance } from "../services/rolePersistence";
import { tickRoleRoutineScheduler } from "../services/roleRoutineSchedulerService";

const DEFAULT_TICK_MS = 60_000;
const DEFAULT_GOVERNANCE_TICK_INTERVAL = 15;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let governanceCounter = 0;

function resolveTickMs(): number {
  const raw = Number(process.env.ROLE_ROUTINE_SCHEDULE_TICK_MS ?? DEFAULT_TICK_MS);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : DEFAULT_TICK_MS;
}

function resolveGovernanceTickInterval(): number {
  const raw = Number(process.env.ROLE_ROUTINE_GOVERNANCE_TICK_INTERVAL ?? DEFAULT_GOVERNANCE_TICK_INTERVAL);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_GOVERNANCE_TICK_INTERVAL;
}

function scheduleNextTick(delayMs: number): void {
  timer = setTimeout(() => {
    void tickRoleSchedulerJob();
  }, delayMs);
}

async function tickRoleSchedulerJob(): Promise<void> {
  if (running) {
    scheduleNextTick(resolveTickMs());
    return;
  }

  running = true;
  try {
    const claimantId = `role_scheduler:${process.pid}`;
    const result = await tickRoleRoutineScheduler({
      claimantId,
      executeRoleRoutineRun: async (routineRunId) => {
        await executeRoleRoutineRun({ routineRunId });
      },
    });
    const reconciled = await reconcileRoleRoutineRuns();
    governanceCounter += 1;
    if (governanceCounter >= resolveGovernanceTickInterval()) {
      await runRoleGovernanceMaintenance();
      governanceCounter = 0;
      console.log("[role-routine-scheduler] governance maintenance completed");
    }
    if (result.enqueuedQueueItemIds.length > 0 || result.launchedRoutineRunIds.length > 0 || result.quarantinedRoutineRunIds.length > 0) {
      console.log("[role-routine-scheduler] tick", {
        enqueued: result.enqueuedQueueItemIds.length,
        launched: result.launchedRoutineRunIds.length,
        quarantined: result.quarantinedRoutineRunIds.length,
        reconciled: reconciled.length,
      });
    }
  } catch (error) {
    console.error("[role-routine-scheduler] failed:", error);
  } finally {
    running = false;
    scheduleNextTick(resolveTickMs());
  }
}

export async function initializeRoleRoutineSchedulerJob(): Promise<void> {
  if (process.env.ROLE_ROUTINE_SCHEDULER_JOB_ENABLED === "false") {
    console.log("[role-routine-scheduler] disabled by env");
    return;
  }
  if (timer) {
    return;
  }
  console.log(`[role-routine-scheduler] initialized with ${resolveTickMs()}ms cadence`);
  scheduleNextTick(5_000);
}

export async function shutdownRoleRoutineSchedulerJob(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  running = false;
  governanceCounter = 0;
}


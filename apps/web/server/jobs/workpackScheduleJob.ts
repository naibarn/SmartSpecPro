import { reconcileDispatchedWorkpackRuns, runDueWorkpackSchedules } from "../services/workpackLaunchService";

const DEFAULT_TICK_MS = 60_000;

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

function resolveTickMs(): number {
  const raw = Number(process.env.WORKPACK_SCHEDULE_TICK_MS ?? DEFAULT_TICK_MS);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : DEFAULT_TICK_MS;
}

function scheduleNextTick(delayMs: number): void {
  timer = setTimeout(() => {
    void tickWorkpackSchedules();
  }, delayMs);
}

async function tickWorkpackSchedules(): Promise<void> {
  if (running) {
    scheduleNextTick(resolveTickMs());
    return;
  }

  running = true;
  try {
    const launchedRunIds = await runDueWorkpackSchedules();
    const reconciledRunIds = await reconcileDispatchedWorkpackRuns();
    if (launchedRunIds.length > 0) {
      console.log(`[workpack-schedule] launched ${launchedRunIds.length} due workpack runs`);
    }
    if (reconciledRunIds.length > 0) {
      console.log(`[workpack-schedule] reconciled ${reconciledRunIds.length} active workpack runs`);
    }
  } catch (error) {
    console.error("[workpack-schedule] failed to process due schedules:", error);
  } finally {
    running = false;
    scheduleNextTick(resolveTickMs());
  }
}

export async function initializeWorkpackScheduleJob(): Promise<void> {
  if (process.env.WORKPACK_SCHEDULE_JOB_ENABLED === "false") {
    console.log("[workpack-schedule] disabled by env");
    return;
  }
  if (timer) {
    return;
  }
  console.log(`[workpack-schedule] initialized with ${resolveTickMs()}ms cadence`);
  scheduleNextTick(5_000);
}

export async function shutdownWorkpackScheduleJob(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  running = false;
}

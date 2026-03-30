import {
  initializeSkillMaintenanceScheduler,
  shutdownSkillMaintenanceScheduler,
  runDueSkillMaintenanceSchedules,
} from "../services/skillMaintenanceScheduler";

export async function initializeSkillMaintenanceScheduleJob(): Promise<void> {
  await initializeSkillMaintenanceScheduler();
}

export async function executeSkillMaintenanceScheduleJob(): Promise<{ scannedSchedules: number; executedSchedules: number }> {
  return runDueSkillMaintenanceSchedules();
}

export async function shutdownSkillMaintenanceScheduleJob(): Promise<void> {
  await shutdownSkillMaintenanceScheduler();
}

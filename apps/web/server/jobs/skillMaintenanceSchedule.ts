import {
  initializeSkillMaintenanceScheduler,
  shutdownSkillMaintenanceScheduler,
  runDueSkillMaintenanceSchedules,
} from "../services/skillMaintenanceScheduler";
import { shouldRunFeature192InProcessTimer } from "./feature192TimerPolicy";

export async function initializeSkillMaintenanceScheduleJob(): Promise<void> {
  if (!shouldRunFeature192InProcessTimer("initializeSkillMaintenanceScheduleJob")) return;
  await initializeSkillMaintenanceScheduler();
}

export async function executeSkillMaintenanceScheduleJob(): Promise<{ scannedSchedules: number; executedSchedules: number }> {
  if (!shouldRunFeature192InProcessTimer("initializeSkillMaintenanceScheduleJob")) {
    return { scannedSchedules: 0, executedSchedules: 0 };
  }
  return runDueSkillMaintenanceSchedules();
}

export async function shutdownSkillMaintenanceScheduleJob(): Promise<void> {
  if (!shouldRunFeature192InProcessTimer("initializeSkillMaintenanceScheduleJob")) return;
  await shutdownSkillMaintenanceScheduler();
}

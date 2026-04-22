export const WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES = {
  chatToRequestLaunch: "WORK_ORCHESTRATOR_CHAT_TO_REQUEST",
  workflowSurfacePlanning: "WORK_ORCHESTRATOR_WORKFLOW_SURFACE_PLANNING",
  skillStudioPlanning: "WORK_ORCHESTRATOR_SKILL_STUDIO_PLANNING",
  learningLoopAutomation: "WORK_ORCHESTRATOR_LEARNING_LOOP_AUTOMATION",
  privilegedSurfaceAutoExecution:
    "WORK_ORCHESTRATOR_PRIVILEGED_SURFACE_AUTO_EXECUTION",
  approvalSnapshotEnforcement:
    "WORK_ORCHESTRATOR_APPROVAL_SNAPSHOT_ENFORCEMENT",
  launchEnforcement: "WORK_ORCHESTRATOR_LAUNCH_ENFORCEMENT",
} as const;

export interface WorkOrchestratorFeatureFlags {
  chatToRequestLaunch: boolean;
  workflowSurfacePlanning: boolean;
  skillStudioPlanning: boolean;
  learningLoopAutomation: boolean;
  privilegedSurfaceAutoExecution: boolean;
  approvalSnapshotEnforcement: boolean;
  launchEnforcement: boolean;
}

function readEnvBoolean(flagName: string, fallback: boolean): boolean {
  const raw = process.env[flagName];
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export async function getWorkOrchestratorFeatureFlags(): Promise<WorkOrchestratorFeatureFlags> {
  return {
    chatToRequestLaunch: readEnvBoolean(
      WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES.chatToRequestLaunch,
      true,
    ),
    workflowSurfacePlanning: readEnvBoolean(
      WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES.workflowSurfacePlanning,
      true,
    ),
    skillStudioPlanning: readEnvBoolean(
      WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES.skillStudioPlanning,
      true,
    ),
    learningLoopAutomation: readEnvBoolean(
      WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES.learningLoopAutomation,
      true,
    ),
    privilegedSurfaceAutoExecution: readEnvBoolean(
      WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES.privilegedSurfaceAutoExecution,
      false,
    ),
    approvalSnapshotEnforcement: readEnvBoolean(
      WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES.approvalSnapshotEnforcement,
      true,
    ),
    launchEnforcement: readEnvBoolean(
      WORK_ORCHESTRATOR_FEATURE_FLAG_NAMES.launchEnforcement,
      false,
    ),
  };
}

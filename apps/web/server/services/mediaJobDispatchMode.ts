import { getCloudTasksConfigStatus } from "./cloudTasks";
import { getFeatureFlag } from "./featureFlags";

export async function shouldUseCloudTasksForMediaJobs(): Promise<boolean> {
  const useCloudTasks = await getFeatureFlag("USE_CLOUD_TASKS");
  if (!useCloudTasks) return false;

  const config = getCloudTasksConfigStatus("python");
  if (!config.configured) {
    console.warn(
      `[MediaJobs] USE_CLOUD_TASKS is enabled but Cloud Tasks config is incomplete; using direct Python dispatch. Missing: ${config.missingKeys.join(", ")}`,
    );
    return false;
  }

  return true;
}

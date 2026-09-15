export async function shouldUseCloudTasksForMediaJobs(): Promise<boolean> {
  // Google Cloud Tasks is retired. Media jobs use the canonical Python
  // control-plane dispatch, which selects the Cloudflare target at publish.
  return false;
}

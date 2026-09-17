export async function shouldUseCloudTasksForMediaJobs(): Promise<boolean> {
  // Google Cloud Tasks is retired. Media jobs use the canonical Python
  // control-plane dispatch, which selects PostgreSQL-pull locally or the
  // explicitly activated Cloudflare target at publish.
  return false;
}

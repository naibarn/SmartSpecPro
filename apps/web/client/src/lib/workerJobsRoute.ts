export const WORKER_JOBS_ROUTE = "/worker-jobs";
export const LEGACY_RENDER_JOBS_ROUTE = "/render-jobs";

/** Preserve queue deep-link filters when a legacy bookmark is opened. */
export function getCanonicalWorkerJobsPath(search = "", options: { legacyAlias?: boolean } = {}): string {
  const normalized = search.trim();
  if (!options.legacyAlias) {
    if (!normalized) return WORKER_JOBS_ROUTE;
    return `${WORKER_JOBS_ROUTE}${normalized.startsWith("?") ? normalized : `?${normalized}`}`;
  }
  const params = new URLSearchParams(normalized.startsWith("?") ? normalized.slice(1) : normalized);
  params.set("legacyAlias", "render-jobs");
  const query = params.toString();
  return query ? `${WORKER_JOBS_ROUTE}?${query}` : WORKER_JOBS_ROUTE;
}

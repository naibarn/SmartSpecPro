/**
 * RouteLoadingSkeleton — Suspense fallback shown during route-level
 * chunk loading and i18next namespace loading.
 *
 * Replaces the previous `fallback={null}` to prevent a blank-flash
 * during async chunk / namespace fetch.
 */
export function RouteLoadingSkeleton() {
  return (
    <div
      data-testid="route-loading-skeleton"
      aria-hidden="true"
      role="presentation"
      className="flex flex-col w-full h-screen bg-background"
    >
      {/* Top bar placeholder */}
      <div className="h-14 w-full border-b px-4 flex items-center gap-3">
        <div className="animate-pulse h-8 w-8 rounded-full bg-muted" />
        <div className="animate-pulse h-4 w-32 rounded bg-muted" />
        <div className="ml-auto animate-pulse h-8 w-24 rounded bg-muted" />
      </div>
      {/* Content area placeholder */}
      <div className="flex-1 p-6 flex flex-col gap-4">
        <div className="animate-pulse h-8 w-64 rounded bg-muted" />
        <div className="animate-pulse h-4 w-full rounded bg-muted" />
        <div className="animate-pulse h-4 w-5/6 rounded bg-muted" />
        <div className="animate-pulse h-4 w-4/6 rounded bg-muted" />
      </div>
    </div>
  );
}

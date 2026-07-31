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

export function RouteLoadingError({
  title = "Unable to load this page",
  description = "The service did not respond in time. Please try again.",
  retryLabel = "Retry",
  onRetry,
}: {
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry: () => void;
}) {
  return (
    <main
      data-testid="route-loading-error"
      role="alert"
      aria-live="polite"
      className="flex min-h-screen w-full items-center justify-center bg-background px-6 text-foreground"
    >
      <section className="flex max-w-lg flex-col items-center gap-3 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {retryLabel}
        </button>
      </section>
    </main>
  );
}

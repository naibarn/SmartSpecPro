/**
 * _AppPageExample — standalone reference page for `AppPage`.
 *
 * This is NOT wired into `App.tsx` routing. It exists purely as a
 * copy-paste reference showing how a real route should be built on top
 * of the `AppPage` central template: a title/description/breadcrumbs
 * header, action buttons, and a card grid body that can be toggled
 * through all four `AppPage` states (loading / error / empty / ready).
 *
 * To try it in-browser, temporarily add a route in `App.tsx`:
 *   const AppPageExample = lazy(() => import("@/pages/_AppPageExample"));
 *   <Route path="/dev/app-page-example" component={AppPageExample} />
 * (Remove it again before committing — this file is reference-only.)
 *
 * Note: this file intentionally does NOT import `@astryxdesign` directly.
 * Only `AppPage.tsx` is allowed to do that — every page (including this
 * one) should only ever import `AppPage`.
 */
import { useState } from "react";
import { Plus, RefreshCw, Sparkles } from "lucide-react";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { Button } from "@/components/ui/button";

type ExampleSeries = {
  id: string;
  title: string;
  status: "draft" | "active" | "completed";
  episodeCount: number;
};

const EXAMPLE_SERIES: ExampleSeries[] = [
  { id: "1", title: "Moonlight Debt", status: "active", episodeCount: 12 },
  { id: "2", title: "Second Chance CEO", status: "draft", episodeCount: 3 },
  { id: "3", title: "The Nanny's Secret", status: "completed", episodeCount: 24 },
  { id: "4", title: "Reborn Heiress", status: "active", episodeCount: 8 },
];

export default function AppPageExample() {
  const [state, setState] = useState<AppPageState>("ready");

  return (
    <div className="flex flex-col gap-4">
      {/* Dev-only state switcher — not part of the AppPage template itself. */}
      <div className="flex flex-wrap gap-2 rounded-md border border-dashed p-3 text-sm">
        <span className="mr-2 self-center font-medium text-muted-foreground">
          Demo state:
        </span>
        {(["ready", "loading", "empty", "error"] as AppPageState[]).map(
          (candidate) => (
            <Button
              key={candidate}
              size="sm"
              variant={state === candidate ? "default" : "outline"}
              onClick={() => setState(candidate)}
            >
              {candidate}
            </Button>
          ),
        )}
      </div>

      <AppPage
        title="Vertical Drama Series"
        description="Manage your short-form drama series and their episode pipelines."
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Vertical Drama", href: "/vertical-drama" },
          { label: "Series" },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New series
            </Button>
          </>
        }
        state={state}
        error={{
          title: "Couldn't load series",
          description: "Something went wrong while fetching your series list.",
          onRetry: () => setState("ready"),
        }}
        empty={{
          title: "No series yet",
          description: "Create your first vertical drama series to get started.",
          icon: <Sparkles className="h-8 w-8" aria-hidden="true" />,
          actions: (
            <Button size="sm" onClick={() => setState("ready")}>
              <Plus className="mr-2 h-4 w-4" />
              New series
            </Button>
          ),
        }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {EXAMPLE_SERIES.map((series) => (
            <div
              key={series.id}
              className="rounded-lg border bg-card p-4 shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium uppercase text-muted-foreground">
                  {series.status}
                </span>
              </div>
              <h3 className="font-semibold">{series.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {series.episodeCount} episodes
              </p>
            </div>
          ))}
        </div>
      </AppPage>
    </div>
  );
}

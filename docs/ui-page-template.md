# Building a new page with `AppPage`

`AppPage` (`apps/web/client/src/components/AppPage.tsx`) is the single
central template for every page's inner content. It is a thin facade over
Astryx (`@astryxdesign/core`, currently v0.1.2) that standardizes the
header (title, description, breadcrumbs, actions) and the body's
loading/error/empty/ready states, so every page in the app looks and
behaves consistently without hand-rolling its own header or spinner/error
markup.

`AppPage` renders the **inner content** of a route. The outer app shell
(sidebar, mobile top bar, etc.) is still `DashboardLayout`, and its
`<main>` element owns page scrolling — `AppPage` does not add a second
scroll container.

## Do / Don't

**Do:**
- Use `AppPage` for every new page.
- Pass Astryx-flavored content through `actions` / `empty.actions` using
  either the shadcn `Button` (`@/components/ui/button`) that's already
  used across the app, or the values your design calls for.
- Rely on Astryx tokens and component props (`status`, `variant`, `color`,
  etc.) for all colors, spacing, and typography.

**Don't:**
- Import `@astryxdesign` directly from a page. `AppPage.tsx` is the only
  file (besides `main.tsx` / `App.tsx` / `index.css` root theme setup)
  allowed to do that. Pages import `AppPage`, never Astryx.
- Hand-tune colors (no new hex/px values, no new CSS token overrides).
- Re-roll page headers or loading/error/empty states per page — that's
  exactly what `AppPage` centralizes.

## API

```ts
export type AppPageBreadcrumb = { label: string; href?: string };

export type AppPageState = "loading" | "error" | "empty" | "ready";

export type AppPageProps = {
  title: string;
  description?: string;
  breadcrumbs?: AppPageBreadcrumb[];
  actions?: React.ReactNode;
  toolbar?: React.ReactNode;                       // renders in EVERY state, below the header
  contentPadding?: 0 | 4;                          // default 4
  state?: AppPageState;                            // default "ready"
  loadingSkeleton?: React.ReactNode;                // overrides the default loading skeleton
  error?: { title: string; description?: string; onRetry?: () => void };
  empty?: { title: string; description?: string; actions?: React.ReactNode; icon?: React.ReactNode };
  children?: React.ReactNode;                       // rendered when state is "ready"
};

export function AppPage(props: AppPageProps): React.JSX.Element;
```

### Behavior notes

- **Breadcrumbs**: the last entry is always rendered as the current page
  (no link, `aria-current="page"`), regardless of whether it has an
  `href`. Give earlier entries an `href` to make them clickable.
- **Loading**: if `loadingSkeleton` is omitted, a default skeleton is
  shown — a title-shaped block followed by a responsive grid of
  card-shaped skeleton blocks.
- **Error**: rendered via an Astryx `Banner` (there is no Astryx
  `ErrorState` component). A "Retry" button only appears when
  `error.onRetry` is provided.
- **Empty**: rendered via an Astryx `EmptyState` with your `title`,
  `description`, `icon`, and `actions`.
- **Ready** (default): `children` are rendered directly inside the page
  body, with `contentPadding` (0 or 4) controlling the body's internal
  spacing.
- **Toolbar**: `toolbar` renders below the header and above the
  loading/error/empty/ready body region, in **every** state — unlike
  `children` (ready-only). Use it for controls the user should keep being
  able to operate even while the list is loading, errored, or empty, most
  commonly a search box and/or filter chips that produced that state (so
  the user can change the query without the controls disappearing out from
  under them).

## Copy-paste example

```tsx
import { useState } from "react";
import { Plus } from "lucide-react";

import { AppPage, type AppPageState } from "@/components/AppPage";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function MyNewPage() {
  const { data, isLoading, isError, refetch } = trpc.myRouter.list.useQuery();

  const state: AppPageState = isLoading
    ? "loading"
    : isError
      ? "error"
      : !data?.length
        ? "empty"
        : "ready";

  return (
    <AppPage
      title="My Feature"
      description="Manage your things."
      breadcrumbs={[{ label: "Home", href: "/" }, { label: "My Feature" }]}
      actions={
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New item
        </Button>
      }
      state={state}
      error={{
        title: "Couldn't load your items",
        description: "Please try again.",
        onRetry: () => refetch(),
      }}
      empty={{
        title: "No items yet",
        description: "Create your first item to get started.",
        actions: <Button size="sm">Create item</Button>,
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.map((item) => (
          <div key={item.id} className="rounded-lg border bg-card p-4 shadow-sm">
            {item.title}
          </div>
        ))}
      </div>
    </AppPage>
  );
}
```

## Reference page

`apps/web/client/src/pages/_AppPageExample.tsx` is a standalone reference
page (not wired into `App.tsx`) that demonstrates a Vertical Drama-style
card grid body and a local state toggle to preview all four `AppPage`
states. To view it in-browser, temporarily add a route:

```tsx
// App.tsx (temporary, for local preview only — remove before committing)
const AppPageExample = lazy(() => import("@/pages/_AppPageExample"));
// ...
<Route path="/dev/app-page-example" component={AppPageExample} />
```

/**
 * AppPage — the single central page template for SmartSpecPro.
 *
 * A thin facade over Astryx (@astryxdesign/core) that standardizes the
 * shape every route's inner content should take: a header (title,
 * optional description/breadcrumbs/actions) plus a body that renders one
 * of four states (loading / error / empty / ready).
 *
 * This file is intentionally the ONLY app file (besides main.tsx/App.tsx/
 * index.css root theme setup) that imports `@astryxdesign` directly. Pages
 * should import `AppPage` from here — never Astryx components directly —
 * so that colors, spacing, and typography stay centralized in Astryx
 * tokens and component props instead of being hand-tuned per page.
 *
 * `AppPage` renders the INNER content of a route. The outer app shell
 * (sidebar, top bar on mobile, etc.) is still owned by `DashboardLayout`,
 * whose `<main>` element owns page scrolling. That's why the root Astryx
 * `Layout` below uses `height="auto"` (grow with content) instead of
 * `height="fill"`, and why `LayoutContent` is rendered with
 * `isScrollable={false}`.
 */
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  HStack,
  VStack,
} from "@astryxdesign/core/Layout";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Grid } from "@astryxdesign/core/Grid";
import { Center } from "@astryxdesign/core/Center";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Button as AstryxButton } from "@astryxdesign/core/Button";

/** A single breadcrumb entry. Omit `href` for a non-link (plain text) crumb. */
export type AppPageBreadcrumb = {
  label: string;
  href?: string;
};

/** The four body states an `AppPage` can render. */
export type AppPageState = "loading" | "error" | "empty" | "ready";

export type AppPageProps = {
  /** Page title, rendered as an `<h1>` (Astryx `Heading level={1}`). */
  title: string;
  /** Optional supporting copy shown under the title. */
  description?: string;
  /** Optional breadcrumb trail shown above the title. Last item is treated as the current page. */
  breadcrumbs?: AppPageBreadcrumb[];
  /** Optional action controls (buttons, menus) rendered at the end of the header row. */
  actions?: React.ReactNode;
  /**
   * Optional toolbar content (search boxes, filter chips, view toggles, etc.)
   * rendered below the header, above the body-state region (loading / error /
   * empty / ready). Unlike `children`, the toolbar renders in EVERY state —
   * use it for controls that should stay visible and usable even while the
   * underlying data is loading, erroring, or empty (e.g. a search input that
   * lets the user change the query that produced an empty/error result).
   */
  toolbar?: React.ReactNode;
  /** Internal padding of the body content area. @default 4 */
  contentPadding?: 0 | 4;
  /** Which body state to render. @default "ready" */
  state?: AppPageState;
  /** Custom loading placeholder. Falls back to a default skeleton grid when omitted. */
  loadingSkeleton?: React.ReactNode;
  /** Error state content, rendered via an Astryx `Banner`. */
  error?: {
    title: string;
    description?: string;
    onRetry?: () => void;
  };
  /** Empty state content, rendered via an Astryx `EmptyState`. */
  empty?: {
    title: string;
    description?: string;
    actions?: React.ReactNode;
    icon?: React.ReactNode;
  };
  /** Body content, rendered when `state` is `"ready"` (the default). */
  children?: React.ReactNode;
};

/**
 * Default loading placeholder: a title-shaped skeleton followed by a
 * responsive grid of card-shaped skeleton blocks. Used whenever
 * `state="loading"` and no `loadingSkeleton` override is supplied.
 */
function AppPageDefaultLoadingSkeleton() {
  return (
    <VStack gap={6} data-testid="app-page-default-skeleton">
      <VStack gap={2}>
        <Skeleton width={240} height={28} index={0} />
        <Skeleton width={360} height={16} index={1} />
      </VStack>
      <Grid columns={{ minWidth: 240, max: 4 }} gap={4}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} height={140} index={i + 2} />
        ))}
      </Grid>
    </VStack>
  );
}

type AppPageBodyProps = {
  state: AppPageState;
  loadingSkeleton?: React.ReactNode;
  error?: AppPageProps["error"];
  empty?: AppPageProps["empty"];
  children?: React.ReactNode;
};

function AppPageBody({
  state,
  loadingSkeleton,
  error,
  empty,
  children,
}: AppPageBodyProps) {
  if (state === "loading") {
    return (
      <>{loadingSkeleton ?? <AppPageDefaultLoadingSkeleton />}</>
    );
  }

  if (state === "error") {
    const errorTitle = error?.title ?? "Something went wrong";
    return (
      <Center height="100%" data-testid="app-page-error">
        <Banner
          status="error"
          container="section"
          title={errorTitle}
          description={error?.description}
          endContent={
            error?.onRetry ? (
              <AstryxButton
                label="Retry"
                variant="secondary"
                onClick={error.onRetry}
              />
            ) : undefined
          }
        />
      </Center>
    );
  }

  if (state === "empty") {
    const emptyTitle = empty?.title ?? "Nothing here yet";
    return (
      <Center height="100%" data-testid="app-page-empty">
        <EmptyState
          title={emptyTitle}
          description={empty?.description}
          icon={empty?.icon}
          actions={empty?.actions}
        />
      </Center>
    );
  }

  return <>{children}</>;
}

/**
 * Central page template. Every new page should render its content inside
 * `<AppPage>` rather than composing Astryx (or raw div/Tailwind) headers
 * and states by hand. See `docs/ui-page-template.md` for usage guidance.
 */
export function AppPage({
  title,
  description,
  breadcrumbs,
  actions,
  toolbar,
  contentPadding = 4,
  state = "ready",
  loadingSkeleton,
  error,
  empty,
  children,
}: AppPageProps): React.JSX.Element {
  return (
    <Layout
      height="auto"
      data-testid="app-page-root"
      header={
        <LayoutHeader hasDivider data-testid="app-page-header">
          <VStack gap={3}>
            {breadcrumbs && breadcrumbs.length > 0 ? (
              <Breadcrumbs>
                {breadcrumbs.map((crumb, index) => {
                  const isLast = index === breadcrumbs.length - 1;
                  return (
                    <BreadcrumbItem
                      key={`${crumb.label}-${index}`}
                      href={isLast ? undefined : crumb.href}
                      isCurrent={isLast}
                    >
                      {crumb.label}
                    </BreadcrumbItem>
                  );
                })}
              </Breadcrumbs>
            ) : null}
            <HStack justify="between" align="center" wrap="wrap" gap={4}>
              <VStack gap={1}>
                <Heading level={1}>{title}</Heading>
                {description ? (
                  <Text type="body" color="secondary">
                    {description}
                  </Text>
                ) : null}
              </VStack>
              {actions ? (
                <HStack
                  gap={2}
                  align="center"
                  wrap="wrap"
                  data-testid="app-page-actions"
                >
                  {actions}
                </HStack>
              ) : null}
            </HStack>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent
          padding={contentPadding}
          isScrollable={false}
          data-testid="app-page-content"
        >
          <VStack gap={4}>
            {toolbar ? (
              <div data-testid="app-page-toolbar">{toolbar}</div>
            ) : null}
            <AppPageBody
              state={state}
              loadingSkeleton={loadingSkeleton}
              error={error}
              empty={empty}
            >
              {children}
            </AppPageBody>
          </VStack>
        </LayoutContent>
      }
    />
  );
}

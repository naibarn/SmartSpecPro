# Central UI Page Template

## Problem statement

Adding a new screen requires re-inventing the page structure every time. Evidence
(measured 2026-07-04):

- 184 page components in `apps/web/client/src/pages/`.
- 3 overlapping UI systems: `@/components/ui` (shadcn/radix, **433 files** — dominant),
  `@smartspec/ui` (59 files), `@astryxdesign` (**3 files**, ~1.6% — themed at root but
  effectively unused).
- **0 pages** use a shared page layout. Each feature ships its own shell:
  `DashboardLayout`, `SocialPageShell`, `CanvasShell`, `VerticalDramaShell`,
  `AgentExperienceShell`.
- `packages/ui/src/layouts` is empty.

Root cause: there is a central **outer shell** (`DashboardLayout` = sidebar/nav/auth) and a
solid **token system** (`index.css` `@theme inline`), but **no central page-content
template** for what goes inside `<main>` — page header, actions, breadcrumb, content
container, and the standard loading/empty/error states.

## Decision (revised 2026-07-04)

**Adopt Astryx as the maintained design foundation, and build ONE central `AppPage` template
as a thin facade over Astryx** (AppShell / Layout / tokens + standard states). New pages import
`AppPage` and NEVER import `@astryxdesign` directly. Old pages migrate to `AppPage` gradually.

Rationale (reconsidered): the strategic goal is to stop chasing design tech and rely on a
vendor-maintained system — shadcn (owned/copied into the repo) works against that, Astryx
(versioned, `astryx upgrade --apply`) works for it. The "3/184" adoption is a starting point,
not a verdict. The facade gives consistency (one template) AND limits Astryx's v0.1.2 maturity
risk (breaking changes absorbed in one place, not across 184 pages).

Color/type are owned by the Astryx theme — do NOT hand-tune colors in CSS. Configure brand via
`astryx theme`. The app-wide text size is set via the `--font-size-*` override in `index.css`
(see memory `reference_app_font_scale`); the readability fix (16px base) already shipped.

Superseded earlier draft: "standardize on shadcn" — rejected because it keeps design-system
maintenance in-house, contrary to the strategic goal.

## Proposed API (`@/components/layout/AppPage.tsx`)

```tsx
<AppPage maxWidth="7xl">                       // centered container, token-based padding/gap
  <AppPageHeader
    title={t('...')}                           // required
    description={t('...')}                      // optional
    breadcrumbs={[{ label, href }]}            // optional
    actions={<Button>New</Button>}             // optional, right-aligned primary actions
    backHref="/..."                            // optional back affordance
  />
  <AppPageBody>
    {isLoading ? <AppPageLoading />
      : error   ? <AppPageError error={error} onRetry={refetch} />
      : empty   ? <AppPageEmpty icon={Icon} title description action />
      : <Content />}
  </AppPageBody>
</AppPage>
```

Standard state primitives (consistent everywhere): `AppPageLoading`, `AppPageEmpty`,
`AppPageError`. All built from shadcn primitives (`Skeleton`, `Button`, typography utilities)
and tokens (`text-foreground`, `text-muted-foreground`, `bg-card`, `rounded-lg`).

## Affected files

New (additive):
- `apps/web/client/src/components/layout/AppPage.tsx` — AppPage / AppPageHeader / AppPageBody
- `apps/web/client/src/components/layout/AppPageStates.tsx` — Loading / Empty / Error
- `apps/web/client/src/components/layout/index.ts` — barrel export
- `apps/web/client/src/components/layout/__tests__/AppPage.test.tsx` — render + states tests
- `docs/ui-page-template.md` — "how to build a new page" guide + do/don't
- `apps/web/client/src/pages/_ExamplePage.tsx` — reference page using the template

Docs/governance updates:
- `apps/web/CLAUDE.md` Frontend Patterns → new pages MUST use `AppPage`
- `AGENTS.md` → note the central template as the default for new SmartSpecPro screens

No existing page is modified in v1 (existing shells adopt gradually / opt-in).

## Risk assessment

- Risk: **Low** — additive only, no edits to the 184 pages, no token changes, no schema/DB.
- Regression surface: none until a page opts in.
- Reversible: delete the new folder.

## Verification steps

1. `pnpm check` (typecheck) passes.
2. `pnpm test` — new `AppPage.test.tsx` passes (header renders, each state renders).
3. Convert `_ExamplePage.tsx` and verify in browser (desktop + mobile widths) inside
   `DashboardLayout`.
4. Confirm no raw hex/px in the new components (tokens only).

## Rollout (post-v1, separate steps)

1. New pages use `AppPage` (enforced via CLAUDE.md + review).
2. Opportunistically migrate the feature shells (SocialPageShell, VerticalDramaShell,
   AgentExperienceShell) onto `AppPage` when touched — never a big-bang migration.

## Adoption learnings & decision (2026-07-04)

First trial migration (VerticalDramaSeriesPage) was reverted. Learnings:
- `AppPage` fits pages that render inside `DashboardLayout` (chrome-only shell, no page title).
  Pages with their OWN title-bearing shell (e.g. `VerticalDramaShell`) get a **double header** —
  those need either an `AppPage` embedded/headerless mode OR the bespoke shell's title trimmed.
  Deferred, not forced.
- `AppPage.children` render only in the `ready` state, so persistent list controls (search,
  filters) disappear during loading/empty/error. Real gap.

**Decision: gradual, natural adoption — no big-bang migration.** `AppPage` is verified, ready
infrastructure; real pages adopt it as they are worked on. The theme switcher (Settings →
Appearance, 7 Astryx palettes + light/dark) and the app-wide 16px font fix are shipped and live.

**Enhancement backlog (build when a real page needs it — YAGNI, do not build speculatively):**
- `toolbar` slot on `AppPage` that renders in ALL states (persistent search/filters), distinct
  from `children`.
- `embedded`/`hideHeader` mode for pages that live inside a bespoke shell.
- i18n-able retry label on the error `Banner`.
- Sync selected Astryx palette to a per-user DB setting (currently localStorage only).

# Section 02 — Library, Marketplace, readiness and entitlement

## Objective

Make Library and Marketplace usable for exact-version discovery, inspection and
safe preflight. Visibility, inspect access and run entitlement must remain
separate decisions.

## Dependencies and ownership

- Depends on Section 01 identifiers/projections and existing workflow Studio
  definition/version/app rows.
- Owns catalog/detail/preflight router contracts, dependency manifest
  normalization, readiness projection and entitlement decision.
- Does not create Jobs or capture money.

## Planned changes

1. Extend `workflowStudio` with tenant-safe Library detail/open/history and
   public Marketplace detail/search/filter endpoints.
2. Return exact published version identity, tags, access mode, dependency
   manifest, readiness snapshot revision, missing-capability reason codes,
   setup instructions, creator/funding/pricing disclosure and inspect/run
   permissions.
3. Add server-side dependency readiness evaluation with ready, missing, stale,
   degraded and probe-error results.
4. Add invocation-time entitlement recheck contract. A cached card result is
   presentation only.
5. Add query hooks and detail/preflight UI while keeping the current
   `WorkflowStudioPage` shell.

## API contract

| Procedure | Access | Contract result |
|---|---|---|
| `libraryList` | protected | Tenant-scoped definitions, exact versions and run-history projection |
| `libraryGet` | protected | Exact definition/version, schema, readiness and inspect/run permissions |
| `marketplaceList` | public | Published package metadata only; no private tenant fields |
| `marketplaceGet` | public/protected preflight | Exact published version and package metadata |
| `dependencyCheck` | protected | Snapshot revision, checked-at, capability states and reason codes |
| `entitlement` | protected | Inspect/run/clone decisions and policy reason codes |

All responses are server-derived and may be cached only for presentation. A
run mutation must repeat the checks and must not trust a card or preflight
response from the browser.

## Existing Pattern Reference

- Search: `rg` across `apps/web/client/src/components` and pages found
  `MarketplaceFilters.tsx`, Marketplace card/list surfaces and Worker Jobs
  status/timeline components.
- Decision: reuse their card/filter/status patterns and existing shadcn/Radix
  primitives. Diverge only for exact Workflow Version, dependency and
  entitlement panels because generic Marketplace cards do not represent those
  states.

## UI/UX Contract

### Target User / JTBD

- Role: authenticated creator or consumer.
- Goal: understand what a workflow does, whether it can run, what it needs and
  what access/cost policy applies.
- Entry point: Dashboard → Workflow Studio → Library or Marketplace.
- Success outcome: exact version is inspected and preflight gives an actionable
  run/blocked decision.

### Surface Inventory

| Surface | Route/file | Change |
|---|---|---|
| Library | `/studio/workflow`, `WorkflowStudioPage.tsx` | detail, version, recent/pinned and run projection |
| Marketplace | `/studio/workflow`, same page | filters, detail, readiness, entitlement and pricing disclosure |
| Preflight | same shell, detail panel | dependency/access/budget/runner reason cards |

### Component Map

| Component | Owns | Consumes |
|---|---|---|
| `WorkflowCatalog` | card/filter/loading states | list/search query |
| `WorkflowDetailPanel` | exact version and package metadata | detail query |
| `DependencyReadinessPanel` | missing/degraded/setup reasons | readiness snapshot |
| `EntitlementPanel` | access and run permission | server decision |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | shell-preserving skeleton | component test |
| empty | explanatory empty state and create/browse action | component test |
| error | retryable error with reason | component/browser test |
| degraded | visible missing/stale dependency and setup guidance | service/UI test |
| disabled | invoke disabled with reason | UI test |
| selected/focus/hover | accessible card selection and visible focus | browser test |

### Responsive Matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | horizontal nav, one-column cards/detail |
| tablet 768x1024 | filter/detail stack without overflow |
| laptop 1024x768 | compact catalog with collapsible detail |
| desktop 1440x900 | catalog + detail/readiness panel in mockup shell |
| small-mobile 360x800 | extended overflow check for dense metadata |
| wide-desktop 1280x800 | card grid and detail panel remain readable |

### Accessibility Acceptance

Keyboard must reach card, detail, preflight and invoke controls in order.
Cards need names and status text; reasons use live/semantic alerts; focus rings
remain visible; warning/disabled contrast is readable; readiness is not conveyed
by color alone; no essential state depends on motion.

### Visual Direction and Design Token Extraction

Reuse current Workflow Studio, AppPage, Button, Badge, Tabs, border/card and
semantic Tailwind tokens. Preserve sparse operational density, mockup hierarchy,
existing typography/radius/shadow and restrained motion. Do not introduce a new
catalog visual language.

### Copy Contract

Use concise Thai/English keys for published, draft, ready, missing dependency,
stale snapshot, access denied, entitlement expired, budget blocked, setup
required, retryable error and no results. No hard-coded English in new paths.

### Browser Evidence Required

Playwright must verify Dashboard → Library/Marketplace → detail/preflight at
390x844, 768x1024 and 1440x900, including loading/empty/error/degraded/disabled
states, keyboard focus, no overflow and no new console errors.

## TDD-first verification

- Published-only and exact-version filters.
- Tenant/access/inspect/run entitlement matrix.
- Dependency ready/missing/stale/degraded/probe failure.
- Router redaction and UI query state tests.

## Acceptance

Users can answer “can I run this, why/why not, what version and dependencies
apply?” before invoking. No card action bypasses server checks.

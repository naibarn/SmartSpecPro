# Section 07 — Worker Jobs route and queue UX

## Scope and dependencies

Generalize the existing `RenderJobsPage` after Section 04 queue contracts and Section 06 editor links are stable. This is a product-surface rename; API, DB, IDs and operation terminology remain compatible.

## Tests first

- Extend `apps/web/client/src/pages/__tests__/RenderJobsPage.test.tsx` for canonical title/labels, operation grouping, status/error/loading/empty/reconnect and accessibility.
- Add route tests for `/worker-jobs` and query-preserving `/render-jobs` alias (`jobId`, `projectId`, `status`, `operation`) and no API/DB rename.
- Add link tests for Dashboard, RenderPanel, Vertical Drama and diagnostics; assert valid operation-specific “render” labels remain.

## Implementation

Update `apps/web/client/src/App.tsx` with authenticated `/worker-jobs` canonical route and a single alias redirect from `/render-jobs` preserving query parameters and a legacy marker. Generalize page copy in `pages/RenderJobsPage.tsx`: title `คิวงานประมวลผลของฉัน`, short nav `คิวงาน Worker`, English metadata `Worker Jobs`; display operation-specific render/proxy/probe/waveform/analysis/audio labels. Update Dashboard/navigation/menu and internal links in the source inventory. Keep `trpc.workerJobs`, `/api/worker-jobs/*`, historical job types, filters, output links, cancel and terminal states unchanged.

## Acceptance and evidence

Record route, deep-link, accessibility and browser checks for AC-16 and AC-18. Alias hit-rate telemetry must be emitted without duplicating a status store.

## Safety and rollback

Old bookmarks continue to resolve. Retain the alias through the deprecation window; never globally replace valid render-operation diagnostics.

## Implementation status

Implemented canonical `/worker-jobs`, query-preserving `/render-jobs` redirect with `legacyAlias=render-jobs` marker and low-cardinality `worker_jobs_legacy_alias_hit` event, route helper/tests, menu/dashboard labels, Thai/English nav copy, queue heading, and internal links. Existing test selectors and operation-specific render labels remain compatible.

## UI/UX Contract
### Target User / JTBD
Creator needs one place to understand every Worker operation, including render.
### Surface Inventory
`/worker-jobs` list/detail, filters, output links, cancel/retry, alias deep links.
### Component Map
App router owns canonical/alias routes; `RenderJobsPage` renders one `workerJobs` data source.
### State Matrix
Loading, empty, filtered, queued/running/uploading/publishing, completed/failed/canceled/expired, reconnect/error.
### Responsive Matrix
Desktop table/detail; tablet condensed columns; mobile stacked job cards and status actions.
### Accessibility Acceptance
Table headings, labels, live status updates, keyboard selection, and visible focus.
### Copy Contract
Canonical Thai title `คิวงานประมวลผลของฉัน`; short nav `คิวงาน Worker`; operation-specific render labels.
### Browser Evidence Required
Authenticated route/alias Playwright proof with query preservation and screenshots at required widths.

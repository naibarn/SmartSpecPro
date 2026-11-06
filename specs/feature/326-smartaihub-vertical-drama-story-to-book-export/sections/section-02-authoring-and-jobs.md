# Section 02 — Authoring and canonical jobs

## Requirement IDs

All ledger requirements for episode selection/order, composition, provenance/no unsupported facts, edits/regeneration, immutable approval, source-stale behavior, cost/credit admission, durable/idempotent/resumable/cancellable job progress, sanitized errors and tenant-scoped APIs.

## Objective and deliverable

Implement book CRUD, episode selection/reordering, metadata/image-density configuration, composition into editable revision candidates, edit/approval services, and worker_jobs + outbox composition execution. Job retries must reuse completed chapter work and never duplicate paid composition or overwrite author edits.

## Owned scope

- `apps/web/server/routers/verticalDramaBooks.ts` (or established router module), service modules and focused tests.
- `apps/web/server/jobs/feature186JobTypes.ts`, `apps/web/server/services/jobExecutorRegistry.ts`, adapter/prompt implementation and tests.
- Shared tRPC client types if generated/required.

## Prerequisites

Section 01 integrated and development migration applied.

## Design constraints

- Every mutation and polling path rechecks tenant, actor, series and revision ownership.
- Use existing vertical-drama job adapter/control plane, model policy, credit quote/ledger, and status surface.
- Compose bounded chapter batches from the pinned snapshot; validate model output against typed contract and preserve source references.
- Regeneration creates a candidate or changes only explicitly selected unlocked blocks; approval binds exact immutable revision digest.
- Cost rejection occurs before provider calls. Errors exposed to users are sanitized.

## Completion predicate and evidence

Focused service/router/executor tests prove selection, stable provenance, stale-source checks, edit survival, approval immutability, tenant isolation, idempotency, cost denial and durable status mapping.

## UI/UX Contract

### Target User / JTBD
- Role: authorized Vertical Drama series author.
- Goal: turn chosen existing episodes into an editable book draft.
- Entry point: Book Studio tab on the existing series detail page.
- Success outcome: source selection and cost are clear; composition can be resumed and reviewed.

### Existing Pattern Reference
- Searched (rg query used): series tabs, episodes, storyboard, assets, cover, generation status under `apps/web/client/src/components/verticalDramaSeries/` and pages.
- Found pattern(s): `VerticalDramaSeriesDetailPage`, `VerticalDramaAssetsTab`, `VerticalDramaEpisodeWorkspace`, existing cover surface.
- Decision: reuse existing tab, query, toast, and progress patterns.
- Reason: same authoring domain and source assets.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Book Studio tab | `VerticalDramaSeriesDetailPage.tsx` | Entry and selected book state |
| Book authoring | new `verticalDramaSeries/VerticalDramaBookStudio.tsx` | metadata, episode and image choices, cost, compose |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Book Studio | new series component | selection, metadata, progress | typed book APIs |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Skeleton/disabled actions | query test |
| empty | Create-book prompt | component test |
| error | Sanitized retry message | error-state test |
| success | source selection + estimate | component test |
| partial | per-chapter progress/errors | job contract test |
| disabled/focus/hover | explicit unavailable reason; visible focus; hover affordance | keyboard test |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stacked controls, readable episode list, no horizontal overflow | browser |
| tablet 768x1024 | compact two-column selection where space allows | browser |
| desktop 1440x900 | workspace and progress panel | browser |
| small-mobile 360x800 | controls wrap and remain usable | browser if risk found |
| laptop 1024x768 | no clipped side panels | browser if risk found |
| wide-desktop 1280x800 | bounded readable content width | browser if risk found |

### Accessibility Acceptance
- Keyboard path: tab through book list, episode selection/order, image density, compose and retry.
- Focus visibility: use existing focus ring tokens and restore focus after dialogs.
- Labels/semantics: native buttons, labeled inputs, selected episode checkbox state, progress semantics.
- Contrast: reuse existing theme tokens.
- Reduced motion: no required animation; respect existing reduced-motion styles.

### Visual Direction
Reuse Vertical Drama shell, spacing and theme tokens; no new page frame or raw layout conventions.

### Copy Contract
Thai-first, with existing locale behavior; explain image coverage, estimated credits and missing shot images plainly.

### Browser Evidence Required
Capture mobile/tablet/desktop flow through `skills/orchestra/references/ui-browser-verification.md` when authenticated preview is available.

## Fallback / blocker strategy

If current credit APIs cannot quote, block paid compose with a clear capability response rather than unmetered calls. Continue non-paid authoring and export paths independently.

# Section 06: Runtime API and Router Integration

## Goal

Expose the Auto Storyboard Review and HyperFrames render lifecycle through additive tRPC procedures on `marketplaceCapture` while preserving existing `startAutoReview` behavior.

This section turns the shared contracts and services into UI-consumable APIs.

## In Scope

- Runtime API service.
- New tRPC procedures.
- Auth, tenant, product, run, and render access checks.
- Idempotency and active-run dedupe integration.
- Credit/quota estimate projection and duplicate-charge prevention.
- Cache invalidation guidance for client mutations.
- Router contract and security tests.

## Files To Create

- `apps/web/server/services/hyperframesRuntimeApiService.ts`
- `apps/web/server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts`

## Existing Files To Touch

- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/services/marketplaceAutoReviewService.ts` only if needed for additive metadata hooks
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`

## Test First

Add failing router/service tests for:

- `getAutoStoryboardReviewPlan` is safe on page load and does not mutate run state;
- `startAutoStoryboardReview` starts or resumes Auto mode using backend plan defaults;
- `startAutoStoryboardReview` rejects stale plan hashes where required;
- existing `startAutoReview` still starts Standard Order `storyboard_images` and `full_video` when HyperFrames is enabled;
- `createHyperframesPreview` queues only eligible runs and is idempotent;
- `getHyperframesRenderJob` returns sanitized projections and polling guidance;
- `listHyperframesTemplates` returns only enabled/allowed templates;
- `cancelHyperframesRenderJob` respects ownership and returns best-effort status;
- `saveHyperframesRenderToLibrary` is idempotent and does not double charge;
- tenant, shared/group access, credit payer, and role restrictions are enforced.
- every start/preview/save response carries the current credit estimate/quota decision or a no-charge reason.
- duplicate finalize with the same Library idempotency key does not repeat credit/quota charge.
- polling guidance returns `recommendedIntervalMs`, `maxIntervalMs`,
  `stopWhenStatus`, and terminal-state behavior; Product Detail backs off from
  5-15 seconds to at most 30 seconds for long queue waits.

## Procedures To Add

- `getAutoStoryboardReviewPlan`
- `startAutoStoryboardReview`
- `createHyperframesPreview`
- `getHyperframesRenderJob`
- `listHyperframesTemplates`
- `cancelHyperframesRenderJob`
- `saveHyperframesRenderToLibrary`

Do not remove or rename:

- `startAutoReview`
- `getAutoReviewRun`
- `listAutoReviewRuns`
- `advanceAutoReviewRun`
- `cancelAutoReviewRun`

## API Behavior

`getAutoStoryboardReviewPlan`:

- returns feature access and auto plan;
- returns deterministic credit/quota estimate and free-preview state;
- never creates a run;
- includes Standard Order availability;
- includes blockers and next action.

`startAutoStoryboardReview`:

- validates plan/access;
- uses backend-selected defaults;
- starts or resumes an active Auto run;
- queues preview only when run state is eligible;
- records/reserves credit/quota only according to render intent and free-preview policy;
- returns auto plan, run projection, render projection if applicable, and a
  charge summary containing `creditEstimate`, `quotaDecision`, or
  `noChargeReason`.

`createHyperframesPreview`:

- explicitly queues preview for an eligible storyboard/review state;
- supports retry/fallback from review pages;
- idempotency key includes input hash and template version;
- returns the active credit/quota projection or `noChargeReason:
  duplicate_free_preview` when it reuses an existing free preview.

`saveHyperframesRenderToLibrary`:

- requires completed QA-ready output;
- uses finalize service from Section 09;
- returns existing Library item on duplicate idempotency.
- never repeats credit/quota charge for the same finalized idempotency key.
- returns charge summary values explicitly:
  - `creditEstimate` when finalization has a charge/reservation projection;
  - `quotaDecision` when quota policy applies;
  - `noChargeReason` when the operation is duplicate, preview-only, already
    charged, or policy-exempt.

## Polling Contract

Active render responses must include:

- `recommendedIntervalMs`: 5000-15000 for normal active jobs;
- `maxIntervalMs`: 30000 for long queue waits or repeated unchanged status;
- `stopWhenStatus`: terminal statuses including `completed`,
  `saved_to_library`, `failed`, `cancelled`, and `dead_lettered`;
- cache metadata such as `etag` and `staleAfterMs` where the endpoint supports
  conditional refetch;
- a safe next action for stale input, disabled template, quota/credit blocker,
  retry, cancel, and Library save states.
- `repairActions` from `HyperframesRenderStatusProjection` so UI can show safe
  auto-repair without parsing `safeMessage`.

Client tests must prove Product Detail and Storyboard Review stop polling on
terminal statuses and do not spin on disabled/unauthorized projections.

## Cache Invalidation Contract

Client mutations should invalidate:

- `marketplaceCapture.listAutoReviewRuns`;
- `marketplaceCapture.getProduct`;
- `marketplaceCapture.getAutoReviewRun`;
- `marketplaceCapture.getAutoStoryboardReviewPlan`;
- `marketplaceCapture.getHyperframesRenderJob`;
- Media Library search/list queries;
- Media Panel queries if present.

## Security Gate

Run a security review because this section adds procedures that touch tenant/product/run/render access and storage refs.

Required checks:

- auth required;
- tenant ownership;
- shared/group scope;
- role/permission scope;
- idempotency replay protection;
- no raw path or signed URL leakage;
- diagnostics are sanitized.

## Acceptance Criteria

- All new router APIs are additive.
- Existing Standard Order tests continue to pass.
- Auto and Standard launch paths are distinguishable in logs/metadata.
- UI can render all states from sanitized projections.
- Router tests cover positive, blocked, disabled, unauthorized, and stale input cases.
- Start, preview, cancel, status, and save responses include polling/charge
  fields exactly as needed by UI without ad hoc client inference.
- Render status responses include explicit `repairActions` arrays and never rely
  on free-form copy to expose repair availability.

## Rollback Notes

Disable flags or remove client usage of new procedures. Existing `startAutoReview` remains the operational fallback.

## UI/UX Contract

### Target User / JTBD

Users need APIs that return complete, sanitized UI projections so pages can stay auto-first and avoid client-side guessing.

### Surface Inventory

| Surface | Impact |
|---|---|
| Product Detail | calls plan/start/status/cancel/save APIs |
| Storyboard Review | calls preview/status/save APIs |
| MediaStudio | calls status/save APIs and Library invalidation |
| Library/Media Panel | refresh after finalize |

### Component Map

| Component | API dependency |
|---|---|
| Auto plan summary | `getAutoStoryboardReviewPlan` |
| Auto CTA | `startAutoStoryboardReview` |
| Render panel | `getHyperframesRenderJob`, cancel, preview |
| Library save controls | `saveHyperframesRenderToLibrary` |

### State Matrix

| State | Expected API projection |
|---|---|
| page load | plan without mutation |
| start | run/render projection and invalidation hints |
| polling | status and next poll guidance |
| unauthorized | safe unavailable projection |
| stale | reset/regenerate action |
| saved | Library item projection |

### Responsive Matrix

| Viewport | Requirement |
|---|---|
| mobile | API copy fields support short UI summaries |
| tablet | projections support stacked panels |
| desktop | projections include enough metadata for dense status panels |

### Accessibility Acceptance

API projections must include copy IDs or labels sufficient for accessible loading, disabled, blocked, and completed states.

### Copy Contract

Router responses expose sanitized copy IDs and safe diagnostics only. No raw internal error text should reach UI.

### Browser Evidence Required

E2E must verify API-backed UI states for plan load, start, poll, cancel, stale, unauthorized/disabled, and save.

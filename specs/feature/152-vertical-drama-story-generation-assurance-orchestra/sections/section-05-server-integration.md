# Section 05: Story Jobs, Router, API, and Compatibility

## Objective

Route deep generation, extension, and improvement through the durable run
workflow while preserving existing callers and rollout controls.

## Owned paths

- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/services/verticalDramaStoryJobs.ts`
- `apps/web/server/routers/__tests__/verticalDramaStoryGeneration.test.ts`
- feature-flag/config seam and API shared types

## Required behavior

- Replace direct async-job truth with an adapter that admits a parent run,
  persists source snapshots, invokes the existing generator, validates, repairs,
  and finalizes through the runtime service.
- Keep standard/premium behavior and existing entry-point input contracts.
- Add `getStoryGenerationRun`, `resumeStoryGeneration`,
  `repairStoryGeneration`, `approveStoryGenerationRepair`,
  `rejectStoryGenerationRepair`, `cancelStoryGeneration`, and
  `getStoryGenerationValidation` with tenant/auth/freshness/fence checks.
- Return a pending/resumable logical outcome for queued, validating, repairing,
  partial, approval, and reconciliation states. Never call these states success.
- Migrate all story-generation credit paths to run-scoped idempotency and the
  effective ceiling. Keep legacy Redis job records as a compatibility read
  path only during rollout.
- Ensure Feature 132 accepted repair paths and legacy improvement writes use the
  candidate boundary and final gate.

## TDD and proof

Test each operation authorization and status mapping, duplicate mutation,
source drift, feature flag off/read-only/shadow/active modes, standard/premium
budget behavior, and old caller compatibility. Run existing deep story tests
alongside new focused tests.

## UI/UX Contract

### Target User / JTBD
Creator generating or repairing a series story; the API must expose the next
safe action from the detail page.

### Existing Pattern Reference
Reuse `VerticalDramaSeriesDetailPage` polling and existing tRPC mutation/query
patterns; diverge only for the new durable run actions and status vocabulary.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Story generation status | vertical drama series detail route | Consume durable summary |
| Repair/approval actions | same route | Add action mutations |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Story run status panel | existing detail page/components | status and actions | run summary |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| pending | progress and safe actions | router tests + section 06 |
| success | final story only | router tests |
| blocked | findings and repair/approval action | router tests |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stacked status/actions | section 06 |
| tablet 768x1024 | stacked or two-column | section 06 |
| desktop 1440x900 | full progress and findings | section 06 |

### Accessibility Acceptance
Stable status labels and action reason codes must be available to the client;
component-level keyboard and focus proof is section 06.

### Copy Contract
Stable Thai/English reason keys; no “สำเร็จ” until the final gate succeeds.

### Browser Evidence Required
Follow section 06 browser evidence contract; server section uses tests only.

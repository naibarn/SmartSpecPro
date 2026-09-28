# Section 06 — Admin API and Platform Operations UI

## Scope

Add the guarded Platform Operations API and replace the old mixed
InfrastructureSettingsPanel with an environment-scoped control center. Preserve
unrelated Admin Settings features and show canonical evidence rather than
guessing from queue/provider state.

## Ownership paths

- apps/web/server/routers/platformOperations.ts:
  typed reads, guarded mutations, auth/audit/redaction boundary.
- apps/web/server/routers/__tests__/platformOperations.test.ts:
  API contracts and security tests.
- apps/web/client/src/pages/AdminPlatformOperations.tsx:
  page composition and query/mutation orchestration.
- apps/web/client/src/components/admin/platform-operations/:
  header, gate cards, promotion panel, validation table, job summary, adapter
  matrix, action rail, confirmation dialog, evidence drawer.
- apps/web/client/src/pages/AdminPlatformOperations.test.tsx:
  state and accessibility component tests.
- apps/web/client/src/pages/AdminSettings.tsx:
  navigation/rendering migration.
- apps/web/tests/e2e/admin-platform-operations.spec.ts:
  browser evidence.

## API contract

Implement these tRPC operations:

- platformOperations.getOverview
- platformOperations.listGates
- platformOperations.getPromotion
- platformOperations.listPromotionBatches
- platformOperations.listEvidence
- platformOperations.prepare
- platformOperations.validate
- platformOperations.requestMaintenance
- platformOperations.activate
- platformOperations.cancelActivation
- platformOperations.requestRollback
- platformOperations.separateSync

Read inputs use environment and bounded cursor/limit/filter fields. Mutations
require environment, expected control version, action idempotency key, actor
reason where required, and release/promotion identity. The server derives
authorization and target identity; the client cannot provide DB URL, provider,
binding, tenant, or fallback.

Responses are bounded and redacted. Mutations return action key, repeated flag,
new control version, resulting lifecycle, gate summary, and evidence/correlation
reference. Unknown dependency or unavailable probe returns a visible
unknown/blocked result with a stable error code.

## Component ownership

- PlatformOperationsHeader: environment, current/target platform, release
  identity, source/target/Hyperdrive identity summary.
- GateSummaryCard: one gate's pass/fail/blocked/unknown/expired state and
  evidence link.
- PromotionHealthPanel: source/target watermark, lag, phase, fence, batches,
  and validation status.
- DataValidationTable: cursor-paginated row/partition/object/index results.
- JobControlPlaneSummary: Feature 186 canonical job counts, stale leases,
  outbox age, retries, DLQ/quarantine, unresolved settlement.
- RuntimeAdapterMatrix: Cloudflare capabilities and legacy observations.
- CutoverActionRail: action eligibility, pending state, and authorization.
- CutoverConfirmationDialog: target database, release, maintenance, actor,
  reason, action key, and consequences.
- EvidenceTimelineDrawer: cursor-paginated, redacted, chronological evidence
  and audit/correlation links.

Keep InfrastructureSettingsPanel available behind a compatibility flag until
new reads/actions have parity evidence. Remove only obsolete direct mutation UI
after browser and call-site audits pass.

## UI/UX Contract

### Target User / JTBD

- Role: platform administrator or authorized release operator.
- Goal: decide whether Cloudflare production is safe and execute only a
  reviewed action.
- Entry point: Admin Settings > Platform Operations.
- Success outcome: the operator can distinguish ready, blocked, unknown, stale,
  active, and rollback-required states and inspect evidence for each.

### Existing Pattern Reference

- Search: targeted rg in
  apps/web/client/src/components/admin, apps/web/client/src/pages, and
  existing job monitor/admin approval surfaces for status cards, badges,
  dialogs, mutations, tables, redacted diagnostics, and permission states.
- Found: InfrastructureSettingsPanel.tsx for current operational inventory;
  AdminSettings.tsx for navigation; AdminLLMProviders.tsx and AdminQueueLLM.tsx
  for AlertDialog and mutation confirmation; existing Admin dashboard pages for
  status/table patterns.
- Decision: reuse existing Admin navigation, primitives, mutation, toast,
  table, dialog, and permission patterns. Diverge only so environment scope,
  gate evidence, target identity, and irreversible activation are explicit.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Admin navigation | client/src/pages/AdminSettings.tsx | Replace infrastructure panel route boundary. |
| Operations page | client/src/pages/AdminPlatformOperations.tsx | Compose query-driven control center. |
| Operations components | client/src/components/admin/platform-operations/* | Own cards, tables, dialogs, timeline, states. |
| API | server/routers/platformOperations.ts | Add guarded reads/actions. |
| Browser evidence | tests/e2e/admin-platform-operations.spec.ts | Verify states, viewports, and safe actions. |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| PlatformOperationsHeader | platform-operations/PlatformOperationsHeader.tsx | Environment/release summary | overview query |
| GateSummaryCard | platform-operations/GateSummaryCard.tsx | Gate state/evidence | gate result |
| PromotionHealthPanel | platform-operations/PromotionHealthPanel.tsx | Sync/fence summary | promotion query |
| DataValidationTable | platform-operations/DataValidationTable.tsx | Bounded validation list | validation page |
| JobControlPlaneSummary | platform-operations/JobControlPlaneSummary.tsx | Feature 186 metrics | overview job summary |
| RuntimeAdapterMatrix | platform-operations/RuntimeAdapterMatrix.tsx | Capability/legacy state | adapter summary |
| CutoverActionRail | platform-operations/CutoverActionRail.tsx | Action eligibility | gate/control queries |
| CutoverConfirmationDialog | platform-operations/CutoverConfirmationDialog.tsx | Explicit confirmation | action mutation |
| EvidenceTimelineDrawer | platform-operations/EvidenceTimelineDrawer.tsx | Redacted evidence pagination | evidence query |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | Skeletons retain headings; actions disabled | component/browser test |
| empty | Explain no promotion/gates and safe next step | component test |
| blocked | Reason code/evidence visible; activation unavailable | browser test |
| unknown/stale | Distinct warning, freshness, refresh/retry path | browser test |
| partial success | Passed items remain visible; unresolved highlighted | component test |
| ready | Required gate summary and target identity visible; activate enabled only for scope | browser test |
| mutation pending | Dialog locked, progress text, duplicate-click protection | browser test |
| success/active | Active target, activation evidence, and certificate link | browser test |
| error/forbidden | Redacted stable error; no guessed state | component/browser test |
| hover/focus/selected/disabled | Existing tokenized affordances and visible focus | accessibility/browser test |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Cards stack; tables become labeled rows/drawers; no page overflow | Playwright screenshot/assertion |
| tablet 768x1024 | Summary adapts; evidence table scrolls in a bounded region | Playwright screenshot/assertion |
| laptop 1024x768 | Navigation/action rail does not clip; dense rows readable | Playwright screenshot/assertion |
| desktop 1440x900 | Full summary/evidence/timeline/action layout | Playwright screenshot/assertion |
| wide-desktop 1280x800 | Dense tables and action rail do not overlap | Extended screenshot |
| small-mobile 360x800 | Run when drawer/table risk is present | Extended screenshot |

### Accessibility Acceptance

- Keyboard reaches environment selector, filters, evidence links, tables, action
  rail, confirmation dialog, close controls, and pagination in logical order.
- Focus is visible and returns to the triggering control when a dialog closes.
- Headings, table headers, dialog names, status text, and mutation announcements
  are semantic and screen-reader accessible.
- Color is not the sole status signal and contrast follows the product baseline.
- Reduced-motion preference disables nonessential animation and avoids polling
  layout shifts.

### Copy Contract

- Tone: concise, calm, operational, and explicit about risk.
- Languages: Thai and English through existing i18n; English is fallback.
- Labels: Environment, Source database, Production target, Hyperdrive, Sync lag,
  Final write fence, Gate evidence, Activate, Rollback request, Legacy calls,
  Unknown, Blocked, and Action ID.
- Error codes: TARGET_IDENTITY_MISMATCH, GATE_UNKNOWN, SYNC_LAG_EXCEEDED,
  IDEMPOTENCY_CONFLICT, AUTHORIZATION_REQUIRED, JOB_RECOVERY_INCOMPLETE.
- Empty/loading/success copy says what is checked and whether a safe action is
  available; missing data is never labelled healthy.

### Browser Evidence Required

Follow the repository's browser verification guidance. Capture ready,
blocked, unknown/stale, sync-lag, mutation-pending, authorization-failure,
and redacted-evidence states at 390x844, 768x1024, 1024x768, and 1440x900,
plus extended wide-desktop/small-mobile evidence when layout risk exists.
Record fixture, build identity, and screenshot path without real secrets.

## TDD stubs

- Router scope, cursor, action, auth, CSRF/rate-limit, redaction, and stable
  error-code tests.
- Component fixture tests for every state matrix entry.
- Action eligibility/concurrency/confirmation and duplicate-click tests.
- Accessibility keyboard/focus/semantic/reduced-motion/contrast tests.
- Playwright responsive/no-overflow and evidence-state tests.
- Regression test for unrelated Admin tabs and compatibility flag behavior.

## Acceptance

The new UI exposes a complete evidence-backed operational surface, every action
is guarded by the API, no secret or target detail leaks, all required viewport
and accessibility states are verified, and unrelated Admin features remain
available.

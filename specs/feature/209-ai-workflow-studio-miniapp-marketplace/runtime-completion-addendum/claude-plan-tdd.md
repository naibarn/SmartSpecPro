# Spec 209 runtime completion TDD plan

Tests are written first for each section. The implementer must keep tests
focused on the owned boundary and use the repository's Vitest, migration and
Playwright conventions. No test should treat a mocked Job or provider response
as production certification.

## Section 01 — Durable workflow-run foundation and contracts

- Test migration creates run/checkpoint/readiness/invocation structures and
  runtime schema exports match source schema.
- Test create/replay with the same tenant/version/input/idempotency returns the
  same projection; changed version or input is rejected.
- Test missing tenant, cross-tenant Job, invalid actor and stale revision are
  rejected.
- Test duplicate/stale/out-of-order events are idempotent and redacted.

## Section 02 — Library, Marketplace, dependency and entitlement flow

- Test Library returns only authorized definitions/versions and exact-version
  detail cannot cross tenants.
- Test Marketplace filters unpublished/private/suspended records and preserves
  immutable version identity/tags.
- Test entitlement outcomes for public, tenant, private, expired, denied and
  inspect-only cases.
- Test dependency readiness for ready, missing, stale, degraded and retryable
  probe results.
- Test the catalog API contract for exact version, decision revision,
  reason-code and checked-at fields; verify public Marketplace responses never
  expose private tenant metadata.
- Test UI loading, empty, error, degraded and disabled invoke states.

## Section 03 — Workflow compiler and canonical Job admission

- Test valid graph compilation to canonical Job/plan definitions with exact
  version hash, capability snapshot and dependency IDs.
- Test unresolved node, schema/type/cycle/secret/policy/cost/budget failures
  do not create Jobs.
- Test gateway receives server-derived tenant/actor and deterministic
  per-step idempotency keys.
- Test duplicate run intent replays; altered inputs under the same key fail.
- Test Feature 207 reserve failure releases/voids without orphan admission.
- Test no direct workflow queue/provider call is made.
- Test each admitted step has a registered executor and contract version, then
  exercise the canonical envelope → unified consumer → executor path with a
  controlled provider adapter. An unregistered step must create no outbox row.

## Section 04 — Full/partial/run-from/run-until and checkpoints

- Test all run modes compile only permitted nodes/subflows and reject invalid
  targets.
- Test checkpoint is version/input/graph/revision bound and digest verified.
- Test run-from reuses valid upstream outputs by default and explicit rerun is
  recorded.
- Test run-until creates durable partial state and can resume.
- Test stale, cross-tenant, missing and incompatible checkpoints fail closed.

## Section 05 — Approval, retry, cancel and resume lifecycle

- Test approval/user-input creation, allowed actor, expiry, duplicate decision
  and stale revision behavior.
- Test retryable vs permanent failures, max attempts, preserved attempt events
  and idempotent retry.
- Test queued/running/waiting cancellation, cancel race and unknown finality.
- Test external/checkpoint/approval resume and stale fencing/reconnect replay.
- Test every control maps to canonical Job commands rather than a local status.
- Test command idempotency and expected-revision conflicts for approve, reject,
  input, retry, cancel and resume; expiry must produce a durable event.

## Section 06 — Output, artifacts, preview, trace, logs and events

- Test output schema validation for ready, partial, expired and failed states.
- Test artifact tenant/job prefix, checksum, content type, size, unsafe type and
  duplicate publication behavior through the existing artifact service.
- Test authorized preview/detail access and safe unavailable fallback.
- Test event projection for duplicate, out-of-order, stale and unknown events.
- Test event redaction and state distinction between admitted, dispatched,
  effect-verified, completed, failed, cancelled and reconciliation-required.
- Test projection cursor replay/rebuild, unknown-event quarantine and authorized
  artifact proxy responses without raw provider/storage URLs.

## Section 07 — Mockup-led UI state integration

- Test Builder/Subflow/Run/Library/Marketplace route and surface continuity.
- Test the real graph editor: node selection/drag/keyboard nudge, add,
  duplicate, delete, typed edge create/relink/delete, cycle/type rejection and
  orphan-edge cleanup.
- Test every node kind has editable schema-driven Properties, field validation,
  binding changes and save/update draft persistence with dirty/saving/conflict
  states.
- Test every visible CTA invokes a command or is disabled with a reason;
  enabled no-op buttons and setup notices in place of commands must fail.
- Test server-backed loading, empty, blocked, approval, running, partial,
  retry, cancel-pending, success, failed and recovery states.
- Test every new English key has Thai parity and route namespace loading.
- Test keyboard labels, focus, tabs, alerts, disabled reasons and no fake Job or
  cost claims.
- Playwright test Dashboard → Builder → Subflow → Catalog → Run at 390x844,
  768x1024 and 1440x900, including mocked state fixtures and screenshot
  evidence. The browser flow must drag a node, create/delete an edge, edit
  Properties, save/reload and exercise each enabled command. Add
  360x800/1024x768/1280x800 for dense breakpoint risk.

## Section 08 — Economics, release gates and production evidence

- Test workflow economic correlation across estimate, reserve, capture, release
  and reconciliation-required states.
- Test duplicate invoke and ambiguous provider/effect receipts do not double
  charge or create success-only creator fees.
- Test audit correlation links version, run, Job, attempt, event, artifact and
  economic receipt while redacting secrets.
- Test migration, feature flag, contract version, i18n and release-gate checks.
- Run failure-injection drills for approval expiry, cancel race, retry budget,
  artifact publication failure and settlement mismatch.
- Test additive migration/canary/rollback gates with active runs and prove that
  rollback cannot strand or delete records referenced by canonical Jobs.

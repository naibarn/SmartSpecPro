# Feature 188 — Test-First Implementation Plan

Tests in this document are stubs/specifications. Write the tests before the
corresponding implementation. Use the existing Vitest, jsdom/Testing Library,
Playwright, Drizzle migration, and isolated database integration conventions.
No ordinary test may call a paid provider, consume credits, publish a real
artifact, send a real notification/webhook, mutate production data, or use a
real production credential.

## 1. Implementation objective and boundaries

- Test that the declared topology has Dev Server as preparation source, a new
  Production PostgreSQL instance as target, and Hyperdrive as the Cloudflare
  connection boundary.
- Test that an environment contract rejects Cloudflare-to-Dev database
  identity and rejects production local-filesystem fallback.
- Test that Feature 186 worker_jobs/worker_job_events remain the only canonical
  job ledger and no generic jobs table is introduced.
- Test that planning/verification commands do not trigger deployment or
  irreversible data movement in dry-run mode.

## 2. Existing code and required discovery

- Static audit test inventories current direct BullMQ, Redis, Celery, Beat,
  Cloud Tasks, GCP, provider callback, and local-storage paths.
- Audit output distinguishes intentionally unmigrated compatibility shims from
  activated-scope legacy calls.
- Discovery manifest records all worker_jobs readers/writers and current
  infrastructure UI/API callers.
- Migration-order test confirms Feature 188 follows the latest Feature 186
  migration and does not overwrite unrelated dirty files.

## 3. Planned repository structure

- Contract test verifies each planned owner has one public implementation
  boundary and no Cloudflare adapter imports Node-only transport/database code.
- Package boundary test verifies apps/cloudflare and apps/web consume the same
  provider-neutral contract.
- Repository manifest test verifies required workflow, ops, test, migration,
  UI, API, and adapter paths are present after implementation.

## 4. Shared domain contracts and configuration

- Unit-test legal values for environment, platform, lifecycle, promotion mode,
  promotion phase, gate status, and action.
- Contract-test PlatformActionRequest and PlatformActionResult validation,
  including required control version/action key and bounded reason.
- Read-model test verifies overview fields are bounded and do not contain
  connection strings, secrets, signed URLs, or raw provider payloads.
- Configuration tests reject missing target identity, wrong environment,
  source/target identity collision, unapproved binding, invalid pool/latency
  budgets, and secret-bearing committed configuration.
- Runtime-neutral package test fails if Node-only imports or provider bindings
  leak into shared types.

## 5. Database schema and migration

- Migration test confirms additive Feature 188 schema and expected ordering
  after migration 0305.
- Schema test verifies platform control, append-only gate, promotion, batch,
  disposition, platform outbox, and action-key columns.
- Constraint tests cover one control per environment/scope, unique gate
  evaluation identity, unique batch/action/outbox keys, FK integrity, and
  bounded payload/evidence fields.
- Migration safety test confirms no DROP, TRUNCATE, or destructive DELETE.
- Retention/index test verifies unresolved gates, stale sync, pending batches,
  evidence timeline, and source/target identity query paths are indexed.

## 6. Platform Operations service and state machine

- State-machine unit tests cover every legal lifecycle edge and reject illegal
  activation, separation, rollback, and repeated transitions.
- Concurrent action tests prove same action key returns one result and a
  different payload returns IDEMPOTENCY_CONFLICT.
- Gate aggregation tests treat missing, stale, expired, failed, and unavailable
  probes as non-passing.
- Authorization tests cover platform admin, tenant-scoped operator, forbidden
  cross-environment access, and audit actor/reason requirements.
- Cutover coordinator tests prove final fence, final delta, validation,
  synthetic-test evidence, activation, traffic opening, and separation are
  ordered and resumable.
- Platform outbox tests cover publisher lease fencing, duplicate publication,
  lost provider response, inspection-based settlement, and quarantine.
- `reconcile_activation` tests settle the existing activation intent by action
  key/reference and reject a second activation attempt.

## 7. Data promotion engine

- Inventory tests cover all configured schemas/tables, Feature 186 records,
  domain bindings, objects, Vectorize manifests, sequences, constraints,
  secrets, queues, and legacy differences.
- Disposition tests require every item to have a valid disposition, reject
  prohibited ordinary durable data without approval, and preserve mapping
  evidence for merge/transform/regenerate.
- Target preflight tests validate provider/version/region/extensions,
  replication permissions, backup/restore evidence, network identity, and
  target-not-exposed-before-activation.
- Change-feed tests require monotonic sequence, table/key identity, operation,
  row version, and delete tombstones; timestamp-only sources are rejected.
- Snapshot tests prove stable IDs, resume after interruption, retry safety, and
  source watermark capture.
- Watermark batch tests cover insert/update/delete, duplicate batch key,
  rollback without checkpoint advancement, ambiguous commit quarantine,
  backpressure, and ordered resume.
- Logical replication mode tests verify capability-gated selection and do not
  silently fall back to best-effort table copying.
- Validation tests detect missing/extra/mismatched rows, partition digest
  drift, delete drift, FK/unique/sequence errors, tenant boundary violations,
  job event/order errors, object checksum errors, and Vectorize namespace/
  version errors.
- Final fence tests prove source writes stop before final watermark, final
  delta applies before final validation, and incomplete evidence blocks ready.
- Synthetic target tests prove isolated tenant/namespace, disabled paid
  providers, no irreversible side effects, and cleanup/retention evidence.

## 8. Hyperdrive and Cloudflare runtime package

- Binding tests prove staging and production Hyperdrive bindings resolve to
  their declared target and production cannot resolve to Dev.
- Hyperdrive client tests cover per-request/step client lifecycle, pool limit,
  query timeout, transaction commit/rollback, isolation expectation, and
  prepared-statement compatibility mode.
- Database outage tests prove a Queue message or Workflow step is not
  acknowledged without durable control-plane state.
- Queues contract tests cover canonical envelope validation, duplicate delivery,
  stable dedupe key, DLQ/quarantine, lost publish response, and transport
  retry not incrementing business attempt.
- Workflows contract tests cover deterministic step names, replay, persisted
  settlement marker, pause/resume, and Hyperdrive connection inside the step.
- Container/Worker App tests cover capability routing, digest identity,
  restart, heartbeat, hard/soft timeout, lease fencing, and artifact reference.
- Cron tests cover UTC trigger conversion, application timezone, DST,
  missed-occurrence policy, schedule version, and duplicate occurrence key.
- Callback tests cover signature, replay, reference, tenant, contract-version,
  and fenced completion checks.

## 9. Feature 186 integration and legacy replacement

- Promotion fixture verifies worker_jobs, worker_job_events, attempts,
  dispatches, outbox, settlements, and domain job bindings retain identity and
  lifecycle history.
- Duplicate delivery tests prove no duplicate credit, provider, artifact,
  notification, webhook, or billing settlement.
- Stale lease/callback tests prove an older attempt cannot overwrite newer
  terminal/current state.
- Adapter observation tests prove queue/provider state cannot become canonical
  status without a guarded command.
- Queue-family rollout manifest tests require one active side-effecting producer.
- Static and generated-bundle tests fail on direct activated-scope legacy calls.
- Production storage tests prove local filesystem fallback is impossible.

## 10. Admin API and authorization

- Router tests cover overview, gate pages, promotion pages, batches, evidence,
  and all guarded actions with cursor/limit validation.
- Authorization tests cover admin scope, environment scope, CSRF/rate limits,
  tenant isolation, and audit records.
- Redaction tests reject secrets, DB URLs, signed URLs, raw provider responses,
  shell commands, and unbounded payloads in responses.
- Action tests cover expected-control-version conflicts, idempotent repeats,
  unknown dependencies, and stable error codes.
- Router tests prove no handler directly invokes gcloud, Cloudflare deployment,
  paid provider, or secret-copy behavior.

## 11. Admin UI implementation

- Component tests cover loading, empty, blocked, unknown, stale, partial,
  ready, pending, success, forbidden, error, selected, focus, hover, and
  disabled states.
- Query fixture tests verify source/target/Hyperdrive identity, lag, gate
  evidence, canonical job metrics, legacy observations, and redaction render
  correctly.
- Mutation tests verify action buttons are enabled only for eligible gates,
  confirmation includes target/release/window/actor/reason/action key, and
  duplicate clicks are prevented.
- Accessibility tests verify headings, labels, table semantics, focus return,
  keyboard path, live mutation status, non-color status, and reduced motion.
- Responsive browser tests run at 390x844, 768x1024, 1024x768, 1280x800, and
  1440x900; they assert no page overflow or clipped action controls.
- Browser evidence tests cover ready, blocked, unknown/stale, sync lag,
  mutation pending, authorization failure, and redacted evidence.
- Regression test verifies unrelated Admin tabs still render and the old
  infrastructure panel is not required for the new route.

## 12. Release workflow and repository controls

- Workflow lint/schema tests verify environment names, required approvals,
  branch restrictions, OIDC permissions, and no plaintext credentials.
- OIDC policy tests verify repository/branch/environment subject constraints.
- Release manifest tests verify commit/artifact/schema/adapter/data/gate digests
  are present and stable.
- Container rollback tests verify old image digests remain retained through the
  configured rollback window.
- Workflow dry-run tests prove build/test/evidence steps do not activate
  traffic, provision a database, copy secrets, or call paid providers.

## 13. Cutover runbook implementation

- Runbook parser/checklist test verifies all steps exist in order: freeze,
  source/target identity, continuous sync, gates, maintenance, producer fence,
  final watermark/delta, validation, target synthetic tests, activation,
  traffic opening, legacy audit, sync revocation, denial proof, certificate.
- Action replay test proves each runbook operation is idempotent and resumes
  from durable evidence.
- Activation handoff test covers durable intent, external release acknowledgement,
  provider response loss, target identity probe, and separate traffic opening.
- Rollback drill test covers schema/image compatibility, target writes,
  canonical job reconciliation, forward-fix/reverse decision, and no blind
  switch to Dev.
- Separation test proves credentials are revoked, network direction is denied,
  and attempted post-cutover sync is audited.

## 14. Observability, security, and failure handling

- Structured-log test checks required correlation fields and verifies redaction.
- Alert rule tests cover unknown gates, target/Hyperdrive mismatch, sync lag,
  checksum/FK/sequence drift, stale jobs/outbox, legacy calls, Dev-connect
  attempts, post-cutover sync, and rollback artifact expiry.
- Failure-injection tests cover source/target DB outage, change-feed outage,
  Hyperdrive outage, queue/workflow retry, target batch ambiguity, gate probe
  timeout, callback replay, and action races.
- Security tests cover environment/tenant authorization, least-privilege
  credentials, secret non-persistence, and fail-closed target selection.

## 15. Test-first implementation sequence

- A meta-test or checklist validates that each implementation slice has its
  tests committed before implementation code in the rollout branch.
- Test fixtures are side-effect-free by default and fail if a real provider,
  production target, or non-test credential is selected.
- Failure-injection harness verifies the same idempotency key is reused after
  database serialization/deadlock or network response loss.
- Coverage/report tests distinguish unit, integration, adapter, browser, and
  production-evidence categories rather than treating one aggregate pass as
  deployment proof.

## 16. Verification commands and evidence

- Focused Vitest command list executes schema, service, router, adapter, and
  UI tests from apps/web with the repository's existing test secret pattern.
- Database integration command refuses a non-isolated database and records
  target class without recording credentials.
- Playwright command records canonical viewport, fixture, build identity, and
  screenshot paths.
- Feature 186 and Feature 188 static audits report intentional compatibility
  shims separately from violations.
- Cloudflare package typecheck/build runs with mocked bindings and no production
  deployment.
- Evidence-bundle schema test rejects missing command, commit, environment,
  database identity class, result, artifact, or reviewer fields.

## 17. Rollout phases and dependency order

- Dependency test verifies schema/contracts precede service, promotion, adapter,
  UI action, and activation code.
- Fixture-only UI work may run in parallel with promotion/adapter services, but
  activation tests require all gate fixtures.
- Canary test verifies exactly one side-effecting producer per migrated job type.
- Rollback flag test preserves canonical job IDs and terminal history while
  returning new work to the prior adapter.
- Gate test blocks every phase when target identity, sync, Hyperdrive,
  validation, recovery, or legacy audit evidence is unknown.

## 18. Definition of done

- End-to-end test fixture proves new target identity, Hyperdrive-only Cloudflare
  access, complete promotion, final fence/delta, validation, activation, and
  separation.
- Browser evidence proves all required UI states and viewports.
- Duplicate/replay/outage tests prove Feature 186 convergence and no duplicate
  paid side effects.
- Static/runtime/network audit proves no hidden legacy fallback in activated
  scope and no Cloudflare-to-Dev database access.
- Release/cutover evidence tests verify separate proof for schema, data,
  binding, build, runtime, activation, recovery, and permanent separation.

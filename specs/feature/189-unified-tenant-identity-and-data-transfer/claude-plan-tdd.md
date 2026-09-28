# TDD plan — Unified tenant identity and resumable data transfer

Tests are written before each implementation wave and use the existing web package conventions: Vitest for server/shared/component tests, database-integration tests only with the test database flag, and Playwright for browser evidence. Test fixtures must use synthetic tenant/users/resources and fake adapters; no paid providers, production storage, or production database mutation.

## 1. Delivery boundary and sequencing

- Test that the migration manifest lists an owner, feature flag, schema version, rollback rule, and evidence gate for each wave.
- Test static call-site audit output distinguishes public branding tenant from authenticated account tenant.
- Test that no planned transfer path imports a direct transport/provider API outside its adapter boundary.

## 2. Phase 0 — inventory and contract tests

- Contract tests for stable tenant sources, tenant mismatch, invalid invite, stale preview, unsupported handler, active-job block, conflict, and resumable-operation errors.
- Contract tests for operation/item state transitions and illegal transitions.
- Redaction tests for preview, event, error, provider-reference, signed-URL, secret, transaction, and credit fields.
- Inventory verification test that every discovered terminal job-linked type is either registered or appears in an explicit unsupported report.

## 3. Phase 1 — serialized schema and migration foundation

- Schema tests verify `currentTenantId` remains the sole account binding and transfer item keys are unique/idempotent.
- Schema tests verify pre-approval snapshots expire safely and approved plans attach one-to-one to the canonical transfer job.
- Schema/service tests verify immutable `tenant_identity_events` capture backfill and System Admin move evidence, including credit-reset and session-revocation outcomes.
- Migration fixture tests cover valid tenant preservation, inactive/missing tenant repair by unique registered domain, Default fallback, repeat-safe backfill, and no hostname-based reassignment.
- Constraint tests cover foreign keys, same-tenant policy inputs, operation/item uniqueness, and audit evidence retention.
- Migration rehearsal verifies old Feature 186 rows/events/attempts/dispatches remain readable and queued jobs are not deleted.

## 4. Phase 2 — tenant admission, auth, and SSO

- Admission tests for tenant-bound invite precedence across mismatched hosts, global invite authorization without binding, exact active domain match, explicit Default fallback, and supplied invalid/expired/inactive/exhausted invite rejection in both registration modes.
- Password and OAuth parity tests for new user creation, existing user login from another host, disabled user, missing/inactive tenant, and upstream-created OAuth user.
- Authenticated resolver tests prove host branding cannot override account tenant and missing account tenant fails closed.
- SSO tests cover exact origin allowlist, PKCE S256 verifier mismatch, state/nonce mismatch, expired/replayed/consumed code, wrong destination, disabled user, and successful local-session creation.
- Session tests prove account move revocation invalidates existing session/JTI material without exposing tokens.

## 5. Phase 3 — authorization and workspace projection migration

- Route/service tests for mismatched host against protected media, library, production, billing, storage, job, workflow, notification, and admin paths.
- Tests that client `tenantId` cannot override the authenticated account tenant, while an explicit System Admin operation has a separate authorized contract.
- Domain-admin tests for same-tenant access, cross-tenant denial, and `registeredDomain` changes not granting scope.
- Client tests verify workspace badge uses the server account tenant and branding remains separate; no tenant switcher is exposed.

## 6. Phase 4 — System Admin tenant move

- Authorization tests for admin allowed, domain_admin denied, ordinary user denied, and host mismatch not changing the result.
- Transaction tests for account identity preservation, current tenant change, immediate credits zero, old data/files untouched, no automatic transfer, and audit record.
- Mutation-fence tests prove a pending System Admin move rejects or defers new job admission, survives process loss, re-enumerates jobs before commit, and closes only after the final binding transaction.
- Idempotency/concurrency tests for repeated move requests, conflicting action keys, and concurrent moves.
- Session/token tests verify all active sessions are revoked and a newly issued session reflects the new tenant.
- UI tests verify explicit warning, target selection, confirmation, pending/success/error states, and separation from generic role/credit edits.

## 7. Phase 5 — transfer registry, preview, and approval

- Registry tests for handler allowlisting, version identity, parent-before-child dependencies, managed storage ownership, terminal job eligibility, and explicit unsupported types.
- Registry tests verify ownership transfer from `sourceUserId` to `targetUserId` preserves tenant, canonical IDs, original authorship, job/event history, and billing/usage references.
- Preview tests for same-tenant enforcement, selection ownership, dry-run non-mutation, exclusions, queued-job kill requirements, active-job blockers, conflicts, stale preview fingerprints, and bounded output.
- Approval tests verify one canonical `tenant_data_transfer` worker job, immutable plan fingerprint, one item per resource, same-transaction durable intent, and duplicate approval idempotency.
- Transfer-fence tests prove approval opens a source-user fence, new queueable admission is rejected/deferred while it is open, and terminal success/cancellation/review closes it exactly once.
- No-overwrite tests verify destination conflicts stop the item and do not merge or replace target data.

## 8. Phase 6 — execution, queue kill, and resume

- Fake-adapter tests prove queued pending/queued/retry-scheduled jobs are cancelled/fenced, transport removal is attempted, canonical history is retained, and no provider/credit/artifact side effect occurs.
- Queue-cancellation tests verify `queue_cancelled` is a separate skipped disposition/count and is never reported as copied work.
- Active-work tests prove leased/running/waiting-external items block and ambiguous provider work requires evidence/operator review.
- Item execution tests cover deterministic item idempotency, destination marker reuse, duplicate delivery, process loss, partial batch commit, parent/child ordering, and bounded retries.
- Resume tests prove transferred/skipped items are not repeated, retryable items retry within limits, conflicts/permanent errors remain visible, and no replacement operation/job is created.
- State-machine tests cover pause, resume, complete, completed-with-conflicts, failed, cancelled, and illegal operator transitions.
- Pause/resume tests prove `paused_on_error` maps to manual `retry_scheduled` without automatic dispatch until resume.
- Reconciler tests cover stale transfer lease, missing cancellation evidence, incomplete checkpoint, transport outage, and idempotent recovery.

## 9. Phase 7 — API and UI delivery

- API tests for preview, approve, status/timeline, resume, `resolveItem` retry/skip, and cancel authorization/idempotency.
- Component tests for all UI state-matrix states, safe copy, redacted errors, selection, focus, disabled actions, and progress/live-region behavior.
- Playwright tests at mobile 390x844, tablet 768x1024, laptop 1024x768 where applicable, and desktop 1440x900 for workspace identity, System Admin warning, preview, paused-on-error, resume, conflict, and completion.
- Browser assertions verify no transaction/credit/history/active-queue transfer claim and no duplicate approval/resume action.

## 10. Verification and rollout

- Run focused unit suites, database integration suites, Feature 186 verification, typecheck, and browser tests with captured command/evidence metadata.
- Rollout-gate tests verify observe-only mode, feature flags, canary limits, handler manifest, queue-cancel policy, and rollback leaves canonical history intact.
- Failure-injection tests cover database unavailable, outbox/transport unavailable, session revocation failure, storage copy failure, destination conflict, stale callback, and worker restart.

## 11. Operational and security safeguards

- Security tests cover tenant isolation, CSRF/rate limits, origin validation, token/secret redaction, bounded payloads, authorization audit, and cross-tenant fail-closed behavior.
- Operational tests cover preview/approval/resume rate limits, batch bounds, event/error size limits, backpressure, and operator-visible pause/quarantine reasons.

## 12. Suggested implementation file ownership

- Add or update focused tests adjacent to each owning service/router/component rather than creating a parallel test framework.
- Add a dedicated integration fixture for transfer handlers and fake adapters; keep schema migration tests serial and run before dependent suites.

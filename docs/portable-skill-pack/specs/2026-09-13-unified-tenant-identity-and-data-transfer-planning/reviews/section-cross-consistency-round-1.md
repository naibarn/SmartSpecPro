# Section cross-consistency review — round 1

## Dependency map

- Section 01 owns inventory, shared contract names, Drizzle migration `0306`, `tenant_identity_events`, `tenant_data_transfer_previews`, `tenant_data_transfer_plans`, and `tenant_data_transfer_items`.
- Section 02 consumes the tenant-source/error contracts and owns admission/auth/SSO behavior.
- Section 03 consumes the account-tenant resolver and owns protected-route/workspace projection migration.
- Section 04 consumes section 01 schema and section 03 authorization/session helpers; owns System Admin move only.
- Section 05 consumes section 01 tables and section 03 authorization; owns handler registry, preview, and approval.
- Section 06 consumes sections 01 and 05; owns canonical transfer execution, queue cancellation, item checkpoints, resume, and reconciliation.
- Section 07 consumes all server contracts and owns router/UI integration; no separate UI writer overlaps its files.
- Section 08 consumes all outputs and owns final proof/rollout evidence.

## Checks

- Interface alignment: PASS. `sourceUserId`, `targetUserId`, `tenant_data_transfer_previews`, `tenant_data_transfer_plans`, `tenant_data_transfer_items`, `tenantDataTransfer`, `worker_jobs.id`, and `queue_cancelled` are named consistently.
- Canonical state: PASS after fix. `paused_on_error` is consistently a domain projection over canonical `retry_scheduled` with `operatorReviewRequired` and no automatic dispatch until resume.
- Coverage gaps: PASS. Tenant identity, auth, authorization, System Admin move, handler completeness, preview/approval, queue kill, resumability, API/UI, and final evidence each have an owning section.
- Overlaps: PASS. Section 01 is the only schema writer; section 04 owns AdminUsers move UI; section 07 owns transfer/dashboard UI integration. Section 06 reuses, not redefines, Feature 186 control-plane state.
- Dependency order: PASS. Preview is persisted before approval in the dedicated preview table; approved plan attaches to one canonical job; execution follows approval; UI follows API/executor contracts.
- Self-containment: PASS. Each section includes scope, file ownership/boundary, behavior, tests-before-implementation, and exit/gate guidance.
- UI evidence: PASS. Section 07 includes target user, existing-pattern decision, surfaces, components, state/responsive/accessibility/copy contracts, and browser evidence.

## Result

No unresolved cross-section mismatch remains. The plugin's automatic batch prompt generator was unavailable because its prompt template is missing; all eight section files were written and validated manually from the same plan/TDD source.

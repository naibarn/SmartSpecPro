# TDD Plan

## 1. Planning goal

Write tests first for the boundaries that make delegated worker execution safe and useful. Reuse the existing `apps/web` Vitest suites for server services, `_core` routes, public API routes, worker runtime routes, and client pages.

## 2. Codebase baseline and constraints

### Tests to add first

- Test that delegated worker auth is treated differently from generic bearer or session auth.
- Test that existing worker-control-plane flows remain unchanged when delegated access is not requested.
- Test that OpenClaw-only binding behavior remains the baseline until runtime-aware expansion is introduced.

## 3. Target end state

### Tests to add first

- Test that a claimed worker job can obtain a delegated session.
- Test that the delegated session includes the expected job, worker, tenant, scope, grant, and budget context.
- Test that the delegated session is rejected when lease ownership is absent or stale.
- Test that delegated-session issuance is rejected when the acting user is not the worker owner.

## 4. Architecture changes

### 4.1 Delegated worker session layer

- Test delegated-session issuance success for a live eligible worker lease.
- Test denial when the worker is revoked, disabled, or the job is finalized.
- Test revocation or invalidation after lease loss, worker disable, job completion, and kill-switch shutdown.
- Test the default delegated-session TTL and hard-cap behavior.
- Test that session refresh requires explicit re-issuance rather than silent extension.

### 4.2 Resource-grant model

- Test that scope-only access is not enough without the matching grant.
- Test grant expiry or mismatch denial.
- Test that unrelated tenant resources are rejected even if route scope is present.
- Test that another user in the same tenant cannot reuse or widen a personal worker's grants.
- Test that model/provider selection is denied when outside the delegated allowlist.
- Test that owner-library and owner-RAG access is denied without the matching knowledge grant.

### 4.3 Delegated budget ledger

- Test budget reservation or envelope binding during delegated session issuance.
- Test downstream decrement behavior.
- Test budget exhaustion denial.
- Test downstream retries do not double-charge.
- Test delegated concurrency ceilings for in-flight actions.
- Test hourly, five-hour, daily, weekly, and monthly worker spending caps.
- Test unlimited or unset windows do not block execution.
- Test that personal-worker delegated charges remain attributed to the owner/acting user and do not use a worker-level or tenant-level wallet.

### 4.4 Delegated-worker auth mode

- Test `requireScopes` and related auth guards for the new delegated-worker mode.
- Test delegated-worker tokens do not inherit implicit full-access bearer behavior.
- Test header spoofing attempts fail when claims and headers disagree.

### 4.5 HTTP-first delivery surface

- Route tests for delegated access to:
  - LLM gateway
  - skills execute
  - agencies invoke
  - media generation
  - presentations
  - video projects
  - jobs
- Route tests for delegated access to owner-library read/search and owner-RAG search or ingest surfaces where implemented.
- Billing tests that downstream calls preserve the real source type.
- Discovery tests for machine-readable HTTP contract publication and delegated capability-manifest truthfulness.

### 4.6 Callback surfaces

- Test room, workflow, and notification callback success for allowed targets.
- Test callback rejection for unrelated targets, unsafe URLs, oversize payloads, and replayed idempotency keys.
- Test active-content artifact outputs follow the configured safe-serving policy.
- Test the default plain-text callback limit and HTTPS-only external-link policy.
- Test owner-library or RAG ingestion uses the existing artifact publication and indexing flow rather than a side-channel write path.

### 4.7 Runtime-aware Bound Worker expansion

- Test existing OpenClaw binding still works.
- Test capability-based or policy-based binding eligibility once added.
- Test unsupported runtimes are rejected with clear errors.
- Test that worker selection lists only personal workers owned by the current user.

### 4.8 MCP positioning

- Test that delegated worker MCP access is hidden or denied where parity is not implemented.
- Test selected real MCP paths enforce both scopes and grants.
- Test MCP or tool output cannot widen grants, targets, or provider/model policy.
- Test delegated manifests do not claim MCP namespaces that are still unavailable.

## 5. Implementation workstreams

### 5.1 Workstream A: contracts, schema, and persistence

- Schema tests for delegated-session and grant records.
- Shared schema validation tests for delegated worker claim shapes.

### 5.2 Workstream B: worker control-plane delegation endpoints

- Route tests for delegated-session issuance.
- Service tests for lease-bound eligibility and revocation behavior.

### 5.3 Workstream C: public API delegated auth and route enforcement

- Route tests for every first-phase delegated `/v1/*` surface.
- Tests that admin, billing, auth-management, and unrelated account surfaces remain blocked.

### 5.4 Workstream D: downstream billing and audit propagation

- Billing tests for worker-origin metadata propagation.
- Audit tests for delegated-session ID, worker ID, acting user, and trace ID presence.
- Rolling-window budget tests for worker spending guardrails.

### 5.5 Workstream E: callback and publication flow

- Artifact-publication tests that callback payloads reference SmartSpecPro outputs correctly.
- Run-history or workflow tests that user-visible completion summaries appear in the expected place.
- Artifact-serving tests for download-only and quarantine-first defaults.

### 5.6 Workstream F: team binding and runtime expansion

- Team-service tests for runtime-aware binding eligibility.
- Teams page tests for showing available or unavailable bound-worker choices clearly.

### 5.7 Workstream G: security, observability, and rollout controls

- Feature-flag tests for delegated-worker enablement.
- Kill-switch tests for blocking new issuance and invalidating existing sessions.
- Replay-protection tests.
- Recursion-depth enforcement tests.
- Operator-visibility tests for blocked-by-budget worker state.

### 5.8 Workstream H: worker budget management UI

- Admin UI tests for setting and clearing hourly, five-hour, daily, weekly, and monthly worker caps.
- UI tests for showing current spend, remaining budget, blocked-by-budget state, and acting-user balance explanation.
- UI tests for explaining that worker caps are safety guardrails for that personal worker rather than a replacement wallet for the owner's balance.
- UI tests for self-service worker management by the owner user without requiring admin creation.

## 6. Delivery phases

### Phase 1: delegation foundation

- Write service and route tests for issuance, revocation, auth classification, and grants before implementation.

### Phase 2: HTTP-first platform execution

- Add surface-by-surface route tests before connecting delegated sessions to each `/v1/*` route.

### Phase 3: callback and completion visibility

- Add callback safety tests before implementing callback publishing.

### Phase 4: runtime-aware expansion

- Add binding eligibility tests before widening beyond OpenClaw-only checks.

### Phase 5: selected MCP parity

- Add explicit tests that separate real worker-MCP support from placeholder or disabled routes.

### Phase 6: hybrid autonomous workflows

- Add orchestration-style integration tests that simulate an end-to-end worker outcome and verify credits, artifacts, and callbacks.

## 7. Error handling and policy rules

### Tests to add first

- unauthorized delegated session request
- stale lease reuse
- cross-tenant resource access
- grant mismatch
- disallowed provider or model selection
- exhausted delegated budget
- exhausted hourly worker budget
- exhausted five-hour worker budget
- exhausted daily worker budget
- exhausted weekly worker budget
- exhausted monthly worker budget
- another user attempts to use a personal worker they do not own
- delegated concurrency overflow
- unsafe callback link
- recursion-depth overflow
- revoked worker reuse
- external API call outside SmartSpecPro credit flow remains outside SmartSpecPro charging
- silent delegated-session refresh attempt
- parent-budget overflow attempt

## 8. Data and interface design expectations

### Tests to add first

- delegated-session claim parsing and validation
- grant record validation
- worker-origin billing metadata validation
- callback payload schema validation
- retention-policy tests where persistence cleanup or archival policy is codified
- delegated capability-manifest schema validation

## 9. Testing strategy

The implementation should favor fast service and route tests first, then add a small number of focused integration tests for the highest-value outcome flows.

## 10. Main implementation risks

### Tests to reduce risk

- auth confusion regression tests
- untrusted-content and prompt-injection boundary tests
- billing idempotency tests
- runtime expansion compatibility tests
- truthful-protocol-positioning tests
- active-content artifact safety tests

## 11. Completion criteria

The test plan is complete when the suite proves that Bound Worker can safely act on behalf of the user within delegated job scope, use real platform surfaces, publish useful outputs back into the system, and preserve correct billing and audit truth.

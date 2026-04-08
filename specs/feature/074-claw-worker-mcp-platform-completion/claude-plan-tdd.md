# TDD Plan

## 1. Planning goal

Write tests first for the boundaries that make delegated-worker MCP truthful, charge-correct, and safe. Reuse the existing Vitest suites for `_core` MCP routes, public API routes, delegated-worker services, and security regression tests.

## 2. Codebase baseline and constraints

### Tests to add first

- Test that delegated-worker callers remain blocked until the new MCP auth path is explicitly enabled.
- Test that existing non-delegated MCP callers keep current protocol behavior.
- Test that placeholder tools are hidden rather than exposed as callable tools.

## 3. Target end state

### Tests to add first

- Test that a delegated worker can initialize `/v1/mcp` once the feature is enabled.
- Test that the delegated MCP session stays bound to owner, tenant, worker, and live delegated session context.
- Test that revoked, expired, or disabled sessions fail closed.
- Test that `tools/list` only returns tools that actually execute for the current delegated session.

## 4. Architecture changes

### 4.1 Canonical MCP tool registry

- Test registry entries expose the expected metadata for family, grants, feature flags, execution mode, and availability.
- Test `tools/list` and `tools/call` read the same registry truth rather than diverging.
- Test disabled or unavailable tools do not appear as normal callable tools.
- Test static MCP catalog output stays consistent with the registry while remaining less authoritative than authenticated `tools/list`.
- Test protocol capabilities remain truthful, including gated prompts/resources and the default `tools.listChanged` posture.

### 4.2 Delegated-worker auth path

- Test delegated-worker initialization succeeds only with a valid delegated session and matching worker/job claims.
- Test denial when `actingUserId != ownerUserId`.
- Test denial when tenant mismatches.
- Test denial when the delegated session expires, is revoked, or the underlying worker job is no longer active.
- Test session termination, missing-session, and expired-session behavior remain correct after delegated-worker MCP enablement.

### 4.3 Billing, budget, idempotency, and concurrency

- Test chargeable MCP tools use the owner user balance.
- Test downstream source types remain visible in billing/audit metadata.
- Test delegated job budgets and rolling worker windows are enforced.
- Test idempotent retries do not double-charge or double-create downstream work.
- Test per-family or per-action concurrency limits for delegated MCP execution.
- Test the canonical MCP idempotency-key field works in both single-call and batch scenarios.

### 4.4 Discovery and manifest truth

- Test delegated manifest MCP family data matches `tools/list`.
- Test feature flags or kill switches hide tools consistently from both manifest and discovery.
- Test availability reasons are operator-visible where expected.

### 4.5 Gateway and knowledge parity

- Route tests for:
  - gateway models list
  - gateway credits get
  - gateway chat create
  - gateway responses create
  - Library search/get/upload
  - RAG search/ingest
- Test knowledge tools remain owner-bound and same-tenant.
- Test knowledge upload/ingest reuses the existing platform ingestion path rather than a side-channel write.

### 4.6 Skills, agencies, media, and jobs parity

- Route tests for skill list/detect/execute wrappers.
- Route tests for agency list/invoke/status wrappers.
- Tests for agency tool bridge hardening.
- Route tests for media create/status wrappers.
- Route tests for jobs create/list/get/cancel wrappers.
- Async tests that durable ids and status handles are returned instead of fake placeholder payloads.

### 4.7 Presentations, video, and artifact-safe results

- Route tests for presentation create/get/export/download/progress wrappers.
- Route tests for video project create/get/export/download wrappers.
- Tests that active-content results follow safe-serving policy.
- Tests that large results are returned as artifact refs or links rather than unsafe inline payloads.
- Tests that MCP-triggered long-running work can still surface completion through the existing worker callback channels without inventing a separate unsafe notification path.

### 4.8 Legacy MCP migration

- Tests that supported workspace tools are reachable through canonical public MCP.
- Tests that drive tools still enforce owner/tenant context and safe Python proxy behavior.
- Tests that orchestrator room actions keep their existing behavior through the canonical public MCP path.
- Tests that legacy routes are no longer the only product truth for supported tools.

### 4.9 Browser gating and advanced parity

- Test browser MCP remains hidden or denied until the dedicated browser policy gate is enabled.
- If enabled, test browser reservation, concurrency, domain allowlists, and refund behavior still hold.
- Test that prompts/resources are not advertised until explicitly implemented.

## 5. Implementation workstreams

### 5.1 Workstream A: registry and contracts

- Shared schema validation tests for registry metadata and static catalog output.
- Discovery tests for tool availability reasons and delegated-family filtering.

### 5.2 Workstream B: delegated-worker auth enablement

- Route tests for delegated initialize, `tools/list`, and `tools/call`.
- Service tests for owner-bound and same-tenant enforcement.
- Protocol regression tests for initialize, version negotiation, `ping`, `notifications/initialized`, and `DELETE /v1/mcp`.

### 5.3 Workstream C: billing, budget, and idempotency

- Service tests for idempotency key handling.
- Billing tests for retry safety.
- Budget tests for job envelope and time-window denial.

### 5.4 Workstream D: high-value tool families

- Route tests for gateway and knowledge families before implementation.
- Family-specific error tests for missing grants, missing scope, and unavailable feature flags.

### 5.5 Workstream E: broader parity families

- Route tests for skills, agencies, media, jobs, presentations, and video.
- Async result-shape tests for long-running families.

### 5.6 Workstream F: legacy migration

- Regression tests proving migrated workspace/drive/orchestrator behavior still works.
- Compatibility tests for any intentionally retained internal or compatibility-only legacy routes.

### 5.7 Workstream G: safety, observability, and rollout

- Security tests for untrusted-content boundaries.
- Approval-gate tests for high-risk delegated actions.
- Audit and kill-switch tests.
- Metrics or diagnostic visibility tests where structured outputs exist.

## 6. Delivery phases

### Phase 1: truthful discovery and delegated auth

- Write protocol and discovery tests before enabling delegated-worker MCP.

### Phase 2: gateway and knowledge

- Add route and service tests for the first real execution families before implementation.

### Phase 3: broader product parity

- Add tests for skills, agencies, media, and jobs before moving those families from placeholder to real execution.

### Phase 4: artifact-heavy families

- Add presentation/video/artifact safety tests before implementation.

### Phase 5: legacy migration and browser decision

- Add migration tests and browser gating tests before exposing those families.

## 7. Error handling and policy rules

### Tests to add first

- expired delegated session
- revoked delegated session
- owner mismatch
- tenant mismatch
- missing grant
- missing scope
- unavailable feature flag
- budget exhaustion
- concurrency overflow
- duplicate retry with idempotency key
- duplicate retry without valid idempotency handling
- batch request with mixed success and failure semantics
- tools hidden after feature flag change while the session is still alive
- Python proxy unavailable
- browser gate disabled
- unsafe active-content result
- untrusted-content attempt to widen callback or model policy

## 8. Data and interface design expectations

### Tests to add first

- registry metadata schema validation
- static MCP catalog shape validation
- delegated manifest MCP section validation
- async result contract validation
- availability reason and safety class metadata validation

## 9. Testing strategy

Favor fast route and service tests first, then a smaller number of focused integration tests that simulate a meaningful delegated-worker MCP flow from session initialization through execution and cost attribution.

## 10. Main implementation risks

### Tests to reduce risk

- false advertising in `tools/list`
- delegated-worker auth confusion
- retry double-charging
- hidden placeholder regressions
- unsafe artifact/result delivery
- legacy migration breakage
- browser policy bypass

## 11. Completion criteria

The test plan is complete when the suite proves that delegated workers can use MCP safely and truthfully for the families the platform advertises, while preserving Feature 072’s ownership, billing, budget, and security guarantees.

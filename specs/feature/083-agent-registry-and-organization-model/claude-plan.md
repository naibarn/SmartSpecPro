# Implementation Plan - Agent Registry And Organization Model (083-Agent-Registry-And-Organization-Model)

## 1. Plan Intent

This plan introduces a governed agent registry that becomes the source of truth for agent identity, versioning, policy envelopes, rollout posture, and outcome memory. The implementation is intentionally staged so the existing role-agent and delegated-worker behavior stays stable while governance is centralized.

## 2. Current-State Constraints and Design Principles

### Constraints
- The repository already has role-agent contracts, role configuration services, delegated worker manifests, and tenant rollout flags.
- Existing role-agent flows are user-visible and should not be broken while the registry is introduced.
- `agentTemplates` and `agentActivityEvents` already exist but do not satisfy the registry requirements in the spec.

### Design Principles
- Registry identity comes before prompt text.
- Agent versions are immutable once published.
- Authority must be bound explicitly through policy records, not implied by naming.
- Selection must fail closed when eligibility is ambiguous or incomplete.
- Rollout and policy widening must be auditable and reversible.
- Outcome memory should inform selection only when policy permits it.

## 3. Target Registry Model

### 3.1 Canonical entities

The registry should introduce the following entities in the web server schema layer:

- `agent_registry`
- `agent_version`
- `agent_profile`
- `agent_capability_profile`
- `agent_tool_binding`
- `agent_memory_scope`
- `agent_budget_policy`
- `agent_escalation_policy`
- `agent_rollout_binding`
- `agent_performance_memory`
- `agent_version_promotion_review` or equivalent promotion audit record

### 3.2 Required version contract

Every agent version should carry:

- purpose and supported work domains
- supported tool classes and disallowed action classes
- memory scope and redaction expectations
- budget policy and concurrency limits
- approval requirements and escalation triggers
- owning team and tenant scope
- rollout posture and eligibility constraints
- model-family or prompt-family compatibility metadata
- evaluation targets and comparison baseline reference
- outcome-memory writeback hook

The first-wave registry should support these agent kinds:

- planner
- specialist
- reviewer
- approver
- analyst
- connector_operator
- knowledge_agent
- supervisor
- role_agent

### 3.3 Rollout states

The version lifecycle must support:

- `draft`
- `shadow`
- `canary`
- `supervised`
- `general`
- `frozen`

Version state transitions should preserve previous stable pointers so rollback never depends on reconstructing old configuration from mutable state.

## 4. Data Model and Persistence Strategy

### 4.1 Schema delivery

- Add new Drizzle tables in `apps/web/drizzle/schema.ts` with migrations that keep the current system additive and backwards compatible.
- Prefer normalized records for identity, versions, policy bindings, and rollout targeting so eligibility checks remain queryable.
- Keep performance/outcome memory separate from live execution telemetry so registry learning does not become entangled with runtime event logs.

### 4.2 Index strategy

- Index by tenant and registry identity for fast lookups.
- Index by tenant, rollout posture, and targeting dimensions for selection queries.
- Index by version status and stable-pointer relationships for promotion and rollback.
- Index performance memory by workload class and selected version for historical comparison queries.

### 4.3 Migration strategy

- Use additive migrations first.
- Do not remove existing role-agent records in the same release.
- Treat role-agent migration as a compatibility layer that maps old concepts onto the new registry.
- Keep rollback viable by preserving prior stable version references and avoiding destructive data reshaping in the first pass.

### 4.4 Migration and cutover safety

- Bootstrap the initial registry from existing role-agent and delegated-worker concepts rather than asking operators to recreate them manually.
- Use an idempotent backfill so repeated planning or deployment runs cannot duplicate registry identities or versions.
- Define a clear source-of-truth order during transition: registry after cutover, legacy role-agent records only as compatibility input.
- Keep dual-read or adapter fallback only for the minimum necessary migration window, and make the deprecation step explicit in rollout notes.
- Treat cutover as reversible until the compatibility window closes, but never allow both systems to independently mutate the same governed identity.

## 5. Registry Services and Resolution Engine

### 5.1 Registry write services

Create service-layer operations for:

- registry creation
- version creation
- promotion review creation
- version activation
- version freeze
- rollback to stable pointer
- policy binding updates
- outcome-memory upsert

### 5.2 Eligibility resolution

Selection should resolve a registry identity to one version using this order of checks:

1. tenant ownership
2. team or queue scope
3. workpack-family compatibility
4. rollout posture eligibility
5. policy and budget eligibility
6. approval and escalation constraints
7. optional evidence-based preference among eligible versions

If no version passes every gate, the resolver must fail closed with an explainable reason payload.

### 5.3 Policy widening and rollback behavior

- Any widening of tool scope, data scope, or budget must create a new version and require review.
- Freeze should stop further promotion while preserving the currently stable version.
- Rollback should only move the stable pointer back to an already-approved version.

### 5.4 Concurrency and consistency model

- Promote, freeze, and rollback operations should run inside a transaction boundary that preserves pointer consistency.
- If the underlying store supports optimistic locking or compare-and-swap semantics, use them for stable-pointer updates.
- The resolver should tolerate stale reads by re-checking the selected version's status before returning a final result.
- Concurrent publishes for the same registry identity must be serialized or rejected deterministically, never merged implicitly.
- The implementation should prefer unique constraints and explicit state transitions over application-level "last write wins" behavior.

## 6. API and UX Delivery Plan

### 6.1 Admin API surface

Add registry management procedures to the existing web server router layer for:

- creating registries
- publishing new versions
- reviewing promotion proposals
- freezing or rolling back versions
- inspecting eligibility and attached policies
- viewing outcome memory for a registry/version

### 6.2 Tenant and rollout controls

- Reuse the tenant feature-flag model for rollout gating.
- Add registry-specific rollout visibility and safe-launch controls without inventing a separate rollout control plane.
- Keep admin and tenant-admin boundaries aligned with the existing tenant scoping rules.

### 6.3 Human-readable introspection

- Provide a readable registry summary that explains identity, version, policy, rollout posture, and last decision rationale.
- Expose the same reason data used by the resolver so operators do not have to reverse engineer selection decisions from logs.

### 6.4 Authorization and visibility matrix

- System admins can manage registry policy and inspect cross-tenant registry metadata when explicitly authorized by the existing admin model.
- Tenant admins can manage registries, versions, rollout posture, and inspection only within their own tenant.
- Regular users can view only the registries and versions that are approved for their tenant/team/queue context.
- Outcome memory views should be narrower than operational policy views when possible, because memory can contain more sensitive failure detail than the registry summary itself.
- Every read path should state whether it is tenant-scoped, team-scoped, or queue-scoped so the behavior is obvious in router code and tests.

## 7. Existing Runtime Integration

### 7.1 Role-agent migration path

- Map the current role-agent contracts onto registry identities and versions through an adapter layer.
- Keep current role-monitor workflows operational while the backing data model changes.
- Preserve the existing user-facing concepts of mission, autonomy, workpack binding, and routine scheduling.

### 7.2 Delegated worker and runtime selection

- Feed registry capability profiles into delegated worker manifests and runtime router decisions.
- Keep worker manifest generation as a consumer of registry output, not as a second source of truth.

### 7.3 Workpack and queue targeting

- Make workpack-family targeting part of registry eligibility rather than freeform labels.
- Ensure runtime routers and orchestration code consult the registry before selecting an executable agent version.

## 8. Observability, Security, and Governance

### 8.1 Auditability

- Record registry identity, selected version, eligibility reason, policy bindings, and rollout posture for each resolution.
- Record promotion decisions and the previous stable pointer for every version publish event.

### 8.2 Security posture

- Enforce tenant and team boundaries in the service layer as well as in routers.
- Treat any ambiguous eligibility condition as a block, not a best-effort fallback.
- Do not grant authority by labels alone.

### 8.3 Outcome memory

- Store summarized evidence from completed runs.
- Prefer recent evidence for the same workload class only when policy explicitly allows evidence-informed selection.
- Keep memory scoped so one tenant cannot influence another tenant's resolution behavior.

### 8.4 Outcome memory safety

- Classify outcome-memory fields so sensitive operator notes, redaction markers, and failure fragments can be filtered before storage or export.
- Redact secrets, tokens, prompt fragments, and user-visible sensitive content from memory records by default.
- Keep retention explicit: summarize at longer-lived granularity, but expire or compact high-detail memory according to policy.
- Keep learning memory separate from raw execution telemetry so the registry does not become an accidental log sink.
- If a memory write fails classification or redaction checks, fail closed and keep the registry resolution path independent of that write.

## 9. Rollout, TDD, and Acceptance Criteria

### 9.1 Delivery order

1. Add schema and contracts.
2. Add registry services and resolution engine.
3. Add rollout and policy enforcement.
4. Add outcome-memory capture and promotion reviews.
5. Add admin APIs and tenant controls.
6. Switch role-agent consumers to the registry adapter path.
7. Add observability and rollout gate checks.

### 9.2 TDD discipline

- Write schema tests first for the new registry tables and enums.
- Write contract tests for eligibility and fail-closed behavior.
- Write service tests for version promotion, rollback, and memory writeback.
- Write router tests for admin authorization and tenant isolation.

### 9.3 Acceptance criteria

- A registry can be created, versioned, promoted, frozen, and rolled back.
- A resolver can explain why a version was selected or rejected.
- Role agents can resolve through the same registry model as other agent kinds.
- Outcome memory can influence selection only within policy boundaries.
- Tenant boundaries and rollout posture remain enforced end to end.

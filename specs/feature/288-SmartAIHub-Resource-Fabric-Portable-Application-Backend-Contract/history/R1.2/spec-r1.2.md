<!-- Text transcription of preserved sibling spec.docx; source SHA-256: 8f3910655dd8b6e26560f39aaca4d0a39b26dbc6861aa874bbb451ffc001cce9 -->

# SPEC-288 — SmartAIHub Resource Fabric & Portable Application Backend Contract

Revision: R1.2  |  Status: Proposed / 60-Pass Hardened  |  Scope: Cross-cutting platform capability
Purpose: Make infrastructure programmable, portable, tenant-aware, and safely operable by Orchestra/agents without replacing existing providers.

# 1. Executive Decision

SmartAIHub SHALL introduce a thin Resource Fabric above existing infrastructure. The Fabric is not a new database, storage system, queue, runtime, or Appwrite dependency. It is a stable capability contract, resource registry, policy/authority gate, provider resolver, provisioning lifecycle, evidence/audit surface, and portability layer.

Primary outcomes:

- Orchestra can discover, request, provision, configure, verify, repair, and retire authorized resources without unnecessary human intervention.
- Mini Apps target stable backend contracts instead of hard-coding Cloudflare or a single database engine.
- SmartAIHub can choose D1, PostgreSQL, R2, Vectorize, Workers, Containers, Runner, external/BYO providers, or portable local implementations according to workload and policy.
- Existing implemented systems remain authoritative; this spec wraps/adapts them rather than rewriting them.
# 2. Non-Goals / Hard Boundaries

- Do NOT install Appwrite as a mandatory runtime dependency.
- Do NOT reimplement D1, PostgreSQL, R2, Vectorize, Queues, Workers, Containers, Runner, Secrets, authentication, or the existing control plane.
- Do NOT force one tenant = one database, one Mini App = one database, or one provider for every workload.
- Do NOT bypass security, billing, destructive-action approval, tenant isolation, secret-handling, migration-safety, or production policy.
- Do NOT alter implemented Spec 224 behavior except through backward-compatible capability adapters/extensions.
# 3. Target Architecture

User / Assistant / Development Orchestra
                 │
       Capability / Resource Request
                 │
        Resource Fabric API
                 │
 ┌───────────────┼────────────────┐
 │ Contract      │ Registry       │ Policy/Authority
 │ Resolver      │ Lifecycle      │ Evidence/Audit
 └───────────────┼────────────────┘
                 │
          Provider Adapters
 ┌───────┬───────┼────────┬─────────┬──────────┐
 D1      PG      R2    Vectorize  Workers   Containers/Runner
 SQLite  S3/BYO  Local  pgvector   External   User device/BYO

# 4. Resource Contract

The canonical contract SHALL model capabilities, not vendor products. Minimum resource kinds:

- database: relational/document-like access where supported; schema/migration/transaction capability declared explicitly
- storage: object/file storage with metadata, lifecycle and signed-access capabilities
- vector: index/upsert/query/delete with declared dimensionality/filter capabilities
- compute: request/worker/container/runner execution profiles
- queue/job: durable dispatch reference to the existing Unified Job Control Plane rather than a second job system
- secret: references/leases only; plaintext secrets must not enter registry records, logs, prompts, receipts, or portable manifests
- messaging: provider-neutral outbound capability where available
- identity/access: resource ownership and authorization binding, not replacement authentication
# 5. Canonical Resource Descriptor

ResourceDescriptor
- resourceId, kind, provider, providerResourceRef
- tenantId, workspaceId, applicationId/miniAppId (nullable by scope)
- environment: dev/test/staging/prod
- capabilityManifest + limits
- lifecycleState
- ownership + authorityPolicyRef
- portabilityClass
- residency/region metadata
- cost/budget policy reference
- secretRefs (never secret values)
- schema/migration version where applicable
- provenance + createdBy actor
- evidenceReceiptRefs
- createdAt/updatedAt

# 6. Provider Resolution

Selection SHALL be policy-driven and explainable. Resolver inputs include:

- workload requirements: relational semantics, size, latency, concurrency, vector/search needs, long-running compute
- deployment target: SmartAIHub managed, portable package, customer infrastructure/BYO
- tenant policy, data residency, compliance and isolation requirements
- budget/credit ceiling and provider quotas/rate limits
- provider health/capability availability
- migration/exit requirements and portability class
Resolver output MUST include selected provider, alternatives considered, material constraints, estimated cost class, required approvals (if any), and a machine-readable reason code.

# 7. Portability Model

Mini App business logic SHALL prefer stable interfaces such as:

db.query()/db.transaction()  |  storage.put()/get()  |  vector.search()  |  jobs.submit()  |  secrets.ref()

Portability classes:

- P0 Provider-native: explicitly allowed to use provider-specific capability.
- P1 Adapter-portable: application uses Resource Fabric contract; provider can be replaced with bounded migration.
- P2 Exportable: manifest, schema/migrations, data export hooks and compatible standalone adapters are required.
- P3 Offline/local-capable: supports local SQLite/files or equivalent where the product requirement demands it.
Portable deployment packages MUST declare required capabilities, optional capabilities, provider assumptions, migration/export procedures, and unsupported degradations. They MUST NOT embed platform secrets.

# 8. Orchestra / Agent Authority

Resource Fabric SHALL expose machine-operable APIs/MCP capabilities so authorized Orchestra/agents can close infrastructure gaps autonomously.

- discover existing reusable resources before provisioning new ones
- request/provision/configure resource
- apply schema/migration through migration-safety gates
- bind resource to app/workspace/environment
- verify readiness with normalized evidence
- diagnose provider/policy/quota failures and attempt safe alternatives
- repair/reconcile drift where authority permits
- export/migrate where portability contract permits
- retire resources only under retention/destructive-action policy
A guardrail MUST return actionable blocker semantics: exact denied capability, policy source, current authority ceiling, safe alternatives, and the minimum approval/change needed. Generic 'permission denied' loops are non-conformant.

# 9. Authority & Safety Model

- Effective authority = actor authority ∩ tenant policy ∩ environment policy ∩ resource policy ∩ delegated ceiling.
- Production destructive operations, privilege escalation, secret export, irreversible data loss and material spend MUST remain explicit high-risk gates.
- Routine reversible provisioning within pre-approved budget/policy SHOULD be autonomous.
- Every mutation MUST be idempotent or carry an idempotency key and reconciliation semantics.
- Every privileged action MUST emit provenance, permission snapshot and normalized evidence receipt.
- No agent may silently expand its own permission ceiling.
# 10. Lifecycle State Machine

REQUESTED → RESOLVING → APPROVAL_REQUIRED (optional) → PROVISIONING → CONFIGURING → VERIFYING → READY
Failure branches: DEGRADED / BLOCKED_ACTIONABLE / RECONCILING / MIGRATING / RETIRING / RETIRED.

Lifecycle operations MUST be resumable and safe across retries, process restarts and duplicate delivery. Long-running work delegates execution to the existing durable job/control-plane mechanisms.

# 11. Multi-Tenant Isolation

Isolation SHALL be policy-selectable rather than hard-coded:

- shared physical resource + logical tenant isolation
- dedicated namespace/schema/index/bucket
- dedicated database/resource
- dedicated compute/runtime
- customer-owned external infrastructure
Registry and adapters MUST prevent cross-tenant identifier confusion, confused-deputy access, accidental resource reuse, and tenant-to-tenant secret or data leakage.

# 12. Cost, Quota & Resource Governance

- Estimate cost class before material provisioning when provider data permits.
- Enforce tenant/platform budgets, credits, quotas and provider rate limits.
- Prefer reuse of compatible existing resources where policy permits.
- Record allocation owner and chargeback dimensions for platform/tenant/application usage.
- Support quota-aware fallback only when semantic requirements and residency/security policies remain satisfied.
- Prevent autonomous retry storms and resource proliferation with dedupe, backoff and provisioning locks.
# 13. Integration With Existing Specs

| Spec | Relationship | Required Rule |
| --- | --- | --- |
| 224 Development Orchestrator | Implemented | Consume Resource Fabric as an optional capability surface; no rewrite. Infrastructure blockers become discover/provision/verify operations when authorized. |
| 266 Data/Evidence/Knowledge & Spatial Fabric | Planned/evolving | 266 remains canonical data/evidence/knowledge fabric. 288 supplies provider/resource lifecycle and portable backend contracts beneath/alongside it; do not duplicate catalogs. |
| 267 Unified Job Control Plane | Planned | Authoritative for durable jobs/dispatch. 288 references it; MUST NOT create a second queue/control plane. |
| 269 Primary Assistant / Multi-bot | Planned | Assistant delegates resource operations through authority-scoped capabilities. |
| 272 Secrets | Planned | Authoritative secret storage/registry policy. 288 stores only secret references and consumes its interfaces. |
| 277 Task Control Experience | Planned | Surface resource provisioning/migration/blocker states and evidence as task activity. |
| 279 Agent→Orchestrator Control Protocol | Planned | Resource operations become capability-addressable operations with environment identity, permission ceilings and portable context. |

# 14. API / MCP Capability Surface (Normative Minimum)

- resource.discover(requirements, scope)
- resource.plan(requirements, scope) → provider plan + alternatives + approvals
- resource.provision(plan, idempotencyKey)
- resource.bind(resourceId, target)
- resource.verify(resourceId) → evidence receipt
- resource.reconcile(resourceId)
- resource.export(resourceId, portabilityTarget)
- resource.migrate(resourceId, targetProvider, plan)
- resource.retire(resourceId, retentionPolicy)
- resource.explain_blocker(operationId)
Provider-specific escape hatches MAY exist but MUST be explicit, capability-declared and marked with portability impact.

# 15. Failure Semantics

Failures MUST be classified, not flattened into generic errors:

- POLICY_DENIED / AUTHORITY_CEILING
- APPROVAL_REQUIRED
- BUDGET_OR_QUOTA
- PROVIDER_UNAVAILABLE / RATE_LIMITED
- CAPABILITY_UNSUPPORTED
- MIGRATION_UNSAFE / DATA_INTEGRITY_RISK
- SECRET_OR_CONFIGURATION_MISSING
- RESOURCE_CONFLICT / DRIFT
- DEPENDENCY_NOT_READY
- TRANSIENT_RETRYABLE / TERMINAL
Each blocker MUST identify whether Orchestra can self-remediate, select an equivalent provider, wait/retry, request approval, or must stop due to a true non-delegable blocker.

# 16. Migration / Adoption Strategy

- Phase 0 — Inventory existing resource creation paths and establish canonical resource kinds; no behavior change.
- Phase 1 — Read-only registry/discovery over existing D1/PostgreSQL/R2/Vectorize/compute resources.
- Phase 2 — Add adapters and verification/evidence receipts for existing providers.
- Phase 3 — Enable pre-approved dev/test provisioning through Orchestra with strict budgets and idempotency.
- Phase 4 — Introduce Mini App portable contracts for new work; legacy apps continue unchanged.
- Phase 5 — Add export/BYO adapters (e.g., PostgreSQL/SQLite/S3-compatible) where product demand exists.
- Phase 6 — Controlled production provisioning, migration and reconciliation after security/migration gates pass.
# 17. Compatibility Rules

- No big-bang migration.
- Existing provider-native code remains supported.
- New portable applications SHOULD use Resource Fabric contracts unless provider-native functionality is materially required.
- Adapters MUST preserve existing source-of-truth ownership; registry metadata cannot silently become a second source of truth for domain data.
- If an existing implemented subsystem already owns a capability, 288 integrates through an adapter rather than replacing it.
# 18. Security & Compliance Gates

- tenant isolation and authorization tests
- secret non-disclosure tests across logs/prompts/receipts/export packages
- migration rollback/data-integrity tests
- idempotency/replay/race tests
- SSRF/provider endpoint allowlist and credential-scope tests for BYO providers
- audit/provenance completeness
- PDPA/data residency/retention policy enforcement where applicable
- production destructive-operation and spend escalation gates
# 19. Acceptance Criteria

- A Mini App can request database/storage/vector capabilities without importing a provider SDK in business logic.
- At least D1 + PostgreSQL database adapters, R2 storage adapter, Vectorize adapter, and existing compute/job adapters demonstrate the contract.
- The same sample Mini App can switch between two database providers through configuration/manifest with no business-logic rewrite.
- Orchestra can discover and reuse an existing compatible resource before creating a duplicate.
- Authorized dev/test resource provisioning completes end-to-end and emits evidence/provenance.
- A denied operation produces an actionable blocker with authority ceiling and remediation path.
- Retrying a provisioning request cannot create uncontrolled duplicate resources.
- Cross-tenant access attempts fail at registry, policy and provider-binding layers.
- Portable export contains capability manifest + schema/migration/export metadata but no plaintext secrets.
- Resource events are observable by Task Control without introducing a parallel job control plane.
- Legacy applications and implemented Spec 224 flows continue to pass regression tests.
- Provider outage/quota tests demonstrate safe fallback or explicit actionable blocking without semantic downgrade.
# 20. QA Requirement

Implementation SHALL execute at least 50 distinct adversarial verification passes. Passes MUST cover independent failure domains rather than repeating the same review. Any material gap found SHALL be corrected immediately and every affected downstream pass rerun. The implementation evidence bundle SHALL record pass ID, domain, finding, correction, tests, residual risk and evidence receipt.

# 21. Definition of Done

- Contracts and provider capability manifests are versioned and documented.
- Registry, resolver, policy gate, adapters and lifecycle reconciliation are operational.
- Orchestra integration demonstrates autonomous safe closure of a real infrastructure dependency.
- Mini App portability proof demonstrates provider swap/export path.
- Security, migration, authorization, secret and multi-tenant gates pass.
- Task/evidence observability is wired without duplicating the control plane.
- Rollback/disable path exists for each adapter and legacy behavior remains available.
- No unresolved critical/high-risk blocker remains; medium residual risks are explicitly accepted, owned and time-bounded.
# 22. Architectural Principle

Stable capability contract; replaceable provider; explicit authority; evidence-backed lifecycle.

SmartAIHub should not become another Appwrite implementation. It should use the useful architectural lesson: make backend resources programmable and agent-operable while preserving provider choice, portability, tenant isolation, and the existing specialized infrastructure that SmartAIHub already owns.

# 23. Control Plane / Data Plane Boundary

- Resource Fabric is a control and capability plane. High-volume application data MUST NOT hairpin through a central Fabric service unless the specific adapter requires it.
- Provisioning, policy, registry, lifecycle and evidence use the control plane; runtime applications SHOULD receive scoped provider bindings/clients or a local adapter path for the data plane.
- Control-plane outage MUST NOT automatically make already-bound application data paths unavailable. Define cached binding TTL, revocation semantics and fail-closed rules per risk class.
- Registry availability MUST NOT become an undocumented single point of failure for normal application reads/writes.
# 24. Capability Manifest, Versioning & Negotiation

- Every provider adapter MUST publish a versioned capability manifest: operations, limits, consistency, transaction scope, indexing, query semantics, isolation, region, backup/restore, export, encryption and portability constraints.
- Contracts MUST use semantic versioning or an equivalent compatibility scheme with minimum/maximum supported versions and explicit deprecation windows.
- Binding MUST negotiate required vs optional capabilities. Missing required semantics MUST fail before deployment; optional capability loss MUST be surfaced as an explicit degradation, never silently emulated with weaker correctness.
- Provider escape hatches MUST declare lock-in impact and prevent a P1/P2 portability claim unless an equivalent migration strategy exists.
# 25. Semantic Portability & Correctness

- Provider portability means semantic compatibility, not merely identical method names.
- Database adapters MUST declare transaction boundaries, isolation levels, foreign-key behavior, uniqueness, null semantics, ordering/collation, pagination stability, timestamp precision and consistency model.
- Storage adapters MUST declare overwrite atomicity, conditional writes, versioning, multipart limits, checksum guarantees and signed-URL semantics.
- Vector adapters MUST declare metric, dimensions, filtering, update visibility, deletion behavior and index rebuild semantics.
- The resolver MUST reject a provider swap that weakens a required invariant unless the application explicitly accepts the degradation.
# 26. Resource Dependency Graph & Composite Provisioning

- Resources MAY depend on other resources. The registry SHALL model a dependency DAG and ownership edges.
- Composite plans MUST define ordering, compensation/rollback, partial-success handling and resumable checkpoints.
- Failure to provision a downstream resource MUST NOT leak orphaned billable resources without a recorded cleanup/reconciliation obligation.
- Circular dependencies MUST be rejected during planning.
# 27. Existing Resource Discovery, Import & Drift

- Fabric MUST support adopting/importing existing provider resources without recreating them.
- Import SHALL verify ownership, environment, tenant binding, capabilities and credentials before marking READY.
- Drift detection MUST distinguish harmless metadata drift, reconcilable configuration drift and destructive/high-risk drift.
- Authoritative ownership MUST be explicit: provider, Git/IaC, Resource Fabric or external administrator. Fabric MUST NOT fight another reconciler.
- Unknown external changes SHALL generate evidence and a reconciliation plan rather than silently overwrite production state.
# 28. Migration, Cutover & Rollback Protocol

- Every stateful migration plan MUST define source, target, schema mapping, data-copy method, verification, cutover, rollback point, retention window and ownership transition.
- Where downtime constraints require it, support staged copy + change capture/dual-write or another proven synchronization method; do not claim zero downtime by default.
- Before cutover, verify counts/checksums or domain-specific integrity invariants and application-level smoke tests.
- Dual-write MUST have an explicit conflict policy and bounded duration. Split-brain ownership is prohibited.
- After cutover, source retirement requires retention/rollback policy completion and explicit evidence.
# 29. Backup, Restore & Disaster Recovery

- Capability manifests SHALL declare backup support, RPO/RTO class, retention and restore granularity.
- Production stateful resources MUST have a policy-defined backup/restore posture before READY unless explicitly exempted.
- Restore procedures MUST be tested, not inferred from backup existence.
- DR plans MUST cover provider/region loss where required, including secrets/bindings and dependency reconstruction.
- Backup copies inherit tenant, residency, encryption, retention and deletion obligations.
# 30. BYO / External Provider Trust Boundary

- External endpoints MUST be validated against SSRF, DNS rebinding, private-network access policy and redirect abuse.
- Credentials MUST be least-privilege, scoped, rotatable and referenced through the authoritative secret system; plaintext credentials MUST never be persisted in manifests or evidence.
- Adapters SHALL support credential expiry/rotation and distinguish credential failure from provider outage.
- Outbound network policy, TLS verification, certificate errors and allowed regions/endpoints MUST be explicit.
- External webhooks/callbacks MUST authenticate origin, prevent replay and bind events to tenant/resource identity.
# 31. Adapter Supply-Chain & Execution Safety

- Provider adapters are privileged code and MUST be version-pinned, reviewed, provenance-tracked and subject to dependency/supply-chain scanning.
- Dynamic/untrusted adapter installation in production is prohibited unless sandboxed and policy-approved.
- Adapter permissions MUST be narrower than platform-wide credentials whenever provider APIs permit.
- Adapter rollout SHALL support canary/disable/rollback and must not force simultaneous migration of all bound resources.
# 32. Concurrency, Locks, Leases & Fencing

- Provision/migrate/retire operations MUST use resource-scoped coordination with lease expiry and fencing tokens or equivalent stale-writer protection.
- Idempotency keys MUST have defined scope and retention. Duplicate requests with conflicting payloads MUST be rejected.
- Reconciliation MUST tolerate worker death after provider-side success but before local settlement by re-reading provider state.
- Concurrent plans targeting the same ownership slot MUST resolve deterministically rather than create duplicate resources.
# 33. Event & Observability Contract

- Resource lifecycle events MUST have stable schema/version, eventId, operationId, resourceId, tenant scope, sequence/causality metadata, actor, state transition and evidence reference.
- Consumers MUST tolerate duplicate and out-of-order delivery. State reconstruction MUST not depend on exactly-once transport.
- Logs/traces/metrics MUST redact secrets and sensitive provider payloads and carry tenant/resource correlation without exposing cross-tenant data.
- Define SLOs for control-plane availability, provisioning latency, reconciliation backlog and failed/orphaned resource counts.
# 34. Metering, Billing & Cost Attribution

- Resource allocation and runtime usage are distinct accounting dimensions and MUST not be conflated.
- Metering records SHALL include tenant/workspace/application/provider/resource and billing period dimensions where available.
- Provider estimates are advisory until settled usage arrives; UI/API MUST distinguish estimate, reservation and actual charge.
- Fallback/migration MUST expose material cost changes before execution when policy threshold is exceeded.
- Orphan detection SHALL include billable resources that are no longer bound to an active owner.
# 35. Retention, Deletion & Right-to-Erasure

- Retire is not synonymous with immediate delete. Lifecycle MUST distinguish unbind, disable, quarantine/retention, provider delete and tombstone.
- Deletion workflows MUST account for backups, replicas, vector indexes, caches, logs and external providers according to applicable policy.
- Destructive deletion MUST verify resource identity and tenant ownership immediately before execution to prevent stale-plan deletion.
- Tombstones MUST prevent accidental automatic recreation or rebinding when deletion is intentional.
# 36. Approval, Break-Glass & Human Handoff

- Approval requests MUST be scoped to an immutable plan digest, actor, resource set, cost/risk envelope and expiry. Material plan changes invalidate approval.
- Approval timeout/cancellation MUST produce an actionable state and release temporary reservations/locks.
- Break-glass authority, if supported, MUST be time-bounded, strongly audited, narrowly scoped and never available for silent agent self-escalation.
- Human handoff MUST include blocker reason, attempted remediations, evidence, exact decision requested and safe default if no response.
# 37. Environment Identity & Promotion

- Dev/test/staging/prod identity MUST be explicit in every resource and operation; name similarity is not sufficient identity.
- Promotion SHOULD reproduce declarative requirements rather than blindly clone provider identifiers or secrets.
- Production bindings MUST not accidentally resolve to dev/test resources, and tests MUST cover environment-confusion attacks.
- Environment-specific policy may select different providers while preserving declared application semantics.
# 38. Declarative Desired State / GitOps Interop

- Fabric MAY expose declarative desired-state manifests, but MUST interoperate with existing IaC/GitOps ownership rather than creating competing reconcilers.
- Plan/apply separation is REQUIRED for material production changes; plans need deterministic digests for approval/evidence.
- Dry-run MUST identify create/update/replace/delete actions, expected downtime, portability impact and irreversible steps.
- Import/export manifests MUST omit secrets and provider-generated ephemeral identifiers unless required as references.
# 39. SDK & Developer Experience

- Generate or maintain typed client interfaces from versioned contracts where practical.
- Provider-specific errors MUST map to stable canonical errors while retaining a redacted provider diagnostic reference.
- Local development SHALL support mock/emulated adapters or safe dev providers without pretending mocks prove production semantics.
- Document escape-hatch usage and portability consequences at the call site/tooling level where feasible.
# 40. Conformance Test Kit

- Each adapter MUST pass a shared conformance suite for declared capabilities plus provider-specific tests.
- Conformance SHALL include CRUD, concurrency, idempotency, retries, auth scope, tenant isolation, consistency claims, migration/export, failure injection and cleanup.
- An adapter MUST NOT advertise a capability that its conformance evidence does not prove.
- Contract-version upgrades require regression against all supported adapters before default rollout.
# 41. 50-Pass Adversarial Review Matrix

- P01 scope/non-goals; P02 existing-system ownership; P03 control/data plane; P04 capability taxonomy; P05 contract versioning; P06 provider negotiation; P07 DB semantic parity; P08 storage semantic parity; P09 vector semantic parity; P10 compute/job boundary.
- P11 tenant isolation; P12 workspace/app scoping; P13 environment identity; P14 authority ceiling; P15 approval binding; P16 break-glass; P17 secrets; P18 BYO credentials; P19 SSRF/network trust; P20 adapter supply chain.
- P21 idempotency; P22 concurrent provisioning; P23 fencing/stale writer; P24 crash-after-provider-success; P25 dependency DAG; P26 orphan cleanup; P27 import existing; P28 drift ownership; P29 migration planning; P30 cutover/rollback.
- P31 dual-write/conflict; P32 integrity verification; P33 backup; P34 restore; P35 DR; P36 retention/delete; P37 PDPA/residency; P38 cost estimate; P39 metering/chargeback; P40 quota/rate-limit.
- P41 provider outage/fallback; P42 event ordering/dedup; P43 observability/redaction; P44 SLO/operations; P45 Task Control integration; P46 Spec 224 compatibility; P47 Spec 266/267/272 boundaries; P48 Mini App export/BYO; P49 adapter conformance; P50 final end-to-end completion/rollback evidence.
- If a correction changes assumptions tested by an earlier pass, all impacted passes MUST be rerun; “50 passes” is a minimum coverage threshold, not permission to stop with known gaps.
# 42. Expanded Acceptance Gates

- Provider swap is rejected when required transaction/consistency semantics cannot be preserved.
- Control-plane interruption does not unnecessarily break already-authorized data-plane bindings; revocation policy remains enforceable.
- Crash/retry tests prove no duplicate uncontrolled resources and correct settlement after ambiguous provider outcomes.
- Existing provider resources can be imported and drift classified without destructive reconciliation.
- A stateful migration demonstrates integrity verification, cutover and rollback path; any zero-downtime claim is evidence-backed.
- Backup restore is executed successfully for at least one production-class stateful adapter in a non-production recovery exercise.
- BYO provider tests cover SSRF, credential rotation, TLS failure, webhook replay and tenant-binding confusion.
- Adapter conformance suite prevents capability over-claiming.
- Retirement/deletion tests cover backups/replicas/tombstones and stale-plan protection.
- Approval digest/expiry tests prove a changed high-risk plan cannot reuse stale approval.
- Cost/metering evidence distinguishes estimate from actual and identifies orphaned billable resources.
- Final end-to-end scenario: Orchestra receives an app requirement, discovers/reuses or provisions resources, binds, migrates if needed, verifies, deploys, surfaces evidence, survives retry/failure injection and reaches a truthful terminal state without manual console work except genuine policy gates.
# 43. Bootstrap, Ownership & Source-of-Truth Arbitration

- Every managed resource MUST declare managementMode: FABRIC_MANAGED, EXTERNAL_IAC_MANAGED, PROVIDER_MANUAL, or OBSERVE_ONLY; exactly one system is authoritative for desired-state mutation at a time.
- Resource Fabric MUST NOT fight Terraform/GitOps/provider automation. For externally managed resources, reconciliation defaults to observe/report drift unless an explicit ownership transfer protocol succeeds.
- Ownership transfer MUST capture current provider state, expected desired state, controller identity, lease/lock handoff, plan digest, approval requirements, and rollback path.
- Bootstrap resources required for Resource Fabric itself (registry store, policy store, credentials, control-plane identity) MUST have an out-of-band recovery/bootstrap procedure so Fabric failure does not make its own recovery impossible.
- Provider-console emergency edits MUST be detected as drift and classified; Fabric MUST NOT silently overwrite an emergency change before ownership/policy evaluation.
# 44. Contract, Adapter & Provider Deprecation Lifecycle

- Contracts, capability manifests and adapters MUST use explicit semantic versions and published support windows. Breaking contract changes require a new major version.
- Provider capability removal, API retirement, region closure or pricing/limit changes MUST enter a deprecation workflow with affected-resource discovery, impact classification, migration options and deadline.
- Applications MUST be queryable by contract/provider dependency so operators can answer which tenants/apps/resources are affected before deprecation.
- No deprecated adapter/provider may be selected for new resources after its deny-new date unless an explicit exception exists; existing resources follow a separately declared migration deadline.
- Deprecation migration MUST preserve the same semantic portability and approval/integrity gates as an operator-initiated migration.
# 45. Adapter Release, Canary, Kill Switch & Rollback

- Adapter releases MUST be independently versioned from the Fabric core and pinned per resource/operation where reproducibility requires it.
- New adapter versions MUST pass conformance, security and migration regression suites before promotion, then support staged/canary rollout by environment/tenant/resource cohort.
- Fabric MUST provide a provider/adapter kill switch that can stop new mutations/provisioning without unnecessarily breaking safe reads or already-running data-plane traffic.
- Rollback MUST account for provider-side mutations already committed by the newer adapter; binary rollback alone is not considered state rollback.
- Automatic promotion MUST stop on defined error, orphan, integrity, latency or policy-violation thresholds.
# 46. Regional Placement, Failure Domains & Data Gravity

- Placement policy MUST distinguish legal residency, preferred region, required region, provider failure domain, latency locality and data-gravity constraints.
- Resolver MUST NOT treat multi-region labels as proof of independent failure domains; provider-specific topology claims require capability evidence.
- Cross-region migration/replication MUST expose egress cost, consistency/RPO/RTO impact, encryption path and residency implications before execution.
- Failover targets MUST be pre-qualified for required semantics and authority. Emergency failover MUST not silently cross prohibited residency or tenant boundaries.
- Regional recovery tests MUST validate DNS/binding/cache/session implications where those layers affect application correctness.
# 47. Schema Evolution & Compatibility Window

- Database/resource schema changes MUST declare backward/forward compatibility expectations and application version dependencies.
- For rolling deployments, expand/contract migration SHOULD be the default when old and new application versions overlap; destructive contract steps require evidence that old readers/writers are drained.
- Schema migration state MUST be independently observable from application deployment state and must not be inferred only from code version.
- Migration locks/fencing MUST prevent two deploy sessions from applying incompatible schema transitions concurrently.
- Rollback plans MUST distinguish application rollback from schema rollback; irreversible migrations require forward-recovery strategy and explicit gate.
# 48. Test Doubles, Ephemeral Environments & Production-Parity Claims

- Fabric SHALL support ephemeral test resources and deterministic cleanup policies for CI/UAT without permitting unbounded resource leakage.
- Mock/local adapters MUST advertise reduced capability/evidence level; passing mock tests MUST NOT be represented as proof of provider semantics.
- Production-parity tests MUST run against real provider classes for capabilities where consistency, permissions, migrations, quotas or network behavior are material.
- Test resources MUST be tenant/environment tagged, budget capped and protected from accidental binding into production.
- Failure-injection fixtures SHOULD cover throttling, partial success, stale credentials, delayed events, provider timeout and ambiguous completion.
# 49. Operator UX, Explainability & Safe Manual Recovery

- Task Control/operator surfaces MUST show desired state, observed state, controller/owner, provider, environment, current operation, blocker, risk/cost impact and evidence freshness without requiring provider-console archaeology.
- Every recommended remediation MUST distinguish safe automatic action, approval-required action and manual-only action, with consequences and rollback information.
- Operators MUST be able to pause reconciliation, quarantine a resource, force re-observation and attach an incident/change reference without corrupting lifecycle history.
- Manual recovery instructions MUST use stable resource identities rather than display names and MUST include a post-recovery reconcile/verify step.
- UI MUST distinguish READY from READY_WITH_WARNINGS/DEGRADED and MUST NOT convert missing evidence into a green success state.
# 50. Handoff, Stage & Cross-Session Continuity

- Resource operations that outlive an agent/session MUST serialize a standard handoff containing operationId, immutable plan digest, resource/dependency identities, lifecycle state, authority snapshot reference, approvals, locks/leases, evidence, blockers and next safe action.
- Handoff MUST reference the canonical DevelopmentHandoffManifest/stage mechanism used by SmartAIHub rather than introduce a Resource-Fabric-only competing handoff format; extensions SHALL be namespaced/versioned.
- Resuming sessions MUST revalidate authority, plan freshness, provider observed state, lease/fencing state and approval validity before mutation.
- A handoff is not completion evidence. Terminal completion still requires provider verification and normalized evidence receipts.
- Cross-session notifications SHOULD identify whether work can resume automatically or requires a genuine human decision.
# 51. Registry Federation & Canonical Catalog Boundary

- Resource Fabric MUST reuse or federate with the canonical capability/resource/catalog mechanisms established by the platform; it MUST NOT create an isolated second discovery universe.
- ResourceDescriptor identity and Capability Manifest identity MUST have explicit mapping rules to existing capability registry entries and Spec 266 catalog/evidence identifiers where applicable.
- Discovery ranking may use catalog/vector search, but semantic search results are candidates only; authorization, environment identity and observed provider state remain authoritative checks.
- Index/vector/catalog lag MUST never authorize a mutation or prove resource existence. Provider/registry authoritative reads are required before destructive or binding actions.
- Duplicate detection MUST work across aliases/renames and imported resources using stable provider identifiers and ownership scope.
# 52. Implementation Sequencing & Feature Flags

- Initial rollout MUST be additive and feature-flagged by environment, tenant and capability; default-off is REQUIRED for production mutation until gates are certified.
- Read-only discovery/import MUST precede autonomous mutation. Dev/test provisioning MUST precede production provisioning. Stateful migration MUST be gated separately from fresh provisioning.
- Each provider adapter requires an explicit enable/disable state and supported-operation matrix so partial implementations cannot accidentally receive unsupported traffic.
- Rollback/disable of Resource Fabric MUST leave existing application bindings usable wherever technically possible and must not orphan provider resources.
- Implementation milestones SHALL produce evidence sufficient to decide promotion; calendar completion or code merge alone is not a promotion criterion.
# 53. Additional 10-Pass Implementation-Readiness Review (P51-P60)

- P51 bootstrap/self-recovery and circular dependency; P52 controller ownership/IaC arbitration; P53 contract/provider deprecation; P54 adapter canary/kill-switch/rollback; P55 regional placement/failure domains.
- P56 schema evolution/rolling compatibility; P57 test doubles/ephemeral resource leakage; P58 operator UX/manual recovery truthfulness; P59 standard handoff/cross-session resume; P60 canonical registry federation/feature-flagged rollout.
- These passes are additive to P01-P50. R1.2 therefore records a minimum 60-domain adversarial review baseline. Any correction that changes prior assumptions MUST trigger targeted reruns of affected passes.
# 54. R1.2 Additional Acceptance Gates

- A resource cannot have two active desired-state controllers; ownership transfer is explicit, auditable and reversible where feasible.
- Fabric bootstrap/recovery can be performed when the normal Fabric control plane is unavailable.
- Deprecated provider/adapter dependencies can be enumerated per tenant/application and blocked from new allocation after policy deadline.
- Adapter canary failure triggers promotion stop/kill switch without turning already-safe data-plane reads into an avoidable outage.
- A rolling app + schema migration demonstrates expand/contract compatibility and rejects unsafe concurrent migration.
- Mock-adapter success is visibly distinguished from real-provider conformance evidence.
- Operator UI exposes observed-vs-desired drift, controller ownership and evidence freshness and supports pause/quarantine/reobserve.
- A long-running resource operation can hand off across sessions and resume only after authority/approval/provider-state revalidation.
- Catalog/vector discovery cannot authorize destructive action from stale indexed data.
- Production mutation can be disabled per adapter/capability/tenant without deleting or corrupting existing resources.

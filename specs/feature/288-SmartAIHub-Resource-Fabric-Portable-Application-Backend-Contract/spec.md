# SPEC-288 — SmartAIHub Resource Fabric & Portable Application Backend Contract

**Revision:** R1.4  
**Status:** Proposed / 100-Pass Hardened  
**Scope:** Cross-cutting platform capability

Purpose: Make infrastructure and reusable application resources programmable, portable, tenant-aware, agent-operable, temporally correct, auditable, and safely composable without replacing existing providers or forcing a universal ERP schema.

# 1. Executive Decision

SmartAIHub SHALL maintain a two-layer Resource Fabric. The existing Infrastructure Resource Layer remains a thin control/capability plane above databases, storage, vector, compute, queues, secrets and external providers. R1.3 added an Application Resource Composition Layer above those backend bindings so Mini Apps can reuse stable semantic resource types, relationships, lifecycle rules, actions, events, policy hooks and portability metadata. R1.4 hardens that application layer for historical truth, deterministic commercial calculation, scarce-resource reservation, derived projections, external integration replay safety, data governance, consistency boundaries, portable identity/serialization, ruleset provenance, operational integrity and marketplace package trust. Neither layer is a new mandatory database, ERP, POS engine, queue, runtime, or Appwrite dependency; both are contract and orchestration layers that preserve existing sources of truth.

Primary outcomes:

- Orchestra can discover, request, provision, configure, verify, repair, and retire authorized resources without unnecessary human intervention.

- Mini Apps target stable backend contracts instead of hard-coding Cloudflare or a single database engine.

- SmartAIHub can choose D1, PostgreSQL, R2, Vectorize, Workers, Containers, Runner, external/BYO providers, or portable local implementations according to workload and policy.

- Existing implemented systems remain authoritative; this spec wraps/adapts them rather than rewriting them.

- Mini Apps can compose reusable application resources such as Party, Product/Service/Offering, Order, Payment, Asset, Appointment, Job, Subscription, Entitlement and Consumption instead of rebuilding equivalent backend logic per app.

- UI, Agent/MCP/WebMCP and workflow surfaces consume the same versioned application-resource semantics while business invariants remain enforced by server-side capabilities rather than generated UI or direct database writes.

- Vertical systems such as retail POS, restaurant, clinic, repair, fitness, SaaS and future Mini Apps are expressed as installable profile/package compositions over a small stable core, not as hard-coded platform domains.

# 2. Non-Goals / Hard Boundaries

- Do NOT install Appwrite as a mandatory runtime dependency.

- Do NOT reimplement D1, PostgreSQL, R2, Vectorize, Queues, Workers, Containers, Runner, Secrets, authentication, or the existing control plane.

- Do NOT force one tenant = one database, one Mini App = one database, or one provider for every workload.

- Do NOT bypass security, billing, destructive-action approval, tenant isolation, secret-handling, migration-safety, or production policy.

- Do NOT alter implemented Spec 224 behavior except through backward-compatible capability adapters/extensions.

- Do NOT turn SPEC-288 into a universal ERP, accounting, POS, clinic, pharmacy, HR or industry ontology. Domain-specific models belong in versioned vertical profiles/packages outside the kernel.

- Do NOT require every application record to be copied into the Resource Fabric control-plane registry. Type/contracts and bindings are control-plane metadata; high-volume domain instances remain in application data stores.

- Do NOT mandate one physical table/collection schema for canonical application resources. Logical semantics SHALL be portable across valid storage mappings.

- Do NOT allow UI generators, agents or external integrations to bypass declared business actions/invariants through arbitrary direct writes merely because the underlying database is reachable.

# 3. Target Architecture

User / Assistant / Agent / Generated UI / Mini App  
│  
Intent / Resource Action / Query  
│  
Application Resource Composition Layer  
┌───────────────┼────────────────────────────┐  
│ Type/Profile │ Relationships/Lifecycle │  
│ Actions │ Events/Policy/UI Semantics │  
│ Vertical Pack │ Portability/Export │  
└───────────────┼────────────────────────────┘  
│ capability + storage binding  
Infrastructure Resource Fabric  
┌───────────────┼────────────────────────────┐  
│ Contract │ Registry / Resolver │  
│ Lifecycle │ Policy / Evidence / Audit │  
└───────────────┼────────────────────────────┘  
│  
Provider Adapters / Data Plane  
D1 \| PostgreSQL \| SQLite \| R2/S3 \| Vectorize \| Workers \| Containers \| Runner \| BYO  
  
High-volume application reads/writes remain on scoped data-plane bindings; neither Fabric layer becomes a mandatory hairpin.

# 4. Infrastructure Resource Contract

The canonical contract SHALL model capabilities, not vendor products. Minimum resource kinds:

- database: relational/document-like access where supported; schema/migration/transaction capability declared explicitly

- storage: object/file storage with metadata, lifecycle and signed-access capabilities

- vector: index/upsert/query/delete with declared dimensionality/filter capabilities

- compute: request/worker/container/runner execution profiles

- queue/job: durable dispatch reference to the existing Unified Job Control Plane rather than a second job system

- secret: references/leases only; plaintext secrets must not enter registry records, logs, prompts, receipts, or portable manifests

- messaging: provider-neutral outbound capability where available

- identity/access: resource ownership and authorization binding, not replacement authentication

# 5. Canonical Infrastructure Resource Descriptor

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

db.query()/db.transaction() \| storage.put()/get() \| vector.search() \| jobs.submit() \| secrets.ref()

Portability classes:

- P0 Provider-native: explicitly allowed to use provider-specific capability.

- P1 Adapter-portable: application uses Resource Fabric contract; provider can be replaced with bounded migration.

- P2 Exportable: manifest, schema/migrations, data export hooks and compatible standalone adapters are required.

- P3 Offline/local-capable: supports local SQLite/files or equivalent where the product requirement demands it.

Portable deployment packages MUST declare required capabilities, optional capabilities, provider assumptions, migration/export procedures, and unsupported degradations. They MUST NOT embed platform secrets.

- Application-level portability SHALL additionally include resource type/profile versions, relationship semantics, lifecycle/invariant declarations, action contracts, event schemas, vertical package dependencies, storage mapping/migrations and export/import hooks.

- Portability claims are invalid if a Mini App can export raw rows but cannot reconstruct required application semantics, identifiers, relationships or entitlements on the target runtime.

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

- discover application resource types/profiles and their declared actions without loading every domain tool into context

- invoke application actions through authority-scoped capability contracts; direct data-plane mutation by an agent is not an equivalent substitute for a domain action

- request vertical package composition, binding and conformance verification when creating or extending a Mini App

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

| Spec                                                                         | Relationship     | Required Rule                                                                                                                                                                                                                                                                                                            |
|------------------------------------------------------------------------------|------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 224 Development Orchestrator                                                 | Implemented      | Consume Resource Fabric as an optional capability surface; no rewrite. Infrastructure blockers become discover/provision/verify operations when authorized.                                                                                                                                                              |
| 266 Data/Evidence/Knowledge & Spatial Fabric                                 | Planned/evolving | 266 remains canonical data/evidence/knowledge/spatial fabric. 288 owns backend resource lifecycle plus operational application-resource contracts. 266 may index/derive/search 288 resources but MUST NOT become the transactional source of truth for them, and 288 MUST NOT duplicate 266 evidence/knowledge catalogs. |
| 267 Unified Job Control Plane                                                | Planned          | Authoritative for durable jobs/dispatch. 288 references it; MUST NOT create a second queue/control plane.                                                                                                                                                                                                                |
| 269 Primary Assistant / Multi-bot                                            | Planned          | Assistant delegates resource operations through authority-scoped capabilities.                                                                                                                                                                                                                                           |
| 272 Secrets                                                                  | Planned          | Authoritative secret storage/registry policy. 288 stores only secret references and consumes its interfaces.                                                                                                                                                                                                             |
| 277 Task Control Experience                                                  | Planned          | Surface resource provisioning/migration/blocker states and evidence as task activity.                                                                                                                                                                                                                                    |
| 279 Agent→Orchestrator Control Protocol                                      | Planned          | Infrastructure and application-resource operations become capability-addressable through environment identity, permission ceilings and portable context. 279 routes/delegates commands; 288 defines resource semantics/actions.                                                                                          |
| 287 Unified UI Governance / Rendering Conformance / Mini App Design Contract | Planned          | 287 is authoritative for rendering/design conformance. 288 supplies semantic field/relationship/action metadata and UI hints only; UI metadata MUST NOT become a second business-rule engine.                                                                                                                            |

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

Application-resource operations use the separate appresource.\* namespace defined in Section 66 so infrastructure provisioning and domain-record actions cannot be confused.

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

1.  Phase 0 — Inventory existing resource creation paths and establish canonical resource kinds; no behavior change.

2.  Phase 1 — Read-only registry/discovery over existing D1/PostgreSQL/R2/Vectorize/compute resources.

3.  Phase 2 — Add adapters and verification/evidence receipts for existing providers.

4.  Phase 3 — Enable pre-approved dev/test provisioning through Orchestra with strict budgets and idempotency.

5.  Phase 4 — Introduce Mini App portable contracts for new work; legacy apps continue unchanged.

6.  Phase 5 — Add export/BYO adapters (e.g., PostgreSQL/SQLite/S3-compatible) where product demand exists.

7.  Phase 6 — Controlled production provisioning, migration and reconciliation after security/migration gates pass.

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

8.  A Mini App can request database/storage/vector capabilities without importing a provider SDK in business logic.

9.  At least D1 + PostgreSQL database adapters, R2 storage adapter, Vectorize adapter, and existing compute/job adapters demonstrate the contract.

10. The same sample Mini App can switch between two database providers through configuration/manifest with no business-logic rewrite.

11. Orchestra can discover and reuse an existing compatible resource before creating a duplicate.

12. Authorized dev/test resource provisioning completes end-to-end and emits evidence/provenance.

13. A denied operation produces an actionable blocker with authority ceiling and remediation path.

14. Retrying a provisioning request cannot create uncontrolled duplicate resources.

15. Cross-tenant access attempts fail at registry, policy and provider-binding layers.

16. Portable export contains capability manifest + schema/migration/export metadata but no plaintext secrets.

17. Resource events are observable by Task Control without introducing a parallel job control plane.

18. Legacy applications and implemented Spec 224 flows continue to pass regression tests.

19. Provider outage/quota tests demonstrate safe fallback or explicit actionable blocking without semantic downgrade.

# 20. QA Requirement

Implementation SHALL execute at least 80 distinct adversarial verification passes. P01-P60 preserve the infrastructure and implementation-readiness baseline; P61-P80 add application-resource composition, vertical-package, POS-reference, offline/portability, UI/agent boundary and transactional invariant coverage. Passes MUST cover independent failure domains rather than repeating the same review. Any material gap found SHALL be corrected immediately and every affected downstream pass rerun. The implementation evidence bundle SHALL record pass ID, domain, finding, correction, tests, residual risk and evidence receipt.

# 21. Definition of Done

- Contracts and provider capability manifests are versioned and documented.

- Registry, resolver, policy gate, adapters and lifecycle reconciliation are operational.

- Orchestra integration demonstrates autonomous safe closure of a real infrastructure dependency.

- Mini App portability proof demonstrates provider swap/export path.

- Security, migration, authorization, secret and multi-tenant gates pass.

- Task/evidence observability is wired without duplicating the control plane.

- Rollback/disable path exists for each adapter and legacy behavior remains available.

- No unresolved critical/high-risk blocker remains; medium residual risks are explicitly accepted, owned and time-bounded.

- Application resource contracts/profile registry and at least one reusable vertical package are versioned and documented without centralizing all application records in the control plane.

- A POS reference composition proves shared Product/Offering/Order/Payment/Inventory capabilities, while POS-specific resources remain external profiles and can be removed without changing the kernel.

- The same application-resource action contract is consumable by governed UI and authorized Agent/MCP execution with consistent policy, idempotency, audit and evidence.

# 22. Architectural Principle

Stable application semantics; stable backend capability contract; replaceable provider; explicit authority; evidence-backed lifecycle; domain extension without kernel pollution.

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

# 55. R1.3 Scope Extension — Application Resource Composition Layer

R1.3 extends SPEC-288 upward from portable infrastructure bindings into reusable application semantics. The Application Resource Composition Layer SHALL define resource types/profiles, relationships, lifecycles, actions, events, policy hooks, UI semantics, portability metadata and vertical package composition. It is not a central operational database and MUST preserve the control-plane/data-plane boundary established by Sections 23 and 64.

- Infrastructure resources answer “where/how is capability provided?”; application resources answer “what business/application concept and operation does the Mini App expose?”.

- A Mini App MAY use only infrastructure contracts, only selected application profiles, or a full vertical package. Adoption is additive and feature-flagged.

- The same application semantics MAY bind to different physical schemas/providers if the required invariants and capability semantics are preserved.

- Existing apps remain authoritative until explicitly adopted; no background migration of legacy domain data is implied by enabling R1.3.

# 56. Application Resource Type System

The registry SHALL distinguish type-level control-plane metadata from instance-level data-plane records. ResourceTypeDescriptor and ResourceProfileDescriptor are registry objects; normal application instances remain in the bound database/storage unless a specific capability requires otherwise.

ResourceTypeDescriptor  
- typeId + semanticVersion  
- canonicalBaseType / profileRefs  
- schemaRef + validation/invariant refs  
- relationship definitions  
- lifecycle/state-machine ref  
- action/capability definitions  
- event schema refs  
- policy/data-classification refs  
- uiSemanticsRef (non-authoritative presentation hints)  
- storageBinding requirements  
- portability/export/import contract  
- deprecation/migration metadata  
- provenance/evidence refs

- Resource instance identity MUST be stable within its declared tenant/workspace/application scope and MUST NOT depend on a mutable display name.

- Type/profile identifiers are namespaced and versioned to prevent two Mini Apps from silently assigning different meanings to the same symbolic name.

- Schema validation alone is insufficient for business correctness; invariants and declared actions remain authoritative.

# 57. Canonical Kernel Primitives & Reusable Profiles

The kernel SHALL remain intentionally small. The platform SHOULD maintain a curated set of broadly reusable profiles while allowing unlimited app-specific extensions. The goal is reuse, not a universal ontology.

- Identity/party: Party, PersonProfile, OrganizationProfile, ContactPoint and actor/ownership references.

- Place/resource: Location, Asset and Attachment/Document references.

- Catalog/offer: CatalogItem, ProductProfile, ServiceProfile, Offering and PackageProfile.

- Commercial/transactional: Quote/Proposal profile where needed, Order, Invoice/BillingDocument profile, Payment and Refund. Full accounting ledger semantics are out of core unless separately specified.

- Operations: WorkItem/Job, Appointment, Schedule/QueueEntry and fulfillment/assignment relations.

- Inventory: InventoryItem/StockPosition and InventoryAdjustment semantics; warehouse-specific optimization remains a vertical extension.

- Recurring access: Subscription, Entitlement and Consumption/Usage records.

- Generic Record/Form MAY exist as fallback primitives but SHALL NOT be used to avoid defining important domain invariants.

- Shared semantic value types SHALL define Money (currency, scale and rounding mode), Quantity/Unit, Date/Time/Duration with timezone rules, identifiers and normalized text/reference semantics so vertical packages do not invent incompatible representations for common values.

A canonical profile MAY be optional. For example Customer can be represented as a Party with a Customer profile rather than forcing every Mini App to persist a separate customer table.

# 58. Profile Extension & Composition Model

- Vertical/resource profiles SHALL extend canonical semantics through namespaced fields, constraints, relationships, actions and events without mutating the base definition globally.

- Extension is a logical contract and MUST NOT require database table inheritance or a particular ORM inheritance strategy.

- Profiles MAY compose multiple concerns when compatibility is declared; conflicting constraints/actions MUST fail installation or require an explicit adapter/mapping.

- Breaking profile changes require a new major version plus migration/compatibility plan. Additive optional fields/actions MAY use compatible minor versions.

- Example profiles such as DrugProduct, MenuItem, RepairJob or MedicalAppointment belong to vertical/domain packages, not the canonical kernel.

- Tenant/app custom fields SHALL use namespaced extension slots with declared type, sensitivity, indexability, default/migration behavior and limits; custom fields MUST NOT silently relax base invariants or mutate a shared canonical/profile schema for other tenants.

# 59. Relationships, Ownership, Sharing & Identity

- Relationships SHALL be typed and versioned with source/target type constraints, cardinality, ownership strength, optionality, cascade/retention semantics and cross-scope policy.

- Relationship identity MUST use stable resource IDs; search/vector aliases are discovery aids only and cannot authorize mutation.

- Resources MAY be app-private, workspace-shared or tenant-shared. Cross-app reuse requires explicit sharing/policy and MUST NOT imply unrestricted database access.

- Deletion/retirement MUST evaluate strong relationships, legal retention and downstream entitlement/payment implications before cascade.

- Duplicate/merge behavior for Party/Catalog-like resources, if supported, SHALL preserve aliases, provenance and referential integrity and SHALL require domain-specific conflict rules.

# 60. Lifecycle, Invariants & Multi-Resource Correctness

Each application resource type SHALL declare its own state machine or explicitly state that it is stateless. A single universal lifecycle MUST NOT be imposed on all domain records.

- Transitions SHALL define preconditions, authority, invariant checks, emitted events, side effects and terminal/reversible characteristics.

- Multi-resource operations such as order + payment + inventory adjustment MUST declare an atomic transaction requirement or an explicit saga/compensation strategy when a single transaction is unavailable.

- Exactly-once transport MUST NOT be assumed. Business outcomes such as charge, entitlement consumption and stock decrement require idempotency/settlement semantics.

- Ambiguous external outcomes (for example payment provider timeout after capture) MUST reconcile observed external state before retrying a side effect.

- Invariant failure MUST surface a stable machine-readable reason rather than silently coercing data into a valid-looking state.

# 61. Application Action / Capability Contract

Business operations SHALL be first-class actions rather than arbitrary CRUD whenever an invariant, authorization decision, external side effect or lifecycle transition is involved.

ApplicationActionDescriptor  
- actionId + version  
- targetType / collection-or-instance scope  
- input/output schema  
- preconditions + invariant refs  
- required authority / approval class  
- idempotency scope + retention  
- transaction/consistency requirement  
- side-effect + compensation declaration  
- event/evidence outputs  
- risk/cost classification  
- expectedVersion/etag or concurrency contract where mutation races are material  
- agentExposure + uiExposure policy

- Generic create/update MAY exist for low-risk records but SHALL NOT replace semantic actions such as capturePayment, refundPayment, fulfillOrder, consumeEntitlement or adjustInventory.

- Action contracts SHALL be callable consistently from first-party UI, workflow, Agent/MCP/WebMCP and external API surfaces after the same policy evaluation.

- Action compatibility and deprecation follow the same versioned-contract discipline as provider capabilities.

- Mutations that can race MUST define optimistic/pessimistic concurrency semantics. A stale expectedVersion/ETag MUST fail with a stable conflict reason rather than overwrite a newer accepted state.

# 62. Application Event & Change Propagation Contract

- Application events SHALL carry eventId, tenant/scope, resource type/id, action/transition, actor, causality/correlation, schema version, occurredAt and redacted evidence/provenance references.

- Consumers MUST tolerate duplicate and out-of-order delivery; event transport is not proof of exactly-once business execution.

- Where correctness requires durable event emission with a database mutation, adapters SHOULD use a transactional outbox or equivalent atomic handoff pattern.

- Event payloads SHOULD minimize PII/secrets and SHOULD reference large/sensitive data through authorized handles rather than duplicating full records.

- Spec 267 remains authoritative for durable job/control-plane dispatch; application events MUST NOT create a competing background-job system.

# 63. Offering → Entitlement → Consumption Model

SPEC-288 SHALL standardize the reusable semantic chain needed by AI credits, subscriptions, packages, service sessions, API quotas, memberships and many vertical applications.

Catalog Item / Product / Service  
│  
Offering  
│ purchase/grant  
Entitlement  
│ consume/reserve/release  
Consumption  
│  
Metering / Evidence

- Offering defines what can be acquired and under which commercial/eligibility terms; it does not itself prove payment.

- Entitlement represents granted rights/limits with scope, quantity/unit, validity window, owner/beneficiary, source and revocation policy.

- Consumption records reservation/usage/reversal with idempotency and provenance; concurrent consumption MUST prevent unauthorized overuse.

- Payment/billing and entitlement settlement MUST be explicitly linked but decoupled enough to support free grants, sponsor pools, trials, credits and external billing.

- Revenue sharing/accounting allocation MAY consume these records but is outside the minimum kernel unless another spec declares authoritative financial semantics.

# 64. Application Storage Binding & Data-Plane Boundary

- Application resource contracts map to storage through versioned StorageBinding descriptors; they MUST NOT require one table per type, one database per Mini App or one universal schema.

- A binding declares provider/resourceRef, physical mapping strategy, migration version, transaction/consistency requirements, indexes/query capabilities and export/import adapter.

- High-volume list/get/mutate operations SHOULD execute through scoped data-plane adapters/clients. The control-plane registry stores contracts/bindings/evidence, not every operational row.

- Shared physical storage is permitted only with proven tenant/app isolation. Dedicated storage remains available when policy, residency, scale or portability requires it.

- Changing physical mapping/provider MUST pass semantic portability and invariant tests before promotion.

- Queryable resource profiles MUST declare filter operators, sort keys, stable pagination/cursor semantics, projection rules, index requirements and read-consistency expectations; adapters MUST reject unsupported query semantics rather than silently returning weaker or unstable results.

# 65. UI Semantic Contract — Boundary With SPEC-287

- SPEC-288 MAY expose semantic presentation metadata such as field role, label key, data type, unit, validation intent, sensitivity, list/detail/search relevance, relationship navigation and action intent.

- SPEC-287 remains authoritative for layout, component selection, accessibility, responsive behavior, visual tokens, rendering conformance and Mini App design contracts.

- UI metadata MUST NOT encode a parallel authorization or business-rule engine. UI hiding/disabling is advisory UX; server-side policy/action validation remains mandatory.

- Generated UI SHALL use stable resource/action IDs so redesign or renderer replacement does not change business semantics.

- A Mini App MAY provide custom UI while retaining the same application-resource contracts and conformance tests.

# 66. Agent / MCP / WebMCP Application Resource Surface

To avoid confusing infrastructure lifecycle with domain operations, application-resource APIs SHALL use an appresource.\* namespace (or an equivalent namespaced contract) and SHALL be discoverable through capability routing rather than preloading every vertical tool.

- appresource.types.discover(requirements, scope)

- appresource.describe(typeIdOrProfile, versionConstraint)

- appresource.query(typeId, filter, projection, scope)

- appresource.get(typeId, resourceId, projection)

- appresource.create(typeId, input, idempotencyKey) only when the type declares generic-create capability

- appresource.patch(typeId, resourceId, patch, expectedVersion, idempotencyKey) only when the type declares generic-patch capability

- appresource.history(typeId, resourceId, cursor) where audit/history exposure is authorized

- appresource.action(typeId, resourceIdOrCollection, actionId, input, idempotencyKey)

- appresource.explain_blocker(operationId)

- appresource.export(applicationOrPackage, portabilityTarget) where policy permits

- Agent exposure MUST honor action-level and field-level permission ceilings and data minimization; discoverability does not imply execution authority.

- Generic create/patch remain contract-governed application operations, not raw database access. If a type requires semantic actions for creation or mutation, appresource.create/patch MUST be absent or rejected with the required action contract.

- Agent/tool output SHOULD return compact previews plus recoverable resource/evidence handles when records are large, preserving the OpenHuman-style compact-context objective without changing source-of-truth data.

- SPEC-279 routes/delegates commands and propagates authority/environment context; SPEC-288 defines the resource/action contract being invoked.

# 67. Policy, Field/Row/Action Authorization & Audit

- Authorization MAY apply at type, instance/row, relationship, field and action levels. Effective policy is evaluated server-side using tenant/workspace/app/environment plus actor/delegation context.

- Sensitive fields SHALL carry data-classification metadata to drive redaction, export restrictions, audit visibility and agent/UI exposure.

- Shared resources MUST support least-privilege views/projections so one Mini App need not receive all fields owned by another.

- Every privileged mutation MUST emit actor/provenance, permission snapshot reference, action contract version and evidence/settlement reference.

- Bulk operations require bounded scope, dry-run/preview where risk warrants, partial-failure semantics and replay-safe identifiers.

# 68. Vertical Package Contract

A vertical package composes reusable resource profiles, actions, workflows, policies and UI contracts into an installable Mini App capability set. Package installation MUST NOT patch the canonical kernel in place.

VerticalPackageManifest  
- packageId + version  
- required/optional resource profiles  
- required infrastructure capabilities  
- relationships + lifecycle/action extensions  
- workflow/event bindings  
- ui contract refs (SPEC-287)  
- policy/permission templates  
- storage/migration requirements  
- seed/configuration data rules  
- install/upgrade/rollback/uninstall hooks  
- portability class + export contract  
- conformance scenarios + evidence requirements

- Package dependency resolution SHALL detect incompatible profile versions and cyclic/ambiguous ownership before mutation.

- Uninstall MUST distinguish package code/UI removal from retained operational data and shared resources; destructive cleanup follows retention policy.

- Vertical packages MAY be first-party, tenant-authored or marketplace-distributed, subject to signature/provenance/security policy.

# 69. POS Reference Vertical — Conformance Example, Not Kernel

Retail POS SHALL be maintained as a reference composition to prove that the generic model can build a real transactional application. POS-specific concepts are profiles/package resources and MUST NOT become mandatory kernel primitives.

- Reuse canonical profiles: Party/Customer (optional), Product/CatalogItem, Offering, InventoryItem/StockPosition, Order/Sale, Payment, Refund, Document/Receipt, Employee/Actor where available.

- POS package extensions MAY define RegisterSession, Terminal, CashDrawer, BarcodeAlias, PromotionRule, ReceiptTemplate and tax/local-fiscal profiles as jurisdiction-specific capabilities.

- Reference flow: open register → scan/select offering → price/promotion → validate/reserve stock as required → authorize/capture payment → finalize sale → inventory settlement → receipt → close register/reconcile.

- Crash/retry at every boundary MUST prove no unintended duplicate capture, duplicate sale, duplicate entitlement/stock consumption or false completed receipt state. Historical sale/receipt interpretation MUST also remain stable when current catalog, pricing, tax or customer master data later changes; Sections 76-77 define the required snapshot and calculation semantics.

- Restaurant can extend the same base with Table, MenuModifier, KitchenTicket and IngredientConsumption; clinic can extend Party/Appointment/Service/Payment with domain-specific patient/encounter profiles without changing the kernel.

- Hardware integrations such as barcode scanner, receipt printer, cash drawer and payment terminal are capability adapters/Runner/Desktop concerns; browser-only operation MUST degrade explicitly rather than pretending hardware is available.

# 70. Offline / Local-Capable Application Resources

- P3 offline/local capability is opt-in per vertical/profile, not implied for all Mini Apps.

- Offline mutation requires a local durable journal, stable client mutation IDs, conflict/version metadata, authority lease or equivalent bounded authorization, and deterministic reconciliation rules. When scarce stock/capacity/entitlement can be consumed offline, the package MUST additionally use the reservation/escrow/partition semantics in Section 78 or explicitly deny that offline mutation.

- Actions involving external irreversible side effects (for example online payment capture) MUST declare whether they are unavailable, deferred or delegated while offline; local success MUST NOT fabricate external settlement.

- Sync conflicts MUST be classified by resource/action semantics. Last-write-wins is prohibited for invariants such as payment, entitlement balance or scarce inventory unless explicitly proven safe.

- Portable local adapters such as SQLite/files MAY satisfy P3 only when conformance evidence covers concurrency, crash recovery, migration and resynchronization behavior.

# 71. Application Export, Import & Standalone Deployment

- P2/P3 Mini App export SHALL include versioned resource/profile schemas, package manifest, workflows/action contracts, policy templates, storage migrations/mappings, required infrastructure capability manifest and data export/import metadata.

- Export MUST preserve stable resource IDs or provide a deterministic remap table so relationships, events, entitlements and audit references remain reconcilable.

- Portable packages MUST identify SmartAIHub-only optional integrations and a truthful degraded/unsupported behavior matrix for standalone deployment.

- Secrets, tenant-wide credentials and non-exportable provider tokens MUST be represented only by secret placeholders/requirements.

- Import SHALL validate package signatures/provenance, schema compatibility, policy ownership, data integrity, identity namespace collisions and serialization compatibility before accepting the imported deployment as READY. Sections 83-84 govern stable identity remapping and forward-compatible wire/export semantics.

# 72. Adoption, Backward Compatibility & Rollout

- R1.3 is additive. R1.2 infrastructure APIs/adapters and implemented legacy applications remain valid.

- Phase A: ship read-only type/profile registry plus semantic descriptors and package validation.

- Phase B: compose one new non-critical Mini App using reusable profiles; keep direct legacy paths untouched.

- Phase C: certify POS reference vertical in dev/test with real provider classes, failure injection and optional local adapter.

- Phase D: expose governed UI + Agent/MCP actions from the same contracts and certify field/action authorization consistency.

- Phase E: enable export/standalone portability for selected packages; no claim of portability without executed import/recovery evidence.

- Legacy apps adopt profiles only when there is a concrete reuse/migration benefit; bulk normalization solely for architectural purity is prohibited.

# 73. Additional 20-Pass Application-Composition Review (P61-P80)

- P61 two-layer control/data-plane boundary and registry scale; P62 canonical primitive minimality/kernel pollution; P63 profile extension/version compatibility; P64 typed relationship/cardinality/ownership.

- P65 lifecycle/invariant enforcement; P66 semantic action/precondition/idempotency; P67 multi-resource transaction/saga correctness; P68 event/outbox/dedup/ordering.

- P69 Offering→Entitlement→Consumption concurrency/settlement; P70 row/field/action authorization and data minimization; P71 SPEC-287 UI/business-rule boundary; P72 agent/MCP least-authority exposure.

- P73 cross-app shared-resource isolation; P74 storage-binding/physical-schema independence; P75 vertical package install/upgrade/rollback/uninstall; P76 POS sale/payment/stock crash-and-retry injection.

- P77 offline journal/sync/conflict/external-side-effect truthfulness; P78 P2/P3 export/import/standalone reconstruction; P79 SPEC-266/287/279/267 registry and ownership boundary; P80 final vertical composition end-to-end evidence.

- R1.3 therefore records a minimum 80-domain adversarial review baseline. Any correction that changes assumptions covered by P01-P79 MUST rerun all materially affected prior passes.

# 74. R1.3 Additional Acceptance Gates

- A new Mini App can compose at least five reusable application profiles plus one namespaced domain extension without adding a new canonical kernel type.

- POS reference implementation completes sale → payment settlement → inventory adjustment → receipt under crash/retry injection without unintended duplicate financial or stock effects.

- A restaurant or service/clinic-style package can reuse common profiles and add domain resources without modifying the canonical kernel or infrastructure adapter APIs.

- The same semantic action is callable through governed UI and authorized Agent/MCP execution and produces equivalent policy, idempotency, audit and evidence behavior.

- Application instance data remains in the configured data plane; registry/control-plane load does not grow linearly with every transactional row by design.

- A physical storage-provider/mapping change is rejected when required application invariants cannot be preserved.

- Field/row/action authorization prevents a shared resource from leaking restricted fields across Mini Apps or tenants.

- Offering/Entitlement/Consumption tests prove no over-consumption under concurrency/retry and correctly handle reversal/revocation.

- A selected P2/P3 vertical package exports and imports into a supported standalone target with relationships and stable identity reconstruction verified.

- P61-P80 evidence contains no unresolved critical/high-risk gap and explicitly records residual medium risks/owners.

- Money/Quantity/Time conformance tests prove currency scale/rounding, unit semantics and timezone handling are preserved across at least two supported storage/runtime mappings used by a reference vertical.

- Concurrent patch/action tests prove stale expectedVersion/ETag writes are rejected or reconciled according to the declared contract and cannot silently lose an accepted update.

- A tenant can add a namespaced custom field to a profile without forking the canonical profile or exposing that field/schema change to unrelated tenants.

# 75. R1.3 Exit Criteria & Architectural Rule

R1.3 is implementation-ready only when both layers are independently understandable: infrastructure provisioning can operate without application-domain packages, and application-resource composition can bind to existing infrastructure without owning provider lifecycle. A developer or agent creating a new vertical should normally compose stable profiles/actions/workflows/UI contracts first and create new canonical primitives only when repeated cross-domain evidence proves the abstraction is broadly reusable.

Canonical rule: compose vertical applications from reusable semantics; bind them to replaceable infrastructure; keep business invariants server-side; keep domain specificity out of the kernel; expose the same authorized actions to humans, workflows and agents.

# 76. Historical Snapshot, Temporal Semantics & Immutable Interpretation

Application resources SHALL distinguish mutable master data from committed historical facts. A stable resource ID alone is not sufficient when later master-data changes would alter the meaning of an accepted transaction, entitlement, schedule, receipt, decision or audit record.

- Relationships/fields SHALL declare reference semantics where material: LIVE_REFERENCE, SNAPSHOT_AT_COMMIT, VERSION_PINNED_REFERENCE, or DERIVED_WITH_RULESET. The default MUST NOT be guessed by adapters.

- A committed transaction/document MUST snapshot or version-pin every term needed to reproduce its historical meaning, including material identifiers/descriptions, quantity/unit, price components, currency, discounts, tax/fiscal classifications, rounding outputs, counterparty/legal identity fields where required, timezone/local-date context, and source offering/ruleset versions.

- Historical records MUST be interpreted using the contract/profile/ruleset versions valid at commit time. Reading the latest Product, Offering, PromotionRule or TaxProfile MUST NOT retroactively redefine an already-accepted transaction.

- Where a record class is declared immutable or settlement-bearing, correction SHALL use reversal, amendment, credit/debit, supersession or linked correction records rather than silent in-place rewrite. The original evidence/provenance remains reachable.

- Temporal fields SHALL distinguish event time, effective/business time, recorded/system time and local civil date when those meanings differ. Cross-timezone conversion MUST preserve the original zone/offset needed for audit and reproduction.

- As-of/history queries, if exposed, SHALL declare whether they reconstruct source-of-truth history or only best-effort audit snapshots; the API MUST NOT over-claim temporal completeness.

# 77. Deterministic Pricing, Discount, Tax, Currency & Fiscal Boundary

Commercial calculation SHALL be versioned and reproducible without turning the canonical kernel into a jurisdiction-specific tax/accounting engine.

- A pricing/total calculation contract SHALL declare ordered stages such as base price -\> modifiers/options -\> promotion/discount -\> tax/fee -\> currency conversion where applicable -\> rounding/allocation -\> payable total. The exact order and ruleset version are part of the committed evidence.

- Money arithmetic MUST use exact decimal/integer-minor-unit semantics appropriate to the currency/ruleset; binary floating-point MUST NOT be authoritative for financial settlement. Rounding mode, scale and residual allocation across lines MUST be deterministic.

- Multi-currency operations SHALL record source/transaction/settlement currency as applicable, FX rate value, rate source/authority, effective/as-of time, conversion direction and rounding result. Revaluation is a separate operation and MUST NOT rewrite the original settled conversion silently.

- Promotions/discounts SHALL record the applied rule/version and allocated monetary effect, so later edits to promotion definitions do not change historical totals.

- Tax/fiscal rules are jurisdiction/package profiles outside the minimal kernel. The application contract SHALL nevertheless preserve applied tax category/rate/base/amount/ruleset version and any external fiscalization reference required to prove the committed outcome.

- External fiscal receipt/invoice issuance MAY be a separate irreversible or eventually consistent action. Sale completion, payment settlement and fiscal-document status MUST be modeled separately when the jurisdiction/provider cannot make them one atomic transaction.

- Quote/estimate totals SHALL be distinguishable from authoritative committed totals; UI or agent surfaces MUST NOT present an estimate as settled fact.

# 78. Reservation, Hold, Allocation & Scarce-Resource Authority

Inventory, appointment slots, capacity, seats, quotas and entitlements are scarce-resource patterns that require a reusable reservation contract instead of ad-hoc per-vertical locking.

- Reservation/Hold semantics SHALL include reservationId, subject/resource scope, quantity/unit or capacity claim, owner/beneficiary, createdAt, expiry/TTL where applicable, state, fencing/version token, source action, and conversion/release/expiry rules.

- A reservation is not settlement. Conversion from reserved -\> consumed/allocated MUST be idempotent and prove that the hold was still valid or that a declared override policy applied.

- Overbooking/negative-stock policies MUST be explicit per profile/location/channel. The absence of a reservation capability MUST NOT be silently interpreted as permission to oversell.

- Offline or partitioned writers that can consume scarce resources SHALL receive bounded authority such as preallocated quota/escrow, partitioned stock, capacity lease or another proven mechanism. Otherwise the relevant mutation MUST be unavailable/deferred offline.

- Expired/released reservations MUST not authorize later settlement merely because a stale client still has the reservation identifier.

- Reconciliation SHALL detect leaked holds, double allocation, negative balances beyond policy, and reservations whose external side effect succeeded while local conversion did not.

# 79. Derived Projections, Search, Cache & Freshness Semantics

Search indexes, vector indexes, caches, materialized views, analytics tables and denormalized read models are derived projections, not automatic authorities for mutation or authorization.

- Every material projection SHALL identify its source-of-truth domain, projection schema/version, freshness/watermark metadata where feasible, rebuild strategy and consistency class.

- An action selected from search/vector/cache results MUST revalidate authoritative current state, tenant/environment identity, permission and relevant invariants before mutation. Stale projection data cannot authorize a destructive or financial action.

- Query APIs SHALL expose or document consistency expectations such as STRONG/READ_YOUR_WRITES/BOUNDED_STALE/EVENTUAL where the distinction is material to correctness.

- Projection rebuild/reindex MUST be replay-safe and MUST NOT re-trigger domain side effects. Rebuilding a search index cannot recapture payment, consume entitlement or emit a new business transaction.

- If a projection is too stale to support a requested UX/action safely, the system SHALL surface degraded freshness or force an authoritative read rather than present a false green state.

- Redaction and field-level authorization SHALL be applied to projection generation and query results; indexing sensitive fields does not grant retrieval authority.

# 80. External Integration Inbox, Outbox & Webhook Contract

Application-level integrations SHALL use explicit replay-safe ingress/egress contracts. Direct webhook-to-table mutation that bypasses application actions/invariants is non-conformant.

- Inbound events/commands SHALL carry or derive tenant/application/environment binding, provider/source identity, externalEventId or idempotency key, schema/version, receivedAt, signature/authentication result and replay window metadata.

- An integration inbox or equivalent deduplication record SHALL settle each external event deterministically as accepted, duplicate, ignored, retryable, blocked or rejected; duplicate delivery MUST NOT duplicate the business effect.

- Webhook signatures/tokens, timestamp skew, nonce/replay checks and endpoint allowlists SHALL follow provider-specific trust policy. A valid signature alone does not prove tenant/resource authorization.

- External identifiers SHALL use typed namespaces/issuer identity; a provider order ID or customer ID MUST NOT be treated as globally unique without its issuer/scope.

- Outbound webhook/event subscriptions SHALL declare payload schema/version, filtering, redaction/data classification, delivery retry/backoff, dead-letter/disable policy, secret reference and tenant ownership.

- Outbox delivery success is distinct from subscriber business success. Delivery receipts and downstream acknowledgements MUST NOT be conflated unless the integration contract explicitly defines such settlement.

- Schema-breaking integration changes require version negotiation/deprecation; consumers MUST NOT be forced to parse silently changed payload meaning.

# 81. Application Data Governance, Purpose, Consent, Retention & Legal Hold

Application-resource portability and agent exposure SHALL preserve data-governance obligations, not only storage location and field-level access.

- Sensitive/personal fields SHOULD support policy metadata for data category, purpose/use limitation, retention class, exportability, masking/redaction, residency, and consent/legal-basis reference where the domain requires it.

- A caller having technical field permission does not automatically authorize every purpose of use. Policy evaluation MAY restrict agent/tool/export access by declared purpose or workflow context.

- Retention/deletion SHALL propagate across application records, attachments, derived projections, vectors/search indexes, exports and external processors according to authoritative policy while preserving legally required audit/settlement evidence.

- Legal hold or mandatory-retention state MUST override routine purge without silently converting retained records into generally visible data.

- Where erasure conflicts with immutable financial/audit/legal records, the profile SHALL define permissible anonymization/pseudonymization/separation strategy and expose a truthful blocker rather than pretending full deletion occurred.

- Export/import/standalone packages SHALL carry governance metadata necessary to re-establish equivalent controls or explicitly declare unsupported governance requirements.

# 82. Aggregate / Consistency Boundary, Write Set & Bulk Mutation Semantics

Resource composition SHALL make consistency boundaries explicit so generic actions do not create hidden distributed transactions or lost invariants.

- A profile/action MAY declare an AggregateBoundary or equivalent consistency scope identifying the root, authoritative write set and invariants that must be evaluated together.

- Actions SHALL declare whether writes require one atomic transaction, ordered locks/fencing, compare-and-swap/expectedVersion, or a saga. An adapter MUST reject execution when required semantics are unavailable.

- Cross-aggregate actions SHALL identify durable step state, compensation/forward-recovery strategy and settlement point. Partial completion MUST be visible and resumable.

- When multiple resources are locked, a deterministic lock/order policy SHOULD be defined to reduce deadlock/livelock. Retry on serialization/deadlock failure MUST remain idempotent.

- Counters/balances that enforce limits (stock, entitlement, quota, seats) MUST use atomic or otherwise proven concurrency semantics rather than read-modify-write on stale values.

- Bulk mutation SHALL declare ATOMIC_ALL, ATOMIC_PER_ITEM or PARTIAL_WITH_RECEIPT semantics. The caller MUST receive item-level outcomes and a replay-safe bulk operation identifier where partial settlement is possible.

# 83. Identity Namespace, Merge/Split/Rekey & Import Collision Handling

Stable identity SHALL remain portable across app boundaries and exports without confusing external identifiers, aliases or mutable natural keys with canonical resource identity.

- Canonical resource IDs SHALL be unique within an explicit namespace/scope and SHOULD be opaque/stable. Email, phone, SKU, display name, barcode or provider IDs MUST NOT be assumed to be canonical globally stable IDs.

- External identifiers SHALL be modeled as issuer + namespace/type + value + scope + validity where material; uniqueness constraints are declared per namespace rather than guessed.

- Merge, split, rekey or dedup operations SHALL preserve alias/tombstone lineage, relationship integrity, audit provenance and conflict decisions. High-risk merges require preview/approval according to policy.

- Import SHALL detect canonical-ID and external-ID collisions before mutation and produce a deterministic mapping/conflict plan. Silent overwrite because an imported ID already exists is prohibited.

- ID remapping during import/export SHALL be stable and recorded so events, evidence, relationships and entitlement/payment references can be reconciled after migration.

- Deleted/tombstoned identities SHALL not be automatically reused while historical references remain valid unless the profile proves reuse is safe.

# 84. Canonical Serialization, Patch Semantics & Forward Compatibility

Portability requires stable wire/export meaning in addition to logical schemas. Each contract SHALL define canonical serialization rules for values whose ambiguity can corrupt migrations or agent/tool calls.

- The envelope SHALL identify resource/profile/action schema version, resource identity/scope and representation version. Decimal money, quantity/unit, timestamps/timezones, binary/attachment handles and references SHALL have unambiguous canonical forms.

- Absent, null, default and redacted/unknown values MUST be distinguishable where they carry different meaning. A redacted field MUST NOT deserialize as an intentional null or deletion request.

- Patch semantics SHALL be explicitly versioned (for example replace-field/set-unset/list operation semantics) and MUST define behavior for nested objects, arrays, relationships and custom extension fields. Generic patch MUST NOT accidentally bypass action invariants.

- Readers SHALL define behavior for unknown additive fields/extensions: safely preserve/ignore according to the contract or reject with a compatibility error. Silent reinterpretation of an unknown field is prohibited.

- Exports SHOULD carry per-file/chunk or logical dataset checksums/manifests sufficient to detect corruption/truncation before READY settlement.

- Canonical serialization test vectors SHALL be shared across supported SDK/runtime languages where practical to prevent JavaScript/Go/Rust/Python differences from changing business meaning.

# 85. Ruleset, Computed Field, Decision & AI Authority Provenance

Computed values and automated decisions SHALL be reproducible or explicitly classified as advisory. SmartAIHub agents/LLMs MUST NOT become an undocumented source of authoritative business rules.

- A material computed field/action decision SHALL reference ruleset/algorithm version and material input versions where reproduction or dispute resolution matters.

- Deterministic business rules such as totals, eligibility, entitlement balance and invariant checks SHOULD execute in versioned server-side rules/actions, not solely in generated UI prompts or agent reasoning.

- If an AI/model contributes to an authoritative decision, the action contract SHALL declare the allowed authority, model/tool/prompt-policy reference where available, evidence/provenance, confidence/uncertainty handling, human-approval requirement if applicable, and deterministic post-validation constraints.

- AI-generated suggestions MUST be represented as proposals/advisory outputs until an authorized semantic action accepts them. Text generation alone MUST NOT mutate settlement-bearing resources.

- Re-evaluating a historical transaction with a newer ruleset/model SHALL create a new assessment/recommendation or explicit recomputation result; it MUST NOT silently rewrite the original decision evidence.

- Ruleset rollout SHALL support version coexistence/rollback and cohort/environment control when active transactions may straddle deployment versions.

# 86. Application Observability, Integrity Monitors & Reconciliation

Infrastructure health alone cannot prove application correctness. Each vertical/package SHALL expose operational integrity signals appropriate to its declared invariants and side effects.

- Action telemetry SHOULD include action/version, tenant/application/environment, latency, outcome/reason class, retry/conflict rate, idempotency settlement and correlation/causality references without logging prohibited payloads.

- Packages with sagas/outbox/inbox/offline sync SHALL expose backlog age/count, stuck/poison states and reconciliation progress. A growing backlog MUST be distinguishable from normal eventual consistency.

- Reference integrity monitors SHOULD cover domain mismatches such as payment captured without sale settlement, stock/entitlement balance drift, leaked reservations, fiscal-document failure, duplicate external event suppression and offline sync conflicts.

- Integrity alarms SHALL link to actionable evidence and repair/reconcile capability where safe; automated repair MUST respect the same authority ceiling and historical immutability rules as normal actions.

- SLO/SLA indicators MUST separate availability from correctness. A 200 response or green process health cannot mark a transaction complete while required settlement/evidence remains pending.

- Cross-surface tracing SHOULD correlate UI/Agent/MCP action -\> application action -\> job/workflow -\> provider/external integration -\> final evidence so Task Control can explain the real completion state.

# 87. Vertical Package Trust, Data Egress & Permission-Expansion Boundary

Marketplace/tenant-authored vertical packages are privileged application extensions and SHALL have an install/update trust contract in addition to package signatures.

- A package manifest SHALL declare required resource/profile permissions, actions, sensitive data categories, network egress destinations/classes, secrets, infrastructure capabilities, background/event subscriptions and cost-impacting operations.

- Installation SHALL present/evaluate the effective permission/data/egress delta against tenant policy before activation. Package code MUST NOT gain broad database/network/secret access merely because it runs inside the tenant.

- Runtime execution SHOULD use capability-scoped tokens/handles and egress policy rather than tenant-wide credentials. Raw cross-app database access is prohibited unless explicitly approved as a provider-native escape hatch with portability/security impact declared.

- Package updates that expand permission, data category, egress, secret, irreversible action or spend scope require re-evaluation and, where policy requires, renewed approval; prior approval MUST NOT silently cover materially broader authority.

- First-party, marketplace and tenant-authored packages SHALL have provenance/signature identity. Executable package artifacts SHOULD include dependency/SBOM or equivalent supply-chain evidence appropriate to the runtime risk.

- Disable/quarantine/rollback MUST stop new unsafe package actions/subscriptions while preserving source-of-truth data and allowing controlled export/recovery according to policy.

# 88. Additional 20-Pass R1.4 Hardening Review (P81-P100)

- P81 historical snapshot/live-reference semantics; P82 temporal event/effective/recorded-time correctness; P83 deterministic pricing/discount/tax ordering; P84 currency/FX/rounding allocation and fiscal boundary.

- P85 reservation/hold lifecycle; P86 offline scarce-resource authority/escrow and oversell prevention; P87 derived projection/search/cache freshness; P88 authoritative revalidation before mutation from stale/read-model results.

- P89 inbound inbox/idempotency/webhook replay; P90 outbound webhook delivery/redaction/versioning; P91 data-purpose/consent/retention/legal-hold propagation; P92 immutable-record erasure/anonymization truthfulness.

- P93 aggregate/write-set/lock and atomicity semantics; P94 bulk partial-settlement/replay; P95 identity namespace/merge/rekey/import collision; P96 canonical serialization/patch/unknown-field forward compatibility.

- P97 ruleset/computed-field reproducibility; P98 AI authority/advisory-to-action boundary; P99 application integrity observability/reconciliation and package permission/egress supply-chain trust; P100 final POS + offline + integration + export/import + recovery end-to-end evidence.

- R1.4 therefore records a minimum 100-domain adversarial review baseline. Corrections affecting prior assumptions MUST trigger targeted reruns of all materially impacted earlier passes, not only P81-P100.

# 89. R1.4 Additional Acceptance Gates

- A committed sale/order/receipt remains semantically identical after Product/Offering/Promotion/Tax master data changes because all material historical terms are snapshot or version-pinned according to Section 76.

- Reference POS totals are reproducible from committed inputs/ruleset versions and pass deterministic decimal, rounding allocation, discount, tax and multi-currency test vectors where enabled.

- Scarce-stock/capacity/entitlement tests prove no unauthorized over-allocation under concurrent writers, expiry, retry and offline partition; offline consumption is denied unless bounded authority/reservation semantics exist.

- A mutation initiated from stale search/vector/cache data revalidates authoritative state and permission before side effects and is rejected safely when the underlying record has changed.

- Inbound webhook redelivery/replay/clock-skew/signature tests prove one business effect per accepted external event and correct tenant/environment binding.

- Outbound integration tests prove schema/version stability, redaction, retry/dead-letter behavior and separation between delivery receipt and downstream business settlement.

- Retention/erasure tests propagate to derived projections and exports while legal-hold/immutable-settlement records produce truthful retained/anonymized outcomes rather than false deletion claims.

- Cross-resource actions fail early when an adapter cannot provide the declared atomic/locking/CAS/saga semantics; bulk partial outcomes are itemized and replay-safe.

- Import tests detect canonical/external ID collision before mutation and verify deterministic remap lineage across relationships, events, audit/evidence and entitlement/payment references.

- Canonical serialization test vectors produce equivalent Money/Quantity/Time/reference meaning across at least three implementation runtimes or two runtimes plus one standalone export/import adapter used by the project.

- Generic patch tests prove absent/null/redacted semantics and unknown extension fields cannot silently delete, overwrite or reinterpret protected state.

- Material computed/AI-assisted decisions record the governing ruleset/model/tool evidence and cannot directly mutate settlement-bearing resources unless an authorized semantic action explicitly permits and post-validates the outcome.

- Operational drills detect and reconcile at least one injected payment/sale mismatch, leaked reservation, stuck outbox/inbox or offline-sync conflict with truthful Task Control evidence.

- A marketplace/tenant-authored package update that expands data, egress, secret, irreversible-action or spend authority is blocked pending policy re-evaluation/approval as required.

- P81-P100 evidence contains no unresolved critical/high-risk gap; all accepted medium residual risks have owner, mitigation and expiry/review date.

# 90. R1.4 Exit Criteria & Canonical Rule

SPEC-288 R1.4 is implementation-ready when the platform can preserve not only portable schemas and actions, but also historical meaning, deterministic calculations, scarce-resource correctness, replay-safe integration, governance obligations, portable identity/serialization, ruleset provenance, integrity observability and package least authority across UI, Agent/MCP/WebMCP, workflow, offline and standalone execution paths.

Canonical rule: a portable application contract must preserve meaning across time, retries, concurrency, provider changes, offline partitions, integrations and package upgrades. Reuse mutable master data for current operations, snapshot/version-pin committed facts, revalidate derived views before mutation, bound authority for scarce resources, and require every human/agent/integration path to settle through the same versioned semantic actions and evidence rules.

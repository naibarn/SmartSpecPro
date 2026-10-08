# Lane 3 governance disposition and implementation work packages

**Evidence baseline:** `origin/main` `ba500b8d4f243377bd178f71fc14089447ebd796` (2026-10-08).
**Purpose:** targeted governance disposition for SPEC-256 and implementation-ready planning packages for SPEC-271 and SPEC-275. This document does not amend runtime contracts, claim implementation completion, or authorize deployment.

## 1. SPEC-256 canonical identity disposition

The canonical normative path is:

`specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md`

Its SHA-256 is `d9cb05d056947cb0b1b31ec479bc1e30eaf0cfb7a2e8ddbdeb19ba8911ae2df3` at baseline `ba500b8d4f243377bd178f71fc14089447ebd796`.

The nested path
`specs/feature/256-skill-first-capability-discovery-intent-execution/specs/feature/256-skill-first-capability-discovery-intent-execution/spec.md`
has the same SHA-256. Dynamic inventory classifies the outer directory as `CANONICAL_SPEC` and the nested directory as `DUPLICATE_SPEC_COPY`, with `DUPLICATE_SPEC_COPY_OF:specs/feature/256-skill-first-capability-discovery-intent-execution`. The configured `specs/feature` root and the existing identical-nested-copy rule establish the outer ancestor as canonical. Cross-Spec manifest references resolve to the outer path. Both files were introduced together by commit `6fffb7478b70d97e39685cebd70d9862c8efe1b0`.

No SPEC-256 reservation or alias exists in `specs/_config/spec-id-registry.json`; that sidecar records renumbering aliases and historical dispositions, not ordinary canonical path selection. No registry edit is needed. The nested copy and its nested handoff are preserved; neither is deleted or rewritten. The nested handoff's `AUTHORITY_CONFLICT` is stale evidence attached to the duplicate copy, not a second canonical authority. The outer canonical manifest remains `UNRESOLVED` for product relevance/continuation, with no duplicate conflict. Those lifecycle questions remain open and are separate from path identity.

**Disposition:** canonical path resolved by existing inventory/governance rule; no normative SPEC change, registry mutation, or canonical handoff mutation is warranted. The targeted `classifications --check` currently fails on an unrelated SPEC-208 classification/evidence drift; do not run its writer or regenerate shared `specs/_status/*` projections in this lane. Follow-up for governance owner: decide whether a future tool change should render duplicate-copy handoffs as non-canonical, while preserving current source and history. This is not required to identify SPEC-256's canonical source.

## 2. SPEC-271 implementation packages

**Normative source:** `specs/feature/271-smartaihub-portable-uat-acceptance-execution-platform-rev1-5/spec.md`
**Source SHA-256:** `d73eca74174935058b9c750f0ab1671b58bdde4424efe8ea3d3daad9b4053d99`
**Repository baseline:** `ba500b8d4f243377bd178f71fc14089447ebd796`
**Canonical handoff:** authority, implementation, verification, deployment all `UNKNOWN` or `UNRESOLVED`; 287 requirement rows remain open. No SPEC-271-specific integrated acceptance receipt was found in its handoff.

### Existing evidence and boundaries

| Requirement evidence | Existing source/test | What it proves and does not prove |
|---|---|---|
| `REQ-962CDCE30AEF` immutable evidence bundle; `REQ-378D26AF8464` content hashes and run/environment binding; `REQ-A2E47461A85A` exact source revision / TOCTOU | `apps/web/server/services/spec224VerificationProvenance.ts`; `spec224FinalVerify.ts`; tests `__tests__/spec224VerificationProvenance.test.ts`, `__tests__/spec224FinalVerify.test.ts`, `__tests__/spec224BoundedRealSpecFinalVerify.test.ts` | Adjacent SPEC-224 provenance and final-verify contracts exist. These tests do not establish a portable SPEC-271 UAT platform or independent business oracle. |
| `REQ-A40BF6AB31EB` separate propose/authorize/execute/verify; `REQ-EB2EA2650389` normalized receipts for consequential decisions | SPEC-224 `spec224RuntimeAdmission.ts`, `spec224DevelopmentRunPersistence.ts`; tests `__tests__/spec224RuntimeAdmission.test.ts`, `__tests__/spec224DevelopmentRunIntegration.test.ts`, `__tests__/spec224PostgresIntegration.integration.test.ts` | Existing authorization, durable run and event infrastructure can be reused. It does not prove SPEC-271 receipt completeness, portability, or independent acceptance. |
| Shared durable execution and continuation | `jobControlPlane.ts`, `worker_jobs`/outbox contract, `developmentLifecycleContracts.ts`; SPEC-224 recovery/continuation tests | Reuse canonical job and lifecycle owners. Do not add a UAT queue, ledger, or scheduler. |

### Work units

#### 271-WP1 — Requirement-to-oracle contracts and independent acceptance

- **Requirement IDs:** `REQ-962CDCE30AEF`, `REQ-A40BF6AB31EB`, plus source requirements under SPEC-271 §§7–8 and §14.
- **Owner:** SPEC-271 UAT/verification owner; coordinate oracle authority with each domain owner.
- **Scope:** map each release-blocking requirement to a deterministic or approved human/domain oracle; ensure the implementation harness cannot authoritatively accept its own output; preserve ambiguity as blocked/unverified.
- **Owned paths:** new SPEC-271 compiler/contract modules and their focused tests only, selected by the implementing owner after worktree ownership check. Consume SPEC-224 run and job contracts; do not edit those owner paths.
- **Acceptance tests:** reject missing/circular/self-referential oracle; prove harness PASS alone cannot satisfy acceptance; prove explicit human/domain adjudication is represented distinctly; bind each assertion to stable requirement IDs.
- **Dependencies:** SPEC-224 development run interface; domain owners for business invariants; existing policy/approval authority.
- **Collision risks:** SPEC-224 Final Verify and runtime admission; avoid changes to `spec224*` owner files and shared status projections.
- **Completion evidence:** exact-SHA test results, oracle-to-requirement mapping, and a sample independent acceptance receipt.

#### 271-WP2 — Portable source-bound evidence receipts

- **Requirement IDs:** `REQ-378D26AF8464`, `REQ-A2E47461A85A`, `REQ-F5F18EFA857C` (tenant scope), `REQ-962CDCE30AEF`.
- **Owner:** SPEC-271 UAT/verification owner; coordinate evidence storage with existing artifact and tenant owners.
- **Scope:** produce a portable manifest over evidence hashes bound to UAT run, tenant, scenario/schema revision, exact source SHA, environment fingerprint, timestamps and oracle result. Reuse current evidence artifact storage/receipts.
- **Owned paths:** new SPEC-271 receipt/manifest adapter and its tests; no migrations until the owner proves an existing representation cannot satisfy the contract.
- **Acceptance tests:** source SHA mismatch causes reject/restart; mutate any evidence artifact and require hash failure; cross-tenant read/write denial; missing, stale, duplicate or conflicting receipts never produce PASS; replay preserves source and scenario identity.
- **Dependencies:** existing evidence/artifact APIs, SPEC-224 run identity, tenant policy and approved signing/attestation capability.
- **Collision risks:** `spec224VerificationProvenance.ts`, artifact storage, tenant authorization and retention policy. Keep compatibility by adapting existing formats rather than replacing them.
- **Completion evidence:** exact-SHA test report plus at least one persisted non-production receipt with verified content hashes. No production acceptance claim from unit tests.

#### 271-WP3 — Portable API/browser/runtime/recovery execution slice

- **Requirement IDs:** `REQ-962CDCE30AEF`, `REQ-39640924088D` (scoped fault evidence), `REQ-378D26AF8464`, `REQ-A2E47461A85A`.
- **Owner:** SPEC-271 owner with API, browser and runtime owners.
- **Scope:** execute one bounded representative scenario through API and browser assertions, a read-only DB/domain oracle where appropriate, durable job events, and recovery/resume; preserve the same scenario contract across local and approved cloud placement.
- **Owned paths:** SPEC-271 provider adapter and isolated fixtures/tests only; no changes to Runner implementation or Cloudflare deployment.
- **Acceptance tests:** portable scenario parity; browser content treated as untrusted; API/domain oracle is decisive for business outcome; recover from worker interruption using existing job/outbox continuation; injected faults remain isolated and carry `fault_id`; tests verify cleanup/compensation in disposable fixtures.
- **Dependencies:** WP1 and WP2 contracts; canonical `worker_jobs` plus outbox; approved Cloudflare Container/browser capability and target credentials for later non-production evidence.
- **Collision risks:** Lane 1 Factory/SPEC-224 work, active Runner release work, provider/browser integration. Wait for owner agreement before touching shared adapter/runtime files.
- **Completion evidence:** focused integration run on a disposable environment and source-bound receipt. Live provider, deployment and E2E acceptance remain separate gates.

## 3. SPEC-275 implementation packages

**Normative source:** `specs/feature/275-autonomous-execution-learning-reliability/spec.md`
**Source SHA-256:** `e066de3f307be39d2aa2b3aeb3382bef90c52e9544a3cf08c1da9c2af309b246`
**Repository baseline:** `ba500b8d4f243377bd178f71fc14089447ebd796`
**Canonical handoff:** authority, implementation, verification and deployment `UNKNOWN` or `UNRESOLVED`; 138 requirement rows remain open. No SPEC-275-specific learning candidate / promotion / rollback evidence mapping was found.

### Existing evidence and boundaries

| Requirement evidence | Existing source/test | What it proves and does not prove |
|---|---|---|
| `REQ-3E279092D72A` structured execution/verification evidence | `python-backend/app/services/agent_output_assurance.py`; `python-backend/tests/unit/test_agent_output_assurance.py` | A task-specific assurance contract validates inputs/evidence and side-effect authorization. It is not the SPEC-275 learning lifecycle or a general execution evidence envelope. |
| `REQ-93D7237E60C9` human intervention capture; `REQ-7F579EE770B7` repeated failure patterns; `REQ-479781B1E096` reasoning vs deterministic enforcement | No SPEC-275-specific implementation/test mapping found in the canonical handoff. Adjacent job/run event and verification services exist under SPEC-224. | Treat as missing evidence or implementation `UNKNOWN`; do not infer capability from generic event logs or task-specific quality repair loops. |
| `REQ-9827D2500BE4` promotion into Skills/rules/tests/tools/context; `REQ-15262FF53334` regression validation; `REQ-EB77BEAAE9FB`, `REQ-6EC0DA77EF6F`, `REQ-F72D01423A76` shadow/canary/rollback | `apps/web/shared/agentRuntime/skillManifest.ts`; static validation tests `apps/web/shared/__tests__/skillCapabilityManifest.test.ts` and `apps/web/server/services/__tests__/skillCapabilityManifestService.test.ts`; `python-backend/app/services/agent_output_assurance.py` and its unit tests | Existing Skill metadata and output assurance are adjacent components. They do not prove candidate lifecycle, regression-before/after promotion, canary gates, or rollback receipt. |

### Work units

#### 275-WP1 — Evidence intake and failure/intervention classification

- **Requirement IDs:** `REQ-3E279092D72A`, `REQ-93D7237E60C9`, `REQ-7F579EE770B7`, `REQ-479781B1E096`.
- **Owner:** SPEC-275 learning/improvement owner; data ownership remains with SPEC-224 run/event and SPEC-271 verification owners.
- **Scope:** consume existing run, event, verification and intervention receipts; normalize provenance and distinguish model reasoning failures, tool/runtime failures, deterministic policy denials, resource blocks and external waits. Do not create a second job or evidence ledger.
- **Owned paths:** SPEC-275 adapter/normalizer modules and focused tests, after owner approval of source event contracts.
- **Acceptance tests:** preserve run/attempt/source/tenant IDs; duplicate/replayed events are idempotent; stale or missing receipts are not evidence; distinguish resource block from code failure; intervention labels require actor/time/reason evidence; repeated-pattern aggregation excludes same-chain duplicate evidence.
- **Dependencies:** canonical `worker_jobs` + outbox and SPEC-224 run/event contracts; SPEC-271 independent verification receipt schema.
- **Collision risks:** SPEC-224 event schemas, SPEC-271 receipt schema, tenant retention and analytics pipelines. Changes to shared event contracts require their owner review.
- **Completion evidence:** exact-SHA focused unit/integration results and a traceable evidence envelope built from fixture receipts; no model learning/pass claim.

#### 275-WP2 — Improvement candidate lifecycle and bounded repair

- **Requirement IDs:** `REQ-26D6000E3494` (candidate creation), `REQ-9827D2500BE4` (promotion target), `REQ-3E279092D72A`.
- **Owner:** SPEC-275 learning/improvement owner; authorization and Skill publication remain with their canonical owners.
- **Scope:** construct reviewable candidates from WP1 evidence with affected requirements, provenance, expected metric, risk class, bounded repair budget and explicit target owner. Candidate creation never silently edits production Skills/rules/tools.
- **Owned paths:** SPEC-275 candidate service/adapter and tests only; reuse current Skill Registry, approval and work/job mechanisms.
- **Acceptance tests:** insufficient evidence cannot create a promotable candidate; candidate identifies exact source and immutable evidence; repair stops at its budget and emits no-progress state when evidence/outcome is unchanged; owner denial, timeout or stale permission cannot advance lifecycle; concurrent duplicate candidates converge idempotently.
- **Dependencies:** WP1; SPEC-256 Skill metadata/registry owner; SPEC-224 bounded execution/repair controls; SPEC-271 verifier.
- **Collision risks:** Skill Registry, job control plane, permission and review contracts. No new registry, queue, state ledger, or authority.
- **Completion evidence:** unit/integration tests and a non-production candidate review record linked to requirement IDs.

#### 275-WP3 — Regression gates, shadow/canary promotion and rollback

- **Requirement IDs:** `REQ-15262FF53334`, `REQ-EB77BEAAE9FB`, `REQ-6EC0DA77EF6F`, `REQ-50E0F87A26A6`, `REQ-F72D01423A76`, `REQ-9BB1C249DF83`.
- **Owner:** SPEC-275 owner with SPEC-271 verification, Skill Registry, security and release-policy owners.
- **Scope:** require a reproducible historical/synthetic regression that fails before and passes after candidate change; run shadow/canary against isolated cohorts; apply guardrails; preserve promotion and rollback decisions as owner receipts. Runtime deploy remains outside this package.
- **Owned paths:** SPEC-275 gate adapter, regression fixtures and focused tests only. Policy flags and Skill release publication remain owned by their existing domains.
- **Acceptance tests:** regression proves before/after behavior and exact candidate provenance; protected acceptance set cannot be tuned by candidate; canary aborts on safety/tenant/cost/latency guardrail; rollback restores prior pinned revision and emits auditable receipt; disabled candidate leaves baseline behavior intact.
- **Dependencies:** WP1/WP2; SPEC-271 independent oracle/evidence receipts; existing release/feature-flag and rollback authorities.
- **Collision risks:** release deployment and production policy, protected acceptance datasets, Skill publication, shared CI resources. No deploy or migration in this work unit.
- **Completion evidence:** isolated focused regression/canary simulation and rollback receipt on exact integrated SHA; production readiness remains a separate decision.

## 4. Concurrency and integration guardrails

| Area | Current protection / collision risk | Rule for implementation owners |
|---|---|---|
| Lane 1 Factory / SPEC-224 | PR #318 implementation and #320 handoff are merged; Lane 1 worktree/thread ownership is not released by merge/idle state. | Do not edit SPEC-224 runtime, handoff, or `spec224*` paths without explicit owner release. |
| Lane 2 CMS / SPEC-038 | PR #323 merged; Lane 2 worktree remains registered and may retain branch-only work. | Do not edit SPEC-038 or `specs/_status/*` projections without owner release and integration authority. |
| Runner | PR #324–326 merged; their Runner worktrees remain registered, even though observed threads are idle. | Do not alter Runner source/release/install paths or claim a deployed Runner from merged code alone. |
| SPEC-271 / 275 | Canonical handoffs currently have no implementation/evidence mapping, but this audit creates only plans. | A future implementation lane must verify file ownership and active sessions again immediately before first write. |

No runtime tests, migrations, deployments or production actions were performed for this work package. The source SHA is the planning baseline; implementation evidence must be regenerated against each actual integrated SHA.

# Spec 221 — SmartAIHub Skill Engineering Framework

**Status:** Proposed / Partial governance contract slice present; end-to-end Skill release integration pending
**Spec ID:** 221
**Revision:** 6 — canonical Skill discovery projection, indexing lifecycle and retrieval conformance
**Date:** 2026-09-22
**Target repository path:** `specs/feature/221-smartaihub-skill-engineering-framework/spec.md`
**Product:** SmartAIHub / oneaihub.app  
**Primary Surface:** SmartAIHub Web — Skill Studio  
**Primary Domain:** Skill creation, evaluation, review, publishing, governance  
**Related Systems:** Specs 217–220, Spec 222 Self-Improving Exploration Layer, Spec 224 Autonomous Development Orchestrator, Spec 229 Unified Retrieval/RAG, Spec 230 Agentic Development Fabric, Skill Marketplace, External Agent Gateway, A2A, MCP, Unified Job Control Plane, SmartAIHub Runner, LangGraph orchestration, Credits/Billing
**Inspired by:** `obra/superpowers` software-development methodology concepts, especially disciplined planning, test-driven development, systematic debugging, review, and verification.  
**Important:** SmartAIHub MUST NOT depend on Superpowers as a mandatory runtime. Superpowers is an optional methodology source/adapter; SmartAIHub owns the product workflow, state, policy, security, audit, billing, and execution control.
**Revision note:** This revision incorporates 72 cumulative production-readiness audit passes. Passes 29–48 added enforceable tenant isolation, cryptography/key management, disaster recovery, provider resilience, Runner trust, policy precedence/explainability, side-effect safety, DLP/redaction, eval lineage/contamination controls, model/provider drift handling, Marketplace abuse/IP governance, creator offboarding/ownership transfer, fair scheduling, API/schema evolution, cache-consistency requirements, incident response, review appeals, locale/timezone determinism, advanced testing, and emergency kill-switch controls. Passes 49–68 further harden lifecycle state transitions, authorization-at-use/TOCTOU, lease fencing, atomic credit reservation, reproducibility envelopes, event ordering/inbox idempotency, approval liveness, update pinning, dependency-source integrity, MCP/A2A/tool trust, Web UI application security, telemetry hygiene, operational runbooks, artifact reconciliation, provider/model EOL handling, eval-cost efficiency, multi-region ordering, cancellation finality, rollback/data-migration safety, and versioned Agent Skills/Superpowers interoperability. Passes 69–72 add evidence-dependency invalidation, bounded composite execution, safe external-reference ingestion, and realtime event-channel authorization/isolation.

---

## 0.1 Codebase alignment snapshot — 2026-09-22

`apps/web/server/services/skillGovernanceContracts.ts` and focused tests cover Skill identity, version/dependency closure, evaluation, review and revocation semantics. The repository also has pre-existing `skillRegistry.ts`, Skill Studio, execution and maintenance services; those are existing infrastructure and must not be relabelled as the complete Spec 221 governance/release control plane.

No end-to-end Spec 221 admission path tying source revision, context-pack hash, evaluation, review, billing/job execution and published release was proven in this audit. The canonical job and capability authorities remain external to this contract slice.

## 1. Executive Summary

Spec 221 defines a production-grade **Skill Engineering Framework** for SmartAIHub that allows authorized users to create, test, improve, version, review, and publish SmartAIHub Skills primarily through the SmartAIHub Web UI.

The central design goal is to transform Skill development from a manual ZIP/SKILL.md authoring task into an AI-assisted engineering workflow:

```text
Idea / Requirement
      ↓
Skill Contract
      ↓
Baseline Evaluation
      ↓
Skill Generation
      ↓
Tests + Behavior Evals
      ↓
Repair / Debug Loop
      ↓
Security + Compatibility Review
      ↓
Human Approval when required
      ↓
Versioned Release
      ↓
Personal / Team / Tenant / Marketplace Publication
```

The system borrows proven process ideas from Superpowers, but generalizes them beyond coding agents to support SmartAIHub Skill types including LLM, image, video, audio, workflow, MCP, A2A, computer-use, data-processing, FFmpeg, and composite agent skills.

The system MUST support differentiated permissions. Skill Studio is **not Admin-only**. Ordinary users may create safe Personal Skills under strict sandbox/policy constraints; Skill Creators and Tenant Admins receive broader authoring/publishing capabilities; privileged capabilities and global Marketplace trust decisions remain under Platform Admin control.

---

## 2. Problem Statement

The current concept of creating a Skill from files such as `SKILL.md`, schemas, prompts, examples, and code is powerful but creates several production problems:

1. Non-developer users cannot create Skills safely without understanding package internals.
2. Skill quality varies widely because there is no mandatory engineering lifecycle.
3. A Skill may appear to work in one prompt but fail across models, edge cases, or adversarial inputs.
4. There is no standard baseline comparison proving that the Skill improves behavior compared with the underlying model alone.
5. There is no unified automated repair/debug loop.
6. Security risk differs greatly between prompt-only Skills and Skills with shell/filesystem/network/secret access.
7. Marketplace publishing requires stronger trust and governance than private use.
8. External coding harnesses such as Codex, Claude, Grok, Gemini, or Hermes may help build Skills, but SmartAIHub must remain the source of truth.
9. Long-running Skill engineering jobs must survive browser disconnects and worker restarts.
10. Token/credit cost can grow quickly when multi-agent and evaluation loops are used.

Spec 221 solves these problems with a unified Skill Engineering Control Plane and Skill Studio UI.

---

## 3. Goals

### 3.1 Product Goals

The system MUST:

- Allow users to describe a Skill in natural language and let AI generate the Skill package.
- Provide a complete Skill Studio UI without requiring Git or CLI knowledge.
- Generate and maintain a formal Skill Contract before implementation.
- Support baseline evaluation before Skill application.
- Support deterministic tests and model/agent behavior evaluations separately.
- Support automatic repair loops with bounded retries.
- Support cross-model and cross-provider compatibility evaluation.
- Support versioned, immutable published releases.
- Support Personal, Team, Tenant, and Marketplace visibility scopes.
- Enforce role- and capability-based permissions.
- Use existing SmartAIHub job infrastructure rather than a new queue system.
- Use external harnesses when beneficial without making them systems of record.
- Track cost, credits, artifacts, reviews, approvals, and audit history.
- Integrate with Marketplace revenue-sharing rules without reimplementing billing.
- Allow future methodology profiles beyond Superpowers.

### 3.2 Engineering Goals

- Production-grade failure recovery.
- Idempotent job execution.
- Immutable published artifacts.
- Clear policy boundaries.
- Strong tenant isolation.
- Reproducible evaluations.
- Full auditability.
- Extensible adapter architecture.
- Model/provider independence.
- No dependency on a single external coding harness.

---

## 4. Non-Goals

Spec 221 does NOT:

- Replace LangGraph as the orchestration/control-flow layer.
- Replace Spec 199 MCP Gateway.
- Replace Spec 200 External Agent Gateway.
- Replace Spec 206 A2A interoperability.
- Replace `worker_jobs` / Unified Job Control Plane.
- Replace SmartAIHub Runner.
- Define a new billing ledger.
- Give arbitrary shell or filesystem access to ordinary users.
- Make Superpowers a mandatory installation on every Runner.
- Require every Skill change to use a heavyweight methodology.
- Allow external harnesses to directly mutate Marketplace production records.

---

## 5. Architectural Principles

### 5.1 SmartAIHub Is the System of Record

All engineering state MUST be owned by SmartAIHub:

- Skill identity
- Skill Contract
- Versions
- Drafts
- Tests
- Evals
- Approvals
- Artifacts
- Permissions
- Job state
- Audit events
- Billing references
- Publication state

External harnesses receive scoped work packages and return artifacts/results only.

### 5.2 Methodology Is Pluggable

The platform MUST support multiple methodology profiles:

```text
Methodology Engine
├── Quick
├── Standard
├── Thorough
├── Superpowers-Compatible
├── Regulated
└── Custom
```

No methodology may bypass platform policy, permissions, job tracking, cost controls, or publication gates.

### 5.3 Creation Permission Is Separate from Publication Permission

```text
CAN_CREATE
≠ CAN_RUN_PRIVILEGED
≠ CAN_PUBLISH_TENANT
≠ CAN_PUBLISH_MARKETPLACE
≠ CAN_OVERRIDE_SECURITY
```

### 5.4 UI First

The common workflow MUST be operable from SmartAIHub Web without direct file editing.

Advanced users MAY inspect/edit generated package files.

### 5.5 Safety by Capability, Not by User Interface

Hiding an advanced UI is not a security boundary. Every capability MUST be validated server-side.

---

## 6. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    SmartAIHub Web                           │
│                                                             │
│  Skills / Marketplace / Skill Studio / Review Console       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│             Skill Engineering Control Plane                 │
│                                                             │
│  Skill Contract                                             │
│  Methodology Engine                                         │
│  Build Planner                                              │
│  Test Engine                                                │
│  Eval Engine                                                │
│  Repair Controller                                          │
│  Review Engine                                              │
│  Compatibility Engine                                       │
│  Publication Controller                                     │
│  Cost Guard                                                 │
└───────────────┬───────────────────┬─────────────────────────┘
                │                   │
                ▼                   ▼
        Capability Registry      Policy Engine
                │                   │
                └──────────┬────────┘
                           ▼
                     LangGraph
                           │
                   Capability Resolver
        ┌──────────────────┼───────────────────┐
        ▼                  ▼                   ▼
 Internal Agent      External Agent         MCP / A2A
                         Gateway
                     (Spec 200)
        │                  │                   │
        └──────────────────┼───────────────────┘
                           ▼
                  Unified Job Control Plane
                    (`worker_jobs` SoT)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
          Cloud Exec     Runner      Provider APIs
                       Win/Mac/Linux
                           │
                           ▼
                    Library / R2 / DB
```

---

## 7. User Roles and Permissions

### 7.1 Required Roles

The implementation SHOULD support these logical roles even if internal role names differ:

1. **User**
2. **Skill Creator**
3. **Verified Creator**
4. **Team Admin**
5. **Tenant Admin**
6. **Reviewer**
7. **Security Reviewer**
8. **Marketplace Reviewer**
9. **Platform Admin**

Roles MAY be composed from fine-grained permissions.

### 7.2 Permission Matrix

| Capability | User | Skill Creator | Verified Creator | Team Admin | Tenant Admin | Reviewer | Security Reviewer | Marketplace Reviewer | Platform Admin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Use permitted Skill | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Create safe Personal Skill | Optional policy | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Create coded Skill | No | Policy-controlled | Yes | Policy | Yes | Review only | Review only | Review only | Yes |
| Run safe evals | Limited | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Run privileged evals | No | No | Limited | No | Limited | No | Review/sandbox only | No | Yes |
| Publish Personal | Yes/Policy | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Publish Team | No | Request | Yes/Policy | Yes | Yes | Review | Review | Review | Yes |
| Publish Tenant | No | Request | Request/Policy | Request | Yes | Review | Review | Review | Yes |
| Submit Marketplace | No | Yes | Yes | Yes/Policy | Yes | Yes | Yes | Yes | Yes |
| Approve Marketplace | No | No | No | No | No | No | Security gate only | Yes | Yes |
| Security approval/override | No | No | No | No | No | No | Approval within delegated policy | No | Yes |
| Global quarantine | No | No | No | No | No | No | Yes | Yes/Policy | Yes |
| Change platform execution policy | No | No | No | No | No | No | No | No | Yes |

### 7.3 Ordinary User Policy

Ordinary users MAY be allowed to create Personal Skills if all requested capabilities are classified as Safe.

Default Personal Skill restrictions:

```text
NO unrestricted shell
NO arbitrary filesystem access
NO raw platform database access
NO platform secret enumeration
NO admin APIs
NO unrestricted outbound network
NO runner administration
NO billing mutations
NO arbitrary code execution outside approved sandbox
```

### 7.4 Platform Admin-Only Capabilities

At minimum, Platform Admin approval is required for skills requesting capabilities equivalent to:

```text
shell:unrestricted
filesystem:anywhere
network:any
secret:read-global
database:raw-platform
worker:admin
runner:admin
billing:write
user:manage
plugin:install-global
mcp:register-global
system-policy:override
execute:arbitrary-host-code
```

### 7.5 Authorization Invariants

The authorization layer MUST enforce all of the following server-side:

- Deny by default for undeclared permissions.
- A role grants eligibility, not automatic access to every tenant/resource.
- Ownership and tenant membership are evaluated independently from role.
- Delegated reviewers MUST receive explicit scope, expiry, and tenant boundaries.
- Self-approval MUST be forbidden for Marketplace publication, Critical capabilities, and security overrides.
- Permission checks MUST be repeated at execution time, not only when a build is created.
- Loss of membership, suspension, credential revocation, or policy change MUST affect pending and future execution according to policy.
- Service accounts and automation identities MUST use the same policy engine and cannot inherit human UI privileges implicitly.

### 7.6 Enforceable Tenant Isolation

Tenant isolation MUST be enforced in data access and execution, not inferred from UI routing or request parameters.

Required controls:

- Every tenant-owned persistent record MUST carry an authoritative tenant/owner scope or inherit it through a validated parent relation.
- Database access MUST enforce tenant predicates centrally; PostgreSQL Row Level Security (RLS) SHOULD be used for tenant-scoped tables where compatible with the existing architecture, with service-role bypass restricted and audited.
- Object storage/Library paths, signed URLs, search indexes, caches, queues, job leases, event streams, and temporary artifacts MUST preserve tenant scope.
- Background workers MUST obtain tenant context from signed/authoritative job state rather than caller-supplied free-form fields.
- Cross-tenant administrative operations MUST use an explicit privileged path and MUST be audited with reason and target tenant.
- Tests MUST attempt confused-deputy attacks, identifier substitution, stale cache access, cross-tenant job pickup, and artifact URL reuse.
- Tenant context MUST NOT be accepted solely from client-controlled headers when an authenticated server-side mapping exists.


---

## 8. Skill Visibility and Publication Scopes

Supported visibility scopes:

```text
DRAFT
PERSONAL
TEAM
TENANT
MARKETPLACE
```

### 8.1 Personal

- Visible to owner only.
- No Marketplace review required for Safe capability class.
- Subject to platform security policies.

### 8.2 Team

- Shared within one workspace/team.
- Team Admin or delegated approver controls publication.

### 8.3 Tenant

- Available to users under a tenant/domain.
- Tenant Admin approves normal capabilities.
- Platform Admin still controls globally privileged capabilities.

### 8.4 Marketplace

Marketplace publication MUST require:

- Package validation
- Security scan
- Capability review
- Automated tests
- Behavior evals
- Regression checks
- Compatibility report
- License/metadata validation
- Reviewer approval
- Revenue-share metadata validation where applicable

---

## 9. Skill Types

The framework MUST NOT assume that all Skills are text prompts.

Initial supported types:

```text
llm
image
video
audio
data
workflow
agent
mcp
a2a
computer_use
ffmpeg
code
composite
```

Each Skill type MAY register type-specific:

- Schema validators
- Test runners
- Eval adapters
- Preview UI
- Security rules
- Artifact types
- Compatibility checks

---

## 10. Skill Package Standard

A generated Skill package SHOULD support:

```text
skill-root/
├── SKILL.md
├── manifest.json
├── schemas/
│   ├── input.schema.json
│   ├── ui.schema.json
│   └── output.schema.json
├── prompts/
├── examples/
├── assets/
├── tests/
├── evals/
├── fixtures/
├── docs/
└── src/                 # optional for coded skills
```

### 10.1 Required Manifest Fields

`manifest.json` SHOULD include at least:

```json
{
  "id": "skill_xxx",
  "name": "...",
  "version": "1.0.0",
  "manifest_schema_version": "1",
  "type": "llm",
  "owner_id": "...",
  "tenant_id": "...",
  "visibility": "personal",
  "entrypoint": "...",
  "capabilities": [],
  "supported_models": [],
  "required_tools": [],
  "required_secrets": [],
  "dependencies": [],
  "network_policy": {},
  "data_policy": {},
  "artifact_types": [],
  "license": "...",
  "min_platform_version": "..."
}
```

Field names MAY adapt to existing SmartAIHub conventions.

### 10.2 Package Identity, Signing, SBOM, and Provenance

Every release candidate MUST have a canonical package representation and deterministic content digest. Marketplace, Privileged, and Critical Skills MUST additionally produce:

- Package SHA-256 (or platform-approved successor).
- Signed release attestation bound to Skill ID, version, package hash, owner/publisher, build run, and timestamp.
- Build provenance identifying source draft, methodology version, builder/harness, Runner image/environment, and dependency lock.
- Software Bill of Materials (SBOM) for executable/runtime dependencies where applicable.
- Dependency vulnerability scan results and policy decision.
- Artifact malware/content scan results where applicable.

Signatures and attestations MUST be generated by platform-controlled signing identities, not by an untrusted external harness. Private signing keys MUST never be exposed to Skill code or LLM context. Installation/execution SHOULD verify release identity before use according to policy.

### 10.3 Package Parser Hardening

Import/build tooling MUST reject unsafe archives and filesystem constructs, including:

- path traversal (`../`), absolute paths, device files, unsafe symlinks/hardlinks;
- ZIP/tar bombs and excessive decompression ratio;
- excessive file count, nesting depth, individual file size, and aggregate unpacked size;
- duplicate/conflicting paths after normalization or case folding;
- executable artifacts that violate declared package type/policy.

Parsing MUST occur in a constrained staging area before any package is trusted or exposed to a Runner.

---

## 11. Skill Contract

Every Skill MUST have a versioned Skill Contract stored separately from generated implementation artifacts.

### 11.1 Contract Purpose

The Skill Contract defines what the Skill intends to do and provides the source for tests, evals, review, and publication.

### 11.2 Contract Fields

Minimum recommended fields:

```text
name
purpose
problem_statement
intended_users
skill_type
inputs
outputs
behavior_requirements
quality_requirements
allowed_tools
requested_capabilities
forbidden_actions
supported_models
supported_providers
expected_artifacts
latency_target
cost_target
privacy_class
data_residency_requirement
data_retention_requirement
side_effects
idempotency_expectation
network_egress_policy
connector_requirements
secret_requirements
dependency_policy
rollout_policy
rollback_policy
failure_behavior
human_approval_points
acceptance_criteria
```

### 11.3 Contract Change Rules

Material contract changes MUST produce a new draft revision and invalidate stale eval/review evidence.

Examples of material changes:

- Adding shell access
- Adding network access
- Changing output contract
- Changing external provider
- Changing allowed data classes
- Changing target audience
- Adding write-side effects

### 11.4 Evidence Dependency Graph and Invalidation

Tests, evals, reviews, approvals, compatibility results, and certification MUST declare the immutable inputs they depend on (for example contract revision, package digest, prompt hash, capability set, dependency lock, policy version, model/judge envelope).

When a draft/package/tool configuration is edited, the platform MUST invalidate or mark stale every downstream evidence item whose dependency inputs changed. It SHOULD avoid unnecessarily invalidating unrelated evidence when dependency scopes are known. A manually edited package after successful eval MUST NOT retain a green certification badge until affected evidence is recomputed.

The UI SHOULD show *why* evidence became stale and which stages need rerun.

---

## 12. Methodology Profiles

### 12.1 Quick

Use for low-risk, trivial changes.

Flow:

```text
Requirement
→ Direct edit/generation
→ Minimal validation
→ Verify
```

Examples:

- Description text
- Metadata update
- UI label
- Example correction

### 12.2 Standard

Default for normal Skill development.

```text
Requirement
→ Skill Contract
→ Generate
→ Tests
→ Evals
→ Verify
```

### 12.3 Thorough

For complex production Skills.

```text
Requirement
→ Design
→ Contract
→ Baseline
→ Plan
→ Generate
→ Tests
→ Evals
→ Repair
→ Cross-model
→ Review
→ Verify
```

### 12.4 Superpowers-Compatible

Use Superpowers-inspired discipline where appropriate:

- Brainstorm/design before implementation
- Explicit implementation plan
- Test-first behavior where practical
- Systematic debugging
- Fresh specialist agents when beneficial
- Independent review
- Evidence before declaring success

SmartAIHub MAY use a native implementation of these ideas or an external Superpowers-enabled harness.

### 12.5 Regulated

For financial, security-sensitive, enterprise, or other policy-controlled workflows.

Adds mandatory:

- Human approval
- Security review
- Stronger audit retention
- Strict model/provider allowlist
- Mandatory regression suite
- Side-effect simulation where possible

### 12.6 Custom

Tenant or platform-defined methodology composed from approved workflow stages.

---

## 13. Methodology Adapter Interface

Conceptual interface:

```text
MethodologyAdapter
  analyze_requirement()
  propose_contract()
  plan_build()
  generate_tests()
  run_baseline()
  implement()
  debug_failure()
  request_review()
  verify_completion()
```

Adapter responses MUST be normalized back to SmartAIHub-owned records.

External methodologies MUST NOT directly alter publication state.

---

## 14. Superpowers Integration Strategy

### 14.1 Integration Modes

Support three modes:

#### Mode A — Native SmartAIHub Equivalent

SmartAIHub implements equivalent methodology concepts using its own agents/workflows.

#### Mode B — External Harness with Superpowers Installed

If a selected harness supports Superpowers natively and the Runner environment has it installed, SmartAIHub MAY invoke the appropriate workflow/profile.

#### Mode C — No Superpowers

Fallback to SmartAIHub methodology with no loss of core platform functionality.

### 14.2 No Mandatory Installation

SmartAIHub Runner MUST NOT require `git clone obra/superpowers` as a platform prerequisite.

### 14.3 Version Pinning

If external Superpowers is used:

- Pin version/commit for reproducibility.
- Record methodology version with each build/eval run.
- Do not silently upgrade production evaluations.

### 14.4 Methodology Semantics Compatibility

The adapter MUST NOT assume that the upstream Superpowers workflow is static. Current upstream concepts include mandatory skill discovery, RED-GREEN-REFACTOR for skill authoring, pressure-scenario testing, systematic debugging, verification-before-completion, and harness-specific behavior evals. SmartAIHub MUST map upstream changes into a versioned adapter contract rather than copying unversioned prompt text into production.

A methodology upgrade MUST be treated like a dependency upgrade: evaluate against a representative regression suite before promoting it as a default profile.

---

## 15. Skill Engineering Pipeline

Canonical pipeline:

```text
1. Intake
2. Requirement Analysis
3. Skill Contract
4. Risk Classification
5. Methodology Selection
6. Baseline Scenario Generation
7. Baseline Execution
8. Build Plan
9. Skill Generation
10. Deterministic Tests
11. Behavior Evals
12. Failure Diagnosis
13. Repair Loop
14. Regression
15. Cross-model Compatibility
16. Security Review
17. Human Review if required
18. Verification Gate
19. Release Candidate
20. Publish / Promote
```

Each stage MUST persist status and artifacts.

---

## 16. Baseline Evaluation

Baseline evaluation is a first-class requirement for behavior-oriented Skills where a meaningful no-skill comparison exists.

### 16.1 Purpose

Determine whether the Skill materially improves the target behavior over the underlying model/agent.

### 16.2 Example

```text
Scenario:
- 2 character images
- 3 product images
- Generate exactly 9 shots
- Preserve character identity
- Preserve product identity
- Thai dialogue

WITHOUT SKILL:
9 shots             PASS
identity            FAIL
product consistency PASS
continuity          FAIL
Thai dialogue       PASS

WITH SKILL:
9 shots             PASS
identity            PASS
product consistency PASS
continuity          PASS
Thai dialogue       PASS
```

### 16.3 Baseline Exceptions

Baseline MAY be skipped if:

- Skill is pure deterministic code.
- No meaningful underlying no-skill behavior exists.
- Security policy prohibits the comparison.

Skip reason MUST be recorded.

---

## 17. Tests vs Evals

Tests and Evals MUST be separate concepts.

### 17.1 Tests

Tests validate deterministic behavior:

- JSON schema
- API contract
- Input/output types
- Permission enforcement
- Tool binding
- Error handling
- Package integrity
- Deterministic transformation
- Side-effect controls

### 17.2 Evals

Evals assess probabilistic model/agent behavior:

- Instruction following
- Quality
- Relevance
- Hallucination tendency
- Character consistency
- Story coherence
- Tool selection
- Safety policy adherence
- Prompt injection resilience
- Cross-model consistency
- Skill discoverability/triggering
- Capability Resolver selection accuracy
- False-positive invocation avoidance

### 17.3 Eval Judge Types

Support:

```text
Deterministic Judge
LLM Judge
Vision Judge
Audio Judge
Video Judge
Human Judge
Composite Judge
```

---

## 18. Evaluation Scenario Types

Minimum evaluation categories:

```text
normal
edge_case
missing_input
ambiguous_input
conflicting_instruction
malformed_input
large_input
provider_failure
timeout
prompt_injection
tool_failure
partial_tool_failure
rate_limit
privacy_boundary
cross_tenant_attempt
cost_stress
regression
```

Skill type adapters MAY define additional scenarios.

### 18.1 Evaluation Dataset Governance

Evals MUST distinguish at least:

- **Authoring set** — visible examples used while creating the Skill.
- **Regression set** — repeatable scenarios visible to authorized maintainers.
- **Hidden holdout set** — scenarios not exposed to the builder/repair agent, used to detect overfitting.
- **Adversarial set** — pressure, injection, abuse, and boundary scenarios.
- **Production-derived set** — sanitized/anonymized failures admitted only under privacy policy.

Marketplace certification MUST NOT rely only on scenarios generated by the same builder agent in the same run. Hidden holdout content and judge keys MUST be isolated from builder prompts and external harnesses. Dataset versions, provenance, ownership, and retention policy MUST be recorded.

Evaluation data MUST be checked for accidental secrets, cross-tenant content, poisoned fixtures, and copyrighted/licensed material that cannot legally be redistributed.

### 18.2 Tiered Micro-Evals Before Expensive Full Runs

To control latency and token cost, the engineering workflow SHOULD use a tiered sequence:

```text
Static/Schema Checks
→ Micro-Evals (fresh context, small focused scenarios)
→ Targeted Pressure/Behavior Evals
→ Full Regression/Holdout Suite
→ Cross-model/Multimodal Suite when required
```

Micro-evals are an optimization, not a substitute for final representative scenarios. Each sample SHOULD use a fresh context when the goal is to test Skill wording/behavior rather than accumulated conversation state. Failed cheap gates MAY stop progression before expensive suites. This mirrors the current upstream Superpowers skill-authoring practice of testing wording cheaply before full pressure scenarios.

---

## 19. Evaluation Metrics

Possible metrics include:

- Pass/fail acceptance criteria
- Exact schema compliance
- Task success rate
- Tool success rate
- Hallucination rate
- Refusal correctness
- Safety compliance
- Continuity score
- Identity consistency score
- Latency
- Tokens
- Credit cost
- External provider cost
- Retry count
- Model compatibility

The system MUST preserve raw evidence in addition to aggregate scores.

### 19.1 Eval Reliability and Statistical Policy

For probabilistic evaluations, the platform MUST avoid treating a single LLM-judge response as definitive evidence. Policies SHOULD support:

- repeated trials where model stochasticity materially affects results;
- predefined pass thresholds and minimum sample sizes;
- confidence intervals or equivalent uncertainty reporting for rates;
- paired baseline-vs-Skill comparison on the same scenario/model/provider settings where possible;
- calibration examples for LLM judges;
- judge-model/version pinning;
- tie/uncertain outcomes routed to another judge or human review;
- periodic human audit of automated judge agreement;
- separation between builder model and independent reviewer/judge where risk warrants it.

The UI MUST distinguish `PASS`, `FAIL`, `INCONCLUSIVE`, `ERROR`, `TIMEOUT`, and `NOT_RUN`. Infrastructure failure MUST NOT be counted as model/Skill failure.

### 19.2 Baseline Fairness

Baseline and Skill runs SHOULD hold constant the model, provider, temperature/sampling settings, tool availability, reference inputs, and relevant environment whenever technically possible. If they differ, the comparison MUST be labeled non-equivalent and the reason recorded.

### 19.3 Evaluation Dataset Lineage, Contamination, and Poisoning

Every certification-relevant eval dataset/version MUST record provenance and lineage including creator/source, creation time, applicable license/consent, transformations, scenario version, expected-output authority, and access class.

The platform MUST reduce contamination and gaming risk by:

- separating author-visible development cases from hidden certification holdouts;
- preventing builder/reviewer agents from receiving hidden answer keys or judge rubrics unless explicitly required;
- detecting duplicate/near-duplicate scenarios across train/development/holdout sets where practical;
- recording whether production-derived cases were user-reported, automatically sampled, synthetic, or manually curated;
- quarantining suspicious eval contributions instead of immediately allowing them to influence certification;
- versioning datasets immutably once used as release evidence;
- tracking scenario removals/edits so historical certification remains explainable;
- preventing a Skill author from unilaterally replacing failed certification scenarios with easier equivalents.

### 19.4 Model, Provider, Tool, and Judge Drift

Certification evidence has a freshness dimension. The system MUST be able to invalidate or mark evidence stale when a materially relevant dependency changes, including model revision/alias behavior, provider API/tool schema, judge model, MCP/A2A capability, Runner runtime, or policy version.

Drift handling SHOULD support:

```text
change detected
→ dependency impact query
→ evidence marked AT_RISK / STALE where applicable
→ targeted regression
→ compatibility/certification update
→ notify owner/reviewer
```

A provider outage or transient infrastructure error MUST NOT automatically be classified as Skill behavioral regression.


---

## 20. Cross-Model Compatibility

Skill Studio SHOULD support a compatibility matrix:

```text
                 GPT    Claude   Gemini   GLM   Other
Scenario 01       ✓       ✓        ✓       ✓
Scenario 02       ✓       ✓        ✗       ✓
Scenario 03       ✓       ✓        ✓       ✗
```

Compatibility claims shown in Marketplace MUST come from a known evaluation run or explicit unverified declaration.

Suggested statuses:

```text
VERIFIED
PARTIAL
EXPERIMENTAL
UNTESTED
UNSUPPORTED
```

### 20.1 Skill Discovery and Resolver Compatibility

A Skill can be correct when explicitly invoked yet still fail in production because the Capability Resolver does not select it appropriately. Certification SHOULD therefore evaluate both:

- **Positive trigger set:** tasks for which the Skill should be selected.
- **Negative/near-neighbor set:** similar tasks for which the Skill should not be selected.
- **Ambiguous set:** tasks where resolver confidence should be low or user choice should be requested.

Track at minimum selection success, false-positive invocation, false-negative/missed invocation, and top-k ranking where the resolver supports ranked candidates. Changes to Skill name/description/discovery metadata SHOULD invalidate resolver-specific evidence even if implementation behavior is unchanged.

---

## 21. Automatic Repair Loop

When a test/eval fails:

```text
Failure
  ↓
Evidence Bundle
  ↓
Root Cause Analysis
  ↓
Proposed Fix
  ↓
Patch Draft
  ↓
Targeted Re-test
  ↓
Regression Suite
```

### 21.1 Bounded Retries

Default:

```text
max_auto_repair_rounds = 3
```

Configurable by methodology/policy.

After exhaustion:

```text
NEEDS_HUMAN_REVIEW
```

### 21.2 Repair Safety

Automatic repair MUST NOT silently grant new capabilities or broaden network/filesystem/secret permissions.

Permission expansion requires explicit reclassification and approval.

---

## 22. Multi-Agent Review

Complex Skills SHOULD support role-separated review:

```text
Builder Agent
    ↓
Requirement Reviewer
    ↓
Implementation Reviewer
    ↓
Security Reviewer
    ↓
Eval Reviewer
    ↓
Compatibility Reviewer
```

Where practical, reviewer context SHOULD be isolated from builder chain-of-thought/prompt history and instead use persisted artifacts/evidence.

Different providers/models MAY be used per role.

---

## 23. Completion Verification Gate

No Skill build may transition to `READY_FOR_RELEASE` solely because an agent says it is finished.

Required verification evidence MAY include:

```text
package validation passed
tests passed
required evals passed
security policy passed
acceptance criteria satisfied
required artifacts exist
cost budget respected
required approvals complete
```

The verification gate MUST be machine-readable.

---

## 24. Skill Lifecycle

Recommended lifecycle:

```text
DRAFT
  ↓
PLANNING
  ↓
BUILDING
  ↓
TESTING
  ↓
EVALUATING
  ↓
REPAIRING
  ↓
REVIEW_REQUIRED / REVIEWING
  ↓
RELEASE_CANDIDATE
  ↓
APPROVED
  ↓
PUBLISHED
  ↓
DEPRECATED
```

Exceptional states:

```text
FAILED
CANCELLED
BLOCKED
QUARANTINED
REVOKED
```

### 24.1 Authoritative State Machine and Atomic Transitions

Lifecycle labels MUST be implemented as an explicit server-side state machine rather than free-form status strings. Each transition MUST define:

- allowed source states;
- allowed destination states;
- required actor/role and policy decision;
- required immutable evidence/revision;
- transition preconditions;
- whether side effects are permitted;
- emitted audit/event records;
- retry/idempotency semantics.

Transitions MUST use atomic compare-and-set/revision preconditions so concurrent actors cannot double-publish, approve a superseded revision, or move a release from a terminal security state back to an executable state accidentally. Illegal transitions MUST fail with a stable conflict/state-transition error code.

`QUARANTINED` and `REVOKED` are security states and MUST NOT be cleared by ordinary lifecycle progression. Restoration requires an explicitly authorized remediation/review transition with fresh evidence.

---

## 25. Versioning Rules

### 25.1 Drafts

Drafts are mutable.

### 25.2 Published Releases

Published versions MUST be immutable.

Each release SHOULD retain:

- Version number
- Content hash
- Package hash
- Contract revision
- Eval snapshot
- Compatibility snapshot
- Review decisions
- Capability list
- Methodology version
- Build provenance
- Publication actor/time

### 25.3 New Changes

Editing a published Skill creates a new draft:

```text
v1.2.0 published
      ↓ Edit
v1.3.0-draft
```

### 25.4 Rollback

Rollback means promoting a previous immutable version, not mutating history.

### 25.5 Semantic Compatibility and Contract Evolution

The platform SHOULD apply semantic-versioning rules (or a documented equivalent) to Skill contracts:

- breaking input/output/capability/side-effect changes require a major/breaking release classification;
- backward-compatible feature additions require a minor classification;
- non-breaking fixes/documentation may be patch-level.

Schema compatibility MUST be machine-checked where possible. A new release MUST identify migrations required for saved workflows, composite Skills, scheduled jobs, and API consumers.

### 25.6 Rollback, Data Migration, and Irreversible Side Effects

A code/package rollback is not sufficient when a release has changed persisted data, external systems, connector state, or irreversible side effects. Every breaking release SHOULD declare its rollback class:

```text
PACKAGE_ONLY
BACKWARD_COMPATIBLE_DATA
MIGRATION_WITH_DOWNGRADE_PATH
FORWARD_ONLY
IRREVERSIBLE_EXTERNAL_EFFECT
```

Publication/rollout policy MUST block automatic rollback claims when the required data/schema downgrade or external compensation path does not exist. Forward-only migrations require a tested roll-forward/remediation procedure. Release evidence SHOULD include compatibility with the immediately previous supported production version and restoration procedure for saved workflows/composite Skills.

---

## 26. Security Model

### 26.1 Risk Classes

Suggested classes:

```text
SAFE
RESTRICTED
PRIVILEGED
CRITICAL
```

### 26.2 Safe

Typical:

- Prompt transformation
- LLM generation
- Approved RAG reads
- Read-only safe metadata

### 26.3 Restricted

Typical:

- Approved outbound APIs
- MCP tools
- Tenant-scoped data access
- Controlled writes

### 26.4 Privileged

Typical:

- Shell
- Filesystem writes
- Desktop automation
- Runner execution
- Credential usage
- Code execution

### 26.5 Critical

Typical:

- Global admin actions
- Billing mutation
- User administration
- Platform secret access
- Security-policy modification
- Arbitrary host execution

### 26.6 Capability Escalation

Any change that increases risk class MUST invalidate prior security approval.

### 26.7 Separation of Duties and Break-Glass

For Marketplace publication, Critical capabilities, global security override, signing-policy changes, or global quarantine reversal:

- the author MUST NOT be the sole approver;
- policy SHOULD support two-person/four-eyes approval for high-risk actions;
- break-glass actions MUST require an explicit reason, elevated re-authentication/MFA when available, short-lived authorization, and high-priority audit/notification;
- break-glass MUST NOT erase failed security findings or bypass immutable audit records;
- emergency access MUST expire automatically.

### 26.8 Cryptography and Key Management

Sensitive Skill engineering data MUST use transport encryption and platform-approved encryption at rest where supported by the underlying storage/database service. Secrets, signing keys, webhook secrets, and high-value encryption keys MUST be held in the platform secret/KMS mechanism rather than Skill packages or source-controlled configuration.

Requirements:

- key usage is least-privileged and auditable;
- production signing keys are separated from ordinary application credentials;
- key rotation/revocation procedures exist without rewriting immutable historical evidence incorrectly;
- signed evidence retains key identifier/algorithm metadata sufficient for later verification;
- compromised keys can be revoked and affected releases/evidence can be enumerated;
- secret values are never written to normal application logs, eval transcripts, or downloadable reports.

### 26.9 Data Loss Prevention and Redaction

Before content is sent to external models/harnesses or persisted in logs, policy SHOULD classify and minimize sensitive content. The platform MUST support redaction/masking rules for secrets, credentials, session tokens, obvious high-risk identifiers, and tenant-configured sensitive fields.

Logs and traces MUST prefer structured metadata and hashes/handles over raw payloads. Raw prompt/response capture, when enabled for debugging or eval evidence, requires an explicit retention/data-class policy and authorization boundary.

### 26.10 Security Incident Response and Advisory Lifecycle

The platform MUST define an incident path for malicious/vulnerable Skills, compromised signing credentials, dependency incidents, leaked secrets, or sandbox escapes. It MUST support:

- emergency quarantine/revocation and global execution kill switch;
- identification of affected Skill versions, installs, tenants, jobs, artifacts, and dependencies;
- preservation of forensic evidence with restricted access;
- security advisory status and remediation version links;
- owner/tenant notification according to severity and disclosure policy;
- post-incident re-evaluation/re-certification before trust is restored.


---

## 27. Sandbox and Execution Boundaries

A Skill execution MUST use the least-privileged execution environment suitable for the task.

```text
Safe Skill
→ server-side managed runtime

Restricted Skill
→ constrained sandbox / scoped connector

Privileged Skill
→ approved Runner / isolated environment

Critical Skill
→ admin-only execution path + explicit approval
```

Secrets MUST be referenced through secret handles, not embedded into generated Skill files.

### 27.1 Sandbox Resource and Isolation Requirements

Sandbox/Runner execution policy MUST be able to constrain:

- CPU, memory, wall time, process count, disk, temporary storage, and output size;
- network egress destinations/protocols;
- filesystem roots and mount mode;
- environment variables and injected credentials;
- tool/API call count and concurrency;
- child process creation and executable allowlists where applicable.

Untrusted code SHOULD execute in an ephemeral environment that is destroyed after the run unless explicitly configured otherwise. Host Docker socket, platform metadata services, privileged devices, and unrelated tenant mounts MUST NOT be reachable.

### 27.2 Network Egress and SSRF Controls

Restricted/Privileged Skills with outbound access MUST use a policy-aware egress layer. Requirements include:

- deny-by-default destinations;
- canonical domain/URL validation;
- protection against SSRF to loopback, link-local, private management networks, cloud metadata endpoints, and internal control-plane services;
- DNS rebinding/redirect re-validation;
- protocol and port restrictions;
- optional per-request user approval for novel destinations;
- egress audit containing destination class without leaking credentials/query secrets.

### 27.3 Secrets and Connector Consent

Credentials MUST use scoped handles/tokens with least privilege and rotation/expiry where supported. The platform MUST distinguish:

1. **Skill permission** — the Skill is allowed to request a connector/tool.
2. **User/tenant grant** — this specific user/tenant has authorized the connector scope.
3. **Runtime authorization** — the current invocation is allowed to perform the requested action.

OAuth/connector consent MUST show requested scopes and side effects. A Skill package MUST NOT contain refresh tokens, API keys, session cookies, or raw credentials. Sensitive values SHOULD be excluded/redacted from model prompts whenever the tool can consume a handle directly.

### 27.4 Runner Trust, Attestation, and Compatibility

A registered SmartAIHub Runner MUST be treated as a separately authenticated execution principal. Jobs requiring privileged/local execution MUST verify runner identity and policy compatibility before dispatch/claim.

Runner registration/heartbeat SHOULD report signed or authenticated metadata including:

```text
runner_id
runner_version
runtime/os/arch
supported capability classes
sandbox/runtime versions
available execution adapters
tenant/user ownership scope
last policy/config sync
```

The control plane MUST be able to block outdated, revoked, untrusted, or policy-incompatible Runners from privileged jobs. Runner-reported facts are evidence inputs, not authorization decisions by themselves. Critical release/signature checks SHOULD be revalidated at execution time.

### 27.5 Side-Effect Safety, Dry Run, and Irreversible Actions

Skills capable of writes or external side effects MUST declare side-effect classes such as `READ_ONLY`, `REVERSIBLE_WRITE`, `EXTERNAL_WRITE`, `FINANCIAL`, `DESTRUCTIVE`, or equivalent.

Where technically possible, the platform SHOULD support dry-run/preview for consequential actions. Policy MUST be able to require just-in-time human approval for irreversible, destructive, high-cost, or financial side effects even when the Skill itself is already installed.

Approval UI MUST show the intended target, material parameters, estimated cost/impact where known, and whether rollback/compensation exists. A generic prior consent to install a Skill MUST NOT substitute for approval of a newly requested high-impact action when policy requires per-action confirmation.

### 27.6 Authorization-at-Use and TOCTOU Protection

Authorization MUST be re-evaluated at the point a consequential capability is actually used, not only when the job was created or queued. This prevents time-of-check/time-of-use (TOCTOU) failures when a user is disabled, a grant is revoked, tenant policy changes, a Skill is quarantined, a Runner becomes untrusted, or an approval expires while work is waiting.

For Restricted/Privileged/Critical actions, the execution layer SHOULD carry a short-lived, audience-bound capability authorization/reference containing the actor, tenant, Skill/version, requested operation, material target scope, policy decision/version, and expiry. It MUST NOT be a transferable bearer of broader authority than the approved action.

A stale authorization MUST fail closed for high-risk actions. Re-authorization MUST NOT mutate or silently broaden the original approved parameters; if material parameters change, policy/approval is evaluated again.

---

## 28. Prompt Injection and Tool Abuse Controls

The evaluation suite SHOULD test:

- Attempts to override Skill policy
- Attempts to reveal secrets
- Attempts to invoke unapproved tools
- Cross-tenant data requests
- Instructions embedded in uploaded documents/images
- Malicious tool responses
- Indirect prompt injection

Tool calls MUST still be authorized by server-side policy even if the model requests them.

### 28.1 Skill Content Trust Hierarchy

Marketplace/Tenant Skill instructions are application content, not platform system policy. Runtime prompt assembly MUST preserve an explicit trust hierarchy so a Skill cannot redefine platform authorization, hidden policy, billing, tenant boundaries, or approval requirements.

The platform SHOULD isolate Skill instructions from user-provided/reference content with typed message/context boundaries where supported. Skill content itself MUST be treated as potentially malicious during review/import: a package that says "ignore platform policy" receives no additional authority. Tool authorization is determined from declared capabilities + grants + runtime policy, never from prose inside `SKILL.md` or prompts.

### 28.2 Tool, MCP, A2A, and Connector Response Trust

Tool/MCP/A2A/connector responses are untrusted data, not authorization or system policy. A remote tool MUST NOT gain additional privileges by returning instructions that ask the model to call another tool, reveal credentials, change tenant context, or widen a target scope.

The control plane MUST defend against confused-deputy behavior by binding every tool call to the initiating actor/tenant/Skill/run and re-authorizing each capability hop. Delegation chains SHOULD be depth-bounded and auditable. Dynamic tool metadata/discovery results MUST be validated and policy-filtered before becoming callable capabilities.

Marketplace certification SHOULD include malicious-tool-response scenarios for Skills that consume MCP/A2A/external tool output.

---

## 29. Cost Guard and Credits

Skill engineering may involve many model calls and MUST have explicit budget controls.

### 29.1 Estimate Before Execution

UI SHOULD show:

```text
Estimated Build Cost
- Planning
- Builder
- Tests
- Evals
- Review
- Vision/Audio/Video judges
- External provider costs
```

### 29.2 Budget Limits

Support:

```text
soft_budget
hard_budget
max_agent_runs
max_eval_runs
max_repair_rounds
max_external_cost
```

### 29.3 Hard Budget Behavior

When hard budget is reached:

```text
PAUSE / BLOCK
→ ask user for explicit continuation
```

No silent cost overrun.

### 29.4 Billing Source of Truth

Spec 221 MUST call existing SmartAIHub credits/billing services and MUST NOT create a separate ledger.

### 29.5 Quotas, Rate Limits, and Cost Attribution

In addition to per-run budgets, the platform MUST support policy-controlled limits by user, team, tenant, Skill, model/provider, and external harness. Limits MAY include concurrent engineering runs, daily/monthly credit ceiling, eval volume, artifact storage, outbound calls, and privileged Runner minutes.

Every cost event MUST be attributable to engineering run → stage → child job → provider/harness/Skill version so that disputes and runaway-cost investigations are reconstructable. Provider retry/fallback policy MUST avoid accidental double charging where idempotent provider semantics exist.

### 29.6 Atomic Credit Reservation and Settlement

Parallel child jobs MUST NOT independently observe the same remaining credit balance and overspend it. Before starting billable work, the platform MUST use the existing billing service to atomically reserve/authorize a bounded amount or otherwise provide equivalent concurrency-safe admission control.

The cost lifecycle SHOULD distinguish:

```text
ESTIMATED → RESERVED/AUTHORIZED → INCURRED → SETTLED
                                ↘ RELEASED/EXPIRED
```

Reservations MUST have expiry/reconciliation behavior for crashed jobs. Final settlement MUST be idempotent and keyed to the provider/job cost event so retries cannot double-debit. Provider-reported late usage/corrections MUST reconcile against the original cost lineage rather than creating an unrelated charge.

---

## 30. Job Execution and Reliability

All long-running Skill Engineering actions MUST integrate with the existing Unified Job Control Plane and `worker_jobs` source of truth.

### 30.1 Job Examples

```text
skill.contract.generate
skill.baseline.run
skill.build
skill.test.run
skill.eval.run
skill.repair
skill.review
skill.compatibility.run
skill.publish.validate
```

### 30.2 Required Job Properties

- Idempotency key
- Lease
- Heartbeat
- Retry policy
- Progress
- Event stream
- Artifact references
- Cancellation
- Timeout
- Parent/child job relationship
- Cost counters

### 30.3 Browser Independence

Closing the browser MUST NOT cancel server-side execution unless explicitly requested.

### 30.4 Workflow DAG, Outbox, DLQ, and Replay

An engineering run is a durable parent workflow whose stages/child jobs form an explicit DAG. The implementation MUST define:

- atomic state/event publication using the Unified Job Control Plane outbox pattern where available;
- deduplication of duplicate deliveries/results;
- terminal vs retryable error taxonomy;
- dead-letter/manual-intervention state for repeatedly failing child jobs;
- resumability from the last committed stage;
- replay tooling for authorized operators using immutable input snapshots;
- compensation semantics for external side effects that cannot be rolled back;
- prevention of a stale/late child result from overwriting a newer run revision.

A retry MUST never republish a Skill, re-charge an irreversible external purchase, or repeat a write-side effect unless the operation has an appropriate idempotency/compensation contract.

### 30.5 Provider Resilience and Retry Discipline

Calls to external LLM/model/tool/harness providers MUST use bounded exponential backoff with jitter where appropriate and honor provider retry/rate-limit hints. The platform SHOULD implement per-provider/tenant circuit breakers and bulkheads so one failing provider cannot create retry storms or exhaust the entire job pool.

Fallback to another provider/model MUST be policy-permitted and MUST record that execution conditions changed. A fallback that changes certification comparability MUST not silently reuse the original evidence label.

### 30.6 Fair Scheduling, Backpressure, and Noisy-Neighbor Protection

The Unified Job Control Plane integration MUST support admission control and fair scheduling across users/tenants so one tenant's large eval campaign cannot starve interactive or unrelated workloads.

Policies SHOULD support:

- per-tenant/user concurrency ceilings;
- priority classes with starvation prevention;
- bounded queues/backpressure and load shedding for non-critical optional work;
- separate pools/quotas for privileged Runner, multimodal, or expensive eval jobs;
- cancellation of obsolete superseded draft jobs;
- quota visibility in UI before launching very large eval campaigns.

### 30.7 Lease Fencing and Stale Worker Result Rejection

Lease ownership MUST include a monotonically increasing attempt/fencing generation (or equivalent authoritative token). A worker whose lease expired or was superseded MUST NOT be able to commit a late state transition, artifact promotion, billing settlement, or publication result using an old lease.

Heartbeat renewal alone is insufficient protection: every authoritative write from a worker/Runner MUST be checked against current job attempt/revision ownership. Artifact uploads from stale attempts MAY be retained as diagnostic evidence but MUST NOT be promoted as the canonical result.

### 30.8 Event Delivery, Ordering, and Consumer Idempotency

Internal events SHOULD use an outbox + idempotent-consumer/inbox pattern or equivalent. Consumers MUST tolerate duplicate delivery and MUST NOT assume global total ordering. Where order matters per engineering run/Skill version, events MUST carry an aggregate revision/sequence so older events cannot overwrite newer state.

Event handlers MUST validate tenant/aggregate identity and schema version before applying state. Poison events that repeatedly fail decoding/business validation MUST enter a bounded dead-letter/operator workflow rather than blocking an entire partition/consumer indefinitely.

---

## 31. External Agent Gateway Integration

Spec 221 SHOULD use Spec 200 for external harness execution.

Possible harnesses:

```text
Codex
Claude
Grok
Gemini
Hermes
other registered external agents
```

The user MAY select a harness when permitted, or SmartAIHub MAY propose alternatives.

SmartAIHub MUST preserve user agency when multiple harness options exist by presenting tradeoffs such as:

- Capabilities
- Estimated cost
- Expected latency
- Model/provider availability
- Local vs cloud execution
- Required permissions

The platform MAY recommend a default based on technical fit, but MUST allow policy-permitted alternatives.

### 31.1 External Harness Trust Boundary

Outputs from an external harness are untrusted inputs until validated. The gateway MUST:

- provide the minimum repository/files/tool scope required;
- bind work to an immutable task/contract revision;
- validate returned patches/packages before import;
- reject undeclared capability expansion;
- prevent harness output from directly marking tests/evals/reviews as passed;
- record harness/version/environment provenance;
- distinguish locally authenticated subscription/CLI execution from platform API execution for policy and billing;
- support revocation of a registered machine/Runner without invalidating historical evidence.

---

## 32. A2A and MCP Integration

Spec 221 MAY use:

- MCP tools through Spec 199
- A2A-capable agents through Spec 206

The Skill Engineering pipeline MUST consume these through the shared Capability Resolver rather than hardcoded direct integrations.

---

## 33. Skill Studio UI Information Architecture

Primary navigation:

```text
Skills
├── My Skills
├── Team Skills
├── Tenant Skills
├── Marketplace
└── Skill Studio
```

Within Skill Studio:

```text
Overview
Contract
Builder
Inputs
Outputs
Tools
Permissions
Tests
Evaluations
Compatibility
Cost
Versions
Review
Analytics
Advanced Files
```

### 33.1 Web Application and Session Security

Because Skill Studio can trigger privileged backend actions, the Web UI MUST follow the platform Web security baseline. At minimum:

- state-changing requests require anti-CSRF protections appropriate to the authentication/session model;
- rendered Skill descriptions, logs, eval output, Markdown/HTML, filenames, and provider/tool messages are escaped/sanitized against stored/reflected XSS;
- Content Security Policy and frame-ancestor/clickjacking protections SHOULD be enabled where compatible;
- sensitive actions SHOULD require recent authentication/MFA step-up according to platform policy;
- session/authorization checks occur server-side on every action; hidden buttons or client-side role checks are never security boundaries;
- download previews of untrusted HTML/SVG/archives MUST use safe content-disposition/sandboxing rules rather than executing in the SmartAIHub origin.

---

## 34. Create Skill UX

Initial screen:

```text
┌──────────────────────────────────────────────┐
│ Create a Skill                               │
│                                              │
│ What should this Skill do?                   │
│ ┌──────────────────────────────────────────┐ │
│ │ Describe the desired outcome...          │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ References                                   │
│ [Files] [Existing Skill] [URL] [Repo]        │
│                                              │
│ Development Mode                             │
│ [Standard ▼]                                 │
│                                              │
│ Visibility                                   │
│ [Personal ▼]                                 │
│                                              │
│               [Build Skill]                  │
└──────────────────────────────────────────────┘
```

The user SHOULD NOT need to create JSON schemas manually.

---

## 35. Basic vs Advanced UI

### Basic

Shows:

- Purpose
- Inputs
- Outputs
- Test status
- Eval status
- Cost
- Publish controls

### Advanced

Shows:

- Manifest
- Schema JSON
- Prompt files
- Source code
- Capability IDs
- Provider configuration
- Raw eval evidence
- Job events

User permissions still apply in both modes.

---

## 36. Skill Contract Review UI

After requirement analysis, show a structured review before build when methodology requires it:

```text
Purpose
Inputs
Outputs
Allowed Tools
Requested Permissions
Expected Behavior
Failure Behavior
Acceptance Criteria
Estimated Cost
```

Actions:

```text
[Approve & Build]
[Edit]
[Ask AI to Revise]
[Cancel]
```

Quick mode MAY skip explicit approval for low-risk edits subject to policy.

---

## 37. Test Lab UI

Example:

```text
Skill: Product Storyboard v1.4-draft

Baseline       With Skill
--------------------------------
Scenario 01  FAIL          PASS
Scenario 02  FAIL          PASS
Scenario 03  PASS          PASS
Scenario 04  FAIL          PASS
Scenario 05  FAIL          FAIL

Regression: 47 / 48 passing

[Inspect Failure] [AI Repair] [Run Failed] [Run All]
```

Users SHOULD be able to inspect:

- Input fixture
- Expected behavior
- Actual behavior
- Judge decision
- Raw artifacts
- Cost
- Model/provider

---

## 38. Build Progress UI

Example:

```text
Building Product Storyboard Skill

✓ Requirement analysis
✓ Skill Contract
✓ Baseline 12/12
✓ Package generated
✓ Tests 44/44
● Evals 31/40
○ Compatibility
○ Security review
○ Final verification

Credits used: 27 / 50 budget
```

Progress MUST come from persisted job events, not browser-local state.

---

## 39. Review Console

Reviewers need:

- Contract diff
- Package diff
- Capability changes
- Security findings
- Test/eval summary
- Failed scenarios
- Cost delta
- Compatibility delta
- Previous published version
- Reviewer comments
- Approve / Request Changes / Reject

Marketplace review SHOULD have stricter requirements than Tenant review.

---

## 40. Database Model

Use existing naming conventions. Logical entities recommended:

```text
skill_projects
skill_contracts
skill_drafts
skill_versions
skill_packages
skill_capabilities
skill_test_cases
skill_test_runs
skill_eval_cases
skill_eval_runs
skill_eval_results
skill_compatibility_runs
skill_reviews
skill_approvals
skill_publications
skill_engineering_runs
skill_cost_events
skill_security_findings
skill_artifacts
skill_methodology_profiles
```

If existing tables overlap, extend them rather than duplicating data models.

### 40.1 Core Entity Relationships

```text
Skill
 ├── many Contract revisions
 ├── many Drafts
 ├── many Versions
 ├── many Test Cases
 ├── many Eval Cases
 ├── many Reviews
 ├── many Engineering Runs
 └── many Publications
```

### 40.2 Database Integrity and Tenant Constraints

Database migrations for Spec 221 MUST define foreign keys/uniqueness/check constraints where appropriate rather than relying only on application validation. Tenant-owned child rows MUST not be attachable to a parent from another tenant.

Recommended invariants include:

- immutable release/version rows cannot be updated through ordinary application paths;
- approvals reference the exact immutable revision/hash they approved;
- publication uniqueness prevents accidental duplicate release publication;
- idempotency keys are scoped to actor/tenant/action and have explicit retention;
- deletion/tombstone state prevents dangling active installations or composite references;
- security-definer/service-role database functions, if used, are narrowly scoped and separately reviewed.


---

## 41. Suggested API Surface

Exact routes MUST follow current SmartAIHub API conventions.

Illustrative endpoints:

```text
POST   /v1/skills/projects
GET    /v1/skills/projects/{id}
POST   /v1/skills/projects/{id}/contract/generate
PATCH  /v1/skills/projects/{id}/contract
POST   /v1/skills/projects/{id}/build
POST   /v1/skills/projects/{id}/baseline
POST   /v1/skills/projects/{id}/tests/run
POST   /v1/skills/projects/{id}/evals/run
POST   /v1/skills/projects/{id}/repair
POST   /v1/skills/projects/{id}/compatibility/run
POST   /v1/skills/projects/{id}/review/submit
POST   /v1/skills/projects/{id}/publish
POST   /v1/skills/projects/{id}/quarantine
GET    /v1/skills/projects/{id}/events
GET    /v1/skills/projects/{id}/cost
```

Server MUST authorize each endpoint independently.

### 41.1 API Reliability and Concurrency Contract

Mutating endpoints SHOULD accept idempotency keys and return the authoritative engineering run/job identifier. Draft updates MUST support optimistic concurrency using revision/ETag-equivalent preconditions. Collection endpoints MUST use bounded pagination/cursors. Expensive endpoints MUST enforce rate limits and quota policy.

API errors SHOULD use stable machine-readable codes distinguishing validation, authorization, conflict/stale revision, budget, dependency, provider, infrastructure, and policy failures. Retrying a request with the same idempotency key MUST NOT create duplicate engineering runs or publication actions.

### 41.2 Webhook/Event Consumer Contract

If external webhooks are exposed, they MUST use request authentication/signatures, replay protection, timestamp tolerance, deduplication IDs, payload size limits, and schema versioning. Webhook handlers MUST enqueue durable work rather than performing long Skill engineering in the request lifecycle.

### 41.3 API, Event, and Schema Evolution

Public/connector-facing API contracts, event payloads, and Skill package schemas MUST carry explicit versions. Consumers MUST NOT infer compatibility from endpoint path alone.

The platform SHOULD maintain a compatibility policy covering:

- additive vs breaking field changes;
- unknown-field tolerance where safe;
- deprecation windows and removal criteria;
- event consumer version negotiation or translation where required;
- persisted schema migration and rollback constraints;
- generated SDK/client compatibility tests where SDKs exist.

Breaking control-plane changes MUST be staged so older supported Runners/clients either continue to function or fail with an explicit upgrade-required state rather than undefined behavior.

### 41.4 Multi-Region Consistency and Clock Assumptions

If the control plane is deployed across multiple regions, correctness MUST NOT depend on unsynchronized wall-clock timestamps or last-writer-wins replication. Revision numbers, fencing generations, idempotency keys, and authoritative database constraints MUST determine state ownership.

Wall-clock time remains useful for audit/expiry, but expiry decisions SHOULD tolerate bounded clock skew and rely on a trusted server clock. Cross-region failover MUST preserve uniqueness for publication/version allocation, billing idempotency, approvals, and job ownership.

---

## 42. Event Model

Emit structured events such as:

```text
skill.project.created
skill.contract.generated
skill.contract.approved
skill.baseline.started
skill.baseline.completed
skill.build.started
skill.build.completed
skill.test.failed
skill.eval.failed
skill.repair.started
skill.repair.completed
skill.review.requested
skill.review.approved
skill.version.published
skill.version.quarantined
skill.budget.warning
skill.budget.exceeded
```

Events SHOULD be auditable and suitable for UI realtime updates.

### 42.1 Realtime Subscription Authorization and Isolation

SSE/WebSocket/realtime progress subscriptions MUST authenticate the connection and authorize every subscribed engineering run/Skill/tenant scope server-side. Clients MUST NOT gain access by guessing a job/run ID.

Long-lived connections SHOULD revalidate authorization when session/grant/tenant membership changes or expire/reconnect within a bounded interval. Realtime fan-out infrastructure MUST preserve tenant isolation and MUST NOT broadcast raw events to a shared client channel for client-side filtering.

Resume/cursor tokens for event streams MUST be integrity-protected or server-resolved and scoped to the authorized aggregate.

---

## 43. Audit Requirements

Audit records MUST capture:

- Actor
- Tenant
- Skill
- Version/draft
- Action
- Timestamp
- Request ID
- Job ID
- Before/after references where applicable
- Permission decision
- Approval decision
- Model/provider used
- External harness used
- Cost reference

Privileged actions require stronger retention according to platform policy.

### 43.1 Audit Integrity

High-risk audit records SHOULD be append-only/tamper-evident and protected from modification by ordinary application roles. Security-sensitive events MUST include policy version and decision reason. Clock source/time synchronization MUST be reliable enough to order approvals, revocations, and executions. Export of audit data MUST itself be audited.

---

## 44. Marketplace Integration

A Marketplace Skill release MUST expose verified metadata:

- Version
- Owner
- Visibility
- Skill type
- Capability class
- Supported models
- Last evaluation date
- Compatibility status
- Required connectors/tools
- Data-handling notes
- Price/credit rules if applicable
- License
- Publisher identity/status where policy allows
- Release signature/provenance status
- Security/eval freshness status
- Deprecation/support policy

Do not expose internal secrets, hidden prompts that policy marks private, or sensitive infrastructure details.

### 44.1 Marketplace Release Channels and Progressive Rollout

Marketplace releases SHOULD support channels such as `draft`, `preview`, `stable`, and `deprecated`. High-impact updates SHOULD support staged/canary rollout by tenant/user cohort with explicit rollback criteria. Auto-update behavior MUST be policy-controlled and MUST NOT silently move tenants across a breaking contract/capability change.

### 44.2 Quarantine and Revocation Propagation

A quarantine/revocation decision MUST define runtime behavior for:

- new installs;
- new executions;
- already installed references;
- composite Skills depending on the release;
- cached packages on Runners;
- scheduled/queued jobs not yet started.

Critical revocation SHOULD propagate quickly through capability/runtime checks rather than relying only on catalog metadata. Historical evidence remains retained according to audit policy.

### 44.3 Installation and Runtime Grants

Installing a Skill does not automatically grant every declared capability. Installation MUST evaluate tenant policy and present required permissions/connectors/data classes to the authorized installer. Runtime uses the intersection of:

```text
Skill declared capabilities
∩ Platform policy
∩ Tenant policy
∩ Installation grant
∩ User/runtime grant
```

Capability additions in an update MUST NOT be silently inherited from an older grant. The update requires re-approval/consent according to risk class. Removing a capability SHOULD narrow effective grants automatically.

### 44.4 Marketplace Abuse, IP, and Trust Operations

Marketplace governance MUST handle abuse beyond technical malware. Required operational paths include:

- report Skill/publisher for malware, impersonation, copyright/IP concerns, deceptive behavior, spam, or undisclosed data handling;
- preserve evidence and freeze/quarantine a release while investigation is active when policy warrants;
- distinguish catalog delisting from runtime quarantine/revocation;
- track publisher identity/verification state and material ownership changes;
- prohibit manipulation of reviews/eval evidence/certification badges;
- support documented takedown, counter-notice/appeal, and reinstatement workflows appropriate to platform policy and applicable law;
- record provenance/license assertions without treating creator assertion alone as proof of ownership.

### 44.5 Publisher Ownership Transfer and Offboarding

Skill ownership transfer, tenant departure, disabled accounts, deceased/inaccessible owners, and organization offboarding MUST have explicit behavior. Published Marketplace releases MUST NOT become unmaintainable or silently change ownership because a user account is removed.

Ownership transfer MUST require authorization from the current owner/tenant or an audited administrative recovery process, preserve historical publisher identity, and revalidate payout/revenue-sharing configuration. Privileged grants, signing rights, connector secrets, and maintainer access MUST be reevaluated after transfer.

### 44.6 Install/Update Channels, Pinning, and Safe Auto-Update

An installation MUST record the exact installed Skill version/package digest and grant revision. Tenants/users MAY choose an allowed update policy such as:

```text
PINNED
PATCH_ONLY
COMPATIBLE_AUTO_UPDATE
MANUAL_APPROVAL
SECURITY_HOTFIX_POLICY
```

Auto-update MUST NOT cross a breaking contract/capability boundary or expand permissions without required consent. A newer release that increases side-effect class, data access, external destinations, connector scopes, or runtime risk MUST pause for reauthorization even if semantic version metadata is incorrect.

The platform MUST retain a rollback path to a previously installed immutable version when technically safe and MUST surface when rollback is unavailable because of data migration/external side effects.

---

## 45. Revenue Sharing Integration

Spec 221 only attaches the published Skill/version to the existing revenue-sharing model.

It MUST support the current multi-party model where configured:

```text
Platform/Core
Tenant/Partner
Skill/Plugin Owner
```

Revenue configuration belongs to existing billing/revenue services.

Publication MUST fail validation if required payout ownership metadata is missing.

---

## 46. Failure Handling

### 46.1 Provider Failure

Retry according to job policy. Where allowed, present provider fallback options.

### 46.2 Harness Failure

Mark step failure with evidence. Do not lose the full engineering run.

### 46.3 Runner Disconnect

Lease expiration allows safe reclaim/retry subject to idempotency.

### 46.4 Partial Artifact Generation

Artifacts MUST be versioned/staged. Never publish partially generated package state.

### 46.5 Evaluation Timeout

Record timeout as a distinct result, not generic FAIL.

### 46.6 Budget Exhaustion

Pause/block execution and request explicit budget increase.

### 46.7 Permission Failure

Stop immediately; automatic repair MUST NOT bypass policy.

---

## 47. Cancellation

User MUST be able to cancel cancellable engineering runs from UI.

Cancellation semantics:

- Stop scheduling new child jobs.
- Attempt graceful cancellation of active jobs.
- Preserve completed artifacts/evidence.
- Mark run `CANCELLED`.
- Never roll back already committed billing events incorrectly.

### 47.1 Cancellation Finality and Races

Cancellation MUST be represented as an authoritative revision/state transition, not a best-effort UI flag. A child finishing concurrently with cancellation MAY store diagnostic artifacts, but it MUST NOT schedule downstream work or promote/publish results after cancellation has won the state transition.

For providers that cannot be physically cancelled, the system MUST mark the remote call as detached/non-promotable, continue cost reconciliation, and discard or quarantine late results from canonical state. Re-running a cancelled operation creates a new run identity unless an explicit resume contract says otherwise.

---

## 48. Concurrency and Editing

The system MUST prevent conflicting simultaneous edits from silently overwriting each other.

Recommended mechanisms:

- Draft revision number
- Optimistic concurrency control
- Conflict UI
- Immutable published versions

Engineering runs MUST bind to a specific draft revision.

---

## 49. Reproducibility

Every test/eval should record where applicable:

- Skill version/draft hash
- Contract revision
- Model identifier
- Model/provider version if available
- Prompt/template version
- Methodology profile/version
- Tool versions
- External harness version
- Superpowers version/commit if used
- Fixture version
- Random seed where supported
- Environment metadata
- Dependency lock digest
- Release/package digest
- Policy version

### 49.1 Reproducibility Levels

The UI/API SHOULD label reproducibility explicitly:

- `EXACT` — deterministic inputs/environment are fully pinned and rerunnable.
- `BEST_EFFORT` — external model/provider cannot be frozen exactly but identifiers/evidence are recorded.
- `NON_REPRODUCIBLE` — important environment/version information is missing.

Marketplace evidence MUST NOT imply exact reproducibility for hosted models/providers that can change behavior behind a stable public name.

### 49.2 Evaluation Execution Envelope

Every certification-grade eval SHOULD persist a machine-readable execution envelope sufficient to explain variance, including where applicable:

- exact provider/model endpoint and dated/revision identifier if exposed;
- sampling parameters (`temperature`, `top_p`, seed, reasoning/effort settings, max output);
- system/developer/template hashes and Skill prompt hash;
- tool/MCP/A2A capability snapshot and adapter versions;
- judge model/version, rubric version, aggregation logic, and threshold version;
- media preprocessing versions;
- locale/timezone;
- fixture/content hashes;
- runtime/container/Runner image/version;
- provider response/request IDs when safe to retain.

A rerun that materially changes this envelope MUST be labeled as a new evidence condition rather than silently merged into an older certification result.

---

## 50. Observability

Metrics SHOULD include:

- Build success rate
- Test pass rate
- Eval pass rate
- Repair success rate
- Average repair rounds
- Median build duration
- Cost per successful build
- Cost per eval suite
- Provider failure rate
- Runner failure rate
- Marketplace rejection causes
- Quarantine incidents
- Compatibility regressions

Tracing SHOULD link UI request → engineering run → worker_jobs → external harness/provider → result artifact.

### 50.1 Operational SLOs and Alerts

Production deployment MUST define measurable SLOs for at least control-plane API availability, job start delay, event/progress freshness, stuck-job detection, publication latency, and audit-event durability. Alerting SHOULD cover queue backlog, lease churn, runaway retries, unusual credit burn, sandbox policy violations, signing failures, dependency vulnerability regressions, and quarantine/revocation propagation failure.

### 50.2 Cache/Consistency and Revocation SLO

Because Skill metadata, grants, packages, and resolver indexes may be cached across web nodes/Runners, the platform MUST define which state requires strong/near-real-time consistency. Security-critical deny/quarantine/revocation decisions MUST not depend on long catalog cache TTLs.

The system MUST define and measure a maximum propagation target for revocation/policy updates, invalidate affected caches/indexes, and make stale-cache behavior fail closed for Critical/Privileged actions.

### 50.3 Feature Flags, Kill Switches, and Safe Rollout of Spec 221

High-risk components (automatic repair, privileged execution, external harness adapters, auto-publish/canary, new methodology adapters) SHOULD be gated by server-side feature flags scoped by environment/tenant/cohort. Emergency kill switches MUST be independently operable from the feature being disabled and auditable.

Disabling a feature MUST define what happens to queued/running jobs and avoid leaving partially authorized workflows in limbo.

### 50.4 Backup and Disaster Recovery

Production deployment MUST define backup/restore and disaster-recovery objectives for authoritative Spec 221 state. At minimum document/test:

- RPO and RTO targets for database/control-plane state;
- recovery of immutable package/eval/audit references and detection of missing artifacts;
- secret/signing-key recovery or rotation procedures;
- restoration into an isolated environment before production cutover where practical;
- periodic restore tests, not only successful backup jobs;
- reconciliation of jobs that were RUNNING/LEASED at disaster time;
- behavior when an artifact store or external provider is unavailable during recovery.


---

### 50.5 Telemetry Hygiene, Cardinality, and Trace Sampling

Metrics/traces MUST avoid unbounded high-cardinality labels such as raw prompt, user email, arbitrary URL, artifact ID, or full job ID in global metric dimensions. High-cardinality correlation belongs in traces/logs with access/retention controls.

Sensitive payloads MUST be redacted before telemetry export. Production tracing SHOULD use configurable sampling while preserving forced sampling for security incidents, failed publication gates, and selected debugging sessions. Telemetry exporters MUST respect tenant/data residency policy.

### 50.6 Operational Runbooks and Escalation

Every production-critical failure mode SHOULD have an operator runbook linked from alerts/dashboard context. At minimum cover stuck/leasing jobs, provider outage/rate limit, compromised/revoked Runner, signing-key incident, quarantine propagation failure, billing reconciliation mismatch, database/R2 degradation, corrupted artifact/evidence, and runaway eval cost.

Runbooks MUST state safe operator actions, forbidden shortcuts, evidence to preserve, escalation/ownership, and recovery verification. Manual repair actions SHOULD call audited admin APIs rather than direct database edits.

---

## 51. Notifications

Notify users on meaningful transitions:

- Build completed
- Build blocked
- Budget exceeded
- Human review required
- Review approved/rejected
- Marketplace published
- Skill quarantined
- Compatibility regression detected

Use existing notification infrastructure.

---

## 52. Analytics for Skill Owners

Skill owners SHOULD see:

- Invocation count
- Success/failure rates
- Average latency
- Average credits
- Model/provider distribution
- Common failure classes
- Version adoption
- Eval regression warnings
- Revenue metrics where permitted

Runtime analytics and engineering eval analytics MUST remain distinguishable.

---

## 53. Background Regression Evaluation

The platform MAY support scheduled regression checks when:

- A model/provider changes materially.
- A dependent tool changes.
- A dependency Skill changes.
- A security policy changes.

Automatic regression MAY mark a compatibility status as degraded, but Marketplace removal/quarantine follows platform policy.

### 53.1 Provider/Model Deprecation and End-of-Life

The platform MUST distinguish behavioral drift from announced/unannounced provider/model/tool end-of-life. When a required provider/model/connector is deprecated or removed, affected Skill versions/installations MUST be discoverable by dependency graph and move to an explicit compatibility state such as `AT_RISK`, `MIGRATION_REQUIRED`, or `UNSUPPORTED` according to policy.

Migration to a replacement model/provider requires fresh compatibility/eval evidence; historical certification MUST NOT be automatically transferred solely because the provider claims equivalence. Tenant owners SHOULD receive advance notices when the platform has known EOL dates.

### 53.2 Eval Campaign Cost Efficiency

Large eval campaigns SHOULD support stratified/representative sampling, fail-fast gates, cached deterministic preprocessing, and staged escalation from cheap checks to expensive multimodal/judge runs. Cost optimization MUST NOT reuse contaminated answers or skip mandatory hidden/adversarial evidence required for certification.

The UI SHOULD estimate marginal cost before expanding a matrix across models/providers/fixtures and allow the user/policy to cap matrix breadth. A partial campaign MUST be labeled partial rather than treated as full certification.

---

## 54. Dependency Management

Skills MAY depend on:

- Other Skills
- MCP tools
- A2A agents
- Provider APIs
- Models
- Runtime packages

Dependencies MUST be declared and version-constrained where possible.

The system SHOULD build a dependency graph to identify affected Skills after upstream changes.

### 54.1 Dependency Locking and Supply-Chain Policy

Executable dependencies SHOULD resolve through an approved registry/proxy and produce a lock snapshot. Marketplace/Privileged builds MUST avoid unconstrained floating dependencies where a reproducible version can be pinned. Policy SHOULD support:

- allow/deny lists for package registries and licenses;
- vulnerability/CVE advisory ingestion;
- blocking known-malicious packages;
- checksum/integrity verification;
- disabling untrusted install/post-install scripts unless explicitly allowed;
- transitive dependency graph and impact analysis;
- re-evaluation when a dependency advisory changes.

A dependency update creates new evidence; it MUST NOT silently change the bytes of an immutable published Skill release.

### 54.2 Registry and Dependency-Source Integrity

Dependency resolution MUST record source registry/repository identity in addition to package name/version. The build system SHOULD defend against dependency confusion, namespace shadowing, typosquatting, mutable tags, compromised mirrors, and unexpected source substitution.

For high-risk/Marketplace builds, policy SHOULD prefer immutable digests/checksums and approved registries. A package with the same name/version but a different digest/source MUST be treated as a different supply-chain input and invalidate prior build evidence.

---

## 55. Skill Composition

Composite Skills SHOULD be supported without flattening all child Skills into one package.

```text
Composite Skill
├── Skill A
├── Skill B
├── MCP Tool C
└── Workflow D
```

Each component keeps its own policy and version identity.

### 55.1 Composition Policy, Cycles, and Failure Semantics

Composite execution MUST NOT flatten child permissions into an unrestricted parent context. Each child invocation re-authorizes against the caller, tenant, installation grant, child capability declaration, and runtime policy. The parent cannot confer a capability it does not have authority to request.

The dependency/composition graph MUST detect and reject or explicitly handle cycles. The contract MUST define whether child failure causes parent failure, fallback, partial result, or compensation. Child version resolution MUST be deterministic for a given immutable composite release.

### 55.2 Composite Depth, Fan-Out, and Cumulative Budgets

Composite/workflow execution MUST enforce bounded recursion/depth, fan-out, total child invocations, cumulative wall time, cumulative model/tool calls, and cumulative credit/external-cost limits. Per-child limits alone are insufficient because a safe child can still be invoked explosively by a parent.

The parent run MUST reserve/propagate a bounded remaining budget to children rather than giving every child the original full budget. Side-effect classes and approvals also accumulate: a parent that fans out to many reversible writes MAY cross a policy threshold requiring additional approval.

Cycle detection MUST be performed before execution where the graph is known and enforced dynamically for late-bound/dynamic child selection.

---

## 56. Data Privacy

Evaluation fixtures may contain user files or sensitive tenant data.

Requirements:

- Tenant isolation
- Configurable retention
- No cross-tenant eval reuse without explicit anonymization/permission
- Secret redaction in logs
- Provider policy checks before sending content externally
- Clear indication when a chosen harness/provider transfers data outside SmartAIHub infrastructure

### 56.1 Retention, Deletion, Residency, and Legal Holds

The data model MUST separate retention classes for drafts, fixtures, prompts/transcripts, raw provider responses, build logs, published artifacts, billing evidence, and security/audit evidence. Tenant policy MAY shorten ordinary engineering-data retention, but MUST NOT silently delete records that are required for financial/security/legal retention.

Deletion workflows MUST define:

- what is hard-deleted vs tombstoned;
- how R2/Library artifacts and derived copies are removed;
- how backups expire;
- how legal hold overrides deletion;
- how cross-tenant/shared Marketplace artifacts are protected from one tenant deleting global evidence;
- data residency constraints when selecting external providers or Runners.

### 56.2 Account Deletion, Creator Offboarding, and Data Subject Requests

Account deletion MUST distinguish personal authoring data from platform records that must persist for Marketplace integrity, security, billing, or legal obligations. Where identity must be retained, the platform SHOULD minimize/pseudonymize fields while preserving immutable attribution/audit semantics required by policy.

A deletion/offboarding request MUST NOT:

- orphan active Marketplace Skills without a maintainer/ownership disposition;
- delete evidence still required by a published immutable version;
- leave reusable secrets/connectors active;
- silently transfer tenant-owned Skills to a personal account;
- erase payout/audit history contrary to retention requirements.


---

## 57. File and Artifact Storage

Engineering artifacts SHOULD use existing Library/R2 abstractions.

Artifact types may include:

```text
skill_package
contract_snapshot
test_fixture
test_report
eval_report
security_report
compatibility_report
review_bundle
build_log
preview_media
```

Artifacts MUST be referenced by stable IDs rather than local filesystem paths in persistent records.

### 57.1 Artifact Integrity and Lifecycle

Stored artifacts SHOULD record content hash, media/MIME type determined independently from filename, size, producer job, tenant/owner scope, retention class, and scan status. Upload/download paths MUST enforce authorization on every access; signed URLs SHOULD be short-lived and scope-limited.

Artifact ingestion SHOULD scan for malformed archives, malware where applicable, decompression abuse, and unexpected executable content before promotion to trusted release storage. Garbage collection MUST be reference-aware so evidence required by immutable releases/audits is not removed.

### 57.2 Artifact Reconciliation and Orphan Handling

The platform SHOULD run periodic reconciliation between authoritative database references and Library/R2 objects to detect missing blobs, orphan uploads, incomplete multipart uploads, duplicate canonical artifacts, and retention-policy mismatches.

New artifacts SHOULD remain in a staged/non-canonical state until the owning job transaction/reference is committed. Orphans MAY be garbage-collected only after a safety window and reference recheck. Missing evidence required by an immutable Marketplace release MUST raise an integrity incident rather than being silently regenerated and substituted.

---

## 58. Source Control Integration

Git integration is optional for Skill users.

Advanced teams MAY link a repository for:

- Import
- Export
- Change review
- CI integration

But SmartAIHub must work fully without forcing the user to know repository mechanics.

External source control MUST NOT become the only copy of Skill metadata required by the platform.

Repository integrations MUST pin a commit/revision for engineering runs. Pull/clone operations MUST apply repository size/time limits, credential scoping, host allowlists, and untrusted repository protections. An external branch/PR merge MUST NOT bypass SmartAIHub publication/security gates.

### 58.1 External Reference and URL Ingestion Safety

The Skill Builder may accept URLs/repos/files as references, but control-plane servers MUST NOT perform unrestricted server-side fetches. Remote reference ingestion MUST use a policy-aware fetch/import service with SSRF/private-network/metadata protection, redirect/DNS revalidation, protocol allowlists, size/time/content limits, malware/archive checks where relevant, and tenant-scoped credentials.

Fetched/reference content is untrusted data for the builder and MUST NOT become system/developer instructions merely because it came from a linked repository or documentation URL. Reference provenance, final resolved URL/commit, content hash, and fetch time SHOULD be recorded when the content influences generated Skill evidence.

---

## 59. Import Existing Skill

Skill Studio MUST support importing an existing Skill package.

Import pipeline:

```text
Upload/Select Package
→ Parse
→ Validate
→ Generate/Recover Contract
→ Capability Scan
→ Tests/Evals discovery
→ Create Draft
→ Require evaluation before Marketplace publish
```

Legacy packages may remain usable under compatibility mode if policy allows.

Imported packages MUST be treated as untrusted until validation completes. The import record SHOULD preserve source type, source reference/URL when applicable, claimed author/license, original package hash, importer, timestamp, and validation findings. Unknown or unverifiable provenance MUST be visible to reviewers and MAY block Marketplace publication.

---

## 60. Export

Authorized users MAY export a Skill package.

Export policy may differ by:

- Owner rights
- Marketplace license
- Tenant policy
- Secret references

Secrets MUST never be embedded in exported packages.

### 60.1 Optional Agent-Skills Interoperability

Where technically compatible, SmartAIHub MAY offer an export/import compatibility profile for the emerging Agent Skills `SKILL.md` ecosystem. This compatibility layer MUST be versioned and MUST NOT reduce SmartAIHub's richer contract, schema, capability, eval, provenance, or publication requirements. Unsupported SmartAIHub features MUST be reported explicitly rather than silently dropped.

The compatibility profile SHOULD pin the external specification/revision it implements and validate discovery-critical metadata (for example required frontmatter such as `name`/`description`, naming/size constraints, and runtime-specific discovery conventions where applicable). Superpowers-compatible export/import MUST preserve harness-neutral semantics and MUST NOT assume one vendor's tool names or configuration-file conventions.

A future change in Superpowers/Agent Skills discovery semantics MUST trigger compatibility tests before SmartAIHub changes generated packages. External format compatibility is an adapter contract, not the canonical SmartAIHub Skill model.

---

## 61. Fork / Duplicate

Support:

```text
Duplicate Personal Skill
Fork Team Skill
Fork Marketplace Skill if license permits
```

Fork creates new ownership and lineage metadata.

---

## 62. Skill Certification

Future/optional certification levels MAY include:

```text
Draft
Tested
Verified
Marketplace Reviewed
Enterprise Reviewed
```

Certification labels MUST correspond to explicit criteria and evidence; they must not be arbitrary marketing badges.

---

## 63. Policy Engine Integration

Every important action MUST query policy with contextual inputs:

```text
actor
role
tenant
skill owner
visibility
requested capability
risk class
data class
provider
runner
action
```

Policy output SHOULD include:

```text
allow / deny / require_approval
required_approver_role
execution_constraints
budget_constraints
data constraints
```

### 63.1 Policy Precedence, Conflict Resolution, and Decision Explainability

Policy sources can conflict (platform, tenant, team, Skill declaration, installation grant, user grant, runtime context). The engine MUST have deterministic precedence and MUST default to the more restrictive outcome unless an explicit authorized override rule applies.

Recommended effective-policy model:

```text
Platform hard-deny / safety boundary
→ Platform policy
→ Tenant policy
→ Team/workspace policy
→ Skill declaration
→ Installation grant
→ User/runtime grant
→ Per-action approval
```

Policy decisions MUST return a stable reason code and relevant policy/version identifiers. UI SHOULD explain user-actionable denials (for example missing connector consent or tenant restriction) without exposing sensitive internal policy details. The same inputs and policy versions SHOULD produce deterministic authorization results.


---

## 64. Approval Model

Approval may be required at multiple gates:

```text
Contract Approval
Capability Approval
Security Approval
Tenant Publication Approval
Marketplace Approval
Budget Override Approval
```

Approvals MUST be explicit records, not comments only.

Approval evidence becomes stale when relevant contract/capability/package content changes.

### 64.1 Approval Binding and Conflict Resolution

Every approval MUST bind to immutable hashes/revisions of the contract, package, capability set, security findings, and relevant eval bundle. Approving "the Skill" without identifying the reviewed revision is invalid.

Where multiple approvals are required, policy MUST define quorum and ordering. Conflicting reviewer decisions move the release to an explicit blocked/escalation state; last-writer-wins is forbidden. Approval expiry MAY be required for stale security/eval evidence.

### 64.2 Review Appeal and Independent Re-review

A rejected Marketplace/security review SHOULD support an auditable appeal/re-review path. The original author MUST NOT be able to convert a rejection into approval by resubmitting unchanged evidence repeatedly.

Policy SHOULD define when an independent reviewer is required, how reviewer conflicts of interest are handled, maximum review freshness, and whether a material revision resets the appeal into a new review. Appeal outcomes MUST reference the same immutable evidence/revision under dispute.

### 64.3 Approval Liveness, Delegation, and Deadlock Prevention

Approval workflows MUST define timeout/escalation behavior so a release cannot remain indefinitely blocked by an inactive reviewer. Delegation/substitution MUST be explicit, role-scoped, time-bounded where appropriate, and audited; authors cannot self-delegate into an approver role.

If approval quorum becomes impossible because reviewers leave a tenant, accounts are disabled, or policies change, the workflow MUST enter an explicit `APPROVAL_BLOCKED`/escalation state rather than silently lowering quorum. Expired approval requests MUST be reissued against current immutable evidence and policy.

---

## 65. Human-in-the-Loop UX

When the system needs human input, it MUST ask a focused decision rather than dumping raw internal details.

Example:

```text
The Skill requires outbound access to api.example.com.

Reason: fetch product catalog metadata
Risk class: Restricted
Scope: HTTPS only, domain allowlisted

[Approve]
[Reject]
[Edit Permission]
```

---

## 66. Model/Harness Selection UX

For complex builds, the UI SHOULD allow:

```text
Builder: Auto / Codex / Claude / Grok / Gemini / ...
Reviewer: Auto / ...
Eval Judge: Auto / ...
```

Auto uses capability/policy/cost routing.

The system SHOULD display tradeoffs rather than assuming one harness is universally best.

---

## 67. Existing SmartAIHub Integration Ownership

Spec 221 owns:

- Skill Studio
- Skill Contract
- Methodology profiles
- Skill engineering workflow
- Test/eval domain model
- Repair controller
- Skill review workflow
- Publication readiness

Companion systems own:

```text
Spec 199   External MCP Gateway
Spec 200   External Agent Gateway
Spec 206   A2A interoperability
Unified Job Control Plane / worker_jobs
           Reliable job execution
SmartAIHub Runner
           Local/remote heavy execution
Billing/Credits
           Financial ledger
Marketplace
           Catalog/discovery/install/revenue presentation
```

Spec 221 MUST integrate, not duplicate.

---

## 68. Migration Strategy

### Phase 1 — Foundation

- Skill Project
- Skill Contract
- Personal Skill creation
- Standard methodology
- Basic package generation
- Deterministic tests
- Basic evals
- `worker_jobs` integration

### Phase 2 — Production Engineering

- Baseline evals
- Repair loops
- Review console
- Cost guard
- Security classification
- Immutable versions
- Team/Tenant publication

### Phase 3 — External Harnesses

- Spec 200 adapters
- Codex/Claude/Grok/etc.
- Superpowers-compatible methodology profile
- Multi-agent review

### Phase 4 — Marketplace Quality

- Marketplace submission gate
- Compatibility matrix
- Certification/evidence
- Security reviewer workflow
- Quarantine

### Phase 5 — Advanced

- Scheduled regression
- Dependency impact analysis
- Custom methodologies
- Advanced multimodal judges
- Enterprise policy packs

### 68.1 Online Migration, Backfill, and Rollback Controls

Migration from legacy Skill records MUST define coexistence and cutover behavior. Backfills MUST be idempotent/restartable, tenant-scoped, observable, and safe against concurrent edits. If dual-read/dual-write is used temporarily, one source of truth and conflict-resolution rule MUST be explicit.

Before cutover, the platform SHOULD run reconciliation counts/hashes and shadow validation on representative Skills. Rollback MUST be tested and MUST NOT discard data written only in the new model. Feature flags SHOULD allow tenant/cohort rollout rather than a global irreversible switch.

---

## 69. Legacy Skill Compatibility

Existing Skills MUST NOT break merely because Spec 221 is introduced.

Legacy state recommendation:

```text
LEGACY_UNEVALUATED
```

Existing Skill owners may opt into:

```text
Import → Generate Contract → Evaluate → Publish New Version
```

Marketplace policy MAY later require newer verification levels for new releases without invalidating existing installed versions automatically.

Legacy import/runtime MUST distinguish "compatible to execute" from "eligible for new Marketplace publication". Legacy Skills that request capabilities not representable in the new policy model MUST default to restricted/quarantined-for-review rather than being implicitly granted broad access.

---

## 70. Performance Requirements

The UI MUST remain responsive while jobs run.

Requirements:

- No long-running build in web request lifecycle.
- Progress streamed/polled from persisted events.
- Paginate large eval histories.
- Load raw artifacts on demand.
- Avoid sending full build logs in every progress update.
- Apply bounded payload/log/artifact sizes and backpressure for realtime progress streams.
- Virtualize/paginate large scenario matrices and event timelines.
- Degrade gracefully when realtime transport is unavailable by falling back to polling.

---

## 71. Accessibility and Internationalization

Skill Studio SHOULD support SmartAIHub localization conventions, including Thai and English.

Generated contract labels, validation errors, and approval messages SHOULD be localizable.

Technical IDs remain language-neutral.

### 71.1 Locale, Timezone, and Deterministic Formatting

User-facing dates, currencies, numbers, and translated labels SHOULD respect user/tenant locale and timezone, while persisted timestamps MUST use an unambiguous canonical form (for example UTC + timezone metadata where scheduling semantics require it).

Eval fixtures whose expected behavior depends on locale, calendar, currency, decimal separator, collation, or timezone MUST pin those settings. A locale mismatch MUST NOT be misclassified as a model-quality regression.


---

## 72. Security Review Checklist

At minimum:

- Capability diff reviewed
- Secret handling reviewed
- Network destinations reviewed
- Filesystem scope reviewed
- Tool scopes reviewed
- Tenant boundaries tested
- Prompt injection scenarios executed where relevant
- Data exfiltration pathways considered
- Dependency risks checked
- Arbitrary code execution identified
- Publication visibility confirmed

Security review MUST also verify:

- authorization-at-use for Restricted/Privileged/Critical capabilities;
- lease/fencing or equivalent stale-worker protection for authoritative writes;
- malicious MCP/A2A/tool response/confused-deputy scenarios where applicable;
- Web UI rendering/download safety for untrusted Skill/eval/provider content;
- atomic budget/billing idempotency for parallel paid work;
- update/rollback behavior when capabilities or data migrations change.

---

## 73. Marketplace Review Checklist

At minimum:

- Owner identity/eligibility
- Package validation
- Contract completeness
- Test suite status
- Eval status
- Compatibility evidence
- Security findings
- License
- Required connectors
- Pricing/revenue metadata
- UI schema validity
- Documentation quality
- Example inputs/outputs
- No hidden privileged capability
- Package signature/provenance requirements satisfied
- Dependency/SBOM policy satisfied where applicable
- Hidden holdout/adversarial evidence meets policy
- Publisher/license provenance checked
- Rollout/rollback plan present for breaking/high-impact releases

---

## 74. Acceptance Criteria

Spec 221 implementation is considered functionally complete for initial production when all of the following are true:

1. A permitted user can create a Skill from natural-language requirements in Web UI.
2. System generates a Skill Contract.
3. System classifies capability risk.
4. System generates a package with required schemas.
5. System runs deterministic tests.
6. System runs at least one behavior eval type.
7. System can compare baseline vs Skill behavior where applicable.
8. Failed eval can enter a bounded repair loop.
9. Progress survives browser refresh/disconnect.
10. All long jobs use the Unified Job Control Plane.
11. Skill Creator cannot self-grant platform-admin capabilities.
12. Published versions are immutable.
13. Personal, Tenant, and Marketplace publication paths enforce different policies.
14. Marketplace publication requires review.
15. User can inspect test/eval evidence.
16. Budget limit can stop additional agent/eval spending.
17. External harness output is imported as artifacts/results, not trusted as system state.
18. Audit records exist for privileged and publication actions.
19. A published Skill can be quarantined without deleting historical evidence.
20. Existing legacy Skills remain usable according to compatibility policy.
21. Marketplace/Privileged releases have verifiable package identity and required provenance/SBOM evidence.
22. Imported packages are hardened against archive traversal/decompression abuse and remain untrusted until validated.
23. External network access enforces SSRF-safe egress policy.
24. Eval certification uses independent/hidden evidence where policy requires and distinguishes inconclusive/infrastructure error from Skill failure.
25. High-risk approvals are revision-bound and enforce separation of duties.
26. Quarantine/revocation affects runtime/queued execution according to defined propagation policy.
27. Mutating APIs/jobs are idempotent and stale results cannot overwrite a newer revision.
28. Data retention/deletion/residency rules are enforceable and auditable.
29. Dependency changes cannot mutate immutable release bytes and can trigger impact/regression analysis.
30. Production SLO/alerting exists for stuck jobs, unusual cost burn, security-policy failure, and revocation propagation.
31. Certification evaluates Skill discovery/resolver behavior, not only explicit Skill invocation, where automatic routing is used.
32. Skill prose cannot override platform trust/policy boundaries.
33. Installation grants are distinct from declared capabilities and capability expansion requires re-consent.
34. Composite Skills re-authorize child capabilities and handle dependency cycles deterministically.
35. Tenant isolation is enforced across database, artifacts, jobs, caches/indexes, and Runner dispatch, with cross-tenant attack tests.
36. Secrets/signing keys use approved secret/KMS handling and sensitive values are redacted from ordinary logs/eval exports.
37. Backup/restore is tested against defined RPO/RTO and recovers job/evidence consistency.
38. Provider failures are bounded by retry/backoff/circuit-breaker policy and cannot cause unbounded retry storms/cost.
39. Privileged Runner jobs reject revoked/outdated/policy-incompatible Runner identities.
40. Policy conflicts resolve deterministically with stable reason codes and fail safely.
41. Consequential side effects can require preview/JIT approval independently of Skill installation.
42. Eval datasets preserve lineage and hidden-holdout integrity and can detect/mitigate contamination or poisoning.
43. Material model/provider/tool/judge drift can stale evidence and trigger targeted re-evaluation.
44. Marketplace supports abuse/IP reporting, takedown/quarantine distinction, appeal, and publisher lifecycle controls.
45. Ownership transfer/offboarding preserves immutable attribution and revalidates grants/payout rights.
46. Scheduling prevents one tenant from monopolizing shared engineering/eval capacity.
47. API/event/package schema versions have defined compatibility/deprecation behavior.
48. Security revocation/cache invalidation has a measurable propagation SLO and fail-closed path for high-risk execution.
49. Security incidents can trigger emergency kill switch, affected-version discovery, notification, and forensic preservation.
50. Locale/timezone-dependent evals pin deterministic formatting/time semantics where required.
51. Lifecycle changes use an authoritative transition table/state machine and reject illegal/concurrent stale transitions.
52. Restricted/Privileged/Critical actions re-authorize at execution time so revoked grants/policy/quarantine changes cannot be bypassed by queued work.
53. Expired/superseded worker leases cannot commit canonical artifacts, billing settlement, publication, or state through stale attempts.
54. Parallel billable child jobs cannot overspend one balance due to race conditions; reservation/settlement is concurrency-safe and idempotent.
55. Certification-grade evals preserve a machine-readable execution envelope including sampling/judge/tool/runtime versions sufficient to classify reruns correctly.
56. Event consumers tolerate duplicate/out-of-order delivery and reject old aggregate revisions; poison events cannot indefinitely block processing.
57. Approval workflows have audited timeout/escalation/delegation and never silently lower quorum when approvers become unavailable.
58. Skill installations pin immutable versions/digests; auto-update cannot expand capability/side-effect/data scope without reauthorization.
59. Dependency resolution records source+digest and detects source substitution/dependency-confusion class risks for high-risk builds.
60. MCP/A2A/tool/connector responses remain untrusted and each capability hop is bound to actor/tenant/Skill/run authorization.
61. Skill Studio Web UI protects state changes and untrusted rendered/downloaded content against CSRF/XSS/clickjacking/origin abuse according to platform security baseline.
62. Metrics/traces avoid sensitive/unbounded high-cardinality labels and support controlled sampling/redaction.
63. Production alerts link to tested operator runbooks for critical job/provider/Runner/signing/quarantine/billing/artifact failures.
64. Periodic artifact reconciliation detects missing/orphaned/corrupt evidence without silently substituting immutable Marketplace evidence.
65. Model/provider/tool deprecation/EOL can identify affected Skills/installations and requires fresh evidence for replacement migration.
66. Large eval matrices support bounded staged/representative execution while clearly distinguishing partial from full certification.
67. Multi-region operation does not use wall-clock/last-writer-wins as the authority for publication, billing, approvals, or job ownership.
68. Cancellation wins an atomic state transition; late non-cancellable provider/worker results cannot promote downstream work.
69. Release rollback declares migration/irreversible-side-effect constraints and does not claim safe rollback when data/external state cannot be restored.
70. Agent Skills/Superpowers interoperability is versioned, compatibility-tested, harness-neutral, and remains an adapter rather than SmartAIHub's canonical Skill model.
71. Editing any contract/package/tool/dependency input invalidates all dependent stale evidence and cannot preserve misleading certification.
72. Composite Skills enforce cumulative depth/fan-out/cost/time/call limits and propagate bounded remaining budgets to children.
73. URL/repository/reference ingestion uses SSRF-safe bounded fetch/import and treats retrieved content as untrusted data with provenance.
74. SSE/WebSocket/realtime event subscriptions are server-authorized per tenant/run and cannot leak events through guessable IDs or shared client filtering.

---

## 75. Required Test Plan for Spec 221 Itself

### 75.1 RBAC

Test every role against every high-risk action.

### 75.2 Tenant Isolation

Attempt cross-tenant reads/writes/publication.

### 75.3 Job Reliability

Simulate:

- Runner death
- Duplicate delivery
- Lease expiration
- Retry
- Browser disconnect
- Cancellation

### 75.4 Cost Guard

Verify hard budget blocks further execution.

### 75.5 Immutable Releases

Attempt direct mutation of published Skill.

### 75.6 Capability Escalation

Modify draft to request new privileged access and confirm prior approval becomes invalid.

### 75.7 Behavior Eval Integrity

Ensure eval run references exact draft/version/model/fixture.

### 75.8 External Harness

Return malformed/partial/malicious results and confirm SmartAIHub validates before acceptance.

### 75.9 Marketplace

Attempt publication with missing review/security/license metadata.

### 75.10 Quarantine

Ensure quarantined release cannot be newly installed/executed where policy blocks it, while evidence remains retrievable by authorized users.

### 75.11 Supply Chain

Test package hashing/signing, tampered package rejection, SBOM generation, malicious dependency detection, lockfile integrity, and immutable release bytes.

### 75.12 Import Hardening

Test path traversal, absolute paths, symlinks/hardlinks, ZIP/tar bombs, excessive file counts/sizes, duplicate normalized paths, malformed manifests, and unexpected executables.

### 75.13 Egress/SSRF

Test loopback/link-local/private metadata endpoints, DNS rebinding, redirects to blocked destinations, unusual ports/protocols, and credentials in URLs/logs.

### 75.14 Certification/Holdout Integrity

Test hidden holdout isolation, judge disagreement/inconclusive state, infrastructure-error classification, repeated probabilistic trials, paired baseline settings, and prevention of builder access to answer keys.

### 75.15 Approval Integrity

Test self-approval denial, stale approval invalidation, approval binding to hashes/revisions, conflicting decisions, quorum, expiry, and break-glass auditing.

### 75.16 API/Workflow Idempotency

Test duplicate HTTP requests, duplicate queue delivery, stale child results, replay/resume, external side-effect compensation, and publication retry without duplicate release/cost.

### 75.17 Data Lifecycle

Test retention expiry, deletion/tombstone behavior, legal hold, tenant deletion boundaries, backup expiry policy, and artifact reference-aware garbage collection.

### 75.18 Release Rollout

Test preview/stable channels, canary rollout, rollback, breaking schema migration, dependency quarantine propagation, and Runner cache invalidation.

### 75.19 Resolver/Discovery Quality

Test positive triggers, negative near-neighbors, ambiguous routing, false-positive invocation, false-negative/missed invocation, and evidence invalidation after discovery metadata changes.

### 75.20 Prompt/Skill Trust Boundary

Test malicious Skill instructions attempting to override platform policy, request hidden secrets, alter approval outcomes, or reinterpret tool authorization.

### 75.21 Installation/Re-consent

Test capability expansion during Skill update, connector scope changes, revoked grants, tenant-policy narrowing, and prevention of silent privilege inheritance.

### 75.22 Composite Skills

Test child re-authorization, circular dependency rejection, deterministic child version resolution, partial child failure, and quarantine propagation through composites.

### 75.23 Tenant Isolation Enforcement

Test PostgreSQL/RLS or equivalent centralized tenant predicates, cross-tenant foreign-key attachment, artifact URL reuse, cache/index leakage, cross-tenant job claim, and confused-deputy admin paths.

### 75.24 Cryptography and Secret Redaction

Test key/secret access boundaries, rotation/revocation, signing-key compromise drill, absence of raw credentials from logs/eval artifacts, and historical signature verification metadata.

### 75.25 Disaster Recovery

Perform restore drills against declared RPO/RTO; reconcile in-flight leases/jobs, missing artifacts, publication state, and audit references after restore.

### 75.26 Provider Resilience

Inject 429/5xx/timeouts and validate bounded backoff+jitter, circuit breaker, bulkhead isolation, retry budgets, fallback labeling, and no duplicate billing/side effects.

### 75.27 Runner Trust

Test revoked Runner credentials, outdated runtime version, forged capability metadata, stale policy sync, wrong tenant ownership, and signature/hash mismatch at execution.

### 75.28 Policy Conflict and Explainability

Create conflicting platform/tenant/team/install/user grants and verify deterministic precedence, restrictive resolution, stable reason codes, and no client-side bypass.

### 75.29 Consequential Side Effects

Test dry-run/preview, per-action approval, destructive/financial action confirmation, approval expiry, changed parameters after approval, and compensation/rollback semantics.

### 75.30 DLP and Data Minimization

Inject credentials/PII-like sensitive fields into prompts, provider responses, tool errors, and logs; verify masking/minimization and policy-controlled raw evidence access.

### 75.31 Eval Lineage and Contamination

Test hidden holdout leakage, duplicate/near-duplicate scenarios, poisoned production-derived cases, unauthorized expected-answer edits, dataset version immutability, and historical evidence reproducibility.

### 75.32 Drift and Evidence Freshness

Simulate model alias/provider/tool/judge/runtime policy changes and verify dependency impact, evidence staleness, targeted regression, and owner notification without classifying outages as behavior failures.

### 75.33 Marketplace Abuse/IP/Takedown

Test abuse reports, impersonation/spam, license/provenance dispute, catalog delisting versus runtime quarantine, appeal/reinstatement, and immutable investigation evidence.

### 75.34 Ownership Transfer and Offboarding

Test owner account deletion/suspension, organization departure, transfer of maintainership, payout/grant revalidation, orphan prevention, and secret revocation.

### 75.35 Fair Scheduling and Noisy-Neighbor Controls

Load-test one tenant with large campaigns and verify concurrency quotas, priority fairness, backpressure/load shedding, starvation prevention, and visibility of throttling reason.

### 75.36 API/Event/Schema Evolution

Run old/new clients, Runners, event consumers, and package schemas through additive/deprecated/breaking changes; verify upgrade-required errors and migration/rollback behavior.

### 75.37 Cache and Revocation Consistency

Populate stale caches on web/Runner/resolver paths, then quarantine/revoke/change policy and verify invalidation within defined SLO and fail-closed privileged execution.

### 75.38 Incident Response Drill

Simulate malicious Skill, leaked secret/signing key, and sandbox incident; validate kill switch, blast-radius query, forensic retention, notification, remediation, and re-certification.

### 75.39 Review Appeals and Conflict of Interest

Test independent re-review, repeated unchanged submissions, reviewer recusal/conflict, stale appeal evidence, and material-revision reset behavior.

### 75.40 Locale/Timezone Determinism

Run fixtures under Thai/English locale, multiple timezones, currency/number formats, and DST-capable zones; verify canonical persistence and correct eval classification.

### 75.41 Advanced Robustness Testing

Use fuzz/property-based tests for manifest/schema/import parsers and authorization invariants; use mutation tests where practical to prove critical validation tests fail when protections are removed.

### 75.42 Chaos and Kill-Switch Testing

Inject queue, database replica, artifact-store, provider, Runner, and realtime transport failures. Verify graceful degradation, durable state, kill-switch behavior, and safe restart without duplicate publication or side effects.

### 75.43 Lifecycle State Machine and Race Tests

Exercise every allowed/forbidden transition plus concurrent approve/publish/quarantine attempts and stale revision writes.

### 75.44 Authorization-at-Use / TOCTOU

Queue a privileged action, then revoke user/grant/Skill/Runner or change policy before execution; verify execution is denied or re-approved as required.

### 75.45 Lease Fencing

Expire/reassign a job lease and verify the old worker cannot commit canonical state, artifacts, billing, or publication.

### 75.46 Atomic Credit Reservation

Launch parallel paid child jobs against a near-empty balance and verify aggregate reservation/settlement cannot exceed authorized budget or double-debit on retry.

### 75.47 Eval Execution Envelope

Verify certification evidence records sampling, prompt/tool/judge/runtime/fixture versions and that materially changed envelopes are not merged as equivalent runs.

### 75.48 Event Ordering and Inbox Idempotency

Deliver duplicate, delayed, out-of-order, and poison events; verify aggregate revision correctness and bounded dead-letter handling.

### 75.49 Approval Liveness

Disable/remove required reviewers mid-flow and test timeout, substitution, escalation, quorum preservation, and stale approval expiry.

### 75.50 Install/Update Pinning

Test pinned, patch-only, compatible-auto-update, capability-expanding update, security hotfix, and rollback-unavailable cases.

### 75.51 Dependency Source Integrity

Test same name/version from different registry/digest, dependency confusion, mutable tag substitution, and blocked/unapproved registries.

### 75.52 MCP/A2A/Tool Confused-Deputy Defense

Return malicious tool metadata/results requesting privilege escalation, cross-tenant action, credential disclosure, and chained tool calls; verify each hop re-authorizes.

### 75.53 Skill Studio Web App Security

Test CSRF, stored/reflected XSS in Skill/eval/log/provider content, unsafe SVG/HTML preview, clickjacking protections, and server-side authorization bypass attempts.

### 75.54 Telemetry Hygiene

Test redaction, prohibited metric labels, high-cardinality explosion controls, trace sampling, and tenant residency restrictions for exporters.

### 75.55 Operational Runbook Drills

Execute tabletop/controlled drills for stuck jobs, provider outage, compromised Runner, signing-key incident, quarantine propagation failure, billing mismatch, and missing artifact.

### 75.56 Artifact Reconciliation

Create orphan, missing, duplicate, incomplete, and retention-mismatched objects and verify staging/reconciliation/GC behavior preserves immutable evidence.

### 75.57 Provider/Model EOL Migration

Mark a dependency deprecated/removed and verify impact discovery, compatibility state, user notification, and fresh evidence requirement for replacement.

### 75.58 Eval Cost-Efficiency and Partial Certification

Verify staged/fail-fast/representative sampling reduces optional cost without skipping mandatory certification suites and labels incomplete matrices as partial.

### 75.59 Multi-Region Consistency

Simulate clock skew, delayed replication/failover, and concurrent region writes; verify revisions/fencing/idempotency preserve publication, approval, job, and billing correctness.

### 75.60 Cancellation Race Tests

Race cancel against child completion/provider response and verify no downstream promotion/publication occurs after cancellation finality.

### 75.61 Rollback and Data-Migration Safety

Test package-only, downgrade-capable, forward-only, and irreversible-external-effect rollback classes, including failure during migration/compensation.

### 75.62 Agent Skills/Superpowers Compatibility

Validate pinned compatibility profiles, discovery/frontmatter constraints, harness-neutral export/import, unsupported-field reporting, and regression tests when external semantics change.

### 75.63 Evidence Invalidation Graph

Modify package/prompt/capability/dependency/policy inputs after green evidence and verify only dependency-valid evidence remains current; certification must stale when required.

### 75.64 Composite Resource Bounds

Test deep recursion, large fan-out, dynamic child selection, cumulative credits/time/calls, and side-effect accumulation; verify parent budgets are subdivided rather than replicated.

### 75.65 External Reference Ingestion

Test private/metadata URLs, redirect/DNS rebinding, oversized content, malicious archives/repos, untrusted reference instructions, credential scope, and provenance recording.

### 75.66 Realtime Subscription Isolation

Attempt cross-tenant/job-ID subscription, stale-session continuation, replay cursor tampering, and shared-channel leakage over SSE/WebSocket/realtime transport.

---

## 76. Edge Cases

The implementation MUST explicitly handle:

- User deletes reference file during build.
- Provider model disappears between baseline and Skill eval.
- Build succeeds but eval provider fails.
- Review begins on stale draft.
- Two reviewers issue conflicting decisions.
- Owner loses Creator permission mid-build.
- Tenant is suspended mid-build.
- Billing balance reaches zero during repair.
- Skill dependency is quarantined.
- Marketplace Skill is forked while upstream is deprecated.
- Imported Skill has unknown capabilities.
- External harness returns code requesting undeclared permissions.
- Model output produces invalid schema repeatedly.
- Skill output contains unsafe/unexpected tool instruction.
- Cross-model results disagree significantly.
- Imported archive contains path traversal/symlink or decompression bomb.
- Dependency is later marked malicious or vulnerable after publication.
- Release signature/package hash mismatch is detected on Runner.
- Hidden holdout leaks into builder context.
- Eval judge disagrees with deterministic checks or another judge.
- DNS record changes from public IP to private/internal IP during execution.
- OAuth/connector authorization is revoked while a queued job is waiting.
- A stale child job completes after a newer draft/release exists.
- Canary release regresses and automatic rollback is requested.
- Tenant requests deletion while security/legal retention applies.
- Quarantine occurs while composite Skill or scheduled job references affected version.
- External harness attempts to modify tests/evidence to make its own output pass.
- Tenant-scoped cache/index accidentally contains another tenant's Skill metadata or artifact reference.
- Signing/encryption key is revoked while a release or long-running job still references it.
- Provider returns sustained 429/5xx and retry-after values conflict with internal retry policy.
- Runner reconnects after being revoked or after policy/runtime compatibility changed.
- User approved a destructive action, but parameters changed before execution.
- Production-derived eval sample is maliciously crafted to poison future certification.
- Hosted model alias changes behavior without changing public model name.
- Marketplace publisher account is disabled while paid Skills remain installed.
- Ownership transfer occurs while a Marketplace review or payout settlement is in progress.
- Large tenant regression campaign exhausts shared provider quota.
- Old Runner receives an event/schema version it cannot interpret.
- Quarantine is issued while stale resolver/cache nodes still advertise the Skill.
- Disaster restore resurrects a job that already completed an external side effect before outage.
- Security advisory is withdrawn/reclassified after tenants already reacted to it.
- Reviewer appeals a decision while a newer draft has already diverged from reviewed evidence.
- Locale/timezone difference changes an expected output date or currency format.

---

## 77. Future-Proofing for 2027+

The framework SHOULD be designed for likely expansion toward:

- Agent-generated Skills from observed workflows
- Automatic skill extraction from successful agent sessions
- Skill composition graphs
- Skill-to-A2A capability export
- Learned routing based on eval history
- Continuous evaluation against live anonymized failure samples
- Organization-specific methodology packs
- Verifiable agent execution receipts
- Model-independent behavior contracts
- Automated compatibility migration when providers change APIs
- Local/private model eval farms through SmartAIHub Runner

These must remain optional extensions to the same core Skill Contract + Evaluation + Policy architecture.

---

## 78. Recommended Implementation Decisions

The following decisions are recommended as defaults:

1. **Skill Studio is NOT Admin-only.**
2. Ordinary users may create Safe Personal Skills if enabled by tenant policy.
3. Skill Creator is the main authoring role.
4. Tenant Admin controls tenant publication but not global privileged permissions.
5. Marketplace publication always requires review.
6. Platform Admin owns global trust/security override/quarantine.
7. Superpowers is a pluggable methodology, not a hard dependency.
8. `worker_jobs` remains job state source of truth.
9. External harnesses never become authoritative platform state.
10. Baseline → Skill → Eval comparison is the default for behavior-oriented Skills.
11. Tests and probabilistic Evals are separate domains.
12. Auto-repair is bounded and cannot escalate permissions.
13. Published releases are immutable.
14. Budget guard is mandatory for multi-agent/eval workflows.
15. Web UI is the primary workflow; files remain available in Advanced mode.
16. Marketplace/Privileged releases use package hashing, platform signing/attestation, provenance, and SBOM where executable dependencies exist.
17. Hidden holdout/adversarial evals are isolated from builders for certification-grade evidence.
18. High-risk approvals require separation of duties and are bound to immutable reviewed revisions.
19. Network access is deny-by-default and goes through SSRF-safe policy-aware egress.
20. Release channels/canary/rollback and quarantine propagation are part of the publication design, not operational afterthoughts.
21. Dependency bytes are locked per immutable release; advisory changes trigger analysis, not silent mutation.
22. APIs and job handlers are idempotent and stale results are rejected.
23. Automatic Skill routing is evaluated separately from Skill behavior after invocation.
24. Skill prompt content is untrusted application content relative to platform policy.
25. Installing a Skill creates explicit grants; later capability expansion requires re-consent.
26. Composite Skills do not collapse child authorization boundaries.
27. Tenant isolation is enforced in data/storage/job/runtime layers, preferably with PostgreSQL RLS or equivalent centralized controls where applicable.
28. Keys/secrets/signing material use managed secret/KMS controls with rotation and compromise response.
29. Certification evidence has immutable dataset lineage and can become stale due to dependency/model/provider drift.
30. Provider calls use bounded backoff/circuit breakers/bulkheads; retry storms are treated as reliability defects.
31. Privileged Runner execution requires authenticated Runner identity and compatibility/trust checks at dispatch/claim time.
32. Consequential side effects have explicit classes and can require dry-run/JIT approval.
33. Platform policy has deterministic precedence and stable explainable reason codes.
34. Marketplace governance includes abuse/IP/takedown/appeal and publisher offboarding, not only malware scanning.
35. Shared execution capacity uses fair scheduling and per-tenant quotas/backpressure.
36. APIs/events/package schemas are explicitly versioned with deprecation/upgrade contracts.
37. Revocation/quarantine/policy changes have a measurable cache-propagation target and fail closed for high-risk actions.
38. Production operations include restore-tested RPO/RTO, incident response, feature flags, and independent emergency kill switches.
39. Locale/timezone-sensitive evals pin deterministic environment settings.
40. Critical parsers/policy boundaries receive fuzz/property/mutation/chaos testing appropriate to risk.

---

## 79. 72-Pass Production-Readiness Audit Record

This revision has been audited in 72 cumulative independent passes. Passes 1–28 are the first production-readiness audit; passes 29–48 are the second audit focused on platform-enforcement gaps and operational failure modes; passes 49–68 are a third audit focused on concurrency correctness, authorization-at-use, operability, interoperability evolution, and late-stage failure races; passes 69–72 are a post-edit architecture review focused on evidence invalidation, composite resource amplification, untrusted reference ingestion, and realtime channel isolation. Gaps found were incorporated into normative requirements above.

| Pass | Audit domain | Result / incorporated change |
|---:|---|---|
| 1 | Document integrity | Fixed duplicate code fence, duplicate verification/checklist lines, redundant separator. |
| 2 | RBAC completeness | Expanded matrix to Team Admin, Security Reviewer, Marketplace Reviewer; added authorization invariants. |
| 3 | Separation of duties | Added no-self-approval, quorum/revision binding, break-glass controls. |
| 4 | Skill package identity | Added canonical hash, platform signing/attestation, build provenance. |
| 5 | Software supply chain | Added SBOM, dependency lock, vulnerability/license/malicious-package controls. |
| 6 | Import/parser security | Added path traversal, symlink, decompression bomb, file-count/size hardening. |
| 7 | Sandbox isolation | Added CPU/RAM/disk/process/time quotas, ephemeral execution, host-service isolation. |
| 8 | Network security | Added deny-by-default egress, SSRF/metadata/DNS rebinding/redirect protection. |
| 9 | Secrets/connectors | Added three-stage permission/grant/runtime authorization and OAuth scope consent. |
| 10 | Eval dataset governance | Added authoring/regression/hidden holdout/adversarial/production-derived sets. |
| 11 | Eval statistical integrity | Added repeated trials, uncertainty, calibration, disagreement/inconclusive handling. |
| 12 | Baseline validity | Added paired/equivalent environment rules and non-equivalent labeling. |
| 13 | External harness trust | Added minimum scope, immutable task revision, untrusted output validation. |
| 14 | Job reliability | Added explicit DAG, outbox, dedupe, dead-letter/manual intervention, replay and compensation. |
| 15 | API robustness | Added idempotency, revision preconditions, pagination, rate limits, stable error taxonomy, webhook security. |
| 16 | Version/contract evolution | Added semantic compatibility and migration requirements for breaking changes. |
| 17 | Release safety | Added preview/stable channels, staged/canary rollout and rollback criteria. |
| 18 | Quarantine/revocation | Added propagation to installs, runtime, queued jobs, composites and Runner caches. |
| 19 | Privacy/data lifecycle | Added retention classes, deletion/tombstone, legal hold, backup expiry and residency. |
| 20 | Artifact integrity | Added content hashes, independent MIME detection, scan status, short-lived scoped access. |
| 21 | Audit/observability | Added tamper-evident audit expectations, SLOs and security/cost/revocation alerts. |
| 22 | Marketplace governance | Added publisher/provenance/freshness/deprecation metadata and stricter release evidence. |
| 23 | Legacy/migration safety | Added distinction between executable compatibility and publication eligibility. |
| 24 | End-to-end verification | Expanded acceptance criteria and Spec-221 test plan to exercise all new controls. |
| 25 | Skill discovery/routing | Added positive/negative/ambiguous trigger evals and resolver accuracy requirements. |
| 26 | Skill prompt trust | Added explicit trust hierarchy so Skill prose cannot override platform policy. |
| 27 | Install/update permissions | Added installation grants and mandatory re-consent for capability expansion. |
| 28 | Skill composition | Added child re-authorization, deterministic versions, cycle detection, and failure semantics. |
| 29 | Tenant isolation enforcement | Added centralized tenant scoping across DB/RLS, artifacts, caches/indexes, jobs, and privileged cross-tenant paths. |
| 30 | Cryptography/key management | Added managed secret/KMS handling, signing-key separation, rotation/revocation, and compromise enumeration. |
| 31 | Disaster recovery | Added restore-tested RPO/RTO, in-flight job reconciliation, artifact/evidence recovery, and key recovery/rotation. |
| 32 | Provider resilience | Added bounded backoff/jitter, rate-limit handling, circuit breakers, bulkheads, and explicit fallback evidence semantics. |
| 33 | Runner trust | Added authenticated Runner principal, version/capability/policy compatibility, revocation, and execution-time checks. |
| 34 | Policy precedence | Added deterministic restrictive precedence, conflict handling, stable reason codes, and user-actionable explanations. |
| 35 | Side-effect safety | Added side-effect classes, dry-run/preview, JIT approval, immutable approved parameters, and compensation awareness. |
| 36 | DLP/log redaction | Added sensitive-data minimization/redaction and restricted raw prompt/response evidence handling. |
| 37 | Eval contamination/poisoning | Added dataset lineage, immutable certification sets, hidden-answer isolation, near-duplicate detection, and poisoned-sample quarantine. |
| 38 | Model/provider drift | Added evidence freshness/staleness and targeted re-evaluation triggers without conflating outages with regressions. |
| 39 | Marketplace abuse/IP | Added abuse, impersonation, spam, provenance/IP dispute, takedown, appeal, and reinstatement workflows. |
| 40 | Ownership/offboarding | Added Skill ownership transfer, disabled-account/org-departure behavior, payout/grant revalidation, and orphan prevention. |
| 41 | Fair scheduling | Added tenant/user concurrency limits, starvation prevention, backpressure, load shedding, and expensive-pool isolation. |
| 42 | API/schema evolution | Added explicit API/event/package schema versions, deprecation windows, migration rules, and old-client/Runner behavior. |
| 43 | Cache/revocation consistency | Added propagation SLO, security-critical cache invalidation, and fail-closed stale state for high-risk execution. |
| 44 | Incident response | Added emergency kill switch, blast-radius discovery, forensic preservation, advisories, notification, and re-certification. |
| 45 | Review appeals | Added independent re-review/appeal, conflict-of-interest handling, and unchanged-submission/revision rules. |
| 46 | Locale/timezone determinism | Added canonical persistence plus pinned locale/timezone/currency semantics for eval reproducibility. |
| 47 | Advanced verification | Added fuzz/property-based/mutation testing requirements for parsers, authorization, and critical validation boundaries. |
| 48 | Chaos/operational safety | Added failure-injection and kill-switch tests across queues, DB/artifact/provider/Runner/realtime paths. |
| 49 | Lifecycle transition correctness | Added explicit authoritative state machine, transition preconditions, atomic CAS/revision checks, and security-state restoration rules. |
| 50 | Authorization TOCTOU | Added authorization-at-use and short-lived scoped execution authorization so queued work cannot outlive revoked policy/grants. |
| 51 | Lease fencing | Added attempt/fencing generation and stale-worker rejection for canonical state/artifact/billing/publication writes. |
| 52 | Credit concurrency | Added atomic reservation/authorization, expiry/reconciliation, and idempotent settlement for parallel billable work. |
| 53 | Eval reproducibility envelope | Added persisted sampling/prompt/tool/judge/runtime/fixture details and non-equivalent rerun labeling. |
| 54 | Event delivery correctness | Added duplicate/out-of-order tolerance, aggregate sequence/revision checks, inbox-style idempotency, and poison-event handling. |
| 55 | Approval liveness | Added timeout/escalation, safe delegation/substitution, quorum preservation, and explicit blocked states. |
| 56 | Install/update safety | Added exact version/digest pinning, update policies, capability-aware reconsent, and rollback availability disclosure. |
| 57 | Dependency-source integrity | Added registry/source identity, dependency-confusion/typosquatting/source-substitution defenses, and digest-based evidence invalidation. |
| 58 | MCP/A2A/tool trust | Added untrusted tool-response policy, confused-deputy defense, per-hop authorization, and bounded/audited delegation. |
| 59 | Web application security | Added CSRF/XSS/clickjacking/session step-up/untrusted-download protections for Skill Studio. |
| 60 | Telemetry hygiene | Added metric-cardinality controls, payload redaction, trace sampling, and telemetry residency constraints. |
| 61 | Operational runbooks | Added alert-linked runbooks, safe operator actions, escalation ownership, and audited repair requirements. |
| 62 | Artifact reconciliation | Added staged artifact commit, DB↔object-store reconciliation, orphan cleanup safety, and immutable-evidence incident handling. |
| 63 | Provider/model EOL | Added dependency impact discovery, explicit AT_RISK/MIGRATION_REQUIRED/UNSUPPORTED states, and re-evaluation on replacement. |
| 64 | Eval economics | Added staged/representative/fail-fast evaluation, marginal-cost visibility, and explicit partial-certification semantics. |
| 65 | Multi-region correctness | Added non-wall-clock authority, bounded clock-skew assumptions, and uniqueness/correctness across failover. |
| 66 | Cancellation finality | Added atomic cancellation, detached late-result handling, and prevention of post-cancel downstream promotion. |
| 67 | Rollback/migration safety | Added rollback classes and explicit handling for forward-only migrations and irreversible external side effects. |
| 68 | Agent Skills/Superpowers evolution | Added version-pinned discovery/frontmatter compatibility, harness-neutral semantics, and regression testing for external spec changes. |
| 69 | Evidence invalidation | Added dependency-aware invalidation so changed package/contract/tool/dependency inputs cannot retain stale certification/review evidence. |
| 70 | Composite resource amplification | Added depth/fan-out/invocation/time/cost bounds and bounded budget propagation to nested child Skills. |
| 71 | External reference ingestion | Added SSRF-safe bounded URL/repo fetching, untrusted-content treatment, and provenance for builder references. |
| 72 | Realtime channel isolation | Added per-subscription server authorization, long-lived revalidation/expiry, tenant-safe fan-out, and scoped resume tokens. |

The 72-pass audit is not a claim that no future gap can exist. Any implementation divergence, new Skill type, new external harness, provider behavior change, or new security class MUST trigger targeted threat-model/eval updates.

---

## 80. Definition of Done

Spec 221 is done when SmartAIHub provides a safe, auditable, UI-first Skill engineering system where:

```text
Everyone can USE according to policy.
Some users can CREATE.
Verified/authorized users can PUBLISH.
Reviewers can APPROVE.
Admins control TRUST and privileged capabilities.
```

And where Skill quality is established through evidence:

```text
Requirement
→ Contract
→ Baseline
→ Build
→ Test
→ Eval
→ Repair
→ Review
→ Verify
→ Publish
```

rather than trusting a single model response or manually uploaded ZIP package.

---

## 81. Final Architecture Summary

```text
                         SmartAIHub Web
                              │
                         Skill Studio
                              │
                              ▼
                 Skill Engineering Control Plane
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
 Skill Contract         Methodology Engine       Policy Engine
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
          Quick            Standard       Superpowers-Compatible
                              │
                              ▼
                        Eval/Test Engine
                              │
                        Repair Controller
                              │
                         Review Engine
                              │
                     Capability Resolver
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
 Internal Agents       External Agents          MCP / A2A
                         Spec 200              Spec 199/206
                              │
                              ▼
                     Unified Job Control Plane
                        worker_jobs SoT
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
        Cloud Exec        SmartAIHub Runner    Provider APIs
                       Win / Mac / Linux
                              │
                              ▼
                      Library / R2 / Database
```

**Key principle:** SmartAIHub controls workflow, identity, permissions, evidence, job state, cost, approval, publication, and trust. Methodologies and external agents are replaceable execution helpers.



# Revision 2 Addendum — Alignment with AI Product Platform and Spec 230

**Normative precedence:** This Revision 2 addendum supersedes earlier Spec 221 ownership statements only where needed to centralize cross-harness bootstrap/context in Spec 230. Existing Skill lifecycle, security and eval requirements remain in force.

## 82. Canonical Skill vs Mini App Boundary

A SmartAIHub Skill is a reusable capability contract. It does not require a dedicated user interface.

```text
Skill = callable behavior/capability
Mini App = user-facing experience that MAY call Skills
Product = branded shell that MAY compose Mini Apps
```

Spec 221 SHALL NOT grow into the Mini App/Product UI system. UI/productization is owned by Specs 217/216, while development harness context/bootstrap is owned by Spec 230.

## 83. Product-Driven Skill Creation

Spec 217/222 MAY initiate a Skill Engineering request when Product architecture discovers a missing reusable capability.

The request SHALL enter the normal Spec 221 lifecycle and MUST NOT receive an automatic publication bypass merely because another Product is waiting for it.

Supported target scopes include:

```text
PERSONAL
TEAM
TENANT
MARKETPLACE_CANDIDATE
PLATFORM_INTERNAL  # restricted
```

Once an eligible version is released and registered in Capability Registry, the originating Product build MAY resume and bind it.

## 84. Skill Reuse by Mini Apps and Tenant Products

A Mini App/Product invokes Skills through Spec 220 capability contracts. It SHOULD pin or declare a compatible Skill version policy according to Product release rules.

Skill ownership and Mini App ownership MAY differ. Spec 207/economic authority determines revenue attribution where applicable; neither Spec 217 nor 221 shall duplicate settlement.

## 85. Superpowers Responsibility Split

Spec 221 retains **Skill-specific engineering semantics**:

- Skill Contract;
- baseline/no-skill comparison;
- pressure scenarios;
- deterministic tests;
- behavior evals;
- repair loops;
- cross-model compatibility;
- Skill security/review/publication readiness.

Spec 230 owns **cross-artifact harness integration**:

- installing/detecting Superpowers per harness;
- version pinning/compatibility profile shared across Product and Skill development;
- project/workspace context generation;
- `AGENTS.md`, `CLAUDE.md` and harness-specific instruction adapters;
- SmartAIHub orchestrator/meta-skills;
- mapping a user request to Skill vs Mini App vs Product engineering;
- UI/UX engineering profiles.

Spec 221 MUST consume these services instead of implementing a second Runner/harness bootstrap system.

## 86. SmartAIHub Skill Authoring Pack

Spec 230 SHALL provide a SmartAIHub Skill Engineering adapter/skill pack that teaches supported coding harnesses how to work on a Spec 221 Skill source workspace, including:

```text
where the Skill Contract lives
package/schema conventions
how to query SmartAIHub capability schemas
how to run baseline/evals
how to request restricted capabilities
how to avoid secrets/direct Core DB access
how to submit build/review evidence
```

The pack complements, rather than replaces, upstream Superpowers `writing-skills` discipline.

## 87. Skill Source and Git

Skill source MAY be developed in a Git-backed workspace when code/review complexity warrants it, but authoritative Skill identity, release version, certification, Marketplace state and trust evidence remain in SmartAIHub.

A Git push alone MUST NOT publish or promote a Skill.

## 88. Revision 2 Acceptance Criteria

- [ ] Product Builder can trigger a governed Skill creation request for a real capability gap.
- [ ] Mini Apps call Skills through governed capability contracts.
- [ ] Spec 221 does not duplicate Product UI/tenant/runtime ownership.
- [ ] Superpowers/harness installation and project instruction adapters are centralized in Spec 230.
- [ ] Skill release remains governed by Spec 221 regardless of the harness used to build it.


## 89. Terminology Collision — SmartAIHub Skill vs Harness Skill

The platform MUST distinguish two different artifacts that may both be informally called a "skill":

```text
SmartAIHub Runtime Skill
= Spec 221 user/platform capability artifact
= invoked through SmartAIHub runtime/capability gateway
= may be Personal/Team/Tenant/Marketplace

Harness Engineering Skill
= instruction/methodology package loaded into Claude/Codex/Antigravity/Hermes
= used only to help an engineering agent work correctly
= owned/governed by Spec 230 for first-party SmartAIHub development
```

A user-created SmartAIHub Runtime Skill MUST NOT automatically be installed into the user's coding harness as a Harness Engineering Skill.

The `smartaihub-orchestrator` and related first-party development skills are Harness Engineering Skills, not Marketplace runtime Skills.

If future interoperability allows export/import between these formats, conversion MUST be explicit, versioned and security-reviewed.

## 90. Local Harness Authentication Boundary

When a user Runner invokes locally installed Claude/Codex/Antigravity/Hermes, SmartAIHub SHOULD use the harness under the user's existing local authentication/session where technically supported. Runner MUST NOT scrape, export or upload the user's subscription/session credentials to SmartAIHub merely to invoke the local harness.

Managed cloud harness execution uses separately governed platform/tenant credentials and billing policy.

# Revision 3 — Final Integrated Product/Skill Stress-Audit Addendum

**Normative precedence:** This addendum preserves the prior 72-pass audit and supersedes conflicting cross-spec alignment text. Spec 221 owns `RUNTIME_SKILL` engineering/release; Spec 230 owns `HARNESS_ENGINEERING_SKILL` distribution/bootstrap.


## R3.1 Shared Contract Family and Version Negotiation

Specs 217–222 SHALL consume the existing SmartAIHub shared contracts rather than invent parallel protocol families.

Existing companion contracts remain authoritative where applicable:

```text
SAH-EXEC-1      canonical execution/job correlation
SAH-CAP-1       capability identity/invocation
SAH-RUNNER-1    Runner control/capability presence
SAH-CONTEXT-1   platform/user/task context
SAH-ASSET-1     AssetRef/ArtifactRef authorization
```

This package adds only the following product-engineering contracts:

```text
SAH-PRODUCT-1   Tenant/Product/Mini App composition and release identity
SAH-DEV-1       DevelopmentJob/ChangeSet/engineering-evidence handoff
SAH-RELEASE-1   ReleaseCandidate → RuntimeRelease admission
SAH-SKILL-1     SmartAIHub Runtime Skill contract/dependency identity
SAH-DEVCTX-1    ProjectContextPack / harness-adapter engineering context
```

Every persisted cross-spec reference MUST carry a contract version or version family. Mixed-version deployments MUST negotiate compatible ranges or fail closed. A producer MUST NOT silently emit a new required field/semantic that an older consumer ignores.

Contract evolution rules:

- additive optional fields MAY be backward compatible;
- changed authorization, billing, side-effect, identity or lifecycle semantics require a new compatible version/range and conformance tests;
- production releases MUST pin the contract versions actually used;
- rollback MUST know whether persisted state is backward-readable;
- a compatibility matrix SHALL be queryable by Admin/CI/release gates.

## R3.2 Canonical Runtime Skill Identity

A SmartAIHub user/platform Skill defined by this spec SHALL use the semantic class:

```text
RUNTIME_SKILL
```

It is a reusable capability and MUST NOT require a user-facing UI.

Optional presentation metadata MAY help Skill Studio/Marketplace/documentation, but UI/UX product composition belongs to Specs 216/217.

A harness-native "skill", plugin, instruction pack or Superpowers methodology unit is `HARNESS_ENGINEERING_SKILL` and is outside Runtime Skill invocation/publication semantics.

## R3.3 Product Capability-Gap Intake Contract

Spec 221 SHALL accept a governed capability-gap request from Specs 217/222 containing:

```text
gap_id
requesting tenant/product/development job
required capability contract
input/output schemas
side-effect requirements
data/residency constraints
quality/eval target
budget/deadline
intended visibility/ownership
reuse/search evidence
```

Skill Engineering MUST determine whether to:

```text
reuse existing capability
extend/new version of existing Skill
create new Skill
reject/return design change
```

A Product request does not guarantee a new Skill will be created.

## R3.4 Skill Dependency Manifest and Cycle Prevention

Published Runtime Skills MUST expose a dependency manifest covering child Skills/capabilities/tools/providers that materially affect runtime.

Rules:

- direct and transitive Runtime Skill dependency cycles are forbidden unless an explicitly modeled bounded recursive semantic exists and passes policy;
- dependency graph validation occurs before release;
- production release pins dependency versions/compatibility ranges according to policy;
- parent budget/time/call/fan-out limits propagate to children rather than being replicated;
- transitive permission/effect requirements are visible to review.

## R3.5 Reverse Dependency / Impact Events

When a Runtime Skill version changes state:

```text
SECURITY_REVOKED
DEPRECATED
AT_RISK
MIGRATION_REQUIRED
UNSUPPORTED
PRICE_POLICY_CHANGED
LICENSE_CHANGED
```

Spec 221 SHALL emit/record impact information consumable by Specs 217/219/220.

No automatic Product upgrade is implied.

## R3.6 Skill Economics Integration

If a Runtime Skill has a creator/platform usage fee, Spec 207 remains authoritative.

Skill execution SHALL identify:

```text
skill id/version
owner/economic beneficiary
execution/job lineage
provider costs
Skill fee policy version
calling Product/Mini App context
```

A Product or Mini App MUST NOT copy the Skill fee into its own usage fee and then also charge the original Skill fee unless the quote clearly models two genuinely distinct charges.

## R3.7 Engineering Harness Independence

Skill engineering MAY use:

```text
SmartAIHub native methodology
Superpowers-compatible local harness
managed cloud harness
local Runner coding harness
human developer
```

but all paths converge on the same Skill Contract, tests/evals, evidence, review and publication state machine.

A vendor-managed agent cannot publish a Skill merely by pushing Git or returning "done".

## R3.8 Superpowers Upstream Drift

Superpowers and other methodology integrations are external dependencies.

The adapter SHALL record:

```text
upstream source/version/commit or marketplace version
harness compatibility
installed development-skill versions
methodology profile revision
last regression result
```

If upstream semantics materially change, the new adapter/profile is canaried against representative Skill engineering benchmarks before platform-default promotion.

## R3.9 Skill Source Repository and Product Repository Separation

A Runtime Skill MAY have its own Git-backed source project when needed.

Product repositories SHOULD reference released Skill identities/contracts rather than vendor-copying Skill source.

If Product and Skill source live in one mono-repository for an approved internal case, release identities and authorization boundaries remain logically separate.

## R3.10 Revision 3 Acceptance Criteria

- [ ] `RUNTIME_SKILL` and `HARNESS_ENGINEERING_SKILL` are distinct registries/artifacts.
- [ ] Product capability-gap requests arrive with a formal contract/evidence and may resolve by reuse instead of new Skill creation.
- [ ] Runtime Skill dependency graph detects cycles and bounds transitive budgets/permissions.
- [ ] Skill revocation/deprecation/price/license changes produce reverse-impact information.
- [ ] Skill fees integrate with Spec 207 without double charging through Product/Mini App layers.
- [ ] All local/managed/human engineering paths share the same Skill publication gates.
- [ ] Superpowers upgrades are version-pinned and regression-gated.

## R4.1 Revision 4 Amendment — Repository Engineering Skills and Hardening Methodology

Revision 4 is additive and normative. It aligns the Skill Engineering Framework with Specs 222/224 so the engineering quality already obtained from repository-local methodology Skills can be preserved inside the durable Autonomous Development Orchestrator rather than replaced by generic phase prompts.

The central distinction is:

```text
Spec 221
  owns how an engineering Skill is contracted, evaluated, versioned and trusted

Spec 230
  owns repository/project context, Skill selection and provider/harness packaging

Spec 224
  owns durable lifecycle, closure, recovery, hardening campaigns and finality
```

A Skill MAY improve reasoning and execution quality. A Skill SHALL NOT become the durable lifecycle authority, mint Final Verify, widen authorization or silently redefine an approved Spec.

## R4.2 Repository Engineering Skill Class

Spec 221 SHALL formally support a governed engineering Skill class usable from repository-local sources such as an approved `<repo-root>/skills/**` tree.

Logical classification:

```text
HARNESS_ENGINEERING_SKILL
  ├─ METHODOLOGY
  ├─ DOMAIN_ENGINEERING
  ├─ REVIEW_METHOD
  ├─ DEBUG_METHOD
  ├─ AUDIT_LENS
  └─ PROJECT_ENGINEERING_GUIDE
```

This class is distinct from a runtime/business `RUNTIME_SKILL`. Repository engineering Skills guide software-development work; they do not become customer runtime capabilities merely because they are present in a product repository.

Minimum engineering-Skill metadata SHOULD support:

```text
skill_id
name
purpose
skill_class
applicable_phases[]
applicable_artifact_types[]
domain_tags[]
risk_tags[]
required_context[]
required_tools[]
expected_outputs[]
forbidden_authority[]
provider_compatibility[]
resource_manifest[]
version / source revision / digest
```

## R4.3 Methodology Skill Contract

Methodology Skills used for planning, TDD, systematic debugging, root-cause analysis, review, migration engineering, UI/UX verification or production hardening SHALL declare the behavior they are intended to improve and the evidence by which their usefulness is evaluated.

Example logical contract:

```text
MethodologySkillContract
  phase_fit
  task_fit
  entry_conditions
  procedure_or_reasoning_guidance
  expected_intermediate_artifacts
  expected_final_artifacts
  anti_patterns
  escalation_conditions
  evaluation_fixtures
  quality_metrics
```

A methodology Skill SHALL NOT declare a run successful merely because its local procedure completed.

## R4.4 Skill-First but Selective Execution

`skill-first` means that the system SHALL consult relevant governed engineering Skills before inventing an ad-hoc methodology when a suitable Skill is available. It does **not** mean loading all Skills into every model context.

The preferred sequence is:

```text
metadata discovery
→ task/phase/domain filtering
→ shortlist
→ load selected SKILL.md / primary instructions
→ lazy-load supporting references/scripts only when needed
→ execute
```

Repository Skill catalogs MAY contain many Skills. Only the selected Skills needed for the current PlanSection, WorkPackage, repair, review or audit lens SHOULD be materialized into the executor context.

## R4.5 Audit-Lens Skill Contract

Production-hardening campaigns in Spec 224 MAY use `AUDIT_LENS` Skills to generate focused review hypotheses rather than repeatedly asking a generic "find more gaps" prompt.

An Audit-Lens Skill SHOULD define:

```text
focus domain
failure hypotheses
invariants to challenge
code/config/evidence to inspect
counterexamples
expected test/fault-injection ideas
finding classification hints
follow-up lens rules
```

Examples include concurrency, authorization, tenant isolation, migration, browser routing, UI state logic, accessibility, operational recovery, billing correctness and supply-chain integrity.

Audit-Lens Skills provide analysis discipline, not finding truth. Findings still require Spec 224 classification, deduplication and evidence.

## R4.6 Skill Effectiveness Evidence

Spec 221 SHALL allow methodology/engineering Skills to accumulate bounded effectiveness evidence without turning historical success into authority.

Recommended evidence dimensions:

```text
skill_id + version/digest
phase
task/domain class
harness/provider/model family where relevant
completion outcome
repair iterations
test/eval result
review findings
human intervention
latency
token/cost telemetry where available
false-positive/false-negative audit outcomes where measurable
```

Spec 222 MAY use this evidence for ranking. Spec 224 MAY use it for strategy selection. Neither may infer authorization or Final Verify from historical score.

## R4.7 Immutable In-Run Skill Binding

An engineering Skill selected for an active consequential WorkPackage or audit pass SHALL be bound by source revision/digest for that action generation.

If its content changes while a run is active:

```text
existing action → keeps immutable binding
new action      → re-resolves according to policy
material rebinding → records new binding and invalidates affected evidence when required
```

An executing agent SHALL NOT rewrite the Skill governing its own current certification in order to obtain a passing result.

Suggested improvements SHALL become a separate `SkillImprovementProposal` and follow the Spec 221 review/eval path.

## R4.8 Engineering-Skill Behavioral Evals

Engineering Skills SHOULD be evaluated on representative pressure scenarios, not only lint/schema validity.

At minimum, high-value Skills SHOULD be tested for:

```text
requirement/scope discipline
premature completion resistance
test-tampering resistance
correct escalation
useful decomposition
false-positive rate in review/audit tasks
finding quality
handoff quality
provider/harness compatibility
context-efficiency
```

Changes to high-impact engineering Skills SHOULD be regression-gated before becoming the default repository/project profile.

## R4.9 Cross-Spec Ownership

The following ownership is normative:

| Concern | Owner |
|---|---|
| Engineering Skill contract/eval/version/publication | Spec 221 |
| RepositoryEngineeringProfile and skill/context resolution | Spec 230 |
| WorkPackage/audit-lens lifecycle and completion | Spec 224 |
| Provider transport/session semantics | Spec 200/provider adapter |
| Server authorization | shared policy/capability infrastructure |

No repository Skill may override this ownership matrix.

## R4.10 Revision 4 Required Tests

Add at least these tests:

1. repository engineering Skill is classified separately from a runtime business Skill;
2. relevant Skill is selected without loading an unrelated large catalog into context;
3. Skill supporting references are loaded lazily;
4. active Skill digest changes mid-action and the running binding remains reproducible;
5. agent attempts to modify the governing Skill and current certification refuses the mutation as authority-changing;
6. Audit-Lens Skill generates focused hypotheses but cannot close its own finding;
7. effectiveness history improves ranking without widening capability permissions;
8. methodology Skill conflicts with Spec 224 PhaseProtocol and PhaseProtocol wins;
9. provider lacks native Skill support and the selected engineering guidance is rendered through an approved fallback adapter;
10. Skill version regression is caught by behavioral eval before default promotion.

## R4.11 Revision 4 Acceptance Criteria

Revision 4 is complete when:

- [ ] repository engineering Skills are explicit governed artifacts rather than accidental prompt files;
- [ ] skill-first selection is selective/progressive rather than full-catalog injection;
- [ ] methodology and audit Skills have measurable behavioral contracts;
- [ ] in-run Skill bindings are reproducible and cannot silently self-modify;
- [ ] effectiveness evidence can inform routing without becoming authority;
- [ ] Specs 221/222/224 have non-overlapping ownership for Skill engineering, Skill resolution and lifecycle finality.

## R4.12 Revision 4 Final Principle

> **SmartAIHub SHALL preserve the engineering value of mature Skills while moving lifecycle authority out of Skills. Skills should make the engineer smarter; Spec 224 should make the process durable, traceable and complete.**

---

# Revision 5 Canonical Spec 222/230 Split and Kimi Skill Compatibility

This revision corrects the historical number collision:

```text
Spec 221 = Skill engineering, evaluation, governance and publication
Spec 222 = Self-Improving Exploration Layer (learning/advisory)
Spec 230 = Agentic Development Fabric (Project Context, RepositoryEngineeringProfile, harness bootstrap/methodology)
Spec 224 = durable development lifecycle/closure/finality
```

Any earlier clause in this document that uses Spec 230 for historical learning/strategy ranking is superseded: **cross-run learning and policy evaluation belong to Spec 222**. Repository engineering profile, context and harness preparation belong to Spec 230.

## Kimi Code Skill Mapping

Kimi Code SHALL be a supported consumer of governed engineering Skills when its adapter is certified. Spec 230 may materialize selected Skills through Kimi project/extra Skill directories or an isolated run-scoped configuration. Spec 221 remains the owner of Skill quality/version/evals; Kimi's local Skill loader is only a transport/execution mechanism.

For a SmartSpecPro repository with a root `skills/` directory, the Kimi adapter MAY bind the **selected** project Skills into the run by a certified `extra_skill_dirs` / run-scoped skills configuration. It SHALL NOT make every repository Skill mandatory for every phase and SHALL preserve digest/version provenance.
---

# Revision 5C — Spec 229 Skill Retrieval Boundary

Spec 221 owns Skill contracts, engineering, tests/evals, trust, versioning and publication. **Spec 229 owns production semantic/vector/search retrieval for Skill discovery.**

Skill metadata/content MAY be projected to Spec 229 indexes (including the canonical `sah-skills-v2` direct-vector lane or document RAG projection where appropriate), but the index is derived data and never the Skill source of truth.

Spec 230 RepositoryEngineeringProfile / Methodology Resolver MAY request candidate Skills from Spec 229, then select only the relevant phase/WorkPackage/AuditLens Skills. Spec 229 does not decide whether a Skill is authorized, trustworthy or methodologically appropriate; those decisions remain with Spec 221/230/policy.

No new pgvector/vector-search implementation may be introduced inside Spec 221 after Spec 229 cutover.


## Shared Retrieval Contract Family — `SAH-RETRIEVAL-2`

All production consumers in Specs 214–230 that require semantic/document/entity search SHALL use the canonical Spec 229 Retrieval Broker contract rather than provider-specific search APIs.

The shared request MUST carry at least:

```text
request_id
principal / tenant / project / environment
purpose
query_class
query_text or structured selector
source_classes
required_visibility / ACL scope
language hints
exact identifiers if present
maximum evidence budget
freshness requirement
consumer spec / run / workflow references
```

The normalized response MUST carry at least:

```text
retrieval_trace_id
provider/profile/version
query plan
EvidenceRef[]
source identity + source revision/digest
ACL/provenance/freshness state
retrieval/rerank scores as non-authoritative evidence
quality-gate result
partial/degraded indicators
```

`EvidenceRef` SHALL be a reference to authorized canonical content; retrieved text/vector similarity SHALL NOT become lifecycle state, authorization, approval, identity or source-of-truth data.


---

# Revision 6 — Canonical Skill Discovery Projection and Retrieval Lifecycle

Spec 221 remains the authoritative owner of Skill identity, source, version, trust, eval/certification, lifecycle and publication. Spec 229 owns the production search/vector/RAG data plane used to discover Skills.

## Skill Discovery Projection

Every searchable Skill version SHOULD expose a safe machine-readable `SkillDiscoveryProjection` containing only index-appropriate data, for example:

```text
skill_id / version / source_kind
source repository + revision + path when repository-local
digest
publisher/tenant/project/visibility
lifecycle status
trust tier / certification refs
summary / domains / capability tags
applicable phases / artifact classes
positive triggers / negative triggers
required tools/capabilities
risk/effect class
compatibility constraints
language metadata
updated_at
```

Secrets, private credentials and unrestricted package internals MUST NOT be included merely to improve embedding quality.

## Publication / Invalidation

Canonical lifecycle changes SHALL emit idempotent projection events such as:

```text
SKILL_PUBLISHED
SKILL_VERSION_UPDATED
SKILL_REVOKED
SKILL_DEPRECATED
SKILL_VISIBILITY_CHANGED
SKILL_DELETED
REPOSITORY_SKILL_REVISION_CHANGED
```

Spec 229 consumes these events to upsert/tombstone search projections. Search freshness is observable.

## Discovery Is Candidate Generation

Skill retrieval SHALL follow:

```text
purpose + phase + domain + exact identifiers
→ Spec 220 scope/eligibility prefilter
→ Spec 229 exact/keyword/vector/hybrid retrieval
→ rerank / evidence-quality gate
→ Spec 221 authoritative version/trust/lifecycle revalidation
→ Spec 230 methodology/context selection where development-related
→ lazy load selected canonical Skill source
```

A vector hit is never proof that a Skill is enabled, trusted, compatible or callable.

## Skill Retrieval Evaluation

Spec 221 certification SHALL include Skill-discovery evals covering:

- exact Skill ID/version lookup;
- Thai/English/mixed-language intent;
- positive trigger recall;
- negative-trigger/hard-negative rejection;
- near-duplicate Skills;
- revoked/deprecated Skill exclusion;
- wrong-tenant/private Skill leakage = zero;
- phase/methodology fit;
- ambiguous query where multiple valid Skills are returned with explainable evidence;
- index-lag revalidation preventing stale execution.

The discovery system SHALL measure retrieval quality independently from execution success so a powerful Skill does not mask a poor resolver.

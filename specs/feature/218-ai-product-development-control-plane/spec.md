# Spec 218 — SmartAIHub AI Product Development Control Plane
## Natural-Language Development, Runner Workspaces, Harness Adapters, Git Source Control, Preview & Change Governance

**Status:** Architecture Freeze Candidate / Implementation-ready subject to conformance tests
**Spec ID:** 218  
**Revision:** 3 — Final integrated stress-audit / architecture freeze candidate
**Date:** 2026-09-20  
**Target repository path:** `specs/feature/218-ai-product-development-control-plane/spec.md`  
**Core depends on:** Spec 217 Product identity, core Spec 220 gateway contracts, Spec 222 Phases 1–2 harness/context contracts, Feature 195 / canonical worker job control plane, existing SmartAIHub Runner architecture and external-agent/harness specs  
**Integration depends on:** Spec 219 deployment adapter, Spec 221 Skill release integration and Spec 222 Phases 3–5. Spec 219 is not a bootstrap prerequisite for the development control-plane records.  
**Companion specs:** Spec 217, Spec 219, Spec 220, Spec 221, Spec 222

---

# 0. Executive Decision

SmartAIHub SHALL let a Tenant Admin develop or modify a branded AI Product from the normal `smartaihub.app` UI using natural language, without requiring the user to operate Git, terminal commands, Cloudflare dashboards or deployment tooling.

Development MAY execute on:

1. a SmartAIHub Runner installed on a user-controlled Windows/macOS/Linux machine; or
2. a SmartAIHub-managed isolated cloud development sandbox.

A Runner MAY expose one or more installed development harnesses such as Claude Code, Codex CLI, Antigravity, Hermes or future tools. SmartAIHub SHALL treat these tools as replaceable adapters, not architectural dependencies.

Source code SHALL be version-controlled. For the default managed model, one private repository SHOULD exist per independently deployable Product, not necessarily one repository per Tenant.

A local Runner SHALL NOT be production deployment authority and SHALL NOT hold long-lived production Cloudflare, database, R2 or provider credentials.

Canonical path:

```text
Tenant Admin request in SmartAIHub UI
→ Product Architect / change planner
→ DevelopmentJob
→ Development Target Resolver
→ Runner or Managed Sandbox
→ Harness Adapter
→ scoped source workspace
→ edit / build / test / preview
→ commit / push change branch
→ change review
→ release candidate
→ Spec 219 Release Service
```

---

# 1. Goals

1. Make software development accessible from SmartAIHub UI.
2. Allow non-developer Tenant Admins to request changes using natural language.
3. Reuse local development tools installed on the Tenant Admin's machine when available.
4. Support cloud fallback when no suitable local Runner/harness is available.
5. Keep source code under controlled versioning and review.
6. Preserve a clean boundary between development and production.
7. Prevent AI coding tools from receiving unrestricted SmartAIHub Core access.
8. Make harnesses swappable as the AI coding ecosystem changes.
9. Produce auditable, reproducible releases.
10. Support expert developers who want direct repository access without making Git knowledge mandatory for normal users.

---

# 2. Non-Goals

Spec 218 SHALL NOT:

- implement the Product/Tenant business model (Spec 217);
- own production Cloudflare routing/deployment (Spec 219);
- expose Core SQL/R2/Vector credentials (Spec 220);
- create another durable Job system;
- assume Claude/Codex/Antigravity/Hermes is permanently available;
- allow coding agents to push directly to protected production branches by default;
- make the Tenant Admin's computer a production server;
- store arbitrary source repositories in workflow runtime state.

---

# 3. Development Objects

```text
ProductSourceRepository
DevelopmentWorkspace
DevelopmentJob
DevelopmentPlan
HarnessDescriptor
RunnerCapabilityManifest
SourceChangeSet
BuildResult
TestResult
SecurityScanResult
PreviewEnvironmentRef
ChangeReview
ReleaseCandidate
```

These objects are development/control-plane records and MUST be distinct from WorkflowRun/NodeRun.

---

# 4. Repository Granularity

Default rule:

> **One repository per independently deployable Product.**

Examples:

```text
Tenant InteriorPro
  ├─ Product Interior Studio → repo A
  ├─ Product Contractor Portal → repo B
  └─ Product Customer Showcase → repo C
```

A mono-repo MAY be supported for advanced/enterprise cases, but repository granularity MUST be explicit and not inferred from Tenant identity.

---

# 5. Repository Ownership Models

Supported modes:

```text
SMARTAIHUB_MANAGED_GIT
TENANT_CONNECTED_GIT
ENTERPRISE_CUSTOM_GIT
```

Default creator/SME path SHOULD be `SMARTAIHUB_MANAGED_GIT` using private repositories in a platform-controlled organization or equivalent service.

Advanced tenants MAY connect their own repository under scoped authorization.

Production release policy MUST NOT depend on Git provider-specific semantics beyond the SourceControlAdapter contract.

---

# 6. Git Provider Abstraction

```ts
interface SourceControlAdapter {
  createRepository(input: CreateRepositoryRequest): Promise<RepositoryRef>;
  createBranch(repo: RepositoryRef, baseRef: string, branchName: string): Promise<void>;
  issueScopedCredential(repo: RepositoryRef, permissions: string[], ttlSeconds: number): Promise<CredentialRef>;
  commitAndPush(input: CommitPushRequest): Promise<CommitRef>;
  openChangeRequest(input: ChangeRequestInput): Promise<ChangeRequestRef>;
  getDiff(ref: ChangeRequestRef): Promise<StructuredDiff>;
  merge(ref: ChangeRequestRef, policy: MergePolicy): Promise<CommitRef>;
  archiveRepository(repo: RepositoryRef): Promise<void>;
}
```

GitHub MAY be the initial adapter but MUST NOT be hard-coded throughout the product model.

---

# 7. GitHub Managed Default

Where GitHub is used, SmartAIHub SHOULD use a GitHub App or equivalent installation-scoped mechanism to issue short-lived repository-limited credentials.

Runner SHALL NOT receive an organization-wide personal access token.

Credential scope SHOULD be limited to:

```text
repository = exact Product repo
branch = development branch where feasible
operations = required read/write only
TTL = short-lived
```

---

# 8. Runner Capability Discovery

SmartAIHub Runner SHALL publish a signed capability manifest such as:

```json
{
  "runner_id": "runner_...",
  "os": "windows",
  "arch": "x64",
  "tools": {
    "git": "2.x",
    "node": "24.x",
    "python": "3.x",
    "approved_container_runtime": "cloudflare-container",
    "playwright": "available"
  },
  "harnesses": [
    {"type":"codex", "status":"ready"},
    {"type":"claude-code", "status":"ready"},
    {"type":"hermes", "status":"ready"}
  ],
  "resources": {
    "gpu": "optional descriptor",
    "memory_mb": 65536
  }
}
```

Secrets, license tokens and filesystem paths not needed for scheduling MUST NOT be returned in the manifest.

---

# 9. Runner Connection Model

Runner MUST establish outbound authenticated connectivity to SmartAIHub.

Preferred model:

```text
Runner
→ authenticated outbound control channel
→ worker_jobs lease / event stream
→ SmartAIHub
```

SmartAIHub SHALL NOT require inbound public ports on the Tenant Admin's machine for normal operation.

The Runner MAY disconnect at any time. Production Products MUST continue to operate independently.

---

# 10. Scoped Local Workspace

Each development execution SHALL operate in a scoped workspace:

```text
<runner-root>/workspaces/{tenantId}/{productId}/{jobId-or-working-copy}
```

Coding harnesses MUST be launched with the intended workspace as their allowed project scope where tool capabilities permit.

Default policy SHALL deny access to arbitrary:

- home directories;
- Desktop/Documents;
- unrelated repositories;
- browser profiles;
- SSH keys;
- cloud credential folders;
- system secrets.

Additional filesystem access requires explicit user grant and audit.

---

# 11. Harness Adapter Contract

```ts
interface DevelopmentHarnessAdapter {
  descriptor(): HarnessDescriptor;
  probe(ctx: ProbeContext): Promise<HarnessHealth>;
  plan(task: DevelopmentTask, ctx: DevContext): Promise<HarnessPlan | null>;
  execute(task: DevelopmentTask, ctx: DevContext): AsyncIterable<HarnessEvent>;
  cancel(executionId: string): Promise<void>;
  collectResult(executionId: string): Promise<HarnessResult>;
}
```

Initial adapters MAY include:

- Claude Code;
- Codex CLI;
- Antigravity;
- Hermes;
- SmartAIHub-native developer agent.

No Product state SHALL persist provider-specific conversation IDs as its only development history.

---

# 12. Harness Resolver

Tenant Admin MAY choose:

```text
AUTO
CLAUDE_CODE
CODEX
ANTIGRAVITY
HERMES
PLATFORM_DEFAULT
```

`AUTO` SHALL resolve based on:

- tool availability;
- task capability;
- supported language/framework;
- user/tenant policy;
- cost/budget;
- required environment;
- context size;
- historical success rate;
- security constraints.

Resolver decisions MUST be logged.

---

# 13. Development Target Resolver

```text
Preferred target
  Tenant Runner

Fallback targets
  SmartAIHub Managed Sandbox
  approved enterprise build environment
```

The resolver SHALL consider:

- online/healthy Runner;
- required OS;
- required GPU;
- toolchain availability;
- user preference;
- data residency policy;
- source confidentiality policy;
- cost;
- queue pressure.

The system MUST NOT silently move confidential source to an unapproved cloud environment.

---

# 14. Natural-Language Development Request

Example:

> "เพิ่มหน้า 3D Room Designer ให้ผู้ใช้หมุนห้องได้ 360 องศา เปิดปิด layer เฟอร์นิเจอร์และผนังได้ และกด AI Redesign Room ได้"

SmartAIHub SHALL convert this into a `DevelopmentPlan` describing at least:

- requested outcome;
- affected Product/Mini App;
- likely files/components;
- new dependencies;
- SmartAIHub capabilities required;
- data collections/assets required;
- security permissions required;
- migration needs;
- testing strategy;
- estimated development cost/agent use;
- release risk.

High-impact changes require user approval before execution.

---

# 15. DevelopmentJob

```ts
interface DevelopmentJob {
  developmentJobId: string;
  tenantId: string;
  productId: string;
  repositoryRef: string;
  baseRevision: string;
  request: string;
  planRef: string;
  targetPolicy: DevelopmentTargetPolicy;
  harnessPolicy: HarnessPolicy;
  state: DevelopmentJobState;
  workerJobRef?: string;
  createdBy: string;
  createdAt: string;
}
```

Durable physical execution SHALL reuse canonical worker job infrastructure rather than invent another queue.

---

# 16. Development Job State Machine

```text
DRAFT
→ PLANNED
→ APPROVED
→ QUEUED
→ PREPARING_WORKSPACE
→ EXECUTING
→ BUILDING
→ TESTING
→ SCANNING
→ PREVIEW_READY
→ REVIEWING
→ APPROVED_FOR_MERGE
→ MERGED
→ RELEASE_CANDIDATE
→ HANDED_TO_SPEC_219
```

Terminal/exception states:

```text
FAILED
CANCELLED
REJECTED
NEEDS_USER_INPUT
BLOCKED_POLICY
STALE_BASE
```

---

# 17. Branch Strategy

Default AI-created changes SHALL use a dedicated branch such as:

```text
dev/job_<id>
```

Coding harnesses SHALL NOT push directly to protected `main`/production branches under default policy.

If base branch changes during a long job, SmartAIHub MUST detect stale-base/rebase conflicts before merge.

---

# 18. Change Set and Diff

SmartAIHub UI SHALL provide a non-developer review summary:

```text
Requested: Add 3D Room Designer

Changes
+ 3D viewport
+ layer control
+ scene state model
+ AI redesign action
+ asset loader

Files changed: 23
Tests: 118 pass
Security: pass
Preview: available
```

Advanced view MAY expose:

- file diff;
- dependency changes;
- package lock changes;
- generated migrations;
- test logs;
- agent transcript summary;
- build artifacts.

Raw chain-of-thought is not required or stored as a product artifact.

---

# 19. Dependency Governance

New dependencies SHALL be evaluated before release for:

- package identity;
- license policy;
- known vulnerabilities;
- install scripts;
- package age/reputation signals where available;
- binary/native behavior;
- unnecessary dependency expansion.

Tenant policy MAY define allow/deny lists.

---

# 20. Development Secrets

Coding harnesses SHALL use a Secret Broker for temporary development credentials.

Secrets MUST NOT be written to repository files or committed `.env` files by default.

Temporary tokens SHOULD be scoped by:

```text
tenantId
productId
environment=development
permissions
TTL
```

Secret access events MUST be audited without logging secret values.

---

# 21. SmartAIHub Development Capability Access

During development, harnesses MAY use a developer-scoped SmartAIHub API/MCP context to discover platform capabilities.

Examples:

```text
list_capabilities
inspect_capability_schema
run_dev_workflow
upload_dev_asset
query_dev_data_schema
create_dev_collection_request
```

Development access MUST use Spec 220 policy enforcement and MUST NOT grant production data access unless explicitly approved.

---

# 22. Generated Code Contract

Custom Product code SHOULD depend on a thin versioned SmartAIHub Product SDK rather than internal endpoints.

Illustrative APIs:

```ts
auth.currentUser()
data.collection("projects")
assets.upload(...)
knowledge.search(...)
workflow.run(...)
capabilities.invoke(...)
notifications.send(...)
```

The SDK MUST be a client for governed platform contracts, not a privileged plugin bridge.

---

# 23. Build

Build SHALL run in an isolated workspace/environment appropriate to the target.

Required outputs:

- build status;
- reproducible dependency lock reference;
- artifact manifest;
- source revision;
- build toolchain version;
- warnings;
- size/resource summary.

Build artifacts MUST be content-addressed or otherwise immutable once promoted as release candidates.

---

# 24. Test Layers

Development pipeline SHOULD support:

1. unit tests;
2. schema/contract tests;
3. component tests;
4. API integration tests against dev/staging capabilities;
5. end-to-end browser tests;
6. visual regression tests;
7. tenant-isolation tests;
8. permission denial tests;
9. accessibility checks;
10. performance/bundle checks.

Riskier Products MAY require additional product-specific suites.

---

# 25. Preview

Successful build SHOULD produce a preview environment through Spec 219.

Tenant Admin SHALL be able to open preview from SmartAIHub UI.

Preview SHOULD be protected from public indexing and may require authenticated access.

A preview MUST identify:

- source revision;
- DevelopmentJob;
- release candidate;
- environment;
- expiry/retention policy.

---

# 26. Screenshot / Multimodal Review

SmartAIHub MAY automatically render key routes at desktop/tablet/mobile sizes and run multimodal review for:

- visual breakage;
- overflow;
- missing states;
- inconsistent brand;
- inaccessible contrast;
- unexpectedly blank screens;
- responsive defects.

Generated critiques MAY trigger another AI patch iteration within configured limits.

---

# 27. AI Iteration Loop

Safe loop:

```text
Request
→ Plan
→ Edit
→ Build
→ Test
→ Render/Review
→ Critique
→ Patch
→ Build/Test again
→ stop at quality/iteration/budget limit
```

The system SHALL enforce:

- maximum iterations;
- token/cost budget;
- time budget;
- dependency-change limits;
- human approval for high-risk changes.

---

# 28. Change Review

User actions:

```text
Approve
Reject
Request changes
Open preview
View technical details
```

Approval SHALL reference an immutable source revision and test/scan evidence.

If source changes after approval, approval MUST be invalidated unless policy explicitly permits a verified no-op metadata change.

---

# 29. Merge and Release Candidate

After approval:

```text
Change branch
→ merge under policy
→ immutable commit
→ ReleaseCandidate
→ Spec 219
```

`ReleaseCandidate` SHALL include:

```text
productId
repositoryRef
commit SHA/revision
build artifact refs
test summary
security summary
required runtime bindings
required SmartAIHub capabilities
required data schema version
required SDK version
createdAt
```

---

# 30. No Direct Production Deployment from Runner

Hard invariant:

```text
Runner != Production Deployment Authority
```

Runner MUST NOT hold permanent:

- Cloudflare production API token;
- Core DB credential;
- R2 admin credential;
- platform provider master keys.

Production deployment is performed by Spec 219 Release Service using platform-controlled credentials and release policy.

---

# 31. Managed Cloud Development Fallback

A user without a suitable local Runner SHALL still be able to develop Products.

SmartAIHub SHALL support managed isolated development environments where policy and availability permit.

Cloud sandbox implementation is replaceable; Cloudflare Sandbox SDK is one candidate implementation.

The cloud sandbox MUST use the same DevelopmentJob/SourceControl/SecretBroker contracts as local Runner execution.

---

# 32. Local vs Cloud Development Consistency

A task should produce equivalent release evidence regardless of target:

```text
Local Runner
or
Managed Sandbox
        ↓
Source revision
Build manifest
Tests
Scans
Preview
ReleaseCandidate
```

Target-specific logs MAY differ, but release authority SHALL rely on normalized evidence.

---

# 33. Toolchain Profiles

Products SHOULD declare a versioned toolchain profile:

```text
node version
package manager
python version if needed
browser test runtime
build command
test command
lint command
framework profile
```

Harnesses MAY propose changes, but toolchain changes are explicit source/release changes.

---

# 34. Framework Policy

SmartAIHub SHOULD provide supported Product starter profiles rather than unrestricted framework entropy.

Examples:

```text
STANDARD_WEB
THREEJS_3D
BABYLON_3D
DATA_DASHBOARD
MEDIA_EDITOR
STATIC_MARKETING_SITE
```

Advanced users MAY choose custom stacks subject to deployment/runtime compatibility.

---

# 35. Repository Bootstrap

When a Product first requires custom code:

```text
ProductDefinition
→ select starter profile
→ create private repo
→ seed Product SDK + CI metadata + tests
→ create initial commit
→ connect repository to ProductSourceRepository
```

Bootstrap MUST be idempotent.

---

# 36. Source Provenance

Every AI-authored source change MUST retain metadata:

- DevelopmentJob ID;
- requesting user;
- harness type/version where known;
- base revision;
- final revision;
- timestamp;
- approvals;
- scan/test summary.

Do not store secrets or raw hidden reasoning as provenance.

---

# 37. Multi-Agent Development

Spec 218 MAY support multiple harnesses on one task, but SHALL normalize output through one controlled source branch/change set.

Examples:

```text
Claude implements
Codex reviews/tests
Hermes performs docs/refactor checks
```

Parallel agents MUST NOT race writes against the same working tree without a merge/coordinator strategy.

---

# 38. User Input During Development

When a harness requires clarification, DevelopmentJob MAY enter `NEEDS_USER_INPUT` and surface a question in SmartAIHub UI.

Answers SHALL be appended to the job context and execution resumed/restarted according to harness capability.

The user SHOULD NOT need to open the CLI session directly.

---

# 39. Cancellation

Cancellation SHALL:

- stop/interrupt the harness where supported;
- stop accepting new source writes;
- preserve logs/evidence already generated;
- revoke temporary credentials;
- mark partial branch/workspace for retention/cleanup policy;
- avoid merging partial work.

---

# 40. Workspace Cleanup

Local/cloud workspaces MUST have retention rules.

Cleanup MUST NOT delete:

- committed source history;
- approved release evidence;
- required audit records.

Uncommitted temporary files may be purged after job finality/retention period.

---

# 41. Concurrency

The control plane SHALL prevent unsafe concurrent modifications to the same Product branch/release line.

Strategies MAY include:

- optimistic base-revision checks;
- per-product change locks for high-risk migrations;
- isolated branches;
- ordered merge queue.

---

# 42. Data Migration Changes

If product code requires data schema changes, the harness SHALL produce a declarative migration request for Spec 220.

Custom product source MUST NOT run arbitrary direct SQL migrations against Core SQL.

Migration flow:

```text
source change
→ DataSchemaChangeRequest
→ validation
→ staging apply
→ tests
→ release orchestration
```

---

# 43. Capability Permission Changes

If new code needs a new SmartAIHub capability, DevelopmentJob SHALL produce a permission delta:

```text
+ assets.write
+ workflow:room-redesign.run
+ data:room_projects.write
```

Production release MUST NOT receive the new grant until approved under Spec 220 policy.

---

# 44. Network/Egress Changes

If source introduces direct external fetch destinations, scan/review MUST identify them.

Default product architecture SHOULD prefer SmartAIHub capabilities over arbitrary third-party direct calls.

External egress policy enforcement is implemented by Spec 219/220.

---

# 45. Cost Controls

Development budgets MAY include:

- harness/model tokens;
- local/cloud compute;
- build minutes;
- preview runtime;
- test media generation;
- external service calls.

SmartAIHub SHOULD quote or cap expensive jobs before execution.

Authoritative economic accounting belongs to Spec 207.

---

# 46. Developer Mode

Advanced users MAY enable Developer Mode to access:

- repository link;
- branch/commit details;
- raw build/test logs;
- local clone instructions;
- manual change request creation;
- SDK docs.

Developer Mode MUST NOT weaken tenant/security boundaries.

---

# 47. Audit Events

Minimum events:

```text
development.requested
development.plan_created
development.approved
development.runner_selected
development.harness_selected
development.started
development.secret_issued
development.commit_created
development.preview_ready
development.scan_failed
development.review_approved
development.merged
development.release_candidate_created
development.cancelled
```

---

# 48. Observability

Admin/operator view SHOULD include:

- queue time;
- execution time;
- Runner/harness selection;
- build/test duration;
- failure category;
- retry count;
- token/compute cost references;
- preview status;
- source revision;
- final release linkage.

---

# 49. Security Threats

Required threat cases include:

- prompt injection from repository content;
- malicious dependency install scripts;
- coding agent attempting filesystem escape;
- source exfiltration;
- secret exfiltration;
- cross-tenant repository token misuse;
- branch protection bypass;
- agent pushes unreviewed production code;
- generated code calls unauthorized egress;
- generated code attempts direct DB access;
- stale-base change overwrites newer work.

---

# 50. Acceptance Criteria — Runner/Harness

- [ ] Runner discovers installed harnesses/tools without leaking secrets.
- [ ] Runner connects outbound; no inbound public port required.
- [ ] Harnesses execute inside scoped product workspaces.
- [ ] Harness selection is adapter/resolver-based.
- [ ] Local Runner loss does not impact production runtime.
- [ ] Cloud development fallback exists where policy permits.

---

# 51. Acceptance Criteria — Source Control

- [ ] Default Product can receive a private managed repository.
- [ ] Repository granularity is Product/deployable-unit based.
- [ ] Runner uses short-lived scoped repository credentials.
- [ ] AI changes occur on isolated branches/change requests by default.
- [ ] Protected production branch cannot be pushed directly by ordinary development jobs.
- [ ] Approval pins immutable revision.

---

# 52. Acceptance Criteria — Release Handoff

- [ ] Build/test/security evidence is normalized.
- [ ] Preview is linked to source revision.
- [ ] Data/capability permission deltas are explicit.
- [ ] Approved merge creates ReleaseCandidate.
- [ ] Runner cannot deploy production directly.
- [ ] ReleaseCandidate is handed to Spec 219.

---

# 53. Definition of Done

Spec 218 is complete when a Tenant Admin can request a Product change from SmartAIHub UI, SmartAIHub can route the work to an eligible local Runner or managed sandbox, use an available coding harness to modify a scoped Product repository, build/test/scan/preview the result, present a human-readable review, commit/merge approved source, and produce an immutable ReleaseCandidate without granting the development machine direct production infrastructure authority.

---

# 54. External Implementation Notes (Non-Normative)

As of 2026-09-20:

- Cloudflare Sandbox SDK supports isolated command/file/process execution for coding-agent use cases and provides a Claude Code tutorial.
- Cloudflare Workers supports GitHub/GitLab build integration, but SmartAIHub SHOULD still place its own Release Service/policy gate between source approval and production deployment.
- GitHub Apps can be used to issue repository-scoped installation access tokens; exact implementation must follow current GitHub security guidance.

References:
- https://developers.cloudflare.com/sandbox/
- https://developers.cloudflare.com/sandbox/tutorials/claude-code/
- https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/
- https://docs.github.com/en/apps

---

# 55. Supply-Chain Provenance, SBOM and Artifact Signing

ReleaseCandidate SHOULD include software supply-chain evidence appropriate to risk level:

- dependency lockfile hash;
- SBOM where tooling supports it;
- build provenance;
- source revision;
- build environment/toolchain profile;
- artifact digest;
- signature/attestation produced by trusted release infrastructure.

Spec 219 SHALL verify artifact identity before production promotion where signing is enabled.

---

# 56. External Repository Changes

A Tenant developer MAY edit the connected repository outside SmartAIHub.

External commits MUST NOT bypass the release process.

```text
external commit / pull request
→ SourceControlAdapter detects change
→ SmartAIHub imports revision metadata
→ build/test/security gates
→ preview/review according to policy
→ ReleaseCandidate
→ Spec 219
```

Direct Git-provider auto-deploy to production SHOULD be disabled for SmartAIHub-managed Products unless an explicit enterprise policy replaces the SmartAIHub release gate with an equivalent controlled pipeline.

---

# 57. Repository Backup, Export and Transfer

SmartAIHub-managed source repositories SHALL have a recovery/export policy.

Tenant owner MAY request source export according to plan/contract and ownership policy.

Repository transfer/offboarding MUST revoke SmartAIHub installation credentials and preserve required audit linkage.

Deleting a Product UI record MUST NOT silently delete the only copy of source code.

---

# 58. Generated Code Licensing and Provenance Review

Development pipeline SHOULD identify:

- copied/vendor source introduced by agents;
- generated files with known upstream templates;
- dependency license changes;
- repository files carrying restrictive headers/licenses.

AI-generated code SHALL not be labeled legally cleared merely because tests/security scans pass.

---

# 59. Continuous Dependency and Vulnerability Monitoring

Production source SHOULD continue to be monitored after release for newly disclosed dependency vulnerabilities.

```text
security advisory
→ DevelopmentJob / automated patch proposal
→ tests
→ review
→ normal release path
```

Automatic production mutation without release evidence is forbidden by default.

---

# 60. Prompt-Injection Defense for Coding Agents

Repository files, issue text, web content and dependency documentation SHALL be treated as untrusted inputs to coding harnesses.

Controls SHOULD include:

- tool permission boundaries independent of model instructions;
- Secret Broker restrictions;
- workspace scoping;
- egress restrictions where possible;
- explicit approval for high-impact tool actions;
- detection/flagging of suspicious instructions in repository content where feasible.

No prompt can grant a coding harness permissions that the DevelopmentJob context does not already possess.

---

# 61. Additional Acceptance Criteria — Development Supply Chain

- [ ] Release artifact can be tied to exact source revision and build evidence.
- [ ] External Git commits cannot bypass build/test/release governance.
- [ ] Source export/backup/offboarding behavior is defined.
- [ ] Dependency/license changes are visible in review.
- [ ] Newly discovered vulnerabilities can trigger governed remediation.
- [ ] Repository prompt injection cannot expand harness permissions.

---

# 62. Local Execution Isolation Levels

A scoped filesystem path alone is not sufficient isolation for arbitrary generated build/test code.

Runner SHALL classify development execution by risk and available isolation:

```text
LEVEL_1_TRUSTED_WORKSPACE
  normal source editing with bounded harness permissions

LEVEL_2_PROCESS_SANDBOX
  restricted process/user permissions + network/filesystem policy

LEVEL_3_CONTAINER_OR_VM
  isolated build/test for untrusted/generated code where supported

LEVEL_4_MANAGED_CLOUD_SANDBOX
  remote isolated environment when local machine cannot provide required safety
```

High-risk generated code, dependency install scripts and unknown binaries SHOULD NOT execute with unrestricted host-user privileges.

Runner capability manifest SHALL report supported isolation levels so Development Target Resolver can choose safely.

---

# 63. Additional Acceptance Criteria — Local Host Safety

- [ ] Runner reports supported execution-isolation level.
- [ ] High-risk jobs can require container/VM/cloud sandbox instead of unrestricted host execution.
- [ ] Workspace scoping is not treated as a substitute for OS/process isolation.

---

# 64. Final Definition of Done

Spec 218 is production-ready only when the full development supply chain passes: natural-language request → governed plan → isolated local/cloud execution → source change → build/test/security/provenance → preview → immutable approval → merge → ReleaseCandidate, with no direct Runner-to-production authority and no expansion of harness permissions through prompts or repository content.


# Revision 2 Addendum — Agentic Development Fabric Boundary

**Normative precedence:** Spec 222 owns cross-harness cognitive/context/bootstrap semantics; this Revision 2 addendum overrides earlier Spec 218 text if ownership wording conflicts.

## 49. Spec 222 Is the Cognitive/Context Owner

Spec 218 owns **execution mechanics** for development: DevelopmentJob, target resolution, Runner/cloud workspace, Git changes, build, tests, preview artifacts and ReleaseCandidate creation.

Spec 222 owns **how a development harness is prepared and instructed**: harness bootstrap, project context packs, `AGENTS.md`/`CLAUDE.md` adapters, SmartAIHub orchestrator skills, Superpowers methodology bridge, context/resource discovery and artifact-type routing.

Canonical handoff:

```text
Spec 217/221 requirement
→ Spec 222 DevelopmentWorkPackage + ContextPack + MethodologyProfile
→ Spec 218 DevelopmentJob
→ Runner / Managed Sandbox / Harness Adapter
→ evidence + source changes
→ Spec 222 domain-specific verification interpretation
→ Spec 218 ReleaseCandidate
```

## 50. Harness Bootstrap Is Declarative

A DevelopmentJob SHALL reference a versioned `HarnessBootstrapProfile` rather than shell-installing arbitrary tools ad hoc.

The profile MAY declare:

```text
harness family/version
required SmartAIHub skill pack
optional Superpowers adapter/version
project instruction adapter
MCP endpoints/resources
allowed toolchains
required local binaries
minimum Runner version
```

Runner performs compatibility checks and returns explicit `READY`, `MISSING_OPTIONAL`, `MISSING_REQUIRED`, `UPDATE_REQUIRED`, or `POLICY_BLOCKED` states.

## 51. Do Not Treat CLAUDE.md / AGENTS.md as Source of Truth

Repo instruction files are harness adapters generated from the canonical Spec 222 Project Context Pack. They MAY contain project-specific human-maintained content, but platform/security authority remains server-side and in signed machine-readable contracts.

Changing an instruction file MUST NOT widen API/MCP/Data/Skill permissions.

## 52. SmartAIHub-Orchestrated Local Development

The normal UX remains SmartAIHub Web. Tenant Admins SHOULD be able to request:

```text
"ทำหน้า Room Designer ใหม่ให้หรูขึ้น"
"เพิ่ม 3D viewport"
"สร้าง Skill คำนวณ BOQ แล้วนำมาใช้ใน Mini App"
```

without manually launching the harness. Spec 222 resolves artifact/methodology; Spec 218 dispatches the resulting work to the selected Runner/harness.

## 53. Product/Skill Workspaces

Workspace type MUST be explicit:

```text
PRODUCT_SOURCE
CUSTOM_MINI_APP
SKILL_SOURCE
PLATFORM_CORE   # restricted/admin engineering only
```

Workspace type affects context, allowed SmartAIHub capabilities, release authority and review gates.

## 54. Revision 2 Acceptance Criteria

- [ ] Spec 218 does not duplicate Spec 222 project-context/methodology semantics.
- [ ] Runner can report harness + SmartAIHub skill-pack + Superpowers compatibility state.
- [ ] Project instruction files cannot grant platform permissions.
- [ ] Skill and Product jobs can share execution mechanics while retaining different domain release gates.


## 55. Local Harness Credential Handling

Runner SHALL NOT treat local Claude/Codex/Antigravity/Hermes authentication material as a SmartAIHub secret to collect. Where local CLI invocation uses the user's own authenticated harness state, SmartAIHub only launches the approved executable under the allowed workspace and collects bounded outputs/evidence.

If a harness requires a different integration credential/API for automation, that path MUST be explicitly configured through Secret Broker/connection policy rather than scraping CLI session files.

# Revision 3 — Final Integrated Architecture Stress-Audit Addendum

**Normative precedence:** Revision 3 supersedes conflicting earlier development/harness mechanics. Spec 222 remains the owner of cognitive/context/methodology bootstrap; Spec 218 owns durable development work and source-change mechanics.


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

## R3.2 Development Execution Target Taxonomy

`DevelopmentTargetResolver` MUST support more than local CLI vs one cloud sandbox.

Canonical target classes:

```text
LOCAL_RUNNER_HARNESS
SMARTAIHUB_MANAGED_SANDBOX
MANAGED_CLOUD_HARNESS
ENTERPRISE_SELF_HOSTED_HARNESS
HUMAN_DEVELOPER_WORKSPACE
```

Examples of `MANAGED_CLOUD_HARNESS` may include provider-managed coding/agent APIs such as OpenAI Agents API or future managed Claude/Codex/other services. Provider names are adapters, not persisted architecture semantics.

Target selection MUST consider:

```text
required filesystem/build tools
network/data locality
source sensitivity
tenant policy
available authentication
cost/budget
task duration
browser/GPU needs
isolation strength
harness certification/version
```

## R3.3 Managed Harness Contract

A managed cloud harness receives only a scoped `DevelopmentWorkPackage`.

It MUST NOT receive:

- SmartAIHub Core DB credentials;
- unrestricted R2 credentials;
- Cloudflare account-wide deployment credentials;
- another Tenant's repository/data;
- production secrets not explicitly required by the job.

Returned changes MUST normalize into the same:

```text
ChangeSet
EngineeringEvidence
Build/Test results
ReleaseCandidate inputs
```

as local Runner work.

Provider-managed agent completion MUST NOT directly merge or deploy production.

## R3.4 Worktree / Concurrent Agent Isolation

Parallel development jobs on the same Product MUST use isolated working state, for example Git worktrees/branches or equivalent sandbox snapshots.

Required identity:

```text
development_job_id
repository_id
base_revision
branch/ref
workspace_instance_id
harness_session_id
```

Rules:

- two agents MUST NOT edit one mutable checkout concurrently without an explicit collaborative mechanism;
- merge/rebase conflicts are first-class states, not automatically overwritten by a later agent;
- stale-base changes require revalidation against the current protected branch;
- multi-agent reviewer roles SHOULD inspect immutable candidate revisions, not a workspace changing underneath them.

## R3.5 Toolchain and Methodology Lock

Reproducible engineering evidence SHOULD record:

```text
OS/runtime image or Runner environment identity
Node/Python/etc. major versions where relevant
package manager and lockfile hash
build tool versions
HarnessAdapter version
actual harness version/model where observable
Superpowers/methodology profile version
SmartAIHub engineering skill-pack version
ProjectContextPack hash/version
Product SDK version
```

A methodology/harness upgrade that changes generated behavior materially MUST pass regression/canary before becoming platform default.

## R3.6 Cloud Sandbox Dependency Policy

Cloud development environments are replaceable implementation targets.

If a sandbox SDK/runtime is preview/beta:

- pin package/API version;
- record runtime image/build identity;
- maintain compatibility tests;
- provide at least one alternate eligible development target for critical tenants or an explicit "development temporarily unavailable" mode;
- never require production Product execution to depend on the development sandbox remaining alive.

## R3.7 External Repository Change Reconciliation

When authorized humans or external tools modify a managed repository outside SmartAIHub:

```text
Git change detected
→ provenance classified
→ current context/docs regenerated or invalidated
→ required tests/security checks
→ release governance
```

An external commit cannot inherit old `EngineeringEvidence` merely because it is on the same branch.

## R3.8 Development Approval Escalation Matrix

The development UI MUST highlight changes that require stronger approval:

```text
permission/capability expansion
new outbound network destination
new dependency/native binary
schema/data migration
new secret requirement
billing/economic behavior
runtime resource increase
custom domain/auth behavior
tenant membership/RBAC behavior
```

Cosmetic UI changes MAY use a lighter gate according to policy.

## R3.9 ReleaseCandidate Evidence Contract

`ReleaseCandidate` MUST include or reference:

```text
source revision + tree hash
base revision
approved ChangeSet
build artifact digest
test/eval results
SBOM/provenance/scan references
ProductContext/ProjectContext hash
harness/methodology evidence
Skill/Workflow dependency lock
Product SDK contract version
schema migration plan if any
permission/egress delta
economic delta
approver identity/evidence
```

Spec 219 MUST reject a candidate that is missing evidence required by the Product risk class.

## R3.10 Local Harness Credential Boundary

For local harnesses authenticated by the user, Runner SHALL launch the harness without exporting the user's session secret to SmartAIHub.

SmartAIHub-issued developer grants remain separate from vendor-harness authentication and are independently revocable/expiring.

## R3.11 Revision 3 Acceptance Criteria

- [ ] Managed cloud agent/harness APIs can participate through adapters without becoming source of truth.
- [ ] Parallel coding agents use isolated workspaces/worktrees and deterministic merge conflict handling.
- [ ] Toolchain, context, methodology and harness versions are captured as evidence.
- [ ] Preview/beta sandbox dependencies are pinned and replaceable.
- [ ] External Git changes invalidate stale evidence/context appropriately.
- [ ] High-impact permission/schema/network/economic changes trigger stronger review.
- [ ] ReleaseCandidate contains enough immutable evidence for Spec 219 admission.

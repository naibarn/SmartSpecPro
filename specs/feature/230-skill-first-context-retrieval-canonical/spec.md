# Spec 230 — SmartAIHub Agentic Development Fabric
## Harness Bootstrap, Project Context Protocol, SmartAIHub Orchestrator Skills, Superpowers Bridge & Cross-Artifact Engineering

**Status:** Bootstrap contract implemented; intent router, cross-harness runtime and web control surface remain pending
**Spec ID:** 230  
**Revision:** 3 — Code-aligned repository bootstrap and selective trusted Skill loading
**Date:** 2026-09-22  
**Target repository path:** `specs/feature/230-skill-first-context-retrieval-canonical/spec.md`  
**Primary owner:** SmartAIHub Agentic Engineering Experience / Development Context Control Plane  
**Depends on:** Specs 199, 200, 206, 207, 217, 218, 219, 220, 221 Revision 6+, 222 Revision 17+ as advisory learning input, 224 Revision 20+, 229 Revision 3+ Retrieval Broker, Feature 195, SmartAIHub Runner, Capability Registry  
**External methodology integration:** `obra/superpowers` via versioned adapters; never a platform source of truth  

---

## 0.1 Codebase alignment snapshot — 2026-09-22

The repository already has `contextRetrievalService.ts`, `contextPackBuilder.ts`, `libraryContextPackService.ts`, `skillCatalog.ts`, `skillIntentClassifier.ts` and governed MCP context-pack/RAG tools. Spec 230 now also has `apps/web/server/services/spec230BootstrapContracts.ts`: it pins a `git:` source revision, discovers only repository-owned `skills/<id>/SKILL.md`, rejects symlink/path escape, loads only explicitly requested Skills, builds the existing Spec 222 ProjectContextPack and exposes only the Codex/Claude harness profiles represented by current agent contracts.

No complete Spec 230 Development Intent Router, cross-artifact `DevelopmentWorkPackage`, provider runtime or Web control surface was found. The bootstrap contract is therefore not a claim of cross-harness production readiness.

Spec 230 must compose the existing context/Skill services and Spec 229 retrieval boundary without creating another skill registry, context-pack format, authorization system or durable development lifecycle.

# 0. Executive Decision

SmartAIHub SHALL provide one shared **Agentic Development Fabric** that prepares Claude Code, Codex, Antigravity, Hermes and future coding/agent harnesses to develop SmartAIHub Skills, Mini Apps and Tenant Products correctly from the normal SmartAIHub Web UI.

The Fabric SHALL solve a key problem: SmartAIHub development is not ordinary standalone software development. Generated/custom code MUST understand that identity, data, assets, Skills, Workflows, models, billing and privileged operations are platform services reached through governed SmartAIHub contracts rather than direct database/provider access.

The user SHOULD be able to request:

```text
"สร้าง Skill คำนวณ BOQ ให้ฉัน"
"ทำ UI Mini App นี้ให้ดู premium กว่านี้"
"เพิ่ม 3D Room Designer ให้ interiorpro"
"สร้าง Product สำหรับเอเจนซี่อสังหาฯ พร้อมแบรนด์และ domain"
```

from `smartaihub.app`. The platform determines whether the work is Skill Engineering, native Mini App design, custom Mini App development, or full Product development, then routes it to the appropriate methodology and execution target.

Canonical architecture:

```text
SmartAIHub Web
      ↓
Development Intent Router
      ↓
Artifact Classifier
  ├─ SKILL                  → Spec 221
  ├─ NATIVE_MINI_APP        → Spec 217/216
  ├─ CUSTOM_MINI_APP        → Spec 217 + 218
  ├─ TENANT_PRODUCT         → Spec 217 + 218
  └─ PLATFORM_CORE          → restricted/admin engineering
      ↓
DevelopmentWorkPackage
      ↓
Methodology Resolver
  ├─ Quick
  ├─ Standard
  ├─ Thorough
  ├─ Superpowers-Compatible
  ├─ UI/UX Design Engineering
  └─ Regulated/Enterprise
      ↓
Project Context Pack
+ SmartAIHub Orchestrator Skill Pack
+ Harness Adapter
      ↓
Spec 218 DevelopmentJob
      ↓
Runner / Managed Sandbox
      ↓
Claude / Codex / Antigravity / Hermes / future harness
      ↓
SmartAIHub Developer MCP/API via Spec 220
      ↓
Build / Test / Eval / Visual QA / Review
      ↓
Skill Release (Spec 221) OR Product ReleaseCandidate (Spec 218→219)
```

---

# 1. Why This Must Be a Separate Spec

Spec 221 is domain-specific to Skill quality, evals, trust and publication. Spec 218 is domain-specific to development execution mechanics and Git/build evidence. Neither should own cross-harness project context or artifact routing for the entire platform.

Without Spec 230, each subsystem would independently invent:

- Claude/Codex/Hermes installation rules;
- `AGENTS.md` / `CLAUDE.md` content;
- SmartAIHub API/MCP instructions;
- Superpowers configuration;
- context/version pinning;
- capability discovery prompts;
- UI engineering methods;
- permission-request semantics.

That duplication SHALL be prohibited.

---

# 2. Architectural Principles

1. **SmartAIHub Web is the normal control surface.** CLI use is optional/advanced.
2. **Harnesses are replaceable workers, not authorities.**
3. **Superpowers is a methodology dependency, not SmartAIHub runtime architecture.**
4. **Project instructions are adapters, not authorization.**
5. **Use retrieval, not giant prompt manuals.**
6. **Use platform APIs/MCP, never direct Core SQL/R2/Vector/provider credentials.**
7. **Prefer reuse before generation.** Search Skills/Workflows/capabilities before implementing duplicates.
8. **Escalate implementation complexity only when required.**
9. **Evidence before completion.** Build/test/eval/visual/security evidence is required according to risk.
10. **Production is independent of development harness.**

---

# 3. Cross-Spec Ownership Matrix

| Concern | Canonical owner |
|---|---|
| Product/Tenant/Brand/Product Shell/Mini App composition | Spec 217 |
| Local/cloud development job, workspace, Git, build/test mechanics | Spec 218 |
| Production deployment, Workers/Containers/domain runtime | Spec 219 |
| Data/Asset/Capability/API/MCP authorization | Spec 220 |
| Skill Contract, eval, review, Skill publication | Spec 221 |
| Harness bootstrap/context/methodology/meta-skills/artifact routing | **Spec 230** |
| MCP transport/upstream gateway | Spec 199 |
| External harness execution semantics | Spec 200 / relevant adapters |
| A2A | Spec 206 |
| Economic ledger/settlement | Spec 207 |
| Durable job execution | Feature 195 / canonical worker_jobs |

---

# 4. Artifact Classes

```ts
export type EngineeringArtifactClass =
  | "SKILL"
  | "NATIVE_MINI_APP"
  | "CUSTOM_MINI_APP"
  | "TENANT_PRODUCT"
  | "PLATFORM_CORE";
```

Classification affects permissions, methodology, workspace shape, release authority and required evidence.

`PLATFORM_CORE` is not available to ordinary Tenant creators and requires platform engineering authorization.

---

# 5. Skill vs Mini App vs Product

```text
Skill
  reusable capability
  no mandatory UI
  can be invoked by Mini Apps/Workflows/Agents

Mini App
  user-facing module
  can have many pages/routes/workflows
  may call many Skills

Product
  branded shell/business/organization surface
  can compose multiple Mini Apps
  tenant membership/entitlement/domain/brand
```

A request that sounds like a UI feature MUST NOT be automatically implemented as a Skill. A request that is reusable behavior SHOULD be considered for Skill creation even if first discovered while building a Product.

---

# 6. Development Intent Router

The Router converts natural-language requests into a structured `DevelopmentIntent`.

```ts
interface DevelopmentIntent {
  requestId: string;
  tenantId: string;
  principalId: string;
  targetProductId?: string;
  targetMiniAppId?: string;
  targetSkillId?: string;
  requestedOutcome: string;
  artifactCandidates: EngineeringArtifactClass[];
  constraints: string[];
  references: string[];
}
```

The Router SHOULD explain material classification decisions to the user.

---

# 7. Reuse-First Capability Resolution

Before creating custom code or a new Skill, the system SHALL search:

```text
existing Skills
Workflows/subflows
Agents
MCP tools
A2A capabilities
SmartAIHub internal services
Product SDK capabilities
registered UI components/extensions
```

Result classes:

```text
EXACT_REUSE
COMPOSABLE_REUSE
NEEDS_CONFIGURATION
CAPABILITY_GAP
CUSTOM_UI_GAP
```

`CAPABILITY_GAP` MAY trigger Spec 221. `CUSTOM_UI_GAP` MAY trigger custom Mini App development.

---

# 8. DevelopmentWorkPackage

Every harness job receives a bounded, versioned work package.

```ts
interface DevelopmentWorkPackage {
  id: string;
  artifactClass: EngineeringArtifactClass;
  requirementRef: string;
  tenantId: string;
  productId?: string;
  skillId?: string;
  sourceRevision?: string;
  contextPackRef: string;
  methodologyProfileRef: string;
  capabilityGrantRef: string;
  targetEnvironment: "dev" | "staging";
  evidenceRequirements: string[];
  budgetRef?: string;
  expiresAt: string;
}
```

The package MUST NOT contain raw production secrets.

---

# 9. Methodology Profiles

Spec 230 coordinates methodology across artifact types.

Profiles:

```text
QUICK
STANDARD
THOROUGH
SUPERPOWERS_COMPATIBLE
UI_UX_DESIGN_ENGINEERING
REGULATED
CUSTOM
```

Spec 221 may add Skill-specific stages to a selected profile. Spec 217 may add Product/Brand design stages.

---

# 10. Superpowers Bridge

SmartAIHub SHOULD support upstream Superpowers where an installed harness supports it.

Integration rules:

- detect installation/version per harness;
- pin accepted release/commit for reproducible governed builds where required;
- record the version in engineering provenance;
- evaluate an update before changing default methodology;
- never allow upstream hooks/skills to bypass SmartAIHub authorization/release gates;
- support a native SmartAIHub equivalent when Superpowers is unavailable;
- do not fork/copy upstream prompts into a permanent unversioned platform dependency.

Superpowers is particularly useful for brainstorming/design, worktree isolation, implementation planning, TDD, systematic debugging, subagent/review workflows and verification-before-completion.

---

# 11. Superpowers Does Not Replace SmartAIHub Domain Skills

Superpowers knows how to engineer software/skills systematically. It does not intrinsically know SmartAIHub's Tenant/Data/Skill/Billing/Capability contracts.

Therefore each engineering session composes:

```text
General engineering methodology (Superpowers or native equivalent)
+
SmartAIHub Orchestrator Skill
+
Artifact-specific SmartAIHub skill(s)
+
Versioned Project Context Pack
```

---

# 12. SmartAIHub Engineering Skill Pack

Recommended first-party engineering skills:

```text
smartaihub-orchestrator
smartaihub-platform-context
smartaihub-skill-engineering
smartaihub-miniapp-engineering
smartaihub-ui-ux-engineering
smartaihub-tenant-product-engineering
smartaihub-data-contracts
smartaihub-capability-integration
smartaihub-release-verification
```

The pack SHALL be versioned independently from Tenant-generated runtime Skills.

---

# 13. SmartAIHub Orchestrator Skill

The orchestrator is the entry/meta-skill for development harnesses.

It MUST teach the harness to:

1. identify artifact class;
2. load only relevant context;
3. search existing SmartAIHub capabilities before duplicating logic;
4. use Spec 220 APIs/MCP for data/assets/Skills/Workflows;
5. never connect directly to Core SQL/R2/Vector/provider master credentials;
6. request new logical data schemas through governed schema-change operations;
7. request capability/permission deltas explicitly;
8. follow artifact-specific build/test/eval/release gates;
9. avoid production deployment directly from local Runner;
10. return structured evidence/results to SmartAIHub.

---

# 14. Project Context Pack

Instruction files MUST be generated from one canonical, machine-readable context package.

```ts
interface ProjectContextPack {
  contextPackId: string;
  version: string;
  tenantId: string;
  productId?: string;
  skillId?: string;
  artifactClass: EngineeringArtifactClass;
  architectureRefs: string[];
  productContractRef?: string;
  brandContractRef?: string;
  dataSchemaRefs: string[];
  capabilityCatalogRef: string;
  permissionGrantRef: string;
  developmentPolicyRef: string;
  testCommands: string[];
  buildCommands: string[];
  releasePolicyRef: string;
  generatedAt: string;
}
```

Large content belongs in retrievable docs/MCP resources, not embedded in this object.

---

# 15. Short Map, Deep Sources of Truth

Root project instructions SHOULD be concise and act as a map:

```text
What this Product/Skill is
Critical invariants
How to build/test
How SmartAIHub data/capabilities are accessed
Where canonical contracts live
What must never be done
How to request permissions/schema changes
```

Detailed platform docs SHALL live under structured documentation or retrievable MCP resources.

This reduces context waste and stale duplicated manuals.

---

# 16. AGENTS.md Adapter

For harnesses that consume `AGENTS.md`, Spec 230 SHOULD generate/manage a root file containing:

```text
Project identity/purpose
SmartAIHub architectural invariants
commands
source map
links/refs to canonical docs
MCP/API bootstrap
permission rules
release rules
```

Nested `AGENTS.md` files MAY express package-specific conventions where supported.

The generated section SHOULD be identifiable with managed markers so SmartAIHub can update its portion without destroying authorized human additions.

---

# 17. CLAUDE.md Adapter

Claude-specific project instructions MAY be generated as a thin compatibility layer where useful. They MUST NOT become a second divergent architecture manual.

Preferred behavior:

```text
CLAUDE.md
→ concise Claude-specific bootstrap
→ points to canonical SmartAIHub project context/docs
→ invokes/uses SmartAIHub engineering skills/MCP
```

If project-local instruction import/link semantics are supported by the harness version, the adapter MAY reference shared content instead of duplicating it.

---

# 18. Hermes Context Adapter

Hermes can consume project context files including `AGENTS.md`/Hermes-specific files. Spec 230 SHOULD prefer portable project context where possible and use Hermes-specific context only for genuine harness differences.

Global Hermes identity/personality files MUST NOT be repurposed as Product architecture storage.

---

# 19. Antigravity and Future Harness Adapters

Harness behavior MUST be encapsulated in `HarnessAdapter` implementations rather than assumed globally.

```ts
interface HarnessAdapter {
  detect(): Promise<HarnessStatus>;
  installOrGuide(profile: HarnessBootstrapProfile): Promise<BootstrapResult>;
  buildContextAdapters(pack: ProjectContextPack): Promise<GeneratedContextFiles>;
  registerSkillPack(ref: string): Promise<void>;
  registerMcp(ref: string): Promise<void>;
  execute(workPackage: DevelopmentWorkPackage): Promise<ExecutionHandle>;
  collectEvidence(handle: ExecutionHandle): Promise<EngineeringEvidence>;
}
```

---

# 20. Runner Toolchain Discovery

SmartAIHub Runner SHALL report installed/available engineering capabilities such as:

```text
Git
Node.js
Python
Docker/Podman if approved
browser/e2e tooling
Claude Code
Codex CLI
Antigravity
Hermes
Superpowers status per harness
SmartAIHub engineering skill-pack version
```

Discovery is evidence, not authorization.

---

# 21. Installation / Bootstrap UX

Tenant Admin SHOULD be able to open:

```text
Product → Development → Development Environment
```

and see:

```text
Runner                     Connected
Git                        Ready
Codex                      Ready
Claude Code                Not installed
Antigravity                Ready
Hermes                     Ready
SmartAIHub Dev Pack        Update available
Superpowers / Codex        Ready
Superpowers / Antigravity  Ready
```

Actions such as installing/updating third-party tools on the user's machine require explicit user authorization and MUST use verified sources/checksums/signatures where available.

---

# 22. Superpowers Installation Policy

Superpowers installation is harness-specific and optional.

Spec 230 SHALL:

- detect whether the chosen harness has Superpowers installed/enabled;
- offer managed guidance or installation action when supported and authorized;
- record exact version/commit/plugin identity;
- support disabling/removing SmartAIHub-managed integration without removing unrelated user configuration;
- never overwrite unrelated global harness configuration silently.

---

# 23. Context File Ownership and Merge Safety

SmartAIHub MUST NOT blindly overwrite pre-existing user-authored `AGENTS.md`, `CLAUDE.md` or equivalent files.

Supported strategies:

```text
CREATE when absent
MANAGED_BLOCK when safe
SIDE_CAR + reference when supported
ASK_FOR_CONFLICT_RESOLUTION when ambiguous
```

Every managed change SHOULD be diffable/reversible.

---

# 24. Context Trust Hierarchy

Conceptual trust order:

```text
Platform system/security policy
> signed SmartAIHub development contract/grants
> approved Product/Skill contracts
> managed project instruction adapters
> tenant-authored project docs
> source comments/content
> retrieved external/tool content
```

No lower layer can grant privileges denied by a higher layer.

---

# 25. Developer MCP/API Context

Spec 230 SHALL use Spec 220 for governed development access.

Suggested resources:

```text
smartaihub://project/context
smartaihub://product/contract
smartaihub://brand/contract
smartaihub://skills/catalog
smartaihub://capabilities/catalog
smartaihub://data/schemas
smartaihub://permissions/current
smartaihub://development/policy
```

Suggested operations:

```text
search_capabilities
inspect_capability
search_skills
inspect_skill
invoke_skill_dev
inspect_data_schema
propose_schema_change
upload_dev_asset
run_dev_workflow
request_permission_delta
submit_engineering_evidence
```

---

# 26. Retrieval over Catalog Injection

SmartAIHub may contain thousands of Skills and capabilities. The harness MUST NOT receive the entire catalog in every prompt.

Use:

```text
search → shortlist → inspect exact contracts → invoke
```

This mirrors the platform's broader capability-resolution architecture and protects context budget.

---

# 27. Developer Tokens

Development credentials SHALL be short-lived and bound to:

```text
principal
Runner/session
Tenant
Product/Skill
workspace
DEV/STAGING environment
capability scopes
budget
expiry
```

They MUST NOT permit direct Core DB/R2/provider-master access.

---

# 28. Skill Engineering Flow

```text
User describes Skill
→ artifact class SKILL
→ Spec 221 requirement/Skill Contract
→ Spec 230 methodology/context
→ Spec 218 workspace/harness when external execution needed
→ baseline/tests/evals/repair
→ Spec 221 review/release
→ Capability Registry
```

Prompt-only/simple Skills MAY complete without a local Runner if SmartAIHub can safely execute the engineering stages internally.

---

# 29. Product-Discovered Skill Flow

```text
Build Product
→ requirement needs reusable calculation/action
→ search Skills
→ none eligible
→ CAPABILITY_GAP
→ create Tenant Skill candidate in Spec 221
→ evaluate/release
→ bind new Skill into Mini App/Workflow
→ resume Product build
```

This flow SHOULD preserve one parent correlation ID for UX/audit while keeping Skill and Product release states independent.

---

# 30. Native Mini App UI Engineering

For native/declarative Mini Apps, Spec 230 MAY use the harness/LLM methodology without creating arbitrary frontend source.

Outputs MAY be declarative:

```text
page structure
components
layout
design tokens
copy
responsive rules
interaction mapping
result renderers
```

They remain rendered through the SmartAIHub Mini App system owned by Spec 217/216.

---

# 31. Custom Mini App Engineering

For advanced UX such as:

- Three.js/Babylon/WebGPU 3D editors;
- video/audio timelines;
- GIS/maps;
- diagram/CAD-like tools;
- rich collaborative editors;
- advanced dashboards/simulations;

Spec 230 routes to a code-backed `CUSTOM_MINI_APP` workspace executed by Spec 218.

The module still uses Spec 220 SDK/MCP for SmartAIHub capabilities and is deployed by Spec 219.

---

# 32. UI/UX Design Engineering Profile

`UI_UX_DESIGN_ENGINEERING` SHALL combine software discipline with visual/product design stages:

```text
1. Product intent/persona analysis
2. Brand/context load
3. Information architecture
4. Multiple design directions where useful
5. Wireframe / declarative prototype
6. High-fidelity implementation
7. Desktop/tablet/mobile render
8. Multimodal visual critique
9. Accessibility/usability checks
10. Repair/refinement loop
11. owner preview/approval
12. regression baseline
```

Superpowers may enforce brainstorming/planning/TDD/review, but SmartAIHub adds design-specific quality gates.

---

# 33. Design-System Preference

Native Mini Apps SHOULD use SmartAIHub approved design-system primitives/tokens where feasible. Custom Products MAY use broader frontend stacks but SHOULD still consume Product BrandDefinition and approved accessibility/security requirements.

The harness SHOULD avoid unnecessary bespoke CSS/components when an approved equivalent exists.

---

# 34. Visual QA Evidence

UI engineering evidence MAY include:

```text
desktop screenshots
mobile/tablet screenshots
visual regression diff
a11y scan
layout overflow report
contrast/readability checks
brand-conformance score
task clarity/usability rubric
browser compatibility
performance budget
```

Marketplace/Public Product policy MAY require minimum design-quality gates.

---

# 35. Superpowers + UI Engineering Composition

Illustrative profile:

```text
Superpowers brainstorming
→ SmartAIHub product/design contract
→ Superpowers writing-plan
→ implementation/TDD where applicable
→ visual render
→ SmartAIHub multimodal design reviewer
→ code/design repair
→ Superpowers verification-before-completion
→ SmartAIHub release gate
```

The two systems complement each other rather than duplicating responsibility.

---

# 36. Skill Authoring Composition

Illustrative profile:

```text
Spec 221 Skill Contract
→ baseline failure scenarios
→ Superpowers writing-skills / native equivalent
→ skill implementation
→ pressure-scenario evals
→ SmartAIHub compatibility/security evals
→ independent review
→ Spec 221 publication gate
```

---

# 37. Harness Choice

UI MAY offer:

```text
Development Engine
● Auto
○ Claude Code
○ Codex
○ Antigravity
○ Hermes
```

Auto selection considers:

```text
installed/available state
artifact type
required tools
subagent capability
locality/privacy
user policy
model entitlement
cost/budget
historical success
current health
methodology compatibility
```

No harness is assumed universally superior.

---

# 38. Multi-Harness Roles

For higher-risk jobs the platform MAY use separate harnesses/agents:

```text
Architect
Implementer
Spec reviewer
Code reviewer
UI reviewer
Security reviewer
Eval judge
```

Builder and reviewer independence SHOULD be used where risk warrants it.

---

# 39. Local Runner vs Managed Sandbox

Preferred target MAY be user Runner when:

```text
local repository/state is required
user has licensed harness subscription
private/local resources are required
local GPU/tooling is useful
```

Managed sandbox MAY be preferred/fallback when:

```text
no Runner online
clean reproducible environment required
Tenant chooses managed development
local execution prohibited
```

Production availability is never dependent on Runner uptime.

---

# 40. Source Repository Policy

Custom Product/Mini App source normally follows Spec 218 Git governance. SmartAIHub-generated project context/skills MAY be checked in where they are part of reproducible project behavior, but transient credentials/session state MUST NOT be committed.

Skill source may be Git-backed but Skill publication remains Spec 221-controlled.

---

# 41. Dependency on SmartAIHub Product SDK

Generated Product code SHOULD use a versioned thin Product SDK backed by Spec 220.

Examples:

```ts
auth.currentUser()
data.collection("projects")
assets.upload(file)
knowledge.search(query)
skills.invoke(skillId, input)
workflow.run(workflowId, input)
capabilities.invoke(capabilityId, input)
```

The SDK is not a privileged plugin SDK.

---

# 42. Data Model Discipline

Coding agents SHALL NOT invent direct Core table access.

When new logical data is needed:

```text
harness proposes collection/schema
→ Spec 220 validation
→ approved migration/schema authority
→ generated/updated SDK contract
→ Product code consumes logical collection
```

Physical table/storage layout remains hidden.

---

# 43. Permission Deltas

If implementation discovers a new required capability:

```text
current grants
→ requested delta
→ reason/risk/cost/side effect
→ policy/owner approval as required
→ new scoped grant
```

Agents MUST NOT solve permission errors by bypassing the gateway.

---

# 44. External Network Access

Development network egress is policy-controlled. External references/dependencies are untrusted until validated. Credentials MUST not be pasted into code prompts where a brokered handle is possible.

---

# 45. Prompt Injection / Untrusted Repo Content

Repository files, retrieved docs, issues, Skill descriptions, MCP/tool results and web content can contain malicious instructions.

The harness context SHALL state that these are data unless they belong to the approved project instruction chain. Server-side grants remain authoritative regardless of model behavior.

---

# 46. Project Instruction Tampering

Managed context adapters SHOULD be hashed/recorded as engineering evidence. A Tenant may intentionally customize project instructions, but the platform MUST be able to distinguish:

```text
platform-managed content
Tenant-authored content
local uncommitted override
```

Unexpected changes MAY require review for regulated/high-risk builds.

---

# 47. Context Freshness

A Context Pack becomes stale when material dependencies change, including:

```text
Product/Skill contract
BrandDefinition
Data schema
Capability/Skill contracts
permissions
Product SDK version
release policy
methodology profile
```

The system SHOULD invalidate or refresh affected context before continuing long-lived work.

---

# 48. Context Size Budget

Every harness adapter SHALL have context-budget policy. Root instruction adapters stay concise. Detailed data is fetched on demand.

No Product build may dump entire Skill Marketplace, complete DB schema or all SmartAIHub docs into every agent prompt by default.

---

# 49. Engineering State and Resume

Long-running development SHALL persist platform-owned state sufficient to resume with a new harness/session:

```text
requirement
plan
source revision
work items
context pack revision
methodology stage
completed evidence
open findings
budget
```

Raw private reasoning is not required for resume.

---

# 50. Engineering Evidence Contract

```ts
interface EngineeringEvidence {
  developmentJobId: string;
  workPackageId: string;
  sourceRevision?: string;
  harness: { family: string; version?: string };
  methodology: { id: string; version: string };
  contextPackVersion: string;
  commandsRun: string[];
  testResults: EvidenceRef[];
  evalResults?: EvidenceRef[];
  visualResults?: EvidenceRef[];
  securityResults?: EvidenceRef[];
  permissionDelta?: EvidenceRef;
  artifacts: EvidenceRef[];
}
```

---

# 51. Completion Semantics

A harness saying "done" is not authoritative.

Completion requires the artifact-specific gate:

```text
Skill            → Spec 221 verification/release readiness
Native Mini App  → Spec 217/216 schema/design/policy validation
Custom Mini App  → Spec 218 build/test + Spec 217 product UX + release gate
Tenant Product   → Spec 218/219 release gate + Spec 217 product policies
```

---

# 52. Cost and Budget

Agentic development may consume model tokens, cloud sandbox, Runner time, evals and visual generation/review.

The UI SHOULD show estimates/budgets and allow Tenant policy limits. Child Skill Engineering jobs must receive bounded sub-budgets rather than unlimited inheritance.

Economic charging uses canonical SmartAIHub billing authority; Spec 230 does not implement a new ledger.

---

# 53. User and Role Model

Possible permissions include:

```text
product.develop
product.review
product.release
skill.create.personal
skill.create.tenant
skill.submit.marketplace
runner.use
harness.use:<family>
development.install_tool
permission.request
```

Creation permission does not imply production release, Marketplace publication or privileged capability approval.

---

# 54. Ordinary User Skill Creation

An ordinary authorized user MAY create Personal Skills through Skill Studio without installing local development tools when the Skill type can be engineered safely in managed runtime.

Runner/harness use becomes an execution option when source/code/tool requirements justify it.

---

# 55. Tenant Admin Product Development

Tenant Admin SHOULD be able to develop Brand/Product/Mini App functionality from SmartAIHub Web. Local coding tools are implementation accelerators, not a requirement for using the Product Builder.

---

# 56. Enterprise Policy

Enterprise Tenant policy MAY restrict:

```text
allowed harnesses
local vs cloud development
external model/provider use
Superpowers installation
source repository location
network egress
permitted licenses
release reviewers
required evidence
```

---

# 57. SmartAIHub Core Development Boundary

Tenant development credentials MUST NOT authorize SmartAIHub Core source modification. Platform-core engineering uses separate administrative workspaces, repositories, roles and secrets even if the same harness adapters/methodology are reused.

---

# 58. Installation Security

Tool/plugin installation on a user machine SHALL:

- require explicit authorization;
- verify source identity where technically available;
- avoid running unreviewed arbitrary installer scripts solely because a model requested it;
- record installer/version/result;
- respect OS user privilege boundaries;
- support uninstall/disable guidance;
- not overwrite unrelated user settings silently.

---

# 59. Update / Drift Management

Runner reports drift such as:

```text
harness missing/outdated
Superpowers missing/outdated
SmartAIHub skill pack mismatch
Product SDK compatibility mismatch
project context stale
MCP unavailable
```

Policy determines warn/block/auto-remediate-with-approval behavior.

---

# 60. Methodology Upgrade Gate

Changing the default Superpowers version/profile or SmartAIHub engineering skill pack is treated as an engineering dependency change.

Before broad rollout, the platform SHOULD evaluate representative tasks across:

```text
Skill authoring
native Mini App UI
custom frontend
API/data integration
3D/advanced UI
bug repair
refactor
```

and compare success, regressions, cost and latency.

---

# 61. UI Design Benchmarking

SmartAIHub SHOULD maintain representative UI tasks and visual rubrics so changes to design model/harness/methodology do not silently lower Product quality.

Metrics MAY include:

```text
task completion
visual hierarchy
brand alignment
accessibility
responsive correctness
interaction correctness
performance
human preference
regression rate
```

---

# 62. Skill Engineering Benchmarking

Spec 221 remains authoritative for Skill eval methodology. Spec 230 provides cross-harness comparability/provenance so the same Skill candidate can be evaluated across different builders where useful.

---

# 63. Failure Recovery

Examples:

```text
Runner offline         → resume on same/new eligible target
Harness crashes        → persist evidence and retry/resume policy
Superpowers hook fails → native methodology fallback if allowed
MCP unavailable        → block capability-dependent stage; do not invent contracts
Git conflict           → produce conflict/rebase review job
Context stale          → refresh/replan affected tasks
Permission denied      → structured permission delta; no bypass
```

---

# 64. User Interruption and Steering

SmartAIHub UI SHOULD allow the user to add instructions while work is running. The controller records the new requirement, determines whether current work can safely incorporate it, and either updates pending tasks or creates a new revision/change request.

Direct chat steering MUST NOT mutate already-approved production state without normal release gates.

---

# 65. Preview-First UX

For user-visible Product/Mini App changes, normal flow SHOULD be:

```text
request
→ implementation
→ preview URL/render
→ screenshots/evidence
→ user asks changes OR approves
→ release
```

Non-developer users need not inspect source code to review visual/product changes.

---

# 66. Source Diff for Advanced Users

Advanced users MAY inspect:

```text
file diff
commits
build logs
tests
permission delta
capability dependency delta
schema migration proposal
```

SmartAIHub UI remains the canonical review surface even when GitHub is also accessible.

---

# 67. Capability Dependency Lock

A release SHOULD persist a lock/snapshot of material SmartAIHub dependencies:

```text
Skills + versions/policies
Workflows
Product SDK/API compatibility
Capabilities/providers when pinned
schema versions
```

This enables impact analysis and reproducibility.

---

# 68. No Runtime Packaging of SmartAIHub Skills by Default

SmartAIHub Skills are invoked as governed platform capabilities. Custom Product code SHOULD NOT copy/download Skill internals into its deployment bundle merely to call them.

Exceptions require an explicit export/offline contract with licensing/security/version semantics.

---

# 69. Native and Custom UI Share Product Semantics

A Product may freely mix:

```text
Native Mini App
Custom Mini App
native Product modules
```

All use the same Tenant identity/Brand/entitlement/billing/capability contracts. The development path may differ without fragmenting the user-facing Product.

---

# 70. Suggested Workspace Structure

Illustrative custom Product repo:

```text
/
  AGENTS.md
  CLAUDE.md                  # optional thin adapter
  .smartaihub/
    project-context.json
    capability-lock.json
    development-policy.json
    README.md
  docs/
    architecture/
    product/
    api/
  apps/
    web/
  packages/
  tests/
```

For Skills, package layout remains governed by Spec 221.

---

# 71. Generated vs Human-Maintained Files

Each managed context file SHOULD declare ownership mode:

```text
GENERATED
MANAGED_BLOCK
HUMAN
```

SmartAIHub regeneration SHALL preserve `HUMAN` regions and fail safe on ambiguous conflicts.

---

# 72. Audit and Telemetry

Engineering audit SHOULD record:

```text
who requested change
artifact/tenant/product/skill
selected target/harness
methodology/context versions
permission grants
source revisions
install/update operations
build/test/eval outcomes
approvals/releases
cost references
```

Telemetry MUST avoid storing raw secrets or unnecessary end-user data.

---

# 73. Privacy and Source Scope

A coding harness receives only the source/data context required for the authorized workspace. Access to other Tenant Products, personal files or SmartAIHub Core repositories is denied by default.

---

# 74. Offline / Degraded Development

Runner MAY continue purely local source edits/tests when permitted and when remote SmartAIHub capabilities are not required. Operations requiring Data/Skill/Capability contracts MUST fail clearly or use an explicit cached dev schema snapshot; they MUST NOT guess current production contracts.

---

# 75. Cached Contract Snapshots

For resilience, Project Context Pack MAY contain signed/versioned snapshots of relevant schemas/contracts. Before release, authoritative online validation MUST re-check that they remain compatible/current.

---

# 76. Marketplace/Public Product Quality

Public Marketplace Mini Apps/Products MAY impose stronger UI design/security/dependency/eval gates than private Tenant Products. Development methodology selection SHALL not lower publication policy.

---

# 77. Cross-Tenant Isolation

Harness/MCP context MUST be Tenant/Product scoped. Search results from Skill Marketplace may be global/public, but private Skill/data/source discovery cannot cross Tenant boundaries without explicit sharing policy.

---

# 78. Background Development Jobs

Long builds/evals can continue after the browser closes using canonical durable job infrastructure. Browser session is presentation/control only.

---

# 79. Human Approval Boundaries

Required approvals MAY include:

```text
install third-party harness/plugin
new external dependency
new capability permission
schema migration
security-sensitive Skill capability
Marketplace publication
production release
custom-domain changes
```

Approval evidence MUST be explicit and auditable.

---

# 80. Security Invariant

Even a fully compromised or badly instructed coding agent SHALL NOT be able to obtain more production authority than the scoped tokens/gateway policies grant it.

Prompt instructions are never the final security boundary.

---

# 81. Implementation Phases

## Phase 1 — Shared Context Foundation
- DevelopmentIntent / WorkPackage / ContextPack models
- artifact classifier
- AGENTS.md adapter
- developer MCP resources/search
- SmartAIHub orchestrator skill

## Phase 2 — Harness Bootstrap
- Runner discovery
- Claude/Codex/Antigravity/Hermes adapters
- SmartAIHub engineering skill-pack registration
- Superpowers detection/version policy

## Phase 3 — Skill Integration
- Spec 221 work-package handoff
- Product capability-gap → Skill job
- resume Product after Skill release

## Phase 4 — Mini App / Product Engineering
- native UI design profile
- custom Mini App source path
- Product Brand/UX context
- preview/review UX

## Phase 5 — Quality & Enterprise
- multimodal visual QA
- context drift checks
- regulated policy packs
- methodology benchmarks
- multi-harness review roles

---

# 82. Required Tests

1. Artifact classification tests.
2. Existing-capability reuse tests.
3. Product capability-gap → Skill Engineering integration tests.
4. No Skill publication bypass tests.
5. Harness detection/bootstrap tests.
6. Context-file merge/conflict tests.
7. AGENTS/CLAUDE adapter freshness tests.
8. SmartAIHub MCP scope/isolation tests.
9. Direct DB/R2/provider credential denial tests.
10. Schema proposal vs direct SQL tests.
11. Permission delta tests.
12. Superpowers absent fallback tests.
13. Superpowers version drift tests.
14. Runner offline migration/resume tests.
15. Context stale invalidation tests.
16. Prompt-injection/repo-instruction tests.
17. Native Mini App design tests.
18. Custom 3D/UI module build tests.
19. Responsive/a11y/visual regression tests.
20. Product release provenance tests.
21. Cross-Tenant isolation tests.
22. Tool/plugin install consent tests.
23. Enterprise harness allowlist tests.
24. Long-running job resume tests.
25. Skill/Product dependency lock tests.

---

# 83. Acceptance Criteria

- [ ] One canonical Project Context Pack feeds all supported harness adapters.
- [ ] Root instruction files are concise maps, not duplicated platform manuals.
- [ ] Claude/Codex/Antigravity/Hermes are swappable execution harnesses.
- [ ] Superpowers can be installed/used per harness without becoming required runtime infrastructure.
- [ ] SmartAIHub Orchestrator Skill teaches platform-specific development rules.
- [ ] Product/Mini App builders search existing Skills before generating duplicate backend logic.
- [ ] Missing reusable capability can launch Spec 221 and later resume the Product build.
- [ ] Mini Apps can invoke Skills through governed Spec 220 contracts.
- [ ] Native Mini App UI can be improved using AI design engineering without custom code.
- [ ] Advanced UI can escalate to custom source while remaining inside Product/Mini App architecture.
- [ ] No development harness gets direct Core SQL/R2/Vector/provider master credentials.
- [ ] Instruction-file changes cannot widen permissions.
- [ ] Release evidence identifies harness/methodology/context versions.
- [ ] Development remains usable from SmartAIHub Web for non-developers.
- [ ] Local Runner is optional; managed sandbox fallback exists.
- [ ] Production runtime does not depend on development harness/Superpowers.

---

# 84. Definition of Done

Spec 230 is complete when a user can initiate Skill, Mini App or Tenant Product development from SmartAIHub Web; SmartAIHub can select an appropriate methodology and available harness; the harness automatically receives correct SmartAIHub project context, first-party engineering skills and governed MCP/API access; it can develop using local Runner or managed sandbox without direct platform credentials; and the resulting artifact returns to the correct Spec 217/218/219/221 release lifecycle with complete evidence.

The essential platform invariant is:

> **Coding agents may change source, but only SmartAIHub contracts may grant platform authority.**


# 85. Two Skill Namespaces

To prevent semantic and security confusion, Spec 230 defines:

```text
RUNTIME_SKILL
  SmartAIHub Spec 221 capability artifact

HARNESS_ENGINEERING_SKILL
  local/managed coding-agent instruction package
  examples: Superpowers skills, smartaihub-orchestrator
```

IDs/registries/installation flows MUST remain distinct.

Recommended logical namespaces:

```text
sai.runtime-skill/<id>
sai.dev-skill/<id>
```

A Product calls `RUNTIME_SKILL` through Spec 220. A coding harness loads `HARNESS_ENGINEERING_SKILL` into its agent environment. Neither action implies the other.

# 86. First-Party Orchestrator Distribution

`smartaihub-orchestrator` and companion engineering skills SHALL be distributed as first-party development tooling through Spec 230/HarnessAdapter, not as ordinary customer Marketplace Skills.

The pack MAY use harness-native skill/plugin mechanisms. Its source/version/hash SHALL be auditable.

# 87. Local Harness Authentication

For a user-owned Runner:

```text
SmartAIHub Runner
→ launches approved local harness process
→ harness uses user's own local login/subscription/session
```

SmartAIHub MUST NOT require extraction/upload of the user's Claude/Codex/Antigravity/Hermes account token when local invocation can rely on the harness's own authenticated environment.

Runner reports only capability/health/version metadata required for routing. Sensitive local auth material remains under the harness/user boundary.

# 88. Outer Security Boundary

Harness internal permission prompts/configuration are defense-in-depth, not the platform's final security boundary.

The outer boundary remains:

```text
Runner workspace/OS isolation
+ short-lived SmartAIHub developer grants
+ Spec 220 server authorization
+ Git/release gates
```

A locally authenticated coding agent may have broad filesystem powers under the user's OS account, so Runner workspace policy SHOULD use the strongest practical sandbox/isolation mode and explicit user grants for paths outside the Product workspace.

# 89. Harness Context Precedence Compatibility

Different harnesses discover context files differently. `HarnessAdapter` MUST model actual supported precedence rather than generating every possible instruction file blindly.

Example rule:

```text
If a harness selects only one project context family,
create/update the chosen portable canonical adapter and avoid a higher-priority
harness-specific file that would silently shadow it unless that behavior is intentional.
```

The adapter's compatibility tests SHALL verify the effective context seen by each supported harness version.

# 90. Final Cross-System Principle

> **SmartAIHub Runtime Skills make Products capable. Harness Engineering Skills make coding agents capable of building those Products safely. They are different layers and must never be conflated.**

# Revision 2 — Final Integrated Agentic Development Stress-Audit Addendum

**Normative precedence:** This addendum supersedes conflicting Revision 1 sections. Spec 230 remains a development-context/methodology fabric, not a runtime Product/Skill authority.


## R2.1 Shared Contract Family and Version Negotiation

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

## R2.2 Harness Adapter Classes

Harness integration SHALL be capability-based rather than CLI-name based.

Supported adapter classes:

```text
LOCAL_CLI_HARNESS
LOCAL_DESKTOP_HARNESS
MANAGED_CLOUD_HARNESS
SANDBOX_HOSTED_HARNESS
ENTERPRISE_REMOTE_HARNESS
HUMAN_ASSISTED
```

Examples such as Claude Code, Codex, Antigravity, Hermes, provider Agents APIs or future systems map into one of these classes and MAY change implementation without changing DevelopmentWorkPackage semantics.

## R2.3 ProjectContextPack Integrity

Every generated ProjectContextPack SHALL include:

```text
context_version
tenant_id
product/skill/workspace identity
source_revision
contract versions
generated_at
expiry/staleness rule
content hash
source references
policy/risk class
```

Adapters MAY render portions into `AGENTS.md`, `CLAUDE.md`, harness-native skills/plugins or MCP resources, but rendered files are caches/views of the canonical context.

A modified instruction file MUST NOT become authority merely because a harness reads it first.

## R2.4 Orchestrator Skill Minimalism

`smartaihub-orchestrator` SHOULD teach:

- how to discover authoritative context;
- how to query Product SDK/Data/Asset/Capability contracts;
- how to request schema/permission/network changes;
- prohibited direct-Core patterns;
- required testing/preview/release flow.

It SHOULD NOT embed large copies of all API schemas, Skill catalogs or product specs. Those are retrieved on demand.

## R2.5 Managed Cloud Harness Support

Spec 230 MUST support managed agent/harness APIs as swappable engineering targets when tenant policy permits.

Managed harness adapters SHALL:

- receive scoped repository/workspace/context;
- use provider credentials governed separately from local-user harness auth;
- expose session/run identity for resume/audit where available;
- normalize tool/result evidence;
- respect source/data residency and egress policy;
- never gain direct production deployment authority.

## R2.6 Multi-Harness Concurrency and Role Separation

When Builder/Reviewer/Test agents use different harnesses:

```text
Builder → immutable candidate revision
Reviewer → reads candidate revision
Repairer → creates new child revision/change set
```

They SHOULD NOT share an uncontrolled mutable workspace.

Spec 218 owns worktree/branch mechanics; Spec 230 declares the cognitive role/evidence relationship.

## R2.7 Bounded Capability-Gap Recursion

Development Intent Router MAY hand a Product gap to Spec 221, but:

- nested gap engineering has a parent budget/depth;
- an unresolved gap fingerprint is deduplicated;
- Skill Engineering MUST search reuse first;
- Product build resumes only against a released/eligible capability;
- failure to build a capability returns a structured blocked reason rather than prompting the agent indefinitely.

## R2.8 Context Injection and Untrusted Content

Repository docs, retrieved web pages, MCP tool descriptions, Skill descriptions and user-provided reference files are data, not authorization.

Harness adapters SHOULD label provenance/trust class where possible.

Instructions found inside untrusted content cannot override:

```text
ProjectContext security invariants
developer grant
Spec 220 authorization
release policy
tenant isolation
```

## R2.9 Harness/Methodology Drift Registry

Maintain compatibility status for:

```text
HarnessAdapter
harness/provider version
Superpowers version
SmartAIHub dev-skill pack
context adapter
Product SDK
```

A new version MAY be:

```text
CANDIDATE
CANARY
SUPPORTED
DEPRECATED
BLOCKED
```

Promotion requires appropriate smoke/regression tests.

## R2.10 UI/UX Engineering Evidence

For Mini App/Product UI changes, engineering evidence SHOULD capture according to risk/tier:

```text
desktop/tablet/mobile renders
visual diff
accessibility checks
interaction smoke tests
BrandDefinition/token compliance
loading/empty/error states
performance budget
3D/WebGPU capability/fallback checks when applicable
```

A visually attractive screenshot alone is not sufficient product QA.

## R2.11 Plugin Replacement Principle

Specs 217–222 SHALL prefer:

```text
Product/Mini App source
+ RUNTIME_SKILL/Workflow/Capability APIs
+ sandboxed/runtime-isolated custom UI
```

over installing arbitrary third-party code into SmartAIHub Core.

A true Core extension remains a separately privileged platform engineering concern, not something a Tenant Product author obtains by escalating a Mini App.

## R2.12 Revision 2 Acceptance Criteria

- [ ] Harness adapters support local, sandbox-hosted and managed-cloud agent targets.
- [ ] ProjectContextPack has identity/hash/freshness and remains canonical over rendered instruction files.
- [ ] Orchestrator engineering skill is a concise map to governed platform contracts.
- [ ] Multi-harness builder/reviewer flows use immutable candidate revisions.
- [ ] Capability-gap recursion is bounded and deduplicated.
- [ ] Untrusted repo/web/MCP content cannot widen authorization.
- [ ] Harness/Superpowers/context adapter drift is registry-managed and regression-gated.
- [ ] UI engineering evidence includes behavior/a11y/responsive/performance, not screenshots only.
- [ ] Tenant product extensibility does not reintroduce arbitrary Core Plugin execution.

# 91. Revision 3 Amendment — Repository Engineering Profile & Hybrid Engineering Brain

Revision 3 is additive and normative. It formalizes how mature repository-local engineering methods, including an existing Orchestrator + `<repo-root>/skills/**` workflow, are preserved and improved when execution is governed by Spec 224.

The design objective is **behavioral continuity plus stronger closure**, not replacing proven engineering intelligence with generic prompts.

# 92. `RepositoryEngineeringProfile`

Spec 230 SHALL own a versioned `RepositoryEngineeringProfile` describing how a repository is normally engineered.

Minimum logical fields:

```text
profile_id
repository_ref
source_revision
profile_version
engineering_skill_sources[]
trusted_project_instruction_sources[]
legacy_orchestrator_adapter?
preferred_methodologies_by_phase
preferred_review_methods
preferred_debug_methods
UI/UX engineering methods
audit/hardening methods
provider compatibility
context budget policy
skill conflict policy
fallback profile
profile digest
```

For SmartSpecPro, an approved root `skills/` tree MAY be declared as a canonical engineering-skill source without implying that every Skill is loaded for every task.

# 93. Repository Engineering Skill Source Discovery

At repository/context preparation time, Spec 230 SHALL discover configured engineering-Skill sources such as:

```text
<repo-root>/skills/**
.agents/skills/**
provider-specific run Skill roots
platform-provided sah-* phase modules
```

Discovery SHALL produce metadata/index entries before model execution. Content loading remains selective and progressive.

Source trust classification SHALL distinguish:

```text
SMARTAIHUB_PROTOCOL
TRUSTED_REPOSITORY_ENGINEERING
TRUSTED_METHODOLOGY
UNREVIEWED_REPOSITORY_SKILL
PROVIDER_PERSONAL_SKILL
UNTRUSTED_GENERATED_CONTENT
```

A discovered Skill never grants authority by existence.

# 94. Legacy Orchestrator Compatibility Mode

During migration, Spec 230 SHALL support a `LEGACY_ORCHESTRATOR_COMPAT` engineering profile where the historically proven repository Orchestrator/methodology remains available as the **inner cognitive engineering workflow** while Spec 224 becomes the outer durable lifecycle authority.

```text
Spec 224
  durable state / closure / recovery / finality
        ↓
Spec 230 RepositoryEngineeringProfile
        ↓
legacy orchestrator methodology + selected repository Skills
        ↓
Claude / Codex / other certified harness
```

The legacy orchestrator MAY decompose, reason, call Skills or coordinate provider-local subagents inside the bounded phase/work package. It SHALL NOT own cross-phase state, authorization, budgets, durable decisions, evidence closure or Final Verify.

# 95. Skill-Augmented Phase Execution

For significant PLAN, IMPLEMENT, DEBUG/REPAIR, REVIEW, GAP/HARDENING and VERIFY-support actions, Spec 230 SHALL compile a `PhaseEngineeringContext` from:

```text
Spec 224 PhaseProtocol / action contract
+ RepositoryEngineeringProfile
+ selected methodology Skills
+ selected domain/project Skills
+ bounded ProjectContextPack
+ current requirement/work-package refs
+ immutable candidate/evidence refs
```

The canonical phase protocol defines **what must be achieved and returned**. The engineering profile/Skills improve **how the executor reasons and works**.

# 96. Work-Package and Audit-Lens Skill Resolution

Skill resolution SHALL be granular enough to vary by WorkPackage or audit lens.

Example:

```text
WP database migration
  → migration-engineering + TDD + project database Skill

WP Task Control UI
  → UI engineering + accessibility + project frontend Skill

Audit lens stale approval race
  → concurrency + state-machine + authorization review Skills
```

A single run-wide Skill bundle SHOULD NOT be used when it causes irrelevant context or instruction collision.

# 97. Progressive Disclosure and Context Budget

Spec 230 SHALL favor:

```text
catalog metadata
→ shortlist
→ primary Skill instructions
→ requested references/examples/scripts
```

over full Skill-directory injection.

The context compiler SHALL account for Skill payload cost alongside source, Spec, plan and evidence context. A high-value Skill MAY displace low-value generic context, but required phase contracts and authoritative facts SHALL never be dropped merely to fit a Skill.

# 98. Behavioral Parity Certification

Before retiring a historically successful repository engineering workflow, SmartAIHub SHALL run a behavioral parity campaign comparing:

```text
A. legacy orchestrator + repository Skills
B. Spec 224 + RepositoryEngineeringProfile + same/approved successor Skills
```

Representative tasks SHOULD include small changes, complex bugs, UI features, distributed-state defects, migrations, large Spec implementation and cross-spec work.

Measure at minimum:

```text
requirement coverage
plan quality / plan defects found later
first-pass correctness
review finding severity/count
escaped defects
human interventions
recovery success
premature-completion rate
scope drift
token/context cost
wall-clock and active compute
```

The legacy path SHALL NOT be removed solely because the new runtime is architecturally cleaner. Material engineering-quality regression requires remediation or continued compatibility mode.

# 99. Skill-First Adaptive Audit-Lens Generation

For Spec 224 production-hardening campaigns, Spec 230 SHALL help generate focused audit lenses by interpreting the implemented candidate, architecture, Spec, historical findings and available engineering Skills.

Lens generation SHOULD answer:

```text
What interaction/failure domain has not been deeply inspected?
Which Skill can make this audit more specific?
What hypotheses are materially different from prior rounds?
What code/evidence should be inspected?
What counterexample could falsify the production-grade claim?
```

Generic repetition such as `find more gaps` SHOULD be downgraded when a more focused unexplored lens can be generated.

# 100. Audit Memory and Novelty Assistance

Spec 230 MAY retrieve and package **current-run / current-repository engineering context** needed to propose focused audit lenses, including relevant Skill metadata, project conventions and bounded summaries supplied by Spec 224.

Cross-run historical retrieval, ranking, policy evaluation and learned strategy evidence belong to **Spec 222**. Spec 230 MAY consume a bounded Spec 222 advisory bundle, but SHALL NOT create a parallel learning store or promotion authority.

Spec 224 owns the canonical AuditMemory/FindingGraph and determines whether a lens/finding is new, duplicated, resolved or material.

# 101. Engineering Strategy Evidence Interface

For verified work, Spec 230 SHOULD emit normalized engineering-context evidence covering:

```text
project class
phase
work-package type
Skill/version or digest
harness/provider/model
failure type
review method
RepositoryEngineeringProfile version
```

Spec 222 MAY learn/rank from that evidence under its replay/shadow/canary governance. Spec 230 MAY consume the resulting advisory ranking for future context preparation. Historical success is never an authorization or completion signal.

# 102. UI/UX and Device Engineering Profiles

RepositoryEngineeringProfile MAY define project-specific UI engineering methods and device expectations consumed by Spec 224 UI/UX closure, for example:

```text
framework/router conventions
component library
responsive/device design conventions
route/nav registration patterns
accessibility methods
state-management conventions
tablet touch alternatives
mobile focused-surface conventions
visual QA methods
```

The profile SHALL NOT silently redefine the product's required device support; required device classes remain requirement/Spec truth.

# 103. Cross-Spec Ownership

```text
Spec 221 → engineering Skill quality/evaluation/version
Spec 230 → repository engineering profile, Skill/method selection, context preparation and evidence emission
Spec 222 → cross-run replay, learning, ranking and advisory strategy intelligence
Spec 224 → lifecycle, requirement/blocker/finding closure, hardening campaign and Final Verify
Specs 225/226 → first-party cross-device/control-surface UX and compatibility bridge
```

# 104. Migrated Agentic Fabric Required Tests

1. SmartSpecPro root `skills/` is indexed as configured engineering knowledge without full-catalog prompt injection.
2. PLAN and DEBUG select different relevant Skill sets for the same run.
3. legacy orchestrator compatibility executes inside one bounded Spec 224 action and cannot mark the run complete.
4. Skill conflict with PhaseProtocol resolves to PhaseProtocol.
5. provider without native Skills receives an equivalent rendered engineering context.
6. parity benchmark detects a new path that closes more requirements but produces materially worse implementation quality.
7. audit lens generator rejects a near-duplicate generic lens and proposes a materially different focused lens.
8. audit memory retrieval does not copy stale finding resolution into canonical Spec 224 truth.
9. device/UI engineering conventions are supplied to the relevant work package without forcing unsupported mobile features.
10. context budget preserves mandatory phase/requirement facts before optional Skill references.

# 105. Revision 3 Definition of Done

Revision 3 is complete when the proven repository engineering workflow can operate as an inner methodology under Spec 224, root repository engineering Skills can be selected progressively per work package/audit lens, behavioral parity can be measured before legacy retirement, and no Skill/context mechanism can usurp durable lifecycle authority.

# 106. Revision 3 Final Principle

> **Spec 230 is the engineering-context and methodology fabric between a durable control plane and a capable coding harness. It SHALL preserve proven repository engineering intelligence, expose it selectively, and improve routing from evidence—without confusing engineering skill with lifecycle truth.**

# End of Spec 230 Revision 1

---

# Canonical Renumbering and Ownership Boundary

This document was historically drafted under Spec number 222. That number was later canonically assigned to the Self-Improving Exploration Layer. To eliminate ambiguity, this Agentic Development Fabric is now **Spec 230**.

Canonical split:

```text
Spec 221 = Skill engineering
Spec 222 = learning/replay/exploration/advisory intelligence
Spec 223 = ZCode adapter
Spec 224 = durable autonomous development lifecycle
Spec 230 = harness bootstrap/context/methodology/RepositoryEngineeringProfile
```

Any earlier clause in this document that could be read as owning historical strategy learning, replay or learned-policy promotion is subordinate to Spec 222. Spec 230 MAY consume Spec 222 advisory evidence but remains responsible for preparing the current harness execution context.

# Kimi Code Harness Preparation Profile

Kimi Code CLI/Desktop is a first-class harness family prepared by Spec 230 after capability certification.

## Preparation strategy

Preferred run preparation:

```text
isolated workspace / worktree
+ isolated or policy-approved KIMI_CODE_HOME
+ RepositoryEngineeringProfile
+ selected repository root skills
+ sah-* phase protocol pack
+ allowed MCP servers/tools
+ model/provider/thinking selection
+ permission profile
```

Kimi project Skill discovery natively includes `.kimi-code/skills/` and `.agents/skills/`; additional directories can be supplied by configuration. For SmartSpecPro's root `skills/`, Spec 230 SHOULD bind only the selected phase/WorkPackage/AuditLens Skills through a run-scoped extra Skill directory configuration or equivalent certified mapping.

## Programmatic transport preference

Spec 230 SHALL describe capabilities; Spec 218/Spec 200 adapters execute them. The preferred Kimi programmatic interface is the local authenticated `kimi web` REST/WebSocket server when its live schema is certified. Non-interactive CLI with structured output is an eligible bounded fallback.

Desktop itself is **not** the automation transport requirement. It is a useful human GUI over Kimi's Agent core.

## Native feature mapping

| SmartAIHub need | Kimi mechanism when certified |
|---|---|
| Planning | Plan mode + plan subagent |
| Long objective | Goal mode |
| Parallel bounded investigation | Swarm / subagents |
| Repository Skills | project/extra Skill directories |
| SmartAIHub capabilities | MCP client |
| Local guardrails/telemetry | hooks/plugins + external SmartAIHub policy |
| Pause/resume/cancel nested goal | Goal controls |
| Session progress | REST/WS status/snapshot/events |
| Fresh/parallel review | fork/child/subagent or separate session |
| Human local review | Kimi Code Desktop/Web/CLI |

Kimi native state never replaces SmartAIHub DevelopmentRun, RequirementClosureGraph, BlockerLedger, Approval or Final Verify.
---

# Revision 1C — Spec 229 Retrieval Integration

Spec 230 owns repository engineering context assembly, methodology resolution, root-Skill selection/materialization, provider/harness bootstrap and Project Context Pack construction. **It does not own the search/vector/RAG implementation used to discover relevant context.**

Repository/spec/Skill/workflow/history retrieval SHALL call Spec 229 Retrieval Broker V2. Spec 230 then applies engineering-specific selection, trust, scope, token-budget and progressive-disclosure rules to the returned evidence.

```text
WorkPackage / Phase / AuditLens
        ↓
Spec 230 context query planner
        ↓
Spec 229 Retrieval Broker
        ↓
authorized ranked evidence
        ↓
Spec 230 engineering selection / compaction / Skill binding
        ↓
HarnessBootstrapProfile
        ↓
Claude / Codex / Kimi / Hermes / ZCode / future harness
```

For Kimi Code, SmartAIHub MAY expose selected retrieval results through the bounded Project Context Pack or governed SmartAIHub MCP/API capabilities. Kimi MUST NOT receive direct Cloudflare AI Search/Vectorize credentials and MUST NOT become the retrieval authorization boundary.


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

# Revision 2 — Skill-First Repository Context Retrieval

Spec 230 SHALL use Spec 229 as the search/retrieval substrate while remaining the owner of engineering-specific context composition and methodology selection.

## Repository Skill Source Model

A repository-local Skill such as SmartSpecPro `/<repo-root>/skills/...` remains canonical at the pinned repository revision. Spec 230 SHALL scan/normalize repository Skill metadata into a `RepositorySkillDescriptor` compatible with Spec 221 contracts and publish an authorized discovery projection to Spec 229 when policy permits.

A discovery hit MUST resolve back to:

```text
repository identity
pinned commit/revision
relative path
digest
Skill identity/version or local revision identity
```

before use.

## WorkPackage / AuditLens Skill Resolution

For a current engineering unit:

```text
WorkPackage / phase / AuditLens / failure hypothesis
   ↓
Spec 230 query planner
   ↓
Spec 229 `SKILL_DISCOVERY`
   ↓
SkillCandidateEvidence[]
   ↓
Spec 221 lifecycle/trust/certification revalidation
   ↓
Spec 230 methodology fit + project convention selection
   ↓
selected Skill refs only
   ↓
lazy load/materialize canonical Skill source
   ↓
harness adapter
```

Selection SHALL support explicit negative triggers and conflict/incompatibility rules so semantic similarity does not over-select generic Skills.

## Progressive Disclosure / Token Control

Default context packaging SHALL include compact Skill identity/summary plus the selected `SKILL.md` only when the phase actually needs it. References, examples and scripts are loaded lazily according to the Skill contract and harness capability.

Small-task Fast Lane SHOULD use deterministic/exact/project-profile selection first and avoid unnecessary broad vector retrieval when one obvious Skill/method exists.

Large-spec and hardening campaigns MAY use broader retrieval because different WorkPackages/AuditLenses can require different Skills; selection is repeated per unit rather than fixed once for the whole DevelopmentRun.

## Harness Neutrality

Claude, Codex, Kimi, Hermes, ZCode and future harnesses receive the same canonical selected-Skill identity/digest/evidence, adapted to their native Skill/plugin/context mechanism. Provider-native search MAY improve local repository navigation but cannot replace Spec 229 for governed SmartAIHub knowledge.

## Feedback Loop

Execution outcome MAY generate structured effectiveness evidence for Spec 222 learning. Spec 222 can advise future ranking/selection, but Spec 230 retains current-task methodology fit decisions and Spec 221 retains Skill authority.

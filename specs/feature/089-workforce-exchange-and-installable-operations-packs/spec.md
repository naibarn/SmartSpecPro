# 089 - Workforce Exchange And Installable Operations Packs

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 075-unified-web-desktop-agent-platform, 079-autonomous-work-transformation-platform, 080-autonomous-team-monitor-and-persistent-role-agents, 083-agent-registry-and-organization-model, 086-agent-policy-guardrails-and-action-mesh, 088-agentops-tracing-evaluation-and-release-gates, 064-skill-maintenance-lifecycle
Audience: Product, Marketplace, Workpack, Teams, Runtime, Security, Admin, QA

---

## 1. Executive summary

The current marketplace is centered on individual skills.
A mature Smart AI Hub should let customers install complete operational capability, not just one skill at a time.

Feature 089 evolves the marketplace into a **Workforce Exchange** for installable operations packs such as:

- workpack families
- agent packs
- role blueprints
- SOP packs
- policy packs
- benchmark packs

This feature intentionally combines these pack types because they must version, install, validate, and roll out together.
The exchange should also carry post-install memory so each pack improves based on how it actually performed in tenant environments.

The exchange is tenant-aware:

- system admins can govern the marketplace and pack policy across tenants
- tenant admins can install and manage packs only for their own tenant
- regular users can benefit from installed packs through their own teams and workspaces
- pack installation must never bypass tenant policy or team ownership rules

---

## 2. Problem statement

Feature 079 introduces reusable workpacks.
Feature 080 introduces reusable role blueprints and persistent role agents.
What is still missing is the distribution model that lets tenants adopt those capabilities safely and repeatably.

Without this feature:

- rollout depends on manual setup and product knowledge
- reusable benchmark packs stay internal instead of becoming a distribution asset
- trust, compatibility, and prerequisites are hard to inspect before installation

---

## 3. Goals

1. Let tenants install end-to-end operational packs instead of only single skills.
2. Package workpacks, role blueprints, policy presets, and benchmark evidence together when needed.
3. Show compatibility, prerequisites, trust labels, and evaluation posture before install.
4. Support staged rollout and rollback of installed packs.
5. Reuse the existing marketplace foundations where possible.
6. Preserve outcome memory so future installations can see what worked, what regressed, and what should be tuned before the next rollout.

---

## 4. Non-goals

1. This feature does not remove the existing skill marketplace.
2. This feature does not allow third-party packs to bypass trust or policy review.
3. This feature does not promise instant cross-tenant sharing for all pack types.
4. This feature does not own runtime orchestration; it distributes packs that Feature 095 and related runtimes can execute.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/server/routers/marketplace.ts` | Marketplace discovery and governance already exist | Extend from single-skill discovery to multi-asset workforce packs |
| `apps/web/server/routers/packages.ts` | Package management already exists | Reuse package installation semantics for workforce bundles |
| `apps/web/shared/workpackDomainPacks.ts` | Domain-pack thinking already exists for workpacks | Promote it into a first-class installable exchange concept |
| `apps/web/server/services/skillStudioService.ts` | Skill creation and publishing already exist | Keep skills as ingredients inside broader workforce packs |
| `apps/web/server/services/workpackPromotionService.ts` | Workpack promotion already exists | Publish stable promoted packs into the exchange with evidence |
| `apps/web/shared/roleAgentContracts.ts` | Role blueprints and role contracts already exist | Package role blueprints alongside workpack families and policy profiles |

---

## 6. Locked product decisions

1. **The exchange distributes operational capability, not just prompts.**
   - Packs may include agents, workpacks, policies, connectors, and eval metadata.

2. **Installation must be transparent.**
   - Tenants should see prerequisites, trust labels, and blast radius before install.

3. **Benchmark evidence travels with the pack.**
   - A high-trust pack should show how it earned that trust.

4. **Compatibility is first-class.**
   - Pack installation should fail closed when required connectors, policies, or platform capabilities are missing.

---

## 7. Core pack model

### 7.1 Pack types

- `agent_pack`
- `workpack_family_pack`
- `role_blueprint_pack`
- `policy_pack`
- `benchmark_pack`
- `industry_bundle`

### 7.2 Required manifest fields

- pack type
- supported platform version range
- required connectors
- required policy capabilities
- required rollout flags
- trust label
- evaluation scorecard
- maintenance status
- compatible workpack or role families
- operational memory summary

---

## 8. Functional requirements

### 8.1 Catalog experience

- The exchange must let tenants browse by:
  - industry
  - work domain
  - risk level
  - maturity
  - required integrations
  - trust label

### 8.2 Install flow

- Installation must show:
  - what will be created
  - which policies will be required
  - which connectors must be configured
  - which autonomy levels are supported
  - which evaluation evidence is attached

### 8.3 Rollout

- Installed packs must support:
  - draft install
  - test tenant rollout
  - canary rollout
  - freeze
  - rollback

### 8.4 Deployment memory and pack evolution

- After installation or rollout, the exchange should retain machine-readable memory about:
  - tenant or environment class
  - supported workload family
  - outcome quality
  - support incidents
  - required manual interventions
  - useful operator tuning notes
- Packs with stronger outcome memory should surface their proven deployment patterns before newer but less proven variants.
- Rollout feedback should be reusable for future pack revisions, benchmark packs, and policy pack tuning.
- Compatibility checks should consider not only static requirements but also whether a pack has historically performed well in the target environment.

---

## 9. Acceptance criteria

1. A tenant can install a reusable operational pack without manually wiring every underlying asset by hand.
2. The exchange can show trust labels, prerequisites, and evaluation scorecards before install.
3. Pack installation can fail closed when connectors, policies, or rollout capabilities are missing.
4. Stable workpack and role-blueprint assets can be distributed together as one workforce pack.
5. The marketplace remains compatible with single-skill discovery while adding the broader workforce model.
6. Tenants can see which packs performed best in prior deployments and what adjustments were suggested for the next rollout.

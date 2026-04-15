# 083 - Agent Registry And Organization Model

Version: 1.0
Date: 2026-04-10
Status: Proposed
Depends-on: 075-unified-web-desktop-agent-platform, 079-autonomous-work-transformation-platform, 080-autonomous-team-monitor-and-persistent-role-agents, 064-skill-maintenance-lifecycle, 077-distributed-worker-fabric-completion
Audience: Product, Runtime, Teams, Workpack, Desktop Host, Security, Admin, QA

---

## 1. Executive summary

Feature 080 defines persistent role agents and the autonomous team monitor.
What SmartAIHub still lacks is a **registry model** that treats every agent as a governed worker with a version, scope, rollout posture, and policy envelope.

Feature 083 adds that registry layer.

The registry should describe:

- who the agent is
- what kind of agent it is
- what tools and knowledge it may use
- what budget and autonomy it may consume
- what rollout ring it belongs to
- which tenants, teams, queues, or workpack families may use it

This feature intentionally covers both:

- runtime-facing agents such as planner, reviewer, approver, analyst, connector, and supervisor
- persistent business-facing role agents defined in Feature 080

The product outcome is a governed workforce registry instead of a loose pile of prompts, skills, and runtime labels.

Governance follows the SmartSpecPro tenant model:

- system admins govern registry policy across all tenants
- tenant admins govern only their own tenant
- regular users can create teams inside their tenant and select approved agents for those teams
- team-owned orchestration should stay within the owning user's tenant boundary

---

## 2. Problem statement

The repository already has many building blocks:

- skills and packages
- workpacks and benchmark tracks
- role-agent contracts
- worker/runtime identities
- feature flags and rollout controls

But those pieces do not yet resolve to one agent registry that can answer:

- which agent version is running for this queue
- what authority envelope it carries
- what tool set and memory scope it has
- whether it is in shadow, canary, supervised, or general rollout

Without a registry model, SmartAIHub risks shipping impressive agents with weak operational discipline:

- role agents and ephemeral agents drift into separate governance models
- rollout posture becomes ad hoc
- policy bindings are hard to inspect across tenants
- versioning and rollback are unclear

---

## 3. Goals

1. Make every agent a governed registry object with identity, version, scope, and rollout metadata.
2. Support multiple agent kinds without inventing separate governance systems.
3. Bind agents to tool permissions, memory scope, budget limits, and escalation rules.
4. Provide version promotion, shadow mode, canary, freeze, and rollback semantics.
5. Let tenants and teams choose approved agent families without editing raw runtime definitions.
6. Keep role agents from Feature 080 inside the same registry model as planner and reviewer style agents.

---

## 4. Non-goals

1. This feature does not replace the skill marketplace.
2. This feature does not replace workpacks as the execution unit.
3. This feature does not require every agent to be long-lived.
4. This feature does not promise arbitrary user-created agents can skip policy review.

---

## 5. Current-codebase fit

| Existing area | Current truth | Gap this feature fills |
|---|---|---|
| `apps/web/shared/roleAgentContracts.ts` | Role-agent contracts already exist | Generalize that model into a registry that covers all governed agent kinds |
| `apps/web/server/services/roleConfigurationService.ts` | Role configuration already exists | Move role configuration onto reusable registry and version records |
| `apps/web/server/services/workerDelegationService.ts` | External and delegated worker routing already exists | Bind worker selection to registered capability profiles and rollout posture |
| `apps/web/server/routers/packages.ts` | Package distribution and install concepts already exist | Reuse package/version thinking for agent manifest distribution |
| `apps/web/server/routers/tenantFeatureFlags.ts` | Tenant rollout gates already exist | Add agent-family and agent-version rollout targeting |
| `apps/web/server/services/skillStudioService.ts` | Skills can be created and improved | Keep skills as ingredients, not the only identity for the resulting agent |

---

## 6. Locked product decisions

1. **Registry identity comes before prompt text.**
   - An agent must be selected by a governed manifest, not by raw prompt assembly alone.

2. **Role agents are one agent kind, not a separate governance universe.**
   - Feature 080 should consume this registry rather than bypass it.

3. **Agent versioning must be explicit and immutable.**
   - Promotion creates a new version record with rollout metadata.

4. **Authority is attached through policy bindings, not agent labels.**
   - Naming an agent "approver" does not grant approval authority by itself.

5. **Rollout posture is first-class.**
   - Shadow, canary, supervised, frozen, and general availability must be visible on the registry record.

---

## 7. Core registry model

### 7.1 Canonical entities

| Entity | Purpose |
|---|---|
| `agent_registry` | Stable identity for one governed agent family |
| `agent_version` | Immutable executable revision |
| `agent_profile` | Human-readable purpose, owner, and operating notes |
| `agent_capability_profile` | Supported work types, reasoning modes, and connector classes |
| `agent_tool_binding` | Allowed tools and action classes |
| `agent_memory_scope` | Retrieval and memory visibility envelope |
| `agent_budget_policy` | Cost, time, and concurrency limits |
| `agent_escalation_policy` | Fail-closed escalation targets and triggers |
| `agent_rollout_binding` | Tenant, queue, team, and workpack-family targeting |

### 7.2 First-wave agent kinds

- `planner`
- `specialist`
- `reviewer`
- `approver`
- `analyst`
- `connector_operator`
- `knowledge_agent`
- `supervisor`
- `role_agent`

### 7.3 Required manifest fields

Every registered agent version must declare:

- purpose and role
- supported work domains
- supported tool classes
- disallowed action classes
- memory scope
- budget policy
- approval requirements
- escalation triggers
- rollout posture
- owning team

---

## 8. Functional requirements

### 8.1 Versioning and rollout

- The system must support `draft`, `shadow`, `canary`, `supervised`, `general`, and `frozen` rollout states.
- Tenant targeting must support:
  - specific tenant allowlists
  - team targeting
  - queue targeting
  - workpack-family targeting
- Rollback must preserve the previous stable version pointer.

### 8.2 Policy and budget binding

- Agents must bind to tool and action policies through explicit records, not implied naming.
- Budget policy must support:
  - per run
  - per hour
  - per queue
  - per tenant
- Changes that widen tool scope, data scope, or budget must force review.

### 8.3 Registry-driven selection

- Workpacks, role routines, and runtime routers must resolve agents from the registry rather than from freeform labels alone.
- If no eligible version matches the tenant, workpack family, policy, and rollout posture, selection must fail closed.

### 8.4 Auditability

- The system must record:
  - which registry identity was selected
  - which version was resolved
  - why that version was eligible
  - which policies and budgets were attached

---

## 9. Relationship to other features

| Feature | Boundary |
|---|---|
| Feature 079 | Workpack chooses what work should execute |
| Feature 080 | Role agents own recurring responsibility |
| Feature 083 | Registry decides what governed agent identities exist and which version is eligible |

---

## 10. Web and desktop responsibilities

### 10.1 Web control plane

- Web should own the server-canonical `agent_registry`, `agent_version`, rollout bindings, policy bindings, and tenant eligibility decisions.
- Admin and operator surfaces for agent selection, rollout, freeze, rollback, and audit inspection should live primarily in the web control plane.
- Registry resolution used by workpacks, queues, and role routines should be computed from web-side policy and rollout state even when execution later happens on desktop.

### 10.2 Desktop host and local runtime

- Desktop Host should consume eligible registry records to materialize local-capable agent bundles, Pi integrations, Agency Swarm packages, or governed local connector adapters.
- Desktop should report local capability posture, package compatibility, and materialization status back to the registry-driven rollout model instead of inventing local-only agent identities.
- Local execution should only use agent versions that were resolved or approved under the shared registry contract.

### 10.3 Shared contracts and sync

- Web and desktop must share one manifest and capability-profile contract so an agent selected for local execution carries the same role, scope, tool class, budget posture, and rollout state on both surfaces.
- Registry sync must preserve fail-closed behavior when desktop is stale, missing a required package, or outside its approved rollout ring.
- Any local materialization or runtime health signal must feed back into the shared registry and rollout posture rather than remaining a desktop-only compatibility hint.

## 11. Acceptance criteria

1. A role agent from Feature 080 can be resolved from the same registry model as a planner or reviewer agent.
2. Operators can see which version of an agent is live for a given tenant or queue.
3. Tool scope, memory scope, budget policy, and escalation rules are inspectable from the registry.
4. Shadow and canary rollout can be targeted without cloning separate agent definitions by hand.
5. The platform can fail closed when no registry-approved agent version matches the requested workload.

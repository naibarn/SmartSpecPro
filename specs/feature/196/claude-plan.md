# Feature 196 Universal Goal Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert multi-channel desired outcomes into authorized, explainable, immutable Goal/Plan/Capability/Command executions that submit durable work through Feature 195.

**Architecture:** Build a typed orchestration domain around the existing capability catalog, LangGraph runtime and OpenAI Agents cognitive boundary. Command normalization produces a Goal; resolver/planner creates a revisioned Plan/Offer; policy and approval gates authorize it; the command gateway submits a Feature 195 Job. Runner, MCP and External Agent providers register capabilities but do not bypass the gateway.

**Tech Stack:** TypeScript/React, Drizzle/PostgreSQL, tRPC/router conventions, Python LangGraph/OpenAI Agents contracts, Vitest/pytest.

**Spec:** `specs/feature/196/spec.md`

## Global Constraints

- Feature 195 owns durable Job truth; Feature 196 owns Goal/Plan/Capability/Command semantics.
- Feature 197 owns local resolution/control; Feature 198 owns Chat presentation; Features 199/200 are governed capability providers.
- Server-derived tenant/actor authority, immutable revisions, bounded recursion/retry, explicit cost/quality/approval gates.
- OpenAI Agents SDK is a cognitive executor, not the platform control plane.
- Do not revive Agency, work requests/workpacks, retired `/workflows`, OpenSandbox or Docker dispatch.
- Do not run whole-repository typecheck.

## Source coverage ledger

Sections 0–16 cover product position, command normalization, identity and Goal schema; 17–46 cover capability/plugin/offer/agent abstractions and async invocation; 47–76 cover optimizer, cost, quality, explainability, replanning and handoff; 77–116 cover registry/discovery, runtime selection, multi-channel/mobile and policy; 117–156 cover UI/UX and channel contracts; 157–204 cover testing/acceptance, governance, scheduling, privacy, supply chain, lineage and resilience; 205–282 cover Runner/MCP/nested delegation/local selector/quality semantics; 283 plus trailing summary sections cover codebase alignment and final acceptance. Section files map each named heading/range to a testable task.

## Execution order

`section-01-contracts-and-command → section-02-goal-plan-persistence → section-03-capability-resolution → section-04-planner-policy-and-approval → section-05-gateway-and-ui → section-06-cross-spec-release`

### Task 1: Command, Goal, Plan and Capability contracts

**Files:** Add focused domain types/services under `apps/web/server/services/orchestration/`; reuse `orchestratorCapabilityCatalogService.ts`; add Web/Python contract tests.

Define normalized Command, channel identity, Goal, GoalRun, PlanRevision, Offer, CapabilityRequirement, Approval and DecisionRecord shapes. Define stable resolver/planner interfaces and explicit conversion to the Feature 195 Job request. No provider-specific fields may leak into the public command contract.

**Tests first:** normalization, tenant scope, malformed input, immutable revision/hash and provider-neutral Job handoff.

### Task 2: Goal/Plan persistence and revision fencing

**Files:** Modify `apps/web/drizzle/schema.ts` only after checking existing tables; add additive migration and repositories under `apps/web/server/services/orchestration/`; tests.

Persist Goals, plan revisions, capability requirements, offers, approvals and decision provenance only if no canonical equivalent exists. Add tenant/actor/status/revision indexes, idempotency constraints and retention classification. Approved plan hash and capability snapshot are immutable; replan creates a new revision.

**Tests first:** migration safety, tenant isolation, revision collision, stale approval, deletion/retention and replay.

### Task 3: Capability discovery, registry and local/provider resolution

**Files:** Modify capability catalog/resolver services and existing provider registries; add tests.

Reuse current catalog filtering, exclude retired surfaces, resolve availability/entitlement/cost/quality/topology and Runner snapshot claims. Distinguish offer identity from local implementation identity and capability claims from authorization. Support lazy hydration and safe missing/stale capability states.

**Tests first:** retired filtering, ACL, stale snapshot, user-owned tool policy, provider availability, topology/data locality and capability ranking.

### Task 4: Planner, optimizer, policy, approval and nested delegation

**Files:** Add/modify planner/compiler/optimizer/policy services under `apps/web/server/services/orchestration/`; integrate LangGraph nodes and existing agent runtime; tests.

Compile a deterministic explainable plan, enforce cost ceilings/unknown cost, quality profiles, approval propagation, recursion/deadlock/depth budgets, manual/hybrid handoff and control semantics. OpenAI Agents may reason over selected capabilities but cannot choose unauthorized tools or submit work directly.

**Tests first:** ambiguity clarification, plan alternatives, policy deny, cost unknown, quality evaluator unavailable, approval race, nested cycle/resource wait and explicit executor switch.

### Task 5: Command gateway APIs and UI

**Files:** Add/modify Web router(s), Chat/Assistant integration and plan/approval components; tests.

Expose command submission, preview, clarification, approval, cancel/replan and explainability through existing route conventions. Return durable Job handles from Feature 195. Keep mobile/tablet channels semantically equivalent.

**UI/UX Contract:** Target user is an end user stating an outcome from `/chat`, Assistant Side Panel or another authorized channel. Reuse current Chat plan/task/approval and capability chip patterns; diverge only for a capability-specific detail view. Inventory command entry, clarification, plan card, approval card, live task card and why/decision view. State matrix covers loading, empty, error, success, partial, disabled, selected, hover and focus. Responsive matrix covers mobile 390×844, tablet 768×1024, laptop 1024×768 and desktop 1440×900. Keyboard flow, semantic labels, visible focus, contrast and reduced motion are required. Thai/English copy must distinguish preview/approved/running/failed/unknown. Browser evidence is required for command → preview → approval → Job state.

### Task 6: Cross-spec integration and release gates

**Files:** Add contract matrix tests/docs under `docs/operations/feature-196` and integration tests for Features 195, 197, 198, 199 and 200.

Verify event correlation, plan hash/idempotency, Job handoff, Runner control requirements, MCP/Agent capability attenuation, context/assets provenance, result inbox and degraded-mode behavior. Record migration/rollback and mixed-version compatibility; no retired path is added.

## Definition of done

Every source heading is mapped, a user request can reach a durable Feature 195 Job only after policy/approval, capability and plan provenance are preserved, focused Web/Python tests pass, UI contracts are verified and no duplicate control plane exists.


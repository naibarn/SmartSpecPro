# Implementation Plan

## Objective

Add a hybrid agency-runtime architecture that preserves existing Agency Swarm behavior, introduces a SmartSpecPro-owned canonical IR and subgraph model, and lets opted-in agency versions lower selected subgraphs to Google ADK 2.0 without touching the separate LangGraph workflow editor runtime.

## Current-codebase fit

- The requested node vocabulary already exists on the Agency Builder side, so the feature should extend that system rather than create a second authoring surface.
- Current agency persistence is normalized and already versioned, which favors additive metadata plus an assembled document/IR in the service layer.
- Current Agency Swarm execution already passes through a bridge/adapter boundary, so adding an ADK adapter is feasible if SmartSpecPro owns compile planning and bridge execution.
- Current run-result, trace, version, and artifact surfaces already exist, so hybrid execution should normalize into those contracts instead of inventing ADK-only public outputs.
- The generic workflow editor is a protected neighboring system and should be covered by non-regression checks, not refactored into this feature.

## Proposed workstreams

### 1. Document model and persistence uplift

- Add hybrid-capable agency metadata:
  - `documentVersion`
  - `defaultEngine`
  - `compileMode`
  - `compatibilityMode`
- Add subgraph persistence and compile-artifact persistence.
- Upgrade `agency_versions.snapshotJson` so hybrid versions store the full assembled Agency Document v2.
- Assemble a stable Agency Document v2 from the current normalized tables and snapshots.
- Keep `subgraph` as document metadata and `start`/`end` as synthetic compile semantics rather than new persisted phase-1 node rows.

### 2. Canonical IR and compile planner

- Build a canonical agency IR that normalizes nodes, edges, subgraphs, and runtime metadata.
- Add validation for:
  - legacy compatibility
  - engine capabilities
  - cross-engine boundary requirements
  - schema/contract mismatches
- Add compile preview and diagnostics output for the web layer.

### 3. Runtime adapters and hybrid orchestration

- Keep the existing Agency Swarm adapter as the compatibility path.
- Add a new ADK 2.0 adapter that lowers:
  - deterministic subgraphs to ADK graph workflows
  - loop-heavy or richer control flow to ADK dynamic workflows
- Add a SmartSpecPro-owned bridge runner and hybrid execution runner.
- Keep phase-1 ADK execution in-process inside the Python backend instead of registering it as a worker-runtime family.
- Add billing normalization so ADK, Agency Swarm, and bridge steps reconcile into existing `creditsUsed`, `stepAttemptSnapshots`, and trace cost surfaces.
- Add artifact publication wiring so hybrid outputs flow through `agency_run_artifacts` plus existing library/indexing paths.
- Extend trace persistence to include subgraph and boundary metadata.

### 4. Agency Builder UX

- Add engine badges and subgraph containers.
- Add boundary node support and diagnostics drawer.
- Add compile preview and legacy compatibility banner.
- Add upgrade-to-hybrid flow that creates a new agency version rather than mutating legacy agencies in place.

### 5. Rollout, test, and guardrail layer

- Add feature flag `agencyHybridAdk`.
- Keep ADK disabled by default.
- Add golden compatibility tests for legacy agencies.
- Add security hardening for SSRF/egress enforcement, encrypted secrets, trace scrubbing, signed uploads, and an operational kill switch.
- Add billing/artifact regression coverage to prevent double-charge and artifact-publication drift.
- Add explicit generic-workflow non-regression tests so the LangGraph workflow stack remains untouched.

## Affected areas

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routers/agency.ts`
- `apps/web/server/services/agencyBridge.ts`
- `apps/web/server/services/agencyTraceService.ts`
- `apps/web/server/services/library*`
- `apps/web/shared/featureFlags.ts`
- `apps/web/client/src/pages/AgencyBuilder.tsx`
- `apps/web/client/src/components/agency/*`
- `python-backend/app/services/agency_swarm_adapter.py`
- new Python services for IR, compile planning, ADK lowering, and hybrid runtime orchestration
- existing Python agency service/test surfaces

## Recommended new modules

- `python-backend/app/services/agency_hybrid_document.py`
- `python-backend/app/services/agency_hybrid_ir.py`
- `python-backend/app/services/agency_hybrid_compiler.py`
- `python-backend/app/services/agency_adk_adapter.py`
- `python-backend/app/services/agency_bridge_contracts.py`
- `python-backend/app/services/agency_hybrid_costs.py`
- `python-backend/app/services/agency_hybrid_runner.py`

These names are recommendations, not hard requirements. The key requirement is clean separation between:

- document assembly
- canonical IR
- compile validation/planning
- engine-specific lowering
- bridge execution

## Risks and mitigations

### Risk: ADK 2.0 Alpha changes behavior

- Mitigation:
  - keep ADK behind feature flags
  - keep wrapper artifacts stable inside SmartSpecPro
  - do not expose ADK as the default runtime

### Risk: legacy agency behavior regresses

- Mitigation:
  - preserve Agency Swarm as the legacy default
  - add golden compatibility tests
  - auto-wrap old agencies into a single root subgraph

### Risk: generic workflow runtime is accidentally impacted

- Mitigation:
  - treat generic workflow routes/compiler/runtime as a protected boundary
  - add explicit regression checks for `workflow.ts` and `langgraph_runtime.py`

### Risk: current normalized storage and future subgraph model drift apart

- Mitigation:
  - define one assembled Agency Document v2 as the source of compile truth
  - keep snapshots/version history aligned to that document

### Risk: hybrid retries double-charge credits or lose cost attribution

- Mitigation:
  - normalize billing events through one idempotent reconciler keyed by run/subgraph/source event
  - assert compatibility with existing `agencyBridge.ts` result surfaces in tests

### Risk: hybrid artifacts bypass SmartSpecPro governance

- Mitigation:
  - route all publishable artifacts through `agency_run_artifacts` and existing library/indexing paths
  - require signed uploads or managed storage helpers for runtime-generated files

### Risk: ADK alpha expands the external attack surface

- Mitigation:
  - inherit SSRF, egress, secret-encryption, and trace-scrubbing controls from existing agency security requirements
  - keep ADK behind tenant flag and operational kill switch

## Acceptance criteria

- A hybrid-capable agency spec exists with clear compile, runtime, and migration rules.
- The implementation plan identifies concrete repo areas to modify.
- The plan preserves current Agency Swarm and LangGraph boundaries.
- ADK 2.0 usage is explicitly constrained by rollout and compatibility guardrails.
- The plan defines how billing, artifacts, version snapshots, and security controls stay aligned with existing platform contracts.

## Rollout note

The safest rollout sequence is:

1. internal compiler + IR only
2. internal hybrid runtime with ADK hidden
3. compile preview and diagnostics for internal teams
4. design-partner beta behind tenant flag
5. broader opt-in after legacy compatibility proof

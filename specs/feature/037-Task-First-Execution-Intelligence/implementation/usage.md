# Task-First Execution Intelligence — Usage Guide

## Overview

This feature introduces a **planner-driven execution model** where every task (chat, skill, media, agency) is classified, planned, and routed through a unified system that tracks model selection, billing, and artifact linkage.

## Architecture

```
User Request → TaskExecutionPlanner → ModelResolver → Execution Path
                     │                      │              │
                     ▼                      ▼              ▼
               TaskRunStore          StepAttempts     ArtifactRouter
               (plan JSON)          (snapshots)     (direct/pipeline)
                                                          │
                                                          ▼
                                                   AgencyEscalation
                                                   (if complex + agents)
```

## Key Modules

### Section 01: Runtime Correction (`skillExecutionPolicy.ts`)
- Skills resolve their model from `executionPolicy` in skill.md frontmatter, NOT the conversation model
- `resolveModelForSkill()` checks skill policy first, falls back to conversation model

### Section 02: Capability Registry (`capabilityRegistry.ts`)
- `loadEnabledModelsWithCapabilities()` — loads models with capability flags from DB
- `filterModelsByCapabilities()` — filters by requirements (supportsResponses, structured output, etc.)
- `resolveModelsForPolicy()` — orders models by policy mode (fixed, requirements, hybrid)

### Section 03: Task Planner & Billing
- **`taskExecutionPlanner.ts`** — `buildExecutionPlan()` creates immutable frozen plans
- **`modelResolver.ts`** — `resolveModelFromPlan()` selects model by strategy (cheapest/fastest/best)
- **`taskRunStore.ts`** — `createTaskRun()`, `createStepAttempt()`, `completeStepAttempt()`, `buildBillingMetadata()`

### Section 04: Artifact Router (`artifactRouter.ts`)
- `classifyArtifactIntent()` — determines if output is chat_reply, research_report, presentation_deck, or media_prompt
- `selectExecutionRoute()` — routes to `direct_completion` or `deterministic_pipeline`
- `linkArtifactToTaskRun()` — links presentation/message artifacts back to task runs

### Section 05: Agency Integration (`agencyEscalation.ts`)
- `shouldEscalateToAgency()` — pure decision function for agency escalation
- `buildAgencyTaskMetadata()` — builds metadata for Node→Python transport
- `AgencyBridge` propagates task_run_id, strategy, requirements, budget to Python
- Python `ExecutionContext` carries planner metadata through the orchestrator graph

## Feature Flags

| Flag | Scope | Purpose |
|------|-------|---------|
| `PLANNER_AGENCY_ESCALATION_ENABLED` | Global / Tenant | Enable planner-driven agency escalation |
| `PLANNER_AGENCY_ESCALATION:skill` | Per-task-type | Enable for skill tasks only |
| `AGENCY_SWARM_ENABLED` | Global | Enable agency feature (existing) |
| `AGENCY_ORCHESTRATOR_ENABLED` | Global (env) | Enable graph-walking orchestrator (existing) |

Use `getTenantFeatureFlag()` / `setTenantFeatureFlag()` from `featureFlags.ts` for tenant-scoped control.

## Rollout Strategy

1. **Phase 1**: Deploy with `PLANNER_AGENCY_ESCALATION_ENABLED=false` (default off)
2. **Phase 2**: Enable per-tenant for testing: `setTenantFeatureFlag("PLANNER_AGENCY_ESCALATION_ENABLED", "tenant-id", true)`
3. **Phase 3**: Enable globally: `setFeatureFlag("PLANNER_AGENCY_ESCALATION_ENABLED", true)`
4. **Phase 4**: Enable per-task-type rollout for granular control

## Telemetry

All planner decisions are logged with structured fields:
- `agency_run_with_planner_metadata` — Python endpoint receives task metadata
- `agency_orchestrator_with_planner_context` — Orchestrator starts with planner context
- Task runs store `planJson`, `artifactIntent`, `executionRoute`, `routeReason`
- Step attempts store `resolvedModelSnapshot`, `effectiveModel`, `provider`, `strategy`

## Commits

| Section | Commit | Summary |
|---------|--------|---------|
| 01 | d769b71 | Runtime correction — skill policy model resolution |
| 02 | 6b224b0 | Capability registry and skill policy |
| 03 | 89fad880 | Task planner and billing foundation |
| 04 | 3f8b0bb9 | Direct artifact execution routing |
| 05 | a3b1ad19 | Agency integration and rollout |

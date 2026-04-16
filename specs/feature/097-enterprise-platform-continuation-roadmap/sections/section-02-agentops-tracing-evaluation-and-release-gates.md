# Section 02: AgentOps Tracing, Evaluation, And Release Gates

## Purpose

Add end-to-end observability and release control for the enterprise platform layers. This phase makes runtime activity replayable, evaluable, and safe to promote.

## Goals

- propagate trace IDs through Work OS, Teams, and runtime events
- capture replayable execution summaries and evidence links
- support shadow/canary evaluation before broader rollout
- make release gates explicit, explainable, and machine-readable

## Required Outcomes

- trace IDs flow through the full runtime path
- replay reproduces the same ordering and key decisions as the original execution
- evaluation results link back to the durable execution evidence
- release gates can block unsafe promotion and explain why

## Implementation Notes

- tie traces and evaluation outputs to the durable plan and execution ledger
- redact secrets and sensitive data before export or replay when policy requires it
- keep trace / replay payloads durable but bounded by retention policy
- use readable summaries for humans and structured fields for automation

## Primary Codebase Touchpoints

- `apps/web/server/services/monitoringService.ts`
- `apps/web/server/services/workOsService.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
- `apps/web/client/src/pages/AdminWorkOsDashboard.tsx`

## Security Requirements

- redact policy-sensitive data from replay exports where required
- keep trace access tenant-scoped
- avoid turning observability artifacts into an alternate source of truth
- ensure release gates cannot be bypassed by UI-only state

## Test Plan

- trace IDs propagate across the runtime path
- replay shows the same event ordering as the original execution
- shadow/canary evaluation produces pass/fail with linked evidence
- unsafe promotion is blocked with a readable explanation

## Dependencies

- Depends on Section 01 for governed context and trust boundaries
- Unblocks installable pack governance and enterprise readiness metrics

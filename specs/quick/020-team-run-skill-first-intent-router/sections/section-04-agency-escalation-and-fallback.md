# Section 04 — Agency Escalation and Fallback

## Goal

Define when a room or run escalates into `agency`, and keep the old direct-LLM path only as emergency fallback.

## Ownership boundaries

- Owns agency escalation thresholds and fallback gates
- Owns route observability for escalations / fallback usage
- Does not redesign agency runtime internals

## Target files

- `apps/web/server/services/roomIntentRouter.ts`
- `apps/web/server/services/teamRunAgencyAdapter.ts` (new or folded into existing services)
- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/services/teamOrchestrationBridge.ts`
- `python-backend/app/services/team_orchestrator.py`

## Required behavior

- escalate to `agency` on complex / multi-step turns
- prevent infinite re-escalation loops
- gate raw direct fallback behind feature flag
- audit every fallback and escalation

## Observability requirements

Log / persist:

- `executionRoute`
- `selectedSkillId`
- `agencyEscalated`
- `agencyEscalationReason`
- `usedDirectLlmFallback`
- `fallbackReason`

## Rollout rules

- phase 1: enable room intent router and discussion skill
- phase 2: enable skill-first run engine with fallback still on
- phase 3: turn off direct fallback for selected tenants / environments

## Done when

- agency escalation is explicit and inspectable
- direct Python path is no longer required for ordinary team runs

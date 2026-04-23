# Section 07: Team Runtime Integration

## Purpose

Wire Team run execution to the shared OpenAI Agents runtime while preserving deterministic, auditable, plan-driven progression.

This is the most important product section. The runtime must execute every mandatory step according to the locked plan before completion, or record an explicit terminal reason explaining why it could not.

## Depends On

- `section-01-shared-contracts-flags`
- `section-02-persistence-migrations`
- `section-03-python-openai-agents-adapter`
- `section-04-node-runtime-client`
- `section-05-skill-capability-manifests`

## Blocks

- Ledger/UI debug
- Rollout and replay gates

## Files Owned By This Section

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`
- `apps/web/server/services/agentRuntime/teamRuntimeOrchestrator.ts`
- `apps/web/server/services/agentRuntime/teamPlanRuntime.ts`
- `apps/web/server/services/agentRuntime/teamStepRuntime.ts`
- `apps/web/server/services/agentRuntime/teamReviewRuntime.ts`
- `apps/web/server/services/agentRuntime/teamAttemptBudget.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsRuntime.test.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsPlanGate.test.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsStepProgression.test.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsRepairLoop.test.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsAttemptBudget.test.ts`
- `apps/web/server/services/__tests__/teamOpenAiAgentsReplay.test.ts`

## Team Runtime Flow

On run start:

1. Resolve runtime selection and freeze it on the run.
2. Load room objective, resolved room member roster, and persona/member identity data.
3. Generate or load durable plan artifact.
4. Persist plan artifact before owner execution.
5. Review plan artifact.
6. If plan review passes, mark plan ready for execution.
7. If plan review fails, persist failed verdict and stop/pause without fallback plan.

During execution:

1. Load current locked plan step.
2. Build owner runtime request bound to the locked step owner member/persona assignment.
3. Run owner step through SDK runtime.
4. Persist owner result, artifacts, selected skill/model/gateway route, and trace links.
5. Build reviewer runtime request bound to the locked step reviewer member/persona assignment.
6. Persist structured review verdict.
7. Apply verdict:
   - `pass`: advance serial step only after persistence succeeds
   - `needs_repair`: retry same step with explicit repair instructions
   - `blocked`: persist checkpoint/approval and stop advancement
   - `fail`: stop or escalate according to policy
8. Complete only when every mandatory step has owner output and reviewer pass.

## Plan Artifact Requirements

Every plan step must have:

- step key
- title
- objective
- deliverable
- owner member/persona
- reviewer member/persona
- owner member id / persona id and display label
- reviewer member id / persona id and display label
- verification method
- retry rule
- evidence requirements
- quality criteria
- review checklist

The runtime may not invent a replacement plan during step execution.

Every owner/reviewer assignment must resolve to a real room member snapshot. If the step assignment cannot be resolved to the current roster, the run must fail readiness rather than silently substituting another persona.

## Serial Step Gate

The next serial step may not start while current step is:

- `in_progress`
- `in_review`
- `needs_repair`
- `awaiting_approval`
- missing persisted owner output
- missing reviewer verdict
- reviewer verdict not `pass`

## Repair Loop

Every repair attempt:

- stays on same step
- references the prior review verdict
- includes explicit required fixes
- increments attempt number
- persists new owner result
- persists new review result
- keeps prior failed evidence visible

No repair attempt may overwrite prior attempt evidence.

## Attempt Budget

Compute minimum guaranteed budget before execution:

- one owner attempt per mandatory step
- one reviewer attempt per mandatory step
- configured repair allowance per step

If global caps are lower:

- adjust effective cap when policy allows, or
- reject the run configuration before execution starts

The run must not stop early with generic max-round reason before every mandatory step is attempted.

## Terminal Reasons

Use stable terminal reasons:

- `plan_completed`
- `plan_incomplete_cap_reached`
- `step_failed_retry_exhausted`
- `review_failed_retry_exhausted`
- `approval_required`
- `approval_rejected`
- `budget_exhausted`
- `timeout_step`
- `timeout_run`
- `tool_denied`
- `permission_mismatch`
- `gateway_unavailable`
- `runtime_error`
- `rollback_forced`

Do not use ambiguous `max_rounds_reached` as a final SDK Team reason.

## TDD Tests To Write First

Plan gate tests:

- Test plan artifact persisted before owner execution.
- Test plan review pass required before execution.
- Test failed plan review persists verdict and no fallback plan.
- Test missing owner/reviewer/deliverable/evidence/checklist fails plan readiness.

Step progression tests:

- Test current step cannot advance without owner output.
- Test current step cannot advance without reviewer verdict.
- Test current step cannot advance unless reviewer verdict is `pass`.
- Test step progression follows plan order.
- Test parallel group behavior only allowed when plan explicitly marks parallel group.

Owner execution tests:

- Test owner request uses locked step objective.
- Test owner request uses Feature 099 Team context pack with project/room/run state and scoped memory refs.
- Test owner request includes the locked owner member/persona ids and the room roster snapshot.
- Test owner request includes allowed skills/tools only.
- Test owner result persists selected skill/model/gateway metadata.
- Test owner result persists actor member/persona identity matching the locked plan assignment.
- Test room message metadata links step key, attempt id, trace id.

Review tests:

- Test reviewer request includes deliverable, evidence requirements, quality criteria, checklist, and prior attempts.
- Test reviewer request includes the locked reviewer member/persona ids from the plan step.
- Test pass verdict advances step after persistence.
- Test needs-repair verdict persists repair instructions.
- Test blocked verdict persists checkpoint/approval.
- Test fail verdict records terminal reason.

Repair tests:

- Test repair references prior verdict.
- Test repair increments attempt count.
- Test repair remains on same step.
- Test prior evidence remains visible.
- Test retry exhaustion records explicit terminal reason.

Attempt budget tests:

- Test minimum budget derived from plan.
- Test too-low global cap rejected or adjusted before execution.
- Test every mandatory step attempted before cap terminal stop.
- Test incomplete terminal reason is `plan_incomplete_cap_reached`.

Completion tests:

- Test complete requires all mandatory steps pass.
- Test final result row persisted before `plan_completed`.
- Test old legacy stop reasons do not mark SDK run complete.

Replay tests:

- Replay known problematic Team room and verify all plan steps attempted.
- Replay repair loop and verify owner/reviewer/repair evidence visible.

## Implementation Notes

- Keep `runEngine` as the lifecycle authority.
- The SDK executes and reviews steps; Node advances steps.
- Do not infer pass/fail from prose.
- Do not hide SDK failure with per-step legacy fallback.
- Preserve legacy behavior when runtime flags are disabled.
- Do not let the SDK adapter invent owner/reviewer personas outside the locked room roster and plan artifact.

## Acceptance Criteria

- Team has durable plan before execution.
- Every step has owner result and reviewer verdict.
- Every step preserves owner/reviewer member+persona identity from plan to result to review projection.
- Repair loop is explicit and auditable.
- Team cannot complete until all mandatory steps pass.
- Early stop records explicit non-success terminal reason.
- Existing Team behavior remains default with flags disabled.

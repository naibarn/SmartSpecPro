# Section 10: Ledger, UI, And Debug Surfaces

## Purpose

Expose the richer runtime state through the existing Team ledger and UI/debug surfaces so users can compare plan vs execution and audit each step, while also exposing Responses/shared-skill runtime metadata through existing debug/admin surfaces.

This section should not invent a new Team UI model. It should enrich the existing ledger/panel data contract and keep legacy rooms safe.

## Depends On

- `section-01-shared-contracts-flags`
- `section-02-persistence-migrations`
- `section-04-node-runtime-client`
- `section-07-team-runtime-integration`
- `section-08-responses-runtime-integration`
- `section-09-shared-skill-runtime-integration`

## Blocks

- Rollout and release gates

## Files Owned By This Section

- `apps/web/server/services/autoTeamLedgerService.ts`
- `apps/web/server/routers/teamRoom.ts`
- `apps/web/client/src/components/orchestrator/AutoTeamLedgerPanel.tsx`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- existing Team plan side panel component, or create `apps/web/client/src/components/orchestrator/TeamPlanSidePanel.tsx`
- ledger/UI tests matching existing project conventions

## Ledger Data Requirements

Expose:

- runtime engine
- runtime mode
- SDK version
- adapter version
- plan artifact id
- plan digest
- plan steps
- current step
- owner/reviewer member ids and persona ids or null-safe labels per step
- owner result per step
- reviewer verdict per step
- repair attempts per step
- trace links
- checkpoint links
- selected skill/model/gateway route
- terminal reason
- latest runtime error

## Plan Panel Requirements

The plan panel must show persisted plan steps as soon as a plan artifact exists.

Each step should show:

- step number/key
- title
- status
- owner
- reviewer
- owner member/persona identity with stable id when available
- reviewer member/persona identity with stable id when available
- deliverable
- evidence requirements
- quality criteria
- review checklist
- latest owner result link
- latest reviewer verdict link
- latest repair attempt count
- trace link
- step-specific chat/execution jump links that are distinct from the plan-summary link

If execution evidence has not caught up:

- show "plan visible, execution evidence pending" or equivalent
- do not show "no audited plan steps captured" when the chat-visible plan exists

## Step-Link Schema Requirements

The ledger DTO and plan side panel must use an explicit step-link schema, not inferred text matching.

Each step-link payload must support:

- `linkType`
- `stepKey`
- `attemptId`
- `messageId`
- `traceId`
- `checkpointId`
- `anchorId`
- `label`
- `isPrimary`
- `status` (`available` or `pending`)

Required link types:

- `plan_summary`
- `plan_step`
- `owner_result`
- `review_result`
- `repair_result`
- `checkpoint`
- `terminal_result`
- `execution_trace`

## Chat Line Links

Plan step cards should link to:

- plan summary message
- plan-step anchor inside the plan summary when available
- owner result message for the step
- reviewer verdict message for the step
- repair attempt messages for the step
- terminal/final result message

Clicking a link may scroll/focus once, but must not lock the scroll position, repeatedly force focus, or prevent the operator from manually continuing to scroll after the jump.

## Legacy Compatibility

For old rooms/runs:

- show `legacy runtime`
- null-safe runtime metadata
- no crash when `runtimeStateJson` is null
- no crash when plan artifact missing
- safe empty state for step links

## Chat/Team Debug Visibility

Where appropriate, expose:

- active Chat persona id/display label/provenance for Chat runtime debug surfaces
- selected skill and explanation
- selected model/provider/gateway route
- SDK/adapter version
- terminal reason
- redacted error code

Responses/shared-skill debug/admin views should also expose where appropriate:

- selected skill and explanation
- schema validation status
- selected model/provider/gateway route
- checkpoint status
- terminal reason

Do not expose:

- raw tokens
- provider keys
- signed URLs
- raw SDK traces
- connector credentials

## TDD Tests To Write First

Ledger service tests:

- Test ledger DTO exposes runtime engine/mode/version.
- Test ledger DTO exposes plan artifact/digest.
- Test ledger DTO exposes step owner/reviewer/deliverable/checklist.
- Test ledger DTO links owner result and review verdict.
- Test ledger DTO includes explicit `plan_step`, `owner_result`, `review_result`, and `repair_result` links when those records exist.
- Test repair attempts are grouped under the correct step.
- Test terminal reason appears when run incomplete.
- Test legacy run with null runtime fields maps safely.

UI tests:

- Test plan panel renders persisted plan before execution evidence.
- Test execution evidence pending state appears when traces lag.
- Test step card shows owner/reviewer/deliverable/checklist.
- Test step card shows persona labels and member ids when both exist.
- Test step card links to plan, owner result, reviewer verdict, and repair messages when present.
- Test step card does not collapse every step link to the plan summary link.
- Test clicking link does not create focus/scroll lock.
- Test old run with missing runtime state does not throw.
- Test Responses/shared-skill debug DTOs render runtime metadata without null-reference failures.

Security/UI redaction tests:

- Test token-like values are not rendered.
- Test signed URLs are not rendered in debug panels.
- Test raw SDK trace payload is not rendered.

## Implementation Notes

- Prefer server-side DTO shaping over heavy UI inference.
- The UI should not parse free-form prose to determine step status.
- Use persisted IDs and metadata links.
- Do not synthesize step execution links by searching for matching text in the conversation transcript.
- Keep new UI states readable in Thai/English localization patterns used by the app.

## Acceptance Criteria

- User can see plan and execution side by side.
- User can jump from a plan step to the relevant conversation/evidence lines.
- User can see which persona/member owned and reviewed each step without text inference.
- User can tell pass/fail/repair/block per step.
- Legacy rooms remain safe.
- Debug UI reveals useful runtime metadata without secrets.

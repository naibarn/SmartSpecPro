# Section 01 - Intake Review and Compiled Brief

## Goal

Keep Work Request review-first while making the request richer and more reusable by attaching explicit upstream sources and generating a governed `CompiledWorkBrief`.

## Ownership boundaries

- Work OS request schema and router inputs
- Work Request UI
- Chat-to-request entry points
- Source-link normalization and validation
- Compiled brief generation only

This section does not change Team kickoff yet.

## Current touchpoints

- `apps/web/server/routers/workOs.ts`
- `apps/web/server/services/workOsService.ts`
- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`
- `apps/web/client/src/pages/Chat.tsx`

## Deliverables

1. Add shared schema definitions for:
   - intake source refs
   - compiled work brief
   - source diagnostics
   - selected source ids
   - source trust/freshness state
   - `WorkIntakeActorContext`
2. Add `workIntakeBriefService` that resolves linked sources into a compiled brief.
3. Add `workIntakeActorContext` derivation at the Work OS router boundary so source resolution never relies on hidden global actor state.
4. Extend Work Request UI to:
   - display linked conversations/docs/workpacks/routines
   - show compiled brief preview before launch
5. Add a chat entry point that opens Work Request with conversation linkage prefilled.

## Interfaces produced

- `WorkIntakeActorContext` carries `tenantId`, `actorUserId`, `requesterUserId`, roles, domain, private-vault unlock state, source-scope permissions, and preview access level.
- `workIntakeSourceResolver.resolveWorkIntakeSources(input)` returns normalized source refs plus inclusion/omission diagnostics.
- `workIntakeBriefService.compileWorkBrief(input)` returns a `CompiledWorkBrief` compatible with `apps/web/shared/workOrchestrator.ts`.
- Work OS request projection exposes linked source ids in a shape usable by `resolvePreflightPreview`.

## Interfaces consumed by later sections

- Section 02 consumes normalized source refs, trust/freshness state, actor context, and compiled brief source diagnostics.
- Section 03 consumes the compiled brief and selected source ids to generate approval snapshots and a preflight fingerprint.
- Section 07 consumes brief diagnostics for the Work Request UI.

## Implementation notes

- Reuse existing `linkedConversationIds`, `linkedWorkpackRunIds`, and `linkedRoleRoutineRunIds`.
- Do not auto-start automation from this section.
- Keep the source list explicit and user-visible.
- Derive actor context from authenticated server context only. Client payloads may request source refs but may not declare trusted tenant, role, unlock, or permission fields.
- Source resolution must apply tenant/RBAC/private-vault checks using the actor context and emit omission diagnostics instead of silently fetching inaccessible data.

## Tests to add first

- Work OS router input/validation tests for source refs
- actor-context derivation tests for requester, admin, domain-admin, private-vault locked, and private-vault unlocked paths
- compiled brief service contract tests
- Work Request UI tests for linked-source display and brief preview
- source resolver tests for malformed, locked, unauthorized, omitted, and over-budget sources
- regression test that request creation still does not auto-run automation

## Done when

- A request can show exactly which upstream sources are linked and which were omitted.
- Source resolver behavior is deterministic for the same `WorkIntakeActorContext` and source inputs.
- The compiled brief is deterministic for the same source inputs.
- Secret-bearing source material is redacted before persistence or preview.
- The launch flow still requires a separate review/approval action.

## Risks

- Over-fetching too much chat context
- unclear precedence between title/objective and linked-source summaries

## Mitigations

- introduce explicit token and snippet budgets for source extraction
- make the compiled brief show what was included and what was omitted

## Implementation update

- 2026-04-21: wired the chat-to-request launch path to open Work Request with `linkedConversationIds`, `sourceType=chat`, and `sourceRef` prefilled when a conversation is active.
- 2026-04-21: extended `apps/web/client/src/pages/WorkRequest.tsx` to parse linked-source query params, render linked-source badges, and submit linked conversation/workpack/routine ids on request creation.
- 2026-04-21: added focused client coverage in `apps/web/client/src/lib/workRequestLinks.test.ts` and `apps/web/client/src/pages/__tests__/WorkRequest.test.tsx`.

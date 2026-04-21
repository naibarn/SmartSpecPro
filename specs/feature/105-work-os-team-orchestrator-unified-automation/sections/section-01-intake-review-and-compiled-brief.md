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
2. Add `workIntakeBriefService` that resolves linked sources into a compiled brief.
3. Extend Work Request UI to:
   - display linked conversations/docs/workpacks/routines
   - show compiled brief preview before launch
4. Add a chat entry point that opens Work Request with conversation linkage prefilled.

## Implementation notes

- Reuse existing `linkedConversationIds`, `linkedWorkpackRunIds`, and `linkedRoleRoutineRunIds`.
- Do not auto-start automation from this section.
- Keep the source list explicit and user-visible.

## Tests to add first

- Work OS router input/validation tests for source refs
- compiled brief service contract tests
- Work Request UI tests for linked-source display and brief preview

## Risks

- Over-fetching too much chat context
- unclear precedence between title/objective and linked-source summaries

## Mitigations

- introduce explicit token and snippet budgets for source extraction
- make the compiled brief show what was included and what was omitted

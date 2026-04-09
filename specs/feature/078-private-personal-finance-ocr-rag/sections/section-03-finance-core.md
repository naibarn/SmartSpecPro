# section-03-finance-core

## Objective

Implement the finance domain router and service for text drafts, transaction confirmation, summaries, and recurring rules.

## Scope

This section owns the business logic for finance records once text or OCR has produced a structured draft.

## Files to Change

- `apps/web/server/routers/finance.ts`
- `apps/web/server/services/financeService.ts`
- `apps/web/server/routers.ts`
- `apps/web/client/src/components/finance/*` if the chat renderer needs finance-specific cards
- recurring-job code in `apps/web/server/jobs/*` if a new finance job module is needed

## Implementation Notes

- Add `parseTextToDraft`, `parseDocumentToDraft`, `confirmDraft`, `updateDraft`, `voidTransaction`, `listTransactions`, `getDailySummary`, `getMonthlySummary`, `createRecurringRule`, `pauseRecurringRule`, `resumeRecurringRule`, and `listLinkedDocuments`.
- Keep `projectId` locked from the authenticated context instead of trusting client-side switching.
- Use structured output for draft creation so the payload is schema-valid and explicit about `confidence`, `needsClarification`, and `missingFields`.
- Make `confirmDraft` idempotent and owner/project-safe.
- Make `updateDraft` versioned so edits are predictable.
- Make `voidTransaction` repeat-safe.
- Compute summaries from confirmed transactions only, using SQL aggregation.
- Return the timezone and date range used for a summary so the UI can render the exact bucket boundaries.
- Create recurring rules so they produce drafts first by default.
- Use an explicit `auto_confirm` flag only when the user opted in.
- Keep monetary math in the service / DB layer rather than inside the LLM.

## Authorization Rules

- Personal scope is owner-only.
- Work scope uses the existing project membership and permission model.
- `confirmDraft` must verify owner, tenant, and project before committing.
- `listLinkedDocuments` must inherit the access scope of the underlying transaction or document.

## Validation

- Router tests should prove the structured draft contract.
- Service tests should prove summary numbers are database-derived.
- Authorization tests should cover every procedure in the matrix.
- Idempotency tests should prove repeated confirm calls return the same logical result.


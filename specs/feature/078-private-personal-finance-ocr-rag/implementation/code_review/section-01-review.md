# Code Review: Section 01 - Schema and Migrations

Security review found one actionable issue in the shared draft contract:

- `financeStructuredDraftSchema` exposed `projectId` in structured output, which could have let the model influence finance scope. This was fixed by removing `projectId` from the schema and deriving scope from authenticated request context instead.

Additional hardening was applied during the same pass:

- Positive-value checks were added for finance amounts at the DB layer.
- `document_extractions.page_count` now has a lower bound check.

No other blockers remained after the fix. The schema, migration ordering, and legacy compatibility coverage now match the section plan.

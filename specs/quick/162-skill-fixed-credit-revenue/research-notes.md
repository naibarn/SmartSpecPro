# Research notes

## Discovery

- SocratiCode MCP was unavailable; bounded `rg` and line-range reads were used.
- `apps/web/drizzle/schema.ts`: `skills` has `createdBy`, `tenantId`, and legacy `creditMultiplier`; `tenants` has `ownerId`; `creditTransactions` supports `skillSlug`, `sourceType`, metadata, and idempotency.
- `apps/web/server/routers/skills.ts`: admin `listFromDb`, `create`, and `update` are the authoritative admin contracts; folder sync is in `skillRegistry.ts`.
- `apps/web/server/services/creditService.ts`: atomic user deduction, `addCredits`, reservations, and `refundCredits` already exist, but are not a skill revenue settlement.
- `apps/web/client/src/pages/AdminSkills.tsx`: the current UI exposes only legacy `creditMultiplier`.
- `apps/web/client/src/pages/Credits.tsx` and `Dashboard.tsx`: user history already renders transaction metadata and amount.
- Existing media routes contain auto-refund/reconciliation paths, so integration must preserve their idempotency and avoid charging the fixed skill fee a second time.

## Risks

- Fixed skill fee can be double charged if added beside provider/model charging.
- Revenue credits can remain after a failed run unless tied to a run settlement.
- Folder sync must not overwrite admin pricing overrides.
- Missing owner must not be silently assigned to the acting user.

# Implementation plan

## Foundation

- Add integer fixed-credit columns to `skills` with DB defaults and a forward-only migration that backfills all existing rows to 2/0 without touching ownership or legacy multiplier values.
- Extend registry types and DB-to-definition projection with the fixed pricing fields.
- Ensure folder auto-sync and manual import/create use 2/0 defaults and never overwrite admin pricing on content sync.

## Billing settlement

- Add a service that resolves the skill row, tenant owner, and skill owner; validates the fixed total; performs one atomic settlement with run-scoped idempotency.
- Record user deduction metadata containing run id, skill slug, total, tenant share, skill-owner share, recipient ids, and settlement state.
- Add reversal that checks original settlement and existing auto-refund markers before creating compensating user/revenue entries.
- Reuse existing credit primitives where safe; add a transaction-scoped primitive when atomic multi-account settlement is required.

## Integration

- Identify the authoritative completion/failure boundary for each skill run family.
- Replace fixed-skill user charging at those boundaries and mark provider/model charges as included or external so they cannot double-charge the same run.
- Keep non-skill media/chat billing unchanged.

## Admin/UI

- Extend admin list/create/update contracts and the `AdminSkills` row/edit form with tenant share, skill-owner share, and total.
- Add integer validation and localized labels/help text in Thai and English.
- Keep the existing legacy multiplier visible only where compatibility needs it; fixed pricing is the source of truth for skill runs.

## Verification

- Unit tests for defaults/validation/registry preservation.
- Service tests for success, same owner, missing owner, idempotent retry, and reversal after auto-refund.
- Router/UI contract tests for admin display/edit and user history metadata.
- Run five explicit audit passes plus focused tests, formatter, `git diff --check`, and targeted TypeScript diagnostics.

## Rollout

- Local migration/schema verification only in this turn.
- Production migration, deployment, and authenticated browser verification remain separate operational gates.

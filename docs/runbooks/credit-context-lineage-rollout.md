# Credit Context Lineage Rollout

This runbook enables Feature 166 gradually. It does not run migrations or
historical backfill automatically.

## Preflight

1. Take a database backup/snapshot and record the backup ID, deploy SHA, schema
   journal head, and operator.
2. Verify the application and worker processes use the same deploy SHA and that
   Redis, database connectivity, tenant authorization, and audit logging are
   healthy.
3. Review the 0264 migration SQL, expected indexes, foreign keys, UUID defaults,
   and rollback/restore rehearsal. Never edit financial amounts or balances as
   part of this feature.
4. Confirm report queries have the tenant/type/time indexes and set
   `CREDIT_CONTEXT_MAX_EXPORT_DAYS` to an approved bounded value.

## Migration and flags

Apply `apps/web/drizzle/0264_credit_context_polymorphic_lineage.sql` through the
normal migration release process, then verify the journal and required tables
before enabling writes. Keep both flags off during canary preparation:

- `CREDIT_CONTEXT_WRITE_ENABLED=false` (default): ledger behavior is unchanged.
- `CREDIT_CONTEXT_STRICT_REQUIRED=false` (default): missing lineage is reported
  as unattributed and does not block a financial operation.

Enable `CREDIT_CONTEXT_WRITE_ENABLED=true` for a small tenant canary only after
the migration is confirmed. Enable strict mode only after the reconciliation
dashboard shows acceptable coverage and retry behavior.

## Historical backfill

Run a dry-run first. Scope by tenant/user where possible and retain the JSON
output:

```bash
npm --workspace apps/web exec tsx scripts/backfill-credit-context-lineage.ts \
  --dry-run --tenant-id <tenant> --batch-size 100
```

Review the immutable watermark, cursor, linked/skipped/deferred counts,
ownership failures, and parity totals. Use `--apply` only for an approved
canary. Use `--pause-after-batch` and resume with the returned `--run-id` if the
lease or data-quality alerts require a pause. A second active run for the same
scope must be stopped, not merged. The script only accepts authoritative
structured metadata; missing or conflicting evidence remains unattributed.

## Validation and monitoring

Run the read-only audit before and after a canary:

```bash
npm --workspace apps/web exec tsx scripts/audit-credit-context-lineage.ts
npm --workspace apps/web exec tsx scripts/audit-credit-context-callers.ts --format json --fail-on-unclassified
```

Compare report charged/refund/net/count totals with direct ledger totals at the
same watermark. Alert on cross-tenant links, multiple primary links, orphan
links, resolver drift, integrity exceptions, deferred backfill rows, report
latency, export overflow, and audit/metric failures. Metrics and logs must not
contain prompts, tokens, provider payloads, or raw display IDs.

## Restore and rollback

If the canary produces incorrect links, disable the write/strict flags and
stop backfill. Do not delete ledger rows or edit balances. Preserve the audit
output and run ID, restore the context/link tables from the approved snapshot
or use a reviewed corrective migration, then re-run parity and authorization
checks. Rehearse this procedure in staging before production.

## Evidence boundary

Local tests prove contracts, pure formatting, and static caller coverage only.
Authenticated browser evidence, a real database migration, query plans, live
provider/worker replay, staging, production backfill, and deployment evidence
must be recorded separately by the release operator.

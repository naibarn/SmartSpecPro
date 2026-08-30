# Section 01 — Schema and Shared Contracts

## Goal

Create the additive database foundation and shared TypeScript contracts used by
all later sections. The existing `credit_transactions` ledger remains the only
financial authority. Do not backfill or change balances in this section.

## Owned files

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/relations.ts` when required by existing relation style
- `apps/web/drizzle/0264_credit_context_polymorphic_lineage.sql`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/shared/creditContextContracts.ts`
- `apps/web/server/services/creditContextRegistry.ts`
- schema/contract tests adjacent to these modules

## Required implementation

Add Drizzle definitions for:

1. `creditContexts`: native UUID `id`, tenant ID, owner user ID, context type,
   namespaced source type/key, optional parent/root UUIDs, bounded live label,
   first-safe snapshot, resolver version, resolution state, attribution status,
   lifecycle state/timestamps, and created/updated timestamps. Enforce
   tenant-scoped source identity and indexes for tenant/type/root/source/state.
2. `creditTransactionContexts`: native UUID `id`, ledger transaction ID,
   context UUID, link role, provenance, confidence/reason, bounded snapshot,
   and created timestamp. Add one partial unique primary link per transaction,
   and indexes for transaction/context/tenant-safe lookups.
3. `creditContextBackfillRuns`: UUID run ID, scope, status/mode, schema and
   resolver versions, scan watermark/cursor, lease, batch size, counters,
   disposition/parity JSON, operator, and timestamps. It is operational only.
4. Add nullable `tenantId` and self-referencing nullable
   `reversalOfTransactionId` to `creditTransactions` with indexes. Existing
   null legacy rows remain valid.

Use exact native PostgreSQL `uuid` columns and `gen_random_uuid()` defaults for
all context IDs and self/FK references. Keep tenant ID as varchar(36) to match
`tenants.id`. Use bounded varchar/text/jsonb types matching repository style.

Write migration 0264 after `0263_free_plan_assignment`. It must use statement
breakpoints, compatible-object verification, additive/idempotent DDL where
safe, required checks/FKs/indexes, and no ledger scan/update. Do not add a
down migration or alter existing balances/amounts. Update journal only with the
new tag/next index and preserve unrelated entries.

Define contract unions for context types, source types, states, link roles,
provenance, safe presentation state, typed report errors, source alias
normalization, and bounded `CreditContextRef`. Persisted transaction source
values must derive from `creditSourceTypeEnum`; service aliases map to `other`.

The registry must declare each supported source type's resolver identity,
required ancestry, root/parent policy, and temporary-unavailable behavior. It
must expose an allowlist predicate; unknown context/source types are invalid
input, never SQL wildcards.

## TDD-first tests

- Schema/type tests verify table fields, UUID/default/FK/index/check parity and
  journal sequence.
- Contract tests verify persisted source enum separation and alias normalization.
- Registry tests require every entry to declare root/parent/ownership policy.
- Optional DB integration verifies tenant source uniqueness, primary-link
  uniqueness, cross-tenant FK/link rejection, and unchanged ledger amount and
  balance.

## Completion evidence

Run focused schema/contract tests and inspect the migration diff. Record that
the migration was not applied to production. Exported names used by section 02
must be stable: `CreditContextRef`, `CreditContextType`,
`CreditContextSourceType`, `PersistedCreditSourceType`, state/link/provenance
unions, and registry lookup/normalization functions.

## Implemented locally

Added the 0264 journaled migration, Drizzle schema tables/relations/indexes,
reversal and tenant columns, and shared contract/alias tests. Migration remains
unapplied in this workspace and production proof is pending.

# Section 02 — Schema and Migration

## Goal

Turn the 0277 foundation into a lifecycle-safe physical model without deleting
legacy Product tie-in data or managed media.

## Implementation

- Extend the four existing object tables with metadata, commercial policy,
  revision, approval/lifecycle, provenance, and projection ownership fields.
- Add `vertical_drama_object_reference_aliases`, durable detection suggestions/
  runs, prompt-run state, and a projection ledger with tenant/user/series and
  episode/shot indexes.
- Enforce active-aware uniqueness and canonical-asset rules with PostgreSQL
  constraints/indexes. Keep removed/archive history queryable explicitly.
- Add a safe migration after 0277 and corresponding Drizzle schema exports.
- Add an established-script-compatible dry-run/report/apply/retry backfill.
  Map only reliable legacy `productTieIn`/Marketplace Capture identities;
  preserve source JSON and report ambiguous rows.
- Use the four fail-closed capability keys in migration checks.

## Tests first

Use safe DB integration fixtures for constraints, ownership, lifecycle,
idempotent migration, legacy parity, and independent capability gates.

## Ownership and acceptance

This section owns schema, SQL migration, and migration/report scripts only. It
must not make detection or paid image generation run automatically.

## Implementation Record

Implemented in `apps/web/drizzle/schema.ts`, migration
`0279_vertical_drama_object_reference_lifecycle.sql`, and the report-first
`backfill-vertical-drama-object-references.ts` script.

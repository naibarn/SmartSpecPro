# Section-02 Code Review — 2026-07-16 (ssp-reviewer)

Verdict: fixes required (1 MAJOR, 2 MEDIUM, 1 MINOR) → all but MINOR applied.

## Foreign hunks identified in the schema.ts diff (ride-along, NOT reviewed)
- `verticalDramaCharacters` narrativeRole/roleTier/occupation/... columns —
  concurrent session's Narrative Role V2 work (its manual SQL already on
  disk). Rides along in the commit because the tree is shared; prod already
  runs this content.

## Findings
1. **MAJOR — manual_hermes_provider_connections.sql:** zero idempotency
   guards + no transaction (sibling convention: BEGIN/COMMIT, IF NOT
   EXISTS, DO $$ duplicate_object guard for CREATE TYPE). Re-run would
   error; partial failure unrecoverable. FIXED + idempotency proven by
   live re-run.
2. **MEDIUM — schema test:** only ownerUserId's DB-name literal pinned;
   a `varchar("tenant_Id")` typo would pass. FIXED: assert
   `columns[name].name === name` for all 22.
3. **MEDIUM — schema test:** plain-index test checked names only, not
   column composition/order. FIXED: assert both composites.
4. **MINOR — SQL header:** doesn't enumerate every prior manual_*.sql
   sibling by name. LET GO (generic reference is adequate).

## Clean
Schema ↔ SQL parity byte-exact (22 cols, 2 enums, FK on-delete, 4 indexes
incl. quoted-camelCase partial predicates); spec §10.1 fidelity; no
secret-bearing columns; worker-fabric family consistency.

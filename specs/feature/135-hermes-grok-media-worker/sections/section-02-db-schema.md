# Section 02 — Database Schema: `hermes_provider_connections`

Section id: `section-02-db-schema`
Plan reference: `claude-plan.md` §4 · TDD reference: `claude-plan-tdd.md` §4 · Spec reference: `spec.md` §10.1

## Goal

Add the single new table this feature introduces: `hermes_provider_connections`, which records Grok/Hermes provider connections (shared-pool, server-personal, and private-worker scopes) **without ever storing a token or secret**. Tokens live only inside the Hermes CLI profile on the worker host; this table stores connection identity, scope, status, worker assignment, capability manifest, defaults, and quota metadata. Everything else in the feature (jobs, events, artifacts) reuses the existing worker fabric tables unchanged — no other schema work happens in this section.

This is a purely additive migration. Rollback story: feature flags off; the table stays.

## Dependencies

- **section-01-shared-contracts** — provides `HermesConnectionCapabilityManifest` in `apps/web/shared/hermesMedia.ts`, used as the `$type<>` of `capabilitiesJson`. If section-01 has not landed when you start, temporarily type the column `$type<Record<string, unknown>>` and leave a `// TODO(section-01)` — but the preferred order is 01 first.
- **Blocks:** section-03 (connection service reads/writes this table), and transitively 05/06.

## Files

| Action | Path |
|---|---|
| Modify | `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` — two new pgEnums + one new pgTable + two type exports |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/hermesProviderConnections.schema.test.ts` — schema-shape tests (no DB) |
| Generated | `apps/web/drizzle/00XX_*.sql` + `drizzle/meta/_journal.json` entry (via `pnpm db:push`) |

## Existing patterns to copy

- **Table model:** `userMcpConnections` (schema.ts ~L1633) — same connection-row concept, partial-unique default indexes, no plaintext secrets. Do NOT copy its `encryptedTokenRef` / `encryptionKeyVersion` / `tokenExpiresAt` columns — hermes stores no token material at all.
- **Column-naming family:** the worker fabric (`workers` ~L13890, `workerJobs` ~L14002) uses **camelCase literal DB column names** (`varchar("tenantId")`, `integer("requestedByUserId")`). Spec §10.1 explicitly places this table in that family. Follow it: DB column name = TS property name, camelCase. Note this differs from `userMcpConnections` (snake_case DB names) — the MCP table is the *structural* model only.
- **Schema-shape test pattern:** `apps/web/server/__tests__/funnelEvents.schema.test.ts` — `getTableColumns` / `getTableName` / `getTableConfig` from drizzle-orm, importing `@db/schema`, no database connection.
- **Type-only shared import precedent:** schema.ts already does `import type { ... } from "../shared/autoTeamExecution"` — use the same style for `../shared/hermesMedia`.

## Tests first (write these before touching schema.ts)

Create `apps/web/server/server/__tests__` — correction: `apps/web/server/__tests__/hermesProviderConnections.schema.test.ts`. Run with `pnpm --dir apps/web test` (or `pnpm vitest run server/__tests__/hermesProviderConnections.schema.test.ts` from `apps/web`). All tests are pure module-shape assertions; no DB, no mocks.

```ts
import { describe, it, expect } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

describe("hermes_provider_connections schema", () => {
  it("defines the table with required camelCase columns", async () => {
    // getTableName === "hermes_provider_connections"
    // getTableColumns has: id, tenantId, ownerUserId, scope, providerType,
    //   adapterType, authenticationType, status, assignedWorkerId,
    //   profileReference, accountLabel, accountHint, entitlementStatus,
    //   capabilitiesJson, defaultForImage, defaultForVideo, dailyJobQuota,
    //   metadataJson, createdAt, authorizedAt, lastProbeAt, disconnectedAt
    // notNull: tenantId, ownerUserId, scope, providerType, adapterType,
    //   authenticationType, status, profileReference, defaultForImage,
    //   defaultForVideo, createdAt
    // nullable: assignedWorkerId, accountLabel, accountHint,
    //   entitlementStatus, dailyJobQuota, authorizedAt, lastProbeAt,
    //   disconnectedAt
    // DB name check (camelCase family): columns.ownerUserId.name === "ownerUserId"
  });

  it("exposes the scope and status pgEnums with exact value sets", async () => {
    // schema.hermesConnectionScopeEnum.enumValues ===
    //   ["server_shared", "server_personal", "private_worker"]
    // schema.hermesConnectionStatusEnum.enumValues ===
    //   ["pending", "authorized", "reauth_required",
    //    "entitlement_restricted", "disconnected", "error"]
  });

  it("has NO secret-bearing columns (review-checklist guard)", async () => {
    // For every DB column name:
    //   expect(name).not.toMatch(/token|secret|password|cookie|credential|apikey|api_key/i)
    // /auth/i needs an allowlist because two legitimate metadata columns
    // contain it — assert the ONLY /auth/i matches are exactly
    // ["authenticationType", "authorizedAt"] (both non-secret metadata).
    // Also assert no column named authJson / auth_json / deviceCode exists.
  });

  it("declares the partial-unique default indexes and plain indexes", async () => {
    // const config = getTableConfig(schema.hermesProviderConnections)
    // uniqueIndex names present:
    //   "hermes_provider_connections_default_image_unique"
    //   "hermes_provider_connections_default_video_unique"
    // Both: unique === true, columns [tenantId, ownerUserId], and a
    // .where predicate (config.indexes[i].config.where is defined —
    // stringify and assert it references defaultForImage/defaultForVideo
    // and the three-status IN list).
    // Plain index names present:
    //   "hermes_provider_connections_tenant_owner_status_idx"
    //   "hermes_provider_connections_tenant_scope_status_idx"
  });

  it("exports select/insert types", async () => {
    // Type-level: assign a schema.hermesProviderConnections.$inferSelect
    // value to HermesProviderConnection and $inferInsert to
    // InsertHermesProviderConnection (compile-time check via a typed
    // helper function stub; runtime expect(true) is fine).
  });
});
```

Note on the TDD-plan regex: `claude-plan-tdd.md` §4 says "no column name matching /token|secret|password|auth/i". Applied literally, `/auth/i` would reject the spec-mandated `authenticationType` and `authorizedAt` columns. Implement the guard as written above (strict forbidden regex + explicit two-item allowlist for `/auth/i`) so the intent — no credential material at rest — is enforced without contradicting spec §10.1.

## Implementation

All in `apps/web/drizzle/schema.ts`. Place the enums and table adjacent to the worker fabric section (near `workers` / `workerJobs`, ~L13890+), since the table FK-references `workers` and shares its naming family.

### 1. Enums

```ts
export const hermesConnectionScopeEnum = pgEnum("hermes_connection_scope", [
  "server_shared", "server_personal", "private_worker",
]);
export const hermesConnectionStatusEnum = pgEnum("hermes_connection_status", [
  "pending", "authorized", "reauth_required",
  "entitlement_restricted", "disconnected", "error",
]);
```

### 2. Table

`pgTable("hermes_provider_connections", { ... }, t => [ ...indexes ])` with columns (camelCase DB names throughout):

| Column | Definition notes |
|---|---|
| `id` | `varchar("id", { length: 36 }).primaryKey().default(sql\`gen_random_uuid()\`)` — same as workers/workerJobs |
| `tenantId` | `varchar(36).notNull().references(() => tenants.id, { onDelete: "cascade" })` |
| `ownerUserId` | `integer.notNull().references(() => users.id, { onDelete: "cascade" })` — always set (connecting user, or creating admin for server_shared); visibility is driven by `scope`, never nullness |
| `scope` | `hermesConnectionScopeEnum("scope").notNull()` |
| `providerType` | `varchar(64).notNull().default("xai_grok")` |
| `adapterType` | `varchar(64).notNull().default("hermes_cli")` |
| `authenticationType` | `varchar(64).notNull().default("oauth_device_code")` |
| `status` | `hermesConnectionStatusEnum("status").notNull().default("pending")` |
| `assignedWorkerId` | `varchar(36).references(() => workers.id, { onDelete: "set null" })` — nullable until pairing/registration resolves the host worker |
| `profileReference` | `varchar(255).notNull()` — opaque profile directory key generated server-side (`conn_<id>` convention set in section-03); NEVER a client-supplied path |
| `accountLabel` | `varchar(120)` — user-chosen display name |
| `accountHint` | `varchar(120)` — non-sensitive masked handle/email parsed from `hermes auth status` |
| `entitlementStatus` | `varchar(64)` |
| `capabilitiesJson` | `jsonb("capabilitiesJson").$type<HermesConnectionCapabilityManifest>()` — nullable (null until first probe). Import the type with `import type { HermesConnectionCapabilityManifest } from "../shared/hermesMedia";` |
| `defaultForImage` | `boolean.notNull().default(false)` |
| `defaultForVideo` | `boolean.notNull().default(false)` |
| `dailyJobQuota` | `integer` nullable — server_shared fairness quota; null = unlimited/inherit |
| `metadataJson` | `jsonb.$type<Record<string, unknown>>().notNull().default({})` — consent timestamp, last error code/at; NEVER device codes |
| `createdAt` | `timestamp(..., { withTimezone: true }).notNull().defaultNow()` |
| `authorizedAt` / `lastProbeAt` / `disconnectedAt` | `timestamp(..., { withTimezone: true })` nullable |

**Forbidden (review checklist):** no column whose content or name is a token, secret, password, cookie, credential, auth.json payload, or device-code value — under any name. The schema-shape test enforces this permanently.

### 3. Indexes

```ts
t => [
  index("hermes_provider_connections_tenant_owner_status_idx")
    .on(t.tenantId, t.ownerUserId, t.status),
  index("hermes_provider_connections_tenant_scope_status_idx")
    .on(t.tenantId, t.scope, t.status),
  uniqueIndex("hermes_provider_connections_default_image_unique")
    .on(t.tenantId, t.ownerUserId)
    .where(sql`"defaultForImage" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted')`),
  uniqueIndex("hermes_provider_connections_default_video_unique")
    .on(t.tenantId, t.ownerUserId)
    .where(sql`"defaultForVideo" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted')`),
]
```

Two deliberate deviations from the copied MCP pattern — both intentional, do not "fix" them back:

1. **Quoted camelCase identifiers in the `.where()` SQL.** The MCP indexes use bare `default_for_image` because that table's DB columns are snake_case. This table's DB columns are camelCase, so the raw-SQL predicate MUST double-quote them (`"defaultForImage"`, `"status"`) or Postgres will fold to lowercase and fail to find the column at migration time.
2. **No provider column in the unique key.** MCP scopes defaults per `providerTemplateId`; hermes has a single provider in V1, so the default is unique per `(tenantId, ownerUserId)` per asset type, exactly as plan §4 specifies. The status predicate mirrors MCP's intent (a disconnected/pending row never blocks setting a new default) using this table's status vocabulary.

### 4. Type exports

At the bottom of schema.ts next to the other worker-fabric type exports:

```ts
export type HermesProviderConnection = typeof hermesProviderConnections.$inferSelect;
export type InsertHermesProviderConnection = typeof hermesProviderConnections.$inferInsert;
```

## Migration — run IMMEDIATELY after the schema edit (Database Safety Protocol)

This is a new table + two new enums: purely additive, no existing rows affected, so no table backup is required. Still follow the completion rules:

1. `cd apps/web && pnpm db:push` (runs `drizzle-kit generate && drizzle-kit migrate`).
2. Inspect the generated `drizzle/00XX_*.sql`: it must contain ONLY `CREATE TYPE "hermes_connection_scope"`, `CREATE TYPE "hermes_connection_status"`, `CREATE TABLE "hermes_provider_connections"`, and the four `CREATE INDEX` statements. If drizzle-kit emits unrelated diffs (drift from other tables), STOP and resolve before applying.
3. Verify `drizzle/meta/_journal.json` gained the new entry and `drizzle-kit migrate` reported success.
4. If `drizzle-kit migrate` fails, apply the SQL manually via `psql` and seed the hash into `drizzle.__drizzle_migrations` per the web-app CLAUDE.md procedure. Never leave the schema change un-migrated.
5. Sanity check: `psql "$DATABASE_URL" -c '\d hermes_provider_connections'` shows the camelCase columns and the two partial unique indexes with their predicates.

Rollback: none needed — flags stay off (section-01's `hermesMediaWorker` tenant flag defaults false); the empty table is inert.

## IMPLEMENTED — 2026-07-16 (as-built record)

Status: ✅ complete. 5/5 schema-shape tests (hardened per review: all 22
DB-column-name literals pinned + composite-index column order asserted —
mutation-tested against a deliberate `owner_UserId` typo); typecheck
baseline unchanged (140, zero hermes matches).

Deviations from plan:

1. **Migration path = manual psql, NOT `pnpm db:push`.** `drizzle-kit
   generate` is blocked repo-wide by a pre-existing meta-journal snapshot
   collision (0146/0147) that predates this feature — the same condition
   documented in 14 prior `manual_*.sql` files. Followed that established
   convention: hand-authored `drizzle/manual_hermes_provider_connections.sql`
   (2 CREATE TYPE + 1 CREATE TABLE + 4 CREATE INDEX, nothing else), applied
   via `psql -v ON_ERROR_STOP=1 -f`, verified with `\d` (22 camelCase
   columns, 5 indexes incl. both partial-unique predicates, 3 FKs). Journal
   intentionally not updated (matches sibling convention). A separate
   cleanup task chip (task_f34c6e44) was spawned to repair the drizzle-kit
   collision itself.
2. **SQL made idempotent + transactional after review** (BEGIN/COMMIT,
   IF NOT EXISTS everywhere, DO $$ duplicate_object guards for the enums)
   — proven by a clean no-op re-run against the migrated DB.
3. Placement: table + enums land after `workerJobs` type exports
   (~L14078-14189), not ~L13890 — same worker-fabric neighborhood.

Review trail: `../implementation/code_review/section-02-{diff,review,interview}.md`.
Note for later sections: the committed schema.ts also carries a concurrent
session's `verticalDramaCharacters` narrativeRole hunks (shared tree
ride-along, identified + excluded from review).

## Acceptance checklist

- [ ] Schema-shape test file exists and all five tests pass via `pnpm --dir apps/web test`.
- [ ] `pnpm --dir apps/web check` (tsc) passes — the `HermesConnectionCapabilityManifest` type import resolves.
- [ ] Migration applied; journal entry present; `\d` output matches (camelCase columns, partial-unique predicates use quoted identifiers).
- [ ] No secret-bearing columns; guard test locks this in for future edits.
- [ ] `HermesProviderConnection` / `InsertHermesProviderConnection` exported (section-03's service and section-05's admission signature `connection: HermesProviderConnection` depend on them).
- [ ] Full existing test suite still green (no drizzle-kit drift introduced).
<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/web exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-inventory-and-cloudflare-foundation
section-02-search-cache-kv-and-admin-control
section-03-redis-responsibilities-and-durable-objects
section-04-database-runtime-and-debian-retirement
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-inventory-and-cloudflare-foundation | - | 02, 03, 04 | No; establish actual evidence and resource contract first |
| section-02-search-cache-kv-and-admin-control | 01 | - | Yes, parallel with 03 after shared Worker/cache contracts are agreed |
| section-03-redis-responsibilities-and-durable-objects | 01 | 04 | Yes, independent responsibility families; keep one canonical queue authority |
| section-04-database-runtime-and-debian-retirement | 01, 03 | - | No; depends on full workload/authority inventory |

## Execution Order

1. `section-01-inventory-and-cloudflare-foundation` — produce inventory, target config contract and maintenance pause procedure.
2. `section-02-search-cache-kv-and-admin-control` and `section-03-redis-responsibilities-and-durable-objects` — parallel repo-local implementation; target deploy occurs once credentials/evidence are supplied.
3. `section-04-database-runtime-and-debian-retirement` — integrate remaining stateful/application hosting work and final host retirement proof.

## Section Summaries

### section-01-inventory-and-cloudflare-foundation
Reconcile responsibility inventory, readiness evidence, environment bindings/secrets and maintenance window control. Do not fabricate target account IDs.

### section-02-search-cache-kv-and-admin-control
Move only the Responses API search result cache to authenticated Worker KV endpoint, add real runtime provider control, status, setup guide and fail-open cache semantics.

### section-03-redis-responsibilities-and-durable-objects
Classify Redis G1–G6 and queue families; specify correct destinations and per-family pause/cutover. Adopt DO only when coordination/realtime inventory proves need.

### section-04-database-runtime-and-debian-retirement
Map remaining API, Node/Python, schedules, callbacks, PostgreSQL, assets, services and host dependencies to their target; define final full-system release and Debian retirement proof.

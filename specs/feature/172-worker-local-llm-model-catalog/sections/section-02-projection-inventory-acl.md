# Section 02 — Projection, Inventory, and ACL

## Scope

Persist safe Worker model projections, accept authenticated inventory updates, and enforce
owner-created Group sharing without allowing heartbeat or client payloads to change ACL.

## Files and ownership

- Modify `apps/web/drizzle/schema.ts` with `worker_llm_models`, inventory sync state, and
  assignment-scoped event identity columns/indexes.
- Add the next ordered Drizzle migration under `apps/web/drizzle/`.
- Add an inventory service and route in `apps/web/server/routes/workerRuntime.ts` or a
  narrowly scoped adjacent service module.
- Modify `apps/web/server/services/workerRegistryService.ts` to preserve server-owned sharing
  policy and apply mandatory LLM claim checks.
- Modify `apps/web/server/routers/users.ts` only for the Feature 172 owner-created Group rule.
- Add migration, route, service, and authorization tests under existing test conventions.

## Data and transaction rules

`worker_llm_models` must include tenant, Worker, owner, opaque local/provider/model IDs,
display metadata, normalized capabilities, status, enabled, inventory revision, last seen,
sanitized error, `deletedAt`, and timestamps. Add tenant/Worker/owner/status indexes and a
partial unique identity index where `deletedAt IS NULL`. Because existing FKs are not
composite tenant FKs, verify Worker tenant, owner tenant, and actor tenant in the same query
or transaction.

Inventory publication uses a Worker execution token with `llm:inventory`, derives Worker and
tenant from authentication, requires idempotency key and canonical payload hash, rejects
lower revisions and same-key/different-hash replay, and atomically upserts/tombstones rows
and sync state. The response returns authoritative `localModelId -> modelRef` mappings for
the Worker to persist. Never log raw payloads or accept body owner/tenant IDs.

Sharing uses the existing `workerSharingPolicy` location but server-owned merge protection.
Only the registered Worker owner may select Groups; each Group must be same-tenant,
non-deleted, and `userGroups.ownerId === workers.registeredByUserId`. Local LLM rejects
tenant mode. Catalog and queued-job admission re-evaluate current policy after revoke or
membership changes.

## Tests first

Cover migration columns/indexes, inventory auth/scope, replay/hash/revision races, mapping
stability, cross-tenant rejection, owner-created Group acceptance, non-owner rejection,
tenant-mode denial, heartbeat ACL tampering, member/revoke races, and atomic event identity.

## Done when

No secret/endpoint/prompt is persisted in projection, no unauthorized model is readable or
dispatchable, and concurrent duplicate inventory/event requests have deterministic outcomes.

## UI/UX Contract

### Target User / JTBD
N/A — this section is Cloud persistence and authorization; user-facing management is in Section 05.

### Existing Pattern Reference
N/A — no UI is changed in this section.

### Surface Inventory
N/A — database and authenticated Worker routes only.

### Component Map
N/A — no UI components are owned here.

### State Matrix
N/A — API errors/statuses are consumed and rendered by Section 05.

### Responsive Matrix
N/A — no layout changes.

### Accessibility Acceptance
N/A — no rendered controls.

### Copy Contract
N/A — server messages must be sanitized; localized rendering is in Section 05.

### Browser Evidence Required
N/A — route authorization tests cover this section; browser evidence is required by Section 05.

## Implementation record

- Added migration `0276_worker_local_llm_catalog.sql` and server projections
  `worker_llm_models` / `worker_llm_inventory_sync` with revision/hash/idempotency
  indexes and no secret columns.
- Added authenticated inventory sync; stale/conflicting revisions are rejected and
  removed models are tombstoned.
- Local LLM sharing is restricted to same-tenant, non-deleted Groups created by the
  Worker owner; queued non-owner jobs are canceled transactionally on ACL changes.

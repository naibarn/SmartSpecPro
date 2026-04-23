# Section 07: Schema and Router Contracts

## Objective

Convert the planning model into implementation-ready Drizzle, Zod, and TRPC contracts that fit the repo's existing backend conventions.

## Scope

- schema finalization
- migrations
- router inputs/outputs
- service contract alignment
- compatibility during rollout and backfill

## Likely Files and Modules

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/meta/*`
- `apps/web/shared/libraryContextPacks.ts`
- new shared schemas for relationships, properties, saved views, graph, and canvas
- `apps/web/server/routers/library.ts`

## Implementation Guidance

### 1. Finalize knowledge-cache persistence

- Add the remaining knowledge-cache tables or persisted read models needed for:
  - properties
  - aliases/tags
  - outgoing links
  - link diagnostics
  - backfill state
- Keep context-pack tables aligned with the already scaffolded shapes instead of redefining them elsewhere.
- Add dedicated saved-view persistence because the repo currently has only a `savedViewId` placeholder and no concrete saved-view table.
- Minimum v1 saved-view schema should include:
  - `library_saved_views`
  - stable `id`, `tenantId`, `ownerUserId`, optional `managingGroupId`
  - tenant-unique `slug`
  - `visibilityMode`
  - `scopeMode`
  - `queryDefinition`
  - `presentationDefinition`
  - `archivedAt`, `createdAt`, `updatedAt`
- Promote business-memory approval audit fields into first-class persisted fields or a companion review-history table. Do not leave approval lifecycle entirely to freeform metadata.

### 2. Use shared contracts as the boundary

- Put request/response shapes in shared modules first.
- Make router procedures validate those contracts rather than inlining bespoke schemas repeatedly.
- Keep list/get/create/update/archive/publish/resolve flows consistent across client, router, service, and runtime code.

### 3. Plan migrations and compatibility

- Use forward-only migrations.
- Preserve existing Library features while new caches are empty or backfilling.
- Degrade reads into empty/partial states with diagnostics instead of hard failures whenever the underlying source is still valid.

### 4. Keep contract ownership explicit

- Relationships, properties, saved views, graph, canvas, and context packs should each have a clear contract owner.
- Do not overload one large catch-all router payload with unrelated derived data.

## Test-First Checklist

- Test: schema enums, tables, indexes, and constraints align with shared contracts
- Test: router inputs and outputs stay consistent with shared Zod schemas
- Test: migrations do not regress current Library CRUD/search/version flows
- Test: backfill-in-progress states degrade safely instead of breaking consumers
- Test: saved-view persistence supports `view_backed` pack resolution without client-side state leakage
- Test: pack approval audit fields survive stale transitions, revoke, and re-review flows

## Acceptance Checkpoints

- Backend teams have implementation-ready contract boundaries.
- Client and runtime teams can integrate against stable shared schemas.
- Rollout can happen incrementally without needing a big-bang migration.

## Implementation Notes

- Added knowledge-cache, relation-cache, backfill-run, and saved-view schema definitions in `apps/web/drizzle/schema.ts`.
- Added first-class context-pack approval audit fields in `apps/web/drizzle/schema.ts` and `apps/web/shared/libraryContextPacks.ts`.
- Added durable saved-view contracts in `apps/web/shared/librarySavedViews.ts`, read-side knowledge contracts in `apps/web/shared/libraryKnowledgeRead.ts`, and canvas contracts in `apps/web/shared/libraryCanvas.ts`.
- Exposed router procedures in `apps/web/server/routers/library.ts` for:
  - saved-view list/get/create/update/archive/execute
  - knowledge inspector, quick switch, and property catalog
  - context-pack list/get/create/update/archive/publish/resolve
  - canvas board create/get/update
- Added schema-focused tests in `apps/web/drizzle/libraryKnowledgeSchema.test.ts` and `apps/web/drizzle/librarySavedViewSchema.test.ts`.
- Added forward-only migration `apps/web/drizzle/0157_library_md_knowledge_vault.sql` for saved views, context packs, context-pack members, knowledge notes, knowledge relations, and backfill runs.
- Kept rollout compatible with empty caches by returning empty or partial read states plus diagnostics rather than making existing Library CRUD depend on completed backfills.
- Remaining deployment follow-up is to generate/update Drizzle meta snapshots if the team wants migration metadata parity beyond the hand-written SQL migration.

# Feature 156 Deep Implementation Plan

## Delivery strategy

Implement in dependency order so the server contract exists before UI wiring:

1. Canonical profile and Source Pack contracts.
2. Drizzle persistence, migration, session binding, and repository services.
3. Source Pack tRPC APIs and readiness/error contract.
4. Ingestion, managed media, product/place snapshots, and vision jobs.
5. Wizard/source-hub UI and combined readiness states.
6. Prompt/draft gate integration and long-form digest propagation.
7. B-roll binding and production validation.
8. Legacy migration projection, rollout flags, and cross-surface proof.
9. Final integration, typecheck, focused tests, and five-plus convergence
   reviews.

The implementation must use the existing `verticalDramaSeries.create` mutation
for shell creation. `createSeries` is a plan term only; no second shell-create
endpoint is allowed.

## Shared contracts and invariants

### Series Profile

Add a versioned registry under `apps/web/shared/verticalDramaSeries/` with the
twelve profiles from `spec.md`. Each entry owns content engine, visual key,
strict visual grounding contract, evidence policy, source gate policy, default
slots, B-roll policy, and commercial disclosure. Add pure resolvers for legacy
`seriesFormat`, fiction-only `lookLock`, `visualBible`, and explicit profile
changes. A non-fiction profile must never serialize into the fiction look-lock
enum or fall back to generic documentary grounding.

### Source Pack

Use normalized tenant-scoped tables/relations for packs, slots, managed assets,
analysis results, usages, and append-only events. Packs may be staged by
`draftSessionId` or attached by `seriesId`, never both as active owners. Enforce
one active staged pack per tenant/owner/session, stable `(packId, slotKey)`,
attach-once semantics, optimistic versions, soft deletion, and idempotency
keys. Keep the compact profile/source digest in the existing bible only as a
versioned projection; never store unbounded slots in JSON.

### Readiness and rights

Use lifecycle states `draft`, `analyzing`, `needs_review`, `draft_ready`, and
`production_ready`, with `failed`, `stale`, and `blocked` side states. Text
draft readiness requires source identity, factual-status handling, explicit
rights status, required disclosure, and approved/user-authored descriptions.
Production readiness additionally requires managed ownership/version and
`rightsApproved` or a creator-owned equivalent for every rendered asset.
Expose `VD_SOURCE_PACK_NOT_READY` with bounded repair items and server-computed
`textDraftAllowed`/`productionRenderAllowed` flags.

### Session and create transaction

Add a server-issued draft-session claim/create operation. Legacy client
`Math.random` workspace IDs remain recoverable for old composition/QC jobs but
cannot authorize a new Source Pack without claim/rotation. Extend
`verticalDramaSeries.create` input with the staged-session reference and an
idempotency key. The transaction validates ownership, attaches the pack, and
creates the shell; it must not upload media or call providers. A retry returns
the already-bound series. Failed creation leaves the staged pack recoverable.

## Section 01 — Profile registry and compatibility

Targets:

- `apps/web/shared/verticalDramaSeries/seriesProfile.ts` (new)
- `apps/web/shared/verticalDramaSeries/seriesProfile.test.ts` (new)
- `apps/web/shared/verticalDramaSeries/index.ts`
- `apps/web/shared/verticalDramaSeries/seriesFormat.ts`
- `apps/web/shared/verticalDramaSeries/seriesLookLock.ts`
- `apps/web/shared/verticalDramaSeries/visualGrounding.ts`

Implement the twelve profile records, strict cue/forbidden-drift metadata,
legacy precedence, format projection, and profile-change invalidation payload.
Keep visual notes as supplemental constraints. Make missing profile contracts
hard errors. Add compatibility fixtures for all existing seven format kinds and
fiction look keys, including conflict warnings and no-write-on-read behavior.

## Section 02 — Persistence and migrations

Targets:

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0239_vertical_drama_source_packs.sql` (new; next numbered migration)
- `apps/web/drizzle/schema.test.ts`
- `apps/web/server/services/verticalDramaSourcePackRepository.ts` (new)
- repository/service tests (new)

Create normalized tables with tenant/owner/session/series indexes, media asset
foreign keys, version columns, lifecycle/readiness fields, source snapshots,
rights/disclosure status, usage bindings, and append-only events. Add safe
expand migration and rollback behavior. Keep migration identifiers precise and
follow existing manual Drizzle migration conventions. Implement transaction
helpers for staged uniqueness, attach-once, optimistic concurrency, and
idempotency. Add legacy `productTieIn` read-only projection and explicit save
conversion with `legacy_product_tie_in` provenance. Do not perform media
registration side effects in the shell-create transaction.

## Section 03 — Session, Source Pack API, and gate service

Targets:

- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/services/verticalDramaSourcePackService.ts` (new)
- `apps/web/server/services/verticalDramaSourcePackGate.ts` (new)
- shared source-pack types and router/service tests (new)

Add server-issued session creation/claim, pack CRUD, profile/version updates,
slot CRUD/reorder/archive, managed asset attach/detach, readiness, approval,
repair, usage binding, digest retrieval, and staged attach operations. Every
procedure derives tenant/user from auth, re-reads ownership inside the
transaction, rejects stale versions, and uses typed error codes. Extend the
existing `create` mutation rather than adding `createSeries`; attach staged
pack and series shell atomically with retry idempotency. Make direct
`startDraftComposition`, story generation, repair, storyboard, and media-prompt
paths call the same gate service.

## Section 04 — Ingestion, media, product/place, and vision

Targets:

- new source ingestion service/module(s) under `apps/web/server/services/`
- existing managed media service and marketplace/location adapters
- `apps/web/client/src/components/verticalDramaSeries/` source-slot UI pieces
- unit/service tests for upload, import, SSRF, provenance, and retries

Implement source identity snapshots for known places, coordinates/URLs,
documentary notes, marketplace product descriptions/media selection, generated
references, and user image/video uploads. Only managed `mediaAssetId` is
authoritative. Enforce MIME/content sniffing, bounds, quarantine, SSRF
rejection, tenant URLs, rights/privacy/sponsorship flags, and no silent catalog
replacement. Vision description jobs are async, idempotent by pack/slot/media/
policy version, provenance tagged, and treat OCR/user text as untrusted.

## Section 05 — Wizard profile and Story Sources & Media hub

Targets:

- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts`
- new focused source hub/slot components under the same directory
- component tests and Playwright flow coverage

Replace separate editable format/look/evidence controls with one profile picker
while preserving six step IDs and saved workspace compatibility. Rename the
product step to Story Sources & Media. Support profile-specific required slots,
unlimited custom-slot UX with pagination/bounded requests, upload/import/
generate-description/approve/retry controls, image/video trim metadata, and
two readiness badges. For non-fiction/review/hybrid use the sequence profile →
source pack → source readiness → composition → existing Draft QC → review/
create. Show one combined blocked state with actionable repair items.

### UI/UX contract

- Target user: creator preparing a factual/review series who needs to know
  exactly which source or permission blocks drafting/rendering.
- Surface: existing six-step create wizard, product step renamed in-place; no
  new top-level route.
- State matrix: loading/empty/analyzing/partial/failed/stale/blocked,
  draft-ready, production-ready, upload-progress, retrying, conflict, and
  success; every state has a next action.
- Responsive: one-column source cards on mobile, two-column tablet, three or
  more cards on desktop; no horizontal overflow; long slot lists virtualized or
  incrementally loaded.
- Accessibility: semantic headings, labeled inputs, keyboard reorder alternative,
  visible focus, aria-live for async status, color plus text for rights/status,
  contrast and reduced-motion support.
- Copy: Thai/English labels, creator language rather than raw IDs/provider
  names, stable fallback copy, and explicit warnings for text-only media.
- Browser evidence: profile selection, source slot creation, upload/description,
  blocked-to-ready transition, retry, legacy product projection, and responsive
  review state.

## Section 06 — Draft gate, digest, and prompt integration

Targets:

- `apps/web/server/services/verticalDramaSourcePackGate.ts`
- existing story generation/prompt composition services
- `apps/web/server/routers/verticalDramaSeries.ts`
- shared digest/evidence adapter and tests

Build a bounded digest scoped to pack/profile/visual/source versions and current
episode/chunk. Include only approved slot IDs, bounded observations/claims,
verification/rights status, allowed usage, and media capabilities. Map claims
through the existing `requiredEvidence`/`format_evidence` contract. Keep story
memory, relationship graph, closure QC, and visual grounding authoritative.
Treat `productContext`/`businessContext` as creative hints unless they resolve
to approved Source Pack claims. Invalidate digests on source/profile/approval
changes and fail closed on compaction instead of truncating silently.

## Section 07 — B-roll and production binding

Targets:

- existing storyboard/shot handoff and media prompt modules
- new source usage/binding service and focused tests
- existing managed media/render validation paths

Allow approved image/video slots to become establishing footage, cutaways,
insert/evidence/demo/transition/B-roll overlay with explicit creator approval.
Validate managed existence, owner, source version, trim bounds, aspect,
orientation, safe zones, overlay order, audio rights, and renderability.
Fail closed with repair items; never replace with provider URLs or inject assets
into every episode. Keep usage advisory until approval and preserve slot IDs
through revisions and resumable long-form chunks.

## Section 08 — Legacy projection, rollout, and operational safety

Targets:

- migration feature flags/configuration
- legacy projection helpers and tests
- audit/metrics hooks and rollback tests

Roll out registry/resolver, read-only projection, Source Pack persistence,
ingestion, vision, gate, and production binding in separate flags. Keep legacy
fiction and product-tie-in reads working. Record tenant-safe events for import,
approval, gate blocks, attach/retry, rights changes, and cost reconciliation.
Define cleanup/restore for abandoned staged sessions (30-day default), orphan
media reconciliation, quotas, rate limits, and rollback without deleting
legacy fields/media.

## Section 09 — Convergence and proof

Run focused unit/API/UI tests after each section, then cross-section tests and
typecheck. Run at least five implementation review loops after the last code
change. Each loop compares every spec requirement to implementation, checks
security/tenant scope, retries/idempotency, migration/read compatibility, UI
state/accessibility, and stale gates. Fix all in-scope MUST_FIX findings before
the next loop. Browser/provider/deployment/legal evidence is reported
separately when unavailable.

## Stop conditions

Do not claim complete if any section is skipped, any required test cannot be
explained, a direct route bypasses readiness, a production binding can render
unknown rights, an attach can duplicate a series, or a migration can delete
legacy data. Stop only for a critical security finding, destructive migration
requiring a decision, or a fatal environment failure after bounded retries.

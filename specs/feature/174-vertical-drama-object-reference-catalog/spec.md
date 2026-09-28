# Feature 174 — Vertical Drama Prop/Object Reference Catalog

**Status:** DESIGN — 80-PASS AUDITED; BASELINE/RELEASE GATES EXPLICIT
**Created:** 2026-09-02
**Priority:** P1 — continuity and visual grounding for story-critical objects
**Owner:** Vertical Drama / Story Intelligence / Media Generation / UX

## 1. Executive decision

Replace the user-facing **Product Tie-in** tab with a series-level
**วัตถุประกอบฉาก / Object Reference** catalog.

An Object Reference is a reusable, story-owned physical object that must remain
recognizable across the series: a locked wooden box, a grandfather's box, a
family jade, a ring, a document, a key, a personal weapon, a magical weapon,
or another narrative-critical prop. It is not inherently an advertisement and
must not inherit commercial/ad-safety behavior merely because the old feature
was named Product Tie-in.

The feature has two related layers:

1. **Series catalog:** the canonical object identity, story meaning, approved
   reference images, variants, provenance, and generation prompt.
2. **Shot usage:** a per-shot link saying that the object is visible, held,
   opened, locked, used, or otherwise materially relevant in that shot.

The system may suggest or attach a catalog object automatically when story
context supports it, but detection is advisory. Missing, uncertain, stale, or
unavailable object references must never block storyboard creation, prompt
generation, image generation, video generation, or episode continuation. The
creator can always accept, edit, add, remove, replace, or ignore a suggestion.

The current per-shot `prop_object` reference track remains the generation-facing
projection for compatibility with the work already added to the storyboard.
Feature 174 adds the canonical series catalog and a stable catalog-to-shot
relationship; it must not create a second competing source of truth for media
references.

### 1.1 Special Episode decision: one catalog, two semantic modes

Yes: a Special Episode's selected Product tie-in should be represented by the
same Object Reference catalog and displayed under the same Object Reference
name. It must not create a second “product object” screen or force the creator
to understand two competing reference systems.

The merge is a **domain/UI merge**, not a destructive rewrite of the existing
Special Tie-in workflow:

- `Object Reference` is the single user-facing umbrella for reusable physical
  references.
- A catalog record has `referenceMode = story_object` or
  `referenceMode = commercial_tie_in`.
- A normal-series locked box uses `story_object` and has no commercial rules by
  default.
- A Special Episode's selected Marketplace/product reference uses the same
  catalog identity and asset slots but is marked `commercial_tie_in`. Its
  existing Product Tie-in disclosure, claim-screening, placement, credit,
  footage-first, exactly-nine-shot, and approval behavior remains active.
- Location and store references are **not** converted into objects. They stay
  scene/location references because they define the environment, while the
  product/object remains an additive physical prop.
- The Special Tie-in dialog continues to be the entry point for creating a
  Special Episode. Its product selector is backed by Object Reference records,
  while legacy request fields remain available in the adapter until the new
  contract is proven.

This prevents the two failure modes that would make the feature confusing:
showing a normal Object Reference section beside a duplicate Product Tie-in
section in a Special Episode, or removing the commercial safeguards because a
commercial product was renamed as an object.

## 2. Problem and user outcome

The current Product Tie-in surface is too narrow for objects whose value is
narrative rather than commercial. A creator who needs the same locked box in
shots 1–5 must currently find or upload the image repeatedly, and the system
has no durable object identity from which it can understand that “the locked
wooden box” in an episode synopsis is the same object as “grandfather's box” in
the series story.

The creator should be able to:

- define an important object once for the series;
- describe what it is and why it matters in the story;
- attach a canonical image and optional detail/alternate images;
- drag an image from the local hard disk or the right-side Library/History
  panel into the object slot;
- use a Marketplace Capture image as an object reference while preserving its
  product provenance;
- ask the system to write a context-grounded image prompt and optionally
  generate the object image;
- see where the object is used and why it was detected;
- let the system suggest/link it to relevant shots;
- manually add, remove, or replace the object on any shot;
- use the same approved object references when generating start-frame images,
  image prompts, and video prompts;
- continue generating content even when detection or reference resolution
  fails.

## 3. Scope

### 3.1 In scope

- Rename the existing tab and user-facing feature from Product Tie-in to
  `วัตถุประกอบฉาก / Object Reference`, while keeping Product Tie-in as the
  internal compatibility/commercial mode.
- Add a series-level object catalog with CRUD/archive operations.
- Add canonical and alternate object image slots.
- Accept local upload, Library/History drag-and-drop, and Marketplace Capture
  images through managed-media ownership checks.
- Generate an object-specific prompt from story context and optionally a
  reference image.
- Generate and approve an object image as a paid, explicitly confirmed action.
- Detect candidate object definitions and shot usages from story/episode/shot
  context.
- Persist evidence, confidence, detection source, and manual overrides.
- Project approved object assets into the existing per-shot `prop_object`
  references used by image/video generation.
- Show object chips/pickers and a drop zone in the storyboard shot UI.
- Keep object failures non-blocking and observable.
- Provide a compatibility/migration path for existing Product Tie-in data.
- Reuse the same catalog in Special Tie-in without changing its existing
  footage-first, story-review, nine-shot, model, credit, disclosure, or
  Marketplace flow.

### 3.2 Out of scope

- Automatic product advertising, affiliate attribution, pricing, or spoken
  product claims for ordinary story objects. These remain possible only in an
  explicitly commercial Special/Product Tie-in mode.
- Replacing character identity, wardrobe continuity, or location continuity
  logic. Object continuity is a separate visual-canon track.
- Treating every noun in a synopsis as an object reference.
- Requiring an object image before a storyboard or shot can be created.
- Automatically purchasing, publishing, or promoting Marketplace products.
- Rebuilding the media library, storage gateway, or Marketplace Capture
  service.
- Silent paid generation during detection, linking, or migration.

## 4. Terminology and invariants

| Term                   | Meaning                                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Object Reference       | A canonical, series-scoped story object definition.                                                                                 |
| Reference mode         | `story_object` for narrative props or `commercial_tie_in` for an explicitly sponsored/Product Tie-in reference.                     |
| Object Asset           | A managed, tenant-owned image attached to an Object Reference.                                                                      |
| Canonical asset        | The primary visual authority for the object.                                                                                        |
| Detail/alternate asset | Additional view, engraving, lock, weapon detail, or angle; it does not create a new object.                                         |
| Shot object usage      | A link between one Object Reference and one episode shot.                                                                           |
| Detection evidence     | The source text and normalized context that caused a suggestion.                                                                    |
| Manual override        | An explicit creator add/remove/replace decision that takes precedence over automatic detection until reset.                         |
| Continuity context     | Episode order, synopsis, location, time, travel, action, and story memory used to decide whether usage is the same narrative event. |

The following invariants are mandatory:

1. Every persisted image is a managed media asset authorized for the current
   tenant and user; arbitrary provider URLs are never the canonical object
   identity.
2. One physical object has one canonical catalog identity, even when it has
   multiple images or variants.
3. An object can have zero images and remain a valid catalog record.
4. Detection and reference resolution are best-effort and non-blocking.
5. Explicit manual shot decisions override detector output.
6. An object mention is not automatically a visible object. The detector must
   distinguish `mentioned`, `visible`, `held_or_used`, and `uncertain`.
7. Product/commercial provenance is metadata, not proof that the object is an
   advertisement.
8. Ordering and de-duplication of object assets are deterministic before a
   provider request.
9. `commercial_tie_in` is opt-in/legacy-preserved only; it is never inferred
   merely from a Marketplace image or the word “product” in a story.
10. `story_object` always has `commercialTieInEnabled = false`. Enabling the
    flag requires `commercial_tie_in`, a valid commercial profile, explicit
    creator confirmation, and the existing commercial compliance path.
11. Special Episode location/store references remain scene references and are
    never placed into the object asset list just because the episode also has a
    commercial object.
12. `referenceMode = commercial_tie_in` and `commercialTieInEnabled = true`
    must agree for a record to enter commercial policy; a stale/malformed
    legacy record is shown as needing reconciliation, not silently treated as
    an ordinary story object.

## 5. Existing-system boundary

Feature 174 builds on the current Vertical Drama contracts:

| Existing boundary                    | Required treatment                                                                                                                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vertical_drama_series.productTieIn` | Keep readable during migration. New UI writes the Object Reference catalog; the legacy JSON remains the compatibility/commercial projection until all consumers are migrated.                                                                                |
| `vertical_drama_shot_references`     | Continue using the existing managed-media per-shot reference path with source `prop_object` as the generation projection. Add catalog identity through the new relationship defined below; do not overload the reference row with unbounded JSON.            |
| `VerticalDramaStoryboardPanel`       | Replace the ordinary-shot supplementary-reference wording with the object picker/catalog affordance while preserving upload and Library drag/drop behavior. Product-only and Special Episode shots keep their existing commercial projection during rollout. |
| Start-frame prompt/image generation  | Resolve object assets into the existing bounded multimodal bundle after higher-priority character/location/scene anchors, subject to provider limits.                                                                                                        |
| Video generation                     | Include approved object assets in the existing shot reference bundle. Missing object assets are skipped with a warning.                                                                                                                                      |
| Media upload/resolution              | Reuse the existing upload and tenant-scoped managed-media resolver. Do not introduce a second storage or URL signing path.                                                                                                                                   |
| Marketplace Capture                  | Reuse existing capture/product image records and preserve source/product/capture identifiers in object provenance. A capture becomes commercial only when the existing special/product flow says so.                                                         |

The feature must not regress the prior per-shot `prop_object` capability. A
shot-level reference manually added before the catalog migration remains usable
and is displayed as an **unclassified object reference** until the creator
links it to a catalog object.

## 6. Data model

The proposed normalized model is additive. Exact physical column naming should
follow the repository's Drizzle conventions and existing manual migration
practice, but the following fields are contractually required.

### 6.1 `vertical_drama_object_references`

One row per canonical story object.

Required fields:

- `id`
- `tenantId`, `userId`, `seriesId`
- `stableKey` — series-local immutable key for idempotent detection/linking
- `name` — creator-facing name, e.g. `กล่องไม้ของคุณปู่`
- `aliases` — normalized alternate names used by the detector; aliases are
  series-scoped and cannot merge two objects without a type/role check
- `referenceMode` — `story_object` or `commercial_tie_in`; this is the single
  semantic switch used by the resolver and UI
- `objectType` — `secret_object`, `locked_box`, `heirloom`, `ring`, `jade`,
  `document`, `key`, `weapon`, `magical_weapon`, `container`, `device`, or
  `other`; defaults to `other` when a creator starts with only a name and
  description
- `canonicalDescription` — physical facts and story-grounded description
- `narrativeRole` — why the object matters, what secret/plot function it has
- `appearanceNotes` — shape, material, markings, lock, color, scale, wear, and
  other visual facts
- `continuityPolicy` — `series_canon`, `episode_canon`, or `scene_only`
- `status` — `active` or `archived`
- `source` — `manual`, `detected`, `legacy_product_tie_in`, or
  `marketplace_capture`
- A creator-created record defaults to `manual`; `uploaded` is an asset-source
  value, not a reason to classify the catalog object as commercial.
- `commercialTieInEnabled` — defaults false; true only when the creator
  explicitly preserves an actual commercial placement
- `commercialProfile` — nullable structured compatibility data containing the
  old product category, disclosure policy, forbidden claims, allowed story
  functions, Marketplace identifiers, and approval requirements; this field is
  ignored for `story_object`
- `createdAt`, `updatedAt`

Recommended indexes/constraints:

- unique `(tenantId, seriesId, stableKey)`;
- unique active commercial object identity for one imported legacy Product
  Tie-in record, so repeated reconcile cannot create duplicates;
- lookup `(tenantId, seriesId, status, updatedAt)`;
- no cross-tenant object lookup by user-controlled series ID.

### 6.2 `vertical_drama_object_reference_assets`

Links managed media to an object.

Required fields:

- `id`, `tenantId`, `objectReferenceId`, `mediaAssetId`
- `role` — `canonical`, `detail`, or `alternate`
- `source` — `upload`, `library`, `history`, `generated`, or
  `marketplace_capture`
- `sortOrder`
- `approved`
- `promptMetadata` — structured facts produced or edited by the creator;
  never the only source of visual identity
- `sourceProductId` and `sourceCaptureId` when Marketplace Capture is used
- `createdAt`, `updatedAt`
- `status` — `active` or `removed` — and `removedAt`; removing an attachment
  is a reversible catalog operation and must not delete the underlying
  `media_assets` row

Constraints:

- unique `(objectReferenceId, mediaAssetId)`;
- at most one active canonical asset per object, enforced transactionally;
- asset ownership and tenant checks performed before insert.

The physical unique key must include active lifecycle semantics (a partial
unique index or an equivalent active-link strategy). A removed asset link must
not prevent a later reattach, while historical usage and audit records remain
readable.

### 6.3 `vertical_drama_shot_object_references`

The authoritative catalog-to-shot usage relationship.

Required fields:

- `id`, `tenantId`, `userId`, `seriesId`, `episodeId`, `shotNumber`
- `objectReferenceId`
- `usageType` — `visible`, `held`, `used`, `opened`, `locked`, `unlocked`,
  `mentioned`, or `uncertain`
- `detectionSource` — `automatic`, `manual`, `legacy_projection`
- `confidence` — bounded numeric score or named `high`/`medium`/`low`
- `evidence` — short, redacted source excerpt plus source labels
- `selectedAssetId` — optional shot-specific asset/alternate override
- `manualOverride` — boolean
- `status` — `active` or `removed`
- `createdAt`, `updatedAt`

Constraints:

- unique active `(episodeId, shotNumber, objectReferenceId)`; the physical
  constraint must allow a removed historical link to coexist with a later
  active link;
- indexed `(tenantId, seriesId, objectReferenceId)` and
  `(tenantId, episodeId, shotNumber)`;
- a shot-specific asset must belong to the same object and tenant;
- removing a link is soft/auditable, not destructive deletion of the catalog
  object or media asset.

For a manual remove, retain a removed/tombstone usage row with its context
fingerprint and `manualOverride = true`. The detector must consult that row
and cannot recreate the usage until the creator explicitly resets it to
automatic. A physical delete is allowed only for an administrative data
retention workflow outside normal shot editing.

### 6.3.1 `vertical_drama_object_reference_aliases`

Aliases are persisted in a small child table rather than hidden in an
unvalidated prompt or JSON blob. Required fields are `id`, `tenantId`,
`objectReferenceId`, normalized `alias`, `createdAt`, and `updatedAt`; unique
`(objectReferenceId, alias)` and a tenant/series lookup are required. An alias
cannot be attached across tenants or series, and an update must not silently
reassign an alias that belongs to another active object.

### 6.3.2 `vertical_drama_object_detection_suggestions`

Detection output that is waiting for review is persisted as a short-lived,
tenant-scoped suggestion row rather than kept only in process memory. It
contains:

- `id`, `tenantId`, `userId`, `seriesId`, optional `episodeId`/`shotNumber`,
  and candidate `objectReferenceId` when a catalog match exists;
- `candidateName`/aliases, usage classification, confidence, redacted
  evidence, `contextRevision`, `contextFingerprint`, detector version, and
  `status` (`pending`, `accepted`, `rejected`, `stale`, `expired`);
- `manualDecisionAt`, `manualDecisionBy`, and an idempotency key where a
  review action can be retried.

Accept/reject/reset operations address this suggestion identity and expected
fingerprint. Re-running detection may supersede a stale suggestion, but must
not erase the creator's manual decision or active shot usage.

Suggestions have a TTL/cleanup policy and an index on
`(tenantId, seriesId, status, contextFingerprint)`. Cleanup may expire a
pending suggestion but must never delete an active shot usage, catalog object,
or managed media asset. The default pending-suggestion TTL is 30 days after
the last detector run; stale suggestions caused by a story revision are marked
stale immediately and retained for audit for at least that same window.

### 6.4 Compatibility projection

The new relationship is the source of truth for catalog usage. A resolver
projects active links into the existing `vertical_drama_shot_references` rows
with `source = 'prop_object'`, preserving the current generation contract.

Projection rules:

1. Catalog assets are projected in deterministic order: selected shot asset,
   canonical asset, then approved detail/alternate assets by `sortOrder`.
2. Existing manually attached unclassified `prop_object` rows are preserved
   and projected after catalog-linked assets until classified or removed.
3. Projection is idempotent and de-duplicates by `mediaAssetId`.
4. A failed projection cannot block storyboards; it creates an actionable
   non-blocking warning and leaves the previous usable projection intact.

### 6.5 `vertical_drama_episode_object_references`

Special Episodes need a durable episode-level binding in addition to their
per-shot usages. This prevents a Marketplace product from being reselected or
duplicated on refresh/retry, while preserving the current
`SpecialEpisodeData.referenceBindings` contract during migration.

Required fields:

- `id`, `tenantId`, `userId`, `seriesId`, `episodeId`
- `objectReferenceId`
- `referenceMode` — copied from the catalog at binding time
- `role` — `commercial_product` or `story_object`
- `required` — true for the existing required Special Tie-in product reference;
  false for optional story props
- `source` — `marketplace_capture`, `legacy_product_tie_in`, `manual`, or
  `detected`
- `sourceProductId`, `sourceCaptureId`, and `sourceMediaAssetIds` where
  applicable
- `inputFingerprint`, `inputVersion`, `manualOverride`
- `createdAt`, `updatedAt`

Constraints:

- unique active `(episodeId, objectReferenceId, role)`; the physical
  constraint must allow a removed historical binding to coexist with a later
  active binding;
- this table is valid only for `episodeKind = special_tie_in`; normal episodes
  use shot usages without an episode-level commercial binding;
- `role = commercial_product` requires
  `referenceMode = commercial_tie_in` and `required = true` when the existing
  Special Tie-in input requires a product; `role = story_object` requires
  `referenceMode = story_object` and remains optional;
- one active required commercial product binding for a product-mode Special
  Episode unless the existing Special Tie-in contract explicitly permits a
  mixed set;
- all foreign keys and asset IDs are tenant/series/episode scoped;
- store a source snapshot/fingerprint of the selected product/capture and
  catalog object so later catalog edits cannot silently change an already
  reviewed Special Episode.

The existing special `referenceBindings` remains the compatibility projection
until every Special Tie-in consumer reads this table through the shared typed
resolver. A catalog reconciliation retry updates the binding transactionally;
it never clears a previously valid binding on a transient error.

### 6.6 Physical naming, lifecycle, and versioning contract

The logical names above are the public/domain contract. The first migration
uses the following physical mapping so the implementation cannot accidentally
create two meanings for the same field:

| Domain field                                                         | Physical/API v1 field                                                  | Rule                                                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `referenceMode`                                                      | database `mode`, API `mode`                                            | The server normalizes both spellings at the boundary; responses use `mode` until the typed resolver exposes the domain alias. |
| `canonicalDescription`                                               | database `description`                                                 | The value is creator-editable story context, not an authoritative image identity by itself.                                   |
| `narrativeRole`, `appearanceNotes`, `objectType`, `continuityPolicy` | `metadataJson` (additive JSONB) until dedicated columns are introduced | The keys are versioned, validated, and never copied into a prompt without bounded normalization.                              |
| `aliases`                                                            | `vertical_drama_object_reference_aliases` child rows                   | Alias uniqueness is series-scoped and validated before detector matching.                                                     |
| `referenceMode = commercial_tie_in`                                  | `commercialProfile`                                                    | Commercial policy is active only when the profile is valid and the explicit commercial flag is true.                          |
| `commercialTieInEnabled`                                             | `commercialTieInEnabled` boolean                                       | Must be persisted or represented by an equivalent explicit policy state; it is never inferred from a Marketplace image.       |
| `confidence`                                                         | numeric `0..1`                                                         | Named confidence labels are a UI projection only; persistence uses one numeric scale.                                         |
| `approved` / `status`                                                | asset approval plus object/usage status                                | An archived object is not deleted and cannot be newly auto-linked.                                                            |
| `detection suggestion`                                               | `vertical_drama_object_detection_suggestions`                          | Suggestion status/fingerprint is durable and reviewable; it is not an active usage until accepted by policy.                  |

The source vocabulary is also normalized at the boundary: a creator-created
catalog object defaults to `manual`; `uploaded` maps to the asset source
`upload`, `history` maps to the physical library source while retaining
`history` as provenance, `library` maps to `library`, `generated` maps to
`generated`, and `legacy_product_tie_in`/`marketplace_capture` retain their
commercial provenance. Object-source and asset-source enums are separate. A
client must never send an arbitrary source string and have it silently
accepted. The migration must add `metadataJson` and
`commercialProfile` (or a documented equivalent) before Phase D/E consumes
those fields; storing them only in an undocumented JSON shape is not complete.

The public operation names in §11 are domain names. During migration, the
server may expose compatibility aliases such as `addObjectAsset` to the
physical route `addObjectReferenceAsset`, but both names must validate the
same schema and return the same typed result. Asset role values are likewise
normalized (`primary` API input maps to `canonical` domain meaning); the
mapping must be tested rather than inferred by the client.

Every write carries an idempotency key where the operation can be retried, and
every editor mutation either uses `expectedUpdatedAt`/revision or performs a
locked read-modify-write. A retry must not resurrect an archived object,
overwrite a newer manual override, or change a reviewed Special Episode's
source snapshot. Soft removal is the default for catalog and usage rows;
physical media deletion is never part of an Object Reference mutation.

### 6.7 Rollout flags, projection ownership, and hard invariants

Feature flags are part of the contract, not an implementation detail. The
server resolves them per tenant and fails closed when a flag is absent or
unreadable:

| Flag                                 | Controls                                                      | Default and compatibility rule                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verticalDramaObjectReferences`      | catalog tab, CRUD, asset management, and manual shot linking  | off until the additive migration and owner-scoped read/write tests pass; the old Product Tie-in flow remains available under its existing flag path. |
| `verticalDramaObjectDetection`       | context-aware candidate/usage detection and automatic linking | off or shadow-only by default; it must never be required by storyboard creation or episode reads.                                                    |
| `verticalDramaObjectImageGeneration` | paid object prompt/image generation                           | off by default; requires the existing explicit credit admission and confirmation flow.                                                               |
| `verticalDramaObjectLegacyBackfill`  | legacy Product Tie-in import/reconciliation                   | off by default; dry-run/report is allowed before apply and must be idempotent.                                                                       |

The feature must not silently use a partially enabled state: a disabled
optional flag produces a visible unavailable/capability state, while existing
Product Tie-in creation continues to work. Flag changes are observable and
must not remove already persisted catalog data or reviewed commercial
bindings.

Projection ownership is mandatory. A catalog link must carry a stable
projection identity (for example `shotObjectLinkId` in a projection ledger or
an equivalent ownership marker) so unlink/reconcile can remove only rows
created by that catalog link. It must never delete a pre-existing or
unclassified `vertical_drama_shot_references` row merely because its
`source = 'prop_object'`. Projection writes and catalog-link writes occur in
one transaction where the database supports it; otherwise the service records
an idempotent pending projection and retries/repairs it without losing the
last valid generation reference.

The server enforces the catalog, per-shot usage, asset-count, and provider
reference limits. A limit reached during automatic detection becomes a
skipped suggestion with a warning; a manually requested over-limit mutation
returns a typed validation error without deleting existing references.

## 7. Object catalog UX

### 7.1 Tab and routing

- Replace the visible tab label `สินค้าผูกเรื่อง` / `Product Tie-in` with
  `วัตถุประกอบฉาก` / `Object Reference`.
- Use a new stable route value such as `?tab=objects`.
- `?tab=product` must redirect or resolve to the Object Reference tab during
  the compatibility period; old shared links must not become blank pages.
- The tab must remain reachable for series with no objects. Empty state explains
  that objects are optional and story-critical, not required for generation.

### 7.2 Catalog list and object editor

The catalog uses the same central, wide workspace pattern as the existing
Product tie-in editor. Object creation, product addition, and reference-image
management must not be placed in a narrow side rail. The primary actions are
visible in the workspace header, while advanced commercial settings remain
progressively disclosed below the same surface.

Each object card shows:

- object name and type;
- “story secret/importance” summary;
- canonical image or an empty image slot;
- count of detail/alternate images;
- source/provenance badge;
- number of episodes/shots using it;
- detection/manual status;
- commercial tie-in badge only when explicitly enabled.

The unified tab may provide filters (`ทั้งหมด`, `วัตถุประกอบฉาก`,
`Commercial tie-in`) for clarity, but these are views over one catalog, not
separate data stores or tabs. When a commercial object is selected, show its
existing Product Tie-in fields (disclosure policy, forbidden claims, allowed
story functions, approval state, and ad-banner access) in a clearly labeled
`Commercial settings` panel. Hide that panel for `story_object` records.

The editor supports:

- create, rename, edit type, description, narrative role, appearance notes,
  continuity policy, and archive;
- drag/drop into the canonical or alternate image slot from the hard disk,
  Library, or History;
- choosing a Marketplace Capture product image as an object asset;
- reordering assets and choosing a new canonical image;
- edit prompt facts separately from the generated prompt;
- `สร้าง prompt วัตถุ` and `สร้างภาพวัตถุ (มีค่าใช้จ่าย)` actions;
- a “ใช้ในตอน/ช็อต” usage list with links back to the storyboard;
- detector evidence and an accept/reject/review action.

The default catalog query returns active objects only. Archived objects are
available through an explicit `includeArchived`/history view and are clearly
marked read-only for automatic linking. Existing approved usages of an
archived object remain resolvable for already reviewed storyboards until the
creator removes or replaces them; archive never silently changes a generated
prompt or media bundle.

Dragging an external image must go through the same managed-media import and
authorization path as existing Library/hard-disk uploads. The UI must not
persist an arbitrary remote URL merely because it was supplied by a drop event.

### 7.3 Shot-level UX

For an ordinary storyboard shot, show an `Object Reference` section with:

- automatically detected object chips marked `แนะนำโดยระบบ`;
- manually linked object chips;
- an object picker filtered to active series objects;
- add/remove/replace controls;
- a “link this shot to object” action even when the object has no image;
- an image-only drop zone for a shot-specific reference;
- drag/drop from the right-side Library/History panel or local disk;
- clear source labels: catalog, manual, generated, Marketplace Capture,
  or unclassified legacy reference.

Manual changes must take effect without regenerating the episode script. The
user should be able to fix a wrong object on one shot without being forced to
rerun the whole storyboard.

If a shot has an actual legacy commercial Product Tie-in placement, preserve a
compatibility badge and its disclosure/compliance controls until the placement
is explicitly converted or removed. Ordinary Object References must not show
commercial warnings or block states.

### 7.4 Special Episode UX (must remain one flow)

The existing `SpecialTieInEpisodeDialog` remains the only entry point for
creating a Special Episode. Do not add a second Object Reference wizard inside
it. Instead, change the reference area to use one shared Object Reference
picker with clear mode labels:

- `Object Reference — Commercial tie-in` for the selected product;
- `Scene/Location Reference` for a location or store;
- `Character Reference` for selected cast.

The product selection step may still display Marketplace products and product
images exactly as today, but selecting one must resolve/create one
`referenceMode = commercial_tie_in` catalog record and bind its managed assets
to the Special Episode. The creator should not have to create the object again
in the series Object Reference tab.

The existing `referenceType = product | location | store | mixed` remains a
transport/compatibility field during migration. It describes which special
reference families are enabled in that run; it is not a second object model.
For `mixed`, commercial object references and scene/location references travel
in separate typed lists so a product image cannot become a background scene.

Special Episode UI and behavior that must remain intact:

- Marketplace Capture product search, image selection, and materialization;
- selected characters and speaker/dialogue mode validation;
- model capability filtering for duration, aspect ratio, dialogue, and
  reference-image count;
- footage upload, analysis, preparation, timeline B-roll, and prepared-media
  state restoration;
- idea generation/history, scene duplicate review, story review, and exactly
  nine sequential shots;
- explicit credit admission, idempotency, retry, and job status;
- commercial disclosure, forbidden-claim screening, and human approval.

The Special Episode should not show an additional normal-story Object
Reference card beside the commercial reference card. It shows one unified
reference area and uses badges/tooltips to explain the mode. A commercial
Object Reference can also be used by the normal storyboard resolver only when
the creator explicitly links it there; doing so must retain commercial
compliance metadata.

### 7.5 UX simplicity and accessibility rules

The feature must be powerful without turning every shot card into a dense
configuration panel:

- Keep one primary action per surface: `เพิ่มวัตถุ` in the catalog and
  `เพิ่ม Object Reference` in a shot. Secondary actions (generate, archive,
  provenance, evidence, commercial settings) stay behind the object card menu
  or an expandable detail panel.
- Use progressive disclosure. The default catalog card shows name, type,
  canonical thumbnail, usage count, and one primary image/drop slot. Prompt
  facts, evidence, Marketplace provenance, compliance, and asset history open
  only when requested.
- In a Special Episode show one reference area with mode badges, not separate
  Product and Object panels. The existing product selector remains recognizable
  and is labeled `Object Reference — Commercial tie-in`.
- Keep the shot card compact: show a horizontal chip row with `เพิ่ม`,
  `เปลี่ยน`, and `ลบ`; show detailed evidence and source lists in a drawer or
  popover rather than repeating them in every shot.
- Never require the user to understand stable IDs, provider model IDs, or
  migration states. Technical details are available under “รายละเอียด” and
  error messages use a clear next action.
- Preserve the existing design system, spacing, responsive behavior, focus
  order, keyboard access, visible focus indicator, semantic labels, and screen
  reader names for every drop zone, chip, menu, dialog, and confirmation.
- Drag/drop is an accelerator, not the only path. Every drop action has a
  button-based file picker and a Library/History picker fallback.
- Disable only the action whose prerequisite is missing. For example, no
  image disables `สร้างภาพ` but does not disable `บันทึกวัตถุ`, `ผูกกับช็อต`,
  or storyboard creation.
- Use inline non-blocking warnings for missing/stale references and reserve
  blocking dialogs for destructive archive/delete confirmation, ownership
  errors, and explicitly paid generation confirmation.
- On narrow screens, stack the catalog details and move the Library picker into
  a sheet; do not require horizontal scrolling to reach `บันทึก`, `เพิ่ม`, or
  `ลบ`.

The UI must not auto-open a prompt editor, auto-start image generation, or
duplicate a catalog card when a detector suggestion arrives. Suggestions are
visually distinct from active links and can be accepted in one click.

## 8. Context-aware detection

### 8.1 Context inputs and precedence

Detection must read the smallest sufficient context pack, in this order:

1. series title, story brief, story bible, canonical facts, and unresolved
   hooks;
2. episode number, episode title, synopsis, outline, cliffhanger, and episode
   memory;
3. neighboring episode summaries when the episode is a continuation;
4. shot summary, action, dialogue, location, time-of-day, and attached
   character/location references;
5. existing object catalog names, aliases, descriptions, and approved object
   facts.

The detector must not rely on a single shot sentence when the series/episode
context contradicts it. It must record the context revision/fingerprint used
so a later story edit can mark suggestions stale rather than silently applying
old results.

### 8.2 Candidate extraction

The detector may create a candidate object only when the story indicates a
materially relevant physical entity, for example:

- a locked box that contains the story secret;
- a family ring or jade passed between characters;
- a weapon with a named owner or supernatural role;
- a document/key/device that is opened, hidden, stolen, found, or protected.

Generic background nouns such as “a chair”, “a phone”, or “a car” are not
catalog objects unless the story assigns them a specific recurring narrative
role or the creator manually promotes them.

Candidate matching uses normalized names and aliases, but must preserve
distinct objects with similar names. A name match alone is insufficient when
the type, owner, physical description, or story role conflicts.

The detector is a two-step pipeline: an LLM may extract candidate names,
aliases, actions, and evidence from the context pack; deterministic application
logic then validates IDs, normalizes aliases, checks continuity boundaries,
deduplicates candidates, applies confidence policy, and persists the result.
The LLM output is never allowed to write a catalog row or active shot link
directly. This keeps false detections reviewable and prevents a malformed model
response from changing the story or blocking episode creation.

### 8.3 Shot usage decision

For each candidate, classify the shot as:

| Result                           | Behavior                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `visible`                        | Suggest/link when the object is on screen or materially described as present.                                                 |
| `held` / `used`                  | High-priority suggestion/link; include object reference in prompt bundle.                                                     |
| `opened` / `locked` / `unlocked` | High-priority suggestion/link and preserve relevant state in evidence.                                                        |
| `mentioned`                      | Suggest only by default; do not add an image reference unless the creator accepts or the story explicitly says it is visible. |
| `uncertain`                      | Show review suggestion; never auto-link.                                                                                      |
| no match                         | No object link.                                                                                                               |

The detector must consider continuity context before applying a link:

- consecutive conversation or travel scenes can carry the same object forward;
- a character disembarking an aircraft and entering a car is one continuous
  event unless the story states a time/place break;
- a new day, flashback, unrelated location, or explicit scene transition does
  not require the same shot-level object usage;
- a series-canon object may reappear later without being continuously visible,
  but each usage still needs evidence or a manual link;
- object state changes (locked/opened/damaged) are metadata on usage/evidence,
  not a new object identity unless the creator creates a new variant.

This contextual rule is intentionally separate from wardrobe continuity. It
prevents false automatic links while still preserving important props across
connected scenes.

### 8.4 Confidence, review, and overrides

- `high` confidence may be auto-linked only when the match is explicit and the
  object catalog has an approved or creator-entered identity.
- `medium` confidence creates an accepted-by-review suggestion, not an active
  reference by default unless the series policy opts in.
- `low` or `uncertain` confidence is suggestion-only.
- Every automatic decision exposes “why this was linked” with source context.
- Accept/reject/edit actions are recorded and idempotent.
- A manual remove prevents the detector from re-adding the same object on the
  same story/context fingerprint until the user chooses “reset to automatic”.
- A manual replacement can select another catalog object or leave the shot
  unclassified.

### 8.5 Special Episode detection boundary

Special Episode product identity is authoritative from the user's selected
Marketplace/product reference and the reviewed Special Tie-in idea. The normal
series detector must not replace it, rename it, or create a second object from
the same product.

The Special Tie-in planner may additionally identify a narrative object inside
the reviewed idea (for example, a locked box used in the tie-in story), but it
must follow this order:

1. Resolve the selected product into the existing commercial Object Reference
   record.
2. Keep the product's commercial reference in the dedicated commercial list
   used by Special Tie-in compliance and prompt compilation.
3. Detect any separate story prop as `story_object` and link it only when the
   reviewed nine-shot output or the creator confirms that it is visible/used.
4. Keep location/store bindings in the scene/location list.
5. Never use the generic detector to silently add unrelated series characters,
   products, locations, or props to the Special Episode.

For a Special Episode, the continuity contract is the existing one-episode
beginning/middle/end sequence. Object usage may be present in all nine shots
when the reviewed story says so, but the planner must preserve the existing
tie-in stages and `referenceType` validation. A missing optional story-object
asset is a warning; a missing required commercial reference remains governed by
the existing Special Tie-in validation and must not be weakened by this
feature.

### 8.6 Detection timing and job isolation

Detection runs in two non-blocking stages:

1. **Series/episode candidate stage:** after story-bible or episode-story data
   exists, suggest canonical objects and aliases. This stage may run in the
   background and never gates the button that creates a new Storyboard.
2. **Shot usage stage:** after a shot plan exists, evaluate visible/held/used
   usage against the final shot text and the surrounding episode context. This
   stage writes suggestions/links independently of prompt or image jobs.

The normal episode creation job may snapshot the available catalog revision,
but it must not wait for detection to finish. If detection finishes after the
storyboard, the UI presents suggestions and the creator can accept them without
regenerating the story. If story text, episode synopsis, or the object catalog
changes, the affected suggestions become stale and are recomputed only when
the creator requests/re-enables detection.

Special Episode creation follows its existing order—reference selection,
reviewed idea, scene review, story review, then nine-shot materialization. The
commercial object binding is created synchronously only as part of the existing
selected-product materialization/validation boundary; optional story-object
detection is asynchronous and cannot delay or fail that flow.

## 9. Prompt and media-generation contract

### 9.1 Object prompt authoring

The object prompt generator receives:

- object name/type;
- narrative role and secret importance;
- appearance notes and canonical description;
- series story bible facts;
- relevant episode synopsis and shot context;
- state/action (`locked`, `opened`, `held`, etc.);
- selected canonical/detail images when available;
- Marketplace product metadata only as provenance, never as invented visual
  facts.

It returns structured data containing:

- concise visual description;
- material/shape/marking/scale facts;
- continuity constraints;
- positive image prompt;
- negative prompt or “do not change” constraints;
- confidence and unresolved questions.

The prompt must not invent a brand, logo, safety claim, price, or product
benefit. If the object is magical or secret, the prompt may describe the
story-grounded fictional function but must not present unsupported real-world
claims as facts.

Each prompt request writes a durable prompt-run/result record (using an
existing run-artifact ledger or a dedicated
`vertical_drama_object_prompt_runs` table) containing object/tenant ownership,
input context fingerprint, prompt version, model/provider, status
(`queued`/`succeeded`/`failed`/`stale`), bounded output, and non-blocking error
metadata. A newer object/story revision marks older prompt results stale; it
does not overwrite an approved asset or silently become the new canonical
prompt.

### 9.2 Image generation

- Generating an object image is an explicit paid action with a confirmation
  showing model, estimated cost, references, and the fact that it will create
  an asset for the catalog.
- Detection, linking, reordering, accepting a suggestion, and saving text are
  free.
- A failed generation leaves the object and existing assets intact.
- A successful image is stored as a managed media asset and remains a draft
  alternate until the creator approves it as canonical, unless the user
  explicitly chooses “replace canonical”.
- Reference-image limits and provider payload bounds remain enforced.
- Provider admission failure, timeout, or partial completion must reconcile
  credit/job state through the existing idempotency ledger; it must not charge
  twice or leave an untracked paid job.

### 9.3 Start-frame, image prompt, and video propagation

For every generation path that supports object references:

1. Resolve active catalog-linked shot usages to tenant-authorized managed media.
2. Merge selected shot asset, canonical asset, and approved detail assets with
   deterministic de-duplication.
3. Keep character identity and authoritative scene/location references at their
   existing higher priority.
4. Add object references after those higher-priority references and trim only
   optional object assets when the provider cap is exceeded.
5. Label multimodal attachments as `Object reference: <object name>`.
6. Include object identity/state in prompt text without replacing the visual
   evidence with prose.
7. If one object asset is unavailable, omit it and continue with a visible
   non-blocking warning.

The actual video renderer consumes the existing active shot reference
projection. It must not need to know whether an image originated in the catalog
or was a legacy per-shot reference.

### 9.4 Special Episode compilation mapping

The special adapter must compile the unified catalog into the existing Special
Tie-in contracts rather than introducing parallel prompt fields immediately:

| Unified catalog value            | Existing Special Tie-in projection                                                                             | Rule                                                                                     |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `commercial_tie_in` object asset | `referenceBindings.role = product`, `productReferenceAssetIds`, and the existing product clip reference fields | Preserve product presence, claim screening, disclosure, and required-reference behavior. |
| `story_object` asset             | `source = prop_object` shot reference and the shared object reference bundle                                   | Optional and non-blocking; never treated as a commercial claim.                          |
| Location object/asset            | `referenceBindings.role = location/store` and existing scene/location slot                                     | Never project as a product or prop merely because it is an image.                        |
| Character asset                  | Existing person binding/character reference path                                                               | Never infer a new character from an object image.                                        |

`buildSpecialTieInPromptArtifacts`, `resolveSpecialProductReferenceUrls`,
`resolveSpecialReferenceBindings`, and the existing shot prompt/image/video
resolvers must converge on one typed resolver. The resolver returns separate
commercial, story-object, scene/location, and character groups, then the
existing consumers receive their backward-compatible projections.

For `special_tie_in` episodes:

- the commercial product list is required exactly when the existing
  `referenceType` and selected references require it;
- preserve the current Special Tie-in input limit of at most three selected
  reference images and the selected model's lower `maxReferenceImages` cap;
  multiple catalog assets do not expand the provider payload automatically;
- commercial assets retain the existing higher-priority/reference-lock and
  disclosure behavior;
- story-object assets are appended as optional object references and may be
  omitted when the provider cap is reached;
- scene/location remains the primary background/environment input;
- the nine-shot adapter may continue to emit empty `image_prompt` and
  `video_prompt` values for lazy per-shot authoring, as it does today;
- the exact nine-shot, continuity, dialogue-mode, and special-stage contracts
  remain authoritative and are not changed by the catalog rename.

## 10. Marketplace Capture and commercial compatibility

Marketplace Capture may supply an object image, but the source is explicit:

- store `sourceProductId` and `sourceCaptureId` where available;
- preserve tenant/user authorization and managed-media ownership;
- display provenance in the object editor;
- do not copy marketplace description text into the story prompt as factual
  visual identity without creator review;
- do not enable commercial tie-in, ad disclosure, spoken claims, or affiliate
  behavior automatically for a normal-series object;
- a product selected through the existing Special Tie-in/Product flow is the
  deliberate exception: it is imported as the same Object Reference with
  `referenceMode = commercial_tie_in`, and immediately retains the existing
  product compliance path;
- allow the creator to explicitly convert a non-commercial object into a
  commercial placement only through a confirmation that explains the changed
  disclosure/claim/credit behavior.

Existing Product Tie-in records are migrated as follows:

1. Do not delete or rewrite the legacy JSONB during rollout.
2. Expose the old `productTieIn` record through the Object Reference surface as
   one imported Object Reference with `source = legacy_product_tie_in` and
   `referenceMode = commercial_tie_in`, not as a second visible Product tab.
3. Preserve original product IDs, capture IDs, image IDs, disclosure policy,
   and compliance metadata.
4. Map existing product reference images to object assets without duplicating
   the underlying managed media.
5. For Special Episode records, preserve the existing selected product binding
   and use the imported catalog identity as the source for future runs; do not
   force the user to reselect the product or recreate the special episode.
6. Only set `commercialTieInEnabled = true` for legacy records that actually
   represented a commercial placement. A normal story object defaults to false
   and requires explicit confirmation to enable.
7. Provide an idempotent reconcile operation and a report for records that
   cannot be safely imported.
8. Keep `tab=product` links functional until the new tab and compatibility
   projection are proven; then redirect them to `tab=objects`.

The migration must not make the existing `SpecialTieInEpisodeDialog` depend on
the new catalog transaction completing synchronously. If catalog import is
temporarily unavailable, the dialog continues using the existing validated
`SpecialEpisodeData.referenceBindings` and legacy product fields, records a
reconciliation warning, and retries the catalog projection later. This is a
compatibility fallback, not permission to drop commercial compliance.

## 11. API and service contracts

Add a series-scoped Object Reference service/router using existing tenant and
ownership helpers. Names are illustrative; final names should follow existing
Vertical Drama router conventions.

### 11.1 Existing function integration map

The implementation plan must trace and test these current boundaries instead
of wiring only the new tab:

| Current function/component                                                                                                                             | Integration requirement                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VerticalDramaProductTieInTab`                                                                                                                         | Be replaced or wrapped by the Object Reference catalog editor. Its existing Marketplace Capture selection, `productTieIn` read-modify-write, disclosure fields, and `VerticalDramaAdBannerStudio` compatibility must remain available for commercial objects.     |
| `SpecialTieInEpisodeDialog`                                                                                                                            | Remain the Special Episode entry point. Its Marketplace product/image queries, materialization, reference-type selector, character/dialogue validation, model queries, footage jobs, idea history, scene review, and create mutation must continue to work.       |
| `marketplaceCapture.listProducts` / `marketplaceCapture.listProductImages` / `materializeSpecialMarketplaceImage`                                      | Remain the product discovery/materialization path. Their output is linked to one commercial Object Reference, with the existing capture/product provenance preserved.                                                                                             |
| `generateMarketplaceReviewIdeas` / `selectMarketplaceReviewIdea` / `resolveMarketplaceReviewScene`                                                     | Remain the Special Tie-in idea, selection, and scene-review stages. Object detection may consume their reviewed output but cannot bypass or replace these stages.                                                                                                 |
| `enqueueSpecialTieInFootageAnalysis` / `enqueueSpecialTieInFootagePreparation` / `enqueueSpecialTieInFootageBrollRender` / `getSpecialTieInFootageJob` | Remain the footage-first job path and must not depend synchronously on Object Reference catalog reconciliation.                                                                                                                                                   |
| `specialTieInInputSchema` / `SpecialEpisodeData`                                                                                                       | Additive compatibility only. Keep `referenceType`, `referenceImages`, and `referenceBindings` valid while introducing catalog IDs/mode metadata; do not silently change the persisted schema version.                                                             |
| `resolveSpecialReferenceBindings` / `resolveSpecialProductReferenceUrls`                                                                               | Resolve catalog-backed managed assets with tenant checks and preserve role separation: person, commercial product, location, and store.                                                                                                                           |
| `buildSpecialTieInPromptArtifacts`                                                                                                                     | Compile catalog assets into existing `productReferenceAssetIds`, `extraReferenceAssetIds`, scene/location fields, and `prop_object` references without changing lazy prompt authoring or nine-shot behavior.                                                      |
| `verticalDramaProductTieIn.ts` (`planTieIn`, claim screening, disclosure, fatigue, quality report, reference merge)                                    | Continue to own commercial policy for `commercial_tie_in`; do not call it for ordinary `story_object` references.                                                                                                                                                 |
| `resolveTieInDraftBootstrap` / `VdTieInDraftContext` / `generateStoryBibleDeep` / `extendStoryDraftHorizon`                                            | Continue to supply the existing commercial Product Tie-in context to story planning. The object detector may add story-object candidates, but must not overwrite the existing tie-in placement plan or silently turn a normal story object into a paid placement. |
| `VerticalDramaSeriesMemoryTab` and `product_tie_in_usage` events                                                                                       | Keep commercial usage history readable. Add object usage events under a distinct object kind and show commercial usage only when `referenceMode = commercial_tie_in`.                                                                                             |
| `VerticalDramaAdBannerStudio` / ad-banner procedures                                                                                                   | Remain available from the commercial settings view and continue reading/writing legacy commercial metadata until all banner consumers migrate.                                                                                                                    |
| `verticalDramaSpecialSkillAdapter`                                                                                                                     | Keep exact-nine-shot, continuity, selected-character isolation, product-stage, and scene-separation instructions. Add optional story-object inputs without weakening required product checks.                                                                     |
| `verticalDramaEpisodes` shot resolvers                                                                                                                 | Use the unified typed resolver; preserve old product fields for special episodes and project ordinary object links to `source = prop_object`.                                                                                                                     |
| `VerticalDramaStoryboardPanel` / `VerticalDramaEpisodeWorkspace`                                                                                       | Show one object UI appropriate to the shot mode; do not render duplicate Product and Object sections. Preserve the existing upload/Library/History drag contract and non-blocking warnings.                                                                       |
| `VerticalDramaSeriesDetailPage`                                                                                                                        | Route `tab=product` to the unified Object Reference surface while preserving advanced-tab attention indicators and archived/read-only behavior.                                                                                                                   |
| `VerticalDramaSeriesDetailPage` tab attention state (`advancedPopulated`) / series list aggregates                                                     | Count active Object References for the unified tab, but retain the legacy Product Tie-in flag as a compatibility signal until the backfill is complete; never show two different “needs attention” meanings for the same tab.                                     |
| `marketplaceCapture.*` routers                                                                                                                         | Remain the source for product/capture search and image provenance; object linking must not bypass their authorization or managed-media materialization.                                                                                                           |

The implementation plan must include a call-flow test for both paths:

```text
Normal episode:
story context -> object detector -> catalog usage -> prop_object projection
  -> start-frame/image/video resolver

Special episode:
Marketplace/Product selection -> commercial Object Reference
  + Location/Store scene reference + Character bindings
  -> existing SpecialTieInEpisodeDialog/create flow
  -> existing nine-shot adapter/artifacts
  -> commercial compliance + optional story-object projection
  -> existing start-frame/image/video resolver
```

No new UI or service is complete until both paths have a test proving that
their typed reference groups do not cross-contaminate.

### Catalog operations

- `listObjectReferences({ seriesId, includeArchived? })`
- `createObjectReference({ seriesId, name, objectType, narrativeRole, ... })`
- `updateObjectReference({ seriesId, objectId, patch, expectedUpdatedAt? })`
- `archiveObjectReference({ seriesId, objectId })`
- `setCanonicalObjectAsset({ seriesId, objectId, assetId })`
- `addObjectAsset({ seriesId, objectId, assetId, role, source, ... })`
- `removeObjectAsset({ seriesId, objectId, assetLinkId })`
- `reorderObjectAssets({ seriesId, objectId, orderedAssetIds })`
- `ensureCommercialObjectReference({ seriesId, productId?, captureId?, assetIds, legacyProductTieIn })`

### Prompt and generation operations

- `generateObjectPrompt({ seriesId, objectId, episodeId?, shotNumber?, confirmation })`
- `generateObjectImage({ seriesId, objectId, promptVersion, modelId, references, confirmation })`
- `approveGeneratedObjectAsset({ seriesId, objectId, assetId, asCanonical? })`

Prompt generation must not spend image-generation credits unless the operation
explicitly requests image generation. Image generation must use the existing
credit admission/idempotency pattern.

### Detection and shot usage operations

- `detectObjectCandidates({ seriesId, episodeId?, contextRevision })`
- `detectShotObjectUsages({ seriesId, episodeId, shotNumbers?, contextRevision })`
- `acceptObjectSuggestion({ seriesId, suggestionId, expectedFingerprint })`
- `rejectObjectSuggestion({ seriesId, suggestionId, expectedFingerprint })`
- `linkShotObject({ seriesId, episodeId, shotNumber, objectId, usageType, manualOverride })`
- `unlinkShotObject({ seriesId, episodeId, shotNumber, objectId })`
- `replaceShotObject({ seriesId, episodeId, shotNumber, fromObjectId, toObjectId })`
- `resetShotObjectToAutomatic({ seriesId, suggestionId?, episodeId, shotNumber, objectId })`
- `listObjectUsages({ seriesId, objectId, episodeId? })`
- `reconcileSpecialEpisodeObjectReferences({ seriesId, episodeId, expectedInputVersion })`

All mutation inputs must validate positive IDs, bounded strings/arrays, allowed
enum values, maximum asset counts, and the current user's tenant ownership.
Concurrent edits must use the repository's existing expected-version or
read-modify-write conflict convention.

`ensureCommercialObjectReference` is idempotent on the existing product/capture
identity. It must return the same catalog object when called repeatedly by
Special Tie-in creation, retry, or refresh. It must not create an ordinary
`story_object` merely because the product image was used as a visual reference.

### 11.2 v1 API boundary and deferred operations

The first implementation must expose these concrete operations before any
optional detector or paid image-generation work is enabled:

- `listObjectReferences`, `createObjectReference`,
  `updateObjectReference`, and `archiveObjectReference`;
- `addObjectReferenceAsset` and `removeObjectReferenceAsset`, accepting only
  resolved tenant-owned `mediaAssetId` values;
- `linkShotObjectReference` and `unlinkShotObjectReference`, with an atomic or
  retry-safe projection to `source = prop_object`;
- `ensureCommercialObjectReference`, callable from the existing Special Tie-in
  flow without becoming a synchronous prerequisite for episode creation.

`includeArchived` is explicit and defaults to `false`; an omitted value must
never accidentally broaden a normal catalog query. Every retryable mutation
listed above accepts the common bounded `idempotencyKey` and returns the
canonical resource revision/status. The examples in §11 are abbreviated
operation names, not permission to omit that envelope from the physical API.

The following are explicitly Phase D/E operations, not hidden assumptions of
the v1 CRUD API: canonical reordering, object prompt generation, paid object
image generation, suggestion accept/reject/reset, full usage listing,
legacy backfill, and Special Episode reconciliation. They must either be
implemented behind their own capability/feature state or remain visibly
unavailable; a missing optional operation must not be represented as a
successful no-op.

All object and usage mutations must return a typed result containing the
canonical ID, current revision/status, and any non-blocking warning. `404`
must be used for an object outside the caller's tenant/series scope, rather
than revealing whether it exists. `409` is reserved for an expected-version
conflict so the UI can reload instead of silently overwriting a manual change.

### 11.3 Read purity, media import, and asynchronous detection contract

Read procedures, including episode detail queries, are read-pure: they must
not mutate shot links, create catalog rows, or trigger paid work as a side
effect of rendering a page. If detection should run after a read, the server
enqueues a deduplicated, tenant-scoped advisory job/outbox event and returns
the existing episode data immediately. The job stores context revision,
fingerprint, detector version, and retry state; duplicate page loads do not
create duplicate links or jobs.

Library/History drag-and-drop sends a trusted library item or server-issued
managed asset identifier. It must not send a raw remote URL as the authority
for an Object Reference. If the existing import resolver accepts URLs for
legacy callers, this feature must restrict it to same-origin/managed broker
URLs or an explicit SSRF-safe import path with scheme, host, redirect, size,
MIME, timeout, and content validation. The server rechecks tenant ownership
before attaching the resulting `mediaAssetId`.

The error vocabulary is part of the client contract: `NOT_FOUND` for an
out-of-scope target, `CONFLICT` for a stale revision/fingerprint,
`BAD_REQUEST` for invalid limits or enums, `CAPABILITY_DISABLED` for an
optional flag that is off, and a structured warning result for detector,
projection, provider, or media availability failures. When the transport is
tRPC, `CAPABILITY_DISABLED` is a stable application error code carried inside
the repository's supported transport error (normally `FORBIDDEN`); it is not
an invented tRPC protocol code. Generic internal errors must not be used as
the normal response for these cases.

All retryable writes accept a bounded `idempotencyKey` in the mutation input
and return the original result for the same key and request hash. A reused key
with a different request hash returns `CONFLICT`; it must not partially apply
the second request. The key scope includes tenant, user, operation, and
resource identity, with retention long enough to cover the client retry
window.

The Special bridge is asynchronous but durable: after the episode ID and
input version exist, it must enqueue or retry creation of the episode binding
and preserve the product/capture fingerprint. Fire-and-forget from the client
alone is not sufficient because a closed browser must not lose the
reconciliation event.

Advisory outbox jobs use bounded retry (default three attempts with
exponential backoff and jitter), then enter an inspectable `failed` state with
the next action and owner. They must not retry indefinitely, invoke paid
generation, or turn an advisory failure into a storyboard failure.

## 12. Failure handling and non-blocking policy

The following are warnings or recoverable statuses, never storyboard blockers:

- no object is detected;
- a detected object has no image;
- context is ambiguous;
- detector/LLM timeout or malformed output;
- object prompt generation fails;
- object image generation fails;
- a Library/Marketplace image is unavailable or expired;
- a single managed-media URL cannot be resolved;
- object projection is stale or exceeds provider reference capacity.

The UI must show an actionable message and preserve the last valid data. It
must not render a red “stop at storyboard” error for these cases. Automatic
detection is isolated from the core storyboard creation job so a detector
failure cannot fail an otherwise valid episode generation.

Only ordinary validation/security failures should be hard errors: unauthorized
tenant access, invalid object/shot IDs, disallowed file type/size, malformed
mutation input, or an explicitly confirmed paid operation whose admission
facts changed before spending.

## 13. Security, privacy, and cost controls

- Enforce tenant + user + series ownership on every catalog, asset, usage, and
  Marketplace Capture operation.
- Resolve provider references only through the existing managed-media broker;
  do not fetch arbitrary user-controlled URLs server-side.
- Apply existing upload MIME, byte, image dimension, and payload limits.
- Never expose raw Marketplace credentials or private capture URLs in prompts,
  client logs, or audit payloads.
- Redact story secrets from general-purpose logs; evidence shown in the UI may
  be scoped to the series owner.
- Detection and linking are free and idempotent.
- Paid prompt/image actions show model, references, expected credits, and
  confirmation before admission.
- Repeated clicks with the same idempotency key cannot create duplicate paid
  generation jobs.
- Object reference failures must remain request-specific and must not poison
  provider-wide health or remove otherwise routable models.

## 14. Acceptance criteria

### Catalog and assets

1. A creator can open the renamed `วัตถุประกอบฉาก / Object Reference` tab on a
   series with zero objects and see a useful empty state.
2. A creator can create an object with only a name and description; an image is
   optional.
3. The creator can drag an image from the local hard disk into the canonical
   slot and see it persisted as a managed, tenant-owned asset.
4. The creator can drag an image from the right-side Library/History panel into
   the canonical or alternate slot without a second upload workflow.
5. The creator can choose a Marketplace Capture image and see its provenance.
6. The creator can reorder assets and change the canonical asset without
   changing the object identity.
7. Archive hides an object from new suggestions but preserves existing usage,
   audit history, and media assets.
8. The default catalog and shot views expose only the primary action and the
   minimum identity/image/usage information; evidence, prompt facts,
   Marketplace provenance, and commercial settings are progressively
   disclosed instead of repeated on every card.
9. Every drag/drop action has an equivalent button/file-picker path, and the
   controls remain keyboard- and screen-reader-accessible.
10. Missing optional prerequisites disable only the affected action and never
    hide or disable object save, shot linking, or storyboard creation.

### Context and detection

11. Detection reads series story context, episode synopsis, neighboring episode
    context when applicable, and shot action—not only a single shot label.
12. A recurring locked box/secret object mentioned and used across connected
    scenes is matched to one catalog object, not recreated per shot.
13. A generic object noun is not automatically promoted to the catalog without
    narrative importance or creator action.
14. A new day, unrelated location, flashback, or explicit time break does not
    cause unconditional shot-level carry-over.
15. Every automatic suggestion shows confidence and evidence/context source.
16. Mention-only or uncertain matches remain suggestions and do not silently
    attach image references.
17. A manual remove/replace survives a later detector run until reset to
    automatic.
18. Re-running detection with the same context fingerprint is idempotent and
    does not duplicate objects or shot links.

### Storyboard and generation

19. A creator can manually link, unlink, replace, or add an unclassified object
    reference on any ordinary shot without regenerating the episode.
20. Active catalog links project into the existing per-shot `prop_object`
    generation bundle with deterministic ordering and de-duplication.
21. Start-frame image prompt generation, start-frame image generation, and
    video generation receive approved object images as multimodal references
    when the target path supports them.
22. Object reference assets are labeled as object references and do not replace
    higher-priority character/location identity or scene anchors.
23. An unavailable object asset is omitted with a non-blocking warning; the
    shot remains generateable.
24. Detection, linking, prompt saving, and image import never spend credits.
25. Object image generation requires explicit paid confirmation and preserves
    the object if the provider fails.
26. A generated object image is not silently made canonical unless the creator
    chose that behavior.

### Migration and compatibility

27. Existing `tab=product` links resolve to the new Object Reference surface
    during rollout.
28. Existing Product Tie-in data remains readable and no legacy JSONB is deleted
    by migration.
29. Existing product/capture/media provenance and commercial disclosure data are
    preserved; ordinary imported objects default to non-commercial.
30. Existing unclassified per-shot `prop_object` references remain usable.
31. Actual commercial placements retain the old compliance/disclosure path until
    explicitly converted or removed.

### Special Episode compatibility

32. A Special Episode continues to start from the existing
    `SpecialTieInEpisodeDialog`; no second object-creation flow is required.
33. Selecting a Marketplace/product reference creates or reuses one
    `commercial_tie_in` Object Reference and does not create a duplicate object
    when the dialog is retried, refreshed, or used for another shot.
34. A Special Episode with `referenceType = product` or `mixed` still requires
    the same commercial product reference and preserves its disclosure,
    forbidden-claim, human-approval, credit, and idempotency rules.
35. Location/store references remain scene/location inputs and cannot appear as
    product/object assets solely because the Special Episode uses a product.
36. The Special Episode still produces exactly nine sequential shots with its
    existing dialogue-mode, continuity, footage-first, story-review, and B-roll
    behavior; Object Reference integration does not alter those contracts.
37. An optional story prop detected inside a Special Episode is represented by
    the same catalog and `prop_object` projection as a normal episode, while the
    selected commercial product remains in the existing product projection.
38. If catalog reconciliation is temporarily unavailable, the Special Episode
    can continue on its existing validated reference bindings and later retry
    reconciliation without dropping product compliance.

### Reliability and security

39. A detector timeout, malformed detector response, prompt failure, image
    fetch failure, or object projection failure cannot stop storyboard creation
    or episode continuation.
40. Unauthorized cross-tenant object, asset, shot, or Marketplace Capture
    access is rejected without disclosing whether the target exists.
41. Arbitrary remote URLs cannot be persisted or fetched as trusted object
    references.
42. Focused tests cover duplicate prevention, manual override precedence,
    continuity segmentation, provider cap trimming, and non-blocking failure
    behavior.

## 15. Test and verification plan

### Shared/pure logic

- object name/alias normalization and candidate de-duplication;
- visible-vs-mentioned usage classification;
- continuity segment classification for same event, travel, new day, flashback,
  and unrelated location;
- confidence threshold and manual override precedence;
- deterministic asset ordering, de-duplication, and cap trimming;
- object prompt input/output schema validation.

### Server/service tests

- catalog CRUD, archive, canonical asset uniqueness, and optimistic conflict;
- tenant/user/series ownership on every operation;
- idempotent candidate and shot-usage detection;
- legacy Product Tie-in import/reconcile without destructive writes;
- projection into `prop_object` shot references;
- start-frame/image/video request composition;
- optional object failure remains non-blocking;
- Marketplace Capture provenance and managed-media authorization;
- credit admission and idempotency for image generation;
- request-specific reference failures do not poison provider health.
- Special Tie-in contract tests prove product/location/store/person groups stay
  separate and the exact-nine-shot output remains valid.
- `ensureCommercialObjectReference` is idempotent across create, retry,
  refresh, and legacy-reconcile paths.

### Client tests

- tab rename and `tab=product` compatibility routing;
- empty/loading/error/archive states;
- local file drop and Library/History drag/drop into catalog slots;
- Marketplace Capture picker;
- object chip suggestion/accept/reject/manual override flows;
- shot add/remove/replace and unclassified reference behavior;
- warning states do not disable storyboard creation;
- object prompt/image generation confirmation and retry states.
- Special Tie-in dialog still renders one unified reference area, retains the
  current product selector, and does not render a duplicate normal Object
  Reference panel.
- legacy product compliance/disclosure controls remain available after the tab
  rename.

### Browser/E2E proof

At minimum, verify one real owner-scoped series:

1. create a locked-box object;
2. add the supplied/reference image from disk or Library;
3. detect or manually link it to shots 1–5;
4. verify the usage list and shot chips;
5. inspect the generated prompt/reference mapping;
6. simulate an unavailable image and confirm the shot remains usable;
7. open the old `tab=product` URL and confirm compatibility routing.
8. create a Special Episode from the existing dialog, select a Marketplace
   product, and verify it reuses one commercial Object Reference while the
   selected location remains a scene reference.
9. retry/refresh the Special Episode flow and verify no duplicate object or
   lost commercial reference is produced.

Focused tests and a production build do not by themselves prove provider
availability, browser behavior, database migration success, or production
deployment; each must be reported separately.

## 16. Rollout and migration

### Phase A — contracts and shadow detection

- add shared object types and pure detector contracts;
- run detector in shadow mode against existing story/episode data;
- emit counts of candidates, confidence, auto-link eligibility, and ambiguity;
- do not change generation or UI behavior.

### Phase B — catalog and manual linking

- add additive tables/migrations and ownership tests;
- release the Object Reference tab and manual catalog/asset/shot linking;
- preserve the existing per-shot `prop_object` path;
- keep `SpecialTieInEpisodeDialog` on the existing transport contract and add
  an idempotent commercial-object adapter behind it;
- enable `tab=product` compatibility routing.

### Phase C — compatibility import and projection

- idempotently import legacy Product Tie-in records;
- show provenance and commercial compatibility state;
- reconcile existing Special Episode product bindings into the same catalog
  without rewriting `SpecialEpisodeData` or changing its schema version;
- project catalog links into per-shot generation references;
- provide an admin/user report for unresolved imports.

### Phase D — advisory automatic detection

- enable candidate and shot-usage suggestions behind a feature flag;
- default to suggestion-only for medium/low confidence;
- measure accept/reject/reset rates and false-link corrections;
- keep all failures non-blocking.

### Phase E — prompt/image generation and full propagation

- enable object prompt authoring and explicitly confirmed image generation;
- verify start-frame and video reference bundles against provider caps;
- enable auto-link only for high-confidence, explicit matches after observed
  false-positive rate is acceptable.

Rollback must disable automatic detection and new paid generation without
removing catalog records or managed media. The compatibility projection can be
recomputed from legacy data or catalog links.

### 16.1 Physical migration gate

Migration `0277_vertical_drama_object_references` is an additive foundation
only when it creates the four ownership-scoped tables. It is not evidence that
Feature 174 is complete: the current baseline shape must be followed by an
additive migration (for example `0278`) or an explicitly versioned equivalent
that adds the metadata, asset lifecycle, usage audit, Special binding, and
projection-ownership fields required in sections 6.1–6.7. The implementation
must not enable Phase D/E against the foundation-only shape.

Before enabling any write path in a target environment, the migration runbook
must prove: migration-ledger parity, all required constraints/indexes,
tenant-scoped foreign-key behavior, a dry-run legacy report, and rollback
behavior that leaves legacy `productTieIn`, Special input, shot references,
and managed media unchanged. Legacy import is a separately resumable job, not
a long-running or paid operation hidden inside the schema migration.

The compatibility route and old Product Tie-in consumers are retained until a
reconciliation report proves every eligible legacy record has either an
idempotent commercial Object Reference binding or an explicit unresolved
reason with a retry owner. A successful table creation alone cannot close the
compatibility gate.

## 17. Observability and success metrics

Record structured, tenant-safe events for:

- object created/edited/archived;
- asset imported/generated/approved/removed;
- detection candidate and usage result with confidence/fingerprint;
- accept/reject/manual override/reset;
- projection success/skip/failure and omitted asset count;
- non-blocking provider/media failure;
- paid object image generation admission/completion/failure.

Success metrics:

- percentage of recurring story-critical objects with a canonical asset;
- duplicate object rate after detection;
- accept/reject and manual correction rate;
- object reference presence in generated start frames/videos;
- number of storyboard jobs blocked by object handling (target: zero);
- optional-object failure recovery rate;
- median asset import and projection latency;
- credit spend attributable to explicitly confirmed object image generation.

## 18. Implementation defaults (no product decision required)

The following defaults close the v1 design decisions. The implementation plan
may tune numeric limits only when the selected provider's capability is lower;
it must not change the semantic rules without a new spec revision.

1. Limit the catalog to 100 active objects per series, 5 active object usages
   per shot, and the smallest provider-supported reference-image cap. The UI
   explains the limit and offers replacement/reordering instead of creating an
   unbounded list.
2. Run high-confidence auto-link in shadow mode first. Enable automatic active
   linking only after false-link metrics are reviewed; until then, high-
   confidence results appear as one-click suggestions.
3. Generated detail/alternate images are drafts and require creator approval
   before becoming canonical.
4. A legacy Product Tie-in with regulated disclosure is imported as one
   `commercial_tie_in` Object Reference while preserving the legacy projection
   and requiring the existing commercial compliance rules.
5. Object catalog records are series-scoped in v1. Cross-season sharing is a
   later feature and must not weaken tenant/series ownership checks.
6. Retain the legacy `productTieIn` JSON until every consumer—normal episode
   planning, Special Tie-in creation, disclosure/QC, ad-banner studio, and shot
   media resolvers—reads the unified service and a production backfill audit is
   complete.
7. A Special Episode may use both one commercial product object and separate
   story props. They must remain distinct typed groups so the product cannot
   become a background scene and the story prop cannot accidentally trigger
   advertising claims.

## 19. Implementation completion gate

Feature 174 is not considered complete when the new tab merely renders. The
implementation must demonstrate, with focused tests and one browser flow, that
the following matrix remains true:

| Flow                                   | UI surface                                                     | Canonical source                                           | Existing behavior that must survive                                                                                  |
| -------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Normal episode + story prop            | Object Reference tab + storyboard shot                         | Object catalog + shot usage                                | Non-blocking detection, `prop_object` projection, prompt/image/video propagation                                     |
| Normal episode + no prop               | Object Reference tab + storyboard shot                         | No object usage                                            | Storyboard creation remains unchanged and no empty-object error blocks it                                            |
| Special Episode + product              | Existing Special Tie-in dialog, unified Object Reference label | Commercial Object Reference backed by product/capture      | Product presence, nine shots, scene separation, dialogue/footage flow, disclosure, claims, credit and retry behavior |
| Special Episode + product + story prop | Existing Special Tie-in dialog + shot Object Reference chip    | Commercial object plus story object, separate typed groups | No cross-contamination between product, prop, scene, and character references                                        |
| Legacy Product Tie-in data             | Object Reference tab via compatibility route                   | Legacy JSONB plus imported catalog projection              | No data loss, no duplicate object, old `tab=product` URL works                                                       |

Any failure in this matrix is a release blocker for the implementation plan,
but an object detection/reference failure at runtime remains a non-blocking
warning for creators as specified above.

## 20. Ten-pass completeness audit

This specification was re-audited in ten independent passes. The following
decisions are part of the spec and close the identified gaps:

1. **Scope and naming:** one visible `Object Reference` surface, with
   `story_object` and `commercial_tie_in` modes; `tab=product` remains a
   compatibility alias.
2. **Domain boundaries:** locations/stores remain scene references; characters
   remain character references; only physical story objects enter this catalog.
3. **Persistence:** catalog, assets, shot usages, and Special Episode bindings
   are separate rows with tenant/user/series ownership and soft lifecycle
   states.
4. **Field consistency:** logical fields now have an explicit physical/API v1
   mapping, including `mode`, `description`, `metadataJson`, and numeric
   confidence; no implementation may invent a second synonym silently.
5. **CRUD and concurrency:** create/edit/archive/asset/link operations,
   idempotency, expected-version conflicts, 404 scope behavior, and soft
   removal are explicitly defined.
6. **Normal episode flow:** object usage is optional, can be manually changed
   per shot, and projects into the existing `prop_object` path without
   regenerating the storyboard.
7. **Context and continuity:** detection uses story/episode/neighbouring
   context, distinguishes mention from visibility, and respects new-day,
   flashback, location, and travel boundaries; it does not infer wardrobe or
   scene continuity.
8. **Special/Product compatibility:** the existing Special Tie-in dialog,
   product compliance, disclosure, claims, credits, footage, B-roll, and
   exactly-nine-shot flow remain authoritative; catalog reconciliation is
   retryable and cannot block episode creation.
9. **Media and UX:** Library, History, and local files converge on managed
   media; provider caps, canonical/alternate semantics, progressive disclosure,
   keyboard access, mobile layout, and non-blocking warnings are specified.
10. **Safety, operations, and proof:** arbitrary URL fetching, cross-tenant
    access, accidental paid work, provider-health poisoning, migration
    backfill, rollback, observability, focused tests, and browser proof are
    separately required and must not be claimed from unit tests alone.

### 20.1 Implementation-readiness note

The additive migration and current CRUD/UI baseline may be delivered before
Phase D/E detection and paid object-image generation. That baseline is not
allowed to claim full Feature 174 completion until the completion matrix,
legacy reconcile, Special Episode binding, detector override behavior, and
browser flow in sections 14–19 are proven. This keeps the specification honest
and prevents a visible tab or a best-effort name match from being mistaken for
the complete context-aware system.

### 20.2 Baseline-to-complete gap register

The current baseline may contain the additive catalog CRUD, basic asset import,
compatibility tab, non-blocking commercial bridge, and a deterministic first
pass of shot matching. The following items remain mandatory before the
completion gate can be marked green:

| Gap                                                                 | Required closure                                                                                                                                                                              | Release consequence                                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Catalog metadata is richer than the first physical table            | Persist/validate `metadataJson` or dedicated fields for object type, narrative role, appearance, continuity, and commercial profile.                                                          | Do not enable context-aware detection or prompt generation against incomplete facts.                  |
| Commercial enablement has no physical flag in the foundation        | Persist `commercialTieInEnabled` or an equivalent explicit policy state and validate it with `commercialProfile`; never derive commercial mode from image source.                             | Disclosure and claim rules cannot be trusted until the policy state is explicit.                      |
| Minimal create flow conflicts with required object fields           | Default `objectType` to `other` and catalog source to `manual` when the creator supplies only name/description; validate richer fields later without blocking creation.                       | The promised image-optional empty flow must not fail schema validation.                               |
| Detector aliases are described but not persisted                    | Store normalized series-scoped aliases and validate them against object type/role before matching.                                                                                            | A repeated alias cannot be matched reliably or safely distinguish similar objects.                    |
| Suggestion storage has no physical contract                         | Add `vertical_drama_object_reference_aliases` and `vertical_drama_object_detection_suggestions` with indexes, TTL, fingerprint, and review-decision fields.                                   | Alias matching and accept/reject/reset cannot be durable until these rows exist.                      |
| Source vocabulary has a history/API mismatch                        | Map `history` to the physical library source with retained provenance, and test `primary`/`canonical` and `uploaded`/`upload` mappings at the boundary.                                       | A Library/History drop can otherwise be mislabeled or rejected inconsistently.                        |
| Asset lifecycle is richer than a bare link                          | Add canonical/detail/alternate roles, approval state, ordering, source provenance, and transactional single-canonical enforcement.                                                            | Generated images remain drafts; provider payload ordering is not yet authoritative.                   |
| Asset removal is destructive in the baseline                        | Persist active/removed attachment state with `removedAt`; never delete the underlying managed media as part of catalog editing.                                                               | Reattach/history/retry cannot be safe until asset removal is reversible.                              |
| Shot link state needs audit semantics                               | Persist usage type, evidence, fingerprint, manual override, stale/removed state, and selected asset.                                                                                          | Suggestions cannot safely override creator decisions until this is present.                           |
| Projection ownership is not represented by a catalog link           | Add a projection ledger/ownership marker and make unlink/reconcile delete only rows written by that link; preserve old/unclassified `prop_object` rows.                                       | Unlink and retry are unsafe until legacy references are provably protected.                           |
| Dedicated rollout capabilities are not present in the baseline      | Add per-tenant fail-closed flags for catalog, detection, paid generation, and legacy backfill; keep the old Product Tie-in path independent.                                                  | Optional behavior must not unexpectedly activate or alter the existing flow.                          |
| Special product selector is still Marketplace-first in the baseline | Keep Marketplace search as the compatible input, but resolve the selected product through the unified commercial Object Reference identity and durable post-create binding.                   | A background bridge alone cannot claim that Special/Product is already backed by the catalog.         |
| Special Episode binding needs durable lineage                       | Write/read `vertical_drama_episode_object_references` and retain the reviewed product/capture snapshot.                                                                                       | The existing dialog remains the fallback, but Feature 174 is not fully complete.                      |
| Commercial source provenance can be conflated                       | Derive `source` and `commercialProfile` from the actual Marketplace Capture/legacy input; never label every commercial bridge call as legacy.                                                 | Provenance and disclosure decisions cannot be trusted until source identity is exact.                 |
| Detection needs context, not only string matching                   | Implement the two-stage context pack, continuation/time/place segmentation, confidence policy, and suggestion review state.                                                                   | Keep automatic active linking disabled or shadow-only.                                                |
| Detection currently runs from a read path                           | Move detection to a deduplicated advisory job/outbox or explicit mutation; episode detail must remain read-pure and immediate.                                                                | Page refreshes must not mutate story state or create repeated detector work.                          |
| Pending suggestions have no durable review identity                 | Persist suggestion/run state with evidence, context fingerprint, detector version, and accept/reject decision; review by suggestion ID.                                                       | Suggestions cannot safely expire, retry, or preserve a manual decision.                               |
| Manual remove can be re-added by detection                          | Keep an auditable removed tombstone with `manualOverride`; detector must honor it until explicit reset.                                                                                       | A creator's per-shot correction must not disappear on refresh or re-run.                              |
| Resolver and projections need one typed source                      | Make normal and Special paths consume one resolver that separates product, story object, scene, and character groups and enforces provider caps.                                              | Any cross-contamination is a release blocker.                                                         |
| v1 API surface is smaller than the promised workflow                | Add/advertise capability states for canonical selection, reorder, shot suggestions/overrides, usage listing, and Special reconciliation; do not expose silent no-ops.                         | Creators must understand what is available in each rollout phase.                                     |
| Unified tab still contains a legacy editor in the baseline          | Keep legacy fields reachable in one progressive compatibility panel, but route all new catalog edits through the same Object Reference record; do not render a second competing CRUD surface. | The renamed tab must not become two visually different systems on one page.                           |
| Archive query contract is not wired in the baseline                 | Add `includeArchived=false` to the physical list input and an explicit history mode; ensure the default response cannot include archived rows accidentally.                                   | Users may see archived objects as active or auto-linkable.                                            |
| Lifecycle-aware uniqueness is missing from the foundation           | Use active-aware unique constraints for asset links, shot usages, and Special bindings so soft removal permits safe reattach without duplicate active rows.                                   | Retry and history behavior is ambiguous until the database constraint matches the lifecycle contract. |
| Prompt generation and observability are not in the baseline         | Gate prompt/image operations explicitly, persist prompt version/result state, and emit structured tenant-safe events for detection/projection/media failures.                                 | A visible button or console warning cannot be treated as a complete generation or operations flow.    |
| Prompt-run and paid-job reconciliation are not physical             | Persist prompt-run status/fingerprint and reconcile provider/credit state through the existing idempotency ledger.                                                                            | A prompt button can otherwise show success while the paid job or stale result is untracked.           |
| Retry identity is only prose in the baseline                        | Add bounded `idempotencyKey` and request-hash handling to every retryable mutation, including the Special bridge and suggestion decisions.                                                    | Repeated clicks can otherwise partially duplicate or overwrite work.                                  |
| Archive/list semantics are not explicit in the baseline             | Default to active-only listing, expose archived history explicitly, and keep existing archived-object usages resolvable until intentionally removed.                                          | Archive could unexpectedly hide reviewed references or allow auto-linking to archived objects.        |
| Advisory retry policy is unspecified                                | Bound outbox retries, backoff, terminal failure state, next action, and owner; never retry forever or invoke paid work.                                                                       | A detector outage could create load or indirectly block the storyboard path.                          |
| Shot UX needs catalog identity controls                             | Add active-object picker, accept/reject/reset, usage evidence, canonical replacement, and unclassified legacy handling without expanding the shot card excessively.                           | Catalog-only UI is insufficient for the promised per-shot workflow.                                   |
| API errors and concurrency are underspecified in baseline code      | Map domain failures to typed `NOT_FOUND`/`CONFLICT`/`BAD_REQUEST`/`CAPABILITY_DISABLED` results and require revision/idempotency inputs on writes.                                            | Generic errors or last-write-wins behavior can hide ownership and manual changes.                     |
| Media import currently has a URL-shaped client path                 | Make Library/History selection use managed IDs and constrain any URL import to the existing broker/SSRF-safe resolver with ownership recheck.                                                 | Raw remote URLs cannot become trusted references or an SSRF path.                                     |
| Catalog limits are not enforced at the service boundary             | Enforce active-object, per-shot usage, asset, and provider-reference caps server-side with non-destructive typed outcomes.                                                                    | Automatic detection must skip safely; manual over-limit writes must be predictable.                   |
| Migration needs an operational backfill                             | Add dry-run/report/retry/idempotency, apply the additive migration in the target environment, and prove legacy data is unchanged.                                                             | Do not claim legacy compatibility from schema creation alone.                                         |
| Proof needs browser and runtime evidence                            | Complete the owner-scoped browser flow, provider-cap checks, Special retry, and non-blocking failure scenarios separately from unit tests.                                                    | Unit tests/build alone cannot mark the feature complete.                                              |

## 21. Second ten-pass audit record

This second audit was performed against the current repository baseline, not
against the prose alone. Each pass asks a different completeness question and
records the resulting rule or release gate:

| Pass | Review lens                     | Result and required closure                                                                                                                                                                                                                                      |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Scope and naming                | Closed: one visible Object Reference surface; `story_object` and `commercial_tie_in` remain explicit modes; `tab=product` is compatibility-only.                                                                                                                 |
| 2    | Domain separation               | Closed: object, character, wardrobe, location/store, product, and scene references have separate typed groups; Special commercial policy cannot leak into ordinary props.                                                                                        |
| 3    | Physical data model             | Gap made explicit: migration `0277` is foundation-only; metadata, asset lifecycle, usage audit, Special lineage, and projection ownership require the follow-up migration gate in §16.1.                                                                         |
| 4    | Naming and API consistency      | Closed: `mode`/`referenceMode`, `description`/`canonicalDescription`, source vocabulary, numeric confidence, typed errors, and revision/idempotency rules are mapped in §§6.6 and 11.2–11.3.                                                                     |
| 5    | CRUD and concurrency            | Gap made explicit: baseline handlers are not complete until archive/revision conflicts, canonical uniqueness, limits, 404 scope behavior, and soft removal are enforced and tested.                                                                              |
| 6    | Normal storyboard flow          | Closed by contract: no object, no image, unavailable media, stale projection, or detector failure keeps storyboard creation and episode continuation available.                                                                                                  |
| 7    | Context and continuity          | Gap made explicit: string matching is only a baseline; production detection requires the two-stage context pack, continuation/time/place segmentation, evidence, stale fingerprints, and manual override precedence.                                             |
| 8    | Special/Product compatibility   | Gap made explicit: the bridge must durably enqueue/retry the episode binding after episode creation; client fire-and-forget alone cannot be the source of truth. Existing nine-shot, disclosure, footage, claim, credit, and scene rules remain authoritative.   |
| 9    | Media and UI behavior           | Gap made explicit: Library/History must resolve managed IDs, not trust raw URLs; shot-level picker, usage evidence, canonical selection, drag/drop, mobile/keyboard states, and progressive disclosure must be proven in the browser.                            |
| 10   | Security, operations, and proof | Closed as a release protocol: tenant isolation, SSRF-safe import, provider-cap trimming, request-specific failure classification, feature-flag fail-closed behavior, migration parity, rollback, observability, and browser/runtime evidence are separate gates. |

The audit found no unclassified design ambiguity that can safely be ignored.
The remaining items are intentionally recorded as implementation release gates,
not hidden assumptions or blockers in the creator's normal storyboard flow.
The implementation plan must update §19 only after each applicable gate has
passing evidence; a focused unit test, successful TypeScript check, or built
bundle alone is insufficient.

## 22. Third ten-pass audit record

The latest review repeated ten passes after the previous gap register was
added. It specifically checked whether the new rules were complete,
implementable, and consistent with the physical baseline:

| Pass | Review lens                      | Result and required closure                                                                                                                                                   |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | User outcome traceability        | Closed: the locked-box, heirloom, ring, jade, document, key, and weapon use cases map to one catalog, reusable assets, shot links, and generation propagation.                |
| 2    | Mode and boundary safety         | Closed: `story_object` and `commercial_tie_in` are explicit; scene/location and character references cannot enter the object group by inference.                              |
| 3    | Asset semantics                  | Gap added: canonical/detail/alternate, approval, provenance, ordering, and reversible attachment removal must be physical fields/constraints, not UI-only state.              |
| 4    | Link lifecycle                   | Gap added: shot and Special binding uniqueness must be active-aware so a removed historical link does not block a later valid link.                                           |
| 5    | API/UI parity                    | Gap retained and clarified: every promised control either has a real typed operation or a visible capability state; silent no-op buttons are forbidden.                       |
| 6    | Prompt and paid actions          | Gap added: prompt/image generation needs explicit capability gating, versioned result state, credit admission, and draft approval; text save/linking remain free.             |
| 7    | Normal episode non-blocking flow | Closed: missing/ambiguous/stale/unavailable object data produces warnings and preserves the normal storyboard path.                                                           |
| 8    | Special/Product flow             | Closed by release gate: legacy Product Tie-in remains authoritative until durable commercial binding, source provenance, retry, and nine-shot compatibility are proven.       |
| 9    | Security and tenant isolation    | Closed: managed-media IDs, ownership recheck, SSRF-safe URL handling, private provenance redaction, and request-specific provider failures are required.                      |
| 10   | Operations and evidence          | Gap converted to gate: structured events, migration parity, rollback, browser proof, runtime/provider proof, and production verification are separate from unit/build checks. |

After this pass there are no silently accepted gaps. Newly discovered
implementation differences are represented in §20.2 with an owner-visible
closure rule and release consequence; they do not become blockers for the
creator's ordinary storyboard creation flow.

## 23. Fourth ten-pass audit record

The latest ten-pass review focused on persistence and reversibility of the
creator's decisions. The following rules were added or reconfirmed:

| Pass | Review lens             | Result and required closure                                                                                                                                 |
| ---- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Requirement trace       | Closed: recurring story-critical objects can be created once, supplied by image, reused per shot, and carried into generation.                              |
| 2    | Identity matching       | Gap closed in the spec: aliases are persisted and cannot merge similarly named objects without type/role evidence.                                          |
| 3    | Suggestion persistence  | Gap closed in the spec: pending detector output has a durable suggestion identity, fingerprint, version, status, and decision audit.                        |
| 4    | Manual corrections      | Gap closed in the spec: manual remove is a tombstone and detector reset is explicit; refresh/retry cannot undo it.                                          |
| 5    | Asset lifecycle         | Closed: asset attachments are reversible and managed media is never deleted by normal catalog editing.                                                      |
| 6    | Active uniqueness       | Closed: active-aware constraints are required for reattach, retry, and historical rows.                                                                     |
| 7    | API/UI capability       | Closed: controls map to real operations or an explicit unavailable state; no silent no-op is allowed.                                                       |
| 8    | Special/Product bridge  | Closed by gate: commercial identity, product provenance, episode binding, retry, and legacy fallback remain separate from story props.                      |
| 9    | Non-blocking behavior   | Closed: every optional detector/object/media failure remains a warning and never blocks ordinary storyboard creation.                                       |
| 10   | Security and operations | Closed by gate: tenant ownership, managed IDs, SSRF-safe import, structured events, migration parity, rollback, and browser/runtime proof remain mandatory. |

This audit leaves no persistence or UX correction path implicit. The baseline
implementation may still be incomplete, but each incompleteness now has an
explicit owner-visible closure requirement in §20.2 and cannot be mistaken for
an accepted production behavior.

## 24. Fifth ten-pass audit record

This pass checked whether every creator decision and every detector result has
an authoritative place to live, can be safely retried, and remains compatible
with the existing flow:

| Pass | Review lens           | Result and required closure                                                                                                                       |
| ---- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Canonical identity    | Closed: one series-scoped object identity with aliases; similar names require type/role evidence.                                                 |
| 2    | Asset source and role | Closed: managed assets, canonical/detail/alternate roles, API-to-domain role mapping, provenance, and approval are explicit.                      |
| 3    | Asset removal         | Closed: normal removal is reversible; underlying media is never deleted by catalog editing.                                                       |
| 4    | Usage removal         | Closed: manual removal is a tombstone and remains authoritative until explicit reset.                                                             |
| 5    | Suggestion review     | Closed: suggestions have durable IDs, status, evidence, context fingerprint, TTL, and decision audit.                                             |
| 6    | Retry/idempotency     | Closed: retryable writes use a bounded key/request hash and reject key reuse with different input.                                                |
| 7    | Archive behavior      | Closed: active-only default listing, explicit archived history, and stable existing usage resolution are specified.                               |
| 8    | Special/Product       | Closed by gate: commercial source, binding snapshot, compliance projection, and retry remain separate from ordinary props.                        |
| 9    | Non-blocking flow     | Closed: optional object handling cannot block storyboard/episode creation, while real validation/security failures remain actionable.             |
| 10   | Migration/proof       | Closed by gate: new alias/suggestion tables, constraints, migration parity, rollback, observability, browser, and runtime proof are all required. |

No new issue from this pass is left as an implicit assumption. The physical
baseline still requires follow-up migrations and implementation work listed in
§20.2; that is an intentional release gate, not a creator-facing storyboard
blocker.

## 25. Sixth ten-pass audit record

This audit checked vocabulary, API envelopes, and policy-state consistency
between the logical specification and the current foundation migration:

| Pass | Review lens                | Result and required closure                                                                                                                       |
| ---- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | User workflow              | Closed: define/import/reuse/replace/remove/generate flows remain available without requiring an object image.                                     |
| 2    | Source vocabulary          | Gap closed in the spec: `history`, `library`, `uploaded`, and `upload` have one explicit boundary mapping and retained provenance.                |
| 3    | Asset role vocabulary      | Closed: `primary` maps to canonical while detail/alternate remain distinct; mapping is server-tested.                                             |
| 4    | Commercial policy          | Gap closed in the spec: `commercialTieInEnabled` and `commercialProfile` are explicit persisted policy state, never image-source inference.       |
| 5    | Suggestion ownership       | Gap closed in the spec: suggestions contain tenant, user, and series ownership fields before review or cleanup.                                   |
| 6    | API retry envelope         | Closed: retryable mutations carry idempotency key/request hash and compatibility aliases share one schema/result.                                 |
| 7    | Archive/query behavior     | Closed: active-only default, explicit archived history, and existing usage resolution are consistent with the lifecycle rules.                    |
| 8    | Special/Product separation | Closed by gate: product, story prop, scene/location, and character groups remain separate through the shared resolver.                            |
| 9    | Non-blocking behavior      | Closed: detector/media/prompt/projection failures remain warnings and do not stop ordinary storyboard creation.                                   |
| 10   | Migration evidence         | Closed by gate: every logical field added in this audit has a physical migration/constraint requirement before the related capability is enabled. |

The review found no vocabulary or policy-state ambiguity that is safe to leave
unstated. Foundation-only implementation differences remain visible in §20.2
and are not treated as completed behavior.

## 26. Seventh ten-pass audit record

This audit checked internal consistency between the minimum creator flow, the
typed contracts, and the physical implementation gates:

| Pass | Review lens             | Result and required closure                                                                                                                                         |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Minimum create flow     | Closed: name/description-only creation is valid; `objectType` defaults to `other`, image remains optional, and source defaults to `manual`.                         |
| 2    | Object vs asset source  | Closed: object provenance and asset provenance are separate enums; `history` and `uploaded` mappings are explicit.                                                  |
| 3    | Commercial state        | Closed: commercial mode, enablement flag, profile, provenance, and compliance path must agree; image source alone cannot opt in.                                    |
| 4    | Alias persistence       | Closed: aliases have an owned child-table contract, uniqueness, and conflict behavior.                                                                              |
| 5    | Suggestion persistence  | Closed: every reviewable result has owner, candidate, evidence, fingerprint, detector version, TTL, status, and decision lineage.                                   |
| 6    | Prompt result state     | Gap converted to gate: prompt-run/result status, stale handling, provider identity, and paid-job reconciliation must be durable before exposing generation.         |
| 7    | Transport errors        | Closed: domain app codes are mapped onto supported tRPC transport codes; clients do not depend on an invalid protocol code.                                         |
| 8    | Archive and reattach    | Closed: active-only reads, explicit history, reversible asset removal, active-aware uniqueness, and existing usage preservation agree.                              |
| 9    | Special and normal flow | Closed by gate: shared catalog identity does not merge commercial, story-object, scene, or character payloads and never weakens non-blocking normal flow.           |
| 10   | Operational proof       | Closed by gate: migrations, bounded retries, structured events, browser/runtime proof, rollback, and provider/credit reconciliation are required before completion. |

No new contradiction remains between the minimum UX promise and the release
gates. Any missing physical implementation is explicitly listed in §20.2 and
cannot be silently promoted to a successful feature state.

## 27. Eighth ten-pass audit record

This audit reviewed the boundary between the unified Object Reference UI and
the legacy Product Tie-in implementation:

| Pass | Review lens             | Result and required closure                                                                                                                            |
| ---- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Unified tab surface     | Gap made explicit: the legacy editor may remain only as a progressive compatibility panel; new catalog CRUD has one canonical surface.                 |
| 2    | Special entry point     | Gap made explicit: Marketplace selection remains compatible input, but must resolve to one durable commercial catalog identity after episode creation. |
| 3    | Archive query           | Gap made explicit: list defaults to active-only and requires explicit `includeArchived` for history.                                                   |
| 4    | Minimal object creation | Closed: name/description-only creation remains valid with `objectType=other`, no image requirement, and manual source.                                 |
| 5    | Source and role mapping | Closed: object/asset source and primary/canonical role mappings are explicit and server-owned.                                                         |
| 6    | Context detection       | Closed by gate: synopsis, neighboring episode context, time/place transitions, aliases, and suggestion fingerprints are required before auto-linking.  |
| 7    | Continuity safety       | Closed: object continuity is separate from wardrobe/character/location continuity and never changes those systems implicitly.                          |
| 8    | Generation safety       | Closed: object references are optional, provider-capped, paid generation is explicit, and failures preserve the last valid state.                      |
| 9    | Security/ownership      | Closed: managed IDs, tenant/user/series checks, SSRF-safe import, and private provenance handling remain mandatory.                                    |
| 10   | Evidence and operations | Closed by gate: migration parity, durable retries, structured observability, browser proof, and runtime/provider proof are required.                   |

The unified UI decision is now unambiguous: one Object Reference experience,
with legacy Product Tie-in controls shown only where compatibility or
commercial compliance requires them. This does not claim the baseline code has
already completed that migration; §20.2 remains authoritative for closure.

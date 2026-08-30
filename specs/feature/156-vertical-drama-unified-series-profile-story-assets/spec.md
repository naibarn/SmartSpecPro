# Feature 156 — Unified Series Profile, Story Asset Hub, and Pre-Draft Evidence Gate

**Status:** SPEC READY FOR DEEP PLAN — implementation not started
**Created:** 2026-08-22
**Priority:** P0 — required before reliable documentary/review story drafting
**Depends-on:** Feature 153 long-form story architecture, Feature 154 closure /
documentary / visual grounding, Feature 155 cost-control ledger, existing
Vertical Drama create wizard, product tie-in, location stock, managed media,
vision, and story-draft pipelines.

## 1. Executive decision

Replace the current split between “Series format”, “Series visual look”, and
“Product tie-in” with one canonical creator choice: **Series Profile**.

The selected profile is the only source of truth for:

- content format and episode engine;
- visual look and genre grounding;
- factual/evidence policy;
- default story-asset slots;
- whether a pre-draft asset/evidence gate is required;
- how approved images and video shots may become B-roll or story inserts.

The existing wizard step currently labelled “Product tie-in” becomes
**“ข้อมูลและสื่ออ้างอิง / Story Sources & Media”**. It remains in the same
wizard position so the existing create flow does not get renumbered, but it
becomes a general asset authoring hub for documentary, location review,
restaurant review, product review, software review, hybrid docu-drama, and
optional fiction references.

The story draft must consume an approved, versioned **Story Source Pack**. For
non-fiction and review profiles, drafting is blocked until the pack passes the
pre-draft gate. Fiction profiles keep the existing optional path.

The gate must also work before a series row exists: the wizard stages the pack
against its tenant/user-scoped `draftSessionId`, then atomically attaches that
pack to the new series during creation. A staged pack is not a second source of
truth; it is the same versioned aggregate before `seriesId` is assigned.

## 2. Problem statement

Feature 154 added format contracts, but the current UI still presents format as
a separate dropdown and exposes product references as a narrow optional
checkbox. This creates four risks:

1. A creator can select a visual genre and a content format that communicate
   contradictory production intent.
2. Review/documentary drafting can start without the subject, place, product,
   evidence, or visual references that the draft is expected to describe.
3. Uploaded images are treated as references, not as named narrative assets
   with a clear purpose, story description, or shot placement.
4. There is no durable way to combine generated images, uploaded images,
   uploaded/generated video shots, map/place metadata, product descriptions,
   vision analysis, and B-roll usage without overloading `productTieIn` JSON.

## 3. Goals

1. Provide one understandable Series Profile picker that includes all existing
   fiction looks plus documentary/review profiles without conflicting selectors.
2. Make the profile selection drive content, look, grounding, evidence rules,
   default slots, and prompt behavior consistently across the entire pipeline.
3. Convert the current Product tie-in step into a reusable Story Source Pack
   authoring hub.
4. Support known places, map coordinates, user-uploaded references, generated
   interpretations, marketplace products, product descriptions, screenshots,
   images, and video shots.
5. Let creators add an unlimited number of custom slots from the product UX,
   subject to existing storage, media, credit, and request-size safeguards.
6. Require every slot to have a human-readable title and narrative description,
   with optional AI-generated suggestions from product metadata and vision.
7. Support images and video shots as source media and allow approved video
   shots to be planned as B-roll, cutaways, inserts, or overlays.
8. Scan and prepare sources before story drafting, while preserving a simple
   “prepare sources → review → draft story” mental model.
9. Prevent unsupported factual claims and prevent asset references from silently
   changing canon, character relationships, or the long-form story destination.
10. Preserve existing fiction/product-tie-in/sequel compatibility through an
    explicit resolver and legacy read path.

## 4. Non-goals

1. Do not create independent selectors for format, visual look, and evidence
   mode in the creator-facing flow.
2. Do not scrape or copy Google Maps imagery. Map data is metadata and location
   context; visual truth requires an approved user asset or a clearly labelled
   AI interpretation.
3. Do not claim that an AI-generated image is an accurate photograph of a real
   place without user-provided evidence.
4. Do not automatically place every asset into every episode or rewrite the
   story merely because a slot exists.
5. Do not allow user-provided descriptions or vision output to override
   relationship graph, story memory, approved premise, or factual source
   status.
6. Do not introduce an unbounded database JSON array for unlimited slots.
7. Do not replace the managed-media tenant/user ownership contract, the
   existing media-task pipeline, or the global credit ledger.
8. Do not require Google Maps API credentials for the first usable version;
   pasted place URL, address, place ID, or latitude/longitude are valid source
   inputs, with provider adapters added behind a boundary later.

## 5. Canonical Series Profile

### 5.1 One picker, one authority

The existing look picker becomes the **Series Profile Picker**. The existing
`seriesFormatKind` selector/payload is removed from the creator-facing flow or rendered
only as a compatibility projection of the selected profile, never as a second
editable choice.

The initial catalog is:

| Profile                       | Content engine                              | Visual/grounding behavior                                          | Default source gate |
| ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------ | ------------------- |
| Drama / Romance               | Fiction long-form                           | intimate dramatic look                                             | optional            |
| Horror / Thriller             | Fiction long-form                           | threat and atmosphere evidence                                     | optional            |
| Sci-fi / Cyberpunk            | Fiction long-form                           | functional technology and cost                                     | optional            |
| Action / Epic                 | Fiction long-form                           | readable physical objective/consequence                            | optional            |
| Fantasy / Fairytale / Xianxia | Fiction long-form                           | magic, artifact, realm, rule/cost                                  | optional            |
| Animation / Cartoon           | Fiction long-form                           | stylized world, silhouette, impossible visual action               | optional            |
| Documentary                   | documentary engine                          | subject observation and source separation                          | required            |
| Location Review               | review engine                               | place-focused visual coverage                                      | required            |
| Restaurant Review             | review engine                               | venue, service, menu, and dish coverage                            | required            |
| Product Review                | review engine                               | product evidence, use, limits, and comparison                      | required            |
| Software Review               | review engine                               | screen/demo/workflow/limitation coverage                           | required            |
| Hybrid Docu-Drama             | documentary evidence + dramatized narrative | documentary observation plus explicitly labelled reenactment/drama | required            |

Each profile is a versioned record containing `profileId`, `contentKind`,
`visualGenreKey`, `episodeEngine`, `visualGroundingContract`, `factPolicy`,
`commercialDisclosure`, `defaultSlotPreset`, `sourceGatePolicy`, and
`bRollPolicy`. The UI displays these as one card summary, not as separate
technical controls.

### 5.2 Legacy reconciliation

The resolver precedence is:

1. `bible.seriesProfile` when valid;
2. `bible.seriesFormat` mapped to a profile;
3. legacy look-lock genre mapped to a fiction profile;
4. default `drama_romance`.

If legacy fields conflict, the resolver emits a non-blocking migration warning
and chooses one canonical profile deterministically. It never silently writes a
new profile during a read. A later explicit save persists the resolved profile.

### 5.3 Profile contract, legacy mapping, and change semantics

The profile registry is the only editable creator-facing choice. The following
compatibility fields are projections only:

| Canonical profile             | `seriesFormat.kind` projection | `profile.visualGenreKey`    | Legacy `lookLock.genreKey` |
| ----------------------------- | ------------------------------ | --------------------------- | -------------------------- |
| Drama / Romance               | `fiction_drama`                | `drama_romance`             | `drama_romance`            |
| Horror / Thriller             | `fiction_drama`                | `horror_thriller`           | `horror_thriller`          |
| Sci-fi / Cyberpunk            | `fiction_drama`                | `sci_fi_cyberpunk`          | `sci_fi_cyberpunk`         |
| Action / Epic                 | `fiction_drama`                | `action_epic`               | `action_epic`              |
| Fantasy / Fairytale / Xianxia | `fiction_drama`                | `fantasy_fairytale_xianxia` | `fantasy_fairytale`        |
| Animation / Cartoon           | `fiction_drama`                | `animation_cartoon`         | `animation_cartoon`        |
| Documentary                   | `documentary`                  | `documentary`               | not written                |
| Location Review               | `location_review`              | `location_review`           | not written                |
| Restaurant Review             | `restaurant_review`            | `restaurant_review`         | not written                |
| Product Review                | `product_review`               | `product_review`            | not written                |
| Software Review               | `software_review`              | `software_review`           | not written                |
| Hybrid Docu-Drama             | `hybrid_docu_drama`            | `hybrid_docu_drama`         | not written                |

`visualBible` and existing visual notes remain supplemental editorial input;
they are not a second profile selector. Profile hard constraints win when notes
conflict, and the UI shows the conflict rather than silently discarding notes.
Non-fiction `profile.visualGenreKey` values are new profile/grounding keys; they
must not be written into the legacy fiction-only `lookLock.genreKey` field.

Every profile must resolve to a complete visual contract with observable cues,
forbidden drift, causal/world-mechanic rules where applicable, and a strict
grounding mode for story-facing generation. Review profiles must not silently
reuse the generic documentary contract: location, restaurant, product, and
software review each declare their own evidence/visual coverage cues. A missing
profile contract is a server error, not a fallback to drama or documentary.

Changing a profile preserves uploaded/generated assets and custom slots, but
creates a new profile version, recalculates preset recommendations, marks
affected descriptions/usages as `stale` or `needs_review`, and requires the
source gate to run again. It never deletes a creator asset or silently changes
the content engine. Editing supplemental visual notes creates a new visual
version and invalidates affected prompt/digest/QC inputs as well. A profile
change is optimistic-concurrency protected and must be explicitly saved before
a new draft run.

Changing from fiction to documentary/review/hybrid preserves existing fiction
notes/assets but requires the non-fiction source gate before drafting. Changing
back to fiction removes the blocking requirement but retains the Source Pack for
optional references. Existing `lookLockMode` values (`manual`,
`inherit_source`, `genre`, `none`) are migrated into profile-owned visual
customization or read-only compatibility details; they are never silently
dropped and cannot become a second content/evidence selector.

The registry must publish minimum observable-cue coverage for each profile. At
minimum, review profiles require:

| Profile           | Required visual/evidence coverage                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| Documentary       | subject identity, context/source/interview evidence, observation, counterpoint or limitation           |
| Location Review   | exterior/identity, interior or spatial detail, activity/route, accessibility or limitation             |
| Restaurant Review | venue identity, interior/service flow, menu/price evidence, dish/detail, limitation or comparison      |
| Product Review    | product identity, material/control detail, in-use demonstration, result, limitation/comparison         |
| Software Review   | product/UI identity, setup/workflow, feature result, platform/responsiveness, limitation/plan evidence |
| Hybrid Docu-Drama | documentary evidence plus separately labelled reenactment/POV; neither may impersonate the other       |

Fiction profiles likewise declare their own genre cues, world mechanics, and
forbidden drift. A profile may reuse an existing contract only when the registry
records that reuse explicitly and the acceptance test proves it is semantically
appropriate.

## 6. Story Source Pack

### 6.1 Source types

The hub supports these source modes:

- `known_place`: select a known location/entity from the SmartSpecPro roster;
- `documentary_note`: identify a documentary subject, interview, archive, or
  editorial source without pretending that an unverified brief is a fact;
- `coordinates`: paste a Google Maps URL, place ID, address, or coordinates;
- `product_snapshot`: select or describe a saved marketplace/product record;
- `software_review`: provide a software/interface/workflow reference;
- `user_upload`: upload image or video references;
- `generated_reference`: ask the configured image/video pipeline to create an
  interpretation from a description;
- `mixed`: combine metadata, generated media, and user media in one pack.

Map metadata stores provider, place ID when supplied, label, address, latitude,
longitude, and capture/source timestamp. It does not store copied map tiles or
unlicensed external images.

### 6.2 Asset slot contract

Every slot is an authored narrative unit, not merely a file attachment:

```text
slotId
slotKey
title
narrativeDescription
assetKind: image | video | image_or_video
sourceMode
required: boolean
orderIndex
storyFunction: establishing | context | detail | evidence | demonstration |
  comparison | atmosphere | interview_support | b_roll | cutaway | custom
assets[]
usagePolicy
status
```

Each asset reference carries managed `mediaAssetId`, source, thumbnail/preview
projection, duration/trim metadata for video, user/vision description,
`approvedForDraft`, factual status, and provenance. The system stores slots and
references in normalized rows so creators can add slots without making the
series bible unbounded.

### 6.3 Pre-series draft-session staging

Before series creation, a pack is addressed by `draftSessionId` and owner scope.
The server requires exactly one active owner-scoped pack for a session and
binds it to the created series in the same transaction as the series shell.
The bind is idempotent and optimistic-concurrency protected; a failed create
leaves the staged pack recoverable, while an abandoned session is soft-archived
after a configurable 30-day retention period by default, with no media deletion
surprise. A creator may restore a soft-archived session within the retention
window; cleanup after the window follows the managed-media retention policy and
records an explicit audit event.

The staged pack carries the selected `seriesProfileId`, source snapshots,
readiness version, and all approvals. `startDraftComposition` must receive the
session pack digest and is blocked for non-fiction/review/hybrid profiles until
that digest is ready. `synthesizeGenrePreset` is explicitly a non-canonical
preset/genre preview only: it may run before readiness, but cannot emit or
persist factual claims, canonical story episodes, or source-backed assertions.
The server strips or labels unverified product/place text in this preview; the
approved Source Pack is the only source allowed to supply factual evidence.

Source identity also stores the creator-provided subject/place/product label,
source title/locator when applicable, capture time, and claim scope. A source
locator is evidence metadata only until the creator or an approved provider
verifies it; the first version does not silently treat arbitrary web pages as
trusted facts.

### 6.4 Default slot presets

The selected Series Profile creates suggested slots. Suggestions are editable,
deletable, and never mandatory unless marked required by the profile gate.

**Location Review:** exterior establishing, exterior atmosphere, entrance/sign,
interior wide, counter/reception, signature detail, route/map context,
people/activity atmosphere, accessibility/limitation, custom.

**Restaurant Review:** exterior/sign, exterior atmosphere, interior atmosphere,
counter/order flow, kitchen/back-of-house when permitted, menu/price evidence,
signature dish close-up, table/service, customer atmosphere, limitation or
comparison, custom.

**Product Review:** product hero, packaging/unboxing, material/detail, ports or
controls, in-use demonstration, scale/ergonomics, result/output, comparison,
limitation/defect, custom.

**Software Review:** product/logo screen, dashboard/home, setup flow, feature
demonstration, workflow end-to-end, result/output, mobile/responsive view,
performance/limitation, pricing/plan evidence, custom.

**Documentary:** subject establishing, context/archive, observation, interview
support, evidence/detail, counterpoint, map/timeline, outcome, custom.

**Hybrid Docu-Drama:** documentary observation/evidence slots plus explicitly
labelled reenactment, dramatized context, character POV, and transition/B-roll
slots. Reenactment cannot be presented as direct factual footage.

Users can add slots without a product-level arbitrary count limit. Storage,
file-size, media-generation, and credit quotas remain the safety boundaries.

## 7. Asset preparation and AI assistance

### 7.1 Upload and import

Images and videos are uploaded through the existing managed-media path and
attached by canonical tenant-scoped media asset ID. Provider URLs are never the
authority. Video slots support duration, trim in/out, aspect ratio, audio
presence, and source rights/disclosure metadata.

### 7.2 Place preparation

For a known/generated place, the UI offers:

1. choose known place or enter map metadata;
2. choose which slot(s) to populate;
3. generate an image/video interpretation or upload real references;
4. review the generated result and mark it approved or needs repair;
5. expose the uncertainty label: “AI interpretation from place metadata” when
   no user/reference image proves the actual appearance.

### 7.3 Product preparation

When a catalog product is selected, the hub loads a read-only source snapshot:
name, description, category, price/plan fields when available, source timestamp,
and all available product media. The creator explicitly selects which product
images/videos enter the Story Source Pack, can annotate each selection, and can
request a re-sync when the catalog record changes.

The legacy product-tie-in object remains readable for existing series, but new
series write the selected product and assets into the Story Source Pack. A
compatibility projection may continue to populate `productTieIn` fields needed
by existing placement logic.

### 7.4 Vision description generation

Each image/video asset has a “Generate description” action. The request combines:

- product description or place metadata, when available;
- vision analysis of the selected asset;
- the selected slot title and narrative intent;
- the Series Profile's factual and disclosure policy.

The result is a **suggestion** with provenance and confidence. The user can edit
or accept it. The system keeps separate fields for:

- what is visibly present;
- what the creator wants the audience to understand;
- what is a factual claim requiring a source;
- what is opinion, mood, or storytelling direction.

No AI-generated description is treated as verified fact without a supplied
source or an explicit user confirmation according to the profile policy.

### 7.5 Source Pack lifecycle and analysis job contract

The pack lifecycle is `draft → analyzing → needs_review → draft_ready →
production_ready`. `failed`, `stale`, and `blocked` are
terminal-for-the-current-version side states. `draft_ready` means the pack can
support text drafting under the factual/disclosure policy; it does not imply
that every media asset may render. `production_ready` additionally requires
production-approved rights for every asset bound for output. Every transition
records actor, pack version, source/asset version, reason, and time. Only the
server can set either readiness state; a stale, changed, or partially failed
slot forces a new readiness evaluation. Concurrent edits use a pack version and
return a conflict that the UI can merge or reload.

 Vision and generated-reference work is bounded, terminal-state and idempotent by
`packId + slotId + mediaAssetId + mediaVersion + operation + promptPolicyVersion`.
Analysis records contain job status, model/provider version, input checksum,
output schema version, retry count, cost reservation/reconciliation result,
confidence, and provenance. OCR/metadata/vision text is untrusted data, never
an instruction to the model or server. Partial failures preserve successful
slot results and expose retry/repair actions without duplicating charges. An
analysis request may execute inline when the bounded vision path is available;
it must never return `queued` without a real consumer. Generated reference
images are accepted as story references immediately, but remain ineligible for
production until a managed media object and rights/disclosure decision exist.

## 8. B-roll and story integration

Approved assets can be marked for downstream usage as:

- establishing plate;
- cutaway/insert;
- B-roll overlay under narration/dialogue;
- full-frame evidence shot;
- transition/montage;
- product/software demonstration.

The story draft receives a compact Source Pack digest containing slot IDs,
titles, narrative descriptions, approved asset facts, and allowed usage. It does
not receive arbitrary raw URLs or unapproved assets.

The draft may propose slot usage by `slotId`, episode number, shot number,
usage type, and optional video trim. The production/storyboard stage resolves
the managed media asset and checks that the usage is allowed. Missing or
unapproved assets produce a repair warning, never a silently fabricated visual.

Asset usage is advisory until the creator approves the story/source binding.
The asset pack cannot create a new relationship, resolve a plot thread, alter a
character, or change the approved season destination.

### 8.1 Long-form and production usage contract

For long-form seasons, the prompt builder receives a bounded Source Pack digest
per episode/chunk with `packVersion`, `profileVersion`, stable slot IDs,
approved observations/claims, verification status, allowed usage, and only the
relevant slot summaries. It must not resend every raw asset, full vision output,
or full source history for every episode. Server configuration defines hard
maximum serialized bytes/tokens, claims, and media references per digest; if
compaction still exceeds a limit, the run returns a typed repair item instead
of silently truncating evidence. Digest versions are cached and invalidated by
profile/visual/source/approval changes, so 120 episodes and larger
user-requested horizons remain resumable without context or payload blow-up.

The same profile contract and digest boundary must be threaded through story
bible, deep/premium/revise/repair prompts, storyboard/shot generation, and
visual/media prompt composition. No downstream stage may independently infer a
genre from free text or silently call the generic documentary/default grounding
contract.

The integration adapter maps approved Source Pack claims into the existing
`seriesFormat.requiredEvidence` / `format_evidence` fields and maps legacy
product placement into the same digest. There is one evidence authority:
`productTieIn`, `seriesFormat`, and visual-grounding fields are compatibility
projections and cannot override the approved pack.

Production usage validates managed-media existence, ownership, source status,
rights status, trim-in/out bounds, orientation/aspect, audio policy,
subtitle/watermark safe zones, and overlay order before rendering. A missing,
unapproved, or invalid B-roll binding fails closed with a repair item; it is
never replaced by an invented or provider-only URL. External source audio is
muted by default unless the user explicitly approves it and rights/disclosure
are recorded.

## 9. Pre-draft workflow and gate

The user-facing workflow is:

```text
1. Select one Series Profile
        ↓
2. Complete Story Sources & Media slots
        ↓
3. Analyze references / generate descriptions / approve assets
        ↓
4. Review Source Pack readiness and estimated cost
        ↓
5. Draft story using the approved Source Pack
        ↓
6. Run existing story QC, closure QC, and visual grounding QC
```

For documentary/review/hybrid profiles, the server enforces the gate for every
story-draft entry point, not only the wizard button. The gate reports:

- missing required slots;
- assets still analyzing or not approved;
- unsupported factual claims;
- stale product/place snapshots;
- invalid media ownership or missing managed asset;
- missing rights status/approval for production media;
- missing disclosure when required;
- estimated cost/credit warning from Feature 155 when available.

Rights are split by stage: factual drafting requires a rights status and
disclosure flag for any referenced source, while production binding/rendering
requires `rightsApproved` or an explicitly creator-owned equivalent. Unknown or
permission-pending media can never render, but does not force the creator to
lose an otherwise valid text draft.

These are separate axes, not one overloaded approval flag:

| Stage                     | Required before proceeding                                                                                                            | What remains prohibited                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Text draft                | source identity, factual-status handling, an explicit rights status, required disclosure, and approved/user-authored slot description | presenting unverified claims as verified; using a permission-pending asset as production media |
| Production binding/render | all text-draft checks, managed asset ownership/version, creator approval, and `rightsApproved` or a creator-owned equivalent          | rendering assets whose rights are `unknown`, `permission_pending`, or `restricted`             |

`permission_pending` or `unknown` is therefore a visible text-only warning, not
an invisible bypass and not a reason to discard an otherwise valid text draft.

For paid generation, a missing or failed cost estimate/reservation is itself a
blocking readiness item. The server never starts a paid run from a client-only
estimate.

The user can save an incomplete pack. They cannot start a paid or story-draft
run until the source gate and the existing Draft Quality QC/foundation gate are
both ready, unless a future explicit “draft with gaps” policy is enabled for a
profile and visibly records the gaps. Source readiness must be completed before
the composition action is enabled, so the UI never creates a deadlock between
source preparation and `startDraftComposition`.

The server gate covers `startDraftComposition`, `generateStoryBible`, deep/
premium deep draft, `extendStoryDraftHorizon`, story revise/repair, and any
storyboard/prompt-generation entry point that requests Source Pack usage. The
non-canonical `synthesizeGenrePreset` preview is allowed only under the
preview-only contract in Section 6.3. UI checks are advisory only. A direct
tRPC/API call with a missing or stale staged/series pack returns a typed
readiness error containing actionable slot/asset IDs, never a partial paid
generation. The stable error contract is `VD_SOURCE_PACK_NOT_READY` with the
current gate stage, pack/profile/source versions, a bounded list of repair
items (`code`, `severity`, `slotId`/`assetId` when applicable, and creator-safe
action), plus `textDraftAllowed` and `productionRenderAllowed` booleans. The
server computes these fields; the client cannot downgrade a blocking item.

Fiction profiles preserve the current path: the Story Source Pack is optional,
but any supplied asset remains subject to the same ownership, approval, and
continuity rules.

## 10. UI/UX contract

### 10.1 Wizard changes without adding confusing steps

Keep the existing six-step wizard and existing position of step 5. Change only
the meaning and labels:

- “ลุคภาพประจำซีรีส์” becomes “แนวทางซีรีส์ / Series Profile”;
- the standalone “รูปแบบซีรีส์” selector is removed or becomes a read-only
  derived summary;
- “สินค้าผูกเรื่อง” becomes “ข้อมูลและสื่ออ้างอิง / Story Sources & Media”;
- the Review step shows selected profile, gate status, required slots, source
  count, approved media count, and draft readiness.

### 10.2 Profile picker

Use the existing look-card visual language, but each card shows:

- profile name and bilingual label;
- “ใช้เมื่อ…” explanation;
- content engine badge;
- visual treatment badge;
- evidence/source requirement badge;
- number of suggested slots;
- selected-state summary.

There is one selected profile at a time. Advanced details are displayed as
information, not as independent conflicting selectors.

Optional visual customization (legacy manual notes, inherited identity, or
profile-safe palette/wardrobe/camera notes) lives inside the selected profile's
advanced details. It may refine presentation but cannot change the profile's
content engine, evidence policy, or strict grounding contract. The legacy
`visualNarrativeEnabled` toggle is derived from the profile and is not exposed
as an independent creator-facing switch.

### 10.3 Story Source Pack hub

The hub has four clear areas:

1. **Source identity:** place/product/subject and metadata;
2. **Suggested slots:** profile-generated checklist/cards;
3. **Your custom slots:** unlimited creator-added slots;
4. **Readiness:** analysis, approval, missing evidence, and draft gate.

Each slot card includes title, short narrative description, asset thumbnails,
image/video type, source/provenance, “generate description”, “upload”,
“generate reference”, “approve”, “edit”, and B-roll usage controls.

Do not expose provider names, JSON, raw asset IDs, or internal QC terminology as
the primary interaction. Advanced metadata may be shown in a details drawer.

## 11. Data, security, cost, and migration

### 11.1 Persistence

Use normalized tenant-scoped tables for source packs, slots, asset references,
analysis records, and episode/shot usage bindings. Keep `bible.seriesProfile`
as the compact canonical profile snapshot. Do not put unlimited slots into
`bible` or `productTieIn` JSON.

Every query and mutation must scope by tenant, owner, and the applicable
`seriesId` or `draftSessionId`, then re-check source asset ownership. Managed
media URLs are read projections, not authority.

The logical persistence model is:

- `story_source_packs`: tenant/user plus nullable `draftSessionId` or
  `seriesId` (exactly one while staged; series binding after create),
  profile/version and visual-version snapshots, source identity snapshot,
  lifecycle status, readiness version, optimistic version;
- `story_source_slots`: pack, stable slot key, title, narrative description,
  required flag, order, story function, usage policy, status, soft-delete data;
- `story_source_assets`: slot, managed media asset, source/provenance,
  checksum/version, trim metadata, rights/disclosure, approval and factual
  status;
- `story_source_analyses`: asset/version, operation, model/policy versions,
  structured observation/claims/suggestion, confidence, source refs, job state;
- `story_source_usages`: slot/asset, episode/shot, usage type, trim, approval,
  resolved media version, and render-validation status;
- append-only source events for profile changes, imports, uploads, analyses,
  approvals, gate decisions, usage, retries, and cost reconciliation.

Event payloads store IDs, versions, statuses, hashes, and bounded diagnostics;
they must not copy raw signed URLs, private coordinates, full uploaded media,
or unredacted sensitive vision text. Audit readers remain tenant/role scoped.

Required invariants include unique `(packId, slotKey)`, stable slot IDs across
revisions, tenant/series/session indexes on every aggregate row, soft deletion
rather than destructive removal, and idempotency keys for import/upload/analysis/
approval/usage/attach mutations. The database or transaction boundary must
enforce one active staged pack per `(tenantId, ownerId, draftSessionId)`,
attach-once semantics for a bound pack, retention cleanup, and no cross-owner/
session binding. Exact physical table names may follow the repository schema
convention, but these fields and invariants are not optional.

### 11.2 API and authorization contract

The implementation exposes equivalent server procedures for: create/claim a
server-issued draft session, get/create pack, set profile,
list/upsert/reorder/archive slots, import product/place metadata, attach/detach
managed media, request/retry vision or reference generation,
approve/reject/repair assets, read readiness, attach a staged pack to a series,
bind usage, and build the compact draft digest. In this repository the
canonical series-shell mutation is the existing
`verticalDramaSeries.create`; the term `createSeries` in this spec means
extending that mutation, not adding a second parallel endpoint. It accepts the
server-issued draft session and performs series-shell creation plus staged-pack
attachment in one database transaction; a separate client attach is not a
valid substitute. Every mutation re-reads authoritative ownership and pack
version inside the transaction; client-supplied URLs, owner IDs, approval flags,
and costs are never trusted. Mutations are safe to retry and return the same
result for the same idempotency key.

The create/attach operation itself has an idempotency key. Retrying after a
timeout returns the already-bound series rather than creating a second shell;
the unique staged-session constraint is a backstop, not the only retry
mechanism. The transaction may validate and attach existing managed asset rows,
but must not call a provider, upload media, or create an untracked asset as a
side effect. All ingestion and media registration happens before attachment;
legacy paths that still perform best-effort registration require an explicit
reconciliation job for orphaned assets.

The implementation mapping is explicit: extend `verticalDramaSeries.create`
for atomic staged attachment and profile projection; use `updateSeries` or a
pack-scoped mutation for saved profile/source changes; resolve the staged pack
inside `startDraftComposition`; keep `synthesizeGenrePreset` preview-only; and
apply the same gate to `generateStoryBible`, `generateStoryBibleDeep`,
`extendStoryDraftHorizon`, `repairDraftQualityQc`, storyboard handoff, and
media-prompt generation. No client-supplied digest, profile, approval, or
rights flag can substitute for the server-side pack lookup. Existing
`productContext` and `businessContext` request fields remain creative hints for
preview/synthesis only; they are not factual evidence and cannot bypass the
approved Source Pack.

`draftSessionId` is server-issued or cryptographically unguessable and every
staged-pack read/write verifies the owner and tenant again. A client cannot
choose another user's session, attach a pack to an unrelated series, or reuse a
session after it has been atomically bound. The current wizard's legacy
`Math.random` workspace IDs are not sufficient for the new Source Pack
authority: a server-session handshake must issue the new ID (or bind a
cryptographically random client nonce before any source-pack access). Legacy
draft-job IDs remain recoverable only under their existing owner scope and
cannot authorize a new Source Pack or series attachment without an explicit
claim/rotation step.

### 11.3 Upload, privacy, rights, and abuse controls

Managed upload accepts an allowlisted MIME/type family after content sniffing,
with bounded size, duration, resolution, frame count, and request payload. It
performs malware/quarantine checks before attachment, rejects arbitrary remote
fetches/SSRF, and uses tenant-scoped signed delivery URLs. Face/person,
private-address, coordinate precision, venue restriction, copyrighted media,
and sponsored/affiliate claims produce visible review/disclosure flags. Map
coordinates can be rounded or hidden in generated prompts when privacy policy
requires it. Rate limits and per-series storage/credit quotas protect the
“unlimited custom slots” UX promise from unbounded operational cost.

### 11.4 Cost control

Vision description, generated references, and video generation are paid or
resource-consuming operations. Each action must show its estimate, use the
existing reservation/reconciliation boundary, and be idempotent. Source-pack
analysis is independently retryable and must not spend credits again for the
same completed asset/version.

If a required estimate or reservation cannot be obtained, the paid operation is
blocked with a retryable cost-readiness item; it must not run on an optimistic
client-side estimate. Track queue latency, analysis failure/retry, gate-blocked
reason, stale-rate, duplicate-idempotency attempts, media-resolution failures,
and credit reconciliation/refund outcomes with tenant-safe redaction.

### 11.5 Legacy migration and rollback

- Existing `productTieIn` remains readable and is projected into a legacy source
  group when the hub opens. The projection maps `productName`, description,
  product/place identifiers, selected media references, uploaded references,
  and forbidden claims into named slots with `legacy_product_tie_in`
  provenance; it never marks arbitrary legacy text as verified fact.
- Existing fiction series keep their current behavior and do not require a
  blocking migration.
- Existing look/format conflicts are resolved by the deterministic precedence
  in Section 5.2 and shown as a repairable migration notice.
- New writes use the versioned profile and Story Source Pack contracts.

Migration is feature-flagged and lazy: opening a legacy series creates a
read-only projection, not a blind backfill. The first explicit save creates a
versioned Source Pack revision after user review; it does not silently approve
or replace creator-selected media. Writes are dual-read compatible until the
new pack is ready. A rollback disables new writes/gates while leaving
legacy `productTieIn`, `seriesFormat`, and media rows untouched; no destructive
down-migration is allowed. Catalog changes mark snapshots stale and never
silently replace the creator's selected media.

## 12. Phased implementation order

### Phase 0 — contracts and resolver

Define profile registry, source pack/slot schemas, profile-to-slot presets,
legacy resolver, gate result, usage binding, and migration rules. Add pure
tests before changing UI.

### Phase 1 — unified profile UI

Refactor the existing look picker and remove the duplicate format choice. Add
profile cards, derived summary, profile badges, and review-step readiness
summary. Preserve old wizard step IDs and payload compatibility.

### Phase 2 — Story Source Pack persistence and hub shell

Add normalized tables and tenant-safe tRPC procedures for pack, slot, asset
reference, approval, and source snapshot operations. Rename the product step and
project legacy product data into the new hub view.

### Phase 3 — source ingestion

Add managed image/video upload selection, marketplace product snapshot/media
selection, known-place/map metadata, generated-reference jobs, and asset QC.

### Phase 4 — vision descriptions and slot authoring

Add per-asset vision analysis, user-editable description suggestions, custom
slot creation, default preset generation, and stale/re-analysis behavior.

### Phase 5 — pre-draft gate and story integration

Make the server gate authoritative for all draft entry points. Inject only the
approved Source Pack digest into standard/premium story prompts, preserve slot
IDs through revisions, and add B-roll usage proposals.

### Phase 6 — production usage and rollout

Resolve approved slot usage in storyboard/shot generation, validate video trim
and B-roll overlays, add browser/E2E coverage, enable profiles progressively,
and monitor failed analysis, rejected assets, gate bypass attempts, and cost.

## 13. Acceptance criteria

### Profile and UX

- The creator can select exactly one profile containing both look and content
  behavior.
- All twelve catalog choices are visible with understandable explanations.
- No creator-facing combination can select incompatible format/look values.
- Existing fiction wizard behavior remains usable without opening the source hub.

### Source hub

- Documentary/review/hybrid profiles open the renamed Story Sources & Media step
  with correct default slots.
- A user can add, edit, reorder, approve, and remove custom slots without an
  arbitrary product-level slot limit.
- Every slot supports a title, narrative description, image/video assets, and
  provenance.
- Product selection imports the selected description and only the images/videos
  the user chose.
- Known-place/map metadata, user uploads, generated references, and mixed packs
  are distinguishable and auditable.

### AI and draft safety

- Vision can suggest descriptions using product/place metadata and media, but
  suggestions remain editable and are not silently treated as verified facts.
- A non-fiction/hybrid draft is blocked until required source slots and asset
  approval/evidence checks pass.
- A staged non-fiction/hybrid draft cannot bypass readiness through
  `startDraftComposition`; series creation attaches the staged pack atomically,
  and a failed create leaves it recoverable for retry.
- Story prompts and revisions receive only approved source-pack facts and slot
  IDs; unapproved assets cannot appear in draft output.
- Approved video shots can be proposed as B-roll/cutaway with bounded trim and
  episode/shot usage.
- Story memory, relationship graph, closure assurance, and visual grounding
  remain authoritative over asset narration.

### Reliability and operations

- All source/asset operations are tenant/user scoped and idempotent.
- Failed vision/provider jobs preserve the source pack and can be retried
  without duplicate credit charges or duplicate asset links.
- Legacy product tie-in and fiction series remain readable.
- Focused unit/API/UI tests cover profile resolution, slot presets, legacy
  projection, gate decisions, ownership, source status, vision provenance,
  B-roll binding, and draft prompt payloads.
- Contract tests cover every draft entry point and prove that a direct server
  call cannot bypass readiness, ownership, approval, or cost reservation.
- Rights tests distinguish text-draft readiness (rights status and disclosure)
  from production readiness (`rightsApproved` or creator-owned equivalent),
  and prove permission-pending media cannot be rendered.
- Long-form tests prove bounded digest size, stable slot IDs, stale invalidation,
  resumable chunking, and no duplicate analysis charge after retry.
- Security tests cover MIME spoofing, SSRF/remote URL rejection, tenant
  crossover, signed URL scope, private location handling, and disclosure flags.
- Browser/provider/deployment and human content-quality proof are reported
  separately from local tests.
- Profile contract tests prove that every one of the twelve profiles emits
  strict, profile-specific visual grounding and that no unsupported fallback is
  accepted by story, storyboard, or media prompt builders.
- Migration tests prove expand/read compatibility, lazy legacy projection,
  rollback without deleting legacy media/fields, and safe re-enable behavior.

## 14. Risks and design trade-offs

| Decision                              | Benefit                                               | Trade-off                                                                     |
| ------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| One canonical profile                 | Prevents contradictory choices and simplifies prompts | Advanced creators have less independent control; custom profiles are deferred |
| Normalized source-pack tables         | Supports unlimited slots and asset history            | Requires migration and more API surfaces                                      |
| Pre-draft gate for non-fiction        | Avoids unsupported or visually empty reviews          | Adds preparation time before the first draft                                  |
| User approval after vision/generation | Protects factual and visual trust                     | Requires one extra review action                                              |
| Map metadata without scraped imagery  | Safer rights/privacy boundary                         | A map point alone cannot guarantee photorealistic place likeness              |
| B-roll by explicit slot binding       | Prevents random asset injection                       | Automatic coverage is less aggressive and may require creator approval        |

## 15. Deferred follow-ups

- Provider-specific Google Places/Maps adapter behind a server-side credential
  boundary, if product policy and licensing approve it.
- Automatic fact retrieval/citation from trusted web sources.
- Team collaboration and per-slot review assignment.
- Custom profile builder after the fixed catalog and gate are stable.

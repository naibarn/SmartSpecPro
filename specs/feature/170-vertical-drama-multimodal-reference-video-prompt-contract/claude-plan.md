# Deep implementation plan — Feature 170

## 0. Plan contract

This plan implements every requirement in `spec.md`. It uses the existing
managed-media, Vertical Drama, model registry, skill, worker, and test
boundaries. It does not authorize rewriting unrelated dirty files. Every
section follows TDD: write focused tests first, prove the tests fail for the
missing behavior, implement the smallest production change, then run focused
verification.

### Dependency order

```text
01 shared bundle + persistence
        |
        +--> 02 capability profiles + provider adapters
        |             |
        +--> 03 inspection/finalizer skills
                      |
                      +--> 04 server/worker/render integration
                                      |
                                      +--> 05 storyboard UI
                                                      |
                                                      +--> 06 cross-section proof/rollout
```

Sections 01–03 have limited parallel work, but shared contract names must be
settled first. Sections 04–05 are sequential because the UI consumes the server
contract. Section 06 is final integration and verification.

## 1. Section 01 — Canonical multimodal bundle, asset resolver, and persistence

### Objective

Create one server-owned `VideoShotMediaBundle` contract that distinguishes
image-only temporal frames from ordered multimodal references. Preserve legacy
image-only episodes and existing source/role rows.

### Production scope

Inspect and modify only the smallest necessary parts of:

- `apps/web/shared/verticalDramaSeries/contracts.ts` for shared shot/media
  types and additive frame state;
- `apps/web/services` or the nearest existing shared service location for a
  pure bundle normalizer/fingerprint helper (follow repository placement);
- `apps/web/server/services/verticalDramaShotReferences.ts` for media-kind
  projection, canonical row linking, reorder/revision behavior, and segment
  validation;
- `apps/web/server/routers/verticalDramaEpisodes.ts` and/or the existing
  media resolver seam for server-side bundle reconstruction;
- the relevant Drizzle schema/migration files for typed projection/indexes and
  an optional segment child record;
- `apps/web/shared/verticalDramaMedia/contracts.ts` for backward-compatible
  worker pack fields.

Do not duplicate the `media_assets` registry. Derive media kind from canonical
media rows. Use the current tenant/user/series/episode/shot authorization
conditions and managed-storage URL precedence.

### Contract requirements

Implement schemas equivalent to the spec’s `ShotFrameAsset`, `ShotReference`,
and `VideoShotMediaBundle`:

- `startFrame` and `stopFrame` accept only image assets;
- references are zero-to-many, typed image/video/audio, globally ordered,
  server-labelled, and role-aware;
- old `start_frame` shot-reference rows project to `startFrame`;
  `reference_frame` remains a source value for image references;
- bundle revision increments on every media/order/role/segment/frame mutation;
- fingerprint excludes expiring URLs but includes contract version, asset
  identity/checksum, role, order, and segment;
- all client-submitted IDs are re-resolved and re-authorized on the server.

Define explicit error codes for wrong media kind, missing/unavailable asset,
tenant mismatch, invalid segment, over product ceiling, stale revision, and
unsupported source state. Make them usable by both tRPC responses and UI copy.

### Persistence and migration

Extend the existing shot-reference representation without breaking old rows.
Add/verify indexes for tenant/series/episode/shot/order and an active-order
uniqueness rule compatible with the database. If segments need a child table,
keep it linked to the canonical reference row and constrain ranges against media
metadata at write/resolve time. Backfill/project old image rows without paid
generation or prompt regeneration.

Use the runtime key `VD_MAX_REFERENCE_ITEMS_PER_SHOT` for the product ceiling,
defaulting to 50 reference items per shot.
Over-limit admission blocks by default. A selected-subset operation writes a
new revision and stores the omitted labels.

### TDD tests before implementation

Add focused shared/service/router tests for:

- legacy image-only parse and new full-bundle parse;
- start/stop reject video and audio;
- prompt-only stop is not a valid asset;
- missing, expired, revoked, pending, wrong-tenant, and wrong-kind media fail
  closed;
- mixed references preserve order, roles, source, and stable IDs;
- duplicate/invalid order and segment boundaries are rejected;
- fingerprint stability excludes signed URL changes;
- every mutation increments revision and stale compare-and-swap rejects writes;
- product ceiling blocks and explicit subset creates a new revision;
- old worker packs project into the new bundle without data loss.

### Exit proof

Run the focused contract/reference tests and migration/schema validation. Record
exact test commands/results in the section file after implementation.

## 2. Section 02 — Runtime capability profiles and provider adapters

### Objective

Replace family/version guesses with declarative per-model capability profiles and
one adapter mapping from the canonical bundle to provider-native modes. Ensure
Omni Flash 1.1, Seedance 2.0/2.5, MiniMax H3, and future same-transport releases
are explicitly compatible or explicitly blocked.

### Production scope

Inspect and modify:

- `apps/web/server/services/modelRegistry.ts` and model capability types;
- `apps/web/server/services/verticalDramaProviderRouting.ts`;
- `apps/web/server/services/mediaGenerationService.ts` request mapping;
- `apps/web/shared/geminiOmni.ts` validation only where the runtime contract
  proves current restrictions are stale or still required;
- Python provider contracts/routing in
  `python-backend/app/llm_proxy/models.py`,
  `python-backend/app/llm_proxy/providers/kie_ai_provider.py`, and relevant
  Seedance provider modules;
- `media_models.configJson` seed/template paths and model capability tests.

Create a capability profile parser with schema validation, profile version,
source, mode list, modality maxima, payload/duration limits, supported roles,
temporal guarantees, transport family, and native field map. Keep the adapter
generic for any model key using a declared existing transport.

Define catalog cache invalidation: a changed `media_models` capability profile
must invalidate cached readiness/profile decisions, and its version/hash must be
stored with each prompt run so a catalog change makes old final prompts stale.

### Mode rules

Implement deterministic mode selection:

- no attachments → text-to-video when supported;
- first/last mode only when native start/stop semantics are declared;
- mixed-reference mode for typed multimodal arrays when declared;
- start-plus-reference mode only when stop semantics are preserved or the UI
  explicitly blocks/asks for a non-guaranteed stop;
- unknown or incomplete profile → unsupported before paid admission.

For H3 preserve separate text, image, first/last, and reference modes. Do not
map a stop frame to a generic reference unless the profile explicitly declares
that equivalence. Validate H3 audio requirements and per-mode limits.

For Gemini Omni Flash 1.1 reconcile the existing first/last-plus-reference
validation with current provider behavior. Do not preserve a stale block merely
because it exists in code; do not remove a necessary safety check without a
provider contract test. Multimodal support does not automatically guarantee
native terminal stop semantics.

For Seedance 2.0 use published baseline fixtures (9 images/3 videos/3 audio)
and for 2.5 (30 images/10 videos/10 audio), then gate actual enablement on the
exact runtime model key and provider/access-channel profile. Store the audit
source and effective limits. A new version using an existing transport is a
configuration-only registration; an unknown transport remains blocked.

### TDD tests before implementation

Add web and Python tests for:

- profile schema rejects incomplete modes and accepts future model keys;
- exact mapping for no attachments, start, start+stop, image refs, video refs,
  audio refs, and mixed refs;
- H3 mode selection and audio-with-image/video rule;
- Omni Flash compatibility reconciliation and no silent attachment drop;
- Seedance 2.0/2.5 limits and exact model-key/profile lookup;
- configuration-only synthetic Seedance 2.6/MiniMax H4 registration;
- unknown transport/profile fails closed;
- canonical global order produces deterministic native-array mapping/audit;
- provider request contains actual resolved media and unchanged prompt text.

### Exit proof

Run focused Vitest model capability/provider tests and Python Kie/Seedance
routing tests. Capture runtime catalog evidence for each enabled model; do not
claim live provider generation without a real authorized smoke test.

## 3. Section 03 — Skill-first media inspection and terminal prompt finalizer

### Objective

Make attachment inspection skill-first and make the final optimization skill the
last semantic writer for video prompts, matching the image prompt finalizer
contract.

### Production scope

Inspect and modify:

- skill loader/registry and add versioned skills equivalent to
  `vertical-drama-video-reference-inspection` and
  `vertical-drama-video-prompt-final-optimization`;
- `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`;
- `apps/web/server/services/verticalDramaStoryBible.ts` multimodal content
  builder or a focused adapter around it;
- the existing image-prompt finalization helper so the terminal ownership rule
  is shared rather than duplicated;
- prompt hash/QC metadata types and tests.

### Pipeline contract

Build a bounded inspection job for every resolved start, stop, and reference
asset. Use native image/video/audio input only when the inspection model supports
it. Otherwise derive bounded keyframes, transcript, waveform/metadata, and mark
the result `derived`; unreadable/unavailable stays `unavailable`. Cache by media
fingerprint plus skill version, make retries idempotent, and treat filenames,
captions, transcripts, and media text as untrusted content.

Pass the complete manifest and inspection result to grounded authoring. Every
accepted label must appear in the final prompt manifest, including an explicit
not-used reason where applicable. Compose all provider mode, temporal,
dialogue, audio, style, safety, and negative constraints before final
optimization.

The terminal optimizer returns final positive/negative prompt, skill stamp,
bundle revision/fingerprint, capability profile version, and validation data.
After it returns, permit only validation, hashing, authorization, and text-
preserving transport. User edits invalidate the stamp and rerun the finalizer.
Line-ending, whitespace, and Unicode transformations that change hash fail
closed.

### TDD tests before implementation

Add tests for:

- image/native video/native audio/derived/unavailable inspection outputs;
- all actual attachments inspected once per fingerprint/version and no dropped
  failed item;
- bounded extraction/cache/idempotent retry;
- prompt-injection content cannot change policy or provider mode;
- every accepted label and not-used reason reaches final prompt;
- deterministic context is present before finalizer;
- no post-finalizer append/trim/formatter mutation;
- user edit, model change, profile change, and revision change invalidate final;
- final positive/negative prompt hashes equal persisted/UI/QC/outbound strings;
- retry/repair/speaker-switch/bulk paths use the same bundle fingerprint.

### Exit proof

Run focused skill, motion prompt, image-finalizer, and router prompt tests.
Inspect an actual serialized provider request fixture to prove the outbound text
equals the persisted terminal text.

## 4. Section 04 — Server, worker, render, bulk, retry, and recovery integration

### Objective

Thread one bundle through prompt generation, bulk packs, paid render, worker
dispatch, retry/repair, speaker-switch, and recovery without re-resolving a
different attachment set or adding text after optimization.

### Production scope

Modify the smallest relevant slices of:

- `apps/web/server/routers/verticalDramaEpisodes.ts` prompt/render/bulk paths;
- `apps/web/server/services/verticalDramaEpisodePipeline.ts` motion pack;
- `apps/web/shared/verticalDramaMedia/contracts.ts` worker payload schemas;
- `apps/web/server/services/verticalDramaVideoPromptFormatter.ts` to become
  text-preserving after terminal prompt persistence;
- worker dispatch and Python request serialization;
- existing task/credit/recovery metadata paths.

At prompt creation, resolve the canonical bundle once, persist the snapshot and
terminal result, and return inspection/mode/mapping summaries. At paid render,
compare bundle revision, fingerprint, prompt hashes, and capability-profile
version before credit admission. On mismatch, return stale and require a fresh
skill pass without charging/rendering.

Version worker packs with optional image-only start/stop and typed ordered
references. Read old singular video/audio fields for compatibility but never
write new payloads using them as the only representation. Preserve bundle and
terminal stamps through worker retries and completed-task linking.

### TDD tests before implementation

Cover:

- server reconstructs actual start/stop/reference URLs from authorized IDs;
- no stop means no stop field and remains a valid shot;
- prompt-only stop never reaches provider;
- paid render rejects stale revision/profile/prompt hash before credit/task;
- bulk, split-shot, speaker-switch, repair, compliance retry, and judge share
  the exact bundle fingerprint;
- worker old/new payload compatibility and no singular-field data loss;
- formatter cannot mutate terminal prompt/negative prompt;
- completed provider task recovers and links before a new paid attempt;
- provider transport gets typed arrays/native frame fields and mapping audit;
- task/credit idempotency and failure classification remain intact.

### Exit proof

Run the focused Vertical Drama router/pipeline/worker test files plus Python
provider request tests. Use fixtures with start-only, stop-only-invalid,
start+stop, image/video/audio mixed, and no-attachment shots.

## 5. Section 05 — Storyboard multimodal drag/drop and Library UX

### Objective

Give users separate image-only Start/Stop slots and a reusable multimodal
reference list supporting local files and Library assets with clear states and
model readiness.

### Existing pattern reference

Search evidence found image-only drop/upload behavior in
`VerticalDramaStoryboardPanel.tsx`, Library/canonical-media linking in existing
Vertical Drama reference flows, and richer modality handling in Media Studio
(`mediaStudioPayload.ts`, `mediaModelInputs.ts`, and `MediaStudio.tsx`). Reuse
the existing canonical asset-link and upload state patterns. Diverge only for
the separate image-only frame slots and the ordered mixed-modality list, because
the current shot strip cannot represent video/audio previews or temporal frame
semantics.

### UI/UX Contract

#### Target User / JTBD

- Role: Vertical Drama creator/editor.
- Goal: attach the exact visual/audio materials that should ground one shot and
  understand whether the selected video model can use them.
- Entry point: episode storyboard shot card.
- Success: attachments are visibly ordered, authorized, inspected, referenced in
  the optimized prompt, and ready for render without hidden drops.

#### Surface inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Shot card | `VerticalDramaStoryboardPanel.tsx` | Separate start/stop image slots and multimodal reference list. |
| Episode workspace | `VerticalDramaEpisodeWorkspace.tsx` | Pass bundle/readiness state without owning media rules. |
| Episode page | `VerticalDramaEpisodePage.tsx` | Wire prompts, imports, Library drag payloads, and stale/final states. |
| Managed media/library | Existing media/library surfaces | Expose canonical ID and media kind for drag payload. |

#### Component map

| Component | Owns | Consumes |
| --- | --- | --- |
| `ShotFrameDropSlot` | image-only start/stop validation and states | frame asset, mutation callbacks |
| `ShotReferenceMediaDropZone` | local/Library admission and reorder | accepted media kinds, revision |
| `ShotReferenceMediaList` | cards, labels, roles, segments, remove/reorder | typed references, inspection/readiness |
| `ReferenceMediaCard` | image/video/audio preview and status | canonical asset metadata |
| `ModelReadinessSummary` | mode, limits, block/selection reason | capability response |

#### State matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| loading/uploading | progress, disabled render, labelled status | component test + browser evidence |
| empty | optional stop explanation and reference drop affordance | component test |
| pending metadata | card visible but not prompt/render eligible | component test |
| success | modality preview, role, source, order, remove/reorder | component/browser |
| partial success | accepted cards remain; failed card shows retry/reason | component/browser |
| blocked | no paid action; exact capability/asset reason | component/browser |
| selected/hover/focus | visible selection/reorder target and focus ring | accessibility/browser |
| invalid drop | start/stop rejects video/audio; reference explains unsupported file | component/browser |

#### Responsive matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | cards stack; previews remain usable; actions in overflow/menu | browser screenshot |
| tablet 768x1024 | two-column card/list balance; no horizontal clip | browser screenshot |
| desktop 1440x900 | frame slots and reference list visible in shot workspace | browser screenshot |
| small-mobile 360x800 | compact metadata and accessible action menu | extended browser |
| laptop 1024x768 | preserve prompt/readiness visibility beside media list | extended browser |
| wide-desktop 1280x800 | no card overflow or clipped drop target | extended browser |

#### Accessibility acceptance

- Every drop action has a button/file-picker alternative.
- Keyboard can add, remove, reorder, focus, and inspect each item.
- Start/stop/reference labels and error messages are programmatically associated.
- Focus, selected, invalid, and disabled states have visible contrast.
- Reduced-motion preference disables nonessential reorder/upload animation.

#### Visual direction

Reuse existing storyboard card/drop-zone components and design tokens. Keep
frame role hierarchy stronger than generic references, show modality with icon
and text (not color alone), and use restrained transitions for upload/readiness.
Do not add a new global reset or raw color/spacing values.

#### Copy contract

- Primary language: Thai, with stable English modality labels where the product
  already uses them (`Start frame`, `Stop frame`, `Reference media`).
- Empty: “ยังไม่มี Stop frame (ไม่บังคับ)” and “ลากภาพ วิดีโอ หรือ audio มาใส่ได้”.
- Invalid frame: “ช่องนี้รับเฉพาะภาพสำหรับ Start/Stop frame”.
- Pending: “กำลังเตรียมไฟล์ ยังใช้สร้าง prompt หรือวิดีโอไม่ได้”.
- Blocked: “Model นี้ไม่รองรับชุดไฟล์นี้” followed by exact media/mode reason.
- Stale: “ข้อมูลอ้างอิงเปลี่ยนแล้ว กรุณาสร้าง prompt ใหม่”.
- Fallback: localization keys must fall back to existing Thai/English product
  defaults without exposing raw provider errors.

#### Browser evidence required

Follow `skills/orchestra/references/ui-browser-verification.md`. Capture the
required viewport matrix for local image/video/audio drag, Library drag,
image-only invalid frame drops, reorder/remove, pending/error/success/readiness,
and prompt final display. If browser tooling is unavailable, record the skip;
do not call it a pass.

### TDD tests before implementation

Add component/lib tests for local and Library payloads, MIME/content rejection,
image-only frame slots, pending/error/success, reorder/remove, 50-item ceiling,
keyboard alternatives, capability readiness, stale revision, and exact prompt
display. Include whole-video default and bounded video-segment selection, with
audio remaining whole-file in version 1. Use jsdom for browser-facing components.

### Exit proof

Run focused StoryboardPanel/EpisodePage/media input tests and browser evidence at
required viewports. Verify no unrelated UI files were changed.

## 6. Section 06 — Cross-section integration, ten-round gap loop, and rollout

### Objective

Prove the complete flow and perform at least ten explicit gap-review rounds,
fixing every concrete issue found before final handoff.

### Integration checks

1. Type exports/imports match across shared contract, router, worker, provider,
   and client.
2. One bundle fingerprint is used from UI snapshot through inspection,
   terminal prompt, QC, provider serialization, and recovery.
3. Real asset checks happen before skill invocation and before paid admission.
4. Prompt text is terminal-finalized and equal at persistence/UI/QC/outbound.
5. Provider profile/mode mapping is explicit for all enabled models and future
   same-transport registration.
6. Old image-only records and worker payloads remain readable.
7. Tenant/credit/task/recovery boundaries are preserved.

### Required ten review rounds

Run and record these rounds in the implementation closeout:

1. Contract/migration/legacy compatibility review.
2. Skill/prompt hash/attachment-reference review.
3. Provider mode/limits/future-version review.
4. UI state/responsive/accessibility/browser evidence review.
5. Security/concurrency/credit/retry/observability review.
6. Worker dispatch, ready assets, stop-frame transport, and tenant ownership.
7. Local/Library import, MIME truth, bulk generation, and fail-closed errors.
8. Multi-file mixed drop, previews, ordering, and capability-driven limits.
9. Profile-governed reference preservation and version-extensible adapters.
10. Terminal prompt ownership and mixed-media provider transport.

Each round must list findings as MUST_FIX or NICE_TO_HAVE. Apply all MUST_FIX
items, rerun affected tests, and repeat the round until no MUST_FIX remains.

### Final verification

Run focused web and Python suites first, then the narrowest cross-section suite
available. Run workspace typecheck only if it completes; a timeout is not a
pass. Review `git diff --check`, owned-path status, migration consistency,
secret/log safety, and browser evidence. Do not deploy, publish, or commit
unrelated worktree changes as part of this plan.

### Rollout

Keep multimodal modes and provider profiles feature-flagged until contract,
prompt equality, model routing, and recovery evidence pass. Enable old
image-only paths unchanged, then enable reference images, then video/audio
references per provider profile. Monitor blocked/unsupported/stale/inspection
failure/provider refusal/transport failure separately. Preserve generated assets
and attempt completed-task linking before any paid retry.

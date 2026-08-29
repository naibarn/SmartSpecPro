# Implementation plan — Vertical Drama special tie-in episode

## 1. Outcome and invariants

Add a feature-flagged `special_tie_in` episode path that starts from an idea dialog,
accepts managed visual references, runs the local `idea-to-video-prompt` skill, and
persists ready-to-edit start-frame and video prompts. The special episode then uses the
existing episode page, storyboard, prompt editing, asynchronous media tasks, credit
confirmation, and render controls.

The implementation must preserve these invariants:

- Existing episodes are `normal` by default and retain current numbering, Story Bible
  creation, nine-shot duration behavior, model-memory behavior, and normal prompt steps.
- Special creation never reads the overview story list and never invokes the normal story
  generation pipeline.
- A special episode has its own monotonic special sequence, separate from normal episode
  numbers and not reused after deletion.
- All special writes are tenant/user/series/episode scoped and use intent/version checks
  so stale retries cannot overwrite newer input.
- Canonical references are managed media/product/location identifiers plus provenance; raw
  URLs are only short-lived execution values and are never the API's source of truth.
- Image and video model selections are episode-local, snapshotted at creation, and never
  read from or written to normal series/model memory.
- Prompt text is authored by the skill. Server code validates, maps, and persists it but
  does not append creative prompt prose or marker blocks.

## 2. Shared contracts and persistence foundation

### Files and boundaries

- Extend `apps/web/drizzle/schema.ts` for `vertical_drama_episodes` with additive
  `episodeKind` (`normal | special_tie_in`, non-null default `normal`), nullable
  `specialSequence`, and nullable `specialData` JSONB. Add a unique special-sequence
  constraint/index that permits normal rows to remain unaffected.
- Add a dedicated per-series special sequence ledger/table (tenant, user, series,
  `nextSequence`, timestamps) or an equivalent transactional counter consistent with the
  repository's migration style. The sequence allocation must lock/update atomically and
  never decrement on delete.
- Add one hand-authored idempotent SQL migration under `apps/web/drizzle/migrations/`
  because this episode table has a manual-migration lineage. The migration must add
  columns safely, create the ledger/index, and backfill all existing rows as `normal`.
  Schema metadata must be aligned without regenerating unrelated migration history.
- Extend `apps/web/shared/verticalDramaSeries/contracts.ts` with discriminated additive
  episode/special input/output types and a resolved-shot contract. Existing fields remain
  optional/readable for legacy rows. Keep the existing start-frame and motion plan
  shapes, adding only special provenance and episode-local model snapshot metadata.
- Add shared validation helpers for the seven allowed special durations, 9:16, idea max
  5,000, total references max 3, speaking candidates max 4, actual speakers max 3,
  dialogue brief max 3,000, and shot count 1–5. Do not change normal
  `durationProfiles.ts` values.
- Add a shared `resolveVerticalDramaEpisodeShotContract(episodeKind)` at readiness and
  assembly boundaries. It must return the current normal 9-shot/8-clip contract for
  `normal` and the persisted variable 1–5-shot contract for `special_tie_in`; every
  normal-only completeness loop must use this resolver rather than a kind inference or
  hard-coded special branch.

### Special input and stored envelope

`specialData` is versioned and contains only bounded, serializable values:

- `contractVersion`, `idea`, `tieInType` (`product`, `location`, `store`, `mixed`),
  canonical `referenceAssets[]`, selected series character IDs, optional extra cast
  intent, duration, aspect ratio, dialogue mode, speaker character IDs, optional
  dialogue brief, identity/product/location lock booleans, and selected model IDs.
- `modelSnapshot` records image/video model IDs and capability metadata used for this
  episode; it is immutable for audit but a retry may use a newly selected explicit model
  only after a deliberate input update.
- `createIntentId`, `inputVersion`, `outputVersion`, timestamps, job ID/trace ID, and
  bounded status/error metadata.

Normalize and reject untrusted IDs through tenant-scoped lookups. Treat missing optional
  product images as valid only when the tie-in type does not require them; if a product
  tie-in has no usable reference, return an actionable validation error before charging.

### Tests first

Create focused shared/schema/migration tests for discriminator defaults, special-only
fields, tenant-safe sequence allocation, deletion non-reuse, all input bounds, legacy
normal rows, exact output shot cardinality, and round-trip JSON compatibility. Assert that
normal duration profile tests remain unchanged.

## 3. Creation, idempotency, and reconciliation service

### Server service

Create a dedicated service beside the existing episode services, for example
`verticalDramaSpecialEpisodes.ts`, with a narrow dependency-injected boundary:

- authorize series and characters in the caller tenant;
- validate and canonicalize selected managed media references;
- allocate the next special sequence transactionally;
- create the episode once for a `createIntentId` and return the existing record on replay;
- enqueue the durable special generation job with the episode scope;
- expose status, update-input, retry, and model-catalog operations.

Use the existing transaction/row ownership conventions. Creation must not call normal
`createEpisode`, `generateNextEpisodes`, Story Bible overview selection, or normal model
memory. Re-running the same intent after a network timeout must not create a second row.
Updating input increments `inputVersion`, invalidates the prior output, and enqueues a
new job only after the active job is safely superseded or completed. A worker may commit
results only when both `createIntentId` and `inputVersion` still match.

### Durable job integration

Extend `verticalDramaInteractiveJobs.ts` with a closed special job kind and use scope
`series:{seriesId}:episode:{episodeId}:special`. Reuse owner checks, active dedupe,
idempotency, trace IDs, bounded errors, and queued/running/succeeded/failed status. Add
progress stages (`validating`, `resolving_references`, `running_skill`, `persisting`,
`ready`) without exposing provider secrets. Worker dispatch must route only the special
kind to the special adapter; normal job kinds retain their current executors.

### Tests first

Test create replay, parallel create race, per-series special sequencing, cross-tenant
denial, stale worker output, update/retry behavior, queue dedupe, status polling, bounded
errors, and the assertion that normal creation/pipeline functions are not called.

## 4. Marketplace Capture and managed reference resolver

### Canonical selection flow

Add a special-dialog reference picker that reuses the existing Marketplace Capture access
and image selection behavior:

1. Open Marketplace Capture browser from the special dialog.
2. Search/filter products with `marketplaceCapture.listProducts` using debounced query,
   platform/category/sort filters, cursor pagination, loading/error/empty states, and
   result count.
3. Select a product card; load its images with
   `marketplaceCapture.listProductImages({ productId, ... })`.
4. Show image thumbnails with image type/source labels and keyboard-selectable checkboxes.
   Select 1–3 total references and confirm `เพิ่มภาพที่เลือก`.
5. Keep confirmed references when the user changes the pending product; clear only the
   unconfirmed pending selection. Enforce the aggregate max across product/location/store
   references.

Adapt `apps/web/client/src/components/marketplace/ProductImagePicker.tsx` as a controlled
selection primitive or extract its reusable selection logic; do not introduce a URL text
field as a substitute. The server receives managed product ID/image ID/capture provenance
and resolves access through the existing tenant-scoped marketplace/media services.

### Upload and location/store references

Provide a drag-and-drop/upload slot using the existing managed-media upload path. Validate
file type/size, upload to the canonical media registry, and store only the managed media
asset ID. A selected location/store image can be an existing Scenes-tab slot or create a
new special slot; the server reconciles it idempotently into `vertical_drama_locations`
and `vertical_drama_location_assets`, with provenance and a stable location key. The new
slot is immediately available to later shots/episodes. Never persist a provider URL as a
location asset.

### Resolver

Implement a special-only resolver that checks ownership and availability, returns a
bounded list of short-lived authorized reference URLs to the skill, and records a
reference-resolution summary. URL-only legacy values may be imported through managed
media or reported unavailable; they must not become canonical special input.

### Tests first

Test product search debounce/query mapping, product-to-image loading, 1–3 selection and
aggregate limit, pending-vs-confirmed behavior, tenant filtering, pagination, upload
canonicalization, location-slot reconciliation, URL non-canonical rejection, and
short-lived execution URL generation.

## 5. Skill bundle, adapter, and prompt ownership

### Skill contract additions

Update only the local `apps/web/skills/idea-to-video-prompt/` contract to support the
special adapter: add 12 seconds to the allowed duration enum without changing normal
episode profiles; document special max idea length 5,000; formalize 9:16; allow up to
four selected character references while limiting actual speakers to three; support
optional non-speaking/background cast, product/location reference roles, explicit lock
flags, and a deterministic response-to-shot mapping. Keep output 1–5 shots and require
exact duration per returned shot.

The adapter must load `SKILL.md`/`skill.md`, input/UI/output schemas, and video-prompt
rules in stable order, validate the input and structured output, and reject malformed,
unsafe, missing, or over-cardinality results. Use stable skill reference IDs such as
`person_<characterId>`, `product_<assetId>`, and `location_<assetId>` while passing the
resolved authorized URL separately.

### Special runtime adapter

Create a service module that accepts the stored envelope plus resolved runtime references,
invokes the skill through the repository's existing skill/LLM boundary, and returns a
typed result. The adapter must:

- preserve the user's idea and requested constraints;
- include selected image/video model capabilities as context, but not read normal memory;
- preserve character identity and product/location fidelity when locks are enabled;
- use the skill's returned `shots[]` as the sole creative source;
- map each returned shot to exactly one start-frame prompt and one motion prompt;
- persist `shotCount` from the skill result, never pad to nine, and reject 0 or >5;
- map dialogue turns to selected characters, retaining no dialogue when mode is none;
- persist assumptions/quality/provenance and normalized output versions.

On semantic validation failure, retry the same skill at most twice with compact violation
codes. Replace the entire structured output on retry; never append corrective creative
text server-side. On final failure, mark the job failed with typed actionable error and
release any reserved credits through the existing policy.

### Model isolation

Add a special-only capability catalog and `listSpecialTieInModels`. The dialog displays
separate Image Model and Video Model selectors and validates compatibility before submit.
Do not use normal series-selected model memory or write back to it. Store IDs and a
capability snapshot in the special envelope and in `startFramePlan.selectedImageModelId`
and `motionPromptPack.selectedVideoModelId`. Do not hydrate or persist these values
through normal series preferences or shared browser model-memory state.

### Tests first

Test skill file load order/missing file errors, schema validation, 12-second support only
for special input, reference ID/URL separation, locked-reference propagation, exact
shot mapping, dialogue/no-dialogue mapping, semantic retry cap, malformed-output failure,
model catalog isolation, prompt equality, and absence of server creative suffixes or
marker blocks.

## 6. API and shared episode-page UI

### tRPC/API contract

Add protected procedures to `verticalDramaEpisodes` (or a dedicated special router
mounted alongside it) with explicit input/output schemas:

- `listSpecialTieInModels`
- `createSpecialTieInEpisode({ seriesId, createIntentId, input })`
- `getSpecialTieInStatus({ episodeId, jobId? })`
- `updateSpecialTieInInput({ episodeId, inputVersion, patch })`
- `retrySpecialTieInEpisode({ episodeId, inputVersion })`

Return bounded status, progress, error code/message, episode ID/sequence, output version,
shot count, model snapshot, and reference summary. Keep normal procedures and response
shapes backward-compatible. Enforce feature flag, auth, series ownership, character
ownership, media ownership, and model capability checks at the server boundary.

### Series entry dialog

Modify `VerticalDramaSeriesDetailPage.tsx` by adding a visible special action next to the
existing normal “สร้างตอนย่อยใหม่” action. The special action opens a dialog and does not
reuse the normal overview count/episode input. Its fields are: idea textarea with live
5,000 counter, tie-in reference picker/upload, series character selector, duration,
aspect-ratio read-only 9:16, dialogue mode, speaker selection up to 4, optional dialogue
brief, optional extra cast, lock toggles, Image Model, Video Model, and submit/cancel.

The dialog has explicit loading/empty/error/success states for Marketplace Capture and
model catalog, preserves draft values on recoverable errors, disables submit while
invalid/submitting, and shows the created special episode link/status. Do not alter the
normal add-episode handler or overview-driven generation UI.

### Existing episode page/storyboard

Modify `VerticalDramaEpisodePage.tsx` and
`VerticalDramaStoryboardPanel.tsx` through an additive `episodeKind`/view-mode branch.
For special episodes hide/disable normal story/script/stage-generation actions and
overview-specific controls. Retain shared episode title/status, prompt edit, start-frame
display/generation controls, video prompt/render controls, task polling/resume, downloads,
credit confirmation, and shared error handling. Render the number of special shots
returned by the skill; do not render nine placeholders.

Use shared components and hooks for cards, buttons, task state, media authorization,
dialog/focus handling, and localization. Create only special-specific wrappers/props for
the different fields and gates.

### UI/UX Contract

#### Target User / JTBD

- Role: Vertical Drama creator/marketer.
- Goal: turn a tie-in idea and chosen product/location/person references into a short
  ready-to-edit special episode.
- Entry point: series Episodes tab, beside existing normal episode creation.
- Success: special episode is visible, correctly numbered, prompts are ready, and normal
  episode controls remain unchanged.

#### Existing Pattern Reference

- Search: targeted `rg` for `createEpisode`, prompt preview/edit, drag/drop upload, and
  Marketplace Capture product/image selection under `apps/web/client/src`.
- Found: `VerticalDramaSeriesDetailPage.tsx` normal add flow,
  `VerticalDramaEpisodePage.tsx`/`VerticalDramaStoryboardPanel.tsx` prompt/media flow,
  `ProductImagePicker.tsx`, and Marketplace Capture product pages.
- Decision: reuse. Adapt shared controlled picker, existing dialog/button/card styles,
  existing tRPC query states, and existing task polling/render components. Diverge only
  for the special two-step product browser and special-only fields.

#### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Series Episodes tab | `VerticalDramaSeriesDetailPage.tsx` | Add special action/dialog |
| Product picker | shared marketplace component/new special wrapper | Search product then images |
| Episode route | `VerticalDramaEpisodePage.tsx` | Add special mode gating |
| Storyboard | `VerticalDramaStoryboardPanel.tsx` | Render 1–5 resolved shots |
| Scenes tab | location components/router | Reuse/reconcile new slot |

#### Component Map

| Component | Ownership |
|---|---|
| `SpecialTieInEpisodeDialog` | form state, validation, submit, status |
| controlled Marketplace Capture picker | product/image search and selection |
| upload/reference slot | managed upload and preview |
| special episode view branch | hides normal generation, keeps shared controls |
| shared storyboard/prompt/task components | unchanged contracts plus additive props |

#### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | spinner/skeleton and disabled submit | component test/browser |
| empty | “ไม่พบสินค้า/ภาพที่เลือกได้” with retry/search guidance | component test |
| error | inline actionable error; draft retained | component test |
| success | selected chips/thumbnails, created episode/status link | component/browser |
| partial success | job status with completed prompts and missing render action | service/UI test |
| disabled | clear reason for invalid idea/ref count/model | component test |
| selected/hover/focus | visible selection/focus rings and keyboard operation | accessibility/browser |

#### Responsive Matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | single-column dialog, sticky visible actions, horizontal thumbnail strip only where intentional |
| tablet 768x1024 | two-column form/picker where space permits, no clipped dialog |
| laptop 1024x768 | preserve episode sidebar and scrollable dialog body |
| desktop 1440x900 | balanced form + picker and episode storyboard grid |
| small-mobile 360x800 | compact labels and body scroll; no horizontal overflow |
| wide-desktop 1280x800 | cap dialog width and keep primary action visible |

#### Accessibility Acceptance

Keyboard reaches open dialog, all fields, picker results/images, cancel, and submit in
logical order; focus is trapped in modal and restored to trigger. Every input has a label,
counter/error association, and accessible name. Selection uses checkbox/radio semantics;
drag/drop has a keyboard upload alternative. Focus contrast and text contrast follow the
existing design system. Loading uses status announcements without stealing focus; reduced
motion disables decorative animation.

#### Visual Direction

Reuse existing Vertical Drama cards/dialogs, neutral surfaces, current spacing/radius/
color tokens, and established Thai/English typography. Make the two-stage Marketplace
Capture choice hierarchy obvious, keep the 1–3 cap visible, and avoid adding a new visual
system or raw colors/geometry.

#### Copy Contract

- Tone: clear, production-oriented, concise, Thai-first with English fallback.
- Required labels: `สร้างตอนพิเศษ`, `ไอเดียหรือโจทย์`, `ภาพสินค้า/สถานที่/ร้านค้า`,
  `เลือกจาก Marketplace Capture`, `ความยาวต่อช็อต`, `สัดส่วน 9:16`, `โหมดบทพูด`,
  `ผู้พูด`, `เพิ่มตัวละคร/ตัวประกอบ`, `ล็อกภาพคน`, `ล็อกภาพสินค้า/สถานที่`,
  `Image Model`, `Video Model`, `เพิ่มภาพที่เลือก`.
- Validation: show exact limits for 5,000 characters, 1–3 references, max 4 selected
  characters/max 3 speakers, and supported durations.
- Empty/loading/error/success messages must have Thai text and English fallback, preserve
  draft values, and identify whether the problem is input, access, skill, provider, or
  rendering.

#### Browser Evidence Required

Record `<planning-dir>/implementation/ui-browser-evidence.md` using the canonical mobile
390x844, tablet 768x1024, desktop 1440x900, plus small-mobile/laptop/wide-desktop for
dense picker/sidebar layouts. Check no new console errors, no overflow, keyboard/focus,
labels, loading/empty/error/disabled states, and unchanged normal episode entry.

### Tests first

Add component/page tests for dialog validation, Marketplace Capture two-stage flow, upload
slot, model isolation, special status, normal-flow non-regression, special shot count,
hidden normal controls, prompt editing/render reuse, keyboard labels/focus, and the
failure/partial-success copy/state matrix.

## 7. Observability, security, billing, and rollout

Emit structured events with tenant/user/series/episode/job/trace IDs, input/output version,
model snapshot, skill version, reference count/source kinds, shot count, duration, retry
count, outcome, and bounded error category. Never log idea text, image URLs, tokens, or
provider credentials. Track skill latency, queue latency, reference resolution failures,
validation retries, prompt-ready rate, and render conversion separately from normal
episode metrics.

Apply existing auth and credit policy: validate/access-check before reservation, reserve
only for billable skill/provider work, prevent double charge on idempotent replay, release
on terminal failure, and keep prompt generation distinct from explicit media rendering if
that is the existing policy. Feature flag off must hide entry and reject direct API calls.

Roll out in this order: migration/backfill and contract tests, server adapter/API behind
flag, Marketplace Capture picker/location reconciliation, shared episode UI, then focused
integration/browser checks. Add a kill switch that leaves existing normal episodes
readable and operable.

## 8. Integration and verification gates

The final implementation must run, in order:

1. focused shared contract/schema/migration tests;
2. special service/interactive-job/resolver tests;
3. skill schema/fixture tests;
4. router/API and Marketplace Capture tests;
5. component/page tests;
6. typecheck/lint/build checks appropriate to the changed packages;
7. full `cd apps/web && pnpm test` (or record exact baseline failures);
8. migration status/check without claiming production execution;
9. browser evidence at required viewports when tooling is available.

Review the diff with `git diff --stat` and targeted path checks. Inspect normal flow
fixtures and assert no normal-only function or model-memory call is routed through the
special path. Run at least five post-implementation gap audits across: data/API,
skill/runtime, Marketplace/media security, UI/accessibility, and regression/operations.
Each audit must record findings, fix all must-fix items, rerun affected tests, and leave a
short report under the implementation state directory.

# Feature 160 — Deep Implementation Plan

## 0. Delivery strategy

Implement the feature as eight dependency-ordered sections. Each section owns a bounded set of files, has focused Vitest proof, and leaves existing flag-off behavior unchanged. The implementation extends Feature 156 source packs and existing Vertical Drama generation/assembly contracts; it does not create a second media registry or replace existing shot references.

The critical data flow is:

`user premise` → `prompt expansion preview` → `user-approved brief/profile` → `source-slot plan` → `managed source media/segments` → `immutable visual-source snapshot` → `draft/full/deep story outputs` → `start-frame/reference/B-roll projections` → `episode assembly/readiness gate`.

The `news_report` profile uses the same path but inserts a claim/evidence ledger between approved brief and story/assembly readiness.

### Cross-cutting rules

- Use existing tenant/user procedures and managed-media authorization; reject missing tenant identity before DB/provider/credit work.
- Use Zod schemas at every tRPC and service boundary. IDs, revisions, enum values, URLs, MIME types, durations, and timecodes are bounded and server-validated.
- Never accept LLM-proposed media URLs, storage keys, media IDs, evidence states, or segment timecodes as authoritative. Resolve proposal keys against an owner-scoped snapshot.
- Use Drizzle transactions for snapshot creation, correction propagation, and binding mutations that must be atomic.
- Use idempotency keys for preview/apply, upload registration, generated slot media, and binding mutations.
- Treat current managed media assets/storage objects and the `media_assets` table as canonical; provider URLs are provenance/fallback only.
- Keep AI-origin media `illustrative` by default. It may illustrate a claim but cannot make the claim verified.
- Every persisted story-generation artifact carries `visualSourceRevision` and `visualSourceFingerprint`; a mismatch is `stale_input` and never silently auto-merges.
- The feature flags are additive. With flags off, current premise, source-pack, shot-reference, story-generation, and assembly behavior remains intact.

## 1. Shared contracts and deterministic core

### Goal

Create the pure, shared TypeScript contracts and validators used by all later sections. This is the canonical vocabulary for modality, origin, semantic role, evidence, source segments, snapshots, coverage, news claims, and B-roll bindings.

### Files

- Add `apps/web/shared/verticalDramaSeries/visualSource.ts` for enums, Zod schemas, snapshot/fingerprint input, coverage findings, source segments, and binding contracts.
- Add `apps/web/shared/verticalDramaSeries/newsReport.ts` for `news_report` profile, claim/evidence/correction schemas, freshness/status enums, and disclosure rules.
- Extend `apps/web/shared/verticalDramaSeries/sourcePack.ts` only with additive fields needed by the new contracts; preserve serialized legacy shapes.
- Add `apps/web/server/services/verticalDramaVisualSourceCore.ts` for pure normalization, fingerprint input canonicalization, deterministic coverage findings, segment-bound validation, B-roll timeline validation, and stale-reason calculation.
- Add `apps/web/server/services/__tests__/verticalDramaVisualSourceCore.test.ts` and `verticalDramaNewsReportContracts.test.ts`.

### Contract requirements

`VisualMediaType` supports `image` and `video`; `VisualMediaOrigin` supports `ai_generated`, `user_upload`, `web_import`, and `existing_managed`; `VisualSemanticRole` supports `scene_anchor`, `reference`, `b_roll_still`, `b_roll_footage`, `graphic`, and `text_overlay`; `VisualEvidenceStatus` supports `not_applicable`, `illustrative`, `needs_verification`, `partially_verified`, `verified`, `stale`, `contradictory`, and `blocked`.

`SourceMediaSegment` contains stable `segmentId`, parent source asset ID, segment revision, media type, finite `inSeconds`/`outSeconds`, label/description, evidence scope, capture/location/source metadata, audio policy, and status. Still usage is represented as a bounded segment-like record with no fake video time range.

`VisualSourceSnapshot` contains snapshot ID/revision/fingerprint, pack/profile identity, approved slots, source media projections, segment revisions, rights/disclosure state, evidence status, coverage obligations, and capture time. Fingerprint input must be deterministic and exclude volatile signed URLs.

`VisualCoverageRequirement` identifies the story/episode/scene/shot obligation, allowed semantic roles/modalities, factual scope, required evidence level, and whether the obligation is fulfilled. Coverage validation returns machine-readable findings with severity, stable codes, and related slot/claim IDs.

`VisualUsageRef` distinguishes `scene_anchor`, `reference`, `b_roll_still`, and `b_roll_footage`. A footage ref must include source asset, segment, parent segment revision, in/out, audio policy, label mode, and visual-source fingerprint.

`NewsClaim` contains claim ID, text, claim type, geography, validity window, as-of timestamp, source/evidence refs, visual refs, attribution, status, correction lineage, and freshness. AI visual refs can never change a claim from `needs_verification` to `verified`.

### TDD

- Reject invalid MIME/modality/role combinations and non-finite or reversed segment bounds.
- Produce identical fingerprints for equivalent canonical inputs and different fingerprints for source/segment/evidence/profile changes.
- Keep legacy source-pack payloads readable when new fields are absent.
- Detect scene-anchor/reference/B-roll conflicts deterministically.
- Validate B-roll ordering, still duration, exact video segment bounds, audio policy, disclosure, rights, and stale fingerprints.
- Keep current, stale, contradictory, archive, and AI-illustrative news states distinct.

## 2. Database schema and migration

### Goal

Persist the new contracts with tenant-safe ownership and revision history while reusing existing source-pack/media tables.

### Files

- Extend `apps/web/drizzle/schema.ts` with additive columns on source assets/slots where the existing table is the authoritative owner.
- Add tables in a new hand-authored migration under `apps/web/drizzle/` following repository naming/order conventions:
  - `vertical_drama_source_media_segments`
  - `vertical_drama_visual_source_snapshots`
  - `vertical_drama_news_claims`
  - `vertical_drama_news_evidence_revisions`
  - `vertical_drama_shot_broll_bindings`
- Add schema/migration contract tests under `apps/web/drizzle/__tests__/feature160VisualSourceSchema.test.ts`.
- Add a migration/reconciliation note under the feature implementation directory; do not edit unrelated release artifacts.

### Schema shape

Every new table has tenant ID, user ID, created/updated timestamps, and the narrowest parent FK. Segment rows reference source asset and pack; snapshot rows reference pack/series and store immutable JSON projection plus fingerprint; claim/evidence rows reference series/profile and revision; B-roll rows reference series/episode/shot, source slot/asset/media, optional segment, snapshot revision/fingerprint, timeline values, fit/audio/label policy, active/status.

Use composite indexes for tenant+series/pack/episode lookups, unique active segment revision identity, snapshot fingerprint lookup, claim revision/as-of lookup, and active B-roll order. Use partial uniqueness where supported so deactivated/stale rows do not block replacement. Do not cascade-delete canonical `media_assets` when a source/binding row is removed.

### Migration behavior

- Existing source assets default to `image`/legacy origin semantics only when the current persisted source kind proves it; never claim evidence verification during backfill.
- Existing image shot-reference rows remain untouched.
- No automatic conversion of existing source slots into video segments or B-roll rows.
- New columns are nullable/defaulted for compatibility; new writes require complete contracts once the flag is enabled.
- Migration tests validate table names, columns, indexes, FKs, default states, and no destructive drop/backfill behavior.

## 3. Prompt expansion, research, and source-slot authoring

### Goal

Add an optional preview/apply workflow to the existing planning surface and create source-slot suggestions from the approved brief.

### Files

- Extend `apps/web/server/services/promptEnhancementService.ts` through a feature-specific adapter rather than duplicating skill execution. Add `apps/web/server/services/verticalDramaPromptExpansionService.ts` for request normalization, editorial classification, bounded research context, response schema parsing, warning generation, and compare-and-swap apply data.
- Reuse `apps/web/server/services/webSearchToolInjector.ts`, `skillModelFallback.ts`, and existing skill/catalog resolution. The adapter must request web search for identifiable places/software/current events and mark broad-topic output as illustrative when no evidence is present.
- Extend `apps/web/server/routers/verticalDramaSeries.ts` with preview/get/apply/retry and source-slot suggestion/prompt/image procedures under existing owner-scoped `verticalDramaProcedure` conventions.
- Add or extend shared source-pack contracts and `verticalDramaSourcePackService.ts` for modality/origin/evidence/metadata fields, preserving attach/readiness/digest behavior.
- Modify the planning portion of `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx` and/or its extracted planning component. Add focused components under `apps/web/client/src/components/verticalDramaSeries/` rather than inflating the page further.
- Add server/client tests for prompt preview/apply/CAS, research mode, slot suggestion, prompt generation, and flag-off parity.

### Server behavior

Preview input contains series/draft session scope, original prompt, prompt hash, optional profile hint, locale, research permission, and idempotency key. Response contains expanded editable brief, classification, research findings with source URLs/titles/as-of, uncertain claims, proposed visual slots, generated prompt suggestions, warnings, and run status. Preview never mutates the premise.

Apply requires original prompt hash and preview revision. It writes only the approved expanded prompt/brief/slot plan, records audit metadata, and returns the normal planning-flow pointer. A stale compare-and-swap returns a recoverable conflict with current prompt state.

The skill adapter must parse bounded JSON, reject unknown IDs/URLs as authoritative, cap research sources and prompt length, distinguish researched facts from creative interpretation, and degrade to a clearly marked non-researched preview when search is unavailable.

Source-slot suggestions derive from the approved brief and profile, not from arbitrary client fields. Prompt generation uses the slot description and role. AI image generation reuses existing managed media generation/credit paths and stores origin/disclosure/evidence defaults.

### UI/UX Contract

#### Target User / JTBD

- Role: creator/editor preparing review, documentary, news, or Vertical Drama source material.
- Goal: turn a vague premise into an editable, evidence-aware brief and visual source plan.
- Entry point: existing Vertical Drama planning premise field and source/media planning step.
- Success outcome: user understands what the AI inferred, what was researched, what remains uncertain, and can apply or reject without losing the original prompt.

#### Existing Pattern Reference

- Searched with targeted `rg` in `apps/web/client/src/components`, `apps/web/client/src/pages`, and existing tests for prompt preview dialogs, `AIDraftModal`, `CreateSeriesWizard`, source-pack cards, Media Studio upload/history, and storyboard reference pickers.
- Found patterns: `AIDraftModal.tsx` for AI preview/loading/error/cancel semantics; `CreateSeriesWizard.tsx` and `VerticalDramaSourcePack*` components for staged source-pack editing; `VerticalDramaStoryboardPanel.tsx` for media role selection.
- Decision: reuse those patterns and extend them. Diverge only by adding an evidence/research summary panel because the existing prompt modal does not expose source citations or claim uncertainty.

#### Surface inventory

| Surface | File/route | Change |
|---|---|---|
| Planning premise | Vertical Drama series planning route | Add optional expansion action and dialog |
| Expansion dialog | New feature-scoped component | Preview, editable fields, research/source panel, warnings, apply/cancel |
| Source-slot panel | Existing source-pack planning surface | Add modality/origin/evidence/actions |
| Prompt/image action | Slot card | Generate prompt and generate image with task/credit state |

#### Component map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `VerticalDramaPromptExpansionDialog` | `client/src/components/verticalDramaSeries/` | modal state, edit buffer, apply/CAS, cancel | preview query/mutation |
| `VisualResearchSummary` | same | sources, as-of, uncertainty, disclosure | preview result |
| `VisualSourceSlotCard` | same | slot metadata and actions | source-slot contract |
| planning integration | existing planning page/component | entry point and normal-flow return | dialog callbacks |

#### State matrix

| State | Expected UI | Verification |
|---|---|---|
| idle | optional action visible, original prompt unchanged | client test |
| loading | dialog skeleton/progress and disabled apply | client test/browser |
| success | editable brief, source list, slots, warnings | client test/browser |
| partial research | explicit unavailable/needs-verification banner | server/client test |
| empty | explanation that no expansion was produced; retry/cancel | client test |
| error | recoverable error with retry; original prompt retained | client/browser |
| disabled | apply disabled while stale or invalid | client test |
| focus/hover/selected | visible keyboard focus and selected slot state | browser/a11y |

#### Responsive matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | dialog becomes full-height sheet; sections stack; primary actions remain sticky |
| tablet 768x1024 | two-column preview/research layout may collapse when narrow |
| desktop 1440x900 | preview and research/slot summary shown side-by-side without horizontal overflow |
| small-mobile 360x800 | extended check for dense source cards and sticky actions |
| laptop 1024x768 | extended check for planning sidebar plus dialog |
| wide-desktop 1280x800 | extended check for source list width and table-like metadata |

#### Accessibility acceptance

- Dialog has labelled title/description, focus trap, Escape cancel, and focus restoration.
- Every input has a visible label; icon-only actions have accessible names.
- Apply/cancel/retry are keyboard reachable in logical order; focus ring is visible.
- Research source links and warning states have text equivalents and sufficient contrast.
- No essential meaning depends only on color or motion; respect reduced-motion preference.

#### Design Token Extraction

Sources: existing `AIDraftModal.tsx`, `CreateSeriesWizard.tsx`, Vertical Drama source-pack components, and app theme/token styles.

- Color: reuse semantic neutral, primary, warning, success, error, and info tokens already used by the planning UI; no new raw hex values.
- Typography: reuse existing page heading/body/caption hierarchy and Thai/English i18n conventions.
- Spacing/radius/elevation: reuse existing dialog/card/button/input primitives and current Tailwind/theme tokens.
- Motion: restrained open/progress transitions; honor reduced motion.
- Components: reuse existing dialog, badge, button, textarea, tabs, upload, and toast primitives.
- Density: balanced operational card layout; source metadata can be dense but must remain scannable.

#### Copy Contract

- Tone: clear, neutral, helpful; explain uncertainty without overstating AI confidence.
- Primary languages: Thai and English via existing locale files.
- Labels: “ขยายโจทย์ด้วย AI”, “ตรวจสอบข้อมูล”, “แหล่งข้อมูล”, “ยังไม่ได้ยืนยัน”, “นำไปใช้”, “ยกเลิก”, “สร้าง Prompt”, “สร้างภาพประกอบ”.
- Errors: explain whether search, generation, storage, or stale revision failed and preserve user text.
- Loading/success: show “กำลังตีความโจทย์…”, “กำลังค้นหาข้อมูล…”, “พร้อมให้ตรวจสอบ”, and “นำโจทย์ไปใช้แล้ว”.
- Fallback: missing locale falls back to English through existing i18n behavior.

#### Browser evidence required

Capture prompt idle/loading/success/edited/cancel/apply/error at mobile/tablet/desktop; verify no new console errors, keyboard path, focus, overflow, readable states, and accessible names according to `ui-browser-verification.md`.

## 4. Visual source snapshot and story propagation

### Goal

Make the accepted visual source set a first-class immutable input to all story stages, including standard draft, full story, deep story, premium, retry/resume, start-frame, motion prompt, and B-roll planning.

### Files

- Add `apps/web/server/services/verticalDramaVisualSourceSnapshotService.ts` for owner-scoped snapshot creation/read/reconcile, coverage plan creation, fingerprinting, and stale propagation.
- Extend `apps/web/server/services/verticalDramaStoryGenerationContracts.ts` with typed visual snapshot input/output metadata and validation findings.
- Extend `verticalDramaStoryBible.ts`, `verticalDramaStoryArchitecturePlanner.ts`, `verticalDramaStoryboardGeneration.ts`, `verticalDramaStartFrameGeneration.ts`, and their adapters with optional snapshot input that becomes required when the propagation flag is on.
- Extend `verticalDramaSeries.ts` job/admission paths so standard/deep/premium/retry/resume all load the same snapshot and persist the same fingerprint.
- Add focused server tests for every entry point and stale-fence path.

### Propagation rules

Snapshot precedence is: explicit user-approved media binding/segment > immutable visual snapshot > approved source plan > LLM prose. LLM output may emit bounded slot/claim/segment keys and proposed usage refs; the server resolves and validates them.

Each stage records the snapshot ID/revision/fingerprint in its run/artifact metadata. A source slot, segment, evidence revision, rights/disclosure state, or profile change creates a new snapshot revision and marks dependent draft/story/start-frame/B-roll artifacts stale. Re-running uses a new snapshot; it does not mutate historical outputs.

Coverage gates run after prompt expansion, source planning, draft story, full/deep story, start-frame/reference resolution, B-roll planning, and final assembly. Missing visual coverage is a warning for optional slots and a blocking finding for required slots or news claims.

Deep and premium chunk/resume paths must load the snapshot from the durable parent run, not reconstruct it from the current source pack. If the current source pack no longer matches the run fingerprint, resume returns stale-input/restart-required and preserves the previous partial result.

### TDD

- Snapshot fingerprint remains stable across URL refreshes and changes when source revision/segment/evidence changes.
- Standard, deep, premium, retry, and resume all receive identical snapshot IDs/fingerprints.
- Missing or stale snapshots block finalization and do not call paid generation.
- Generated output references resolve only to owner-scoped snapshot IDs and valid slot/claim/segment keys.
- Source changes stale all intended downstream artifacts and leave unaffected unrelated series untouched.

## 5. News report and evidence lifecycle

### Goal

Implement the separate `news_report` profile with factual claim/evidence gates and correction propagation while reusing shared visual sources.

### Files

- Add `apps/web/server/services/verticalDramaNewsReportService.ts` for claim extraction/normalization, source mapping, freshness calculation, contradiction handling, correction revision, and publish readiness.
- Extend `verticalDramaSeries.ts` or a focused `verticalDramaNewsReport.ts` router module with claim ledger, evidence verification, correction, and readiness procedures.
- Extend profile registries/seed data and shared profile types with `news_report`, modes (`breaking`, `developing`, `explainer`, `retrospective`), required source/evidence policy, and disclosure policy.
- Add `apps/web/client/src/components/verticalDramaSeries/VerticalDramaNewsEvidencePanel.tsx` and integrate it into the planning/story review route.
- Add server/client tests and a Nan flood/landslide fixture with dates, numbers, geography, station N.1 history, source links, and correction revision.

### News rules

The prompt classifier may recommend news, but user profile selection is authoritative. Every material current/numerical claim starts as needs-verification. Research results must carry URL/title/publisher/published or accessed time and the claim scope they support. A source can be partial or contradictory; the UI must show that state rather than flattening it.

Claim `asOf` and validity are required for current reports. When evidence expires or a correction is applied, dependent claims and all downstream narration, subtitles, lower-thirds, visual bindings, story outputs, and assembly projections become stale. Archive/file footage is allowed only with a visible label. AI visuals remain illustrative and cannot verify the flood numbers or historical measurements.

The Nan fixture must prove that the supplied narrative is not silently accepted as fact: the system extracts claims such as 7 districts/34 subdistricts/223 villages, 20,000 families, 19–21 August monitoring, N.1 levels, 8.40–8.50m wall capacity, 8.72m water level, and 22–32cm overflow; each is mapped to evidence status and visual coverage before publish readiness.

### UI/UX Contract

#### Target User / JTBD

- Role: editor/reporter.
- Goal: decide whether a report is factually supported and whether every claim has an appropriate visual source.
- Entry point: `news_report` planning/review surface.
- Success outcome: publish readiness explains verified, partial, stale, contradictory, and missing claims.

#### Existing Pattern Reference

- Reuse existing evidence/research cards from `AIDraftModal`, marketplace insight/source displays, and Vertical Drama run/QC views; targeted search covered `evidence`, `source`, `research`, `claim`, and `run detail` components.
- Decision: reuse existing badges, warning cards, source links, and QC finding presentation; add claim-row/correction controls because no current surface combines claim scope and visual binding.

#### Surface inventory

| Surface | Change |
|---|---|
| profile selector | add news report profile/mode |
| claim ledger | claim rows, evidence/source links, as-of/freshness |
| visual mapping | attach source slot/segment only within evidence scope |
| correction panel | create correction revision and show stale cascade |
| readiness gate | block/allow with actionable findings |

#### Component map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `VerticalDramaNewsEvidencePanel` | `client/src/components/verticalDramaSeries/VerticalDramaNewsEvidencePanel.tsx` | claim/evidence rows, correction action, readiness summary | claim ledger/readiness queries |
| `NewsClaimRow` | same feature component or extracted child | one claim's status, sources, visual refs, as-of | `NewsClaim` projection |
| planning/review integration | existing series detail/planning surface | profile selection and panel placement | news profile state |

#### State matrix

| State | Expected UI |
|---|---|
| loading | skeleton claim rows and research progress |
| empty | explain no claims/evidence yet and offer research |
| needs verification | amber warning with source action |
| verified | source and as-of visible |
| partial/contradictory | explicit status and competing sources |
| stale/corrected | red/amber stale cascade and re-run action |
| blocked | publish disabled with exact findings |

#### Responsive matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | claim rows stack; evidence details open as disclosure panels; correction action remains reachable |
| tablet 768x1024 | claim/evidence columns collapse when needed without clipping source links |
| desktop 1440x900 | table-like claim/evidence layout with visible as-of/freshness and no horizontal overflow |
| small-mobile 360x800 | extended check for dense status/source labels |
| laptop 1024x768 | extended check for planning navigation plus claim panel |
| wide-desktop 1280x800 | extended check for long source titles and correction history |

#### Accessibility acceptance

Use semantic headings, labelled claim rows, keyboard-accessible source links/correction controls, non-color status text, focus-visible controls, screen-reader descriptions for stale/verified states, and reduced-motion-safe transitions.

#### Copy Contract

Thai-first labels with English fallback: “ข้อเท็จจริง/Claim”, “แหล่งข้อมูล”, “ณ วันที่”, “ยืนยันแล้ว”, “รอตรวจสอบ”, “ข้อมูลล้าสมัย”, “ข้อมูลขัดแย้ง”, “สร้างฉบับแก้ไข”. Never say “verified” when only an AI illustration exists.

#### Browser evidence required

Capture Nan fixture with needs-verification, verified, stale correction, contradictory, archive label, and blocked publish states at required viewports.

## 6. Shot semantic binding, footage segments, and B-roll assembly

### Goal

Allow stills and exact video footage segments to be linked to each shot without confusing scene anchors, image references, and B-roll, and carry the result into deterministic episode assembly.

### Files

- Extend `apps/web/server/services/verticalDramaShotReferences.ts` only for typed source-slot/scene-anchor/reference resolution; keep its table and API image/reference-only.
- Add `apps/web/server/services/verticalDramaBrollService.ts` for bind/unbind/reorder, segment revision checks, duration/audio/fit/label validation, and assembly projection.
- Extend `apps/web/server/services/verticalDramaAssembly.ts` and `verticalDramaEpisodeVideoAssembly.ts` to consume a typed B-roll projection while preserving generated clip ordering and storage checks.
- Extend `apps/web/server/routers/verticalDramaEpisodes.ts` with B-roll procedures and `verticalDramaSeries.ts` with source-slot/scene-anchor procedures where ownership belongs.
- Extend `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`, `VerticalDramaEpisodeWorkspace.tsx`, and/or `VerticalDramaStoryboardPanel.tsx` through focused child components for media selection and timeline editing.
- Add tests for role conflicts, segment exactness, audio policy, overflow, stale binding, and assembly projection.

### Binding rules

`scene_anchor` is the sole environment/start-frame promotion path and requires explicit user action. `reference` is an image conditioning path. `b_roll_still` uses a source image with explicit display duration. `b_roll_footage` uses one exact source video segment with in/out and cannot be represented by a reference row.

Every binding stores snapshot ID/revision/fingerprint, slot/source/media/segment IDs, segment revision, order, duration or in/out, fit/crop policy, audio policy, disclosure/attribution label, and status. The server rejects missing storage, stale segment revisions, invalid bounds, rights/disclosure blocks, out-of-order or over-budget timelines, and cross-tenant assets.

Assembly must preserve exact video in/out, still display duration, deterministic order, audio policy, safe-area fit/crop, and visible labels. Partial assembly results remain recoverable and do not delete canonical source media. Generated motion clips remain the primary episode clips; B-roll is an explicit additional projection.

### UI/UX Contract

#### Target User / JTBD

- Role: episode editor.
- Goal: select the correct visual role and place real/AI media into a shot without hidden semantic conversion.
- Entry point: shot detail/reference/start-frame/B-roll controls.
- Success outcome: the editor can see whether a source is an anchor, reference, still B-roll, or footage B-roll and can preview exact timing before assembly.

#### Existing Pattern Reference

- Reuse `VerticalDramaStoryboardPanel` reference picker, `VerticalDramaEpisodeWorkspace` scene-continuity controls, existing media upload/history cards, and current assembly readiness/error presentation.
- Decision: reuse the picker/card visual language but diverge in the footage editor by adding scrubber/in-out/audio controls; the existing image reference picker cannot represent a timeline safely.

#### Surface inventory

| Surface | Change |
|---|---|
| shot media picker | group source candidates by role and modality |
| footage editor | poster/video, metadata, scrubber, in/out, audio policy |
| B-roll timeline | order, duration, overflow and disclosure labels |
| assembly readiness | exact stale/storage/rights findings |

#### Component map

| Component | File | Owns | Consumes |
|---|---|---|---|
| `VerticalDramaShotVisualSourcePicker` | `client/src/components/verticalDramaSeries/` | role-grouped source selection | source candidate query |
| `VerticalDramaFootageSegmentEditor` | same | metadata/player, in/out, audio policy | source media metadata/segments |
| `VerticalDramaShotBrollTimeline` | same | order, duration, overflow, disclosure | B-roll binding projection |
| episode integration | `VerticalDramaEpisodePage.tsx`/workspace | selected shot and mutations | picker/editor/timeline callbacks |

#### State matrix

| State | Expected UI |
|---|---|
| loading metadata | player skeleton; segment controls disabled |
| empty source pool | explanation and upload/import action |
| unsupported/corrupt media | explicit error and retry/remove action |
| ready/selected | preview, role badge, editable timing/policy |
| invalid segment | inline bound errors; bind disabled |
| stale/rights blocked | blocking banner and reselect/reconcile action |
| audio conflict/overflow | exact finding and correction controls |
| upload retry/success | recoverable progress and ready source card |

#### Responsive matrix

Required mobile 390x844, tablet 768x1024, desktop 1440x900; extended small-mobile/laptop/wide-desktop. Mobile stacks player and fields with horizontal timeline scrolling; desktop uses player/details/timeline columns; no essential button is hidden behind overflow.

#### Accessibility acceptance

Keyboard controls for role selection, numeric in/out fields, scrubber alternatives, reorder buttons, and remove actions; labelled media player; visible focus; text equivalents for status labels; no color-only semantics; reduced motion.

#### Copy Contract

Use clear Thai/English labels: “ฉาก/บรรยากาศ”, “ภาพอ้างอิง”, “ภาพ B-roll”, “วิดีโอ B-roll”, “จุดเริ่ม”, “จุดจบ”, “เสียงต้นฉบับ”, “ปิดเสียง”, “สื่อไม่พร้อม”, “ช่วงเวลาไม่ถูกต้อง”, “แหล่งข้อมูลล้าสมัย”.

#### Browser evidence required

Upload/choose real photo as still B-roll, choose real video and bind exact segment, attempt image-as-scene conflict, stale segment, overflow, audio conflict, and successful assembly readiness at required viewports.

## 7. Flags, operational gates, security, and rollout

### Goal

Connect feature flags, bounded analysis/cost behavior, observability, security, recovery, and rollout gates so the feature can be enabled safely.

### Files

- Extend the existing feature-flag registry/config and server/client flag helpers with `verticalDramaSourceVideoFootage`, `verticalDramaNewsReportProfile`, and `verticalDramaVisualCanonPropagation`.
- Extend `verticalDramaStoryGenerationTelemetry.ts`, quality criteria/QC services, and run validation reports with the eight feature gates described in the spec.
- Extend audit/observability serializers with redacted structured events; do not log raw URLs, private transcripts, signed URLs, EXIF, or claim page bodies.
- Add focused flag parity, authorization, quality-gate, and recovery tests.
- Add implementation/browser evidence under `specs/.../implementation/`.

### Security and operational rules

Fail closed on missing tenant/user identity; verify series/episode/pack/asset/segment ownership in one scoped query. Validate upload MIME/size/path and derive metadata from managed storage or bounded analysis. Limit frames/transcript length/source count/research depth and media-generation batch size. Never charge for preview, upload registration, binding, or assembly; charge only existing generation tasks with idempotent ledger entries.

Use recoverable statuses for upload/metadata/analysis/snapshot/generation/assembly. Retry only safe/idempotent stages. A provider failure must not create a false verified state. A correction or rights change invalidates dependent outputs deterministically. Provide machine-readable gate findings and user-actionable messages.

### Rollout

1. Contract/pure validators and schema migration behind flags.
2. Prompt preview/apply and source slots with flag-off parity.
3. Source media metadata/segments and visual snapshots.
4. Story propagation and start-frame/reference boundary.
5. B-roll timeline/assembly and browser proof.
6. News profile/evidence/correction and publish readiness.

Rollback disables new writes and keeps legacy reads; do not delete new records. Re-enable after stale/recovery reconciliation.

## 8. Final integration and proof

### Goal

Prove all sections integrate and that no spec requirement is left unimplemented or untested.

### Required checks

- `uv run .../check-sections.py --planning-dir ...` reports complete before deep-implement.
- Typecheck, focused server/client Vitest, migration/schema tests, and relevant Playwright suites pass; baseline-wide failures are listed separately.
- Cross-section interface review checks shared names, schema fields, router procedures, feature flags, snapshot fingerprints, and assembly projections.
- Browser evidence file follows the canonical viewport matrix and records skipped checks honestly.
- A final traceability matrix maps every numbered requirement/acceptance item in `spec.md` to implementation file(s), test(s), and evidence. Any item without all three is a blocking gap.
- Run at least five final gap-review passes: contract/data, API/flow propagation, media semantics/assembly, news/evidence/security, and UX/tests/rollout. Fix all high-confidence gaps before completion.

## Suggested file ownership summary

| Area | Primary files |
|---|---|
| shared contracts | `apps/web/shared/verticalDramaSeries/visualSource.ts`, `newsReport.ts` |
| pure core | `apps/web/server/services/verticalDramaVisualSourceCore.ts` |
| database | `apps/web/drizzle/schema.ts`, new feature160 migration |
| prompt expansion | `verticalDramaPromptExpansionService.ts`, `promptEnhancementService.ts`, `verticalDramaSeries.ts` |
| snapshots/story | `verticalDramaVisualSourceSnapshotService.ts`, `verticalDramaStoryGenerationContracts.ts`, `verticalDramaStoryBible.ts` |
| news | `verticalDramaNewsReportService.ts`, news router/profile/client panel |
| B-roll | `verticalDramaBrollService.ts`, `verticalDramaAssembly.ts`, episode router/client |
| proof | focused `__tests__`, Playwright suite, `implementation/ui-browser-evidence.md`, traceability matrix |

## Open implementation checks (must be resolved during coding, not deferred silently)

1. Confirm the exact existing feature-flag registry and profile registry extension points before editing.
2. Confirm the existing managed upload/import admission function and metadata ownership path before adding a second upload route.
3. Confirm the current assembly manifest shape and Remotion/ffmpeg boundary for adding B-roll projection.
4. Confirm the story-generation contract helpers used by standard/premium/resume paths and thread the snapshot through every call site.
5. Confirm migration numbering/journal constraints and use a hand-authored migration if drizzle-kit generation is unsafe.
6. Confirm current credit category/model policy for generated slot images and keep preview/upload/binding free.
7. Confirm existing i18n namespaces and add keys in both Thai and English.
8. Confirm browser test seed/auth fixture and managed-media fixture strategy before writing E2E proof.

These are concrete codebase integration checks, not reasons to omit a section. Each must be resolved and recorded in the implementation traceability matrix.

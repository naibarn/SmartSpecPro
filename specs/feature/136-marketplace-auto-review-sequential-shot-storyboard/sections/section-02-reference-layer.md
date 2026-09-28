<!-- SECTION_META
id: section-02-reference-layer
source: claude-plan.md WS-2, claude-plan-tdd.md WS-2
spec: spec.md v1.3.0 §8 (all), §19.2 (referenceManifest), §23.1 items 1/2/10/12/13, §23.2 (trim warning)
depends_on: section-01-flags-and-schemas
blocks: section-04-skill-runner-loop, section-06-sequential-pipeline
also_feeds: section-05 (referenceCapacity), section-09 (video ref budget), section-11 (capacity meter UI)
runtime: typescript-npm
test_command: npm --prefix apps/web run test
END_SECTION_META -->

# Section 02 — Multi-Angle Reference Layer

Multi-view product references flow client → zod → resolver → provider manifest for the new `sequential_shot_storyboard` strategy, with capacity fail-closed and a fail-closed `@ImageN` index-mapping validator. This section is data-plumbing and pure logic only: no skill, no pipeline wiring, no UI chrome (those are sections 03/04/06/11).

## 1. Objective

Deliver four things:

1. **Client payload + router zod**: optional `productAngleImages[]` (max 8) inside `referenceAnchors`.
2. **Mode-scoped server resolver** `approvedSequentialProductReferenceUrls(metadata, plan, modelCap)` (plus the richer `resolveSequentialReferenceAttachmentPlan` it wraps): ordering, dedupe, slot reservation vs attachment order, trim-from-end, evidence-only exclusion, capacity fail-closed. The existing 3x3 single-anchor rule stays byte-identical.
3. **Per-shot reference manifest** (provider-facing + persisted shapes) extending the existing 3-slot manifest to a variable-length product block.
4. **Pure fail-closed validator module** `apps/web/shared/marketplaceCapture/referenceIndexMap.ts` + a reusable corrective-retry-then-throw enforcement helper that sections 04 (runner) and 06 (submit-time re-validation) wire in.

Everything here is dead code until a run with `frameStrategy === "sequential_shot_storyboard"` exists (section 01 gates that behind the `marketplaceSequentialStoryboard` tenant flag). The WS-1 byte-identical snapshot suite is the regression tripwire: nothing in this section may change 3x3 output.

## 2. Background (read once, self-contained)

- Engine: `apps/web/server/services/marketplaceAutoReviewService.ts` (~27k lines, "SVC"). Line anchors below verified 2026-07-21; treat as ±20 lines and re-locate by symbol name.
- **Today's single-anchor hard limit (mode-scoped — DO NOT relax for 3x3):** `approvedProductReferenceUrls` throws if supporting product refs exist (SVC:5185-5189) or if `providerReferenceUrls.length !== 1` (SVC:5193-5200). The grid path keeps calling it with max 1 (SVC:5310).
- Existing 3-slot manifest: `productReferenceStoryboardReferenceImageManifest` (SVC:5357-5387) emits `{placeholder: "@ImageN", role: "product"|"character"|"environment", url, instruction}`. URL normalization: `resolveProductReferenceStoryboardReferenceImageUrl(url, publicUrl)` (SVC:5389) — returns `""` for non-resolvable URLs (requires `publicUrl` for relative paths).
- Anchors ingestion: router `startAutoReview.referenceAnchors` zod (`apps/web/server/routers/marketplaceCapture.ts:707-817`, `.passthrough()`), resolved server-side by `resolveMarketplaceAutoReviewReferenceAnchors` (SVC:4949), invoked inside `startMarketplaceAutoReviewRun` (~SVC:17673-17681). Client builder: `buildAutoReviewReferenceAnchors` (`apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx:4312-4520`, "MPCPD"); upload path `uploadAnchorFile` (MPCPD:4135).
- Run metadata is schemaless JSONB: `type RunMetadata = Record<string, any> & {...}` (SVC:817). Existing asset packs: `productReferenceAssetPack`, `characterIdentityAssetPack`, `environmentReferenceAssetPack` (gates `characterIdentityAllowsVisualGeneration` / `environmentReferenceAllowsVisualGeneration`, used at SVC:5311-5318).
- Provider submission passes `referenceImageUrls` plus `extraParams.referenceImageManifest`, `referenceImageRoleOrder`, `referenceImageRoleCounts` (SVC:18584-18626). `mediaGenerationService` slices `referenceImageUrls` to the model cap at submit (`resolveReferenceImageUrlsForModel`, `mediaGenerationService.ts:1407-1420`).
- **Model cap discovery (verified):** `getReferenceImageLimitForModel` (`mediaGenerationService.ts:1401-1404`) is **module-private, NOT exported**. The exported primitive is `getReferenceImageLimitFromConfig(configJson)` (`server/services/mediaProviderUtils.ts:1483`), used with `getModelById` (`server/services/modelRegistry.ts:1654`); `routers/media.ts:1565` shows the local-helper pattern. Default cap 5; `google-banana-2-lite` = 10 via `configJson.maxReferenceImages`.
- VD prior art to clone:
  - Fail-closed capacity: `assertRequiredCharacterReferenceCapacity` (`server/routers/verticalDramaEpisodes.ts:1788-1798`) — `PRECONDITION_FAILED` with Thai copy when required refs exceed the model cap, thrown BEFORE credits.
  - Trim-from-end ordering guarantee: `resolveShotCharacterReferenceEntries` portraits-before-sheets (`verticalDramaEpisodes.ts:1859-1876`), `mergeAndTrimReferenceImageUrls` (`verticalDramaProductTieIn.ts:922-937`).
  - Mapping validator to clone: `findCharacterImageIndexMappingMismatches` (`apps/web/shared/verticalDramaSeries/characterIdentityMap.ts:317`; claims extractor `extractExplicitMappingClaims` :239 documents the exact lenient patterns). Enforcement precedent: `VdReferenceMappingError` + one corrective retry then throw (`verticalDramaStartFrameGeneration.ts:111-120, 1462-1536`), router → PRECONDITION_FAILED (`verticalDramaEpisodes.ts:12670-12674`), submit-time re-validation before credits (`verticalDramaEpisodes.ts:9813-9825` pattern).
- Directory note: `apps/web/shared/marketplaceCapture/` does **not exist yet** — this section creates it.

## 3. Exported interface contract (what other sections import)

Keep these names/shapes exactly — sections 04, 05, 06, 09, 11 are written against them.

```ts
// apps/web/shared/marketplaceCapture/referenceIndexMap.ts  (NEW, pure, client-importable)
export type ReferenceIndexEntry = {
  index: number;              // 1-based attachment position
  role: string;               // "primary_product" | "product_angle" | "character" | "environment"
  angleLabel?: string;        // for product_angle entries
};
export type ReferenceIndexMappingMismatch = {
  imageIndex: number;
  claimedRole: string;        // what the prompt explicitly claimed @ImageN is
  expectedRole: string;
  expectedAngleLabel?: string;
};
export function findReferenceIndexMappingMismatches(
  prompt: string, manifest: readonly ReferenceIndexEntry[]
): ReferenceIndexMappingMismatch[];
export function buildReferenceIndexMappingCorrectionDirective(
  mismatches: readonly ReferenceIndexMappingMismatch[],
  manifest: readonly ReferenceIndexEntry[]
): string;                    // deterministic corrective instruction for the retry round
```

```ts
// marketplaceAutoReviewService.ts (SVC) — sequential fork only
type SequentialAngleAnchorEntry = {
  url: string; ref: string; hash?: string | null; storageKey?: string | null;
  source: "marketplace_product_image" | "upload" | "library";
  angleLabel: "front"|"back"|"side"|"top"|"base"|"detail"|"package"|"parts_diagram"|"scale"|"other";
  evidenceOnly: boolean;      // derived: angleLabel is "package" | "parts_diagram"
};
type SequentialReferenceAttachmentPlan = {
  modelCap: number;
  providerReferenceUrls: string[];        // final attachment order (see §5.5)
  providerManifest: /* existing entry shape */ Array<{ placeholder: string; role: "product"|"character"|"environment"; url: string; instruction: string; angleLabel?: string }>;
  storedManifest: ReferenceIndexEntry[] & Array<{ url: string; evidenceOnly?: boolean }>; // spec §19.2 shape
  skillVisionUrls: string[];              // ALL resolvable product refs incl. evidence-only (section 04 input)
  trimmedAngles: Array<{ ref: string; angleLabel: string }>;   // for §23.2 warning + section 05/11
  attachedAngleCount: number;
};
function resolveSequentialReferenceAttachmentPlan(
  metadata: RunMetadata, plan: AutoReviewPlan, modelCap: number, publicUrl?: string | null
): SequentialReferenceAttachmentPlan;     // throws TRPCError PRECONDITION_FAILED on capacity failure
function approvedSequentialProductReferenceUrls(
  metadata: RunMetadata, plan: AutoReviewPlan, modelCap: number, publicUrl?: string | null
): string[];                              // thin accessor: .providerReferenceUrls
function getSequentialReferenceImageModelCap(modelId: string): number;  // registry lookup, default 5
async function enforceSequentialReferenceIndexMapping<T>(params: {
  initial: T;
  getPrompts: (pack: T) => Array<{ shotId: number; prompt: string }>;
  manifest: readonly ReferenceIndexEntry[];
  retry: (mismatches: ReferenceIndexMappingMismatch[], directive: string) => Promise<T>;
}): Promise<T>;                           // clean → return; else ONE retry; still bad → throw
// Export `...ForTest` aliases for all of the above (SVC convention).
```

Persisted locations (used by later sections, defined here): raw angle inputs at `RunMetadata.productAngleReferenceAssetPack = { entries: SequentialAngleAnchorEntry[] }`; resolved manifest persisted by section 06 at `metadataJson.sequentialStoryboard.referenceManifest` using `storedManifest`.

## 4. TDD — write these tests FIRST

Run from repo root: `npm --prefix apps/web run test -- <file>`. Implement until green; do not weaken assertions to pass.

### 4.1 `apps/web/shared/marketplaceCapture/__tests__/referenceIndexMap.test.ts` (new)

Pure module tests, no mocks:

- `detects an explicit contradictory @ImageN role claim` — manifest `[1=primary_product, 2=product_angle(back), 3=character]`; prompt contains "@Image3 is the product back view" → exactly one mismatch `{imageIndex: 3, expectedRole: "character"}`.
- `lenient on silence` — prompt that never makes an explicit index claim (product described without @ImageN bindings) → `[]`. This mirrors the VD guarantee: only provably self-contradictory prompts are blocked in front of paid spend.
- `consistent claims produce no mismatch` — "@Image1 = primary product…, @Image2 = back angle" matching the manifest → `[]`.
- `multiple mixed claims` — one consistent + one contradictory claim in the same prompt → only the contradiction reported; duplicates deduped.
- `1-based indexing` — claim about `@Image1` validated against manifest index 1 (not 0).
- `correction directive is deterministic` — `buildReferenceIndexMappingCorrectionDirective` output is stable for identical input and names every mismatched index with its TRUE role/angleLabel.

### 4.2 `apps/web/server/services/__tests__/marketplaceAutoReview.sequentialReferences.test.ts` (new)

Use `...ForTest` exports with hand-built `RunMetadata`/`AutoReviewPlan` fixtures (clone fixture style from `services/__tests__/marketplaceAutoReviewService.test.ts`). Cases:

- `ordering` — primary resolves first; angles follow in user order; dedupe by hash first, then by resolved URL (an angle whose hash equals the primary's is dropped; an angle repeating another angle's URL is dropped).
- `reservation vs attachment` — cap 5, fixture with primary + guardian-required character + environment + 4 angles: reserved slots = primary(1)+guardian(1)+env(1) → 2 angle slots; angles 3–4 trimmed FROM THE END (`trimmedAngles` lists them in order); final `providerReferenceUrls` order = `[primary, angle1, angle2, guardianUrl, environmentUrl]`; `storedManifest` indices 1..5 carry roles `primary_product, product_angle, product_angle, character, environment`.
- `capacity fail-closed` — cap 1 with guardian required (primary+guardian = 2 > 1) → throws `TRPCError` `PRECONDITION_FAILED` (Thai message) and no credit-path/scheduling function was reachable (pure resolver — assert throw only); cap 0 → throws (spec §23.1 item 13).
- `guardian optional does not throw` — cap 1, character present but childSubjectPolicy absent/not-required → primary only, no throw; character simply not attached.
- `evidence-only exclusion` — `package` and `parts_diagram` entries: absent from `providerReferenceUrls` and `providerManifest`; present in `skillVisionUrls`; present in `storedManifest` with `evidenceOnly: true`.
- `angles fail open on URL resolution` — an angle entry whose URL cannot resolve (relative path, no publicUrl) is dropped, run continues; primary failing = existing throw behavior preserved.
- `3x3 path untouched` — re-assert `approvedProductReferenceUrls` still throws when `productReferenceAssetPack.supportingRefs` is non-empty and when `providerReferenceUrls.length !== 1` (guards SVC:5185-5200 against accidental relaxation).
- `enforcement: clean pack skips retry` — `enforceSequentialReferenceIndexMapping` with consistent prompts → returns initial, `retry` never called.
- `enforcement: one corrective retry then throw` — initial pack has a mismatch; stubbed `retry` returns a still-mismatched pack → throws (assert error carries mismatch details); stubbed `retry` returns a corrected pack → returns it, `retry` called exactly once with the mismatches + directive.
- `submit-time re-validation catches manifest drift` — prompt authored against manifest A (guardian at index 4) re-validated against live manifest B (environment dropped → guardian now index 3): explicit "@Image4 = guardian" claim now mismatches → non-empty result. (Full pipeline wiring is section 06; this pins the contract.)

### 4.3 `apps/web/server/routers/__tests__/marketplaceCapture.productAngleImages.test.ts` (new)

Router-level zod tests; stub `JWT_SECRET` via `vi.hoisted` (repo convention, memory `project_marketplace_motion_direction`). Exercise the `startAutoReview` input schema (schema-parse or caller with downstream service mocked):

- accepts `referenceAnchors.productAngleImages` with ≤8 valid entries (all `angleLabel` enum values incl. `package`/`parts_diagram`).
- rejects: 9 entries; an entry with invalid `angleLabel`; an entry missing `url`.
- omitting the field entirely still parses (back-compat; anchors object remains `.passthrough()`).

### 4.4 Regression tripwire

The WS-1 snapshot suite (`marketplaceAutoReview.snapshots.test.ts`) must stay byte-identical after all edits in this section. Run it explicitly before closing the section.

## 5. Implementation guidance

### 5.1 Client payload (data plumbing only — UI chips/meter are section 11)

`apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`:

- Add state for selected angle images (default `[]`) and extend `buildAutoReviewReferenceAnchors` (:4312-4520) to emit `productAngleImages` only when non-empty. Entry shape per spec §8.2: `{url, ref, hash, storageKey, source, angleLabel}`.
- Eligible sources (wire the data paths; selection UI lands in section 11): captured `marketplaceProductImages` (up to 8 URLs already on `ProductTruth`), Media Panel picks, and `uploadAnchorFile` (:4135) uploads.
- Do not reorder or rename any existing top-level anchor keys (see research §8.7 for the exact current key order — `reviewTone`, `storytellingStructure`, `creativePresets` already exist; add nothing parallel to them).
- MPCPD is 8.5k lines and not jsdom-mountable; no component test required here — the router zod test is the shape contract.

### 5.2 Router zod

`apps/web/server/routers/marketplaceCapture.ts` — inside the `referenceAnchors` object (:707-817), add:

```ts
productAngleImages: z.array(z.object({
  url: z.string().min(1).max(4096),
  ref: z.string().max(512),
  hash: z.string().max(256).optional().nullable(),
  storageKey: z.string().max(1024).optional().nullable(),
  source: z.enum(["marketplace_product_image", "upload", "library"]),
  angleLabel: z.enum(["front","back","side","top","base","detail","package","parts_diagram","scale","other"]),
})).max(8).optional(),
```

Field bounds mirror the existing anchor fields (:763-810). Additive only; `.passthrough()` stays.

### 5.3 Anchor ingestion + metadata persistence (SVC)

- Extend `resolveMarketplaceAutoReviewReferenceAnchors` (SVC:4949) — or a small helper called beside it in `startMarketplaceAutoReviewRun` (~:17673-17681) — to normalize `productAngleImages`: `cleanText` every string, drop entries without url/ref, cap at 8, derive `evidenceOnly = angleLabel === "package" || angleLabel === "parts_diagram"`.
- Persist as `metadata.productAngleReferenceAssetPack = { entries: SequentialAngleAnchorEntry[] }` — a **separate** pack. CRITICAL: never write angles into `productReferenceAssetPack.supportingRefs`; that field triggers the deliberate single-anchor throw at SVC:5185-5189 and must remain empty for both modes.
- Persist for ALL strategies (harmless inert data for 3x3) or gate on sequential — either is acceptable, but the snapshot suite only covers outputs, so prefer gating on `frameStrategy === "sequential_shot_storyboard"` to keep 3x3 metadata shape unchanged.

### 5.4 Model-cap helper

Because `mediaGenerationService.getReferenceImageLimitForModel` is not exported (verified — see §2), add a local SVC helper:

```ts
function getSequentialReferenceImageModelCap(modelId: string): number {
  // getModelById (modelRegistry.ts:1654) → getReferenceImageLimitFromConfig
  // (mediaProviderUtils.ts:1483) ?? 5 — same math the submit path applies,
  // so the resolver's count matches what the provider layer will keep
  // (the VD "-1 budget" lesson, verticalDramaEpisodes.ts:11600-11626).
}
```

Do NOT export the private helper from `mediaGenerationService.ts` (avoids touching a hot shared file); the local composition is the established pattern (`routers/media.ts:1565`).

### 5.5 Sequential resolver (SVC, sequential fork only)

`resolveSequentialReferenceAttachmentPlan(metadata, plan, modelCap, publicUrl?)`:

1. **Primary**: reuse the existing `approvedProductReferenceUrls(metadata, plan, 1)` — ALL of its integrity checks (provider-readiness, truth-attachment, primary-ref match) apply unchanged. Primary failure keeps failing closed exactly as today.
2. **Angles**: read `productAngleReferenceAssetPack.entries` in user order; resolve each URL via `resolveProductReferenceStoryboardReferenceImageUrl(url, publicUrl)` (:5389); drop non-resolvable entries (fail-open, record for warning); dedupe by `hash` first, then by resolved URL, against everything already accepted (primary included). Reuse `uniqRefs`/`cleanText` idioms.
3. **Character/environment**: reuse `approvedPackReferenceUrls(characterPack, 1)` / `(environmentPack, 1)` guarded by `characterIdentityAllowsVisualGeneration` / `environmentReferenceAllowsVisualGeneration` (SVC:5311-5318 pattern).
4. **Guardian requirement**: `guardianRequired = metadata.sequentialStoryboard?.childSubjectPolicy` present AND `productChildRelated && childDepictionPlanned` (spec §19.2/§17 — the policy object is written by sections 05/07; absent ⇒ not required). A present-but-not-required character ref still participates in reservation, it just cannot cause a capacity throw.
5. **Slot RESERVATION (who survives a tight cap)**: primary(1) → guardian character(1 when required, else when present) → environment(1 when present) → remaining slots filled with non-evidence-only angles; surplus angles trimmed **from the END** into `trimmedAngles`.
6. **Attachment ORDER (final array + numbering)** — spec §8.3 note: reservation and attachment are DIFFERENT rules; do not conflate. Order: primary, surviving angles (user order), guardian, environment → `@Image1` primary, `@Image2..K` angles, `@Image(K+1)` guardian, `@Image(K+2)` environment (spec §8.4). Environment is reserved before angles but attached after them.
7. **Capacity fail-closed** (before ANY credit reservation — the resolver must be called pre-spend by sections 06/09): if `1 + (guardianRequired ? 1 : 0) > modelCap`, or `modelCap === 0`, throw `TRPCError` `PRECONDITION_FAILED` following the `assertRequiredCharacterReferenceCapacity` contract (`verticalDramaEpisodes.ts:1788-1798`). Suggested Thai copy: `"โมเดลภาพนี้รองรับภาพอ้างอิงสูงสุด {cap} ภาพ แต่โหมด 9 ภาพต่อเนื่องต้องแนบภาพบังคับ {required} ภาพ กรุณาเลือกโมเดลที่รองรับภาพอ้างอิงมากกว่านี้"`; cap-0 variant: `"โมเดลภาพนี้ไม่รองรับภาพอ้างอิง จึงล็อกรูปสินค้าไม่ได้ กรุณาเลือกโมเดลอื่น"`.
8. **Evidence-only entries** (`package`/`parts_diagram`, spec §8.1): never enter `providerReferenceUrls`/`providerManifest` (attaching disassembled parts corrupts the assembled-product identity lock); DO include their resolved URLs in `skillVisionUrls` (section 04 passes them to the skill's Phase A as vision inputs — the only legitimate visual route to `assembly_documented: true`); include in `storedManifest` with `evidenceOnly: true` (no index collision with attached entries — give them `index` values continuing after the attached block, or `index: 0` — pick one and assert it in tests; recommended: continue numbering after attached entries so `storedManifest` order mirrors §19.2 examples).

`approvedSequentialProductReferenceUrls` = thin wrapper returning `providerReferenceUrls` (name is the cross-section contract). Neither function may be called from any 3x3 code path.

### 5.6 Manifest shapes

- **Provider-facing** (`providerManifest`): keep the existing entry shape `{placeholder, role, url, instruction}` (SVC:5357-5387) so `extraParams.referenceImageManifest` / `referenceImageRoleOrder` / `referenceImageRoleCounts` (SVC:18606-18615) work unchanged, with: role `"product"` for primary AND angles (add `angleLabel` field on angle entries; state the angle in the `instruction` text, e.g. "additional product angle (back); supplements @Image1, never overrides it"); `"character"` / `"environment"` as today.
- **Persisted** (`storedManifest`, → `metadataJson.sequentialStoryboard.referenceManifest` by section 06): spec §19.2 shape `[{index, role: "primary_product"|"product_angle"|"character"|"environment", angleLabel?, url, evidenceOnly?}]`. This is also the exact input for the `ReferenceIndexEntry[]` validator manifest and for the skill runner's `reference_manifest` input (section 04) — one source of truth.

### 5.7 Pure validator module (NEW directory + file)

`apps/web/shared/marketplaceCapture/referenceIndexMap.ts` — clone the structure of `findCharacterImageIndexMappingMismatches` (`shared/verticalDramaSeries/characterIdentityMap.ts:317`, extractor :239), substituting role/angle vocabulary for character names:

- Build a small keyword lexicon per manifest entry (machine-checkable facts only, no creative judgment): `primary_product` → "primary product", "product identity", "สินค้าหลัก"; `product_angle` → its `angleLabel` words ("back", "side", "top", "base", "detail", "scale", "มุมหลัง", …); `character` → "guardian", "presenter", "adult", "ผู้ปกครอง", "ผู้ใหญ่"; `environment` → "environment", "room", "scene", "ฉาก", "สถานที่".
- Extract only EXPLICIT claims, mirroring the VD patterns: `@ImageN = <role text>`, `<role text> (@Image N …)`, `(Image N, … <role text>)`. Silence is never a mismatch — the validator only blocks provably self-contradictory prompts in front of paid spend (see the VD doc comment rationale at :295-316).
- Dedupe mismatches by `(imageIndex, claimedRole)`.
- `buildReferenceIndexMappingCorrectionDirective` renders a short deterministic block listing each mismatched index with its TRUE role/angleLabel from the manifest ("@Image3 is the adult guardian reference, NOT a product angle — rewrite the binding lines to match"). Pure string builder; the SKILL rewrites the prompt (skill-first — the Image-N↔role mapping is skill-authored, never code-appended; memory `project_vd_start_frame_reference_mapping`).
- Module must be pure (no I/O, no server imports) — client (section 11) and server both import it.

### 5.8 Enforcement helper (SVC)

`enforceSequentialReferenceIndexMapping` (shape in §3): run the validator over every prompt in the pack; clean → return `initial`; otherwise call `retry(mismatches, directive)` exactly once (section 04 supplies a closure that re-invokes the skill with the corrective directive); re-validate; still mismatched → throw (`TRPCError` `PRECONDITION_FAILED`, message includes the mismatch list; VD error-mapping precedent `verticalDramaEpisodes.ts:12670-12674`). Never persist or submit a contradictory prompt. Submit-time re-validation (section 06, VD `:9813-9825` pattern) calls the plain validator against the LIVE manifest right before credits — this section only guarantees the primitives make that a 3-line call.

## 6. Invariants (assert in review before closing)

1. `approvedProductReferenceUrls` (SVC:5185-5200) unmodified; 3x3 call sites still pass max 1. WS-1 snapshots byte-identical.
2. Resolver throws BEFORE any credit/scheduling call path; it is pure over `(metadata, plan, modelCap, publicUrl)`.
3. Reservation priority ≠ attachment order — both tested independently.
4. Evidence-only images never reach a provider payload, ever.
5. Validator is lenient-on-silence; enforcement is one retry then throw; nothing mechanically rewrites a prompt (no `slice()`/string surgery on final prompts — repo rule, re-checked by section 04's grep-guard).
6. No DB migration; all state in existing JSONB metadata.
7. New SVC code is additive (new functions + one gated persistence hook) — minimize diff surface in the 27k-line file; concurrent sessions edit it (repo memory `project_worktree_concurrent_reverts`).
8. **Capacity arithmetic is single-sourced (cross-section decision, review round 1).** `computeSequentialReferenceCapacity` in `apps/web/shared/marketplaceCapture/sequentialEvidencePreview.ts` (section 05, pure, client-importable, never throws) is the ONE implementation of the reservation/trim math. `resolveSequentialReferenceAttachmentPlan` (§5.5 steps 5–7) MUST call it to decide which angles survive and which are trimmed, then layer on the server-only concerns it owns: URL resolution, dedupe, attachment ORDER (§8.4), evidence-only exclusion, and the fail-closed capacity throw. Do NOT re-derive trim rules here — section 11's capacity meter calls the same shared helper, and a second copy would drift the UI meter away from what the server actually attaches. If section 05 has not landed yet, implement the helper there first (it has no server dependencies).

## 7. Handoffs

| Section | Consumes from here |
|---|---|
| 04 skill-runner | `skillVisionUrls`, `storedManifest` (skill `reference_manifest` input), `enforceSequentialReferenceIndexMapping`, correction directive |
| 05 plan-surface | `trimmedAngles` / `attachedAngleCount` / `modelCap` shape for `referenceCapacity`; `storedManifest` persistence target `sequentialStoryboard.referenceManifest` |
| 06 pipeline | `approvedSequentialProductReferenceUrls`, `providerManifest` → `extraParams`, submit-time re-validation |
| 09 full-video | reuses angle entries + trim semantics with a DIFFERENT fill order (frame → guardian → primary → angles) — do not generalize this section's order for it |
| 11 UI | capacity meter ("ใช้ได้ {n}/{modelCap}"), trim warning chip, evidence-only labels |

## 8. Verification

```
npm --prefix apps/web run test -- shared/marketplaceCapture/__tests__/referenceIndexMap.test.ts
npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReview.sequentialReferences.test.ts
npm --prefix apps/web run test -- server/routers/__tests__/marketplaceCapture.productAngleImages.test.ts
npm --prefix apps/web run test -- server/services/__tests__/marketplaceAutoReview.snapshots.test.ts
NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check   # no NEW errors vs ~987 baseline
```

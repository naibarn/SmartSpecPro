# Plan: multi-view product reference images (1–5, model-capped, character included)

Date: 2026-07-22 · Status: **proposed, awaiting approval** · Origin: user suggestion after run
`mar_829542bbba1282b35fcda87d09d5db47`

## User's requirement

Attaching one product photo makes the model drift when it renders the product from another angle.
Allow 1–5 product images, bounded by what each image model actually accepts, and count the
character/person reference inside that same budget.

## What already exists (verified in code + live data)

Sequential mode (`frameStrategy = sequential_shot_storyboard`, Feature 136) already implements
exactly this:

- Multi-angle product chips on the Product Images surface —
  [MarketplaceCaptureProductDetail.tsx:8404](../../apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx:8404)
  rendering [SequentialProductAngleChips.tsx](../../apps/web/client/src/components/marketplaceCapture/SequentialProductAngleChips.tsx);
  labels: front/back/side/top/base/detail/package/parts_diagram/scale/other.
- Wire cap of 8 angles: [marketplaceCapture.ts:860](../../apps/web/server/routers/marketplaceCapture.ts:860).
- Model-capped capacity with the character slot subtracted from the SAME budget:
  [sequentialEvidencePreview.ts:97-136](../../apps/web/shared/marketplaceCapture/sequentialEvidencePreview.ts:97)
  (`remaining = modelCap - 1 primary`, then guardian, then environment, then angles).
- Stable `@ImageN` mapping + mismatch validation:
  [referenceIndexMap.ts:269](../../apps/web/shared/marketplaceCapture/referenceIndexMap.ts:269),
  re-validated at submit ([marketplaceAutoReviewService.ts:21636](../../apps/web/server/services/marketplaceAutoReviewService.ts:21636)).
- Fail-closed precondition when required slots exceed the cap:
  [marketplaceAutoReviewService.ts:31510](../../apps/web/server/services/marketplaceAutoReviewService.ts:31510).

**Live evidence:** the user's own run attached only 2 images (`primary_product` + `character`) out
of **28** captured product images, because `productAngleImages` was never set — the labels were
never assigned. Feature present, not used → discoverability problem, not a missing capability.

## Real defects found (worth fixing regardless)

1. **The cap is invented, not derived.**
   [`getSequentialReferenceImageModelCap`](../../apps/web/server/services/marketplaceAutoReviewService.ts:31425)
   reads `getStaticModelById`, and the default auto-review image model `google-banana-2` has NO
   `configJson` in the static registry ([modelRegistry.ts:461-478](../../apps/web/server/services/modelRegistry.ts:461)),
   so the cap silently falls back to the hardcoded `?? 5`.
2. **Two sources of truth can disagree.** The planner cap comes from the STATIC registry, while the
   dispatch-time trim
   ([mediaGenerationService.ts:1425-1443](../../apps/web/server/services/mediaGenerationService.ts:1425))
   reads the DB-merged registry. Admin edits to `media_models.configJson` change the trim but not
   the planner — the plan can promise N images and the dispatcher can silently drop some.
   Today both land on 5 by coincidence, so it is latent, not active.
3. **The DB row for `google-banana-2` has no `maxItems`** on its `image_input` field
   (`type: image_urls`), so `getReferenceImageLimitFromConfig` returns null everywhere.
4. **3x3 / start-stop path is hard-locked to one product image** — not a slice but throwing
   invariants: [marketplaceAutoReviewService.ts:6029-6044](../../apps/web/server/services/marketplaceAutoReviewService.ts:6029)
   and the pinned `approvedProductReferenceUrls(metadata, plan, 1)` at
   [:6154](../../apps/web/server/services/marketplaceAutoReviewService.ts:6154).

## Proposed work (three independent steps, smallest first)

### Step 1 — make the cap real (small, low risk)
- `getSequentialReferenceImageModelCap` reads the DB-merged registry (same source as the dispatch
  trim) so planner and dispatcher can never disagree.
- Set an explicit, verified `maxReferenceImages` in `media_models.configJson` for the image models
  auto review actually uses, starting with `google-banana-2`. **CONFIRMED provider limit: 14**
  (kie.ai nano-banana-2 `image_input` array, `<= 14 items`, https://kie.ai/nano-banana-2, user-
  supplied 2026-07-22). This is the total input-image budget INCLUDING primary + character +
  environment + angles.
- Add one labelled numeric input bound to `configJson.maxReferenceImages` on the Capabilities tab
  of [AdminMediaModels.tsx:3515](../../apps/web/client/src/pages/AdminMediaModels.tsx:3515)
  (today only the unlabelled per-field `maxItems` box at `:4596` can set it).
- Tests: cap resolution from DB config, planner/dispatcher agreement, admin round-trip.

### Step 2 — make the existing feature discoverable (small, UI only)
- When sequential mode is active, more than one product image is captured, and zero angle labels
  are assigned, show an inline hint + the capacity meter on the Product Images panel
  ("ใช้ภาพสินค้าได้อีก N ภาพ — ติดป้ายมุมภาพเพื่อเพิ่มความแม่นยำ").
- Optional: auto-suggest labels for the first N captured images, user confirms.
- Precedent for the failure mode: memory `project_shipped_but_undiscoverable`.

### Step 3 — bring multi-view to the 3x3 / start-stop path (LARGE, HIGH RISK — research done)

Research verdict (agent, feature 117 spec + code): relaxing to 1–N is SAFE **only if done the way
Feature 136 already did it** — do NOT loosen the anchor throw. The invariant guards product-truth
fidelity + evidence/rights safety, enforced in THREE layers that must move together:
- runtime throw `approvedProductReferenceUrls` (marketplaceAutoReviewService.ts:6029-6044)
- Zod `ProductReferenceAssetPackSchema.superRefine` (shared/marketplaceAutoReview/contracts.ts:802-820)
- governance blocker `collectMarketplaceAutoReviewGovernanceBlockers` (…:6697-6709)
- plus the pin `…(…, 1)` (:6154) and pack writer `buildFeature117ContractMetadata` (:16201-16213)

**⚠ HARD BLOCKER that makes a naïve relaxation UNSAFE — must be fixed FIRST:**
`@Image2` is hardcoded in prompt prose as the character/presenter slot (…:1689-1694, :2061,
:10494-10496), and **the minor-safety clothing lock rides on that same `@Image2`** (:10496 — the
Phase 1 lock we just shipped). Expanding product to N shifts character to `@Image(N+1)` while the
prose still says `@Image2` ⇒ the presenter + child-safety directive binds to a product angle.
Fix: make the presenter/minor-safety slot **manifest-derived**, and wire the reference-index
mapping validator (`shared/marketplaceCapture/referenceIndexMap.ts` +
`enforceSequentialReferenceIndexMapping`) into the 3x3 loop before any paid spend.

Safe change set (clone the sequential template, keep `approvedProductReferenceUrls(…,1)` intact):
1. Attach extra 3x3 angles via the SEPARATE `productAngleReferenceAssetPack` (never `supportingRefs`).
2. Build an explicit `@ImageN` manifest (primary=1, angles=2..K "supplements @Image1, never
   overrides", presenter/env numbered AFTER — no hardcoded slot).
3. Fail-closed capacity gate `min(userSelected, modelCap − reservedSlots)` before credits
   (clone :31510-31518).
4. Keep evidence-only (`package`/`parts_diagram`) + wrong-variant photos OUT of the provider
   payload (clone :31546-31548).
5. Fix `@Image2` presenter/minor-safety binding (⚠ above) + wire reference-index validator.
6. UI: single-select → anchor + multi-select same-variant angles, reuse the sequential meter.
7. Update the 3 contract-witness test suites + re-snapshot the byte-identical suite intentionally:
   `sequentialReferences.test.ts:365-392`, `marketplaceAutoReviewContracts.test.ts:856-888`,
   `marketplaceAutoReviewService.test.ts:1713-1766`, `marketplaceAutoReview.snapshots.test.ts`.

**UX consequence to surface to the user:** product-truth fidelity is a genuine constraint, so the
user must pick CONSISTENT angles of the same assembled product/variant; the system still rejects
packaging, parts diagrams, and off-variant photos from the provider payload.

## Recommendation (updated after research)

Step 1 + Step 2 are small, safe, and immediately raise fidelity for sequential runs (the mode the
user's run already used) by using images already captured — do them now. **Step 3 is large and
touches the minor-safety enforcement Phase 1 just fixed** — implement it as its own carefully-
reviewed change AFTER Step 1+2, and checkpoint the user on the UX constraint (consistent-variant
angles) before building the picker. User approved "รวม Step 3" (2026-07-23) as scope; the @Image2/
minor-safety hard-blocker is new information worth re-confirming before that step.

## Status
- [x] Research complete (feature-117 invariant agent + cap-flow agent + live run/DB evidence)
- [x] User approved scope: Step 1 + 2 + 3 (2026-07-23), commit Phase 1 (done: 6e05f438f)
- [x] DB backup taken (.db-backups/media_models_20260723_071657.sql, 236 rows baseline)
- [~] Step 1 — cap=14: service getModelById (DB-merged) ✓ · static registry configJson 14 ✓ ·
  DB google-banana-2 maxReferenceImages=14 (verified, 236 rows intact) ✓ · seed mirror ✓ ·
  test getSequentialReferenceImageModelCap===14, 49/49 suites ✓ · tsc confirming ·
  admin field → delegate ssp-frontend · restart pending
- [x] Step 2 — SELECTION UX REDESIGN — committed a9b15bb53 (12 files, +685/-314). checkbox-on-image
  selection (free, unordered) replaced "assign a label to enroll"; angleLabel now OPTIONAL end to end
  (router zod .optional() + service/shared types). Hero = locked @Image1 anchor; package/parts stay
  evidence-only; discoverability hint folded into a header-strip SequentialProductAngleChips.
  Also fixed a real bug: capacity meter phantom-counted up to 8 non-hero images as attached
  regardless of selection (the "8/14" the user saw) → now reflects real enrollment.
  Tests: frontend 131, backend 52 + 270 regression, integrated 59. 2 pre-existing 3x3
  prompt_too_long failures confirmed unrelated (fail-set identity). DEPLOYED.
  Follow-up UX fix b8bb79174 (user feedback): clicking the IMAGE now toggles reference (was
  changing the anchor — mismatched the hint); selected state made obvious (violet on-image badge
  "✓ เลือกใช้อ้างอิง" + enlarged corner control); anchor changes only via "Set as Hero". Deployed
  (asset index-grEHEFFl, web http 200). 17/17 tests, 0 new type errors.
- [—] Step 3 — 3x3 multi-view — DEFERRED (user chose 2026-07-23 to verify Step 1+2 first; the
  mode the user actually runs is sequential, which already does multi-view). Plan + risk fully
  documented above and in memory [[project_marketplace_multi_view_references]] for clean resumption:
  clone the sequential template (separate productAngleReferenceAssetPack, keep the anchor throw),
  fix the @Image2/minor-safety hardcode → manifest-derived FIRST, wire the reference-index validator,
  add the capacity gate, keep package/parts out of the payload, then the UI picker + tests.

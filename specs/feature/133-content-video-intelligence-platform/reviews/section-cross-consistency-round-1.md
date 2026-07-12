# Section Cross-Consistency Review — Round 1 (Phase C)

All 8 section files read as a whole. Dependency/interface map built; checked for
interface mismatches, coverage gaps, overlaps (duplicate file creation),
dependency-order violations, and self-containment.

## Scorecard

| Check | Verdict | Notes |
|---|---|---|
| Interface match (exported ↔ imported symbols) | PASS w/ 3 coordination notes | AssetResolver/TemplateBuildContext (01→02,07), AssetManifest (03→07), worker enums (03→04,07) all align. |
| Coverage (every plan component owned by a section) | PASS w/ 1 note | ResolvedCatalogFacts resolution at render-time needs an explicit home in §07. |
| Overlaps (duplicate create) | **FAIL → fixed** | `shared/videoIntelligence/cost.ts` was listed as **create** by BOTH section-01 and section-02. |
| Dependency order | **FAIL → fixed** | Feature flags F133A/F133B are consumed by batch-1 sections 04/07 but created by batch-2 section-08. |
| Self-containment | PASS | Each section restates the cross-section shapes it needs. |

## Findings & resolutions (applied to `sections/index.md` as authoritative resolutions)

1. **`cost.ts` double-create (overlap).** Section-01 and section-02 both list
   `shared/videoIntelligence/cost.ts` (`estimateRenderCost` + `RenderCostEstimate`)
   as a file to create. It depends only on the frozen `RemotionTemplateConfig`
   (no dependency on the compiler or the template registry), so there is no
   circular import either way.
   → **Resolution:** **section-01 creates `cost.ts`** (it is the foundation
   section and the compiler is the first consumer). **section-02 creates only
   `cost.test.ts`** and imports `estimateRenderCost` — it must NOT re-create the
   module. (This matches section-02's own flagged note.)

2. **Feature-flag creation ordering (dependency order).** F133A
   (`videoIntelligencePlatformEnabled`) gates the section-07 router and F133B
   (`remotionRenderVideoJobEnabled`) gates the section-04 queue — both batch-1 —
   yet section-08 (batch-2) owns the flag additions.
   → **Resolution:** the four F133 flags
   (`videoIntelligencePlatformEnabled`, `remotionRenderVideoJobEnabled`,
   `videoIntelligenceCatalogStudioEnabled`, `videoIntelligenceMotionStudioEnabled`)
   are added to `shared/featureFlags.ts` as the **first implementation step of
   section-04** (the earliest consumer), using the 3-edit pattern. Section-08's
   idempotency guard (grep-before-add) then completes/verifies all four. No flag
   is ever double-declared (duplicate object key = tsc error).

3. **`BrandKit` compiler-facing type location (coordination).** Section-01 needs
   a structural `BrandKit` type (`{ colors, fonts, captionPresetId, locks }`);
   section-05 persists the `brand_kits` row; section-02 imports the type.
   → **Resolution:** section-01 defines/export the resolved `BrandKit` type in
   `shared/videoIntelligence/` (client-safe, no DB import). Section-05's
   `BrandKitRow` is a structural superset (adds id/tenantId/userId/name/
   timestamps). Section-07 loads a `BrandKitRow` and passes the token subset as
   `ctx.brandKit`.

4. **`SegmentPlan` shape (coordination).** Section-01 owns the compiler
   `SegmentPlan` (`{ parts: { index, durationInFrames }[] }`); section-03's
   `remotionRenderVideoSegmentPlanSchema` uses `parts: {index, …}.passthrough()`.
   → **Resolution:** section-01 is the shape owner; section-03's permissive
   `.passthrough()` schema accepts it. If section-01 exports a
   `SegmentPlanSchema`, section-03 imports it instead of re-declaring. No change
   needed beyond this note.

5. **`ResolvedCatalogFacts` at render-time (coverage note).** Section-06's
   `validateProjectClaims(document, resolvedCatalog)` needs `ResolvedCatalogFacts`;
   section-07 calls it in `queueRender(final)` but only detailed catalog
   resolution at create-time.
   → **Resolution:** section-07's `queueRender` (final, catalog projects)
   resolves `ResolvedCatalogFacts` from `listMarketplaceInsightsByProduct` for
   the project's `sourceRefs.productIds` (`claimResolutionsJson`) + latest product
   price facts, then passes it to `validateProjectClaims`. Motion projects (no
   `productIds`) pass `null` and skip the claim gate.

All five recorded as authoritative resolutions in `sections/index.md`
(§"Cross-Section Consistency Resolutions"). No section file contradicts another
after these resolutions; interfaces, ownership, and ordering are now
unambiguous for /deep-implement.

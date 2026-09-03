# Gap Review v7 — Promotion Target / Missing Product / Place Review — 8 Rounds

Date: 2026-09-01

## Round 1 — Missing product image
Gap: workflow treated product context as primary even when product reference was absent.

Fix:
- `PromotionTargetResolver`;
- `missingTargetAssetPolicy`;
- explicit visual-identity status;
- generic-product continuation;
- exact branded identity blocking.

## Round 2 — Product visible inside another supplied image
Gap: Start Frame/environment could contain the product but the system had no formal path to treat it as target evidence.

Fix:
- `visible_in_scene` visual identity state;
- derive/crop target evidence;
- distinguish visible facts from unseen packaging/text.

## Round 3 — Environment image may actually be the promoted place
Gap: `environment_reference` was treated only as scenery.

Fix:
- semantic reclassification ledger;
- `place_venue` branch;
- environment image can become place source-of-truth without destroying original provenance.

## Round 4 — One-image venue hallucination risk
Gap: a place tour could invent unseen rooms, exterior or facilities.

Fix:
- `place-experience.schema.json`;
- visible/unseen feature split;
- `spatialTruthPolicy`;
- single-view camera-risk guidance;
- evidence requirement for facility claims.

## Round 5 — Product-centric ExpandedIntent / ShotPlan
Gap: even after target resolution, stage schemas still forced product-style demonstration concepts.

Fix:
- `targetKind` added to ExpandedIntent and ShotPlan;
- broader commercial arc;
- product `demonstrationPlan` becomes branch-specific;
- venue/service branches use `experiencePlan`;
- narrative-only branch is not forced through product proof.

## Round 6 — Dialogue truthfulness
Gap: LLM could turn a visual impression of a store into an unsupported factual business statement.

Fix:
- separate visible observation, subjective reaction and verified business fact;
- dialogue/claim planning binds material facts to evidence.

## Round 7 — Multi-shot from a single place reference
Gap: multi-shot support could imply multiple physically verified views.

Fix:
- safe derived-shot vocabulary;
- small camera moves/crops/detail inserts allowed;
- large reveals/orbits into unseen geometry require more evidence or clear stylization.

## Round 8 — Provider / H3 compatibility and backward compatibility
Gap:
- H3 reference semantics needed place/venue roles;
- previous product skill ID/packages should remain recognizable.

Fix:
- H3 semantic mapper recognizes place/storefront/interior/signage/menu/facility roles;
- exact signage may be post-composited;
- manifest uses new generic commercial identity with compatibility alias `generic-product-video-director`;
- existing product/H3 tests retained.

## Validation result

The package now supports:
1. physical product with reference;
2. physical product without reference;
3. product derived from scene;
4. named product with factual research but unverified visual identity;
5. exact branded product blocking when reference is missing;
6. shop/place/venue promotion from scene images;
7. service/digital/event/property branches;
8. narrative content with no commercial target.

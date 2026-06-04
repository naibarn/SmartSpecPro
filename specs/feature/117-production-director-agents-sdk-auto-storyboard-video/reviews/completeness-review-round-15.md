# Completeness Review Round 15

Date: 2026-05-31
Scope: codebase-aware review for product reference readiness before paid visual generation, thumbnail generation, and visual repair.

## Result

The plan was already strict about detecting product drift after generation, but it needed an earlier gate that prepares trustworthy product references before any provider spend. This matters because product mutation often starts from weak, wrong, low-resolution, unhosted, collage-like, or rights-blocked references.

## Findings Fixed

1. Product image fidelity QA needed a concrete upstream anchor.
   - Added `ProductReferenceAssetPack`.
   - The pack records primary/supporting/rejected product refs, crop/mask/fingerprint refs, selected variant binding, provider use policy, QA refs, and required user action.
   - Product-dependent image/video/thumbnail/repair payloads may use only pack-approved refs.

2. Better-image blockers needed to happen before credit reservation.
   - Low-resolution, wrong-variant, product-not-visible, remote-unhosted, rights-blocked, private/PII-risk, marketplace-UI-dominated, or misleading product images now block visual provider dispatch before provider credits are reserved.
   - The UI timeline must show a sanitized next action such as select or upload a better product reference.

3. Generated approximations must not become new product truth.
   - Failed generated media, quarantined media, creative memory examples, and prior generated approximations cannot become product reference anchors for new visual generation or repair unless a separate user-approved ingestion flow exists outside this feature.

## Remaining Risk

Implementation should choose the least complex reference-prep path first: deterministic image metadata and hosting checks, then gateway-routed vision QA only when product visibility, variant match, collage risk, or identity ambiguity requires model inspection.

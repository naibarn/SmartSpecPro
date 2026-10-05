# Public design decisions

| ID | Decision | Evidence / reason | Consequence |
|---|---|---|---|
| D-01 | Lead with the work outcome, then show Vertical Series before broader discovery. | Spec 263 §37 and the signed-out route inventory. | The first viewport communicates a general workspace and an immediate supported flagship entry. |
| D-02 | Replace unverified marketing WebP imagery with code-rendered explanatory panels. | Repository files had no generator, license, public-use or withdrawal owner; no product capture was approved. | Panels are labelled as concepts and never described as product/customer proof. |
| D-03 | Keep the existing `/drama-series` product destination behind the validated local login handoff. | Source route and auth-return allow-list; no public `/film` route exists. | No new public route, auth bypass, or unsupported product promise. |
| D-04 | Keep a shared centered 1320px frame on wide Home sections and let it fill narrow viewports. | Local Chromium measurements across 360–1920px. | Astryx Sections use the scoped `--public-layout-wide` token and `margin-inline: auto`. |
| D-05 | Omit social-preview imagery when no route/tenant-owned image is explicitly configured. | Default `dashboard-preview.jpg` has no provenance record. | SEO does not invent an image; tenant media remains tenant-owned, not platform marketing approval. |
| D-06 | Do not call an external design provider or add a new catalog/resolver. | Spec 270 G0 has no provider certification or catalog publication owner. | Public UI uses installed Astryx components; Spec 270 authoring/provider gates remain default-off. |
| D-07 | Do not include synthetic human/editorial imagery in this release candidate. | It is not needed to explain the flow and could be mistaken for endorsement without provenance. | Human imagery registry and placement map declare no active assets; art direction remains guidance, not approval. |

This log records implementation decisions, not external legal, content-owner, or Spec 270 artifact approval.

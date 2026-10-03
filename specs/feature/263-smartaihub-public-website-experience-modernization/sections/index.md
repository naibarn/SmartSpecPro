<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test -- --run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-public-inventory-and-truth
section-02-shell-content-and-retired-claims
section-03-homepage-experience
section-04-film-flagship-and-handoff
section-05-seo-accessibility-and-proof
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| 01 | - | 02, 03, 04, 05 | No |
| 02 | 01 | 03, 04, 05 | No |
| 03 | 01, 02, Spec 270 foundation | 05 | No |
| 04 | 01, 02, Spec 270 foundation, verified Spec 258 claims | 05 | No |
| 05 | 02, 03, 04 | - | No |

## Execution Order

1. Section 01 inventory and claims can begin alongside Spec 270 reconciliation.
2. Section 02 repairs shell/content truth and removes retired workflow advertising; no legacy route restoration.
3. Sections 03 and 04 require Spec 270's public-ready resolver/foundation and verified capabilities/assets. Homepage must precede or co-ship with film route.
4. Section 05 closes route, SEO, a11y and visual proof after public pages settle.

## Section Summaries

### section-01-public-inventory-and-truth
Map routes, public claims, capability and pricing sources, content ownership, assets and test proof.

### section-02-shell-content-and-retired-claims
Public shell/content corrections and removal of stale `/workflows` advertising from links, generated SEO and copy.

### section-03-homepage-experience
Implement outcome-led public homepage hierarchy using Spec 270 design artifacts and truthful proof.

### section-04-film-flagship-and-handoff
Create or revise the supported public film flagship and validated signed-out/signed-in product entry.

### section-05-seo-accessibility-and-proof
Align SEO, sitemap/prerender, privacy, responsive/accessibility and final browser evidence.

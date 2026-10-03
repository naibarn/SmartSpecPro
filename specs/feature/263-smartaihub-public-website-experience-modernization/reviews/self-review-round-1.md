# Spec 263 plan self-review — round 1

Reviewer stance: skeptical public-product architect. Compared `claude-plan.md`, `claude-plan-tdd.md`, `claude-spec.md`, interview/research notes, source discoveries and repository restrictions.

## Findings and repairs

1. **Spec dependency ordering.** Public content/route inventory can start alongside Spec 270, but high-fidelity design and UI acceptance depend on the resolver/foundation. The plan makes this distinction explicit.
2. **Retired route contradiction.** Spec taxonomy and stale public artifacts may mention workflows. The implementation will remove public marketing/SEO/link claims for `/workflows`, while never creating or restoring its route/engine.
3. **Capability truth risk.** Pricing, customer proof, assets and capability claims need source evidence; plan prohibits invented claims and makes source verification a gate.
4. **SEO/private-content risk.** Plan requires sitemap/prerender/canonical alignment and prevents indexing authenticated content.
5. **UI coverage.** Contract covers route inventory, component ownership, state and responsive matrices, localization, accessibility, design tokens and browser evidence.

## Scorecard

| Category | Result | Evidence |
|---|---|---|
| Structural integrity | PASS | Five phases and five matching TDD sections |
| Completeness vs spec | PASS WITH DEPENDENCY | Positioning, flagship, route discovery, truth, conversion, SEO, a11y, privacy and ops included; UI waits on 270 |
| Implementability | PASS | Exact likely code seams and verification boundaries; source paths revalidated per section |
| Internal consistency | PASS | Public experience consumes 270; no private design/provider stack or retired route |
| Edge cases | PASS | Signed-in/out, unavailable media, consent, unknown routes, responsive and prerender cases included |

## Decision

Proceed with low-risk inventory and public truth corrections first. Homepage and Film UI remain dependency-gated until Spec 270 foundations and verified capability/asset claims are available.

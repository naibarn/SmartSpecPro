# Section 03 — Public Marketplace and Gallery browsing

Dependencies: section 01

Read ../spec.md, ../route-matrix.md and ../tool-contracts.md.

## Ownership

pages/Marketplace.tsx, pages/Gallery.tsx and proposed public-webmcp marketplace/gallery adapter/tests; router changes only if public projection audit requires them. Proposed paths are implementation targets, not existing artifacts. Shared App.tsx/contracts edits belong to section 01 integrator.

## Work

Reuse list/getBySlug and gallery.list/get queries plus visible filter/detail controls. Return explicit anonymous public projections, including gallery tenant/global publication rules and safe media metadata. Preserve logged-in UI capabilities while keeping marketplace mutations and gallery view/like/download mutations outside tools.

## TDD

Filter/detail state parity, out-of-order response race, invalid category/slug, private fields excluded and zero mutations. See ../implementation-plan-tdd.md for commands and fixture boundaries.

## Acceptance

Public results match the visible catalog; no comment/like/install/purchase tool is registered.

## Risk

Draft browser API changes and accidental access widening are release blockers. Revalidate current sources before edits. Preserve unrelated work; no production mutation or paid call.

## UI/UX Contract

- Target user/job: public visitor working with a browser agent; visible UI remains the source of truth.
- Surface inventory/component map: existing pages in this section; page-owned adapter, current inputs/list/detail components, existing locale/focus conventions. No new layout framework or redesign.
- State matrix: loading returns unavailable/loading truthfully; empty is explicit; errors preserve fields/results; success reflects resolved UI data; cancellation/stale route does not alter a new page. Preserve disabled, focus and submitting states.
- Responsive matrix: desktop 1440x900, tablet 768x1024, mobile 390x844. No additional horizontal overflow or blocked controls.
- Accessibility: keyboard operation and labels remain; preparation focuses the existing form and outcomes use existing accessible feedback. No focus stealing during read-only tools.
- Tokens: reuse existing design tokens; inspect current component styling before any visual change. If new UI is necessary, follow repository Astryx discovery rules.
- Copy: Thai/English via existing namespaces, concise validation/empty/loading/error/success text, actual resolved locale reported; no technical WebMCP setup messages in ordinary visitor flows.
- Browser evidence: native invocation plus unsupported-browser manual parity, screenshots for affected visible states at required viewports; missing native support is pending.

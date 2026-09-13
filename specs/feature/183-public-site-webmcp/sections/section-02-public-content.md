# Section 02 — All public content and search

Dependencies: section 01

Read ../spec.md, ../route-matrix.md and ../tool-contracts.md.

## Ownership

Proposed public-webmcp content/search helpers; informational pages in route-matrix.md; existing tenant/blog/help/packages sources; bounded server public metadata search if required. Proposed paths are implementation targets, not existing artifacts. Shared App.tsx/contracts edits belong to section 01 integrator.

## Work

Expose page-owned public view models for every matrix row except catalog/Contact specialist actions. Implement metadata discovery/search and allowlisted navigation with locale and tenant scoping. Keep source caches bounded and avoid eager loading every page chunk.

## TDD

Tenant/published fixtures, all informational route coverage, locale fallback, metadata pagination, partial failure, package parity and static status truthfulness. See ../implementation-plan-tdd.md for commands and fixture boundaries.

## Acceptance

Every public informational route has read coverage; no full-site DOM scraping or unbounded index downloads.

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

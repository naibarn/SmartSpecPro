# Section 04 — Contact preparation

Dependencies: section 01

Read ../spec.md, ../route-matrix.md and ../tool-contracts.md.

## Ownership

pages/Contact.tsx, proposed public-webmcp contact adapter/tests and publicSite locale keys if needed. Proposed paths are implementation targets, not existing artifacts. Shared App.tsx/contracts edits belong to section 01 integrator.

## Work

Prepare supplied fields in existing React state, focus form and require human submission. Reject conflicting nonempty fields. Reuse server field constraints without importing server-only modules into the browser.

## TDD

Preparation, conflict, missing fields, invalid email/length, no token/PII serialization, manual submit and anti-abuse regression. See ../implementation-plan-tdd.md for commands and fixture boundaries.

## Acceptance

Tool execution never submits; existing manual submit still works with Turnstile and honeypot unchanged.

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

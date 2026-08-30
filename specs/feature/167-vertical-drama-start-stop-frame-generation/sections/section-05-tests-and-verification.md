# Section 05 — Tests and verification

## Goal

Turn the contracts into focused executable proof and record verification
boundaries without hiding noisy baseline failures.

## Owned files

- focused Vitest suites beside existing Vertical Drama service/router/component
  tests
- `specs/feature/167-vertical-drama-start-stop-frame-generation/implementation/ui-browser-evidence.md`
  (created only when browser evidence is attempted)

## Required coverage

## Implementation status

Complete for focused proof. Role, long-prompt, durable-job, canonical-motion,
and existing UI regression tests pass; full workspace typecheck remains noisy
from unrelated baseline errors recorded in the implementation gap review.

Retain all existing start suites. Add tests for Thanwa semantic splitting,
role/version/schema validation, long prompt preservation, hash/CAS/merge/stale
rules, durable job idempotency/ownership/retry, image admission/task resume/no
double charge, authorized media URLs, canonical motion mapping/provider
capability/formatter, and full UI role/state/accessibility/i18n behavior.

## Commands

```bash
npm --workspace apps/web test -- --environment jsdom <focused-files>
npm --workspace apps/web run check
git diff --check
```

Run from repository root. A typecheck timeout or unrelated pre-existing error is
not a pass; report it separately from focused proof. Browser/provider/live
credit evidence is only marked pass with actual authenticated execution.

## Dependencies and outputs

Consumes Sections 01–04. Exposes exact test commands/results and any blocked
browser/provider boundary to Section 06 and final handoff.

## UI/UX Contract

### Target User / JTBD

Verification protects the creator's start-only and optional start+stop flows.

### Surface Inventory

The storyboard shot card, picker, prompt editor, and review panel are tested;
Section 04 owns their implementation.

### Component Map

Use existing Vitest/jsdom component test harnesses and page mocks; do not create
a parallel UI test framework.

### State Matrix

Test every UI state in the Section 04 contract and assert role isolation.

### Responsive Matrix

Test or record evidence for 390, 360, 768, 1024, 1280, and 1440 widths.

### Accessibility Acceptance

Assert role+shot names, keyboard order, focus, disabled explanations, and
reduced-motion-safe rendering.

### Copy Contract

Assert required Thai keys and English fallback without hard-coding server errors
into components.

### Browser Evidence Required

Record actual authenticated browser evidence when available; otherwise document
the exact missing browser/auth capability.

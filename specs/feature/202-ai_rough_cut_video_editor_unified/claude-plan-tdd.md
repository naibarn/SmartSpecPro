# Spec 202 TDD plan

Testing uses Vitest/jsdom conventions already present in `apps/web`. Browser
evidence is a separate gate for visual and authenticated workflow claims.

## Section 01 — Project adapter

- Test current revision load, save/autosave CAS conflict, duplicate mutation,
  legacy conversion, unknown-field preservation, rollback route, and domain
  separation.

## Section 02 — Operation bridge

- Test envelope/snapshot/idempotency wiring, Full Scan Node routing, blocked vs
  waiting status, degraded evidence UI, cancellation race, and stale promotion.

## Section 03 — Timeline/change sets

- Test EDL mapping, apply/reject, protected ranges, undo/redo, linked A/V,
  canonical time, invalidated evidence, unsupported metadata preservation, and
  stale revision rejection.

## Section 04 — AI tools/transcript/suggestions

- Test Suggest/Draft/Apply state transitions, transcript anchors, capability
  messaging, suggestion accept/reject/defer, keyboard dialogs, and review gate.

## Section 05 — Preview/render/QC

- Test plan hash/source parity, progress/cancel, stale artifact fencing, QC
  warning/error states, final commit visibility, and restore/rollback UI.

## Section 06 — Acceptance

- Add browser-oriented component/integration fixtures for all state matrix
  entries, bilingual copy, keyboard/focus, responsive visibility, and reduced
  motion. Preserve evidence requirements for authenticated browser runs.

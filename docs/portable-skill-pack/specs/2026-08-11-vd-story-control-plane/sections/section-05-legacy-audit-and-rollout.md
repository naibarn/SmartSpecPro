# Section 05 — Legacy Audit and Safe Rollout

## Scope

ทำให้ข้อมูลเก่า รวม series 21 ที่เดินถึงตอน 25 ตรวจสอบได้โดยไม่ rewrite/auto-close และเปิดใช้ enforcement เฉพาะ future horizon ที่ผู้ใช้อนุมัติ

## Owned files/modules

- read-only audit service/script under existing Vertical Drama server/script conventions
- existing `verticalDramaArcReplan`/append-only breakdown version flow for approved future changes
- feature flag/config resolution and rollout tests
- legacy UI projection consumed by Section 06

## Audit output

Report `registered`, `matched`, `missing_opening`, `duplicate`, `legacy_unknown`, `overdue` and `unresolved` separately with source episode, source event/memory ID, candidate classification and reason. Episode-specific fallback IDs and descriptions without registered openings remain legacy observations. Similarity may help a human search but cannot auto-merge.

For series 21, determine the first unproduced/unlocked future episode from actual state; do not hard-code 26. Create a future-horizon proposal only. Episodes 1–25 and existing memory events stay unchanged. User dispositions are `carry`, `resolve_with_new_scene`, `parked`, `sequel_hook` or `legacy_unknown`, each with actor/reason/source ID. Approval uses append-only future breakdown/replan.

Duration audit follows the same safety boundary: use an existing assembly/profile record when evidence exists, label known 60-second records `legacy_compat`, and label missing duration evidence `legacy_duration_unknown`. Never infer a new 9-shot duration profile or rewrite old episode timing during audit.

## Rollout flags

- `storyControlPlan`: allow generation/storage of approved plans for new series
- `storyControlAudit`: show legacy findings without mutation
- `storyControlEnforced`: gate only approved new/future episodes

Defaults: legacy series audit-only; flag-off preserves prior payloads. A kill switch falls back to the old flow without deleting plan/evidence. No mandatory DB migration is part of this phase; optional JSONB/versioned data and existing memory events are used.

## TDD stubs

- audit is read-only and does not change series 21 snapshot
- matched/missing/duplicate/fallback classifications are distinct
- future horizon starts after actual locked/produced boundary
- disposition proposal needs actor/reason and is not resolution before approval
- flag matrix preserves old behavior with flags off
- kill switch does not delete stored data
- replan cannot rewrite produced episodes

## Acceptance

The system can report that an old clue is unknown or unproven without lying that it was resolved, and can continue series 21 from the future boundary without changing its existing story.

## UI/UX Contract

### Target User / JTBD
N/A — audit/rollout service boundary; the browser audit panel is specified in Section 06.

### Existing Pattern Reference
N/A — no UI is created or modified in this section.

### Surface Inventory
N/A — no route, dialog, card or form.

### Component Map
N/A — no browser component.

### State Matrix
N/A — audit/flag states are service outputs covered by Vitest.

### Responsive Matrix
N/A — no layout.

### Accessibility Acceptance
N/A — browser acceptance is owned by Section 06.

### Copy Contract
N/A — UI copy is owned by Section 06.

### Browser Evidence Required
N/A — browser evidence begins in Section 06.

# Section 02 — Skill-first controller and QC loop service

## Objective

Add a dedicated evaluate/revise skill and a server service that performs the
bounded best-candidate loop without changing existing synthesis billing.

## Files

- Add `apps/web/skills/vertical-drama-draft-quality-controller/` with paired
  skill copies, manifest, prompts/references, and JSON schemas.
- Add `apps/web/server/services/verticalDramaDraftQualityQc.ts`.
- Add focused skill-content and service tests under server/shared test folders.

## Skill contract

Evaluate mode is judge-only and returns all eight criterion results, evidence,
critical fails, strengths, weaknesses, and recommendations. Revise mode is
writer-only and returns a complete replacement draft plus changed fields. Both
schemas are strict and bounded. The prompt must distinguish UI narrative
locale/content language from spoken-language profile and preserve user premise,
market, setting, names, heritage, and story-control facts.

## Service contract

Expose a testable orchestration function that receives a draft, source context,
owner, and max-round budget plus injected LLM/credit dependencies. It must:

- evaluate baseline;
- run revise then evaluate for each allowed round;
- compute scores using section 01 helpers;
- retain the best candidate and append kept/discarded history;
- stop on pass, two consecutive non-improvements, or maximum;
- reserve/draw/refund credits without double-charging synthesis;
- return a sanitized terminal result or actionable failure.

The service must never let the model change immutable user constraints. Use the
existing JSON planning helper and model resolver, but load the new skill and
schemas. Keep provider response text out of logs and bound serialized payloads.

## TDD

Mock separate evaluator/reviser calls. Cover baseline-only, improvement,
discarded regression, pass stop, no-improvement stop, max-round stop, reservation
success/failure/cancel cleanup, schema failure, and preservation guard behavior.

## Completion evidence

Skill copies/schemas validate, focused service tests pass, and the existing
synthesis tests remain unchanged and green.

## UI/UX Contract

This section has no browser-visible change. UI fields are N/A; the service's
public sanitized result is consumed by section 04.

### Target User / JTBD
N/A — server/skill implementation only.

### Existing Pattern Reference
N/A — no UI is changed in this section.

### Surface Inventory
N/A — no UI surface.

### Component Map
N/A — no UI component.

### State Matrix
N/A — terminal and progress contracts are covered by section 03/04.

### Responsive Matrix
N/A — no layout.

### Accessibility Acceptance
N/A — no interactive surface.

### Copy Contract
N/A — localized copy is owned by section 04.

### Browser Evidence Required
N/A — service and skill tests are the evidence for this section.

# Section 01 — Advisory QC State and UI

## Requirement IDs

CPE-10, NB-03, NB-05

## Objective

Ensure QA verdicts/warnings and media-generation readiness are independent, and users retain direct access to completed media.

## Owned paths

`verticalDramaQc.ts`, `verticalDramaFrameContinuityQc.ts`, `verticalDramaClipIdentityQc.ts`, affected `verticalDramaEpisodes.ts` QC procedures, storyboard UI and focused API/component tests.

## Tasks

1. Reconcile every finding code/severity so subjective score, camera, lighting, continuity and identity drift are advisory.
2. Verify failure/report persistence errors do not mutate generation status or media pointers.
3. Keep warning badge/report available while retaining normal preview, image/video and download affordances.
4. Keep safety, ownership, rights, budget and technical corruption in their existing hard gate.

## Completion predicate

API and UI tests show success/warn/fail/unavailable advisory reports with the same current usable media accessible; hard controls are independently tested.

## Prerequisites and fallback

Requires P0 and P1. If current route already behaves correctly, add missing proof rather than refactoring.

## Focused tests and evidence

Exercise low score, identity/continuity/camera/lighting warning, no samples, unavailable vision, malformed response, timeout, persistence failure and stale report after clip replacement. Verify API status remains successful for usable media and authenticated preview/download stays available while the advisory report is visible.

## Unresolved assumptions

Confirm which QC finding codes are genuinely safety/technical hard failures from current policy. Do not reclassify content-safety, ownership or corrupt-artifact controls as advisory merely to satisfy warning tolerance.

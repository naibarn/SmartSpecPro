# Section 03 — Non-Blocking Regression Proof

## Requirement IDs

NB-01–NB-08, P0-STATE, P0-FAIL, P0-SAFE

## Objective

Prove the production invariant with deterministic regression tests and a concise evidence report.

## Owned scope

Focused pipeline, QC, provider, router and UI tests for the affected Vertical Drama paths. Do not modify unrelated dirty files.

## Prerequisites

Sections 01 and 02.

## Tasks

1. Add feature-off parity tests and a single shared fixture that varies CPE disabled/missing/timeout/invalid/stale/unavailable/warning states.
2. Assert generation requests, eligibility, current asset, user approval state and cancellation state remain unchanged by the optional result.
3. Add negative-control cases for tenant ownership, provider capability/allowlist, content safety, valid budget, required verified artifact and explicit cancellation.
4. Assert stable idempotency prevents duplicate paid task/credit effects and no advisory failure triggers automatic paid repair.
5. Produce a matrix report that distinguishes unit/API/browser/provider evidence and names pending evidence accurately.

## Completion predicate and evidence

All focused tests pass; each matrix row has a test or a source-backed not-applicable rationale; hard checks remain effective; report captures exact SHA and command.

## Fallback and blocker strategy

Repair task-caused test failures. Do not use a full local typecheck as prerequisite. If authenticated browser/provider proof requires an environment not available in the slice, keep that evidence pending without blocking safe development integration.

## Focused tests and evidence

Run the focused pipeline, scene-intent/continuity, QC, provider-gate, judged-prompt, router and component suites named in `claude-plan-tdd.md`. Record revision, exact command, test scope, time, resource evidence and result. Add direct authenticated UI/API proof that warning/error QC leaves successful media previewable and downloadable.

## Unresolved assumptions

Provider sandbox credentials and authenticated browser state may not be available in every development slice. Keep those rows explicitly pending until exercised; unit or mocked-provider evidence must not be presented as end-to-end proof.

# Section 04 — Verification, deployment and handoff

## Deliverable

Run migration regression/integration tests, Core and Shell focused tests, builds and scoped authorization/correlation checks; apply only the authorized dev migration; deploy through the registered `modular-debian-dev` controller; record release SHA, health and truthful vertical-slice/UAT status.

## Scope

Task-owned tests, R03.4 evidence, SPEC-294 canonical handoff, and compatible SPEC-277/310 crosswalk notes. Do not rewrite SPEC-310's gated plan or create a new SPEC-309 registry assignment.

## Prerequisites / checks

Verify hostname, target ID, runtime and release controller before deployment. Preserve current release/rollback. Confirm Chat, Core, Shell, Mission and Task routes. Separate local/API proof from real Harness identity discovery and authenticated owner UAT.

## Known gap

If no live authorized Harness execution is available, mark that one acceptance pending while retaining independently valid API/UI/deployment evidence.

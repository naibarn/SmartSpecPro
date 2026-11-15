# Section 06 — SPEC, DEV release and UAT handoff

- Requirement IDs: R1.19-8 and all implementation requirements.
- Objective: synchronize authoritative SPECs/traceability and existing canonical handoff, run focused checks, deploy exact integrated code to authorized DEV and record evidence.
- Owned scope: SPEC-312 R1.19, only affected authoritative contracts, existing audit/traceability/HANDOFF, existing `handoff` writer inputs; platform deployment receipt.
- Prerequisites: prior sections integrated and migrations applied to development DB.
- Tests: Chat/Core tests, package checks/builds, Worker dry-runs, handoff validation, exact SHA target/health/asset parity/API checks.
- Completion predicate: status/evidence and UAT blocker are exact; release is `modular-debian-dev`; rollback pointer retained; no production or legacy deployment.
- Fallback: if authenticated browser unavailable, deploy validated work but leave real UAT BLOCKED with repeatable steps.
- Blocker strategy: never edit generated STATUS or claim UAT from mocks; use canonical handoff writer and existing release controller.

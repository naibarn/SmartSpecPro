# Feature 191 implementation completeness audit — rounds 01–15

**Date:** 2026-09-14
**Scope:** Current local implementation versus
`specs/feature/191-smart-director-face-activity-auto-reframe/spec.md`
**Constraint:** No npm type check was run because the available RAM budget is
insufficient. Focused Vitest, Python unit tests, Rust tests, and static diff
checks were used instead.

This is a new audit record. The earlier ten-round review remains preserved in
`implementation-review-rounds-1-10.md`; this pass rechecked the changed
implementation after that review and closed the additional gaps below.

| Round | Boundary checked | Gap found | Immediate correction | Result |
|---:|---|---|---|---|
| 1 | Camera-plan versioning | New evidence-bearing plans were still emitted as `camera.motion.v1`. | Emit `camera.motion.v2`, retain a v1/v2 compatibility reader, and accept both versions in Rust validation. | Closed |
| 2 | Shared plan validation | Malformed keyframe entries could make the validator throw instead of returning a render-blocking validation error. | Guard non-object/array keyframes before reading fields. | Closed |
| 3 | Full-scan idempotency tuple | The scan envelope and enqueue hash omitted trim range and destination aspect profile. | Carry both fields and include them in the deterministic Feature 186 idempotency tuple. | Closed |
| 4 | Promotion fencing | Checkpoint promotion compared source/Mark/policy/capability but not trim range, aspect profile, or analysis mode. | Persist and compare all three fields before promotion. | Closed |
| 5 | Python evidence parity | Python checkpoint keys/evidence did not include the complete source-bound tuple. | Add trim range, aspect profile, and analysis mode to evidence and checkpoint identity. | Closed |
| 6 | Capability truthfulness | Python evidence could report `approved` from face/motion samples without an interaction detector. | Require explicit `interaction_capability_available` for approval; otherwise report `degraded`. | Closed |
| 7 | Mark revision lifecycle | Player used `productPins.length`, so move/edit/reorder operations did not invalidate a scan. | Fingerprint Mark identity/time/geometry/scale, increment revision on change, and persist the revision per source. | Closed locally |
| 8 | Local Full Scan truth | Browser Full Scan used a face-only detector but marked non-empty output approved. | Always report degraded until a hand/object capability supplies accepted evidence. | Closed locally; capability gate remains |
| 9 | Feature 186 executor boundary | Optional evidence references were rejected and output status `validated` overstated detector readiness. | Derive a deterministic evidence reference when absent and return bounded degraded output with an explicit warning. | Closed |
| 10 | Native render parity | Rust validator needed to retain legacy plans while allowing v2. | Accept both versions, preserve bounded evidence/provenance checks, and keep the existing crop/render path. | Closed |
| 11 | Rollout governance | Rollout manifest named waves but did not record numeric enablement budgets required by the spec. | Add initial ceilings, owners/evidence requirements, and explicit `TBD-blocked` CPU/memory/parity fields. | Closed as a rollout-document gap |
| 12 | Regression verification | Focused tests had to cover the new version, tuple fencing, capability truthfulness, and native compatibility. | Added/updated regression tests and ran focused Vitest, Python, and full native Rust suites. | Passed |
| 13 | Plan provenance validation | Shared validation checked numeric bounds but accepted forged keyframe source/easing/Mark metadata. | Added allow-list and length validation in TypeScript and matching Rust rejection before encode. | Closed |
| 14 | Canonical idempotency isolation | The enqueue digest did not include the canonical job binding, so two distinct jobs with the same scan tuple could collide. | Include `jobId` in the server-derived idempotency digest and assert distinct jobs receive distinct keys. | Closed |
| 15 | End-to-end Full Scan wiring | The server Feature 186 enqueue/executor boundary exists, but the Worker App button still runs only the local face/motion fallback and has no canonical-job producer/consumer path. | Updated the spec/status and rollout evidence to make this an explicit blocked producer/consumer gate; retained the truthful degraded UI state instead of implying an approved scan. | Documented gate; production wiring remains open |

## Verification evidence

- Worker App Feature 191 Vitest: 4 tests passed.
- Web composition-scan Vitest: 2 tests passed.
- Python composition-scan unit tests: 2 tests passed with `PYTHONPATH` set to
  the runner directory.
- Rust native tests with `--no-default-features`: 254 library tests, 13
  runtime-manifest tests, and 21 worker-executor tests passed; no failures.
- Esbuild syntax transforms passed for the changed TS/TSX shared, web, and
  Worker files; this is a syntax check only and is not a type check.
- `git diff --check` passed for tracked changes. Untracked Feature 191 files
  were inspected directly and included in the focused test runs.

## Remaining explicit gates

The implementation is locally consistent with the current Feature 191
boundary, but it is not a production-quality completion claim. The following
remain intentionally blocked until external evidence exists:

- a real hand/object interaction detector and capability profile;
- representative Worker/device fixture measurements for CPU, memory,
  artifact size, clipping, fallback, and preview/render parity;
- deployed Feature 186 outbox/lease/recovery evidence for the composition scan
  job; and
- Worker App UI producer/consumer wiring for the canonical Full Scan job and
  durable evidence artifact; and
- staged canary, rollback, and source-revision race evidence.

No local mock, unit test, or health check is treated as proof for those gates.

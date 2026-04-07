# Self Review Round 2

## Scope

Reviewed:

- `claude-plan.md`
- `claude-plan-tdd.md`
- `implementation-plan.md`
- `sections/section-02-worker-rest-control-plane.md`
- `sections/section-05-scheduler-billing-and-artifact-publication.md`
- `sections/section-07-security-observability-and-fleet-operations.md`
- `sections/section-08-rollout-migration-and-regression-matrix.md`

## Additional gaps found and fixed

1. The plan did not yet lock a dedicated worker-auth model. It now requires worker-bound claims, bootstrap registration credentials, and rejection of generic bearer bypass behavior for worker mutations.
2. Replay protection and illegal state-transition handling were implied, but not explicit. The plan now requires idempotency or sequence controls plus optimistic state validation.
3. Rate limiting for worker endpoints was not explicit. The plan now requires route-specific throttles for registration, heartbeat, claim, event, and diagnostics traffic.
4. Diagnostics/log redaction was under-specified. The plan now requires payload caps plus server-side redaction for secrets, tokens, and signed URLs before persistence.
5. Artifact trust boundaries were too soft. The plan now requires checksum, size, content-type, storage-prefix validation, and safe-serving rules before publication.
6. Worker-provided dashboard/health URLs could have become an SSRF footgun if later auto-fetched. The plan now states opaque storage/display by default with explicit allowlisting for any future server-side fetch path.
7. Operational rollout lacked an emergency dispatch kill switch. The rollout section now requires one.

## Scorecard

| Category | Result | Notes |
|---|---|---|
| Completeness | Pass | missing operational and security controls are now represented in the main plan and section backlog |
| Security posture | Pass | auth, replay, rate-limit, redaction, artifact trust, and SSRF concerns are now explicit |
| Implementability | Pass | each addition is attached to a concrete section and test plan |
| Consistency | Pass | main plan, TDD plan, and section docs use the same boundary model |

## Residual non-blocking suggestions

- if implementation begins soon, create one shared worker-auth claim parser so route handlers do not drift
- if artifact types can include HTML or SVG, decide early whether to sanitize, proxy-render, or force download-only behavior

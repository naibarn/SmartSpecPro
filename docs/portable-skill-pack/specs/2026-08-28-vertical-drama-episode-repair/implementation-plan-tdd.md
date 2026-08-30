# TDD plan

1. Safety analyzer tests: benign child-care scene passes; concentrated minor distress/threat is flagged; sexual/nudity/gore/abuse markers fail closed; findings are bounded and deterministic.
2. Context builder tests: previous memory is included, next episode is bounded and labeled future-only, missing next episode is allowed, ownership filters apply.
3. Repair orchestration tests: script and storyboard skills receive repair/safety/future context; exactly nine shots are required; unsafe or malformed candidates never promote; stale source revisions fail closed.
4. Repository/router tests: idempotency, tenant isolation, status transitions, promotion clears downstream JSON but preserves media references, errors are redacted.
5. Story-job tests: new kind dispatches, progress is persisted, worker failure is terminal, active pointer is released.
6. Client tests: action visibility, polling, loading/success/needs-review/error states, and stale-data invalidation.

Run focused tests with `npm --workspace apps/web test -- <affected test files>`; report full workspace typecheck separately because the repository is currently dirty and baseline-noisy.

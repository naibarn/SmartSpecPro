# Ten-Round Review — Agent Quality Intelligence

Scope: `progressIntelligence.ts`, its 29 focused Vitest cases, and the additive optional field on `teamProjection.ts`. Each round used executable Node TypeScript-strip assertions against the pure implementation. These rounds are not a substitute for the unavailable Vitest runner or live runtime/UAT.

1. **Lifecycle precedence** — PASS. Cancellation, active recovery, failed/exhausted recovery, completed, and partial outcomes preserve the canonical execution status and do not invent a second lifecycle.
2. **Evidence vs activity volume** — PASS. Call/token volume cannot increase progress; only verified criterion references bound to the tenant count.
3. **Adaptive stall windows** — PASS. Each task profile uses its caller-provided threshold; no universal duration is embedded in the evaluator.
4. **External operation and dependency waits** — PASS. Valid active operations/waits suppress stall classification; malformed or blank dependency references do not.
5. **No-effect loops** — PASS. Repeated tool plus SHA-256 argument digests without verified effects can flag LOOPING; an effect resets that digest's consecutive count. Raw arguments are neither accepted nor returned.
6. **Regression evidence** — PASS. REGRESSING requires an explicitly invalidated ref intersecting prior verified evidence under the same tenant; falling progress alone is insufficient.
7. **Recovery and terminal results** — PASS. Recovery is advisory RECOVERING; failed execution is FAILED only after recovery exhaustion; completed execution without required evidence is PARTIAL.
8. **Tenant isolation and immutability** — PASS. Foreign-tenant evidence/trace calls are ignored and the evaluator does not mutate its input.
9. **Optional judge budget and failure behavior** — PASS. Empty budgets skip; timeout aborts; sync/async judge errors are contained; invalid or over-budget token reports are discarded; successful results remain advisory.
10. **Control-plane boundary** — PASS. No DB, queue, tool-dispatch, authorization, or lifecycle write was added. The team projector only exposes a nullable advisory assessment when a trusted caller explicitly supplies evidence context.

## Findings fixed during these rounds

- Use task-profile-specific stall windows rather than one implicit timeout.
- Reject incomplete dependency-wait metadata.
- Reset no-effect loop counts after a verified effect.
- Require the exact prior verified evidence reference before reporting regression.
- Contain synchronous as well as asynchronous judge failures.
- Let regression invalidation prevent a false completed assessment.
- Use set-based evidence matching for bounded linear lookup.

## Remaining evidence gaps

Vitest could not start because `vitest` is absent from the shared checkout dependencies. Node TS-strip behavioral smoke and syntax checks passed, but TypeScript typecheck, the actual Vitest suite, production event wiring, Task Control UI, persistent evaluation jobs, replay across process restart, and non-production UAT remain pending. This is not a production-readiness claim.

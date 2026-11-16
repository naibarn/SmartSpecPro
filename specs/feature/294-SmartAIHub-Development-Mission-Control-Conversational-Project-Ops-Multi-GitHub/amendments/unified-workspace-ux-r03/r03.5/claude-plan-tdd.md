# R03.5 Focused Verification Plan

- Runner contract: valid registration, duplicate idempotency, changed-payload replay, missing enrollment, revoked token, stale session and scope mismatch.
- Binding persistence: exact current attempt and fencing/session relation; reject mismatched Runner, attempt, tenant, workspace and stale acknowledgement; preserve null Mission for jobs without explicit mission context.
- SQL read surface: authorized workspace sees only its Harnesses/bindings; neighboring workspace/tenant sees no data; unbound legacy Jobs remain unbound.
- Core API: authenticated catalog, exact Mission/Job/Attempt lookup, missing/unauthorized denial, and response parser compatibility.
- LIVE UI: loading/error/empty states, concurrent Harness selection, exact Task Control link and return context; DEMO route remains synthetic and isolated.
- Run focused unit/integration suites and platform package build. Do not run repository-wide local TypeScript typecheck.

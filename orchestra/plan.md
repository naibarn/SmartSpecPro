# Orchestra Plan — Feature 186/192 Spec-to-Code Convergence Review

## Task analysis

- Intent: explicit multi-round implementation review with immediate repair.
- Scope: large; Feature 186 shared control-plane contracts plus Feature 192
  Cloudflare-only local readiness, Python parity, timers, migration evidence,
  and proof boundaries.
- Risk: high; shared lifecycle, tenant scope, external adapters, migration
  gates, and runtime retirement are in scope.
- Route: direct-inline-waves in standard light mode. SocratiCode MCP was not
  callable, so targeted shell discovery and existing verifiers are the fallback.
- Required review depth: at least 10 rounds, followed by fresh gates after the
  final repair.

## Review waves

1. Contract and ownership map: compare Feature 186 and Feature 192 invariants.
2. Cloudflare-only runtime boundary and Google OAuth/Drive exception.
3. Canonical job lifecycle, leases, fencing, retry, and outbox.
4. Queue/Workflow/Container/Worker App adapter behavior.
5. Timer/scheduler inventory and hard-cutover fail-closed paths.
6. Python PostgreSQL-pull parity and provider polling/admission.
7. Migration journal, status compatibility, call-site inventory, and drain.
8. Security, tenant scope, callbacks, redaction, and idempotency.
9. Local readiness versus target-account/production proof claims.
10. Final acceptance matrix, impact closure, and regression verification.

Each round records findings and fixes in `orchestra/review-findings.md` and
the feature review artifacts. Safe in-scope findings are patched immediately;
external target-account gates remain explicitly blocked rather than simulated.

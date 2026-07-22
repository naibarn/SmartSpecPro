# Decision Log

## Planning depth

`standard` quick-plan. The work crosses one router/service boundary and two UI
surfaces, but does not require a schema or architectural migration.

## Decisions

- Add an admin-only atomic preset mutation rather than issuing six independent
  browser mutations.
- Return `platformEnabled` and `tenantEnabled` from availability without
  exposing sensitive configuration.
- Use the existing worker and connection queries for runtime readiness.
- Keep advanced controls, collapsed by default.
- Keep production shared/server scopes off.

## Stabilization reviews

1. Completeness: added both admin and end-user surfaces. `[AUTO-FIX]`
2. Contradictions: clarified that “ready” still requires user worker and Grok
   authorization. `[AUTO-FIX]`
3. Security: retained `adminProcedure`, tenant-derived availability, and
   fail-closed reads. No remaining fix.
4. Obvious improvement: added atomic writes and rollback-by-transaction.
   `[AUTO-FIX]`
5. Localization/accessibility: required active-locale copy, labelled switch,
   keyboard-operable disclosure, and status text beyond color. No remaining fix.
6. Cross-section consistency: preset keys, availability names, and tests align.
   No remaining fix.

Rounds 5 and 6 produced no meaningful auto-fix items; the plan is stable.

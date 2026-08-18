# Decision Log

- Planning depth: **standard**. The work is medium-sized but contained to extension shared logic, service-worker integration, panel UI, tests, version metadata, and packaging.
- Use a shared pure module for validation, comparison, cache policy, same-origin URL resolution, and notice derivation.
- Cache successful latest-release responses for six hours and scope freshness to the configured server origin.
- Persist native pending-update metadata from `runtime.onUpdateAvailable`; native readiness takes precedence over Dashboard download awareness.
- Dismissal is version-specific, so a later version reappears.
- Keep the public endpoint unauthenticated and never store credentials in update state.
- Bump release metadata to `0.1.137` and retain `0.1.136`.

## Self-review rounds

1. `[AUTO-FIX]` Added server-origin binding to cached results to prevent reuse after server setting changes.
2. `[AUTO-FIX]` Added same-origin HTTPS fallback and malformed-version coverage.
3. `[AUTO-FIX]` Made native update readiness higher priority and reload explicitly user-triggered.
4. Clean: requirements, security boundaries, tests, and packaging path align.
5. Clean: no missing integration, rollback, permission, or failure-handling gap found.

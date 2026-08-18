# Decision Log

- Planning depth: **standard**, with three execution sections. The change crosses extension, public release API, and Dashboard/connect UI but does not require schema or authentication-model migration.
- Canonical identity is `SmartAIHub Companion`; first release is `0.1.138`.
- Release selection scans both filename families and compares all candidates together.
- Canonical and legacy routes use one resolver but return route-appropriate download aliases.
- Token fallback occurs only after Chrome reports no receiver; explicit extension rejection never falls back.
- Product branding changes; Marketplace capability vocabulary stays intact.
- Package lock changes are focused to the workspace package name/version and workspace link key.

## Self-review rounds

1. `[AUTO-FIX]` Added the legacy-route requirement that `0.1.137` must discover a canonical-name `0.1.138` ZIP.
2. `[AUTO-FIX]` Separated no-receiver token fallback from explicit security rejection.
3. `[AUTO-FIX]` Added lockfile workspace-link rename and no-broad-regeneration constraint.
4. Clean: requirements, compatibility, security, tests, UI copy, and rollback align.
5. Clean: no missing ownership, ordering, or release-verification gap found.

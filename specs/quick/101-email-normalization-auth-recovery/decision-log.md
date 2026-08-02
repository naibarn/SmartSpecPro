# Decision Log

## 2026-07-26

- Depth: `standard`. The work spans a shared auth helper, routers, a database
  migration, and regression tests, but remains one bounded auth domain.
- Use a new `normalizeAuthEmail` helper instead of the existing fraud-oriented
  Gmail alias normalizer.
- Normalize at both writes and reads so legacy mixed-case/whitespace rows work
  before migration.
- Use a functional partial unique index on `lower(btrim(email))` after an
  explicit duplicate check.
- Exclude SMS token rows from token email backfill because that column contains
  phone values for SMS.
- Keep password-session invalidation as a documented follow-up unless the
  existing session contract can be safely enforced without broad token changes.

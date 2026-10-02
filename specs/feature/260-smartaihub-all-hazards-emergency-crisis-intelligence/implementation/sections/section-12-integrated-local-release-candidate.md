# Section 12 — Integrated Local Release Candidate

**Dependencies:** Sections 04–11. **Owner:** conductor remains accountable; independent reviewer may inspect the completed diff. **Status:** Not started.

## Scope

Run the complete local/CI verification once after all code, migrations, UI, tests, deployment templates and requirement trace links are implemented. Use disposable/local databases and mocked providers. This section is the first product test/build/type validation phase; never run workspace `npm run typecheck` due repository RAM policy.

## Required evidence

- Migration replay and PostGIS schema/queries on disposable PostgreSQL.
- Worker and shared-manifest coverage, route/render/access control, no-legacy checks.
- API, idempotency, audit, settlement, lease/fencing and fault recovery suites.
- Browser end-to-end, mobile/accessibility, privacy/security, offline replay, load/chaos and release artifact checks.
- Every source requirement mapped to code and an executed check; no placeholder or unowned critical binding.

## Exit

Freeze one release candidate and its evidence manifest. Any code/config change after freeze returns to the full local gate before Cloudflare staging.

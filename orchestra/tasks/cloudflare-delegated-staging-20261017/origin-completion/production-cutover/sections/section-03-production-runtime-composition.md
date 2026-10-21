# Section 03 — Production Worker and application runtime composition

## Contract

- **Requirement IDs:** PCT-02, PCT-03, PCT-04, PCT-07.
- **Objective:** compose production Worker assets/API/native routes and private Node/Python HTTP Containers without enabling traffic by default.
- **Owned paths:** production Wrangler/config builders, Worker entrypoint/route manifest, production-specific Container profile/classes, origin binding contracts, and focused tests.
- **Prerequisites:** inspect current production Worker settings and staging app/Container implementations; use exact production resource names only from an authorized target record, never infer them from staging.
- **Deliverable:** canonical SPA asset bundle; supported API routes; production-specific namespace/profile paired to immutable image/config; separate production class identity; on-demand limits and cleanup; retained-database readiness before forward; activation/routes default disabled.
- **Acceptance:** config/parser tests prove expected binding set and no secrets, default-off routing, no staging namespace reuse, no retired endpoints, no request replay, and existing DB readiness gate.
- **Fallback:** unqualified routes remain on current origin; no broad catch-all route or automatic container start.
- **Rollback:** remove/disable the production-only config/bindings in the authorized deployment, leaving staging Worker and existing PostgreSQL untouched.
- **Merge readiness:** code and local Worker tests can integrate while production resource bindings remain absent and disabled.

## Verification

Run Cloudflare runtime tests, production config checks, HTTP bridge/container/readiness tests, and the runtime-target verifier. Build a canonical artifact from the integrated SHA; a published artifact is not a deployment.

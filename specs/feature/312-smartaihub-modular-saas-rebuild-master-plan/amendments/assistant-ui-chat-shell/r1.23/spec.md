# SPEC-312 R1.23 — Modular DEV migration recovery and runtime verification

**Date:** 2026-11-15 · **Status:** PARTIAL / CONTINUATION_REQUIRED · **Target:** `modular-debian-dev` (`https://aimarkethubs.com/chat`)

## Scope

Continue the R1.22 Tenant Mission Control implementation. Preserve canonical Chat Jobs, Task Control, artifact and event sources; do not rebuild Mission Control, alter unrelated Chat components, use a retired runtime, or deploy to production.

This amendment requires safe migration authority and order verification, least-privilege review of migration 0441, isolated SQL verification, target-gated DEV deployment, and separate runtime/UAT evidence. Migration 0440 must not be applied as collateral work. The registered migration runner is required for both DEV and disposable migration execution.

## Requirements

- **REQ-312-R123-01 — Migration prerequisites and ordering:** Identify the registered target, required environment names and credential scope; establish whether an approved DEV migration identity exists; verify the actual DEV database and exact 0439/0440/0441 ledger order. Never use an application runtime role for DDL or bypass runner checks.
- **REQ-312-R123-02 — 0441 security and SQL contract:** Preserve tenant/workspace/conversation ownership, unique/FK constraints, explicit lifecycle semantics, canonical Job/event/attempt/artifact relationships, expiry filtering, idempotent Mission creation, safe SECURITY DEFINER ownership/search path/ACL and cross-tenant denial.
- **REQ-312-R123-03 — Isolated migration and integration proof:** Run 0441 through the registered runner and exercise Mission creation/listing, idempotency, Job/Attempt/Event/Artifact projections, authorization denial and migration ordering only in an isolated database with synthetic fixtures. Record PostgreSQL version and scope.
- **REQ-312-R123-04 — DEV migration and release:** Apply only the permitted pending sequence using the registered runner after identity and authority are established. Release the verified source only through `modular_debian_dev_release.py` and verify receipt, module health, route protection, asset parity and rollback readiness.
- **REQ-312-R123-05 — Runtime acceptance:** Verify Mission/Chat behavior and Task Control owner behavior in their actual deployments. Do not infer authenticated behavior from anonymous probes or a Modular Core release. If authorized MFA browser access is absent, provide a reproducible UAT checklist and leave those scenarios pending.

## Safety boundary

The configured DEV application environment exposes a `smartspec_dev` login that is a superuser and application runtime identity. It is prohibited for DDL. The existing `modular_core_auth_dev` role is a non-superuser runtime identity without migration privileges. No approved least-privilege migration identity or provisioning/rotation procedure was found. Do not use either role to apply 0441; stop only the shared DEV migration/release path until the approved identity is provisioned.

A database password was inadvertently surfaced once by an overbroad local search during recovery. Treat it as compromised, do not repeat or use it, and rotate it through an approved secret procedure. No such procedure was available in this work session. The SQL fixture used a separate synthetic disposable credential and copied no application data.

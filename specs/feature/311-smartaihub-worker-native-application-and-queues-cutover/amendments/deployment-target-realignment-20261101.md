# SPEC-311 deployment target realignment — 2026-11-01

This append-only operational amendment supersedes earlier deployment-target and
environment assumptions in SPEC-311 planning artifacts. It does not rewrite the
original requirement history or claim any Worker-native implementation,
Cloudflare activation, or cutover acceptance.

## Canonical environments

| Target ID | Hostname | Environment | Runtime / state |
| --- | --- | --- | --- |
| `legacy-debian-dev` | `smartaihub.app` | Development | Existing Debian `smartspec-web.service` on port 3000, database `smartspec`; active legacy application. `NODE_ENV=production` remains an optimized build setting only. |
| `modular-debian-dev` | `aimarkethubs.com` | Development | Reserved for future Modular Core on `smartsihub-core-dev.service` port 3200. Core source/runtime is not available. Preserve the existing service and tunnel on port 3100 until a healthy, intentional handover. |
| `modular-cloudflare-prod` | `smartsihub.com` | Production | Intended Workers/Hono target, registered but inactive. Its zone is absent from the connected account. No DNS, resource creation, deployment, or traffic change is authorized by this amendment. |

The canonical machine-readable mapping is
[`apps/web/scripts/deployment-targets.json`](../../../../apps/web/scripts/deployment-targets.json).
The existing PostgreSQL `smartspec` remains the database of record; this is
not a database merge or provider migration. The `aimarkethubs.com` tenant stays
separate in that logical database. Existing services, provider credentials,
tenant records, receipts, and runtime configuration retain their stored
identities.

## Scope and acceptance effect

The active `smartaihub.app` Debian release path is classified as a delegated
Development deployment. Its target guard, receipts, and Runner label must carry
that identity explicitly. `aimarkethubs.com` remains available for current
users and is not represented as Modular Core. `smartsihub.com` remains inactive.

This realignment does not implement SPEC-311, resume Cloudflare provisioning,
or change DNS or production traffic. SPEC-311 remains
`PLANNED_NOT_IMPLEMENTED`; all Worker-native completeness, staging, safety,
rollback, and live-runtime proof requirements remain open. Existing Cloudflare
decommission evidence and dated migration plans remain historical evidence, not
current target authority.

Future release commands must name a registered target. The Linux application
and Python backend controllers currently permit only `legacy-debian-dev`.
Development promotion uses the existing delegated server-side controller and
health checks; a failed activation invokes its recorded rollback. Any later
manual restoration must use a previously verified immutable build receipt via
the same controller. No production target is enabled by these commands.

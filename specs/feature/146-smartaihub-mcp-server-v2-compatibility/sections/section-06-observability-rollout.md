# Section 06 — Observability, flags, rollout, and operations

## Scope

Own feature flags, metrics, traces, audit events, health/readiness, rollout,
kill switch, and compatibility telemetry.

## Required design

Add explicit flags for modern protocol, legacy compatibility, docs Resources,
guide aliases, protected-resource metadata, modern stateless fallback, Tasks,
subscriptions, and temporary broad-scope compatibility. Keep Feature 145's
Remotion executor flag separate.

Evaluate flags in global kill switch -> environment -> tenant -> principal/
device -> tool order. New sensitive flags fail closed when the shared flag
store is unavailable. Record actor, tenant, old/new value, reason, and time for
every change; users cannot change tenant flags or widen their own scopes.

Emit request totals/duration by era/version/method/status, auth/scope/header
errors, tool requested/canonical names, resource class, idempotency, job/credit/
worker/R2/download/device events, and legacy-session counts. Redact all secrets,
signed URLs, credentials, and sensitive content.

Readiness must report route/auth metadata/core/queue/R2/optional Redis and the
actual advertised capabilities. A disabled or misconfigured advertised modern
path cannot report ready.

Roll out internal, selected tenants, then GA; keep rollback flags and a legacy
sunset policy. Do not enable new protocol behavior merely by enabling Remotion.

## Exit criteria

Operators can identify which device/era/tool failed, disable modern/alias/
resource behavior independently, and confirm whether a failure is protocol,
auth, core, worker, storage, or Redis-related.

## Implementation status — 2026-08-17

Modern discovery, ping, tools/list, tools/call, resources/list, and
resources/read audit records now include protocol era/version. Resource URIs
are hashed before audit; raw content, tokens, and signed download URLs are not
written by the new resource path. Existing public API audit/rate/quota
middleware remains in the request chain.

Modern protocol rollout is an environment kill switch plus an independent
tenant flag, default off. Resource, guide-alias, protected-resource metadata,
legacy compatibility, legacy broad-scope, and future tasks/subscriptions flags
are registered and Redis-synced. Sensitive new capabilities fail closed when
the tenant flag store is unavailable. Production readiness telemetry and
operator rollout evidence remain external deployment gates; focused tests alone
must not enable production.

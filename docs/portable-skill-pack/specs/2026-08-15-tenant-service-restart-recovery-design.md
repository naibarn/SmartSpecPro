# Tenant Service Restart Recovery Design

## Goal

When the web service is briefly restarting or unreachable, the client should
recover quietly instead of showing the user a red application error. The
current route guard for tenant feature flags can reach an error screen after a
small number of retries, even though the service may return moments later.

This change is limited to transient service-restart conditions. Permission,
authentication, validation, tenant configuration, and ordinary application
errors must retain their existing error behavior.

## Current evidence

- `useTenantFeatureFlagStatus` fetches `/api/tenant/current` and currently
  overrides the shared query retry policy with two retries.
- `RequireVerticalDramaSeries` and `RequireVideoIntelligence` render the
  `RouteLoadingError` screen when that query fails.
- `systemErrorMonitor` already recognizes network failures and upstream
  gateway statuses such as 502/503/504/522/524, but presents them through
  `toast.error`.
- The repository has a shared query retry/backoff policy intended to cover a
  short web-service restart window.

## Chosen approach

Use a narrow, client-side recovery path around the tenant-current request:

1. Classify only network failures, aborted restart-time requests, and known
   upstream-unavailable statuses (502, 503, 504, 522, 524) as transient
   service-restart errors.
2. Reuse the shared idempotent-query retry/backoff policy so the client waits
   for the service to return before navigating.
3. While a transient failure is unresolved, render a calm reconnecting state
   without `role="alert"` or red error copy.
4. If the bounded retry budget is exhausted, perform one cache-busting
   navigation to the same route. Permit at most two automatic navigations in a
   five-minute window. The recovery marker is stored in `sessionStorage` and
   is best-effort: storage access failures disable automatic navigation rather
   than breaking the page. These limits prevent an infinite refresh loop during
   a longer outage.
5. Clear the recovery marker after a successful tenant-current response.
6. Keep the existing manual retry/error state for non-transient failures and
   for an outage that exceeds the automatic recovery budget.
7. Change only the transient branch of the global monitor from an error toast
   to an informational reconnecting toast. It continues recording diagnostics,
   but does not alarm the user or offer a bug report for an expected restart
   window.

JavaScript cannot force the browser's private Ctrl+Shift+R command directly.
The implementation will use same-route navigation with a cache-busting query
parameter, which forces a fresh document request without relying on the
deprecated `location.reload(true)` behavior. The parameter will be removed
from the visible URL after a successful bootstrap.

## Scope and boundaries

In scope:

- Tenant-current feature-flag route guards.
- The existing transient reconnect toast branch.
- Pure helpers for transient classification, recovery budget, and URL
  construction where needed for deterministic tests.

Out of scope:

- Automatic reload after arbitrary API failures or failed mutations.
- Changes to authentication, authorization, or tenant feature-flag defaults.
- Server health endpoints, service orchestration, or deployment behavior.
- Retrying writes that may already have succeeded.

## Failure handling

| Condition | Client behavior |
| --- | --- |
| Network failure / abort during tenant bootstrap | Retry with backoff, then bounded cache-busting recovery |
| 502/503/504/522/524 from tenant bootstrap | Same transient recovery path |
| 401/403 or other 4xx | Existing auth/permission behavior |
| 500 or malformed successful response | Existing error behavior unless it is explicitly classified as an upstream restart response |
| Recovery budget exhausted | Calm manual retry state; no further automatic reload |
| Successful response after retry/reload | Render the guarded route and clear recovery state |

The recovery action is idempotent and applies only to a read request. No user
form state is submitted, no credit-bearing mutation is repeated, and no server
data is deleted or overwritten.

The route guard will wait briefly before the cache-busting navigation so a
service that is finishing its restart can recover without an unnecessary page
transition. The wait and the two-attempt/five-minute budget are constants in a
small pure recovery helper, allowing fake-timer and boundary tests without
mounting the whole application.

## User-visible behavior

During a restart, the user sees a loading/reconnecting message such as
“กำลังเชื่อมต่อเซิร์ฟเวอร์ใหม่…” and the page recovers automatically when the
service is available. There is no red “ระบบขัดข้องชั่วคราว” notification for
this expected transient condition. If the service remains unavailable beyond
the bounded recovery window, the user gets a non-looping retry affordance.

## Verification

Focused tests will cover:

- Transient classification for network and supported gateway statuses.
- Non-transient classification for auth, permission, validation, and ordinary
  application errors.
- Recovery URL construction and session recovery budget limits.
- The tenant feature-flag hook recovering after transient failures.
- The global transient toast using informational presentation.
- Existing route loading error behavior remaining available for real errors.

Verification will use the existing Web workspace test command(s), targeted
Vitest files, and `git diff --check`. Browser-authenticated evidence may be
reported as unavailable if no authenticated dev session is present.

## Deployment considerations

No migration, new dependency, environment variable, or server restart policy
is required. The change is client-only and should be released with the normal
web bundle. The first production check should confirm that a controlled web
service restart recovers the current route without an error toast or repeated
navigation loop.

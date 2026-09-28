# Layered Drama Series Loading Resilience

**Status:** Approved direction; awaiting written-spec review before implementation
**Date:** 2026-07-31
**Scope:** SmartAIHub web application, Vertical Drama detail route, analytics API, and notification SSE diagnostics

## Problem and evidence

The affected route is `/drama-series/:seriesId?tab=episodes`. The browser can remain on a blank page while the tab continues loading. The current route is protected by `RequireAuth`, whose authentication bootstrap uses a raw `fetch` without an abort timeout. While that request is unresolved, `RequireAuth` returns `null`, so the user sees no loading or failure state.

The route shell, JavaScript/CSS assets, local web origin, backend health endpoint, database, and Redis were responsive during investigation. Public requests showed intermittent edge/TLS latency, but the local origin was fast; this is a contributing reliability concern, not evidence that the Vertical Drama query or host was continuously overloaded.

Two additional defects were found on the same production surface:

* Analytics requests fail with PostgreSQL enum errors because the Python service filters `CreditTransaction.type` with `deduction`, while the live enum contains `usage`.
* The notification SSE endpoint repeatedly evicts old connections for the same user. This is not proven to be the direct page-loading cause, but it indicates reconnect or multi-tab churn and lacks sufficient bounded observability.

## Goals

1. Ensure authentication or tenant bootstrap failures never produce an indefinite blank route.
2. Give the user a bounded loading state, a useful error state, and an explicit retry path.
3. Correct the analytics application/schema contract without changing stored data.
4. Reduce noisy SSE eviction behavior and make connection churn measurable.
5. Add regression coverage and release checks that catch the same classes of failure before production.

## Non-goals

* No production deploy, restart, or Cloudflare configuration change as part of implementation.
* No database migration or destructive data operation.
* No broad change to the existing global tRPC retry policy or its 180-second request timeout.
* No redesign of the Vertical Drama page or notification product behavior.
* No assumption that public edge jitter is fixed by application code; it remains a separate operational follow-up if it recurs.

## Design

### Layer 1: bounded client bootstrap and visible route states

#### Authentication bootstrap

Extend the existing auth bootstrap flow with a bounded request timeout and an explicit retryable error state. The request must continue to use the current endpoint, credentials, and response handling. A timeout must not be interpreted as an unauthenticated response, because doing so can redirect a valid user to login during a transient network or edge failure.

The timeout should be materially shorter than the global tRPC timeout because auth bootstrap is a page gate. The implementation should use a named constant and `AbortController`, preserve abort/error classification, and expose a retry action that restarts the bootstrap without requiring a full browser refresh.

`RequireAuth` and the equivalent privileged route guards should render the existing `RouteLoadingSkeleton` while bootstrap is pending. On a terminal bootstrap error, they should render an accessible error/retry state instead of `null`. The normal unauthenticated response should continue to redirect to login only after the server has positively completed the auth check.

#### Tenant feature bootstrap

Keep the existing tenant feature query and its shared retry behavior, but bound the route experience with a visible failure state and retry action when the feature endpoint cannot resolve. The resolved, disabled, and failed states must remain distinct so a transport failure cannot silently appear as a disabled feature.

#### Vertical Drama detail query

Reuse the current tRPC resilience implementation rather than widening global retry or timeout values. Ensure the detail page keeps an explicit loading state and a recoverable error state, including a retry action, for query failures. This layer is a page-level presentation safeguard; it does not replace backend tracing or health checks.

#### State and accessibility requirements

All new states must be keyboard accessible, have a meaningful status or alert role where appropriate, and use existing project UI patterns. Tests should assert that pending and failure states are visible and that retry invokes the relevant refetch/bootstrap action.

### Layer 2: analytics application/schema contract

Change the analytics filter from the invalid label `deduction` to the live schema value `usage`, matching the current `transaction_type` enum and the application model comment. Add a focused regression test that exercises the generated filter/query condition or the service behavior and prevents reintroduction of the invalid enum value.

No stored transaction rows are changed and no migration is required. If the codebase has a central transaction-type definition suitable for reuse, use it to reduce future string drift; otherwise keep the smallest local correction and test the contract explicitly.

### Layer 3: SSE connection-churn prevention and observability

First, preserve notification semantics and inspect the existing client lifecycle to avoid changing behavior unnecessarily. Add bounded server-side observability for active connections and eviction events, and rate-limit or deduplicate repeated eviction logs so a reconnect storm does not flood logs.

The server should retain the existing per-user connection cap and eviction policy unless focused tests demonstrate that the cap itself is incorrect. Add structured fields sufficient to identify user, tenant, active count, reason, and a bounded time window. If the existing client hook proves that duplicate mounts or reconnect scheduling create avoidable connections, apply the smallest lifecycle fix and cover it with a focused test. Cross-tab coordination is out of scope unless the current hook cannot be made safe within the existing ownership boundary.

## Verification plan

### Focused automated tests

* Auth bootstrap timeout, retry, success, and positive unauthenticated response.
* `RequireAuth` pending and error/retry rendering; no blank `null` gate.
* Tenant feature flag pending, resolved, and failed/retry behavior.
* Vertical Drama detail loading/error/retry behavior, preserving existing tests.
* Analytics service uses the schema-supported transaction type and cannot emit `deduction`.
* SSE connection cap/eviction behavior, active-count instrumentation, and log deduplication/rate limiting.
* Existing request resilience and credential tests remain green.

### Repository and runtime checks

Run the changed-surface Vitest suites, then the web TypeScript check and production build using the repository's existing package-manager scripts. Validate locally that the target route returns the shell, assets load, and the route exposes a visible state when bootstrap/query calls are delayed or fail. Re-run public/local/backend probes and inspect logs after the change.

Production deployment or service restart requires a separate explicit approval. If deployed later, verify the target route, auth bootstrap, analytics endpoints, SSE connection counts, and error rates before declaring the incident closed.

## Failure modes and safeguards

* **Auth timeout during a valid session:** show retryable failure, do not redirect or clear local session state.
* **Auth endpoint returns a valid unauthenticated result:** preserve the existing login redirect.
* **Tenant endpoint fails:** do not treat failure as feature disabled; show a bounded retry state.
* **Analytics enum drift recurs:** the focused contract test should fail before release.
* **SSE clients reconnect rapidly:** retain the connection cap, bound logs, and expose active/evicted counts for diagnosis.
* **Backend query remains slow:** page-level error handling prevents an indefinite blank UI, while backend latency remains observable and independently actionable.

## Acceptance criteria

1. A delayed or failed `auth.me` request never leaves the protected route blank indefinitely; the user sees loading, then a retryable error if the timeout is reached.
2. A normal unauthenticated response still redirects to login, and a successful authenticated response still reaches the Vertical Drama route.
3. The tenant feature failure state is distinguishable from a disabled feature and can be retried.
4. The Vertical Drama detail query exposes a visible recoverable error state.
5. Analytics summary/time-series no longer fail because of the invalid `deduction` enum label.
6. SSE eviction logs are bounded and active connection/eviction behavior is testable and observable.
7. Focused tests, TypeScript check, and production build pass; unrelated pre-existing failures are reported separately.
8. No production service is restarted and no data is modified without explicit approval.

## Implementation order

1. Add auth/tenant route-state resilience and focused tests.
2. Correct and test the analytics enum contract.
3. Add SSE observability and only the minimal lifecycle hardening justified by tests.
4. Run changed-surface verification, typecheck, build, and local/runtime probes.

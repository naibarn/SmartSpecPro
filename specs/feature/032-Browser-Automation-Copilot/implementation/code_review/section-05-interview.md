# Section 05 Code Review Interview

## Auto-fixes Applied

1. **CRITICAL: Added `validate_url_dns()` call in `navigate()`** — DNS rebinding protection (Layer 2) was missing. Added after `validate_url()`.

2. **Fixed `_wait_job` imports** — Moved `SandboxJob` and `select` imports to module level. Added `await self._dispatcher.db.expire_all()` between polls to prevent stale SQLAlchemy cache. Changed elapsed tracking from additive sleep counting to `time.monotonic()` for accurate wall-clock measurement.

3. **Fixed `dispatcher` type** — Changed from `Any | None` to `SandboxDispatcher | None` (using `TYPE_CHECKING` to avoid circular import).

4. **Fixed `_pages_loaded` increment timing** — Now incremented BEFORE dispatch (consistent in both real and stub paths). If SSRF validation fails, the counter is not incremented.

5. **Fixed `screenshot()` counter rollback** — Counter now decrements on dispatch failure so failed screenshots don't consume quota.

## User Questions (Deferred)

### Q1: `ssrf_route_filter` not wired into sandbox dispatch inputs
**Decision: Deferred** — The filter function exists as a standalone utility. It will be wired when the sandbox runner is built (future section). The function is tested and ready for integration.

### Q2: No seed SQL for `browser-default` sandbox profile
**Decision: Deferred** — The `FEATURE_PROFILE_MAP` mapping exists. The actual DB record will be created as part of infrastructure/deployment setup, not as part of this code section.

## Let Go

- Duplicated stub/dispatch branching pattern — explicit and readable
- `_wait_job` output validation — will stabilize with sandbox runner
- `ssrf_route_filter` session_id in logs — standalone function design
- Test gaps for `_wait_job` failure paths — covered when sandbox exists

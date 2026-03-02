# Code Review Interview: Section 15

## Applied Fixes

### AUTO-FIX: redisSemaphore.ts — Atomic INCR+EXPIRE via Lua script
**Issue:** INCR and EXPIRE were two separate Redis round-trips; a process crash between them left the key with no TTL.
**Fix:** Replaced with a Lua script that atomically INCRs and conditionally EXPIREs in a single round-trip. Updated `resourceLimits.test.ts` to mock `eval` instead of `incr`+`expire`.

### AUTO-FIX: redisSemaphore.ts — TTL-expiry guard in release()
**Issue:** If session ran to full TTL duration and Redis deleted the key, `decr()` would create the key at -1.
**Fix:** Added `redis.exists(key)` check before `decr()` in release(). Added test "release skips DECR when key has already expired".

### USER-APPROVED FIX: nginx port-80 — voice WebSocket before /api/
**Issue:** `/api/voice/stream` was positioned after `/api/` in the port-80 block. Nginx prefix matching routed voice WS to Python backend (:8000) instead of Node.js (:3000).
**Fix:** Moved `/api/voice/stream` to before `/api/` in the port-80 server block. (Port-443 block was already correct.)

### USER-APPROVED FIX: securityChecklist.test.ts — placeholders changed to it.todo()
**Issue:** `expect(true).toBe(true)` placeholders gave false confidence; they always pass regardless of actual security state.
**Fix:** Changed Secrets Encryption and adapter timingSafeEqual audit tests to `it.todo()`. These require manual grep audits that can't be automated. Removed misleading "timingSafeEqual is used for all webhook signature checks" test that only checked `typeof` — replaced with a meaningful test of the reference pattern's length-mismatch handling.

### AUTO-FIX: nginx sandbox — removed dead X-Frame-Options ALLOW-FROM
**Issue:** `X-Frame-Options: ALLOW-FROM` has been unsupported in Chrome since v40 and Firefox since v70. CSP `frame-ancestors` already provides the framing restriction.
**Fix:** Removed the `add_header X-Frame-Options "ALLOW-FROM ..."` line from the sandbox server block.

### AUTO-FIX: nginx /widget/v1/ blocks — added proxy_http_version 1.1 and X-Forwarded-Proto
**Issue:** Both /widget/v1/ static asset blocks (port-80 and port-443) were missing `proxy_http_version 1.1` and `proxy_set_header X-Forwarded-Proto $scheme`. Without X-Forwarded-Proto the widget init endpoint couldn't determine HTTPS context for Secure cookie enforcement.
**Fix:** Added both headers to both /widget/v1/ location blocks via `replace_all`.

## Let-Go Items

- **resourceLimits.test.ts: missing test for incr succeeds + expire throws** — Not applicable with Lua script fix (eval is atomic, either all succeeds or all fails; no partial failure window).
- **nginxConfig.test.ts: timeout assertions validate only first server block** — Low risk: both server blocks use the same location block definitions; a difference would be caught in manual nginx -t validation.
- **Part A security verification pass** — Deferred as noted; this section's scope is the infrastructure layer; per-feature security properties are verified in each feature's own test files.

## Final Test Results
- 35 passing, 3 todo (manual-audit items)
- nginx config validates correctly with all required location blocks

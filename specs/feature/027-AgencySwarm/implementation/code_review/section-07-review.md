# Section 07 Code Review: SSE Stream Proxy

## CRITICAL

**C1: `agencyId` interpolated into URL without validation (SSRF risk)**
- File: `agencyStreamProxy.ts:91`
- `agencyId` from `req.body` is interpolated into `${PY_BACKEND}/api/v1/agencies/${agencyId}/stream`
- Malicious values like `../../admin/delete-all` could cause path traversal/SSRF
- Fix: Apply strict regex `/^[a-zA-Z0-9_-]+$/` or use `encodeURIComponent(agencyId)`

**C2: `errText` variable fetched but never used (dead code)**
- File: `agencyStreamProxy.ts:109`
- `errText` is captured but only `upstream.status` is used in the error event
- Remove the dead variable to prevent future accidental info leaks

## IMPORTANT

**I1: Heartbeat test is a no-op (`expect(true).toBe(true)`)**
- File: `agencyStreamProxy.test.ts:257-270`
- Plan requires fake timer test; implementation punts entirely

**I2: SSE headers sent before upstream fetch — HTTP error codes lost**
- File: `agencyStreamProxy.ts:54-80`
- `writeHead(200)` happens before upstream fetch, so HTTP-level errors (403, 500) become SSE error events instead of proper status codes
- Consider deferring `writeHead` until after upstream responds OK

**I3: No rate limiting on SSE endpoint**
- Long-lived connections could exhaust resources without per-user limits

**I4: `Number(auth.sub)` returns NaN for bearer "static" tokens**
- File: `agencyStreamProxy.ts:45`
- `Number("static")` = NaN → `hasEnoughCredits(NaN, 5.0)` has undefined behavior

**I5: `Connection: keep-alive` header is pointless (stripped by Nginx)**
- Technically harmless, follows plan spec

## SUGGESTION

**S1: No logging of stream lifecycle events**
**S2: `conversationId` not validated**
**S3: Tests don't verify upstream request body**
**S4: No max message length enforcement**
**S5: Test server cleanup on failure**

## OBSERVATION

**O1: Route registration order correct but fragile (226 lines between routes and catch-all)**
**O2: Nginx location blocks correctly placed in both HTTP and HTTPS**
**O3: `agency:run` scope differs from catch-all's `media:generate` — Python must accept it**

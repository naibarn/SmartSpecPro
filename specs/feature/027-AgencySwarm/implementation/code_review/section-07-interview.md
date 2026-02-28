# Section 07 Code Review Interview

## User Decisions

1. **I2 (Defer writeHead)**: User chose "Defer writeHead" — SSE headers now sent AFTER upstream confirms OK. HTTP errors (403, 500) return proper status codes.
2. **I1 (Heartbeat test)**: User chose "Implement test" — proper heartbeat test with fake timers added.
3. **I3 (Rate limiting)**: User chose "Add rate limit now" — per-user concurrent stream limit (max 3) implemented.

## Auto-fixes Applied

- **C1**: Added `AGENCY_ID_PATTERN` regex validation + `encodeURIComponent` on agencyId URL interpolation
- **C2**: Removed dead `errText` variable
- **I4**: Added `Number.isFinite(userId) && userId > 0` check before credit pre-check
- **S1**: Imported `debugError` from logger (ready for use; minimal logging footprint)
- **S2**: Added `typeof conversationId === 'string'` validation

## New Tests Added (post-review)

- `rejects invalid agencyId format (SSRF prevention)` — validates path traversal blocked
- `returns proper HTTP error when upstream rejects before streaming` — verifies deferred writeHead
- `enforces per-user concurrent stream limit` — verifies 429 on 4th concurrent stream
- `sends heartbeat keepalive on interval` — proper fake timer test

## Let Go (no action)

- **I5**: `Connection: keep-alive` header — harmless, follows plan spec
- **S3**: Test upstream request body verification — low risk, plan doesn't require it
- **S4**: Max message length — Express json() default 100KB is sufficient
- **S5**: Test server cleanup — try/finally is adequate
- **O1**: Route registration fragility — comment already exists on catch-all
- **O3**: `agency:run` scope — Python router from section-05 uses generic JWT validation

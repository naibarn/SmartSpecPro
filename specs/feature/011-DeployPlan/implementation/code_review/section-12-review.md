# Code Review: Section 12 - Cloudflare Vectorize Integration

## Critical Issues

### 1. SECURITY: Search endpoints use `publicProcedure` -- unauthenticated access (HIGH)
Both `search.docs` and `search.images` use `publicProcedure`. Anyone can query indexes without auth, and `tenantId` is optional/client-supplied. Violates plan's multi-tenant isolation requirement.

### 2. SECURITY: `tenantId` is client-supplied rather than from session (HIGH)
Even with protectedProcedure, tenantId from client input is an IDOR vulnerability. Should derive from `ctx.user.tenantId`.

### 3. Gallery hooks NOT implemented (HIGH)
Plan requires modifying gallery router to trigger `indexImage()` on promotion and `removeVector()` on deletion. Neither was implemented.

### 4. One-time indexing script is a no-op stub (MEDIUM-HIGH)
Script prints skip messages and exits without indexing anything.

## Medium Issues

### 5. No rate limiting/backoff on embedding API calls (MEDIUM)
Sequential `generateEmbedding()` calls in loop with no throttling will hit rate limits.

### 6. No minimum relevance score filtering (MEDIUM)
Returns all matches regardless of score. Plan suggests filtering below 0.5.

### 7. `removeVector` doesn't handle chunked documents (MEDIUM)
No `removeDocument()` to delete all chunks. Orphaned vectors will remain.

### 8. No error handling in search endpoints (MEDIUM)
If Vectorize API is down, endpoints throw 500 errors instead of graceful degradation.

### 9. `VECTORIZE_API_TOKEN` silent fallback (LOW-MEDIUM)
Falls back to AI API key without warning. Different tokens may have different scopes.

### 10. Missing `.env.example` updates (LOW)
New env vars not documented.

### 11. Missing `createdAt` filter test (LOW)
Plan specifies date-range filtering test that wasn't implemented.

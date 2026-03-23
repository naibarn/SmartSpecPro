# Section 05 — Code Review Interview Transcript

## Review Disposition

All findings triaged by implementer. 2 HIGH + 2 MEDIUM auto-fixed, 2 MEDIUM tests added, 1 MEDIUM let-go (correct as-is), 2 LOW auto-fixed.

## Findings

### HIGH: `_mcpSessionExpired` not propagated in batch mode
**Decision:** Auto-fix. Added `(req as any)._mcpSessionExpired` check after `Promise.all` in batch path → returns `res.status(404).json(responses)`.

### HIGH: DELETE handler lacks UUID validation for session ID
**Decision:** Auto-fix. Added `UUID_RE` constant and validation in `mcpDeleteHandler`: `if (sessionId && UUID_RE.test(sessionId))`. Non-UUID values silently return 204 (no info leak).

### MEDIUM: Dead `isNotification` variable
**Decision:** Auto-fix. Removed the unused `const isNotification` declaration.

### MEDIUM: Multiple `initialize` in batch — silent corruption
**Decision:** Auto-fix. Added validation before `Promise.all`: count `initialize` methods in batch, reject with `-32600` if > 1.

### MEDIUM: Batch notification test missing
**Decision:** Auto-fix. Added test: batch `[tools/list, notifications/initialized]` → assert response array length is 1.

### MEDIUM: 200 vs 400 for batch-too-large
**Decision:** Let go. JSON-RPC 2.0 §5 requires error responses at HTTP 200. Added code comment explaining this.

### LOW: DELETE without header test missing
**Decision:** Auto-fix. Added test: `DELETE /v1/mcp` without header → 204.

### LOW: Session ID header in version negotiation tests
**Decision:** Auto-fix. Added `expect(res.headers["mcp-session-id"]).toBeDefined()` to both version tests.

### LOW (additional): DELETE with non-UUID session ID
**Decision:** Auto-fix. Added test confirming crafted session IDs like `"../other:key"` return 204 without Redis call.

## Test Results After Fixes
- 33 tests in mcpPublicServer.test.ts: all pass
- 7 tests in mcpPublicServerSecurity.test.ts: all pass
- Total: 40 tests pass

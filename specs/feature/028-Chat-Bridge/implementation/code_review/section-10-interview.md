# Section 10 Code Review Interview

## Auto-fixes Applied

### H1: parseInt NaN guard (HIGH)
**Action**: Auto-fixed. Added `isNaN(numericId)` check in `verifyConversationOwnership` before querying DB.

### H3: Race condition in bindConversation (HIGH)
**Action**: Auto-fixed. Wrapped insert in try/catch, mapping PostgreSQL unique constraint violation (code 23505) to TRPCError CONFLICT.

### H4: adminRevokeConnection doesn't check status (HIGH)
**Action**: Auto-fixed. Added `eq(telegramConnections.status, "active")` filter to prevent re-revoking already-revoked connections.

### M4: count() returns string (MEDIUM)
**Action**: Auto-fixed. Changed `countResult?.cnt ?? 0` to `Number(countResult?.cnt) || 0`.

### T1: Missing agency test (TEST GAP)
**Action**: Auto-fixed. Added test for `getConversationChannelStatus` with `conversationType='agency'`.

## Items Let Go

- H2: adminProcedure vs domainAdminProcedure — plan specifies adminProcedure, can be changed later
- M1: N+1 in unlinkTelegram — users typically have 1 connection
- M2: `any` type on db param — consistent with rest of file
- M3: PII in admin response — admin endpoints legitimately need user info
- M5: No rate limiting — not in scope for this section
- M6: nullable connectionId — schema already established
- L1-L3: Minor optimizations, not blocking
- T2-T5: Edge case tests, acceptable gaps

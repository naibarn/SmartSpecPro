# Section 11 Code Review Interview

## Auto-fixes Applied (no user input needed)

1. **BullMQ Redis connection** — Changed from manual URL parsing to `getRealtimeClient().duplicate()` pattern matching existing escalation/digest jobs. Low risk, consistent with codebase.

2. **users.tenantId → users.currentTenantId** — Fixed TypeScript error. Used `String()` conversion since webhook table uses varchar tenantId.

3. **Removed dead `if (params.db)` guard** — `db` is always provided. Replaced with bare block for fire-and-forget isolation.

## Let Go (not actionable)

- Feature flag gate deferred to section-13 per spec
- Router tests are lightweight mocks rather than full caller tests — sufficient for this scope

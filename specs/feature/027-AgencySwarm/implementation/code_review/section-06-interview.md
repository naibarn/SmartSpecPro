# Section 06 Code Review Interview

## Auto-fixes Applied (no user input needed)

### Fix 1: Replace nanoid(36) with crypto.randomUUID()
- **Issue**: nanoid generates non-UUID strings but input schemas use `z.string().uuid()` — would fail validation at runtime
- **Action**: Replaced all `nanoid(36)` with `crypto.randomUUID()`, removed nanoid import, added `import crypto from "crypto"`
- **Test update**: Changed nanoid mock to `vi.spyOn(crypto, "randomUUID")`

### Fix 2: sendMessage conversation validation missing agencyId check
- **Issue**: Conversation lookup only checked userId and conversationId, not agencyId — user could send to wrong agency
- **Action**: Added `eq(agencyConversations.agencyId, input.agencyId)` to WHERE clause

### Fix 3: N+1 query in getById for agent tools
- **Issue**: Agent tool assignments queried in a for-loop (N+1)
- **Action**: Replaced with single `inArray()` query: `where(inArray(agencyAgentTools.agentId, agentIds))`

### Fix 4: Update WHERE clause missing tenant isolation
- **Issue**: `update` procedure's final WHERE only used `eq(agencies.id, id)`, no tenant check
- **Action**: Changed to `where(and(eq(agencies.id, id), eq(agencies.tenantId, tenantId)))`

## User Interview Questions

### Question 1: Bridge Authentication Pattern
- **Issue**: Bridge used user JWT as Bearer token. Python backend expects gateway token for service-to-service auth.
- **Options presented**:
  1. Switch to gateway token (user chose this)
  2. Keep user token as Bearer
- **User decision**: Switch to gateway token
- **Action**: Changed `Authorization: Bearer ${userToken}` → `Authorization: Bearer ${GATEWAY_TOKEN}` with `X-User-Token: userToken` header
- **Test update**: Updated assertions to expect `Bearer test-gateway-token` and `X-User-Token` header

### Question 2: Feature Flag Tenant Scoping
- **Issue**: `assertAgencyEnabled()` checked a global flag, but adminToggleTenant accepts per-tenant input
- **Options presented**:
  1. Implement basic tenant scoping now (user chose this)
  2. Keep global flag for now
- **User decision**: Implement basic tenant scoping now
- **Action**:
  - Added `getTenantFeatureFlag(flagName, tenantId)` and `setTenantFeatureFlag(flagName, tenantId, value)` to `featureFlags.ts`
  - Tenant-scoped Redis keys: `feature-flag:{flagName}:{tenantId}` with fallback to global flag
  - Updated `assertAgencyEnabled(tenantId)` to accept and pass tenantId
  - Updated all 8 call sites in agency.ts to pass tenantId
  - Updated `adminToggleTenant` to use `setTenantFeatureFlag`
  - Updated test mocks and assertions to match tenant-scoped functions

## Items Let Go (not worth fixing)

- Response type mapping for `listRuns` — camelCase mapping can be addressed when Python side stabilizes
- `agencyTemplateProcedure` rate limiter unused — will be used in section-12 (templates)
- Timeout signal might not be supported in all Node versions — AbortSignal.timeout is in Node 18+ which is our minimum

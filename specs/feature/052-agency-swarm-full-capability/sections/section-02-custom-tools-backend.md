Now I have enough context. Let me produce the section.

# Section 02 — Custom Tools Backend

## Overview

This section implements the tRPC CRUD backend for custom tool management: `createCustomTool`, `updateCustomTool`, `deleteCustomTool`, `listCustomTools`, and `testCustomTool`. It also adds Node.js-side SSRF validation, header encryption, and the Python `ToolBridge` extensions to execute custom tools at runtime.

**Depends on**: section-01-database-migration (new columns on `agencyTools` table must exist)
**Blocks**: section-03-custom-tools-frontend, section-04-openapi-import, section-14-mcp-integration, section-16-tool-progress-standalone-api

---

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/server/services/ssrfValidator.ts` | **CREATE** | Node.js SSRF validation utility |
| `apps/web/server/routers/agency.ts` | **MODIFY** | Add 5 custom tool tRPC procedures |
| `apps/web/server/routers/__tests__/agencyCustomTools.test.ts` | **CREATE** | Vitest tests for custom tool CRUD |
| `python-backend/app/services/agency_tools.py` | **MODIFY** | Extend ToolBridge for custom tool execution |
| `python-backend/tests/unit/services/test_agency_tool_bridge.py` | **CREATE** | pytest tests for ToolBridge custom tool support |

---

## Tests (Write First)

### Vitest: `apps/web/server/routers/__tests__/agencyCustomTools.test.ts`

Write tests covering these scenarios. Mock the database (`db`) and `encrypt`/`decrypt` from `../services/crypto`. Use `createCaller` from the agency router with a fake tRPC context including `tenantId` and `user`.

```
Test: createCustomTool validates name uniqueness per tenant
  - Insert a tool with name "my-tool" for tenantId "t1"
  - Second call with same name + tenant -> TRPCError CONFLICT

Test: createCustomTool rejects endpoint with private IP (SSRF)
  - endpoint: "http://10.0.0.5/api" -> TRPCError BAD_REQUEST with "SSRF" in message
  - endpoint: "http://192.168.1.1/api" -> same rejection

Test: createCustomTool rejects endpoint with localhost
  - endpoint: "http://localhost:8080/hook" -> TRPCError BAD_REQUEST
  - endpoint: "http://127.0.0.1/hook" -> TRPCError BAD_REQUEST

Test: createCustomTool encrypts headers before storing
  - Call with headers: { "Authorization": "Bearer sk-test" }
  - Assert db.insert was called with headersEncrypted containing encrypted string (not raw JSON)
  - Assert the stored value is NOT equal to JSON.stringify(headers)

Test: createCustomTool enforces max 50 tools per tenant
  - Mock db.select to return count = 50
  - Call createCustomTool -> TRPCError FORBIDDEN with "limit" in message

Test: createCustomTool rate limits at 10/min per user
  - Verify the procedure uses createRateLimitMiddleware with namespace "agency-tool-create", limit 10

Test: updateCustomTool increments version
  - Existing tool has version=1
  - Call updateCustomTool -> version in UPDATE query = 2

Test: deleteCustomTool soft-deletes and checks no agents reference it
  - Tool has agents referencing it (agencyAgentTools JOIN returns rows) -> TRPCError PRECONDITION_FAILED
  - Tool has no agents -> sets isEnabled=false (soft delete)

Test: testCustomTool validates input against inputSchema before HTTP call
  - inputSchema requires { "url": string }, input is { "count": 5 } -> TRPCError BAD_REQUEST "schema"

Test: listCustomTools filters by tenant, excludes disabled
  - Returns only tools where tenantId matches AND isEnabled=true
  - Does NOT return tools from other tenants
```

### Vitest: SSRF Validator `apps/web/server/services/__tests__/ssrfValidator.test.ts`

```
Test: rejects private IP 10.x.x.x
Test: rejects private IP 172.16.x.x - 172.31.x.x
Test: rejects private IP 192.168.x.x
Test: rejects localhost (127.0.0.1, localhost, ::1)
Test: rejects cloud metadata 169.254.169.254
Test: rejects non-http/https schemes (ftp://, file://)
Test: allows SMARTSPEC_INTERNAL_URL explicitly
Test: allows valid public HTTPS URLs
Test: rejects empty or malformed URLs
```

### pytest: `python-backend/tests/unit/services/test_agency_tool_bridge.py`

```
Test: ToolBridge validates input against JSON Schema before HTTP call
  - custom tool with inputSchema, invalid input -> returns structured error string (not exception)

Test: ToolBridge returns structured error on validation failure (not raw exception)
  - Verify returned string includes "validation" and field name, not Python traceback

Test: ToolBridge respects strictSchema flag
  - strictSchema=True, additional properties in input -> reject
  - strictSchema=False, additional properties -> allow

Test: ToolBridge respects oneCallAtATime flag
  - oneCallAtATime=True -> acquires asyncio.Lock before HTTP call, releases after

Test: SSRF guard blocks private IPs, localhost, metadata endpoints at execution time
  - custom tool endpoint resolves to 10.0.0.1 -> ValueError
  - custom tool endpoint is "http://localhost:9999" -> ValueError
  - custom tool endpoint is "http://169.254.169.254/latest/" -> ValueError
```

---

## Implementation Details

### 1. SSRF Validator (Node.js)

**File**: `apps/web/server/services/ssrfValidator.ts`

Create a synchronous validation function that mirrors the Python `_validate_tool_url` pattern in `python-backend/app/services/agency_tools.py` (lines 113-143).

The function signature:

```typescript
/**
 * Validates that a URL is safe from SSRF attacks.
 * Blocks private IPs, localhost, cloud metadata endpoints, non-HTTP schemes.
 * Allows the configured SMARTSPEC_INTERNAL_URL.
 * Throws Error if URL is blocked.
 */
export function validateSsrfUrl(url: string): void
```

Blocked targets (match the Python lists at lines 33-51 of `agency_tools.py`):
- Hosts: `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `[::1]`, `169.254.169.254`, `metadata.google.internal`
- Networks: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `fc00::/7`, `fe80::/10`
- Schemes: only `http` and `https` allowed
- Exception: `process.env.SMARTSPEC_INTERNAL_URL` prefix is always allowed

Use Node.js built-in `URL` for parsing. For IP range checks, use simple numeric comparison (no external dependency needed). Parse IP octets to check membership in CIDR blocks.

### 2. tRPC Procedures (5 new procedures in agency router)

**File**: `apps/web/server/routers/agency.ts`

Add these procedures to the existing `agencyRouter`. All require `protectedProcedure` with tenant context. Import `encrypt` from `../services/crypto` and `validateSsrfUrl` from `../services/ssrfValidator`.

#### 2a. `createCustomTool`

Zod input schema:
- `name`: `z.string().min(1).max(100)` -- unique per tenant (checked via DB query)
- `description`: `z.string().max(2000).optional()`
- `endpoint`: `z.string().url()` -- validated with `validateSsrfUrl()`
- `httpMethod`: `z.enum(["GET", "POST", "PUT", "DELETE"])`
- `headers`: `z.record(z.string()).optional()` -- encrypted before storage
- `inputSchema`: `z.record(z.unknown()).optional()` -- JSON Schema object
- `outputSchema`: `z.record(z.unknown()).optional()`
- `riskLevel`: `z.enum(["low", "medium", "high"]).default("low")`
- `strictSchema`: `z.boolean().default(false)`
- `oneCallAtATime`: `z.boolean().default(false)`
- `icon`: `z.string().max(50).optional()`
- `category`: `z.string().max(50).optional()`
- `retryPolicy`: `z.object({ maxRetries: z.number().int().min(0).max(5), backoffMs: z.number().int().min(100).max(30000) }).optional()`

Logic:
1. `assertAgencyEnabled(ctx.tenantId)`
2. Count existing tools for tenant -- reject if >= 50
3. Check name uniqueness (query `agencyTools` where `tenantId` and `name`)
4. `validateSsrfUrl(input.endpoint)` -- throws on SSRF
5. If `headers` provided, `headersEncrypted = encrypt(JSON.stringify(headers))`
6. Generate `id = crypto.randomUUID()`
7. Insert into `agencyTools` with `toolType: "http_api"`, `version: 1`, `isEnabled: true`
8. Return the created tool (without decrypted headers)

Rate limit: wrap with `createRateLimitMiddleware({ namespace: "agency-tool-create", limit: 10, windowMs: 60_000 })`

#### 2b. `updateCustomTool`

Input: `toolId` + all fields from create (all optional except `toolId`). Additional validation:
- Fetch existing tool, verify `tenantId` matches caller
- If `endpoint` changed, re-validate SSRF
- If `headers` changed, re-encrypt
- Auto-increment `version` (existing `version + 1`)
- Set `updatedAt` to `new Date()`

#### 2c. `deleteCustomTool`

Input: `toolId: z.string().uuid()`

Logic:
1. Verify tool belongs to caller's tenant
2. Check `agencyAgentTools` for any rows referencing this `toolId` -- if found, reject with `PRECONDITION_FAILED` ("Tool is in use by agents. Remove it from agents first.")
3. Soft-delete: `UPDATE agencyTools SET isEnabled = false WHERE id = toolId`

#### 2d. `listCustomTools`

Input: optional `search: z.string()`, `page: z.number()`, `limit: z.number().max(50)`

Query `agencyTools` where `tenantId` matches, `isEnabled = true`, `toolType IN ('http_api', 'openapi_import', 'mcp_bridge')`. Order by `createdAt DESC`. Exclude `headersEncrypted` from response (or replace with `hasHeaders: boolean`).

#### 2e. `testCustomTool`

Input: `toolId: z.string().uuid()`, `sampleInput: z.record(z.unknown())`

Logic:
1. Fetch tool, verify tenant ownership
2. If tool has `inputSchema`, validate `sampleInput` against it (use `ajv` or manual JSON Schema check)
3. Re-validate `endpoint` for SSRF (defense in depth -- URL may resolve differently now)
4. Decrypt `headersEncrypted` if present
5. Make HTTP request using `fetch()` with timeout (10s), method from `httpMethod`, headers from decrypted value + `Content-Type: application/json`, body from `sampleInput`
6. Return `{ status, body, durationMs }` (truncate body to 10KB)

Rate limit: `createRateLimitMiddleware({ namespace: "agency-tool-test", limit: 20, windowMs: 60_000 })`

### 3. Python ToolBridge Extensions

**File**: `python-backend/app/services/agency_tools.py`

Extend the existing tool resolution to handle custom tools (those with `toolType` in `['http_api', 'openapi_import', 'mcp_bridge']`). The changes go in the tool loading flow that queries tools from the database and creates bridge functions.

#### 3a. Custom tool config model

Add a `CustomToolConfig` Pydantic model:

```
class CustomToolConfig(BaseModel):
    """Extended config for custom (non-builtin) tools."""
    tool_id: str
    tool_type: str
    risk_level: str
    requires_approval: bool
    endpoint_url: str
    http_method: str = "POST"
    input_schema: dict | None = None
    output_schema: dict | None = None
    strict_schema: bool = False
    one_call_at_a_time: bool = False
    retry_policy: dict | None = None
    config: dict[str, Any] = {}
```

#### 3b. Input validation

Before making the HTTP call for a custom tool, validate the tool's input against `input_schema` using `jsonschema.validate()` (already a dependency). If `strict_schema` is True, set `additionalProperties: false` in the schema before validation.

On validation failure, return a structured error string (not raise an exception) so the agent gets a friendly message:
`"Tool input validation failed for field 'X': Y"`

#### 3c. `oneCallAtATime` support

If `one_call_at_a_time` is True, use an `asyncio.Lock` per tool_id (stored in a module-level dict) to serialize calls. Acquire before HTTP call, release after.

#### 3d. SSRF re-validation at execution time

Call `_validate_tool_url(endpoint_url)` before every HTTP call, not just at creation time. This is the existing function at line 113 of `agency_tools.py`.

#### 3e. Custom tool HTTP execution

In `_make_run_func`, add a branch for custom tools (those not in `_BUILTIN_ENDPOINTS`). The HTTP call should:
- Use `httpx.AsyncClient` with timeout from `retry_policy.backoffMs` or default 30s
- Set method from `http_method`
- Headers come from the tool's decrypted headers (passed via tool config from Node.js, which decrypts before sending to Python)
- Body is the tool instance's input fields serialized as JSON
- On failure, respect `retry_policy.maxRetries` with exponential backoff
- Return the response body as string (truncated to 50KB)

---

## Zod Schema Reference

The Zod schemas for tool creation/update are new additions to `agency.ts`. They should be exported for reuse by section-04-openapi-import (which bulk-creates tools using the same shape).

```typescript
// Export for reuse by OpenAPI import
export const customToolInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(2000).optional(),
  endpoint: z.string().url(),
  httpMethod: z.enum(["GET", "POST", "PUT", "DELETE"]),
  headers: z.record(z.string()).optional(),
  inputSchema: z.record(z.unknown()).optional(),
  outputSchema: z.record(z.unknown()).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).default("low"),
  strictSchema: z.boolean().default(false),
  oneCallAtATime: z.boolean().default(false),
  icon: z.string().max(50).optional(),
  category: z.string().max(50).optional(),
  retryPolicy: z.object({
    maxRetries: z.number().int().min(0).max(5),
    backoffMs: z.number().int().min(100).max(30000),
  }).optional(),
});
```

---

## Security Considerations

1. **SSRF**: Validated at creation AND execution time (defense in depth). The Node.js `validateSsrfUrl` mirrors the Python `_validate_tool_url` at `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` lines 113-143.
2. **Encryption**: Tool headers are encrypted via `encrypt()` from `/home/dev/projects/SmartSpecPro/apps/web/server/services/crypto.ts` before storage. Never returned in API responses.
3. **Tenant isolation**: Every procedure checks `tool.tenantId === ctx.tenantId`. Cross-tenant access is impossible.
4. **Rate limiting**: Uses `createRateLimitMiddleware` from `/home/dev/projects/SmartSpecPro/apps/web/server/_core/rateLimitedProcedure.ts` -- 10/min for create, 20/min for test.
5. **Tool cap**: Hard limit of 50 custom tools per tenant (interview decision: small scale, 5-10 tenants).
6. **Test endpoint**: Timeout of 10s, response truncated to 10KB to prevent abuse.

---

## Integration Notes

- The `agencyTools` table schema changes (new columns: `inputSchema`, `outputSchema`, `httpMethod`, `headersEncrypted`, `retryPolicy`, `icon`, `category`, `version`, `isExposedAsApi`, `strictSchema`, `oneCallAtATime`, `isEnabled`, `updatedAt`) must be applied by section-01-database-migration before this section can run.
- The Python ToolBridge extension reads custom tool configs that are passed from the Node.js layer via the agency bridge HTTP call (existing pattern in `agencyBridge.ts`). The Node.js side decrypts headers before sending them to Python in the bridge payload.
- Section-03 (frontend) will consume `listCustomTools` and `createCustomTool` from this section.
- Section-04 (OpenAPI import) will reuse the `customToolInputSchema` Zod type and the `createCustomTool` insertion logic (refactored into a shared helper if needed).
- The feature flag `AGENCY_CUSTOM_TOOLS_ENABLED` (section-23) will guard these procedures once integrated. For now, they use the existing `assertAgencyEnabled()` gate.
# Section 04 — Node.js Scope & IDOR Fixes

## Section ID
`section-04-nodejs-scope-idor`

## Dependencies
- None (Wave 1 — parallel with sections 01-03)

## Overview

Fixes 2 CRITICAL + 4 HIGH vulnerabilities in `mcpPublicServer.ts` and `agencyMcpService.ts`: missing proxy auth token on agency.tools.call (M07), session users bypass all scope checks (M08), IDOR on agency.tools.call without tenant verification (M10), silent fallthrough returning raw args for unimplemented tools (M11), session fixation after API key revocation (M09), assistant impersonation in orchestrator tools (M12), SSRF using sync validator instead of async (SEC-C2), and tool name injection (M23).

## Files to Modify

| File | Path | Fixes |
|------|------|-------|
| mcpPublicServer.ts | `apps/web/server/_core/mcpPublicServer.ts` | M07, M08, M09, M10, M11, M12 |
| agencyMcpService.ts | `apps/web/server/services/agencyMcpService.ts` | SEC-C2, M23 |
| requireScopes.ts | `apps/web/server/middleware/requireScopes.ts` | M08 |

## Test File to Modify

`apps/web/server/_core/__tests__/mcpPublicServer.test.ts`

---

## TDD Specification

```
# Test: agency.tools.call includes x-proxy-token header (M07)
  - Mock fetch to capture headers
  - Call smartspec.agency.tools.call
  - Assert x-proxy-token header present in fetch call

# Test: session users subject to scope checks (M08)
  - Create session with mode="session", scopes=["mcp:read"]
  - Call a tool requiring mcp:write scope
  - Assert 403/scope error returned

# Test: session with revoked API key rejected (M09)
  - Create session with apiKeyId=123
  - Mark apiKeyId=123 as revoked in DB/cache
  - Call loadSession with that session's Mcp-Session-Id
  - Assert session rejected or re-auth required

# Test: agency.tools.call verifies tenant ownership (M10)
  - Create session for tenant A
  - Call agency.tools.call with agency_id belonging to tenant B
  - Assert error returned, not proxied to Python

# Test: unimplemented tools return error, not raw args (M11)
  - Call smartspec.files.read (unimplemented tool)
  - Assert JSON-RPC error -32601 "Tool not implemented"
  - Assert response does not contain the input args

# Test: actor_assistant_id verified against session user (M12)
  - Create session for user 1
  - Call orchestrator tool with actor_assistant_id belonging to user 2
  - Assert error returned

# Test: agencyMcpService uses assertPublicIp not validateSsrfUrl (SEC-C2)
  - Call validateMcpServerUrl with a domain that resolves to private IP
  - Assert blocked (async DNS resolution catches it)

# Test: tool names reject dots and slashes (M23)
  - formatToolsAsMcp with agencyId="foo.bar"
  - Assert error or sanitized name without dots

# Test: malformed JSON from MCP server returns structured error, not 500 (M24)
  - Mock fetch to return "not-json-{broken"
  - Assert JSON-RPC error returned (not SyntaxError)
  - Assert client receives structured error without stack trace

# Test: JSON-RPC error message does not reflect input method name (M28)
  - POST body: {id:1, method:"<script>alert(1)</script>", params:{}}
  - Assert error.message does not contain "<script>"
  - Assert error.message is fixed string "Method not found"

# Test: session TTL configurable via MCP_SESSION_TTL_SECONDS (M14)
  - Set MCP_SESSION_TTL_SECONDS=300
  - Create session, inspect Redis TTL
  - Assert TTL ~= 300, not 3600

# Test: session TTL defaults to 900 (not 3600) when env not set (M14)
  - Unset MCP_SESSION_TTL_SECONDS
  - Assert default TTL is 900
```

---

## Implementation Guidance

### mcpPublicServer.ts

#### M07: Add proxy token to agency.tools.call
```typescript
const resp = await fetch(`${PYTHON_BACKEND_URL}/api/internal/agency/tool/execute`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-proxy-token": process.env.SMARTSPEC_PROXY_TOKEN || "",
  },
  body: JSON.stringify(payload),
});
```

#### M08: Enforce scopes for session users
In `requireScopes.ts`, remove the `mode === "session"` and `mode === "bearer"` bypass:
```typescript
// BEFORE: if (mode === "session" || mode === "bearer") return next();
// AFTER: All modes must have required scopes
if (!requiredScopes.every(s => userScopes.includes(s))) {
  return res.status(403).json({ error: "Insufficient scopes" });
}
```

#### M10: Verify agency tenant ownership
```typescript
// Before proxying to Python:
const agency = await db.select().from(agencies)
  .where(and(eq(agencies.id, agencyId), eq(agencies.tenantId, session.tenantId)))
  .limit(1);
if (!agency.length) {
  return jsonRpcError(id, -32602, "Agency not found or access denied");
}
```

#### M11: Remove fallthrough, throw error
```typescript
// BEFORE: return { message: `Tool ${toolName} executed successfully`, args };
// AFTER:
throw { code: -32601, message: "Tool not implemented" };
```

### agencyMcpService.ts

#### SEC-C2: Use async SSRF validation
```typescript
import { assertPublicIp } from "./ssrfValidation";

export async function validateMcpServerUrl(url: string): Promise<void> {
  // ... existing scheme/format checks
  await assertPublicIp(new URL(url).hostname);
}
```

#### M23: Validate tool name components
```typescript
const SAFE_ID_RE = /^[a-zA-Z0-9_-]+$/;
if (!SAFE_ID_RE.test(t.agencyId) || !SAFE_ID_RE.test(t.toolId)) {
  throw new Error(`Invalid characters in tool name component`);
}
```

### Security Considerations

1. **Scope bypass**: Session users getting implicit full scope access means any logged-in user can call all 28 MCP tools including media generation and agency invocation — effectively privilege escalation.
2. **IDOR**: Without tenant verification on `agency.tools.call`, an attacker with a valid API key in tenant A can execute tools on agencies belonging to any tenant.
3. **Args leakage**: The fallthrough `return {message, args}` exposes caller-supplied arguments as the tool "result" — an information disclosure that becomes dangerous as real tool implementations are added.

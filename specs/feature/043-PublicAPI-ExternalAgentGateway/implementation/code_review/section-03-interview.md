# Section 03 Code Review Interview

## Auto-fixes Applied

### Fix 1: Non-null assertion on apiKeyId
- **Issue**: `authCtx.apiKeyId!` could silently propagate undefined
- **Fix**: Changed to `authCtx.apiKeyId ?? ""` with empty string fallback
- **Status**: Applied

### Fix 2: Inline require('crypto') replaced with top-level import
- **Issue**: CommonJS require inside function body, inconsistent with ESM style
- **Fix**: Added `import crypto from "crypto"` at top, removed inline require
- **Status**: Applied

## Let Go (acceptable as-is)

- **#3-4 agencyStreamProxy/mcpRoutes**: API key users use /v1/* routes, not legacy proxies. Follow-up.
- **#5 req.auth type narrowing**: Correct — upstream sets only ok:true results
- **#6 Unknown auth modes**: Upstream auth already validates ok:true
- **#9-11 Integration/edge tests**: Deferred to section 04 where middleware chain is complete
- **#12 Bearer full access**: Matches existing codebase pattern for trusted internal tokens
- **#13 Unrelated flags**: From prior branch, not this section's changes
- **#14 Weaker type**: Intentional — keeps tokens.ts decoupled from publicApiTypes
- **#15 No tenantId in JWT claims**: Not needed by current Python backend consumers

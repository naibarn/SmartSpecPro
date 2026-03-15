# Section 02 Code Review Interview

## Auto-fixes Applied

### Fix 1: getKeyUsageStats missing tenantId guard (SECURITY)
- **Issue**: WHERE clause filtered only on apiKeyId, not tenantId — cross-tenant data leak
- **Fix**: Added `eq(publicApiAuditLog.tenantId, tenantId)` to both queries
- **Status**: Applied

### Fix 2: Missing test for inactive key rejection
- **Issue**: No test verifying validateKey rejects inactive keys (isActive=false)
- **Fix**: Added test case "rejects inactive key"
- **Status**: Applied

## Let Go (acceptable as-is)

- **#1 Startup integration**: Belongs in section 03, not section 02
- **#2 _computeKeyHash export**: Standard test helper pattern with underscore convention
- **#3 rowCount**: Drizzle pg driver returns rowCount, confirmed by working mock tests
- **#5 Fire-and-forget**: Drizzle executes eagerly, .catch() handles rejections
- **#6-9 Test coverage**: Key gaps addressed (#10), others are minor for this section
- **#11-14 Minor**: Style/doc observations, no action needed

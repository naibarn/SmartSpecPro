# Code Review: section-05-trpc-router

## HIGH SEVERITY

### H1: `getImportStatus` missing `error` field — schema gap from Section 01
`presentationConversionRecords` has no `error` column. The spec required it be added in Section 01 but it wasn't. Without it the frontend cannot surface failure reasons. This needs a schema column added.

### H2: `cancelImport` DB UPDATE missing `tenantId` filter — IDOR privilege escalation
The SELECT correctly uses `and(eq(id), eq(tenantId))` but the UPDATE only filters by `id`. A user in Tenant A can cancel Tenant B's job by knowing the conversionId. Must add `eq(tenantId, tenantId)` to the WHERE clause of the update.

### H3: Google OAuth check uses synthesized user JWT — token confusion risk
`signBearerToken({ sub: userId, type: 'access' }, '5m')` creates a token indistinguishable from a real user session token (same secret, same claims). The correct approach is to use the gateway token + `?user_id=` param, consistent with other internal service calls. However, the `/api/oauth/google/drive/status` endpoint uses `get_current_user` which doesn't accept gateway tokens. Need to either add an internal endpoint or use the correct pattern.

## MEDIUM SEVERITY

### M2: OAuth check URL path deviation — calls `/api/oauth/google/drive/status` not `/api/v1/oauth/...`
The plan specified `/api/v1/oauth/google/status?user_id={userId}`. The implementation uses `/api/oauth/google/drive/status`. This is actually the CORRECT path (verified by reading the Python router prefix). Plan was wrong; implementation is right.

### M3: `sourceLibraryItemId` not validated for tenant ownership
A user can reference a library item from another tenant for PPTX imports. Should validate ownership.

### M6: Gateway token defaults to `""` — silent unauthenticated calls in dev
`process.env.SMARTSPEC_WEB_GATEWAY_TOKEN ?? ""` sends `Bearer ` (empty) when unset.

## LOW SEVERITY

### L1: Double `resolvePresentationTenantId` call (minor)
### L2: `title` input field silently discarded
### L4: Feature flag not checked in `getImportStatus`/`cancelImport`

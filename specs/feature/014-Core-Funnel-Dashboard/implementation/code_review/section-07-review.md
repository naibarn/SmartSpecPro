# Section 07 Code Review: Security, RBAC, Tenant Scope, and Privacy Controls

## Summary

The implementation demonstrates strong security fundamentals with RBAC enforcement, tenant scoping, fallback auditing, and property sanitization. However, **CRITICAL GAPS exist in export controls** that violate the specification's privacy requirements. The `rawEvents` endpoint exposes per-user data without elevated authorization checks, and no rate limiting is applied to export endpoints.

---

## Security Findings

### HIGH SEVERITY

**1. Missing Elevated Authorization for Per-User Export (rawEvents)**
- **File**: `apps/web/server/routers/funnelAnalytics.ts:372-420`
- **Issue**: The `rawEvents` endpoint returns individual user event records with `userId` field, but uses basic `domainAdminProcedure` without any elevated authorization check.
- **Spec Requirement**: "Enforce aggregate-first export defaults; require elevated context for per-user detail exports" (Implementation Task #4)
- **Impact**: Domain admins can export individual user activity without additional authorization, violating privacy minimization principle.
- **Evidence**: Lines 392-398 return `userId`, `eventName`, `eventTime`, `properties` per event. This is per-user data, not aggregate.
- **Required Fix**: Either (a) require `admin` role only (not `domain_admin`), or (b) add an explicit elevated authorization mechanism (e.g., require explicit opt-in flag that triggers additional audit logging).

**2. No Rate Limiting on Export Endpoints**
- **File**: `apps/web/server/routers/funnelAnalytics.ts:423` (export procedure)
- **Issue**: Export endpoint uses `domainAdminProcedure` which has NO rate limiting, unlike `rateLimitedAdminProcedure` used elsewhere.
- **Spec Requirement**: "Add export-specific limits (rate, size, burst)" (Implementation Task #5)
- **Impact**: Malicious or compromised admin account can execute unlimited export requests, enabling data exfiltration at scale.
- **Evidence**: Compare to infrastructure operations which use `rateLimitedAdminProcedure` for sensitive operations.
- **Required Fix**: Create `rateLimitedDomainAdminProcedure` or apply rate limiting middleware to export endpoints specifically.

**3. rawEvents Missing from Export Audit Tags**
- **File**: `apps/web/server/routers/funnelAnalytics.ts:372-420`
- **Issue**: `rawEvents` endpoint has NO audit logging despite returning per-user data.
- **Spec Requirement**: "Explicit elevated-export audit tags" (Implementation Task #5)
- **Impact**: No visibility into who is accessing individual user event data and when.
- **Required Fix**: Add `auditLogger.log()` with `eventType: "funnel_raw_events_query"` before returning results, including userId, dateRange, eventName filter, and rowCount.

### MEDIUM SEVERITY

**4. Export Row Limit Applied Post-Query (Performance Risk)**
- **File**: `apps/web/server/routers/funnelAnalytics.ts:443-457`
- **Issue**: Query fetches ALL matching rows, then slices to `MAX_EXPORT_ROWS` in-memory. For large datasets (e.g., 100K rows), this loads unnecessary data into memory.
- **Impact**: Denial-of-service risk if attacker requests exports for wide date ranges with millions of rows.
- **Recommendation**: Apply `.limit(MAX_EXPORT_ROWS)` to the Drizzle query builder BEFORE execution.

**5. Missing Test Coverage for Export Limits**
- **File**: `apps/web/server/routers/funnelAnalytics.test.ts`
- **Issue**: Test only checks `MAX_EXPORT_ROWS` is defined (line 272-276), but does NOT verify that export actually truncates at that limit.
- **Spec Requirement**: "Test: export limits enforce size/rate thresholds" (TDD Test Stub)
- **Required Fix**: Add integration test that creates >5000 events, calls export, and verifies `wasTruncated: true` and `rowCount === 5000`.

**6. Fallback Audit Only Fires When emitAudit=true**
- **File**: `apps/web/server/routers/funnelAnalytics.ts:92-98`
- **Issue**: Fallback audit depends on caller passing `emitAudit: true`. If a new procedure forgets this flag, fallback goes silent.
- **Spec Requirement**: "Keep fallback logic explicit and observable; no silent scope fallback" (Risk Control)
- **Recommendation**: Remove the `emitAudit` flag and ALWAYS log fallback unconditionally. Audit logs are cheap; visibility is critical.

### LOW SEVERITY

**7. DISALLOWED_PROPERTY_KEYS Uses Set (Good), But No Documentation**
- **File**: `apps/web/server/routers/funnelAnalytics.ts:17-33`
- **Observation**: Good use of Set for O(1) lookup, but the list is hardcoded with no reference to privacy policy or compliance requirements.
- **Recommendation**: Add JSDoc comment linking to GDPR/privacy policy rationale, and document how to update this list if new sensitive fields are identified.

---

## Completeness Check

### ✅ IMPLEMENTED
1. ✅ RBAC enforcement on all funnel procedures (domainAdminProcedure)
2. ✅ Centralized scope resolution with tenant-primary logic (buildScopeFilter)
3. ✅ Fallback audit telemetry (funnel_scope_fallback event)
4. ✅ Property sanitization (sanitizeEventProperties, DISALLOWED_PROPERTY_KEYS)
5. ✅ Export audit logging (funnel_export event with metadata)
6. ✅ Export row limit (MAX_EXPORT_ROWS = 5000)
7. ✅ CSRF/origin validation (existing middleware)

### ❌ MISSING or INCOMPLETE
1. ❌ Elevated authorization for per-user exports (rawEvents has no elevated check)
2. ❌ Export-specific rate limiting (no rate limit on export or rawEvents)
3. ❌ rawEvents audit logging (no visibility into per-user data access)
4. ⚠️ Export limit test coverage (test exists but doesn't verify actual truncation)
5. ⚠️ Aggregate-first defaults (spec says "aggregate-first", but rawEvents is per-user with no friction)

---

## Code Quality Observations

### Positive
- Excellent separation of concerns: scope logic, sanitization, and caching are isolated functions.
- Strong TypeScript typing with Zod input validation.
- Consistent error handling with TRPCError.
- Good use of `Promise.all` for parallel DB queries (rawEvents lines 390-409).
- CSV escaping function exists (escapeCsvField) for export safety.

### Issues
- **Inconsistent procedure usage**: Why does `export` use `domainAdminProcedure` but infrastructure ops use `rateLimitedAdminProcedure`? Security-critical operations should have consistent rate limiting.
- **No JSDoc on security-critical functions**: `sanitizeEventProperties` and `buildScopeFilter` lack documentation explaining their security role.
- **Magic numbers**: `MAX_EXPORT_ROWS = 5000` has no justification comment. Why 5000? Based on what privacy/performance analysis?

---

## Recommendations (Prioritized)

### P0 (MUST FIX - Security Blockers)
1. **Add elevated authorization for rawEvents endpoint**
   - Option A: Change to `adminProcedure` (only global admins)
   - Option B: Add explicit `includeUserData: boolean` flag that requires admin role when true
   - Add audit log with `elevated: true` tag when per-user data is accessed

2. **Apply rate limiting to export and rawEvents endpoints**
   - Create `rateLimitedDomainAdminProcedure` (similar to rateLimitedAdminProcedure)
   - Apply to both `export` and `rawEvents` procedures
   - Suggested limits: 10 requests/minute for exports, 20 requests/minute for rawEvents

3. **Add audit logging to rawEvents endpoint**
   - Log before returning data (like export does)
   - Include: userId, dateRange, eventName filter, rowCount, scope

### P1 (High Priority - Correctness)
4. **Move export limit to SQL query**
   - Change to apply `.limit(MAX_EXPORT_ROWS)` in Drizzle query
   - Remove in-memory slice (prevents OOM on large datasets)

5. **Add integration test for export truncation**
   - Seed >5000 events, call export, verify `wasTruncated: true`

6. **Make fallback audit unconditional**
   - Remove `emitAudit` flag from buildScopeFilter
   - Always log when fallback occurs (too important to be optional)

### P2 (Nice to Have - Maintainability)
7. **Add JSDoc to security functions**
   - Document privacy rationale for `DISALLOWED_PROPERTY_KEYS`
   - Explain tenant-primary vs domain-fallback logic in `buildScopeFilter`

8. **Document export limits**
   - Add comment explaining why MAX_EXPORT_ROWS = 5000
   - Reference privacy policy or legal requirement if applicable

---

## Test Coverage Gap Summary

**Existing Tests:**
- ✅ RBAC rejection for unauthorized roles
- ✅ Authorized access for admin/domain_admin
- ✅ Tenant scope isolation
- ✅ Property sanitization logic
- ✅ Fallback detection

**Missing Tests:**
- ❌ Export row limit enforcement (only checks constant is defined, not behavior)
- ❌ Rate limiting on export endpoints (no test for TOO_MANY_REQUESTS)
- ❌ rawEvents audit logging (no test verifying audit event emitted)
- ❌ Cross-tenant isolation validation (no test proving domain_admin can't see other tenants)
- ❌ Elevated authorization for per-user data (spec requires but not implemented or tested)

---

## Final Verdict

**REQUIRES FIXES - Critical security gaps must be addressed.**

The implementation is 70% complete with solid foundations (RBAC, scoping, sanitization), but the missing export controls create **HIGH-RISK privacy exposure**. The `rawEvents` endpoint is essentially a per-user data export API with no elevated authorization, no rate limiting, and no audit trail - this violates the spec's privacy-first design.

**Deployment Risk**: If deployed as-is, a compromised domain_admin account could silently export all user activity data without detection. This is a GDPR/privacy compliance failure.

**Estimated Fix Effort**: 2-4 hours to add rate limiting, elevated auth check, and audit logging. Another 1-2 hours for comprehensive tests.

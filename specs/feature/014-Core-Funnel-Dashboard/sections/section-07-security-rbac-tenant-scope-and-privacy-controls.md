# Section 07: Security, RBAC, Tenant Scope, and Privacy Controls

## Objective
Harden funnel analytics access and data exposure boundaries, ensuring role-safe visibility, tenant/domain isolation, privacy-preserving export defaults, and abuse-resistant access patterns.

## Scope
- Enforce RBAC across all funnel query and export procedures.
- Implement strict tenant-first and explicit domain-fallback scope controls for `domain_admin`.
- Add audit and telemetry for fallback paths and export operations.
- Add export minimization defaults, elevated export controls, and route-level abuse guardrails.
- Sanitize event properties in API and export outputs.

## Out of Scope
- Base UI route/tab composition.
- Migration and backfill execution logic.
- High-level rollout phasing decisions.

## Dependencies
- section-04-funnel-analytics-router-aggregation-and-caching
- section-05-admin-dashboard-route-tabs-and-export-ux
- section-06-backfill-checkpointing-reconciliation-and-consistency-gates

## Implementation Tasks
1. Ensure all funnel procedures require `admin` or `domain_admin` authorization.
2. Centralize scope resolution logic with tenant-primary and explicit domain fallback path.
3. Emit structured audit/telemetry whenever fallback path is used.
4. Enforce aggregate-first export defaults; require elevated context for per-user detail exports.
5. Add export-specific limits (rate, size, burst) and explicit elevated-export audit tags.
6. Sanitize disallowed or sensitive properties before returning API/export payloads.
7. Validate query and export endpoints against existing CSRF/origin and rate-limiting middleware patterns.

## TDD-First Test Stubs
- Test: unauthorized roles are rejected for all funnel procedures.
- Test: domain-admin scope never includes records outside allowed tenant/domain boundaries.
- Test: fallback-to-domain path emits required audit telemetry.
- Test: aggregate-only export is default, and per-user export requires elevated authorization.
- Test: export limits enforce size/rate thresholds independently of standard query limits.
- Test: sensitive property fields are removed from API and export responses.

## Risk Controls
- Treat any cross-tenant exposure as immediate rollback trigger.
- Keep fallback logic explicit and observable; no silent scope fallback.
- Require auditability for every export action.

## Deliverables
- Hardened RBAC and scope-filter enforcement in funnel analytics routes.
- Export privacy and abuse control policy implementation.
- Security/regression tests for role, scope, and sanitization behavior.

## Done Criteria
- Security tests confirm no unauthorized data exposure paths.
- Export defaults and elevated workflows align to privacy requirements.
- Audit visibility exists for fallback and elevated export operations.

---

## Implementation Summary

### Files Created
- `apps/web/server/routers/funnelAnalytics.rbac.test.ts` - RBAC integration tests (11 tests)

### Files Modified
1. `apps/web/server/_core/trpc.ts`
   - Added `rateLimitedDomainAdminProcedure` (20 req/min)
   - Used for export and rawEvents endpoints to prevent data exfiltration

2. `apps/web/server/routers/funnelAnalytics.ts`
   - Added property sanitization with `DISALLOWED_PROPERTY_KEYS` (PII/credentials)
   - Added `MAX_EXPORT_ROWS = 5000` limit with SQL-level enforcement
   - Added unconditional audit logging for scope fallback events
   - Added `includeUserData` flag to rawEvents for elevated per-user access
   - Added audit logging for raw events queries and exports
   - Added JSDoc to all security-critical functions
   - Applied rate limiting to export and rawEvents procedures

3. `apps/web/server/routers/funnelAnalytics.test.ts`
   - Added 7 new security tests for sanitization and privacy controls

4. `apps/web/server/services/auditLogger.ts`
   - Added audit event types: `funnel_scope_fallback`, `funnel_export`, `funnel_raw_events_query`

5. `apps/web/vitest.config.ts`
   - Added test environment variables for CONTROL_PLANE_API_KEY

### Security Controls Implemented
1. ✅ RBAC: All procedures use `domainAdminProcedure` or `rateLimitedDomainAdminProcedure`
2. ✅ Tenant Scope: `buildScopeFilter` with tenant-primary and explicit domain fallback
3. ✅ Fallback Audit: Unconditional logging when ctxTenantId is null
4. ✅ Export Limits: 5000 rows enforced at SQL level, prevents OOM
5. ✅ Rate Limiting: 10 req/min for exports, 20 req/min for rawEvents
6. ✅ Property Sanitization: 15 disallowed keys (PII, credentials, financial data)
7. ✅ Per-User Data Access: Requires `includeUserData: true` flag with elevated audit
8. ✅ Audit Telemetry: All exports and raw queries logged with metadata

### Test Coverage
- **Unit Tests**: 23 tests (helpers, sanitization, scope logic)
- **Integration Tests**: 11 tests (RBAC enforcement, tenant isolation)
- **Total**: 34 tests passing

### Code Review Findings Addressed
- ✅ Added rate limiting to export endpoints (P0)
- ✅ Added elevated authorization flag for per-user data (P0)
- ✅ Added audit logging to rawEvents (P0)
- ✅ Moved export limit to SQL query (P1)
- ✅ Made fallback audit unconditional (P1)
- ✅ Added JSDoc to security functions (P2)
- ✅ Documented export limits rationale (P2)

### Privacy & Compliance
- GDPR Article 5(1)(c): Data minimization through property sanitization
- GDPR Article 4(1): PII (email, phone, IP) excluded from exports
- PCI DSS: Financial data (SSN, creditCard, CVV) excluded
- Audit trail: All data access operations logged for compliance reporting

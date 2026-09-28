# Research findings

## Research decision

- Codebase research: required because SmartSpecPro is an existing git repository with a live Node/React/Drizzle runtime.
- Web research: required for the cross-origin OAuth handoff and security constraints; no provider-specific implementation is selected.
- Testing: the web package uses Vitest for unit/component tests, Playwright for browser tests, and separate database-integration commands. Existing Feature 186 scripts and migrations provide the control-plane verification pattern.
- SocratiCode: unavailable in this session; findings below use targeted shell search and line-range inspection as the fallback.

## Codebase architecture and existing contracts

### Schema and Feature 186 foundation

- `apps/web/drizzle/schema.ts` already contains `users.currentTenantId` as a varchar foreign key to `tenants.id`, while `users.registeredDomain` is a separate historical registration field.
- `tenants` has `primaryDomain`, additional `domains` JSON, `isActive`, and branding fields; it does not require a tenant to own a domain.
- `mediaAssets` is tenant/user-owned and stores managed storage keys, MIME type, checksum, and optional project/conversation/message links.
- Feature 186 migrations `0303_feature_186_unified_job_control_plane.sql` through `0315_feature_186_callback_timestamp.sql` already add target lifecycle values, definition/retry/lease fields, event sequence/idempotency, attempts, dispatches, outbox, schedule occurrences, settlements, callback evidence, safety fields, runtime support, admission indexes, and timeout policy. The plan should extend these tables only for transfer coordination and should not create a parallel generic jobs table.
- `worker_job_events` already has `eventSequence`, `eventIdempotencyKey`, and `attemptId`; transfer cancellation must use the existing guarded control-plane event/state machinery and preserve the ledger.
- `worker_job_attempts`, `worker_job_dispatches`, `worker_job_outbox`, and `worker_job_settlements` exist in the schema/migration foundation. A transfer operation should be a canonical `worker_jobs` row with a registered executor/handler and transfer-item companion rows, not an independent job status source.

### Tenant resolution and authorization risk surface

- `apps/web/server/_core/tenant.ts` resolves an active public tenant from the hostname and uses the first active tenant for localhost/private development. This is appropriate for branding/public context but cannot be the source of authenticated ownership.
- `apps/web/server/_core/context.ts` exposes middleware-derived `tenantId` in tRPC context.
- `apps/web/server/services/tenantContext.ts` currently prefers request tenant context before `user.currentTenantId` in `resolveTenantIdVarchar`. The implementation plan must split public branding resolution from authenticated data authorization and update protected paths to use the database user's current tenant as the authority.
- `apps/web/server/_core/index.ts` contains at least one route where `validatedBody.tenantId` can precede middleware/user tenant resolution. This is a direct tenant-override candidate and must be removed or restricted to explicit system-admin operations.
- `apps/web/server/routers/tenant.ts` has multiple `domain_admin` checks comparing `user.registeredDomain` to `req.tenant.primaryDomain`; these checks need a current-tenant equality guard and a deliberate distinction between public host tenant and authenticated workspace.
- Media and production routers use `resolveTenantIdVarchar` broadly. The plan must inventory and migrate protected reads/writes in waves, with fail-closed behavior when the user has no usable tenant.

### Signup, OAuth, and sessions

- `apps/web/server/services/inviteCodeService.ts` currently treats an invalid supplied invite as ignorable in open registration mode. The new contract requires any supplied invalid/expired invite to reject registration, regardless of registration mode.
- Invite validation currently allows a tenant-bound code for the supplied tenant or a global code. Signup needs a separate binding-resolution function so a valid tenant-bound invite takes precedence over host matching, while a global invite authorizes only.
- `apps/web/server/routers.ts` contains password login, registration, OAuth exchange, and current-user projection paths. Several paths currently copy host-derived values into `registeredDomain` and may assign `currentTenantId` from request context; all new-user paths must call one server-side tenant-admission policy.
- `apps/web/server/_core/oauth.ts` also resolves tenant from request host and creates sessions. OAuth account creation must use the same admission policy and must not let a host override an already-bound account.
- `apps/web/server/_core/sdk.ts` signs JWT-like session cookies with a `jti`, verifies them, and resolves the user from the database. Existing JTI revocation support is present in logout/device flows; account tenant moves should use a centralized session/token revocation hook rather than attempting to mutate every existing token.
- `apps/web/client/src/contexts/TenantContext.tsx` handles host branding and currently needs a separate authenticated workspace projection. `AuthContext.tsx`, `DashboardLayout.tsx`, and `Dashboard.tsx` are the likely UI surfaces for showing current workspace distinct from branding.

### Existing admin and transfer-adjacent surfaces

- `apps/web/client/src/pages/AdminUsers.tsx` already manages users, roles, credits, and domain display through `trpc.users.update`; a system-admin tenant move should be a distinct guarded action with an explicit warning and no reuse of generic credit/role update semantics.
- `apps/web/server/routers/adminTenants.ts` enforces the system admin role for tenant administration. The tenant-move endpoint should use this elevated boundary and an audit record.
- No existing tenant data-transfer service/route was found in the targeted search. The plan must introduce a dedicated service/router/UI surface, with resource handlers registered explicitly.
- Existing storage/media paths use tenant and user ownership checks and managed storage references. Transfer handlers must preserve storage-key ownership checks and avoid copying signed URLs or credentials.

### Testing and verification conventions

- `apps/web/package.json` provides `npm test` through Vitest, `npm run test:db-integration` for selected integration tests, `npm run check`/`typecheck`, and Playwright browser commands.
- Existing server tests use Vitest mocks and chainable DB mocks; schema tests and integration tests are already separated.
- Existing Feature 186 scripts include `audit-feature-186-call-sites.ts`, `backfill-unified-job-control-plane.ts`, and `verify-feature-186.ts`; transfer verification should extend the same evidence style rather than introduce an unrelated test harness.
- Browser tests use focused page/component tests plus Playwright for end-to-end flows. The transfer UI requires browser evidence for preview, approval, conflict display, paused-on-error state, and the resume action.

## Web research

### OAuth cross-origin handoff

- RFC 9700 (OAuth 2.0 Security BCP, January 2025): authorization-code flows should use PKCE; PKCE challenges/verifiers and OIDC nonce values must be transaction-specific and bound to the client/user agent; redirect URIs require exact matching; open redirects must not be allowed. Source: https://www.rfc-editor.org/rfc/rfc9700.html
- RFC 7636 defines the PKCE code-challenge mechanism used to bind authorization-code redemption to the initiating client. Source: https://www.rfc-editor.org/rfc/rfc7636.html
- OWASP Session Management guidance supports server-side session invalidation for revocation-sensitive operations. Source: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

Applied to this feature: use a one-time, short-lived, single-use handoff code; bind it to a stored state/nonce and PKCE verifier; exact-allowlist return origins; prevent arbitrary redirect targets; consume the code atomically; create a local session only after validating the handoff and current user state; revoke existing sessions/tokens after a system-admin tenant move.

## Research limitations

- No production database, external identity provider configuration, or Cloudflare account was inspected. The plan must keep deployment/provider validation as an explicit later gate.
- Resource-handler completeness cannot be inferred from table names alone. Phase 0 must produce a handler registry and an explicit unsupported-resource report before allowing a transfer to complete.

# Section 02 — Tenant admission, authentication, and cross-root SSO

## Scope

Make signup and login use one server-side tenant-admission policy. Keep public hostname branding separate from authenticated account tenant. Add a provider-neutral one-time handoff for cross-root login only when the existing identity provider can satisfy its security contract.

## Files and boundaries

- `apps/web/server/services/tenantAdmission.ts`: trusted normalized host/invite/mode/default input and deterministic binding result.
- `apps/web/server/services/tenantContext.ts`: public branding resolver versus authenticated account resolver.
- `apps/web/server/services/inviteCodeService.ts`: supplied-invalid invite is always rejected; tenant-bound/global semantics remain explicit.
- `apps/web/server/routers.ts` and `apps/web/server/_core/oauth.ts`: password/OAuth registration and login call the same admission and account-tenant resolver.
- Existing SDK/session/revocation paths: use current JTI/token invalidation boundary; never expose secrets.

## Admission contract

Apply in order: valid tenant-bound invite binds its tenant; valid global invite authorizes only; exact active primary/additional host match; configured Default tenant. Reject supplied invalid, inactive, expired, or exhausted invite in open and invite-only modes. An existing account's `currentTenantId` always wins at login, even on a different host. New OAuth users created upstream are admitted or held for explicit onboarding, never silently rebound from host.

## Cross-root handoff

Use a short-lived single-use code bound to source session/user, destination origin, browser state, PKCE `S256` challenge, and OIDC nonce where applicable. Allow only exact server-configured origins. Atomically consume the code, validate verifier/state/nonce/user/tenant, then create a destination-local session. Fail closed for replay, expiry, wrong origin, verifier/nonce/state mismatch, disabled user, missing tenant, and open-redirect attempts. Do not put tokens/passwords/verifiers in URLs or logs. Follow RFC 9700 and RFC 7636; retain a rollout flag if provider capability is not proven.

## Tests before implementation

- Invite/host/default precedence, global invite authorization, mismatched host, and all invalid-supplied-invite cases.
- Password/OAuth parity, existing account cross-domain login, disabled/missing tenant, and upstream OAuth admission.
- Public branding versus authenticated account resolver and fail-closed missing tenant.
- SSO origin allowlist, PKCE/state/nonce binding, downgrade, replay/expiry/atomic consumption, and successful local session.
- Session revocation behavior used by later System Admin move.

## Exit criteria

No signup or login path assigns an existing user's tenant from hostname. The server returns stable account-tenant data and separates it from branding data for section 03/07.

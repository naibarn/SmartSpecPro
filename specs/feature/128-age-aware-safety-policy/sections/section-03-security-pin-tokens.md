# section-03-security-pin-tokens

## Goal

Generalize the existing Private Vault PIN behavior into a reusable protected-surface PIN and temporary unlock token system. The system must support editing DOB/country, private chat, adult override where policy allows it, and future high-safety surfaces.

## Depends On

- `section-01-policy-foundation`
- `section-02-data-profile-service`

## Files In Scope

- Existing Private Vault PIN code in `apps/web/server/routers/users.ts`.
- Existing Private Vault service code such as `apps/web/server/services/privateVaultService.ts`.
- Client token helper near `apps/web/client/src/lib/privateVault.ts` or a new shared protected-surface helper.
- tRPC context extraction in `apps/web/server/_core/context.ts`.
- tRPC header injection in `apps/web/client/src/main.tsx`.
- Express CORS allow-header configuration where `x-private-vault-token` is currently allowed.
- Auth logout cleanup in `apps/web/client/src/services/authService.ts`.
- Focused service/router/client helper tests.

## Test First

Add tests for:

- PIN creation, verification, change, disable, and lockout/rate-limit behavior.
- Backward compatibility for Private Vault users with existing PIN hashes.
- Token issuance with explicit scope, policy version, actor id, expires-at, and local-day boundary.
- Token invalidation on logout, password/session invalidation if supported, and policy version changes.
- Token invalidation on tenant switch, DOB/country profile version changes, jurisdiction preset version changes, enforcement-mode changes, and admin revocation.
- Temporary adult unlock is never issued for users who are not allowed by policy or whose profile is incomplete.
- Protected surface checks fail closed when token is malformed, expired, wrong scope, wrong actor, wrong tenant/domain, or from yesterday.
- `x-protected-surface-token` is extracted separately from `x-private-vault-token` in tRPC and non-tRPC routes.
- Private Vault tokens never satisfy protected-surface scopes unless a dedicated compatible scope was issued.

## Implementation Requirements

- Keep PIN hashing server-side using the existing secure hashing strategy if one already exists.
- Introduce protected surface scopes such as `profile:birthdate:update`, `private-chat:access`, `age-policy:temporary-adult`, `generated-asset:restricted-view`.
- Use a separate protected-surface token header and context field. Do not overload `privateVaultToken`.
- Token lifetime must end at the earliest of configured TTL, logout/session invalidation, policy version change, or local-day rollover.
- Token validation must compare normalized tenant ids through the same canonical tenant normalization used by policy decisions and audit.
- Do not store PIN codes in client storage. Store only opaque protected-surface unlock tokens if the current architecture already stores session-adjacent tokens client-side.
- Include audit events for PIN setup, successful unlock, failed unlock, lockout, token revoke, and policy override use.
- Ensure unknown profile cannot use PIN to bypass the required profile-completion gate.

## Integration Notes

- Private Vault should move onto this abstraction with minimal behavior change.
- Later chat/media enforcement should check protected-surface token scope through a single server helper.
- Frontend logout must clear all protected-surface tokens in addition to auth tokens.

## Verification

- `cd apps/web && pnpm test -- privateVault`
- `cd apps/web && pnpm test -- protectedSurface`
- `cd apps/web && pnpm check`

## Handoff

Expose server helpers:

- `verifySecurityPin`
- `issueProtectedSurfaceToken`
- `validateProtectedSurfaceToken`
- `revokeProtectedSurfaceTokens`
- `requireProtectedSurfaceUnlock`

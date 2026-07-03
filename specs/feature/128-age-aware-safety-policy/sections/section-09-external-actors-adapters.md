# section-09-external-actors-adapters

## Goal

Resolve age-safety context for non-standard actors: public APIs, API keys, embedded widgets, MCP/tools, delegated workers, scheduled jobs, and system agents. The system must fail closed when a human viewer or creator cannot be identified.

## Depends On

- `section-01-policy-foundation`
- `section-02-data-profile-service`
- `section-04-admin-policy-audit-flags`

## Files In Scope

- API key/public API middleware such as `apps/web/server/middleware/requireScopes.ts`.
- Widget/embed entry points.
- MCP/tool execution adapters such as `apps/web/server/_core/mcpPublicServer.ts` and registry/session helpers.
- Background job actor context helpers.
- Tests for actor/audience context resolution.

## Test First

Add tests for:

- Authenticated human requests use the user's completed safety profile.
- API key calls require an explicit tenant policy and permitted audience level.
- Public API routes construct actor context from `req.auth`, `userId`, `ownerUserId`, `tenantId`, scopes, and auth mode.
- API, MCP, worker, and other non-browser clients receive structured `safety_profile_required` or `country_profile_invalid` errors with missing fields and next allowed route.
- Public/widget visitors default to unknown/child-safe unless a verified viewer context exists.
- Delegated workers cannot upgrade policy beyond the initiating user/job context.
- MCP delegated-worker sessions inherit `ownerUserId`, worker/job, delegated-session, tenant, and scope profile metadata.
- Scheduled/system jobs can process metadata but cannot expose restricted output to unknown viewers.
- Missing actor context blocks high-risk chat/media operations.

## Implementation Requirements

- Introduce a canonical `SafetyActorContext` builder used by routers and jobs.
- Include actor kind, tenant/domain, initiating user id when present, audience policy, profile completion status, protected token scopes, and source route.
- Include MCP/public API fields where present: `authMode`, `apiKeyId`, `ownerUserId`, `workerId`, `workerJobId`, `delegatedSessionId`, `runtimeType`, `scopeProfile`, and `teamId`.
- Normalize tenant ids once at actor-context boundaries and fail closed on mismatched tenant, owner, delegated session, or job context.
- Never trust client-provided age band, DOB, or country. Only accept server-derived profile or verified signed envelope.
- For public API, expose policy-safe error codes and documentation-compatible response shapes.
- For widgets/public links, define how country is inferred or requested. If uncertain, use global child-safe fallback.

## Integration Notes

- Chat/media sections should call the actor context builder before policy evaluation.
- Section 12 rollout tests should include API/widget/system job cases.

## Verification

- `cd apps/web && pnpm test -- safetyActorContext`
- `cd apps/web && pnpm test -- api`
- `cd apps/web && pnpm check`

## Handoff

Every protected route should have a documented way to construct `SafetyActorContext`, including routes that do not map cleanly to a logged-in user.

# Section 03: HTTP Platform Route Enforcement

## Goal

Allow delegated worker sessions to use real SmartSpecPro `/v1/*` routes safely and consistently.

## Why this section exists

The product gets real value only when the worker can use the platform surfaces that already exist today. This section connects delegated worker sessions to those surfaces while preserving route-level authorization.

## Scope

1. Update route-level auth so delegated-worker callers are scope-checked and grant-checked.
2. Enable first-phase delegated access to real HTTP routes:
   - LLM gateway
   - skills
   - agencies
   - media
   - presentations
   - video projects
   - jobs
   - owner-library and owner-RAG read/search/ingest routes where the platform already has real HTTP support
3. Prevent delegated-worker callers from reaching admin, billing, auth-management, settings, and unrelated account surfaces.
4. Preserve truthful behavior where routes still require additional ownership or feature checks.
5. Publish a machine-readable discovery path so workers can tell what HTTP functionality is actually available.

## Suggested files

- `apps/web/server/middleware/requireScopes.ts`
- `apps/web/server/_core/authz.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/routes/publicSkillsApi.ts`
- `apps/web/server/routes/publicAgencyApi.ts`
- `apps/web/server/routes/publicMediaApi.ts`
- `apps/web/server/routes/publicPresentationsApi.ts`
- `apps/web/server/routes/publicVideoApi.ts`
- `apps/web/server/routes/publicJobsApi.ts`
- library or RAG public HTTP route files where applicable
- public docs or OpenAPI publishing files where applicable

## Route enforcement model

Each delegated-worker request should pass all of the following checks:

1. delegated-worker token is valid and unrevoked
2. required route scopes are present
3. matching resource grant exists
4. tenant and team ownership still match
5. delegated budget is still available
6. feature flag or route policy still allows the action
7. requested provider or model selection is allowed by delegated policy where the route supports caller-controlled models
8. owner-library or owner-RAG access stays inside owner-bound grants and ingestion policy where relevant

## First-phase expectations

- HTTP is the primary execution plane for high-value worker actions.
- Media generation should use the real HTTP routes rather than placeholder MCP bridges.
- Route-specific ownership rules must stay intact. A delegated worker should not bypass the same safety checks a proper public API call would face.
- Workers should be able to learn available HTTP functions through OpenAPI or an equivalent machine-readable contract plus a delegated capability manifest.

## Denylist expectations

Delegated-worker callers must not be allowed to use:

- tenant settings routes
- API key management routes
- billing admin routes
- feature-flag admin routes
- user or device management routes
- unrelated admin monitoring mutation routes

## Design rules

- Do not solve this by granting delegated workers implicit full `bearer` access.
- Prefer reusable helpers for grant lookup and worker-origin metadata extraction.
- Keep route behavior service-accurate: the worker is using the real route, not a second fake worker-only variant of the product.
- Do not allow worker-supplied prompts or tool output to widen route permissions, target ownership, or provider/model policy.
- Do not make workers infer owner-library, owner-RAG, or upload abilities from guesswork alone when a delegated manifest can state them explicitly.

## Testing first

- route tests for delegated-worker access on each first-phase `/v1/*` surface
- regression tests for existing API-key and browser-session flows
- tests that delegated-worker tokens are denied on admin or account-management routes
- ownership tests that reject unrelated tenant resources even with valid scopes
- allowlist tests for routes that accept provider or model selection
- library/RAG ownership and grant tests
- discovery-contract tests for OpenAPI or delegated-manifest truthfulness

## Handoff to later sections

- Section 04 layers billing and budget propagation into these routes.
- Section 05 reuses the same worker-origin context for result publication.
- Section 08 documents which surfaces are real and production-ready.

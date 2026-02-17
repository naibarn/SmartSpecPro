# Research Notes

## Codebase Recon

### 1) Current Architecture and Module Boundaries
- Monorepo structure uses `apps/web` for React + tRPC + Express and Drizzle PostgreSQL schema.
- Backend routing is centralized in `apps/web/server/routers.ts` (`appRouter`), with feature routers under `apps/web/server/routers/`.
- Client routes are defined in `apps/web/client/src/App.tsx`.
- Admin menu/navigation entries are centralized in `packages/shared/src/constants/menu.ts` and consumed by dashboard menu rendering.

### 2) Existing Funnel-Adjacent Surfaces
- Existing analytics/admin surfaces:
  - `apps/web/server/routers/adminOps.ts` (ops metrics)
  - `apps/web/server/routers/usage.ts` (user + admin usage analytics)
  - `apps/web/server/routers/audit.ts` (audit/cost search)
- Existing menu already includes `admin-funnel` (`/admin/funnel`) in `packages/shared/src/constants/menu.ts`, but:
  - No routed page at `/admin/funnel` in `apps/web/client/src/App.tsx`.
  - No existing funnel page/component files found in `apps/web/client/src`.
- `apps/web/client/src/pages/AdminAnalytics.tsx` exists, but route wiring for it is not present in `App.tsx`.

### 3) Integration Touchpoints for Event Emission
- Registration/trust signals:
  - `registration_events` is written via `logRegistrationEvent()` in `apps/web/server/services/trustScoring.ts`.
  - OAuth registration flow (`apps/web/server/_core/oauth.ts`) calls trust evaluation + registration logging.
  - Email/password registration flow in `apps/web/server/routers.ts` creates users and verification tokens, but does not currently log `registration_events` in the same pattern.
- Email verification:
  - `apps/web/server/routers.ts` writes/consumes `email_verification_tokens` in multiple auth procedures (`register`, `verifyEmail`, resend/reset flows).
- Login/activation:
  - `apps/web/server/_core/sdk.ts` updates `users.lastSignedIn` during authenticated request handling (`authenticateRequest`), not strictly only on explicit login event boundaries.
- LLM usage:
  - `provider_usage_log` inserts happen in `apps/web/server/services/costTracker.ts` (`logRequest`), called from `apps/web/server/services/llmRouter.ts`.
- Revenue:
  - `credit_transactions` inserts happen in `apps/web/server/services/creditService.ts` via `addCredits`, `deductCredits`, `deductCreditsForModel`, and `giveSignupBonus`.
- Media/engagement audit:
  - `api_audit_events` is heavily queried by routers, but no direct insert path was found in `apps/web/server` during recon (likely external writer path or missing ingestion in this codepath).
- Analytics providers:
  - PostHog server capture helper exists (`apps/web/server/services/posthog.ts`) and client captures are in login/signup pages.
  - GA4 configuration keys/status exist in infrastructure router/UI, but no GA4 event sender service currently exists in `apps/web/server/services`.

### 4) Database Dependencies and Migration Risks
- Relevant tables already present: `users`, `registration_events`, `email_verification_tokens`, `conversations`, `messages`, `provider_usage_log`, `api_audit_events`, `credit_transactions`, `video_editor_projects`, `workflows`, `workflow_executions`, `library_items`, `user_credit_budgets`, `media_callback_events`.
- New table required by spec (`funnel_events`) is not present in current Drizzle schema.
- Performance/index gaps vs spec requirements:
  - No explicit indexes currently defined for:
    - `users(createdAt)`, `users(lastSignedIn)`, `users(plan)`
    - `registration_events(createdAt)`, `registration_events(outcome, createdAt)`
    - `conversations(userId, createdAt)`
    - `messages(conversationId, createdAt)`
  - Existing relevant indexes do exist for:
    - `provider_usage_log(userId, createdAt)` and `(providerId, createdAt)`
    - `api_audit_events(traceId)` and `(userId, createdAt)` and `(eventType, createdAt)`
    - `credit_transactions(idempotencyKey)` unique partial index
- Multi-tenant schema nuance/risk:
  - `tenants.id` is varchar, while `users.currentTenantId` is stored as integer with compatibility casts/fallback logic via `apps/web/server/services/tenantContext.ts`.
  - Tenant ID normalization is mixed numeric/string across flows and is a known compatibility boundary.
- Existing migrations currently include up to `0025` in `apps/web/drizzle/meta/_journal.json`; adding new funnel migration should avoid collisions with in-flight local migration state.

### 5) Tests and Coverage in Impacted Paths
- No existing `funnelAnalytics`, `funnelTracker`, or GA4 service tests (files do not exist yet).
- Existing test style is mostly unit/mock-driven for many routers/services; some suites are TODO-style stubs.
- Useful adjacent test anchors:
  - `apps/web/server/schema.test.ts`
  - `apps/web/server/routers/__tests__/adminOps.test.ts`
  - `apps/web/server/services/__tests__/posthogEvents.test.ts`
  - `apps/web/server/services/costTracker.test.ts`
- Coverage gap risk for this feature is high unless new router/service/query logic gets focused unit + integration tests.

### 6) Tenant Attribution, Permissions, and Security Controls
- Procedure guards:
  - `adminProcedure` enforces `role === 'admin'`.
  - `domainAdminProcedure` allows `admin` or `domain_admin`.
- Tenant context:
  - Request tenant is populated by domain-based middleware in `apps/web/server/_core/tenant.ts` and passed into tRPC context in `apps/web/server/_core/context.ts`.
- Current domain-admin filtering patterns are inconsistent across features:
  - Some flows filter by `users.registeredDomain` (not tenant ID).
  - Some router/service flows use resolved tenant IDs.
- CSRF and origin validation are globally enforced for `/trpc` and `/api` state-changing methods in `apps/web/server/_core/index.ts`.
- Rate limiting middleware exists (`apps/web/server/_core/rateLimitedProcedure.ts`) and can be reused for funnel-specific limits.

### 7) Recon Risks (Explicit)
- Potential data-loss/destructive behavior (if implemented per spec):
  - Retention cleanup (`DELETE` older funnel events) is destructive and needs operational safeguards.
- Query/migration operational risk:
  - Large index creation without careful migration strategy may create lock pressure on hot tables.
- Data consistency risk:
  - Backfill scripts can duplicate derived events unless idempotency constraints/dedup keys are designed.
- Metric definition risk:
  - Using `lastSignedIn` as login proxy can be noisy because it is updated in authenticated request handling, not only explicit login success.

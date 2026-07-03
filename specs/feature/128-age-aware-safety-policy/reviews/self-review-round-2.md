# Self Review Round 2: Plan Completeness Against Spec And Codebase

Review date: 2026-07-01

## Result

Pass after targeted plan updates. The plan now aligns better with the detailed spec acceptance criteria and current SmartSpecPro code boundaries.

## Review Method

- Compared `claude-plan.md`, `claude-plan-tdd.md`, and section files against `spec.md` acceptance criteria.
- Used SocratiCode codebase search/status before targeted shell reads.
- Verified current integration points:
  - `apps/web/shared/featureFlags.ts`
  - `apps/web/server/_core/context.ts`
  - `apps/web/client/src/main.tsx`
  - `apps/web/server/routers/systemSettings.ts`
  - `apps/web/server/services/llmRoutesHandler.ts`
  - `apps/web/server/middleware/requireScopes.ts`
  - `apps/web/server/_core/mcpPublicServer.ts`
- Re-ran deep-plan section checker after edits.

## Gaps Found And Fixed

- Protected-surface token extraction was not explicit enough. Added `x-protected-surface-token` separation from `x-private-vault-token`, tRPC context extraction, client header injection, CORS header, and logout cleanup requirements.
- Tenant feature flags needed codebase-specific placement. Added requirements for `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`.
- System settings storage needed stronger guardrails. Added explicit generic `systemSettings.updateSetting` rejection/ignore requirement for active age policy unless routed through `adminSafety`.
- Chat enforcement needed current active handler coverage. Added `llmRoutesHandler.ts`, routed SSE behavior, OpenAI-compatible/Responses paths, and shared enforcer expectations.
- External actor plan needed concrete current-auth shapes. Added `requireScopes`, `req.auth`, MCP `authMode`, `ownerUserId`, worker/job/delegated-session, and widget-system account rules.
- Consent/retention readiness was present in the spec but under-emphasized in implementation sections. Added test and implementation requirements before age-tiered child/teen access.

## Verification

Command:

```bash
uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir "specs/feature/128-age-aware-safety-policy"
```

Result: complete, 12/12, no manifest warnings.

## Residual Notes

The plan remains implementation-ready for adult-only/observe foundation. Legal/product approval is still required before enabling real child/teen product access, consent flows, or country-specific age-tiered service behavior in production.

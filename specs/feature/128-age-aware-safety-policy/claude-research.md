# Deep-Plan Research: Age-Aware Safety Policy

Research date: 2026-07-01

## Research Decision

- Codebase research: yes. This is an existing monorepo with React/Vite frontend, Express/tRPC backend, Drizzle schema, Python FastAPI/media services, public API, MCP, worker, and widget paths.
- Web research: yes. The spec references age-aware safety, child privacy, legal jurisdiction presets, LLM/media moderation, and provider safety. Research was limited to official or primary sources where possible.
- Testing research: yes. The repo uses Vitest for `apps/web` and pytest for `python-backend`.

## Codebase Findings

### Auth And Route Guard

- `apps/web/client/src/App.tsx` has route-level guards `RequireAuth`, `RequireAdmin`, and `RequireDomainAdmin`.
- `RequireAuth` currently redirects unauthenticated users to `/login` and otherwise renders children. This is the right UI extension point for a `RequireCompletedSafetyProfile` guard.
- Server-side enforcement must still be separate because tRPC, Express, public API, MCP, worker, widget, and Python paths do not rely on React routing.

### User Profile And Private Vault PIN

- `apps/web/server/routers/users.ts` already contains Private Vault PIN routes and schemas:
  - `privateVaultPinSchema`
  - `setPrivateVaultPin`
  - `unlockPrivateVault`
- `apps/web/server/services/privateVaultService.ts` normalizes `userPreferences.privateVault`, hashes PINs with bcrypt, issues `private_vault` tokens, and validates token type/scope.
- Existing Private Vault contract:
  - token type: `private_vault`
  - header: `x-private-vault-token`
  - client storage: `smartspec.privateVault.accessToken`
  - scope includes tenant id and `pinVersion`
- Age unlock must use a separate `protected_surface` token path so Private Vault access is not accidentally broadened.

### Feature Flags And Rollout

- `apps/web/shared/featureFlags.ts` defines `TenantFeatureFlags`, allowlists, and defaults. Most prior feature specs add tenant-scoped flags here.
- `apps/web/server/services/tenantFeatureFlagService.ts` syncs selected flags into Redis-backed guards. New age-safety flags should follow the same allowlist/default/test pattern.
- Existing planning sections for features 029 and 049 show accepted patterns: add flags to shared contract, add defaults, add UI labels, and test allowlist/default coverage.

### Chat And Streaming

- `apps/web/server/_core/llmRoutes.ts` includes `proxyChatWithCredits()` for JSON and streaming chat and tracks timing/credits/message-save behavior.
- Current Chat UI uses `/api/llm/stream`, so age policy cannot be limited to tRPC chat procedures.
- Python also has `python-backend/app/api/llm_v1.py` and `python-backend/app/services/streaming_service.py` streaming paths. If exposed, they need equivalent policy envelope or internal-only service auth.
- Streaming output requires special handling because unsafe partial tokens can leak before post-filtering.

### Media Generation And Credits

- `apps/web/server/routers/media.ts` has sync and async image/video/audio procedures.
- Async media routes currently run abuse guard and credit reservation around provider dispatch. The age policy gate must run before abuse hash storage and before credit reservation for blocked requests.
- Existing code includes post-completion credit reconciliation and refund behavior. The age policy implementation can reuse the credit release/refund pattern for jobs cancelled by policy changes.

### Settings, i18n, And UI

- `apps/web/client/src/pages/Settings.tsx` already owns profile/security/private-vault UX surfaces.
- Settings copy uses `apps/web/client/src/locales/*/settings.json` and generated locale sources under `apps/web/client/src/lib/i18n/locales/*`.
- New safety profile, DOB, country, PIN lockout, legal mode, and completion-gate copy must be localized in English and Thai.

### System Settings, Menu, Audit

- `apps/web/server/routers/systemSettings.ts` validates setting categories. The spec notes `"safety"` is not yet present.
- `packages/shared/src/constants/menu.ts` handles menu visibility by role/platform/features. Age menu projection should be UX-only; backend route/action enforcement is the boundary.
- `apps/web/server/services/auditLogger.ts` should be extended with explicit age-safety event helpers instead of ad hoc logs.

### Non-Human Actors

- The repo uses widget system users, public API auth/scopes, MCP sessions, delegated workers, and internal system agents.
- These actors should not receive fake DOB records. Age policy should resolve human owner, declared audience, tenant widget default, or fail-closed default for user-visible content.

## External / Official Research

### COPPA / United States

Official FTC guidance states that when an operator determines a user is under 13, COPPA notice and parental consent obligations can be triggered. The eCFR COPPA Rule describes verifiable parental consent requirements before collection, use, or disclosure of personal information from children.

Sources:
- FTC COPPA FAQ: https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions
- eCFR 16 CFR Part 312: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312

Planning implication: the implementation must default to adult-only service mode unless legal/product explicitly enables minor access, and guardian consent must be durable and auditable before child/teen service mode is enabled.

### GDPR Article 8 / EU And EEA

GDPR Article 8 sets conditions for child consent in relation to information society services. It uses 16 as the default age when consent is the legal basis and allows member states to set a lower age, not below 13.

Source:
- EUR-Lex GDPR text: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX%3A02016R0679-20160504

Planning implication: EU/EEA country presets must be data-driven, versioned, source-linked, and reviewed by legal. Do not hard-code route logic per country.

### UK Children's Code

The UK ICO Children's Code applies age-appropriate design principles and includes 15 standards for services likely to be accessed by children.

Sources:
- ICO Age appropriate design code: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/
- ICO Children's Code resources: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/

Planning implication: if UK/under-18 access is enabled later, privacy-by-default, data minimization, child-friendly UX, and age-appropriate defaults should be part of legal/product launch gates.

### OpenAI Moderation And Safety

OpenAI's official moderation guidance says moderation models can classify harmful content in text and images and can be used to filter, route for review, or intervene. Safety best-practices guidance recommends moderation and human oversight.

Sources:
- OpenAI Moderation guide: https://developers.openai.com/api/docs/guides/moderation
- OpenAI Safety best practices: https://developers.openai.com/api/docs/guides/safety-best-practices
- OpenAI moderation model docs: https://developers.openai.com/api/docs/models/omni-moderation-latest

Planning implication: use moderation/classification as an enforcement input, but SmartSpecPro's backend policy remains the authority. Do not outsource policy correctness to provider refusal alone.

## Testing Findings

### Web

- `apps/web/package.json` scripts:
  - `pnpm check` / `pnpm typecheck`: TypeScript no-emit check.
  - `pnpm test`: Vitest.
- Test locations include:
  - `apps/web/server/**/*.test.ts`
  - `apps/web/server/routers/**/*.test.ts`
  - client/page/component tests under `apps/web/client/src/**`.

### Python

- `python-backend` uses pytest with tests under `python-backend/tests`.
- Existing test files cover API, media job worker sandbox, internal token auth, browser policy, LLM OpenAI-compatible audit throttling, and related services.

## Architecture Recommendations From Research

1. Introduce a central `AgeSafetyPolicyService` and `AgePolicyEnforcer`; do not embed policy conditionals in each route.
2. Use a dedicated `adminSafety` router/service for policy writes and audit; do not allow generic system settings mutation to overwrite policy.
3. Preserve Private Vault token behavior and add a separate `protected_surface` token.
4. Add a server-side safety profile completion status endpoint and a client route guard; backend enforcement remains authoritative.
5. Gate Chat and Media first at shared backend boundaries:
   - `/api/llm/stream`
   - tRPC chat/skill execution
   - `apps/web/server/routers/media.ts`
   - public API/MCP/widget/worker adapters
6. Revalidate async jobs at dispatch/retry/callback/final-delivery boundaries.
7. Store redacted safety metadata on generated assets so viewer-time policy can govern preview/download/share/reference reuse.
8. Add observe-first rollout, kill switch, metrics, alerts, and manual review before blocking broad production traffic.

# Section 09: Observability, Security Review, E2E, and Rollout Gates

## Goal

Finish release readiness: metrics, structured logs, retention scheduling, security/privacy validation, E2E browser evidence, rollout/rollback checks, and final spec/plan consistency review.

## Depends On

- Sections 05 through 08.

## Files

Create or modify as needed:

- observability helpers used by MCP services;
- E2E Playwright spec for MCP Connect flows;
- `apps/web/tests/e2e/fixtures/mcpConnectFixtures.ts` or equivalent deterministic fixture setup;
- release gate docs/evidence under `<planning_dir>/implementation/release-evidence.md`;
- UI browser evidence under `<planning_dir>/implementation/ui-browser-evidence.md` or section-local evidence linked from release evidence;
- retention job registration after service tests pass.

## Observability

Metrics must include provider, transport, asset type, and `originSurface` labels for:

- connection success/reauth;
- generation success/failure/latency;
- provider 429/errors;
- schema changes;
- shared usage/policy denies;
- fallback count;
- provider credit exhausted.

Structured logs must include redacted:

- provider;
- transport;
- origin surface;
- connection;
- owner/actor/group;
- tool/schema hash;
- asset type;
- job/provider job IDs;
- attempt count;
- error class;
- latency;
- credit policy.

Structured logs must not include raw prompts, raw reference URLs, raw provider responses, OAuth/session references, or provider account identifiers. Use request hashes, safe account labels, and redacted error codes.

## Security Gates

Run focused security checks for:

- no secrets in API responses/logs/UI state;
- cross-tenant connection denial;
- direct connection ID bypass denial;
- prompt/tool injection cannot modify protected fields;
- SSRF validation before provider call;
- OAuth replay/mismatch denial;
- fallback cannot silently change credit source.

## E2E Release Gates

Add/extend Playwright coverage for:

- Settings/Profile connect -> connected -> reconnect/disconnect state;
- owner shares to group -> group member sees shared connection -> owner sees usage;
- admin force-disable sharing -> group member no longer sees connection;
- Media Studio Gateway API unchanged;
- Media Studio MCP personal connection generation;
- Media Studio MCP shared connection generation;
- Auto Storyboard Review MCP batch with connection failure/fallback;
- Marketplace Capture product-context labels remain separate from product sharing;
- Storyboard Review selected tasks MCP regenerate and fallback confirmation.

E2E must use deterministic fixtures by default. Do not require live Magnific/Higgsfield credentials in CI. If sandbox/live-provider checks are performed manually, record them separately in release evidence.

## UI/UX Contract

### Target User / JTBD

- Role: release owner validating MCP Connect UI workflows.
- Goal: confirm final UI states are usable, accessible, and responsive before rollout.
- Entry point: Settings, Media Studio, Marketplace Capture Product Detail, Storyboard Review.
- Success outcome: browser evidence proves no major usability regression.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Settings | Settings integrations route | final connect/share/usage evidence |
| Media Studio | Media Studio route | final transport picker/generation evidence |
| Marketplace Capture | Product detail route | final product-context transport evidence |
| Storyboard Review | Review route | final selected-task/fallback evidence |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| E2E release spec | Playwright test file | workflow evidence | implemented UI routes |
| UI evidence artifact | implementation evidence doc | viewport/check results | screenshots/traces/manual notes |

### State Matrix

Verify loading, empty, connected, expired, denied, fallback, disabled, and success states across implemented surfaces.

### Responsive Matrix

Verify mobile 390x844, tablet 768x1024, desktop 1440x900, plus small-mobile/laptop for dense surfaces.

### Accessibility Acceptance

Keyboard path, focus visibility, accessible names, readable contrast, and non-color-only state communication must pass or be documented as blocked.

### Copy Contract

Confirm required labels from prior UI sections are consistent and localized where existing surfaces support Thai/English.

### Browser Evidence Required

Record screenshots/traces and commands in the implementation evidence artifact.

## UI Browser Evidence

Record evidence for mobile 390x844, tablet 768x1024, desktop 1440x900. Add small-mobile/laptop where dense labels are risky.

Evidence must include:

- no new console errors;
- primary keyboard path;
- no overlap/overflow;
- loading/empty/error/disabled states;
- accessible labels;
- dark/light readability if the surface supports both.

## Release Evidence Artifact

Create or update `<planning_dir>/implementation/release-evidence.md` with:

- command matrix executed, pass/fail result, and date;
- whether provider calls used mocks, provider sandbox accounts, or live accounts;
- rollout flags tested and rollback result;
- E2E screenshots/traces links;
- known release blockers and explicit release recommendation;
- confirmation that `MediaTaskTransportMetadata` appears consistently in status/history/usage evidence.

## Rollout Verification

Test flag behavior:

- global flag disables all new MCP UI/server paths;
- provider flag disables only that provider;
- surface flags revert affected surface to Gateway API;
- group sharing flag blocks shared use while owner connections remain;
- running jobs keep normal terminal behavior after flags turn off.

V1 admin/ops verification uses existing Admin Settings/provider config and Tenant Settings/feature-flag UI surfaces. Do not require env-file edits for MCP provider setup or tenant rollout.

## Recovery Verification

Verify async recovery behavior:

- task with provider job ID resumes polling after restart/retry trigger;
- task without provider job ID retries only within the same local idempotency scope;
- duplicate `tools/call` is prevented after provider job ID is known;
- unrecoverable status becomes safe `provider_status_unknown`;
- terminal recovery releases shared concurrency reservations and does not double-count budgets.

## Final Review Checklist

- `gateway_api` remains default.
- Non-v1 surfaces omit transport.
- Public APIs do not expose MCP transport.
- Owner/group/actor identity appears in audit events.
- Shared video owner approval is enforced.
- Retention is idempotent and scheduled only after tests.
- Browser evidence captured or skipped with blockers.
- Release evidence artifact is complete and links to UI evidence.

## Tests First

- Test: metrics/log redaction.
- Test: feature flag rollback behavior.
- Test: retention job idempotency before scheduling.
- Test: MCP job recovery/idempotency behavior.
- Test: E2E flow fixtures for Settings, Media Studio, Marketplace Capture, Storyboard Review.
- Test: security/privacy failure cases.

Test file targets:

- `apps/web/tests/e2e/mcp-connect-media.spec.ts`
- `apps/web/tests/e2e/fixtures/mcpConnectFixtures.ts`
- any section-specific security tests introduced in Sections 02-04

Minimum command matrix:

| Scope | Command |
|---|---|
| Typecheck | `cd apps/web && npm run check` |
| Full focused MCP unit/integration suite | `cd apps/web && npm test -- server/services/__tests__/mcpProviderRegistry.test.ts server/services/__tests__/mcpFeatureFlags.test.ts server/routers/__tests__/mcpConnections.test.ts server/services/__tests__/mcpConnectionService.test.ts server/services/__tests__/mcpOAuthBroker.test.ts server/services/__tests__/mcpToolSchemaCacheService.test.ts server/services/__tests__/mcpConnectionSharingService.test.ts server/services/__tests__/mcpUsageRetentionService.test.ts server/services/__tests__/mediaTransportResolver.test.ts server/services/__tests__/mcpMediaAdapter.test.ts server/routers/__tests__/media.mcpTransport.test.ts shared/__tests__/mcpToolSchemaProjection.test.ts` |
| Settings and UI component suite | `cd apps/web && npm test -- client/src/components/settings/__tests__/McpConnectPanel.test.tsx client/src/pages/__tests__/McpConnectCallback.test.tsx client/src/pages/__tests__/MediaStudio.mcpConnect.test.tsx client/src/pages/__tests__/MarketplaceCaptureProductDetail.mcpConnect.test.tsx client/src/pages/__tests__/StoryboardReviewPage.mcpConnect.test.tsx` |
| Storyboard/marketplace regression | `cd apps/web && npm test -- server/services/__tests__/marketplaceAutoReviewService.test.ts client/src/lib/storyboardReviewWorkspace.test.ts server/routers/__tests__/videoEditorProjects.storyboardReview.test.ts` |
| E2E MCP release gate | `cd apps/web && npx playwright test tests/e2e/mcp-connect-media.spec.ts --project=chromium` |
| Existing Marketplace browser regression when Section 07 changes Product Detail | `cd apps/web && npm run e2e:marketplace-hyperframes` |

## Acceptance Criteria

- Focused unit/integration/security/UI tests pass.
- Typecheck passes.
- E2E evidence is recorded.
- Rollout/rollback docs are complete.
- Deep-plan artifacts remain internally consistent.

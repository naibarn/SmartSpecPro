# Verification and TDD

Add failing tests for behavior before implementation; do not assert only source strings.

- Adapter: API absent, flag off/config failure, register rejection, duplicate mount, unmount before register resolves, cleanup, re-enable, route epoch cancellation and kill-switch refresh.
- Policy: every informational route in route-matrix.md including nested Docs/Help; private/auth/share/device paths, unknown paths, encoded traversal, absolute/protocol-relative URLs and forbidden query keys rejected.
- Public projection: anonymous vs logged-in output parity; tenant A/B fixtures, unpublished records, no raw prompt/private skill fields, no account navigation; network failure does not masquerade as default published data.
- Content: TH/EN and fallback locale, paging/output byte limits, stale cursor, pricing numerical/currency parity, static status labeled honestly, partial search failure and empty result distinction.
- Marketplace/gallery: input bounds and category/type enum, latest query wins, visible filter/detail parity, published/current-tenant/global gallery scope; zero calls to like/comment/install/generate/view/download mutations.
- Contact: missing/invalid fields, valid preparation, FIELD_CONFLICT, preserve omitted fields, manual submit regression, Turnstile required/error states, no honeypot/timing manipulation, no PII in result/logs; tool preparation causes zero submit mutations.
- E2E: native API tool discovery/execution and route transitions; same flows without API; TH/EN desktop 1440x900, tablet 768x1024, mobile 390x844; keyboard/focus and no new overflow. Include response-header checks for `tools` policy and origin isolation, browser IDL input-schema shape, tool-name grammar, per-tab budget/concurrency and kill switch. No paid agent is required: native inspector/manual tool invocation is acceptable.

Proposed focused test locations: client/src/features/public-webmcp/__tests__/, server/services/__tests__/publicWebMcpSearch.test.ts if service added, tests/e2e/public-webmcp.spec.ts. Create these during implementation; they do not exist as a result of this spec.

Commands from repository root after implementation:

```bash
npm --workspace apps/web test -- client/src/features/public-webmcp/__tests__ --environment jsdom
npm --workspace apps/web test -- server/services/__tests__/publicWebMcpSearch.test.ts
npm --workspace apps/web exec -- playwright test tests/e2e/public-webmcp.spec.ts --project=chromium
git diff --check
```

The server test command applies only if that service is introduced. Confirm Playwright project/tooling before invoking. Run required application build in an isolated/resource-approved environment; do not run a deployment build on the shared server as a casual check. Record exact native browser version and enablement; unsupported or unavailable native tooling is SKIPPED/PENDING, never PASS. Tests touching Contact use mocked mail/feedback effects or staging fixtures, never send real messages.

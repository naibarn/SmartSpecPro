# Section 03: Billing, Budget, Idempotency, and Concurrency

## Goal

Make delegated-worker MCP calls as financially and operationally correct as the delegated HTTP path.

## Why this section exists

MCP is not production-ready for delegated workers if it can discover tools but still over-charge, bypass budgets, or duplicate work on retries. This section connects MCP execution to the same guardrails already introduced for delegated HTTP.

## Scope

1. Enforce the owner user’s SmartSpecPro balance as the credit source for SmartSpecPro-routed MCP calls.
2. Preserve downstream source-type attribution where possible.
3. Enforce:
   - delegated job budget envelope
   - worker rolling-window caps
   - action-family or action-class concurrency ceilings
4. Define idempotency rules for:
   - write-capable tools
   - chargeable tools
   - long-running async create tools
5. Ensure duplicate retries do not double-charge or double-create work.
6. Define the canonical business idempotency key contract for MCP `tools/call`.

## Suggested files

- `apps/web/server/services/delegatedWorkerPlatformService.ts`
- `apps/web/server/services/workerBudgetService.ts`
- `apps/web/server/services/workerBillingService.ts`
- `apps/web/server/_core/mcpPublicServer.ts`

## Billing and retry model

The MCP layer should reuse the existing delegated billing and budget services instead of building a second ledger.

Important behavior:

- preflight checks should deny obviously unaffordable calls
- successful downstream calls should reconcile against the real source type
- idempotent retries should return the original operation or state rather than creating a second one
- status tools should never create new work

The business idempotency contract should be explicit for runtime authors. The recommended default is a standardized metadata field such as `params._meta.idempotencyKey`, with deterministic fallback only where the backend can prove it is safe.

## Concurrency model

This section should connect registry metadata and policy to runtime enforcement so high-cost or write-heavy families cannot fan out uncontrollably from one worker job.

## Design rules

- Do not meter external worker-local API calls that stay outside SmartSpecPro billing.
- Do not let MCP bypass worker hourly, five-hour, daily, weekly, or monthly limits.
- Do not let missing idempotency behavior be treated as acceptable for chargeable writes.
- Keep the billing and retry posture consistent with HTTP equivalents wherever possible.
- Do not treat JSON-RPC transport request ids as sufficient business idempotency keys for chargeable writes.

## Testing first

- owner balance attribution tests
- delegated budget-envelope tests
- rolling-window worker budget tests
- concurrency ceiling tests
- idempotency and replay tests for write-capable tools
- duplicate retry non-double-charge tests
- canonical idempotency-key field tests for single and batch requests

## Handoff to later sections

- Sections 04-07 apply these controls family by family.
- Section 08 exposes blocked-by-budget and operator diagnostics in docs and visibility surfaces.

## Implementation notes

- MCP execution now routes through delegated worker execution controls from `apps/web/server/services/delegatedWorkerPlatformService.ts`.
- `apps/web/server/_core/mcpPublicServer.ts` supports Redis-backed MCP idempotency via `params._meta.idempotencyKey`.
- Legacy MCP hardening landed in:
  - `apps/web/server/_core/mcp.ts`
  - `apps/web/server/_core/mcpRoutes.ts`

## Verification

- `npm --prefix apps/web test -- server/_core/__tests__/mcpGatewaySecurityFixes.test.ts server/_core/__tests__/mcpSecurityFixes.test.ts server/_core/__tests__/mcpPublicServerSecurity.test.ts`
- `npm --prefix apps/web run check -- --pretty false`

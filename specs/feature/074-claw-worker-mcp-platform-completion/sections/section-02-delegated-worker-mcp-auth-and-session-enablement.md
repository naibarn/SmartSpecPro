# Section 02: Delegated Worker MCP Auth and Session Enablement

## Goal

Allow delegated personal workers to use `/v1/mcp` safely by reusing the owner-bound delegated session model from Feature 072.

## Why this section exists

Today the public MCP server deliberately fails closed for delegated workers. That is the correct baseline, but it means MCP cannot yet become a real worker surface. This section introduces the explicit MCP auth path that later sections depend on.

## Scope

1. Enable delegated-worker callers for `/v1/mcp`.
2. Require the same owner-bound and same-tenant rules already established for delegated HTTP.
3. Tie MCP session acceptance to:
   - valid delegated session
   - active worker job
   - matching owner user
   - matching tenant
   - live worker/lease posture where applicable
4. Preserve fail-closed denial on:
   - expiry
   - revocation
   - disablement
   - job finalization
   - owner mismatch
   - tenant mismatch
5. Keep non-delegated MCP callers working as they do today.
6. Preserve existing session semantics such as initialize, `Mcp-Session-Id`, missing-session behavior, and `DELETE /v1/mcp`.

## Suggested files

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/services/workerAuthService.ts`
- `apps/web/server/routes/workerRuntime.ts`

## Auth model

Public MCP should treat delegated workers as a first-class auth mode, not as a special case of generic bearer usage.

The MCP auth path should:

- validate delegated session claims
- verify owner user equality
- verify exact tenant equality
- resolve the worker job context
- attach enough context for registry, billing, grants, and audit later in the request pipeline

## Design rules

- Do not let MCP become a shortcut around Feature 072 delegated-session policy.
- Do not treat admin visibility as delegated usage rights.
- Keep personal-worker semantics explicit: self-service, owner-only, no cross-user sharing.
- Fail closed on any ambiguity in owner or tenant binding.
- If kill switches, grants, or feature flags change mid-session, execution should fail closed even before the session object itself expires.

## Testing first

- delegated-worker initialization success tests
- owner mismatch denial tests
- tenant mismatch denial tests
- expiry and revocation denial tests
- regression tests for non-delegated MCP clients
- session termination and missing-session regression tests

## Handoff to later sections

- Section 03 adds budget, idempotency, and concurrency enforcement on top of the auth path.
- Sections 04-07 rely on this session context for real tool execution.

## Implementation notes

- `apps/web/server/_core/mcpPublicServer.ts` now accepts `delegated_worker` auth for MCP initialize.
- MCP sessions now persist delegated ownership and worker-job context fields.
- `getDelegatedWorkerManifestBySessionId()` is used during both `tools/list` and `tools/call` so mid-session revocation or grant changes fail closed.

## Verification

- `npm --prefix apps/web test -- server/_core/__tests__/mcpPublicServer.test.ts server/services/__tests__/workerDelegationService.test.ts server/routes/__tests__/workerRuntime.test.ts`

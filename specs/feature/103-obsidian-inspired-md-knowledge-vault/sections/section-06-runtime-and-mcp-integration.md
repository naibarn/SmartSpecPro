# Section 06: Runtime and MCP Integration

## Objective

Integrate approved Library context packs into the shared runtime context engine and narrow delegated-worker MCP surfaces without changing the default retrieval model.

## Scope

- runtime request extensions
- context-pack runtime adapter
- context-engine slot mapping
- MCP list/resolve tools
- delegated-worker grants
- fail-closed behavior

## Likely Files and Modules

- `apps/web/server/services/contextPackBuilder.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`
- `apps/web/server/services/contextEngineAdapter.ts`
- `apps/web/server/services/libraryContextPackRuntimeAdapter.ts`
- `apps/web/server/_core/mcpRegistry.ts`
- `apps/web/shared/workerDelegation.ts`

## Implementation Guidance

### 1. Extend runtime inputs explicitly

- Add typed Library context-pack references to the shared build request path.
- Avoid hiding Library pack inputs inside untyped dynamic params when a stable contract exists.
- Extend `BuildContextPackRequest` with `libraryContextPacks?: Array<{ ref; required?: boolean; runtimeTierOverride?: ...; maxItems?: number; tokenBudgetHint?: number; includeCitations?: boolean }>`
- Apply these defaults:
  - `required = true`
  - `includeCitations = true`
  - pack policy remains the source of truth when `maxItems` or `tokenBudgetHint` are omitted
- Cap explicit Library pack refs at 5 per request.
- Preserve caller order and deduplicate repeated refs by canonical pack id using `first declaration wins` plus a warning diagnostic.

### 2. Resolve packs before runtime assembly

- A runtime adapter should:
  - resolve the pack through the Library service
  - enforce approval/readability rules
  - map results into `durable_memory` or `retrieved_evidence`
  - carry provenance and citations forward
- Inject resolved Library pack slots before generic dynamic evidence injection rather than flattening them into `knowledgebase` text.

### 3. Preserve strict failure modes

- Required pack failure aborts runtime request creation.
- Optional pack failure records diagnostics and continues without hidden fallback.
- No branch should silently re-query raw notes or graph neighbors if pack resolution fails.

### 4. Add narrow MCP behavior

- Add dedicated list/resolve tools for context packs.
- Delegated workers need explicit grants per pack or per approved namespace.
- Resolving a pack must not grant unrestricted raw-note reads.

## Test-First Checklist

- Test: Library pack refs map into the shared runtime request without bypassing compaction
- Test: runtime tier mapping for trusted vs task-scoped pack intent
- Test: request ordering and duplicate-pack deduplication semantics
- Test: request-level cap of 5 explicit Library context packs
- Test: required pack failure aborts runtime assembly
- Test: optional pack failure surfaces diagnostics only
- Test: MCP list/resolve tools honor pack grants and do not imply blanket `library.get`

## Acceptance Checkpoints

- Approved business-memory packs can be consumed by runtime flows safely and explainably.
- Delegated workers remain least-privilege even when they can resolve packs.
- Default search/RAG behavior remains unchanged unless the caller explicitly asks for pack resolution.

## Implementation Notes

- Extended `BuildContextPackRequest` in `apps/web/server/services/contextPackBuilder.ts` with explicit `libraryContextPacks` inputs instead of hiding pack refs in untyped dynamic params.
- Added runtime resolution of Library context packs through `resolveLibraryContextPack`, mapping approved pack items into structured durable-memory or retrieved-evidence context state with citations.
- Added request-level cap enforcement, canonical pack-id deduplication, required-pack fail-fast behavior, and optional-pack diagnostics.
- Kept runtime behavior navigation-first and explicit: no automatic backlink, graph-neighbor, or raw-note fallback expansion occurs when a pack is resolved.
- Runtime pack resolution now uses fail-closed private-vault state by default, so locked notes are not included unless a future caller provides an explicit unlock-aware path.
- Extended delegated worker grants in `apps/web/shared/workerDelegation.ts` and `apps/web/server/services/workerDelegationService.ts` with `library_context_pack` grants.
- Added dedicated MCP tools in `apps/web/server/_core/mcpRegistry.ts` for listing and resolving context packs, while delegated workers only see the tools when pack grants are present.
- Added focused runtime/MCP tests in `apps/web/server/services/__tests__/contextPackBuilder.test.ts` and verified `apps/web/server/_core/__tests__/mcpPublicServer.test.ts`.
- Remaining hardening: wire an explicit private-vault unlock token through approved runtime callers before any locked-vault pack can be resolved.

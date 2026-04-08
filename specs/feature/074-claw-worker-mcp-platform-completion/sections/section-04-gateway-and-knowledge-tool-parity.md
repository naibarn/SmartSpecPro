# Section 04: Gateway and Knowledge Tool Parity

## Goal

Implement the first high-value real MCP wrappers: gateway models/credits/chat/responses and owner-bound Library/RAG tools.

## Why this section exists

These surfaces have the best mix of backend readiness and worker value. They also prove the core promise of Feature 074: delegated workers can do meaningful work through MCP while preserving the owner’s credit, grants, and knowledge boundaries.

## Scope

1. Implement real gateway MCP tools for:
   - models list
   - credits get
   - chat create
   - responses create
2. Implement real knowledge MCP tools for:
   - Library search
   - Library get
   - Library upload
   - RAG search
   - RAG ingest
3. Reuse current HTTP routes or shared services where they already represent the strongest production truth.
4. Keep knowledge access owner-bound and same-tenant.
5. Reuse the existing publication, scanning, and indexing flows for upload and ingest.

## Suggested files

- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/publicKnowledgeApi.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/_core/responsesRoutes.ts`
- `apps/web/server/routes/publicDocsApi.ts`

## Knowledge rules

Knowledge access through MCP should follow the same principles already established in Feature 072:

- no cross-user Library access
- no cross-user RAG access
- uploads follow allowed file-type and size policy
- ingest reuses the normal indexing and artifact pipeline

## Design rules

- Prefer thin but real wrappers over duplicated business logic.
- Do not expose knowledge tools that still bypass owner-bound enforcement.
- Do not return unsafe inline file payloads when a durable artifact or item reference is more appropriate.
- Keep the MCP result format structured enough for runtimes to consume without guesswork.

## Testing first

- gateway wrapper route tests
- owner-bound knowledge tests
- Library upload and RAG ingest flow tests
- billing/source-type tests for chargeable gateway calls
- discovery tests proving only real gateway and knowledge tools are advertised

## Handoff to later sections

- Section 05 extends the same wrapper pattern to other product families.
- Section 08 documents the runtime discovery story for these first fully-real families.

## Implementation notes

- Real gateway MCP wrappers now exist for models, credits, chat, and responses.
- Real knowledge wrappers now exist for Library search/get/upload and RAG search/ingest.
- Owner-bound grants and delegated-worker model selection policy are enforced before execution.

## Verification

- `npm --prefix apps/web test -- server/routes/__tests__/publicKnowledgeApi.test.ts server/_core/__tests__/mcpPublicServer.test.ts`

# Section 04: Tools, MCP, Provenance, and Lifecycle

## Goal

Treat tools, MCP resources, prompts, and write flows as first-class context sources with explicit trust, provenance, and lifecycle rules.

## Dependencies

- Section 01 shared context contract
- Section 03 context assembly and compaction

## Files to Create or Modify

- Create `apps/web/server/services/contextToolService.ts`
- Create `apps/web/server/services/contextToolProvenanceService.ts`
- Modify tool / MCP bridge services that already expose read, search, or write flows
- Modify `apps/web/server/services/contextEngineAdapter.ts`
- Modify `apps/web/server/services/promptComposer.ts`
- Create `apps/web/server/services/__tests__/contextToolService.test.ts`
- Create `apps/web/server/services/__tests__/contextToolProvenanceService.test.ts`

## TDD First

Write failing tests for:

- search and read results are traceable and bounded
- write results produce durable refs instead of raw prompt bloat
- unsafe tool output is treated as untrusted content
- tool output cannot overwrite system or policy slots
- prompt assets and resource templates remain versioned and scoped
- large tool outputs degrade to references or summaries
- write flows preserve provenance and do not lose the originating request

## Tool Lifecycle Design

Tools and MCP resources must support:

- read flows
- search flows
- write flows
- provenance capture
- trust tagging
- bounded output handling
- promotion or pruning after validation

Raw tool output must not be inserted into the prompt as trusted context by default. The engine must either:

- validate it and promote a bounded summary or artifact ref
- or keep it as untrusted evidence with clear provenance

## Security Requirements

- tool output must remain untrusted until validated
- prompt injection from tool content must not reach policy or system slots
- secrets, credentials, and private URLs must be redacted or excluded
- write flows must never leak raw tokens or provider internals

## Acceptance Criteria

- tool / MCP reads can contribute to context with provenance
- write flows create durable refs instead of noisy raw text
- unsafe tool output is visible as untrusted and cannot silently steer policy

## Recommended Verification

Run:

```bash
npm --prefix apps/web test -- server/services/__tests__/contextToolService.test.ts server/services/__tests__/contextToolProvenanceService.test.ts
npm --prefix apps/web run check
```

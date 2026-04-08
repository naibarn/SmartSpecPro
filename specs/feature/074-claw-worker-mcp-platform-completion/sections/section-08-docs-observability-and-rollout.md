# Section 08: Docs, Observability, and Rollout

## Goal

Make the completed MCP surface understandable, observable, and safe to roll out without overstating parity.

## Why this section exists

Feature 074 changes product truth. Once delegated-worker MCP is enabled, runtimes and operators need clear documentation about what is actually supported, how discovery works, how kill switches behave, and why a tool may be hidden or denied.

## Scope

1. Update public docs so HTTP, delegated manifests, static MCP catalog, and authenticated `tools/list` are described consistently.
2. Add operator-facing visibility for:
   - discovery and execution audit events
   - denial reasons
   - budget or policy block reasons
   - family-level rollout flags
3. Define rollout sequencing and kill-switch posture.
4. Ensure regression coverage proves the platform is truthful and safe.

## Suggested files

- `apps/web/server/routes/publicDocsApi.ts`
- help docs under `apps/web/docs/help`
- monitoring or admin visibility surfaces where MCP status is shown
- feature-flag definitions and rollout docs

## Documentation expectations

Docs should explain:

- `/v1/mcp` is canonical
- HTTP remains the strongest contract where parity differs
- the static MCP catalog is for developer understanding
- the delegated manifest is job-scoped truth
- authenticated `tools/list` is the final session-specific truth
- prompts, resources, and browser MCP remain gated or absent until explicitly implemented
- session-level discovery may still fail closed at execution time if a kill switch, grant, or feature flag changes after discovery
- completion reporting for long-running MCP-triggered work still uses the existing worker callback posture

## Observability expectations

Operators should be able to see:

- what tool families are enabled
- which tools were hidden or denied and why
- who executed which delegated MCP action
- what it cost
- which kill switch or approval gate blocked it when applicable
- when protocol-level capabilities intentionally remain absent, such as prompts/resources or list-change notifications

## Design rules

- Do not let docs imply parity that the registry does not support.
- Keep rollout fail-closed for high-risk families.
- Keep help content understandable for runtime authors and operators, not only backend implementers.

## Testing first

- public docs truthfulness tests
- manifest versus catalog versus `tools/list` consistency tests
- audit and denial visibility tests
- kill-switch behavior tests
- regression tests proving unrelated HTTP worker flows still work when delegated MCP is disabled
- protocol-regression tests proving discovery and docs do not overclaim prompts/resources/list-changed support

## Handoff

This is the final rollout and truthfulness section. Once it is done, the implementation package should be safe to hand to `/deep-implement`.

## Implementation notes

- Public docs now describe:
  - `/v1/mcp` as the canonical MCP endpoint
  - `/v1/mcp/catalog` as the static machine-readable catalog
  - delegated manifest as job-scoped truth
  - delegated worker MCP as grant-aware rather than fully disabled
- Help content was updated in both English and Thai.
- Feature 072 release-note messaging was corrected so rollout docs no longer claim delegated worker MCP is fully closed.

## Verification

- `npm --prefix apps/web test -- server/routes/__tests__/publicDocsApi.test.ts server/_core/__tests__/mcpPublicServer.test.ts`

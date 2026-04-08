# Section 01: Canonical Registry and Discovery Foundation

## Goal

Create the single source of truth for public MCP tool availability so discovery, execution, and docs stop drifting apart.

## Why this section exists

Feature 074 only succeeds if SmartSpecPro stops advertising tools that are not truly executable. The current backend already has a broad public MCP registry plus a legacy MCP implementation, but the truth is split between definitions, placeholder branches, and old routes. This section establishes the registry and discovery model that every later section will build on.

## Scope

1. Introduce a canonical MCP registry abstraction that describes each supported tool and family.
2. Make the registry expressive enough to encode:
   - required scopes
   - required grant type
   - delegated-worker eligibility
   - execution mode
   - feature-flag dependency
   - owner-resource dependency
   - billing behavior
   - result safety class
   - idempotency mode
   - async companion relationships
   - availability reason
3. Make `tools/list` derive from that registry rather than ad hoc branching.
4. Define the static machine-readable MCP catalog for developer understanding.
5. Define how the delegated manifest references MCP families and tool availability.
6. Preserve the existing public MCP protocol contract while changing execution truth.

## Suggested files

- `apps/web/server/_core/mcpPublicServer.ts`
- new shared registry module under `apps/web/server/_core` or `apps/web/shared`
- `apps/web/shared/workerDelegation.ts`
- `apps/web/server/routes/publicDocsApi.ts`

## Discovery model

This section should make three discovery surfaces agree without collapsing them into one thing:

- static HTTP contract via OpenAPI-like public docs
- per-job delegated manifest for worker-scoped truth
- session-specific MCP discovery via authenticated `tools/list`

The static MCP catalog should explain what families exist and how they are generally classified. It must not override the delegated manifest or authenticated `tools/list`.

This section should also lock the protocol-capability posture that discovery reports:

- tools remain the only actively completed capability in this feature
- prompts and resources stay gated or absent until explicitly implemented later
- `tools.listChanged` remains false unless real end-to-end list-change notification support is added

## Design rules

- Do not leave tool metadata implicit inside large `if`/`switch` branches.
- Do not let a tool appear in discovery unless the registry says it is currently executable for that caller.
- Preserve room for later MCP capabilities like prompts or resources, but do not force them into the first implementation pass.
- Keep the registry understandable enough that a runtime developer can reason about feature flags, availability, and safety classes.
- Do not accidentally regress existing protocol behavior such as initialize/version negotiation, batch handling, ping, or session termination while refactoring discovery.

## Testing first

- registry metadata validation tests
- `tools/list` truthfulness tests
- static catalog shape tests
- delegated manifest MCP-section schema tests
- tests that availability reason and feature-flag posture are preserved consistently across discovery surfaces
- protocol-capability tests for gated prompts/resources and `tools.listChanged`

## Handoff to later sections

- Section 02 uses the registry to decide what delegated-worker sessions may see and call.
- Section 03 uses registry metadata to enforce budget, billing, idempotency, and concurrency posture.
- Sections 04-07 fill in real execution handlers family by family.
- Section 08 documents the discovery story and rollout posture.

## Implementation notes

- Added the canonical registry in `apps/web/server/_core/mcpRegistry.ts`.
- Static catalog generation, authenticated `tools/list`, and `tools/call` now use the same registry metadata.
- Delegated manifest discovery now includes `catalogUrl` and explicit MCP availability in:
  - `apps/web/shared/workerDelegation.ts`
  - `apps/web/server/services/workerDelegationService.ts`

## Verification

- `npm --prefix apps/web test -- server/_core/__tests__/mcpPublicServer.test.ts server/routes/__tests__/publicDocsApi.test.ts shared/__tests__/workerDelegation.test.ts`

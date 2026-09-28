# Section 01 — Capability and Catalog Invariant

## Ownership

Model registry/classifier, static definitions, MCP seed contract/config, and
their unit/catalog tests. Do not edit prompt or storyboard modules here.

## TDD

Write the provider matrix and negative cases first. Include stale explicit
false and DB-only nested `mcp.providerModelId` fixtures.

## Implementation

- Export a pure Grok video-family classifier.
- Apply it as a non-downgradable override in capability resolution.
- Mark all existing Grok video static/seed entries explicitly native.
- Add a catalog audit test that enumerates definitions rather than a handpicked
  subset.

## Acceptance

Every video Grok fixture resolves both flags true; all image/non-Grok negatives
remain unchanged; catalog refresh cannot erase the invariant.

## Implementation evidence

- Added provider-independent `isGrokVideoFamily` runtime invariant.
- Corrected the KNPLabs static Grok entry and both Higgsfield MCP seeds.
- Added provider, nested-id, image-exclusion, and DB-parity tests.

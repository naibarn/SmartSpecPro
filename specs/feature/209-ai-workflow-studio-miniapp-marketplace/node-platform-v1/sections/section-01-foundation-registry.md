# Section 01 — Foundation contracts and registry

## Goal

Create the one versioned contract/registry that all catalog nodes, forms,
validation, AI planning, runtime adapters, output projection, and Marketplace
readiness use. This section must eliminate generic name-only nodes.

## Owned paths

- `apps/web/shared/workflowStudioNodeContracts.ts`
- `apps/web/shared/workflowStudioNodeContracts.test.ts`
- `apps/web/server/services/workflowStudioNodeRegistry.ts`
- `apps/web/server/services/__tests__/workflowStudioNodeRegistry.test.ts`
- `apps/web/server/services/workflowStudioContracts.ts` (validation integration)
- `apps/web/server/services/__tests__/workflowStudioContracts.test.ts`

No other section may define registry schemas or add ad-hoc node types.

## Cross-spec contract additions

Treat `cross-spec-node-coverage.md` as part of the registry manifest. Register
the capability/context/workspace/code/verification, economic, browser, and
managed-agent node IDs listed in its tables. Add the shared `execution` policy
object and resolved admission snapshot to the contract. The registry must
distinguish workflow-authored settings from server-resolved metadata and must
reject transient provider, session, Runner, browser, wallet, or ledger IDs in
the persisted graph.

## Contract requirements

Define Zod schemas and inferred types for:

- stable node ID/version, category, localized copy, icon, rendering `kind`, and
  runtime `capability`;
- typed values/ports with `name`, `type`, `required`, `multiple`, `nullable`,
  and explicit coercions;
- config fields with friendly labels, help text, default, required rule,
  validation, enum/options, repeatable children, sensitive/reference mode,
  conditional visibility, and advanced JSON round-trip;
- binding expressions for constants, run inputs, upstream port paths, Library/
  project records, config values, secret references, checkpoints, artifacts,
  and job state;
- runtime adapter version, permission scopes, provider requirements, readiness
  states, retry/timeout/cost policy, preview/output projector, and fixture;
- graph edges, branch handles, subflow contracts, validation diagnostics,
  registry snapshots, and compatibility manifests.

## Registry catalog

Register every ID in `spec.md` and `claude-spec.md`: trigger/input;
data/document; search/system; AI/agent; tools/integrations; media;
control/human; output/observability; and the cross-spec additions from Specs
200/204/205/206/207/208/210/211. Each entry must declare its actual settings
and ports. A missing provider is represented by readiness metadata, not a fake
passthrough adapter. Add explicit owner metadata so the registry composes the
source capability/Runtime/Runner/A2A/browser/economic authority instead of
creating a duplicate.

## Validation behavior

Extend `workflowStudioContracts.ts` to validate registry membership, duplicate
IDs, edge endpoints, source/target handles, port compatibility, branch roles,
subflow boundary rules, required config, secret references, allowed cycles, and
published immutability. Preserve current secret redaction and deterministic
content hashing. Return stable reason codes plus field/node/edge paths.

## TDD-first checks

- Every catalog ID is present once and has a fixture.
- Registry construction rejects duplicate ports, missing schemas, missing
  adapters, and unsupported capability metadata.
- Valid graphs pass; invalid config/ports/branches/subflows produce diagnostics.
- Legacy Feature 209 presets map to stable semantic IDs.
- Redaction removes secret values without changing non-secret content hashes.
- Cross-spec entries validate route, protocol, capability, runtime profile,
  workspace, approval, economic, verification, retry, and timeout policy.

## Exit criteria

The server can return a registry projection that the future UI and compiler can
consume, and publish validation cannot accept an unknown or generic node.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI implementation; this section provides the metadata consumed by
the builder user described in section 10.

### Existing Pattern Reference

N/A for direct UI; section 10 records the reusable UI patterns and decision.

### Surface Inventory

N/A — no route or component is owned here.

### Component Map

N/A — registry projections are consumed by section 10 components.

### State Matrix

N/A — readiness/state schemas are defined here and rendered in section 10.

### Responsive Matrix

N/A — responsive behavior is owned by section 10.

### Accessibility Acceptance

N/A — field labels and semantics are metadata inputs; rendered acceptance is in section 10.

### Copy Contract

Localized labels/help/error keys are required in registry metadata; final copy and fallback are owned by section 10.

### Browser Evidence Required

N/A for direct browser behavior; section 10 must prove registry projections in the UI.

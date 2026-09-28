# Section 02 — Data sources, bindings, and readiness

## Goal

Make node input configuration understandable and safe. Every input can be a
constant, a form value, an upstream output, or an approved system source with a
visible type and preview.

## Owned paths

- `apps/web/server/services/workflowStudioDataSources.ts`
- `apps/web/server/services/workflowStudioBindings.ts`
- `apps/web/server/services/workflowStudioReadiness.ts`
- focused tests under `apps/web/server/services/__tests__/`

## Source namespaces

Implement tenant-aware resolvers for `run`, `upstream`, `workflow`, `library`,
`project`, `media`, `user`, `tenant`, `config`, `secretRef`, `checkpoint`, `job`,
and `artifact`. Add `capability`, `agentCard`, `runnerSnapshot`,
`runtimeProfile`, `workspace`, `browserEvidence`, `externalSession`, and
`economic` projections. Each resolver returns a typed value/reference,
provenance, freshness and redacted preview. It must not provide arbitrary
database/file/secret access.

## Binding behavior

- Resolve constants and literals with schema validation.
- Resolve `${run.input.path}`, `${node.output.path}`, Library/project selectors,
  config values, secret references, previous checkpoint values, and artifact
  references through explicit typed expressions.
- Return diagnostics for missing path, type mismatch, nullability mismatch,
  unavailable source, permission failure, stale checkpoint, and payload limit.
- Keep large files/media as managed references; never inline binary content in
  config or preview.
- Resolve the cross-spec execution envelope only on the server. Capability and
  Agent Card freshness, Runner/runtime health, workspace authority, browser
  target/evidence, external-session route, and quote/budget/reservation state
  must be visible as typed readiness inputs without exposing credentials or
  transient control-plane IDs to authored graph data.

## Skill schema projection

Use the existing skill discovery/input schema path to read `input.json` and
`ui.json`. Normalize field labels, descriptions, defaults, required flags,
enums, nested objects, arrays, and UI hints into the registry field model. Keep
the original schema version and support form-to-payload and payload-to-form
round-trip.

## Readiness

Implement `ready`, `configuration_required`, `provider_unavailable`,
`permission_required`, `unsupported`, and `blocked_by_dependency`. Readiness
must be evaluated for palette, node card, inspector, publish, run, Library, and
Marketplace. Include a remediation key and safe user-facing message.

## TDD-first checks

- Each namespace respects tenant/user/project authority.
- All supported binding forms return declared types and redacted previews.
- Secret values never appear in stored definition, event, error, or preview.
- Skill schemas preserve required/default/enum/nested metadata.
- Readiness transitions are deterministic and explain missing configuration.
- Cross-spec readiness fails closed for stale capability/Agent Card, unavailable
  Runner/profile, missing A2A/Orca/ACP/Gas City conformance, missing economic
  authorization, unauthorized workspace/browser target, or absent verification.

## Exit criteria

The later inspector can render a real form and mapping picker from metadata,
and the runtime can resolve exactly the same binding expression without using
client-supplied tenant authority.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI implementation; this section supplies safe values and readiness to the inspector.

### Existing Pattern Reference

N/A for direct UI; schema-driven form patterns are recorded in section 10.

### Surface Inventory

N/A — no route/component is owned here.

### Component Map

N/A — binding/readiness projections are consumed by the inspector and palette.

### State Matrix

N/A — this section defines state data, while section 10 renders loading/error/not-ready states.

### Responsive Matrix

N/A — owned by section 10.

### Accessibility Acceptance

N/A — rendered field labels/semantics are verified in section 10.

### Copy Contract

Return localized error/remediation keys; final Thai/English copy is owned by section 10.

### Browser Evidence Required

N/A for direct browser behavior; section 10 must verify readiness and binding previews.

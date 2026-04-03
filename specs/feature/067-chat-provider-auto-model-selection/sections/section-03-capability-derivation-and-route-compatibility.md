# Section 03: Capability Derivation and Route Compatibility

## Purpose

Make chat auto selection choose only candidates that are both:

- capability-compatible
- route-family-compatible

## Ownership

- capability requirement mapping
- trusted derivation
- route-family filtering
- Kie inheritance

## Target files

- `apps/web/server/services/chatModelSelection.ts`
- `apps/web/server/services/intelligentModelSelector.ts`
- `apps/web/server/services/capabilityRegistry.ts`
- existing Kie runtime integration points

## Implementation notes

### Trusted capability derivation

Server-derived requirements are authoritative.

The server should derive requirements from allowlisted chat features such as:

- web search
- tool calling
- structured outputs
- browser/computer control
- image-aware or photo-aware modes

### Route compatibility

Before ranking:

- exclude responses-only models from standard chat runs
- require `supportsResponses = true` only for responses-mode runs
- preserve feature 065 Kie family guardrails

### Kie inheritance

If resolution lands on Kie:

- do not fork new routing logic here
- reuse feature 065 runtime behavior

## Acceptance checks

- auto mode does not choose candidates that would immediately fail family guardrails
- Kie provider-auto inherits Kie runtime behavior automatically
- raw arbitrary client capability booleans do not directly control model capability flags

# Section 02: Delegated Platform Access and Hermes Capability Profile

## Ownership

This section owns how Hermes bridge sessions consume SmartSpecPro HTTP and MCP surfaces under delegated-worker rules.

## Target files and modules

- `apps/web/shared/workerDelegation.ts`
- `apps/web/server/services/workerDelegationService.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `python-backend/hermes_bridge/*`

## Scope

- reuse delegated worker sessions for Hermes
- define truthful Hermes capability flags and manifest reporting
- prefer HTTP-first platform access and allow MCP only when explicitly declared and filtered
- wire the Hermes bridge to execute via Hermes API-server transport
- keep Hermes delegated usage inside the existing delegated-worker billing, trace, and spend-guardrail pipeline
- define the transport-policy contract for default-denied public remote Hermes endpoints and audited exceptions

## Implementation notes

- Hermes should consume the existing delegated route-family model rather than a Hermes-only API surface
- the bridge should prefer loopback or approved private network API-server connections
- delegated HTTP and MCP calls should reuse delegated-worker origin metadata helpers so downstream billing, trace, and audit logs stay correlated to worker, job, tenant, and owner context
- the bridge should not create a separate Hermes usage ledger; SmartSpecPro remains the source of truth for delegated cost attribution
- capability manifests should distinguish:
  - delegated HTTP available
  - delegated MCP available
  - callbacks available
  - channel companion available
- keep model/provider access policy under the existing delegated-session rules
- if a later admin policy allows a non-loopback Hermes endpoint, implementation should normalize the URL, reject protocol downgrade or unsafe redirect behavior, re-check resolved address posture at connect time, and record which policy exception allowed the connection

## TDD expectations

- add delegated-session tests for Hermes runtime before bridge execution support
- add MCP manifest filtering tests before enabling delegated MCP for Hermes
- add transport-safety tests that reject missing API keys, missing loopback/private posture, or unsupported config
- add delegated billing-metadata and trace-correlation tests before Hermes execution can call downstream HTTP or MCP routes
- add policy-exception tests for approved remote endpoints, redirect rejection, and unsafe address re-resolution

## Acceptance checks

- Hermes bridge can request a delegated worker session with truthful scopes and route families
- Hermes delegated manifests show accurate MCP availability instead of generic optimistic defaults
- Hermes bridge transport fails closed when required API-server prerequisites are missing
- Hermes delegated HTTP and MCP usage is attributable through the existing delegated-worker billing and trace pipeline
- remote Hermes endpoint exceptions are explicit, auditable, and denied by default

## Risks and coordination notes

- avoid assuming Hermes API-server compatibility means full SmartSpecPro worker-protocol compatibility
- keep delegated MCP allowlists narrow so upstream tool richness does not turn into uncontrolled platform reach
- the biggest implementation trap in this section is accidental accounting drift, where Hermes works functionally but bypasses delegated-worker billing and trace attribution

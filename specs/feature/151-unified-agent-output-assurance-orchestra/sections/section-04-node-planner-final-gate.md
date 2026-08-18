# Section 04 — Node planner and final gate

## Objective

Use the existing skill manifest registry to select a trusted capability, build an Orchestra plan, call the Python seam, verify the response, and issue a one-time authorization only after all gates pass.

## Files

- Add `apps/web/server/services/agentRuntime/orchestraPlanner.ts`, `orchestraFinalGate.ts`, `providerCapabilityProfiles.ts`, and `skillManifestVerifier.ts` with focused tests.
- Extend `apps/web/server/services/agentRuntime/requestBuilder.ts` and `client.ts` additively.

## Acceptance

Untrusted/quarantined/tenant-incompatible manifests cannot execute. Provider profile limits (including Kie/Grok 4096) are checked before submission. Custom character descriptions take precedence over positional labels. No agent or client can submit a provider task without a valid side-effect authorization bound to the contract/output/policy hash.

## Tests

Run focused Node planner/final-gate tests and existing skill-runtime orchestrator tests.

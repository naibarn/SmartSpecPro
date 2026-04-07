# Section 08: Rollout, Docs, and Regression

## Goal

Prepare the feature to ship safely by finishing rollout controls, documentation, and regression coverage that matches the actual implementation truth.

## Why this section exists

This feature changes worker power, public API auth behavior, billing propagation, and user-visible result flows. It needs a clear rollout story and honest documentation to avoid operational surprises.

## Scope

1. Add or finalize rollout gating.
2. Document what delegated workers can do now versus later.
3. Update help and release material for teams and operators.
4. Add regression coverage across the core worker, route, billing, and callback flows.
5. Keep the product truthful about HTTP-first delivery and selective MCP parity.
6. Ship worker spending-guardrail UI and docs without ambiguity.
7. Document capability discovery and owner-library/RAG access honestly.

## Suggested files

- tenant and system feature-flag services
- admin monitoring UI and help docs
- release-note and help files for worker features
- regression test suites across server and client areas touched by this feature
- worker budget settings UI on worker administration surfaces

## Rollout expectations

- feature should launch behind explicit feature flags
- operator kill switch must be validated before rollout
- OpenClaw-first production support should be documented clearly
- ZeroClaw should be documented as future-eligible rather than implied ready unless implemented
- worker budget controls should explain clearly that SmartSpecPro charges still come from the acting user's balance
- worker budget controls should explain clearly that the caps are safety guardrails for a personal worker and not a replacement wallet for the owner
- worker external-API usage outside SmartSpecPro billing is outside this credit-control model
- docs should explain that normal users add their own workers and that workers cannot be reused across users or tenants
- docs should explain where workers learn available functions, such as OpenAPI, delegated manifests, and truthful MCP availability

## Documentation expectations

Help and release content should explain:

- what Bound Worker means now
- what delegated worker access enables
- which surfaces are available through HTTP today
- where MCP remains selective or incomplete
- how capability discovery works for OpenClaw, ZeroClaw, or similar runtimes
- how credits are charged for worker-driven platform usage
- how hourly, five-hour, daily, weekly, and monthly worker spending caps work
- that unset caps mean unlimited for that window
- that personal workers are registered by the owner user rather than provisioned by admins in the normal flow
- that personal workers cannot act for other users and cannot cross tenant boundaries
- how owner-library and owner-RAG search or upload work, including file-type rules and indexing expectations

## Regression expectations

Regression coverage should prove:

- existing worker control-plane flows still work
- delegated-worker auth does not weaken route security
- billing remains service-accurate
- callback flows remain safe and user-visible
- runtime-aware binding does not break current OpenClaw behavior
- worker time-window spending caps behave correctly and remain visible in operator UI
- capability discovery remains truthful and owner-library/RAG access stays owner-bound

## Design rules

- Do not publish broader capability claims than the implementation really supports.
- Do not ship without operator-facing documentation for delegated worker controls.
- Keep rollout reversible through feature flags and kill-switch behavior.

## Testing first

- end-to-end style regression for a simple delegated worker outcome flow
- docs or help smoke tests where applicable
- feature-flag and kill-switch regression tests
- legacy worker-path regression tests

## Completion signal

This section is complete when the feature can be explained honestly to users and operators, rolled out gradually, and tested in a way that proves Bound Worker is both useful and safe.

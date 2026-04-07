# Section 08: Rollout, Migration, and Regression Matrix

## Ownership

This section owns staged enablement, legacy-connector migration posture, docs/discovery truthfulness, and the regression checklist required before broad rollout.

## Target files and modules

- feature-flag configuration
- release notes / docs touchpoints
- gateway docs/discovery tests
- worker and UI regression suites

## Scope

- keep `openClawExternalRuntime` defaulted to disabled
- define environment and tenant rollout order
- preserve unresolved historical connectors during migration
- require docs/discovery parity with runtime behavior before enablement
- define the minimum regression matrix for worker, gateway, MCP, billing, and UI compatibility
- define an operational kill switch that disables new worker dispatch while preserving admin visibility and audit access

## TDD expectations

- add regression tests that lock the advertised gateway contract
- add regression tests that keep unresolved connectors valid
- add rollout-gate tests for disabled tenants/environments
- add negative tests ensuring placeholder parity or default-tenant fallback cannot silently return
- add kill-switch tests for dispatch-disable without data-loss side effects

## Acceptance checks

- rollout can be tenant- or environment-gated without breaking existing team flows
- legacy connectors remain operable until teams opt into binding
- release docs and discovery surfaces stay truthful through rollout
- operators can stop new dispatch safely without destroying fleet visibility or historical state

## Risks and coordination notes

- do not enable docs or marketing claims before tests and runtime behavior agree
- treat truthfulness regressions as release blockers, not as follow-up polish
- make sure emergency disable paths are documented before any tenant is enabled

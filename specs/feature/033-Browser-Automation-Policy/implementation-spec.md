# Implementation Spec

## Overview

Feature 033 adds a browser automation policy engine that evaluates browser actions before execution, classifies risk and page sensitivity, enforces allow or deny or approval outcomes, and records auditable policy decisions. The implementation must preserve backward compatibility for existing browser-related features while removing any production path that allows browser execution without policy enforcement.

## Product and rollout intent

- Policy enforcement is always-on for any production browser execution surface.
- The Automation Copilot and Playwright execution path is the primary v1 enforcement target and must enforce policy from day 1.
- The raw browser tool path must not remain a production bypass. For v1 it stays production-disabled until it can be routed through the same shared enforcement path.
- Polling is acceptable for approval notification in the first production cut. SSE may be added later, but Feature 033 must not be blocked on it.
- Existing approval flow and UI will be reused for v1, with browser-specific payload fields added to approval requests.

## Required outcomes

1. Every production browser action passes through one shared policy evaluation pipeline before execution.
2. The shared policy pipeline classifies action consequence and page sensitivity using deterministic, rule-based logic in the critical path.
3. High-consequence actions can be denied or paused for explicit contextual approval.
4. Approval grants are bound to the exact action and browser context and are invalidated on any navigation, frame change, or popup change in v1.
5. Policy decisions are stored in an auditable, tenant-scoped history with minimal structured evidence only.
6. Tenant-specific browser policy configuration is stored in dedicated tenant-scoped browser policy tables, not in global `system_settings` rows and not in `workflow_policy_rules`.
7. Workflow-scoped browser entitlements define the capabilities, data-class allowances, per-workflow limits, approval TTL overrides, and disable state actually granted to a browser run.
8. Unknown context and low-confidence non-read actions fail closed through read-only downgrade, approval, or denial rather than permissive execution.
9. Approval TTL defaults and bounds are fixed for v1 at 300 seconds by default, minimum 60 seconds, and maximum 900 seconds unless governance explicitly changes them later.
10. Iframe handling follows the approved three-tier trust model: same-origin trusted, same-site cross-origin constrained, and cross-site read-only by default.
11. Rollout phase changes require the explicit metric gates defined in the approved spec rather than informal judgment alone.

## Non-goals for v1

- No new dedicated browser approval UI if the existing approval flow can support browser-specific payload fields.
- No requirement to ship SSE approval notifications in v1.
- No raw DOM snippet retention by default.
- No full screenshot retention by default.
- No second independent policy engine for the raw browser tool.
- No tenant CRUD admin UI for policy configuration at launch.

## Architecture decisions

### Shared enforcement path

The critical-path policy engine lives in Node.js and is shared across production browser execution surfaces. It owns action classification, page sensitivity scoring, entitlement checks, policy decision calculation, approval request creation, approval validation, and policy audit emission. Python may be used later for offline analysis or backfill support, but not for online per-action decisions.

### Production surface strategy

- Copilot and Playwright executor path: enabled behind policy enforcement in v1.
- Raw browser tool path: remains production-disabled until it can call the same shared enforcement contract. It may remain internal-only during the transition, but cannot be exposed as a tenant-usable production path without the shared policy layer.

### Policy storage

Introduce dedicated tenant-scoped browser policy storage:

- `tenant_browser_policy_config` for top-level configuration, default enforcement mode, approval TTL limits, rollout phase, and retention or evidence controls.
- `tenant_browser_policy_rules` for ordered rule rows and tenant overrides such as allow or deny conditions, page sensitivity overrides, restricted origins, thresholds, and capability-level policy overrides.
- `browser_workflow_entitlements` for per-workflow capabilities, forbidden capabilities, allowed data classes, per-workflow thresholds, approval TTL overrides, expiry, and workflow-level disable state.

These tables jointly form the source of truth for browser policy. Tenant policy defines the ceiling and incident controls, while workflow entitlements define the minimum granted scope for a specific browser run. `workflow_policy_rules` remains separate and is not extended for browser automation policy.

For v1, approval TTL policy should remain aligned with the approved bounds: default 300 seconds, minimum 60 seconds, maximum 900 seconds.

### Approval transport

Approval notification may rely on the existing polling-based status flow in v1. Existing approval APIs and approval UI are reused, but approval payloads must be enriched with browser-specific context so the user sees exactly what is being approved.

### Evidence retention

Only structured minimal evidence is retained by default:

- normalized action metadata
- page origin and normalized path or route identity
- action digest
- DOM fingerprint or other page-context hash
- screenshot hash if a screenshot-derived fingerprint is needed
- reason codes, classifier confidence, and policy decision metadata

Raw DOM snippets and full screenshots are disallowed by default.

Audit output must remain compatible with the existing JSONL audit stream while also writing structured DB records, and the append path should be tamper-evident so incident review can verify integrity without exposing secret material.

## Functional requirements

### Shared policy evaluation

For each browser action submitted by the production execution path, the shared policy layer must:

1. normalize the action payload
2. classify the action into a risk tier such as read, draft, commit, or restricted
3. determine the relevant page context and sensitivity classification
4. load tenant policy config, applicable tenant policy rules, and workflow entitlement constraints
5. resolve the final decision: allow, allow with redaction, require approval, deny, or escalate for review
6. emit an auditable decision record
7. either forward the action for execution, pause for approval, or terminate execution with a policy denial

Decision storage should use a dedicated browser-policy decision enum rather than reusing `policy_action`.

Unknown context and low-confidence non-read actions must fail closed. The shared policy layer should downgrade them to read-only, require approval, or deny according to deterministic thresholds rather than allowing them through optimistically.

Iframe trust handling must follow the approved three-tier model. Same-origin iframes inherit parent policy. Same-site cross-origin iframes remain constrained to draft-class behavior with commit actions requiring approval. Cross-site iframes are treated as new untrusted contexts and are capped at read-only behavior by default, with the trust-boundary denial recorded under the explicit reason code `cross_site_iframe`.

### Approval binding and invalidation

Approvals for browser actions must be contextual and non-blanket. The system must bind approval to:

- tenant ID
- user ID or actor identity
- execution or workflow ID
- target origin
- normalized action details
- action digest
- payload preview hash
- DOM fingerprint or equivalent page-context fingerprint
- optional screenshot hash when visual confirmation is required
- expiration timestamp

In v1, any navigation, frame change, or popup change invalidates the pending approval context. Execution must also re-check a context hash derived from the approved action and page context before dispatch. If origin changes, action digest changes, the context hash no longer matches, or DOM fingerprint drift exceeds 20 percent, the approval is invalid and a new approval is required.

Approval revocation is also a first-class control. Pending or recently granted approvals must be revocable, and executors must fail closed if revocation is observed before resume or action dispatch.

Approval invalidation should be auditable through explicit reason codes, including a dedicated `approval_context_changed` reason when context-bound validation fails.

### Configuration and rollout

The system must support phased rollout without redeploying code. Config should allow:

- policy enabled or disabled state for non-production environments
- rollout phase and enforcement mode
- approval TTL bounds
- tenant-specific rule overrides
- workflow-specific capability and limit overrides through entitlements
- evidence retention controls
- production-disable state for the raw browser tool until shared enforcement integration is complete

Observe or telemetry-first rollout must not create a production bypass. In v1, observe mode should either be internal-only or behave as read-only plus shadow scoring for higher-risk action classes.

Rollout must use explicit go or no-go thresholds. Phase 0 to 1 requires at least 14 days and at least 10,000 decisions, plus the approved reviewed-sample thresholds for precision, false-positive rate, false-negative rate, and stability. Later phase transitions should keep the approved gates for deny precision, approval abandonment, incident-free duration, red-team pass rate, and audit completeness.

### Compatibility

- Existing approval APIs and approval UI remain in service and receive browser-specific payload extensions.
- Existing browser-related feature flags continue to gate broad product access.
- Existing domain allowlist checks remain useful defense-in-depth controls, but they no longer represent the primary policy decision for production browser execution.
- Existing behavior for raw browser tool access changes only by keeping that surface disabled for tenants until shared enforcement is added.

## Data model requirements

### Tenant browser policy config

The config table should capture tenant-scoped defaults and operational controls such as:

- enforcement mode or rollout phase
- default approval TTL
- policy enabled state
- evidence retention settings
- default deny or restricted patterns
- created and updated metadata

### Tenant browser policy rules

The rules table should capture ordered tenant-scoped rules such as:

- match conditions for action class, origin, path, page sensitivity, selector or field characteristics, or workflow entitlement
- resulting decision or override behavior
- thresholds and scores
- enable or disable status
- priority and provenance metadata

### Browser workflow entitlements

The workflow entitlement store should capture:

- workflow-scoped allowed capabilities and forbidden capabilities
- allowed data classes
- per-workflow thresholds for bulk actions, extraction, external sends, and origin transitions
- approval TTL overrides and other workflow policy config, within the 60 to 900 second bound and defaulting to 300 seconds
- enabled or disabled state, expiry, and review cadence
- tenant and workflow identifiers

### Browser policy decision audit

The decision history must support high-write append patterns and tenant-scoped querying. It should store:

- trace and correlation identifiers
- tenant and actor identifiers
- execution context
- normalized page identity
- action class and action type
- page sensitivity classification
- classifier confidence and risk score
- final policy decision
- reason codes
- approval linkage if applicable
- minimal evidence digests only
- creation timestamp suitable for time-based partitioning
- integrity metadata needed for tamper-evident append verification

### Approval request compatibility

The implementation must preserve the source-spec approval data-model contract. The approval request model requires browser-specific persistence for `action_digest`, `dom_fingerprint`, and `screenshot_hash`, and the approval payload contract should also carry `payload_preview_hash` as a stable computed contract field so preview rendering and verification remain stable across Node and Python surfaces. Implementations should treat `payload_preview_hash` as part of the approval verification contract, not as display-only metadata.

## Implementation constraints from current codebase

- The current `system_settings` implementation is global by `(category, key)` and is not suitable for tenant-scoped browser policy storage.
- The current raw Python browser endpoint instantiates `BrowserSession` directly and does not currently use `BrowserSessionFactory`; therefore it cannot be treated as already aligned with the sandbox-backed path.
- The current Playwright execution path already performs live browser actions and must be the first-class enforcement target in v1.
- Existing approval infrastructure already supports tenant-scoped approval persistence, polling, expiry handling, and user decision submission. The browser policy design should reuse those surfaces rather than fork them.
- The current codebase does not have workflow-level browser entitlement storage yet, so the implementation must add that layer explicitly rather than inferring capabilities from tenant defaults alone.

## External guidance incorporated

- Anthropics’s computer-use guidance supports domain allowlists, human confirmation for important actions, and explicit prompt-injection defenses: https://docs.anthropic.com/en/docs/build-with-claude/computer-use
- OWASP transaction authorization guidance supports transaction-specific, context-bound approvals rather than blanket grants: https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html
- Playwright documentation reinforces separate handling for frames, popups, and actionability checks: https://playwright.dev/docs/frames , https://playwright.dev/docs/pages , https://playwright.dev/docs/actionability
- PostgreSQL declarative partitioning and `pg_partman` support the planned time-partitioned audit table strategy: https://www.postgresql.org/docs/current/ddl-partitioning.html , https://pgxn.org/dist/pg_partman/doc/pg_partman.html
- Google ML guidance supports rollout gates centered on precision and false-positive rate rather than raw accuracy: https://developers.google.com/machine-learning/crash-course/classification/accuracy-precision-recall
- Microsoft’s multitenant configuration guidance supports explicit tenant scoping for shared-store configuration: https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/service/app-configuration and https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/deployment-configuration

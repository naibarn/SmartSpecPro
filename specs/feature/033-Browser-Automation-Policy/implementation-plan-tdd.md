# Implementation Plan TDD

## Testing Context

The web application uses `vitest` for TypeScript tests, with router and server coverage commonly added under `apps/web/server/__tests__/` or `apps/web/server/routers/__tests__/`. The Python backend uses `pytest` under `python-backend/tests/`, with unit, integration, security, and multitenancy markers already in use. This TDD plan follows those existing conventions and keeps test stubs as prose-level test targets rather than full implementations.

## Tenant-scoped configuration and rules

### Test stubs to write first

- Test: Drizzle schema exposes tenant browser policy config, tenant browser policy rules, and browser workflow entitlement tables with the expected tenant and workflow keys.
- Test: browser policy resolution never falls back to global `system_settings` rows when tenant-scoped policy records exist.
- Test: workflow entitlement lookup fails closed when the workflow is disabled, expired, or missing.
- Test: approval TTL defaults to 300 seconds and rejects overrides below 60 seconds or above 900 seconds.
- Test: workflow entitlement config persists rate-limit, origin-transition, and review-cadence settings without cross-tenant leakage.

## Shared policy evaluation flow

### Test stubs to write first

- Test: policy engine classifies actions into read, draft, commit, and restricted classes using deterministic rules.
- Test: policy engine emits dedicated browser-policy decision enum values instead of reusing `policy_action`.
- Test: unknown context downgrades non-read actions to read-only, approval, or deny according to fail-closed thresholds.
- Test: low-confidence non-read actions cannot bypass approval or denial logic.
- Test: Node and Python contract fixtures serialize the same decision envelope, approval payload fields, and context fingerprints.

## Approval reuse and contextual binding

### Test stubs to write first

- Test: browser approval payload includes `action_digest`, `payload_preview_hash`, `dom_fingerprint`, optional `screenshot_hash`, target origin, and TTL metadata.
- Test: approval request persistence adds browser-specific model fields for `action_digest`, `dom_fingerprint`, and `screenshot_hash`.
- Test: executor recomputes context hash before dispatch and invalidates approval when digest, origin, or context hash changes.
- Test: approval invalidates when DOM fingerprint drift exceeds 20 percent.
- Test: invalidated approvals emit `approval_context_changed` in audit reason codes.
- Test: approval creation is idempotent across task retries and reconnects.
- Test: revoked approvals fail closed if resume is attempted after revocation.

## Execution-path integration details

### Test stubs to write first

- Test: Automation Copilot execution path calls the shared policy contract immediately before live browser actions execute.
- Test: raw browser tool cannot be enabled for tenant production use without the shared policy contract wired and healthy.
- Test: navigation, redirect, popup, and subframe transitions trigger re-evaluation on the live executor path.
- Test: OS/browser prompts such as downloads, file pickers, permission prompts, and certificate warnings fail closed without explicit policy allowance.
- Test: iframe trust handling enforces same-origin inherit, same-site draft-only constraint, and cross-site read-only constraint with the expected reason code.

## Data handling and exfiltration controls

### Test stubs to write first

- Test: sensitive-page downloads are denied unless workflow entitlement explicitly allows the file class and destination handling.
- Test: uploads default to deny and require approval for external destinations.
- Test: extracted record counts and external-send counts enforce per-workflow thresholds.
- Test: clipboard or inter-page transfer from restricted context to untrusted destination is denied.
- Test: Redis-backed action-rate controls enforce per-action-type thresholds without cross-tenant contamination.

## Evidence model and privacy boundary

### Test stubs to write first

- Test: policy audit records exclude raw DOM snippets and full screenshot blobs by default.
- Test: approval payloads and status responses expose hashes and minimal evidence only.
- Test: browser-policy audit writes to JSONL-compatible output and structured DB storage for the same decision event.
- Test: tamper-evident integrity metadata is written and can be verified for audit sequences.
- Test: decision, approval, and action outcome linkage can be reconstructed without secret disclosure.

## Data model and migration strategy

### Test stubs to write first

- Test: raw SQL migration creates the partitioned browser policy decision table and initial monthly partitions.
- Test: `pg_partman` configuration or fallback maintenance setup is created for future partitions.
- Test: additive approval schema changes remain readable by both Node and Python stacks.
- Test: tenant browser policy tables, workflow entitlement table, and indexes migrate without destructive changes.
- Test: retention and partition maintenance checks report failure if future partitions are missing.

## Regression prevention strategy

### Test stubs to write first

- Test: safe read-only workflows continue working under enforcement.
- Test: risky commit-class actions create approvals or denials rather than slipping through.
- Test: tenant A can never read tenant B policy config or workflow entitlement state.
- Test: repeated Copilot retries do not create duplicate approvals or duplicate decision rows for one logical action.
- Test: cross-stack fixture tests detect contract drift in policy decisions and browser approval payloads.

## Observability and monitoring

### Test stubs to write first

- Test: metrics emit decision counts by tier and allow/deny/approval outcome.
- Test: policy latency and timeout counters distinguish successful decisions, soft timeouts, hard failures, and fail-closed fallbacks.
- Test: rollout metrics compute reviewed precision, false-positive rate, and false-negative rate for enforcement-worthy actions.
- Test: alerts trigger when raw browser tool becomes tenant-accessible without shared enforcement.
- Test: partition maintenance failure and decision-write failure metrics are emitted.

## Incident controls and kill switches

### Test stubs to write first

- Test: global and tenant-level feature flags disable browser automation immediately.
- Test: workflow-level disable in workflow entitlements blocks execution before any live browser action.
- Test: emergency domain/category deny overrides supersede normal workflow allowance.
- Test: approval revocation propagates to polling clients and blocks resume.
- Test: incident-state audit output distinguishes expiry, rejection, revocation, and context drift.

## Data safety strategy

### Test stubs to write first

- Test: additive migrations can be applied without mutating existing approval or browser data paths.
- Test: backup/verification checklist covers new policy tables and approval payload changes before enforcement is enabled.
- Test: rollback disables tenant-facing browser policy usage without exposing the raw browser bypass.
- Test: post-rollback verification confirms Copilot approvals, approval listing, and tenant feature gating still operate correctly.

## Compatibility notes

### Test stubs to write first

- Test: non-browser approval flows continue to work with additive browser-specific fields present.
- Test: existing domain allowlist logic still acts as defense in depth after policy integration.
- Test: observe mode never opens an unenforced write path on tenant-facing production surfaces.
- Test: polling-based approval status remains backward-compatible with existing UI consumers.

## Implementation phases

### Test stubs to write first

- Test: foundation phase produces schema, entitlement lookup, and audit append plumbing before execution-path enforcement code is enabled.
- Test: approval integration phase includes revocation and invalidation behavior before commit-class rollout begins.
- Test: data-handling and rate-limit controls can be enabled independently of raw-browser production access.
- Test: launch guard remains active until raw browser tool and Copilot share the same enforcement contract.

## Testing and verification approach

### Test stubs to write first

- Test: abuse scenarios cover deceptive labels, hidden auth prompts, popup origin changes, and mass extraction attempts.
- Test: rollout gates fail if reviewed-sample thresholds or incident-free windows are not met.
- Test: red-team scenarios required for commit-to-expanded rollout are tracked as explicit pass/fail checks.
- Test: audit completeness is verified before expanded rollout.

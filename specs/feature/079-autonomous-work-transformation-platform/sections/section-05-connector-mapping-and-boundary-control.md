# Section 05: Connector Mapping and Boundary Control

## Purpose

This section adds the first-class connector mapping layer that workpacks need before they can run safely in supervised or autonomous mode. The goal is to make connector setup explicit, typed, reviewable, and fail-closed instead of hiding it inside generic settings or ad hoc runtime configuration.

This work depends on the shared workpack contracts from section 01 and the compiler/router output from section 03. The compiler should already know which connectors, scopes, and side effects a workpack requires. This section consumes that information, validates it against live connector metadata, and turns mismatches into structured boundary exceptions.

## Scope

Implement the connector mapping studio and the supporting validation flow for workpacks:

- canonical workpack field mapping definitions
- live connector schema validation
- auth scope inspection and expiry surfacing
- side-effect classification for mapped operations
- structured exceptions for missing, stale, or over-broad permissions

The output of this section should give operators enough clarity to decide whether a workpack is safe to run, needs narrower scopes, or must remain blocked until mapping issues are resolved.

## Implementation Plan

### 1. Define the canonical connector map model

Add a workpack-specific connector mapping contract that can be persisted as a version-scoped record and reused across runs. The model should describe:

- the connector identity and connector family
- the workpack version it belongs to
- source fields and target fields being mapped
- required auth scopes and any optional scopes
- the side-effect class of each mapped operation
- the idempotency posture of each write-capable operation, including whether caller-supplied dedup keys are supported
- validation status and last validated timestamp
- whether the mapping is draft, approved, stale, or blocked

Keep the mapping payload schema-backed and JSON-friendly so connector details can evolve without forcing a schema rewrite. The shared contract should remain narrow enough for the compiler, runtime router, UI, and exception system to consume consistently.

### 2. Build live validation as a fail-closed service

Implement a validation service that checks connector maps against live connector metadata before execution is allowed to proceed. Validation should confirm:

- required fields exist and are mapped
- field types are compatible enough for the intended operation
- the connector schema still matches the stored mapping
- the current auth scopes cover the requested operation
- the connector authorization has not expired or been revoked
- the mapped operation does not exceed the declared side-effect boundary
- any operation marked retryable or fallback-safe actually supports the declared idempotency envelope

This service must not perform side effects during validation. It should only read connector metadata, auth state, and mapping state, then emit a validation result that downstream services can trust.

If validation fails, the result should be explicit about whether the problem is a missing field, a schema drift, an expired credential, a scope mismatch, or an over-broad permission request.

### 3. Surface auth scope posture and expiry state

Add scope inspection behavior that makes the security posture visible to both operators and the runtime router. The implementation should show:

- which scopes are required
- which scopes are currently granted
- which scopes are optional but recommended
- whether the granted scopes are narrower or broader than expected
- when the credential or token is expiring

Do not silently widen scopes to make a workpack pass. If a workpack needs broader access than the connector currently grants, the system should mark the mapping as blocked or step-up required and preserve the reason in the exception record.

### 4. Classify side effects at the mapping boundary

Introduce a side-effect classification for mapped connector operations so the compiler and router can reason about consequence boundaries. The classification should distinguish at least:

- read-only
- low-risk write
- state-changing write
- irreversible or externally visible action

The classifier does not need to infer intent from scratch. It should consume compiler output, connector metadata, and mapping declarations, then attach a declared side-effect tier to each mapped action.

This classification must flow into approval logic. Small read-only steps can remain low-friction, while writes, approvals, deletes, or outbound updates should trigger narrower step-up gates.

Write-capable mappings should also declare whether they are:

- safe for deduplicated retry
- single-attempt only under supervised execution
- blocked from autonomous execution because the connector cannot preserve an idempotent effect boundary

### 5. Convert mapping failures into structured exceptions

When validation or authorization fails, emit a structured connector exception rather than a generic execution error. The exception should bind:

- workpack id and workpack version
- run id, if a run has already started
- connector id and connector family
- reason code
- risk class
- missing or mismatched fields
- scope or expiry details
- suggested next action
- replay or remediation pointer

Reason codes should distinguish between:

- missing mapping
- schema mismatch
- expired or revoked auth
- insufficient scope
- over-broad scope
- disallowed side effect
- connector unavailable

These exceptions are part of the workpack boundary system, not just an error report. They must be usable by the exception inbox, replay flow, and promotion logic later in the feature.

### 6. Add the Connector Schema Studio surface

Provide a dedicated UI surface for viewing and editing workpack connector maps. The studio should expose:

- field-by-field mapping state
- live validation results
- auth scope posture
- expiry warnings
- side-effect classification
- blocked or step-up status

The UI should make it obvious when a connector map is safe, stale, or overly permissive. It should also link back to the workpack detail view so operators can see why a particular connector requirement exists.

Keep the surface aligned with the rest of the control plane. This is not a general settings page; it is a workpack boundary control tool.

### 7. Wire connector mapping into compiler and runtime routing

The compiler should emit connector requirements in a form this section can validate. The runtime router should consume the validation result and apply the following rules:

- validated read-only mappings can proceed under the declared runtime mode
- validated write mappings must preserve their declared consequence boundary
- validated write mappings without a safe idempotency envelope must stay single-attempt or supervised only
- missing, expired, or over-broad mappings block autonomous execution
- unresolved mapping drift downgrades the workpack to supervised or exception state

The router must not treat connector validation as a soft warning. If the mapping is not valid, the workpack remains constrained until the operator fixes the mapping or explicitly handles the exception.

## TDD Expectations

Add tests before implementation lands for each of these behaviors:

- connector map schemas accept valid mappings and reject incomplete ones
- live schema validation detects field drift and incompatible connector metadata
- expired, missing, or revoked auth produces a structured exception state
- scope inspection distinguishes narrow, sufficient, and over-broad permissions
- side-effect classification is attached to mapped operations and preserved through validation output
- connectors that do not support the declared idempotency posture block retryable or autonomous write paths
- fail-closed behavior prevents autonomous execution when mappings are stale or unsafe
- Connector Schema Studio renders mapping state, validation warnings, and scope posture

Use targeted shared, server, and client tests rather than one large end-to-end test. Shared contract tests should cover schema shape and enum behavior. Server tests should cover validation, exception conversion, and router gating. Client tests should cover the studio state rendering and the blocked versus approved mapping experience.

## Acceptance Criteria

This section is complete when:

- every workpack connector requirement can be represented as a typed mapping
- live validation can detect drift before execution starts
- the system clearly exposes scope posture and expiry state
- side effects are classified and enforced at the mapping boundary
- write-capable mappings cannot claim retryable autonomy unless the connector can honor the declared dedup boundary
- unsafe mappings create structured exceptions instead of silent fallback
- the control-plane UI can explain why a connector is blocked, stale, or approved

# Appendix - Preflight Lifecycle and API Contracts

## Purpose

Make preflight preview, approval, regeneration, and launch deterministic enough for multiple implementers to build without inventing incompatible state flows.

## Preflight approval bundle lifecycle

| State | Meaning | Allowed next states |
|---|---|---|
| `draft` | Request exists but no current preflight preview has been generated. | `previewed`, `cancelled` |
| `previewed` | A preview exists for the current request/source/policy fingerprint but has not been approved. | `approved`, `stale`, `superseded`, `cancelled` |
| `approved` | User approved a preview for the current `PreflightRevisionFingerprint`. | `launching`, `stale`, `superseded`, `cancelled` |
| `stale` | Request fields, linked sources, selected sources, policy inputs, team override, or approval inputs changed after preview/approval. | `previewed`, `cancelled` |
| `launch_blocked` | Launch validation failed because of missing team, drift, budget, contract, or authorization gates. | `previewed`, `approved`, `cancelled` |
| `launching` | Launch has accepted the approved bundle and is creating/persisting run and Team kickoff artifacts. | `launched`, `launch_blocked` |
| `launched` | Work OS automation run and Team kickoff were created from this approved bundle. | terminal |
| `cancelled` | User/admin cancelled this bundle before launch. | terminal |
| `superseded` | A newer preview/bundle replaced this bundle. | terminal |

## Required bundle fields

`PreflightApprovalBundle` is the approval-time source of truth for launch. It must be schema-validated at write time and read time.

Minimum fields:

- `id`
- `tenantId`
- `caseId`
- `requestId`
- `state`
- `createdByUserId`
- `approvedByUserId`
- `createdAt`
- `updatedAt`
- `approvedAt`
- `launchedAt`
- `supersededByBundleId`
- `preflightRevision`
- `compiledBrief`
- `capabilityPlan`
- `teamExecutionPlan`
- `teamResolutionDecision`
- `approvalSourceSnapshots`
- `executionBudgetEnvelope`
- `surfaceGovernanceDecisions`
- `contractCompatibilityBlocks`
- `requesterSafeDiagnostics`
- `adminDiagnostics`
- `idempotencyRecords`

State metadata must record the actor, event name, prior state, next state, primary reason code, and correlation id for every transition.

## Actor and authorization context

API input schemas should not accept trusted actor fields from the client. Router handlers must derive actor context from authenticated server context and pass a `WorkIntakeActorContext` / launch actor context into services.

Derived actor fields:

- `tenantId`
- `actorUserId`
- `roles`
- `domainId`
- `requesterUserId`
- `caseOwnerId`
- `privateVaultUnlocked`
- `allowedSourceScopes`
- `allowedSurfacePermissions`
- `previewAccessLevel`

Every service that reads sources, builds previews, captures approval, or launches automation must receive this context explicitly. Hidden global context lookups are allowed only at the router boundary.

## Required state transitions

| Event | From | To | Notes |
|---|---|---|---|
| `preview.generated` | `draft`, `stale`, `launch_blocked` | `previewed` | Computes current fingerprint and selected sources. |
| `preview.regenerated` | `previewed`, `stale`, `launch_blocked` | `previewed` | Supersedes prior preview for the same request. |
| `request.edited` | `previewed`, `approved`, `launch_blocked` | `stale` | Applies to title, objective, linked sources, selected sources, policy inputs, or team override. |
| `source.drift_detected` | `previewed`, `approved`, `launching` | `stale` or `launch_blocked` | Required source drift blocks launch; optional source drift may degrade with diagnostics. |
| `preflight.approved` | `previewed` | `approved` | Requires matching current fingerprint. |
| `preflight.cancelled` | `draft`, `previewed`, `approved`, `stale`, `launch_blocked` | `cancelled` | User/admin intentionally abandons bundle. |
| `launch.requested` | `approved` | `launching` | Must be idempotent by bundle id and idempotency key. |
| `launch.validation_failed` | `launching` | `launch_blocked` | Preserve block reason and allow regenerate/reapprove. |
| `launch.created` | `launching` | `launched` | Stores automation run id, room id, Team run id if available. |

## API contracts

### `workOs.resolvePreflightPreview`

Purpose: generate or read the current preflight preview.

Input:

- `caseId`
- optional `title`
- optional `objective`
- optional `mode`
- optional `templateKey`
- optional `templateVersion`
- optional `linkedConversationIds`
- optional `linkedWorkpackRunIds`
- optional `linkedRoleRoutineRunIds`
- optional `selectedSourceIds`
- optional `explicitTeamId`
- optional `idempotencyKey`

Server-derived context:

- authenticated actor context
- requester/admin preview access level
- private-vault unlock state
- tenant feature-flag state

Output:

- `preflightBundleId`
- `state`
- `previewView`
- `brief`
- `capabilityCatalog`
- `teamResolution`
- `preflightRevision`
- `budget`
- `approvalSnapshotStatus`
- `diagnostics`

Error codes:

- `FORBIDDEN_PREVIEW_ACCESS`
- `SOURCE_REF_INVALID`
- `SOURCE_ACCESS_DENIED`
- `PREVIEW_GENERATION_FAILED`

### `workOs.regeneratePreflightPreview`

Purpose: force regeneration after a stale, blocked, or user-edited preview while superseding the prior current bundle.

Input:

- `caseId`
- optional `previousPreflightBundleId`
- current request/source/policy fields
- optional `regenerationReason`
- `idempotencyKey`

Output:

- new `preflightBundleId`
- `state: previewed`
- `supersededBundleIds`
- `preflightRevision`
- `diagnostics`

Error codes:

- `FORBIDDEN_PREVIEW_ACCESS`
- `REGENERATION_IDEMPOTENCY_CONFLICT`
- `PREVIEW_GENERATION_FAILED`

### `workOs.approvePreflightBundle`

Purpose: bind user approval to the exact current preflight revision.

Input:

- `caseId`
- `preflightBundleId`
- `approvedRevisionHash`
- `selectedSourceIds`
- `approvalDecision`
- optional `approvalComment`
- `idempotencyKey`

Output:

- `preflightBundleId`
- `state: approved`
- `approvedAt`
- `approvedByUserId`
- `preflightRevision`
- `approvalSnapshots`
- `launchReadiness`

Error codes:

- `PREVIEW_STALE`
- `APPROVAL_SOURCE_DRIFT`
- `APPROVAL_SOURCE_ACCESS_DENIED`
- `APPROVAL_BUNDLE_SUPERSEDED`
- `APPROVAL_IDEMPOTENCY_CONFLICT`

### `workOs.getPreflightBundle`

Purpose: read an existing bundle for review, audit, or launch readiness without recomputing planner output.

Input:

- `caseId`
- `preflightBundleId`
- optional `view: requester_safe | admin_diagnostic`

Output:

- `preflightBundleId`
- `state`
- `preflightRevision`
- `previewView`
- `launchReadiness`
- redacted or diagnostic `diagnostics`

Error codes:

- `PREVIEW_NOT_FOUND`
- `FORBIDDEN_PREVIEW_ACCESS`

### `workOs.invalidatePreflightBundle`

Purpose: mark an existing bundle stale or cancelled when request/source inputs change or user abandons review.

Input:

- `caseId`
- `preflightBundleId`
- `reasonCode`
- optional `currentRevisionHash`

Output:

- `preflightBundleId`
- `state`
- `reasonCode`

Error codes:

- `PREVIEW_NOT_FOUND`
- `PREVIEW_ALREADY_TERMINAL`

### `workOs.launchApprovedAutomation`

Purpose: start automation only from an approved, current, launch-ready bundle.

Input:

- `caseId`
- `preflightBundleId`
- `approvedRevisionHash`
- optional `mode`
- `idempotencyKey`

Output:

- `automationRunId`
- `teamId`
- `roomId`
- `teamRunId`
- `workItemId`
- `preflightBundleId`
- `state: launched`
- `launchDiagnostics`

Error codes:

- `PREVIEW_STALE`
- `MISSING_TEAM`
- `UNAUTHORIZED_TEAM`
- `APPROVAL_SOURCE_DRIFT`
- `BUDGET_CAP_INVALID`
- `SURFACE_CONTRACT_NOT_MIGRATED`
- `SURFACE_AUTHORITY_MISSING`
- `LAUNCH_IDEMPOTENCY_CONFLICT`

## Idempotency and concurrency rules

- Every mutating API must accept an `idempotencyKey`.
- Reusing the same key with identical input returns the original result.
- Reusing the same key with different input returns an idempotency conflict.
- Launch must acquire a bundle-level lock or compare-and-set state transition from `approved` to `launching`.
- Only one bundle per request can be current unless an older bundle is explicitly retained for audit as `superseded`.
- `launchApprovedAutomation` must be safe to retry after network failure.
- `approvePreflightBundle` must be safe to retry after UI double-clicks.
- `regeneratePreflightPreview` must supersede the prior current bundle atomically.

## UI behavior

- `stale` must show regenerate-and-review, not launch.
- `launch_blocked` must show the primary block reason and a safe next action.
- `launched` must deep-link to Work OS run, Team room, and Team run when available.
- Requester-safe views must not expose admin diagnostic internals.

## Required tests

- State transitions reject impossible moves such as `draft -> launched` or `cancelled -> approved`.
- Approval fails when the approved revision hash differs from the current fingerprint.
- Regeneration supersedes the previous current bundle and preserves it for audit.
- Launch compare-and-set prevents double-launch from concurrent requests.
- Requester-safe reads redact admin diagnostics while admin reads preserve them.

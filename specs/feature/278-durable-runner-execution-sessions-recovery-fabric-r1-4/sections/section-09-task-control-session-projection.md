# Section 09 — Task Control Session Projection

## Goal and boundaries

Implement M8 projection into existing Spec 277 Task Control, leaving job ownership and UI routes in their current owners.

## Requirements

- Project execution location, continuity class, recovery phase, recovered/unknown state, safety pause and permission-gated diagnostics.
- Only show “Still running” or “Recovered” when fresh liveness, current canonical authority and matching generation are all proven. Otherwise show reconnecting/unknown/safe pause without changing canonical job status.
- Scope DTOs to requesting tenant/user and omit credentials, full local paths, raw output, provider handles and sensitive grant/economic internals.
- Feature-off/unsupported runner falls back to current job UI; no hidden capability loss.

## UI/UX contract

- Target users: end users and authorized admins diagnosing an executing task.
- Surface: existing Spec 277 Task Control list/detail and authorized admin diagnostics.
- State matrix: loading, empty/no session, error with canonical job retained, success with safe location/continuity, feature-disabled/unsupported, hover/focus using existing controls, selected job anchored to canonical ID/revision.
- Responsive: mobile stacked status/location; tablet compact rows; laptop/desktop existing density without horizontal scroll.
- Accessibility: keyboard-operable actions, visible focus, text status labels, semantic live update only for meaningful transitions, reduced-motion-safe indicators, existing contrast tokens.
- Visual direction: reuse current SmartSpecPro components/tokens; no hard-coded values or global CSS reset.
- Copy: concise Thai/English paired labels; explain action-required states; locale fallback follows app conventions.
- Browser proof: authorized detail states on mobile/tablet/desktop, loading/error/recovery, keyboard path, and tenant/secret/path leak check.

## Likely owned files

- Existing `apps/web/client/src` Spec 277 Task Control components/query DTOs after exact route discovery.
- Server projection service/router and scoped component/browser tests.

## Acceptance and tests

Cover AC-14 and AC-26. Test freshness, authorization, no-session compatibility, stale authority not displayed as recovered, all UI states, viewport/layout and keyboard semantics.

## Dependencies

Requires Sections 01, 03 and 04. Browser evidence does not prove provider or production recovery.

## Implementation record

- `workerJobs.detail` now includes an optional feature-gated `executionSession` safe projection, fetched only through the authenticated tenant and requesting-user-owned canonical job. It emits `state: "unknown"` because persisted projection is not fresh process liveness proof; secrets, output and workspace paths are omitted.
- The safe DTO includes `contractVersion: spec278-session-v1`; a focused service test verifies the versioned shape remains `unknown` and excludes process identity.
- Existing-pattern search found Astryx `Banner` usage across Task Control-adjacent pages; reused it for a bilingual “status unverified” notice. The page hides it when the feature flag yields no session. The page test covers the unknown state and verifies private session/driver IDs are not rendered.
- Status: **PARTIAL**. Current runner/recovery path cannot truthfully show location, recovery phase, “running” or “recovered”; viewport/browser proof is still open.

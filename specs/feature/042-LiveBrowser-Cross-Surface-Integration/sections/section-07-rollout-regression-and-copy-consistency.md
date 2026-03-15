# Section 07 - Rollout, Regression, And Copy Consistency

## Goal

Finish the integration with cross-surface regression coverage, copy consistency checks, and rollout notes that keep Feature 036 stable during adoption.

## Scope

- Verify shared Browser Session wording across all affected surfaces.
- Add regression coverage around navigation, reopen behavior, and compatibility.
- Document rollout sequencing and ownership handoffs by surface.
- Define per-surface feature-flag rollout and rollback behavior.
- Define observability and analytics requirements for the integration layer.
- Define compact-layout and mobile behavior across supported surfaces.

## Implementation Notes

- Keep Feature 036 dedicated entrypoints functional while the broader product entrypoints land.
- Use focused regression suites rather than one end-to-end mega test.
- Treat Chat, Agency, and Workflow as separate rollout checkpoints sharing one copy contract.
- Include a rollout matrix for `chatBrowserSessionEntry`, `agencyBrowserSessionUi`, and `workflowBrowserSessionNodes`.
- Implement these rollout flags through the existing tenant feature flag stack:
  - `apps/web/shared/featureFlags.ts`
  - `apps/web/server/services/tenantFeatureFlagService.ts`
  - `apps/web/server/routers/tenantFeatureFlags.ts`
  - `apps/web/client/src/components/admin/TenantFeatureFlagsPanel.tsx`
- Use explicit admin labels and descriptions:
  - `Chat Browser Session` — Start and reopen Browser Session from Chat
  - `Agency Browser Session` — Show Browser Session nodes and session state in Agency
  - `Workflow Browser Session Nodes` — Enable collaborative Browser Session nodes in Workflow
- Track at minimum:
  - opens and reopens by origin surface
  - return-navigation failures
  - stuck `Needs Your Input` states
  - blocked `Take Control` attempts by reason
  - legacy workflow fallback usage
- Use the existing PostHog helper pattern for client-side product analytics and the project’s existing metrics or structured-log patterns for server-side signals.
- Keep metric labels low-cardinality:
  - `origin_surface`: `automation`, `chat`, `agency`, `workflow`
  - `reason_category`: `policy`, `step_up`, `state`, `navigation`, `render`, `legacy_fallback`, `unknown`
- Avoid labels based on session IDs, URLs, tenant names, or free text.
- Define release-gate or alert-threshold intent for:
  - return-navigation failures above baseline
  - stale `Needs Your Input` states beyond the chosen window
  - unexpected non-policy spikes in blocked control attempts
  - elevated workflow legacy fallback after rollout
- Mobile and compact layouts remain observe-first; the copy contract must explain this consistently.
- Optional infra follow-up after implementation should leave ready defaults for:
  - thresholds
  - dashboard or saved-query slices
  - alert routing
  - runbook pointers

Recommended optional thresholds:
- return-navigation failure rate
  - canary: above 2 percent over 15 minutes
  - broader rollout: above 1 percent over 30 minutes
- stale `Needs Your Input`
  - warning: more than 5 stale sessions older than 10 minutes
  - critical: more than 15 stale sessions older than 15 minutes
- workflow legacy fallback
  - warning: above 20 percent after rollout week 1
  - critical: above 10 percent after stabilization
- unexpected non-policy blocked control attempts
  - warning: above 5 events in 15 minutes
  - critical: above 20 events in 15 minutes

Recommended optional dashboard or query slices:
- opens and reopens by origin surface
- return-navigation success versus fallback
- stale `Needs Your Input` count over time
- blocked `Take Control` attempts by reason
- workflow legacy fallback rate
- Agency browser-session render failures

Recommended optional alert routing:
- web or frontend on-call: return-navigation failures
- workflow or Python owner: legacy fallback and runtime stale waits
- Agency owner: Agency browser-session render failures

## Tests

- Cross-surface copy consistency tests where practical
- Regression coverage for:
  - Automation resume
  - Chat return behavior
  - Agency browser-state rendering
  - Workflow legacy compatibility
- Telemetry emission or instrumentation tests for the minimum required metrics
- Compact-layout observe-only behavior tests
- Feature flag validation, resolution, and admin panel tests for the new Browser Session rollout flags
- Low-cardinality label tests where instrumentation helpers are introduced

## Acceptance

- The integrated Browser Session capability can roll out without regressing the dedicated automation path or creating inconsistent user-facing language.
- Per-surface rollout and rollback is possible without disabling the entire Browser Session capability.
- The rollout plan names the concrete flag keys, analytics events, and telemetry signals required for implementation.
- Optional infra follow-up defaults exist for thresholds, dashboard slices, alert routing, and runbook direction.

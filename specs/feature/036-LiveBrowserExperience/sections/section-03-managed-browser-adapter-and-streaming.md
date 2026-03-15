# Section 03: Managed Browser Adapter And Streaming

## Goal

Integrate the chosen managed live-browser provider behind a strict adapter contract and define how viewport/control transport works without becoming the business-state authority.

## Scope

- Build a provider adapter for session provisioning, attach, token issuance, token refresh, disconnect signaling, and teardown.
- Support observer and controller token modes.
- Surface multi-tab metadata and evidence handles required by the live session manager.
- Define reconnect behavior and transport failure mapping.
- Keep transport events separate from durable business events.
- Define active-tab restoration and tab-cap behavior through the adapter contract.

## Implementation Work

1. Define a provider adapter interface that exposes only the required Phase 1 capabilities.
2. Implement the managed-provider adapter behind that interface.
3. Add token issuance and refresh hooks for observer and controller access.
4. Define provider disconnect and readiness signals and feed them into the live-session runtime.
5. Add mapping for provider artifacts or screenshots into evidence handles without leaking provider-specific internals into frontend code.
6. Ensure transport reconnect does not imply control ownership changes.
7. Implement tab inventory, active-tab reporting, tab switching, and tab-cap failure handling through the adapter contract.

## Tests To Write First

- Test: the adapter fails closed when required provider capabilities are unavailable.
- Test: observer and controller token issuance obey session scope and expiry rules.
- Test: token refresh updates transport state without changing controller ownership.
- Test: disconnect callbacks surface incidents without silently reassigning control.
- Test: provider evidence handles are returned in the format expected by the session manager.
- Test: readiness checks distinguish allocation failures, attach failures, and token-refresh failures.
- Test: active-tab identity survives reconnect or triggers an explicit blocked state when it cannot be restored safely.
- Test: tab-cap failures are explicit and auditable.

## Files And Areas Likely Touched

- new provider adapter modules in `python-backend/app/`
- Node token issuance and provider readiness integration points
- live event transport/replay helpers

## Risks And Guardrails

- Do not let provider callbacks mutate session authority directly.
- Do not expose provider credentials directly to the browser.
- Keep a future self-hosted transport path possible by preserving the adapter boundary.

## Done Criteria

- Managed provider is integrated behind a strict adapter.
- Viewer/controller transport tokens work through the adapter.
- Reconnect and disconnect semantics are explicit.
- Transport state can feed runtime recovery without becoming the source of truth.

## As-Built

- Actual files changed:
  - `python-backend/app/services/live_browser_adapter.py`
  - `python-backend/tests/unit/services/test_live_browser_adapter.py`
- Deviations from plan:
  - The section introduces the strict provider adapter boundary and a deterministic in-memory managed backend so transport semantics are locked down before wiring a real external provider.
  - Node-issued stream tokens and provider-specific credential plumbing remain deferred to section 04, but the Python-side transport contract now defines the scopes, readiness checks, evidence handles, reconnect behavior, and tab semantics that section 04 will consume.
- Tests added/updated:
  - `python-backend/tests/unit/services/test_live_browser_adapter.py`
- Known follow-ups:
  - Replace the in-memory managed backend with the real provider integration once Node gateway token issuance and provider configuration are wired.
  - Feed adapter disconnect and readiness incidents into the live-session manager and later operational telemetry paths.

# Section 01 - Shared Language And Presentation Contract

## Goal

Create one source of truth for how Browser Session actions and states are presented to users. This section prevents Chat, Automation, Agency, and Workflow from inventing different names for the same behavior.

## Scope

- Introduce a shared browser-session presentation module in the web client or shared type layer.
- Map internal runtime states into product-facing labels.
- Standardize CTA labels and helper text.
- Keep internal transport fields unchanged behind the adapter.
- Define one additive shared contract for:
  - `browserSessionSummary`
  - `browserSessionLaunchContext`
  - `browserSessionReturnContext`
  - state-to-copy mapping helpers

## User-Facing Terms To Enforce

- `Open Browser Session`
- `Continue in Browser`
- `Reopen Browser Session`
- `Take Control`
- `Return to AI`
- `Needs Your Input`
- `Review Required`
- `Browser Instruction`
- `Session Ended`

## Implementation Notes

- Audit current live-browser copy in Automation components and shared contracts first.
- Make the adapter easy for Chat, Agency, and Workflow UIs to consume without re-encoding status logic.
- Keep a clear distinction between internal protocol values and rendered product strings.
- Include helper utilities for badges, banners, button labels, and short session summaries.
- Treat this section as contract-first work. Downstream sections should consume these shapes rather than redefining them locally.
- Include explicit compact-layout copy helpers so "observe-only" behavior is rendered consistently.
- Lock the default status lines in this section so later UI work reuses the same copy:
  - `AI is working in this Browser Session.`
  - `Review Required before AI can continue.`
  - `Needs Your Input before AI can continue.`
  - `You are controlling this Browser Session.`
  - `AI is controlling this Browser Session.`
  - `Reconnecting to this Browser Session.`
  - `This Browser Session has ended.`
  - `Manual control is unavailable on this screen size.`

## Files Likely Touched

- `apps/web/client/src/components/automation/*`
- `apps/web/client/src/components/chat/*`
- `apps/web/client/src/components/agency/*`
- `apps/web/client/src/components/workflow/*`
- `apps/web/shared/liveBrowser.ts` or a neighboring shared presentation module
- `apps/web/client/src/lib/analytics/` for shared Browser Session analytics helpers

## Tests

- Add unit tests for status mapping and copy reuse.
- Add unit tests for shared summary and launch/return context helpers.
- Verify sensitive-state notices remain explicit and do not regress to vague wording.
- Add unit tests for the Browser Session analytics helper module if created in this section.

## Acceptance

- All Browser Session surfaces can use the same adapter for labels and short state descriptions.
- All affected surfaces can use the same additive summary and launch/return metadata contract.
- No primary UI text exposes raw transport terms like `viewer`, `controller`, or `token`.

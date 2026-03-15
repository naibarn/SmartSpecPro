# Implementation Plan TDD - Feature 042

## Section 1 - Shared Language And Presentation Contract

Write tests for shared browser-session status mapping, summary-shape helpers, launch and return context helpers, and CTA label reuse before replacing ad hoc copy in existing components. Verify sensitive states still surface clear security prompts.

## Section 2 - Navigation And Origin Return Contract

Add tests that open Browser Session from multiple origins and confirm close or back behavior returns to the correct source. Verify direct deep-link resume still works when no origin state is present and compact-layout observe-only behavior still applies.

## Section 3 - Chat Browser Session Integration

Add tests for Chat entrypoints, chat-thread browser-session summaries, reopen behavior, return-to-thread navigation, and flag-gated fallback. Cover the empty-state and previously-active-session cases.

## Section 4 - Agency Browser Session Primitive

Add tests for agency builder node registration, property rendering, validation behavior for the new browser collaboration primitive, and load-time compatibility for existing agency graphs.

## Section 5 - Agency Chat Browser Session Surface

Add tests for browser-session activity rendering in Agency Chat, including running, review required, needs user input, person in control, reconnecting, ended states, and reopen behavior under flag-gated rollout.

## Section 6 - Workflow Browser Session Node Semantics

Add contract tests for additive node registry definitions and executor behavior covering start, wait, instruction, and review semantics. Add backward-compatibility tests for legacy one-shot `web_automation` behavior and serializer or loader normalization.

## Section 7 - Rollout, Regression, And Copy Consistency

Add integration and regression tests for shared label reuse, origin navigation, resume behavior, compatibility mapping across Automation, Chat, Agency, and Workflow surfaces, plus:

- feature flag validation and admin-panel visibility for:
  - `chatBrowserSessionEntry`
  - `agencyBrowserSessionUi`
  - `workflowBrowserSessionNodes`
- Browser Session analytics helper event emission
- telemetry emission for return failures, stuck waits, blocked control attempts, and workflow legacy fallback
- copy snapshot or equivalent assertions for required status text
- low-cardinality metric label assertions where instrumentation helpers exist

## Section 8 - Agency Runtime Browser Session Execution

Add Python orchestrator tests that prove `browser_session` nodes execute rather than falling through to unknown-node handling. Cover session creation, run-context persistence, handoff-mode branching, resumable follow-up turns, and Agency Chat activity payload generation.

## Section 9 - Browser Session Stream Renderer

Add web tests for a real browser stream viewport component that consumes viewer and controller stream tokens. Cover observe mode, takeover mode, reconnect fallback, token refresh, and compact-layout observe-only degradation.

## Section 10 - Chat And Agency Natural Browser Invocation

Add tests for assistant-proposed Browser Session launch cards, explicit user confirmation, automatic artifact persistence after launch, and launch analytics that distinguish suggested versus direct creation paths.

## Section 11 - Research And Comparison Contracts

Add contract tests for normalized browse-and-compare outputs. Cover multi-option extraction, price and currency normalization, distance or location summaries, evidence linkage, and rendering of a reviewable comparison payload from Chat, Agency, or Workflow flows.

## Section 12 - Login, Captcha, And Commitment Gates

Add tests for explicit barrier-state mapping and safety rules. Cover login required, captcha required, payment review required, booking confirmation required, MFA step-up, and mandatory human confirmation before irreversible submission.

## Section 13 - Advanced Rollout Scenario Validation

Add high-signal scenario tests across web and Python boundaries for:

- Agency run reaches an executable `browser_session` node
- Chat launches Browser Session from a suggested action
- browser stream renderer reconnects after token refresh
- captcha pauses execution and surfaces a human action requirement
- payment or booking submit is blocked until explicit confirmation
- normalized comparison outputs remain stable across surfaces

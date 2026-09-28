# Deep-plan Interview Record — Feature 157

Date: 2026-08-23

## Interview status

No additional blocking question was required. The user's explicit instruction
was to implement the complete production-hardening scope, preserve the current
UX, continue through deep-plan and deep-implement, and close gaps through
multiple review loops. The prior approved Feature 157 design and v1.3.0 scope
freeze are treated as the user's decisions for this planning session.

## Decisions used by the plan

1. Use one deterministic-first assurance boundary across Draft QC, story,
   prompt, media, B-roll, and season stages.
2. Keep Node/domain services authoritative for state, ledger, credits, provider
   submission, tenant scope, and final activation gates.
3. Keep the existing Agent Runtime/Python OpenAI Agents SDK bridge as a bounded
   proposal/evaluation layer; do not create a second runtime or direct browser
   integration.
4. Preserve the existing six-step wizard, save/edit/preview/confirm flow,
   source/profile behavior, and legacy client compatibility.
5. Treat Agent outage as a degraded/fallback condition for editable work and a
   final-boundary wait/retry condition for paid/export/publish work.
6. Require exact source/context fingerprints, candidate-versus-active fencing,
   idempotent credit/provider effects, durable recovery, and replayable tests.
7. Implement all dependency-ordered waves in the plan, using flags/canaries to
   control activation rather than omitting later-stage contracts.

## Items the plan must decide from code evidence, not user preference

- Which existing Feature 151/152 durable owner can represent attempts/events,
  and whether an additive assurance table is genuinely necessary.
- Exact router/service symbols and migration files for each logical operation.
- The current credit owner and provider-call idempotency mechanisms for each
  adapter.
- The smallest compatible shared Agent task-kind mapping/version change.
- Focused test commands and browser fixtures that are valid in this checkout.

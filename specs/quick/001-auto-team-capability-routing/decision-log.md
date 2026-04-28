# Decision Log

## Depth

Chosen depth: `standard`.

Reason: The implementation is cross-module, but this pass is stabilization of already-implemented behavior rather than a new architecture. A full deep-plan would slow closure and risk expanding scope again.

## Decisions

1. Freeze scope to Work Request / Auto Team completion only.
2. Treat tests and typecheck as the primary closure gate; manual E2E is documented as required when real provider credentials are available.
3. Keep fully-auto behavior narrow: default privileged-surface gates can be lifted for Work Request auto runs, but explicit `metadata.requiresApproval === true` remains authoritative.
4. Prefer automatic wait/retry for async media/video capacity over pausing for human approval.
5. Reuse existing skill/agency/media/document systems; do not invent a new orchestrator.
6. Stabilize duplicate/stale automation launch behavior with idempotency, active-run guard, and stale kickoff recovery.
7. Keep managed media links bearer-token-like and user-bound; admin access must use a separate audited route in the future.

## Self-Review Rounds

Round 1: Added explicit freeze and non-goals to prevent scope creep.

Round 2: Added security boundary checklist because media tokens and auto execution are sensitive.

Round 3: Split acceptance into functional, safety, and verification gates to avoid vague "done".

Round 4: Added full-suite risk note because targeted tests pass but the working tree is very large.

Round 5: Confirmed no open product choice is needed before executing the stabilization plan.

Round 6: No new auto-fix items.

Round 7: No new auto-fix items.

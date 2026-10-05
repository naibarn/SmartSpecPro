# Orchestra Lifecycle

```yaml
task_id: spec263-270-public-completion-20261005
phase: FINAL_VERIFY
resume_from: integration_checkpoint
state: implementation_checkpoint_ready_external_gates_open
user_authorized: implementation, sub-agent scouting, safe main integration
build_requested: false
full_typecheck_requested_this_turn: false
```

## Phase record
- PLANNING: complete; task-scoped contract, plan, and blockers recorded.
- TDD_DESIGN: complete for homepage/provider defects; regression tests cover route/copy/canonical schema and fail-before-provider behavior.
- IMPLEMENT: complete for safe low-risk homepage correction and provider boundary defect.
- VERIFY: focused 15-file/110-test candidate gate passed; whitespace/conflict review pending final pass.
- DEBUG_FIX: complete; corrected stale truth test that assumed links lived in `Home.tsx` rather than the new public UI boundary.
- REVIEW: read-only Spec 270 scout found no safe route around durable-owner/Spec 224/256 authorities; findings captured.
- FINAL_VERIFY: in progress; no browser/build/full-typecheck/production/deploy claims.
- INTEGRATE: pending latest-origin refresh and repo skill procedures.

## Close status
Repository-owned changes are ready for a safe development checkpoint after final gate. Specs 263 and 270 remain not fully complete because required rights, durable-owner, live authority, browser, analytics/crawl, provider-certification, and production evidence gates remain open. The external work cannot be represented as code-complete.

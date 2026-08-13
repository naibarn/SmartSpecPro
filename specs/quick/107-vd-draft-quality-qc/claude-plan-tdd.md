# TDD plan: Vertical Drama Draft Quality QC

## Shared contracts and score engine

- Verify all eight criteria exist exactly once and weights total 10.
- Verify raw scores are bounded to 0–5 and invalid/missing/duplicate criteria
  are rejected or normalized safely.
- Verify weighted scores and the final rounded score are computed server-side.
- Verify each hard-fail condition blocks automatic pass.
- Verify deterministic tie-breaking and best-candidate selection.

## Skill contract

- Verify paired skill files stay equivalent where the project requires twin
  copies.
- Verify evaluate output contains every rubric id and cannot return a revised
  draft.
- Verify revise output contains a complete candidate and preservation markers.
- Verify skill schemas parse and reject malformed output.

## QC service and job

- Verify baseline always evaluates even when max improvement rounds is zero.
- Verify each improvement round calls revise then evaluate.
- Verify lower-scoring candidates are discarded and higher-scoring candidates
  replace the best candidate.
- Verify pass, two non-improvements, and max-round termination independently.
- Verify reservation is created from the estimate, actual calls draw usage, and
  unused credits are refunded on success, failure, and cancellation.
- Verify a missing Redis/BullMQ enqueue does not produce a false pass.
- Verify session/tenant/user ownership and TTL behavior.

## Router and create receipt

- Verify start/status/cancel input limits and owner checks.
- Verify client-supplied score/report cannot authorize create.
- Verify a matching server receipt persists only sanitized QC audit data.
- Verify stale, expired, wrong-user, wrong-candidate, failed, and non-pass
  receipts are rejected.
- Verify old create payloads and old bibles remain accepted.

## Wizard UI/UX

- Verify idle, running, success, strong-but-blocked, exhausted, failure, and
  stale states render with bilingual labels.
- Verify Apply and Next remain disabled until the current passing result and
  explicit Apply are both present.
- Verify changing source invalidates QC and prevents stale application.
- Verify score breakdown and credit estimate are visible without color-only
  interpretation.
- Verify keyboard labels/live region and responsive class/layout contracts.

## Focused commands

- `npm --workspace @smartspec/web run test -- <focused files>`
- `git diff --check`
- filtered `npm --workspace @smartspec/web run check` diagnostics for changed
  files only

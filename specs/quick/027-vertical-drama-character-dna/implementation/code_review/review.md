# Inline Code Review

## Security and abuse

Status: clean after fixes.

- Every current/history query repeats tenant and user ownership predicates.
- Browser snapshots are strict, bounded, and correlated to the owned character key.
- Story, archive, character, and custom text are explicitly treated as untrusted data in
  the LLM boundary.
- Review fix: output must contain the exact requested `character_id`; first-item fallback
  can no longer persist another result under the target character.
- Review fix: role tier and comparison evidence are server-derived/verified, preventing a
  model from downgrading a lead or claiming missing history to bypass thresholds.

## Logic and data integrity

Status: clean after fixes.

- Atomic JSONB update changes only `data.visualBible` and preserves sibling data.
- Approved identity fields cannot drift during routine regeneration.
- Anti-clone dimension labels must be unique, not repeated to satisfy array counts.
- Archive failure is explicit and non-destructive; current-cast failure remains blocking.
- Persistence occurs only after successful task submission, and failure never duplicates a
  paid media task.

## UX and compatibility

Status: clean.

- Existing portrait preview and direct sheet interactions remain in place.
- Edited prompt behavior is explicit and actionable in Thai/English.
- Legacy approved-prompt callers remain render-compatible without silently persisting DNA.
- No layout, visual token, responsive breakpoint, accessibility control, or dependency
  changed.

## Convergence

1. Fix round: added strict browser bounds, current/history caps, circular-dependency guard.
2. Fix round: preserved exact child/reference/custom-instruction priority and one-call flow.
3. Fix round: added role-tier authority and false-pass score rejection.
4. Fix round: added authoritative evidence counts, provisional incomplete history, and
   canonical identity immutability.
5. Fix round: added archive degradation, unique anti-clone dimensions, and exact target
   correlation.
6. Clean round: no remaining security, data-loss, paid-call, or UX issue found.
7. Clean round: targeted regressions, changed-file type filter, JSON parse, and diff checks
   converge with no implementation-scoped failure.

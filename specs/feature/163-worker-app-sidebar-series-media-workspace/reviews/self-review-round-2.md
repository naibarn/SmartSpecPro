# Plan self-review round 2 — security and tenant boundaries

## Findings

- Safe projections and native path boundaries were described, but publication
  and cached authority needed an explicit current-policy recheck.
- Shared/group/tenant Series list must avoid enumeration side channels.

## Fix applied

Added current access/policy/binding rechecks, safe redaction, bounded stale
cache behavior, and uniform not-found behavior to the plan.

Status: fixed.

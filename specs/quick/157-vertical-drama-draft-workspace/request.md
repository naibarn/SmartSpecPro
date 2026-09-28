# Request

Implement the approved Vertical Drama Planning direction: replace the primary
new-series modal entry with a URL-addressable Planning surface that creates a
lightweight Series shell immediately, reuses the existing six-step wizard, supports
durable recovery, and promotes the selected Draft/QC in-place.

## Assumptions

- The existing vertical-drama draft ledger, source-pack session, composition, and
  QC contracts are authoritative and must be preserved.
- The Series shell is created before Draft generation and is the only workspace
  identity from that point forward.
- Draft/QC ledgers remain immutable history and are loaded lazily, never as part of
  the normal Planning/detail payload.
- The existing modal remains available as a compatibility fallback during rollout.

## Non-goals

- Rewriting the story-generation/QC pipeline.
- Creating a second copy of Bible, Characters, Locations, or Source Pack editors.
- Changing paid generation policy or provider routing.

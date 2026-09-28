# Plan self-review round 3 — lifecycle and failure recovery

## Findings

- Revoke/drain behavior was present but needed an explicit state machine for
  queued, running, uploading, publishing, and indexing work.
- Multiple UI windows could otherwise duplicate background control loops.

## Fix applied

Added monotonic local/server state, one coordinator lease, pinned binding
revision, reconciliation/quarantine, and publication blocking after revoke.

Status: fixed.

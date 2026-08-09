# Plan Self-Review Round 1

## Review mode

Adversarial review of the implementation plan against the approved design, current repository conventions, and failure cases around paid async media work.

## Findings and fixes

### Finding 1: Lost response could still duplicate paid generation

The first plan version described idempotency behavior but left the storage mechanism optional. If the provider task was created and the HTTP response was lost before the cover row was persisted, a retry could submit a second task.

**Fix:** The plan now persists an internal `idempotencyKey` in the cover JSONB state and explicitly requires same-key replay to return the existing task/state, with the key stripped from client projections. The state is still nullable and additive; no new table is needed.

### Finding 2: Upload could orphan the credit/task reconciliation path

The first plan version said a manual upload clears `pendingTaskId`, while also requiring stale task reconciliation. If the client stopped polling after the upload, the old task id would no longer be discoverable.

**Fix:** The plan now requires retaining a private superseded-task cleanup handle until a status reconciliation observes the old task's terminal state. Manual upload remains immediately authoritative and visible as ready; stale provider completion cannot overwrite it.

### Finding 3: Projection leakage risk

The internal state contains prompt, asset id, and replay bookkeeping, which are useful for server reconciliation but not needed by the Episodes tab.

**Fix:** The plan explicitly defines a display-safe projection and requires stripping `prompt`, `mediaAssetId`, provider metadata, and `idempotencyKey` from `verticalDramaSeries.get`.

### Finding 4: Existing card navigation could be broken by new actions

Cover actions inside the current episode card could accidentally become nested interactive elements inside the episode link.

**Fix:** The UI contract requires a separate cover action surface, keyboard-accessible controls, and no nested link/button semantics. The existing episode navigation remains independently reachable.

## Self-review conclusion

After these fixes, the plan is structurally complete for implementation: it has a single-writer data boundary, exact prompt/reference rules, server-owned paid async lifecycle, stale-task handling, UI state/accessibility requirements, focused verification, and a file-scoped rollout boundary.

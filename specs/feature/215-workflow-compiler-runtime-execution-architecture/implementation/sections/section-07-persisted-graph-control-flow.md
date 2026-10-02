# Section 07 implementation record — persisted graph control flow

Status: partial / in progress.

## Implemented locally

- Static acyclic data dependencies are persisted as logical node rows and scheduled only after predecessor outputs commit.
- Graph cycles and empty graphs fail during compilation.
- Control, error, and event channels fail closed rather than being treated as ordinary data dependencies.
- Checkpoint/run-from selection preserves pinned completed predecessor refs.

## Remaining acceptance gaps

- `flow.router`, `flow.join`, `flow.loop`, and `flow.subflow` do not yet have durable branch, join, iteration, expansion, or parent/child lineage state machines.
- Dynamic expansion quotas, branch-output semantics, restart replay, and bounded loop/deadline enforcement are absent.
- Runtime invocation remains disabled until exact manifest adapters are configured.

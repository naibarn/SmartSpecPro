# Owner lease lifecycle event evidence — 4850d2bd1b06

Code checkpoint integrated at `4850d2bd1b067f9f9c2a292099c6d8233ad39ba8` via [PR #132](https://github.com/naibarn/SmartSpecPro/pull/132); provider authority was integrated via [PR #131](https://github.com/naibarn/SmartSpecPro/pull/131).

- A known owner lease that expires is reflected in the safe local audit receipt and triggers an idempotent `OWNER_LEASE_EXPIRED` evaluation in `worker_jobs`; the path only evaluates and never retires.
- Session finish already emits an idempotent event from RunnerGateway. Integration, handoff, canonical convergence, and recovery/archive production call sites remain to be added.
- Provider identity is sourced only from a fresh authenticated busy Runner agent-tool fact during a live session. Host profile and workspace name are not treated as provider evidence.
- Executable regression matrix is 68 cases. Workspace Authority tests 40/40, audit scheduler tests 8/8, project read-model tests 3/3.
- P0 remains `PARTIAL`; safe-action API/Runner execution, persistent cross-host conflict authority, full Mission Control aggregation, and remaining lifecycle producers are open. Next workunit `P0_INTERNAL_GAP_CLOSURE`.

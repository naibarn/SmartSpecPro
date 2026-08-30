# Plan self-review round 2 — existing UI and admin boundaries

Status: PASS after fixes.

- Existing worker fleet and MCP diagnostics are already rendered by
  `apps/web/client/src/pages/AdminMonitoring.tsx` at `/admin/monitoring`.
- The plan now extends that surface for Comfy policy/profile/workflow controls
  before considering a new route, preventing duplicate admin navigation.
- Existing Series policy is `workerMediaWorkflowPolicy`; the plan explicitly
  extends it rather than introducing a parallel Series policy store.
- Worker UI ownership remains in the existing Sidebar/canonical route shell.

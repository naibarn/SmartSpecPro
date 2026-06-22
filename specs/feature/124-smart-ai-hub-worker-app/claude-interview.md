# Interview And Decision Log: Feature 124 Smart AI Hub Worker App

Date: 2026-06-22

No new blocking stakeholder questions are required before planning. The user
provided a detailed product and architecture direction in the conversation and
asked to proceed with deep-plan.

## Captured Requirements

### Product Name And Target

- The desktop worker app name is **Smart AI Hub Worker App**.
- Windows is the first supported platform.
- The installer must be easy for non-technical users.
- Normal users must not edit `.env` files.
- Configuration must be available through UI.

### Render Architecture

- HyperFrames final composite rendering should move to workers.
- The server/web process should not run final video rendering as the normal
  path.
- Fallback render paths that produce lower-quality or preview-divergent output
  should be removed from the user-facing final composite path.
- If official HyperFrames CSS/browser runtime is not available, show the real
  actionable blocker instead of silently falling back.
- The long-term direction is to migrate all video rendering systems to the
  worker model, not only Storyboard Review HyperFrames.

### User Submit Flow

- Users submit jobs from the web UI without needing to know which worker will do
  the work.
- Users can submit multiple jobs into a queue and do not need to keep the
  submit page open.
- Users need a job monitor UI that shows queued/running/completed/failed jobs,
  worker assignment state, progress, and download links.
- Users can cancel jobs that are still waiting in queue.
- Users should be able to monitor jobs without returning to the original
  Storyboard Review page.

### Worker Assignment And Sharing

- Workers should automatically pull eligible jobs.
- A worker may be private, group-shared, or tenant-shared.
- Jobs must be locked so two workers do not process the same job.
- Worker count is not fixed; the system may have many workers online.
- Admin UI must show connected workers, owner, sharing scope, status, current
  job, and readiness.
- A worker does not need to be tied to the currently connected user only. It can
  run jobs for shared groups or tenant users according to policy.

### Long-Running Reliability

- Jobs may take a long time and must run in the background.
- The desktop app should continue processing while minimized.
- Web refresh or close/reopen must not lose visibility into active/completed
  render jobs.
- If a worker has accepted a job and it has not completed after about 30
  minutes, the system should treat it as suspicious/stalled and provide a safe
  handoff/requeue path.
- After about 15 minutes, the user should be able to request another worker if
  the job appears too slow.
- Stale worker uploads must not be accepted after reassignment.

### Desktop UX

- The app can be minimized.
- It should show ongoing job status and progress.
- It should have worker readiness/doctor status.
- It should be able to download required runtime packs inside the app if not
  bundled in the installer.
- The installed experience should be functionally complete without requiring
  users to understand developer tools.

### Auth

- Use the same user-facing connection pattern as the existing Chrome extension
  so users do not need a separate login inside the worker app.
- The app can open the browser to approve connection using the existing logged
  in SmartAIHub web session.
- Token scopes and server validation must be worker-specific.

### Future Extensibility

- The worker platform should support future non-render jobs.
- Local AI jobs should support adapters such as LM Studio and Ollama, accepting
  text/image inputs and returning structured outputs/artifacts.
- MCP agent workers should be planned so Claude, Codex, Hermes, or other
  MCP-capable agents can log in to SmartAIHub MCP, claim jobs, work on them, and
  report results.
- Future capabilities should use the same queue/claim/upload/verify contract
  where possible.

## Planning Decisions

### Queue Decision

Use the existing `worker_jobs` queue as the target for HyperFrames final
composite. Do not create a new table family unless the existing schema cannot
express a required invariant after detailed implementation.

### Projection Decision

Keep Storyboard Review's existing HyperFrames render projection API as the web
UI compatibility contract. The backend should map HyperFrames worker job state
into `HyperframesRenderStatusProjection` so existing polling, refresh recovery,
and output handling continue to work.

### Runtime Decision

Use official HyperFrames runtime through a desktop sidecar/runtime pack. Do not
use ASS/FFmpeg overlay fallback for accepted final composite output. FFmpeg and
FFprobe remain allowed for probing, muxing, and post-render verification tasks
when they do not replace HyperFrames composition.

### Worker Sharing Decision

Workers must be selectable by eligibility policy, not manual per-render
selection in the normal user path. Admin/owner can configure sharing scope.
User-facing reassign should express intent such as "try another worker" rather
than requiring the user to choose a machine.

### Worker Stall Decision

Use a two-level policy:

- 15 minutes after assignment: user-visible "request another worker" action if
  progress is weak or no meaningful progress is reported.
- 30 minutes after assignment without completion or heartbeat/progress: watchdog
  marks the attempt stalled and requeues or requires admin intervention based on
  job safety policy.

### Auth Decision

Reuse the extension-style connect UX, but implement worker-specific token
audience/type/scopes and a worker connection record. Do not let extension tokens
act as worker tokens.

### UI Decision

Add a job monitor surface for users and an admin worker monitor. Storyboard
Review remains the submit surface, but it must show persisted job state after
refresh and link to the job monitor.

### Rollout Decision

The implementation should be feature-flagged and migrate final composite first.
Other render systems should be prepared for later migration, but not fully
rewritten in the first implementation section set.

## Non-Blocking Open Decisions For Implementation

These do not block planning, but implementation should resolve them deliberately:

- Resolved after latest clarification: create `apps/worker-app` as a separate
  lightweight Smart AI Hub Worker App product. Do not rename or require the full
  `apps/tauri-shell` product for render worker users.
- Whether the first Windows release bundles the full HyperFrames runtime or uses
  a lightweight installer with first-run runtime download.
- Whether `assignmentAttempt` requires new columns or can initially live in
  `worker_jobs.outputJson`/`instructionsJson` with migration later.
- Exact credit reservation timing for queued jobs that may wait a long time.

# Smart AI Hub Worker App Implementation Usage

## Runtime Flow

1. Enable tenant flags for the staged rollout:
   - `desktopZeroClawWorker`
   - `hyperframesWorkerFinalComposite`
2. User submits HyperFrames final composite from Storyboard Review as usual.
3. Server queues a `worker_jobs` record for `hyperframes_final_composite`; server
   render fallback is not used on this worker-enabled path.
4. Smart AI Hub Worker App claims the job, receives an `assignmentAttempt`,
   runs the official HyperFrames sidecar, uploads required artifacts, and
   reports progress.
5. Server verifies the required artifacts before publishing the final MP4.
6. User can monitor jobs at `/render-jobs`.
7. Admin can monitor worker fleet and queue health at `/admin/monitoring`.

## Worker App

- App location: `apps/worker-app`.
- Runtime pack placeholder: `apps/worker-app/runtime-pack`.
- Build checks:
  - `npm --prefix apps/worker-app run typecheck`
  - `npm --prefix apps/worker-app run build`
  - `npm --prefix apps/worker-app run runtime:pack`
  - `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml`

## Safety Contracts

- One worker pairing token is bound to one machine/device proof.
- HyperFrames uploads must include the current `assignmentAttempt`.
- Server rejects missing/stale attempts and fallback render evidence.
- Jobs active for 15 minutes become user-reassignable; stalled jobs at 30
  minutes can be requeued by watchdog policy.
- Local AI and MCP worker contracts are reserved only; no submission UI or
  execution route is enabled by this feature section.

# Orchestra Plan

## Task
Find the real cause of corrupted/unplayable MP4 files produced by the Worker App HyperFrames final composite renderer, then fix the end-to-end path so completed worker renders are actually playable.

## Classification
- scope: medium
- risk: medium
- affected_domains: worker-app Rust executor, worker artifact upload/publication, server verification, tests
- estimated_file_count: 6-10
- chosen_route: direct-inline-waves
- task_summary: Debug and repair Worker App HyperFrames final MP4 generation/upload/verification so completed renders are usable.
- bug_route: data-first-debug
- parallel_default: true
- planned_agents: []
- dispatch_preference: direct-standard-light

## Skill Activation
- orchestra: explicitly requested and used.
- SocratiCode: active and used as the default discovery layer.
- sub-agents: skipped because Codex standard light mode requires explicit user authorization for delegation.

## Evidence Ledger
- source: ui-error
- identifier: Windows media player error for `afce2d859f8675f4db71914-final.mp4`
- observed failure: cannot open file; unsupported/corrupt; error `0xC00D36C4`
- data state: local DB artifact row showed `sizeBytes: 18` for the published final MP4 while probe/verification claimed `durationSec: 238.3`.
- root cause: the packaged HyperFrames sidecar was the mock renderer; it writes the literal text `mock video content` as `final.mp4`, whose SHA-256 matches the published artifact checksum `cff40476b79b0adbc845136bd90294841a8073ee71f03031de75d6eb1e998f87`.
- confidence: high
- fix strategy: fail closed at runtime doctor, worker pre-upload validation, server verification, and release packaging.

## Impact Preflight
- Candidate areas from SocratiCode:
  - `apps/worker-app/src-tauri/src/worker_executor.rs`
  - `apps/worker-app/src-tauri/src/worker_loop.rs`
  - `apps/web/server/services/hyperframesWorkerVerificationService.ts`
  - `apps/web/server/services/workerArtifactService.ts`
  - `apps/web/server/services/workerJobMonitorService.ts`
  - related service tests
- Risk-sensitive surfaces:
  - artifact verification must not mark corrupt outputs completed
  - signed/private URLs and local paths must not leak
  - worker upload must preserve assignment/attempt and content hash checks

## Waves
- Wave 1: collect evidence from actual artifact/job/file and identify root cause.
- Wave 2: implement fail-closed validation in Worker App, server verifier, and release packaging.
- Wave 3: run targeted unit/type/Rust checks and close gaps.

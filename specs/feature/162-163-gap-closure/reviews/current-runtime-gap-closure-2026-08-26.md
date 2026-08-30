# Feature 162/163 current-runtime gap closure

Date: 2026-08-26  
Scope: current Worker-first media path after the user decision to treat
HyperFrames as legacy/optional.

## Closed repository-level gaps

1. All current local media commands and the Worker media executor now resolve
   FFmpeg/FFprobe through one `MediaToolchain`. Native runtime-pack and Managed
   WSL modes use their configured runtime binaries; media work no longer
   depends on process `PATH` resolution.
2. Managed WSL path arguments are translated safely to `/mnt/<drive>/...`, and
   the command remains allowlisted. Both FFmpeg and FFprobe are checked before
   local media capability is advertised.
3. Runtime directory replacement is transactional across the paired
   `runtime-pack` and `sidecars` directories. If either staged directory
   cannot be installed, the previous pair is restored.
4. Heartbeat metadata advertises shot generation only after the live MCP
   manifest negotiation has passed the required tool/workflow checks. Merely
   finding the configured MCP executable is insufficient.
5. Media enqueue idempotency is checked against the existing job payload hash,
   including the concurrent insert race. A different payload cannot replay an
   existing job, and media keys are bounded to the `worker_jobs` column size.
6. Enqueued media probe metadata now reflects the local FFprobe result instead
   of placeholder dimensions/audio values.
7. Worker UI idempotency keys no longer embed unsanitized relative paths such
   as `incoming/clip.mp4` or a timestamp-only identity; keys are now bounded,
   schema-safe, and stable for the same source and edit intent.

## HyperFrames posture

HyperFrames is retained only for backward compatibility and a future optional
renderer lane. It is not the readiness or admission prerequisite for local
media ingest, analysis, preprocessing, QC, or publication in Feature 162/163.

## Local proof

- Rust `cargo fmt --check`: pass.
- Rust `cargo test --lib`: 178/178 passed.
- Focused Web tests: 6 files, 59/59 passed.
- Web TypeScript check: completed with no compiler output and no active `tsc`
  process afterward.
- Worker App TypeScript check: exit 0.
- `git diff --check`: pass.
- Windows NSIS installer `0.1.187` built with the existing cross-platform
  release script and copied to both dashboard release directories. Source and
  live copies have the same SHA-256.

## Final review rounds

- Round 1: current media commands and runtime binary resolution.
- Round 2: MCP negotiation and capability admission.
- Round 3: update/install contract and legacy renderer separation.
- Round 4: settings platform validation and rollback safety.
- Round 5: Rust tests, TypeScript checks, and static path audit.
- Round 6: release version calculation and runtime release gate.
- Round 7: installer PE/hash/dashboard parity verification.
- Round 8: dependency inventory and final user-facing blocked-runtime wording.
- Round 9: rebuilt the installer after the wording change so the artifact and
  source are the same snapshot.
- Round 10: final formatter, test, runtime gate, PE, hash, and dashboard-copy
  parity check.

## Evidence boundary

This closes code-level gaps only. A real packaged Worker run still requires a
machine with the selected runtime pack, a local footage fixture, configured
ComfyUI MCP/MiniMax H3 workflow, GPU, R2 credentials, and vector provider.
Those external executions were not fabricated from unit tests. The system
fails closed when those dependencies are unavailable.

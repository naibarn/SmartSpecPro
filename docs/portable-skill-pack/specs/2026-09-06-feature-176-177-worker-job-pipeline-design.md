# Feature 176/177 Worker Job Pipeline Design

## Goal

Connect the existing Web and Worker Control Plane into one durable workflow for
approved emotion/music plans. The Web creates an immutable approved snapshot;
the Worker claims jobs from the existing `worker_jobs` database queue, executes
real media work, publishes verified artifacts, and reports terminal state back
to the server. The Web and Worker UIs expose the same state and never show a
successful stage before its artifact and validation gates pass.

This design covers:

1. automatic dispatch of an approved plan;
2. `minimax_music3_generate` jobs;
3. music take artifact upload/publication;
4. artifact-backed ASR and edit-map output;
5. `episode_score_mix` FFmpeg execution and post-encode QC.

## Current repository boundary

The repository already provides `worker_jobs`, claim/lease/heartbeat/event
routes, presigned artifact upload, Worker series binding, Feature 176 semantic
plan persistence, and a fail-closed MiniMax sidecar contract. The implementation
must extend these contracts instead of adding a second queue transport.

The exact MiniMax adapter and model weights are an installation/runtime input.
The Worker must advertise the audio capabilities only after the sidecar proves
the exact model identity and the local GPU/runtime is usable. A development host
without NVIDIA hardware cannot be used as generation acceptance evidence.

## Approach and trade-offs

### Selected: existing DB-backed Worker Control Plane

Web inserts jobs into `worker_jobs`; a bound Worker claims them with its existing
lease token, sends progress/terminal events, uploads artifacts through the
existing presigned flow, and publishes the artifact through a typed callback.
Dependent jobs are admitted only after the previous artifact is verified and
the server creates the next job. This keeps tenant and binding checks in one
place, survives Web restarts, and avoids operating Redis/BullMQ for a workload
whose control plane already exists. Polling adds bounded latency but is simpler
to operate and already matches the Worker runtime.

### Rejected: direct Web-to-Worker push

Direct push would make the Web responsible for live Worker connectivity and
retries, and would be fragile across Worker restarts. It also duplicates the
existing claim/lease protocol.

### Rejected: a parallel Redis/BullMQ audio queue

A second queue would create two sources of truth for ownership, cancellation,
retry, and artifact lineage. It is not required for the requested scale and
would increase migration and operational risk.

## Contracts and data model

The shared audio contracts remain the source of truth. Each job input must carry
the following server-owned values:

- `contractVersion` and job kind;
- `tenantId`/series/episode identity validated from the authenticated context;
- `planId`, `planRevisionId`, `planHash`, `captionHash` where applicable;
- `bindingRevision` and source media asset IDs/checksums;
- an idempotency key and dependency artifact IDs;
- rights status/evidence scope snapshot;
- explicit output artifact requirements.

The server must not trust `approved` flags, URLs, checksums, or model labels that
arrive from a Worker payload. It resolves approval and rights from its own
records, then compares Worker-provided evidence at publication time.

Artifact types are typed and immutable by job lineage:

- `episode_asr_tokens` — canonical timed tokens, source checksum, duration,
  timing origin, provider/runtime provenance;
- `episode_edit_map` — immutable cut/source mapping, revision/hash, coverage and
  error metrics;
- `music_take` — WAV/measurement metadata, model identity/revision, caption and
  plan lineage, output checksum and rights snapshot;
- `episode_score_mix` — project-rate mix, protected-window/ducking evidence,
  FFmpeg command/runtime provenance, output checksum;
- `episode_score_mix_qc` — pre/post encode measurements, thresholds, actual
  values, and explicit pass/fail/unknown fields.

No artifact is eligible for the next stage until the server verifies ownership,
binding revision, checksum/size/MIME, expected artifact type, job lineage and
the required measurement fields.

## End-to-end data flow

1. User reviews the Web semantic plan, resolves critique, and approves the plan
   and rights scope.
2. Web creates an immutable dispatch snapshot and enqueues
   `episode_audio_analyze` with an idempotency key. The snapshot contains media
   references, not untrusted local paths.
3. Worker heartbeat advertises `episode_audio_analyze` only when the bundled
   ASR/FFmpeg runtime is ready. It claims the job and reports `preparing`,
   `running`, and measured progress.
4. Worker downloads authorized input media, probes duration/cut boundaries,
   runs real ASR with the activity gate, constructs the edit-map, uploads both
   artifacts, then reports completion. Silence is a valid explicit result;
   hallucinated tokens or out-of-duration tokens are rejected.
5. Server verifies and stores the artifacts, creates one or more
   `minimax_music3_generate` jobs for the approved cues, and exposes them to the
   same bound Worker.
6. Worker invokes the genuine MiniMax Music 3 adapter, writes a measured WAV,
   uploads the take plus QC/provenance metadata, and reports completion. Missing
   adapter, wrong model, unavailable GPU, unknown outcome, vocal detection, or
   short output is a truthful terminal failure.
7. Server lists only lineage-valid takes. User auditions/selects a take and
   authorizes the exact selected take hash. Server enqueues `episode_score_mix`.
8. Worker fetches the selected take and current source/cut artifacts, runs
   deterministic placement/ducking/FFmpeg mix, encodes the output, re-probes the
   encoded file, runs post-encode QC, and uploads mix + QC artifacts.
9. Server validates post-encode QC and current rights/binding snapshots before
   publishing the mix. Web displays the output and an undoable/non-destructive
   project revision. Dialogue, native audio, and unrelated manual tracks remain
   untouched.

Each stage is idempotent. A retry reuses the same idempotency key only when the
request hash is identical; a content or plan change creates a new revision and
new lineage.

## Server responsibilities

- Add typed enqueue functions for the three audio job kinds using the existing
  Worker scheduler/series binding admission path.
- Add a server-side stage coordinator that observes terminal artifact publication
  and creates the next dependent job transactionally or through an idempotent
  reconciliation pass.
- Add status projection for stage, percentage, current artifact, blocker code,
  retry/cancel availability, and stale-plan/binding warnings.
- Revalidate latest plan revision, rights, selected take checksum and binding at
  every transition; never rely on a cached Web badge.
- Keep user-facing tRPC queries/mutations owner- and tenant-scoped.
- Publish artifacts through the existing storage and media asset services; do
  not expose worker filesystem paths or private upload tokens.

## Worker responsibilities

- Extend job classification and capability hints for the three audio jobs only
  after real runtime readiness.
- Use the existing lease, active heartbeat, cancellation and event reporting
  helpers. A stale lease must stop publication and return a retryable failure.
- Keep all temporary files under a per-job directory with cleanup after verified
  upload; preserve a diagnostic pointer, not raw secrets.
- Use bundled FFmpeg/ffprobe for probe, mix, encode and post-encode measurement.
- Use the configured manifest-pinned whisper runtime for ASR and the exact
  MiniMax Music 3 adapter for generation. No synth, stock, alternate model,
  mocked metric, or fabricated artifact is a success path.

## Web UX

The episode page shows a stage timeline:

`Plan approved → ASR/edit-map → Music generation → Audition/selection → Mix/QC → Published`

Every stage has explicit queued/running/completed/needs-review/failed/canceled/
stale states, text labels in addition to color, progress and last update time.
The user can inspect source revision, actual timing origin, model/provenance,
artifact checksum, QC measurements and blocker remediation. Buttons are gated:

- Analyze is disabled while an equivalent job is active;
- Generate is disabled until plan, rights, ASR/edit-map and runtime readiness
  are valid;
- Select/apply is disabled for stale, incomplete, unknown-QC or mismatched takes;
- Export is disabled until post-encode QC and current rights validation pass.

Cancel/retry actions are idempotent and show the server-confirmed result. A
refresh or reconnect restores state from the server rather than local optimistic
state.

## Worker App UX

The Media Workspace adds an Audio Scoring job panel with:

- connection/binding status;
- exact runtime model/revision, GPU readiness and capability state;
- queue stage/progress and per-job log summary;
- plan revision/hash and rights scope shown before generation;
- cue/take list with real measurements and provenance;
- non-destructive Apply and Render/Export actions;
- actionable errors such as `MODEL_NOT_INSTALLED`, `GPU_UNAVAILABLE`,
  `RUNTIME_INCOMPATIBLE`, `PLAN_STALE`, `QC_FAILED` and `RIGHTS_REVIEW_REQUIRED`.

Auto Subtitle uses the same server-authorized input and displays whether timing
is observed ASR, aligned expected text, or human verified. It must not create a
five-second fallback segment when no timed speech artifact exists.

## Failure, retry and recovery

- Queue/network failure: retain queued/running state until lease expiry; the
  watchdog makes the job claimable again without duplicating artifacts.
- Worker crash: a new claim uses a new assignment attempt; old event/artifact
  submissions are rejected by lease/attempt checks.
- Missing runtime/model/GPU: do not claim the job unless capability is advertised;
  if readiness changes mid-job, fail with a specific code and keep the plan.
- Upload failure: retry upload with the same checksum and idempotency identity;
  never register a partial artifact.
- Stale plan/binding/rights: stop the chain, mark needs review, and require a
  new authorized snapshot.
- FFmpeg or analyzer error: QC is unknown/failed, never pass by default; allow a
  bounded DSP-only remediation only when the approved plan is unchanged.
- Cancellation: stop child processes/process groups, emit terminal canceled state,
  and leave already-published immutable artifacts readable but ineligible for a
  canceled lineage.

## Security and operational controls

Tenant/worker/binding checks are required on every enqueue, claim, input download,
artifact upload, artifact read, and publication. Plan text is inert data; it is
never interpolated into shell commands or dynamic imports. Tokens remain in
process memory/configuration and are never written to job payloads or logs.

Operational metrics should include queue depth, claim latency, lease expiry,
stage duration, GPU/VRAM peak, upload latency, artifact rejection reason and QC
failure reason. Use bounded polling/backoff and per-worker concurrency limits;
the RTX 5060 Ti 16GB profile must be benchmarked with the actual Music3 adapter,
including cold start, peak VRAM, duration, CPU/RAM and offload behavior, before
enabling production capability advertisement.

## Migration and rollout

Use additive Drizzle migration only if the current tables cannot represent the
typed stage coordinator or required lineage. Prefer JSON contract extensions and
existing `worker_job_events`/`worker_artifacts` first. If a new table is required,
add indexes for `(tenantId, jobType, status)`, `(workerJobId, artifactType)` and
lineage lookup, apply it with `db:migrate`, and verify the live ledger/table
shape before enabling the feature flag.

Roll out behind the existing `verticalDramaSeries` flag and a separate audio
runtime capability gate. Start with one bound Worker and one test episode,
then enable generation/mix only after real artifacts and post-encode QC are
observed. Rollback stops new jobs and preserves prior immutable artifacts and
project revisions.

## Acceptance and verification

- Contract tests reject wrong plan hash, binding revision, tenant, MIME,
  checksum, model identity, missing measurement and forged approval.
- Worker Rust tests cover claim dispatch, capability gating, cancellation,
  bounded ASR/edit-map normalization, artifact upload and stale leases.
- Web tests cover enqueue/reconcile/status projection, idempotency, owner scope,
  rights gates and stale revisions.
- Real runtime proof on RTX 5060 Ti 16GB records genuine Music3 health/probe,
  one generated WAV, checksum/provenance, actual FFmpeg mix, encoded re-probe,
  and post-encode QC. Test doubles cover negative paths only.
- Browser/native smoke proves Web approval, Worker claim, artifact appearance,
  audition, non-destructive apply and export status from fresh server state.

Completion means the creator can complete the full Web → queue → Worker →
artifact → Web → mix/export flow against the current cut. Source-only contracts,
mocked adapters, fabricated metrics, or a job that merely reaches `running` do
not satisfy completion.

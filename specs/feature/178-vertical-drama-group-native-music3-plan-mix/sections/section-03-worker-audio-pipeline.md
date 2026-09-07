# Section 03 — Worker Audio Pipeline

## Goal

Teach the Worker to execute the group-scoped durable pipeline: ASR/edit-map,
genuine MiniMax Music 3 generation, artifact publication, score mix and
post-encode QC, with no silent fallback.

## Ownership paths

- `apps/worker-app/src/types/audioScoring.ts`
- `apps/worker-app/src-tauri/src/worker_loop.rs`
- `apps/worker-app/src-tauri/src/worker_executor.rs`
- `apps/worker-app/src-tauri/src/media_pipeline.rs`
- existing Worker artifact/runtime and job binding modules discovered by the
  current audio dispatch path
- focused TypeScript tests, Rust tests and no-credit fixtures under
  `apps/worker-app/tests` / `apps/worker-app/src-tauri/tests`

## Implementation requirements

1. Parse the canonical group payload and reject episode/group mixed scope,
   missing managed storage refs, checksum mismatch, stale group/plan revision,
   missing rights approval or binding revision mismatch before work begins.
2. Claim durable jobs with the existing lease/idempotency behavior. ASR probes
   actual final-cut media and publishes real transcript tokens plus a
   cut-coordinate edit-map artifact containing group metadata/checksum. Preserve
   `empty`, `partial`, `unavailable` and `failed` outcomes and use a reviewed
   no-speech path for genuinely silent material; never inject authored dialogue.
3. Admit Music 3 only with genuine MiniMax model identity/revision, GPU/runtime
   capability, approved plan hash, rights snapshot, ASR/edit-map refs and input
   checksums. Record runtime/GPU/provenance metadata on every take, keep a
   durable attempt ledger, and hold only one heavy GPU inference lease at a time.
4. Publish each take only after measured duration, loudness and true-peak
   metadata is available. Provider/model/runtime failure is terminal/blocked;
   synthetic, stock, alternate-model and mock fallback are prohibited.
5. Implement group score mix from the managed final cut and selected published
   takes. Preserve native/dialogue audio under the approved delivery profile;
   create a new output revision using deterministic FFmpeg graph and probe.
6. Publish mix/export and QC evidence artifacts. QC checks stream presence,
   duration tolerance, checksum, audio format, loudness/true peak and revision/
   plan match.
7. Accept callbacks only for the current job binding/group/plan/checksums. A
   superseded callback is audited but cannot replace current published state.
   Upload failure is failed publication, not success.
8. Enforce bounded artifact size/token/duration inputs, authorized tenant-scoped
   storage access and typed error codes from Features 176/177.
9. Expose `scopeType`, group ID, stage, binding revision, capability block,
   artifact IDs and terminal reason in the Worker dashboard/media workspace;
   do not expose a control that can approve Web semantic plans or rights.

## TDD stubs

- Group payload admission and mixed-scope rejection.
- ASR/edit-map output has real timing, checksum and group metadata.
- Exact MiniMax identity/GPU metadata is required; no-fallback test covers
  provider failure and unavailable runtime.
- Take artifact publication and idempotent retry behavior.
- FFmpeg group mix input order, ducking, duration/probe and QC failure mapping.
- Stale callback cannot replace current group revision.

## UI/UX Contract

### Target User / JTBD

The producer needs trustworthy Worker progress and failure explanations without
mistaking a queued/running job for a published result.

### Surface Inventory

Worker job/artifact status is projected to the Web group panel and, where
available, the Worker dashboard; it is not a second approval authority.

### Component Map

The Rust executor owns media truth; Web services own admission and the group
panel renders the bounded status projection.

### State Matrix

Queued, running, published, blocked, failed and superseded callback states must
remain distinguishable and carry a deterministic reason/artifact summary.

### Responsive Matrix

No direct layout change; status metadata must remain compact enough for section
04's narrow take/status rows.

### Accessibility Acceptance

Progress and terminal status must be readable as text and announced politely;
model identity, QC and failure are never color-only.

### Copy Contract

Use `Music 3`, `ASR / Edit-map`, `Score Mix / QC` and explicit `ยังไม่สำเร็จ`
until a published artifact and QC evidence exist.

### Browser Evidence Required

Section 05 must verify queued/running/failed/published projections with fixture
jobs; real GPU evidence must be separately recorded.

## Exit criteria

Worker can process a no-credit fixture end-to-end through artifact/QC state and
truthfully blocks when the real MiniMax runtime or managed media is unavailable.
Real RTX/MiniMax generation remains a separately recorded runtime gate.

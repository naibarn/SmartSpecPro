# Feature 169 — Five-round plan review

## Round 1 — runtime capability

- Confirmed bundled HyperFrames exposes `transcribe` with word-level timestamps.
- Added explicit `whisper-cli`/model provisioning and version-drift doctor checks.
- Prohibited npm auto-install during a job.

## Round 2 — media correctness

- Preserved original timestamps and added source-to-prepared time mapping.
- Treated middle silence as a reviewable segment plan, not blind deletion.
- Added black/frozen/audio/codec and output QC before publication.

## Round 3 — cross-runtime contract

- Defined probe/analyze, prepare and B-roll render payloads.
- Required source/revision/fingerprint validation on every stage.
- Covered managed-upload and worker-local source boundaries.

## Round 4 — security and resource safety

- Restricted filesystem, FFmpeg profiles, concurrency, buffers and temporary artifacts.
- Kept transcript privacy within tenant boundaries.
- Added heartbeat, cancellation, retry classification and backpressure.

## Round 5 — integration and release proof

- Closed the `video_assembly` unknown-job gap by requiring classifier/executor support or an explicit Remotion route.
- Added shared fixtures, runtime doctor, benchmark and authenticated end-to-end proof.
- Kept legacy Server transcription isolated from the new Special Tie-in Worker path.

Result: no remaining high-confidence planning gap. The presence of the CLI in the bundle is not treated as proof that the binary, Thai model, storage permissions or production Worker execution are ready; those require live release evidence.

# P3 Focused Test Plan

## Audio intent modes

Test native audio enabled, dialogue-only, silent/no-dialogue, explicitly disabled, old record with absent mode, unsupported native-audio model and user changing mode during an active job. The selected user mode remains authoritative and existing prompt shapes remain compatible.

## Failure and preservation

Inject TTS/provider timeout, audio sample unavailable, lip-sync warning/failure, QC malformed output, stem-repair failure, mastering failure, worker restart and assembly audio-track failure. Assert successful video and prior valid audio master remain accessible; only the audio sub-operation is failed/degraded; no new approval or waiting gate.

## Continuity and ownership

Test missing/stale prior episode memory, changed character voice/visual canon, cross-tenant reference denial, cancellation before/after paid submission and duplicate worker delivery. Verify correct revision binding and exact-once credit/provider effects.

## Commands and browser evidence

Run focused dialogue/audio/QC/repair/assembly Vitest suites. Verify audio mode controls and warning/clip access with authenticated UI tests when the implementation reaches that surface. Use canonical `worker_jobs` integration tests for durable execution; do not introduce a second queue.

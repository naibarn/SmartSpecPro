# ASR/alignment TDD companion

Behavioral test descriptions, not executed tests. Use pnpm/Vitest for web and Worker UI, Rust cargo tests for native contracts/process lifecycle. Default suite must not download models, contact cloud providers or charge credits.

## 1. Outcome and decisions

Test: Legacy selections, manual captions and ASS survive; TTS does not invoke ASR.

## 2. Verified baseline and impact

Test: Old command payload and runtime manifest fixtures remain valid; cue durations match evidence.

## 3. Operations and wire contracts

Test: Schema rejects invalid versions/ranges; native and forced timing retain provenance; nullable unaligned words survive serialization.

## 4. Validation, artifacts and authorization

Test: Cross-tenant/project deny; concurrent idempotency and cancellation races; stale revisions and revoked access cannot publish.

## 5. Runtime profiles and actual adapters

Test: Missing/corrupt optional packs fail closed; actual readiness and GPU lease contention; lazy inference is consumed.

## 6. Long-form, cancellation and recovery

Test: Repeated speech at chunk seams, exact offsets, resume hash mismatch, process-tree termination and bounded logs.

## 7. TTS script alignment and subtitle timing

Test: Thai grapheme mapping, final-audio checksum invalidation, unchanged approved text, short cue duration and escaped exports.

## 8. UI and exports

Test: Review/Apply undo, accessibility, reopen job, no action on profile selection and conflict handling.

## 9. Implementation ownership and order

Test: Dependency contract fixtures pass between sections; optional VibeVoice does not block legacy/Faster-Whisper.

## 10. Tests, release and rollback

Test: Opt-in real corpus reports pinned revisions, measured limits and release thresholds; disabled profile rollback preserves artifacts.

## Per-section acceptance

### 01 contracts-and-mapping

Test: Reject invalid ranges, unsupported required capability, inconsistent hashes and unknown schema versions; legacy omitted-engine request selects Whisper.cpp; round-trip canonical JSON preserves nullable timing and anonymous speakers.

### 02 lifecycle-security-admission

Test: Cross-tenant/project and stale worker binding fail; concurrent duplicate requests execute once; cancel-complete race cannot publish; revoked access fails publication; export retry does not rerun ASR; unavailable cloud never silently falls back or uploads local audio.

### 03 runtime-packs-and-readiness

Test: Legacy manifest still parses; absent optional pack does not disable rendering; corrupt download cannot activate; offline ready pack works; unsupported GPU/language returns reason; ASR and Music3 cannot simultaneously acquire an exclusive GPU lease.

### 04 faster-whisper-whisperx

Test: Fixture runner handles silence, malformed output, stderr flooding, cancellation, crash and checkpoint resume; repeated seam speech is not dropped; chunk offsets apply once; unaligned words remain null; real opt-in Thai smoke proves native/forced timing distinction.

### 05 vibevoice-asr

Test: Invalid speaker/time structures fail; segment-only output cannot claim word timing; required unavailable Thai alignment fails clearly; timeout/cancel frees resources; multi-window speaker labels are not merged by label alone; opt-in 30/60 minute tests record resource limits.

### 06 script-alignment-and-subtitles

Test: Final audio or approved text change invalidates alignment; missing words cannot gain invented timestamps; Thai words are not joined with invented spaces; source-to-timeline transform applies once; short cues preserve measured duration; SRT/VTT/ASS escaping and Unicode round-trip are valid.

### 07 workspace-skills-drama-integration

Test: Old projects and old invoke payload remain usable; selection/navigation never generates or installs; close/reopen shows durable job; stale revision cannot overwrite edits; keyboard/focus/mobile layouts pass; Drama TTS uses final audio plus approved script; denied cloud transfer cannot dispatch.

### 08 verification-and-rollout

Test: No feature is marked production-ready by mocks alone; resource or quality gate failure leaves profile unavailable with a reason; rollback preserves artifacts and saved profile settings; all required tests have commands, results and model/device revisions; no real paid operation in default CI.

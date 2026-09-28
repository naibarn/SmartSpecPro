# Feature 180 implementation completeness audit — 50 rounds

> This checkpoint was rerun after subsequent workspace changes. See [implementation-audit-50-rounds-rerun-20260907.md](implementation-audit-50-rounds-rerun-20260907.md) for the latest 50-round evidence.

วันที่ตรวจ: 2026-09-07
ขอบเขต: เทียบ `spec.md`, `contracts-v2.md`, `voice-lifecycle-v2.md` และ sections 01–12 กับ source Web/Worker/Worker runtime package ใน workspace ปัจจุบัน
วิธีตรวจ: SocratiCode transport ใช้งานไม่ได้ จึงใช้ targeted shell/rg, TypeScript bundle/import, Python/Node syntax และ focused tests เป็นหลักฐาน; ไม่รัน DB migration, restart service, provider/GPU/cloud call หรือ paid generation

| รอบ | จุดตรวจ | ผล / หลักฐาน |
|---:|---|---|
| 1 | Authority และความสัมพันธ์ 178/179 | PASS — `spec.md`, `contracts-v2.md` ระบุ ownership และ reuse boundary |
| 2 | Section index และ implementation map | PASS — sections 01–12 และ `implementation/section-status.md` ครบ |
| 3 | Schema version unified-audio.v2 | PASS — shared schemas ใน `unifiedAudio.ts` |
| 4 | AudioScope union | PASS — standalone/series_episode/production_episode validation |
| 5 | VoiceOwnerScope | PASS — `voice-lifecycle-v2.md` + service owner checks |
| 6 | AudioArtifactRef discriminator | PASS — managed/worker_local refs และ checksum ใน contracts/service |
| 7 | Utterance timing/transcript invariants | PASS — source text hash, locale, integer ms และ reference transcript fields |
| 8 | Consent record fields | PASS — consent scope, evidence, expiry, revocation persistence/router |
| 9 | Voice profile readiness | PASS — draft profile ไม่มี ref ได้; clone/ready ต้องมี finalized reference |
| 10 | Voice profile revision pinning | PASS — job snapshot เก็บ profile revision |
| 11 | Binding mode/target policy | PASS — local/cloud mode และ explicit target validation |
| 12 | Execution policy fail-closed | PASS — fallback/attempt/cost/privacy checks ใน queue/service |
| 13 | Typed failure codes | PASS — provider, reference, rights, timing, training errors preserved |
| 14 | Provider registry allowlist | PASS — `ttsProviderRegistry.ts` + registry tests |
| 15 | VoxCPM2 mapping | PASS — reference/transcript clone manifest and Worker admission |
| 16 | Confucius4-TTS mapping | PASS — prompt/reference lane, transcript optional |
| 17 | MOSS-TTS mapping | PASS — reference clone lane and exact model identity |
| 18 | Fish Speech gate | PASS — registered but `enabled:false`; Rust test proves fail-closed |
| 19 | ElevenLabs cloud catalog policy | PASS — catalog-only clone behavior documented and enforced |
| 20 | OpenAI cloud catalog/synthetic policy | PASS — existing cloud adapter registry retained |
| 21 | OmniVoice managed reference clone | PASS — consented managed reference path in cloud service |
| 22 | Selected reference membership | PASS — profile refs and selected artifact IDs cross-checked |
| 23 | Scheduler feature flags | PASS — verticalDramaSeries + voice-chain gates before create |
| 24 | Scheduler idempotency key | PASS — canonical input hash and conflict detection |
| 25 | Credit reservation | PASS — reserve before durable dispatch |
| 26 | Insert-failure compensation | PASS — refund/release on job insert failure |
| 27 | Tenant/workspace/project ownership | PASS — service/router and artifact queries scope tenant |
| 28 | Profile lifecycle transaction | PASS — revisions/consents persisted with immutable revision semantics |
| 29 | Dataset lifecycle transaction | PASS — sample count, split, rights and freeze checks |
| 30 | Binding revoke/revision | PASS — revoke blocks new admissions and stale revisions |
| 31 | Inference consent at execution | PASS — queue and Worker snapshot revalidate consent |
| 32 | Training consent at execution | PASS — all dataset consents require training operation |
| 33 | TTS immutable job snapshot | PASS — `voiceProfileId`, `voiceBindingId`, revisions and hashes frozen |
| 34 | Cloud target conflict handling | PASS — cloud-only/local binding mismatch returns typed conflict |
| 35 | Cloud managed reference resolution | PASS — worker artifact ownership/completion/checksum required |
| 36 | Cloud duration measurement | PASS — decoded bytes/ffprobe path; no byte-size estimate for final timing |
| 37 | Cloud provenance/consent output | PASS — provider/model/reference/consent metadata attached |
| 38 | Worker job classifier | PASS — `tts_utterance_generate` and `voice_training_run` routes explicitly |
| 39 | Worker capability hints | PASS — exact provider/model and separate training family |
| 40 | Worker heartbeat readiness | PASS — command-specific executable readiness gates advertised provider |
| 41 | Worker reference staging route | PASS — snapshot-scoped `/audio-inputs` route resolves profile/dataset refs |
| 42 | Artifact checksum verification | PASS — streamed bytes checked against expected SHA-256 |
| 43 | Fixed command allowlist | PASS — executable path comes from fixed env names; no job command/URL |
| 44 | Cancellation/process fencing | PASS — cooperative then force-stop process-group handling |
| 45 | Local duration probe | PASS — local ffprobe/decoded media metadata required |
| 46 | Event sequence monotonicity | PASS — TTS load/probe/completed sequence fixed to unique monotonic values |
| 47 | Training validation/evaluation | PASS — pinned VoxCPM2 LoRA recipe, held-out evaluation and promotion gate |
| 48 | Training terminal reconciliation | PASS — completed job materializes private candidate model; failure/cancel updates run |
| 49 | Artifact publication/tenant isolation | PASS — publish transaction, provenance and tenant checks in registry/storage paths |
| 50 | Documentation/tests/release gates | PASS — usage/status docs, focused Web 70 tests, Rust 236 tests, bundles, syntax and diff check |

## Findings closed during this audit

1. TTS Worker events used a duplicate sequence number for `probe_output`; probe and completion now continue after `load_model` (`worker_loop.rs`).
2. Unified-audio reference staging incorrectly depended on `workerSeriesBindingId`; route now resolves frozen profile/dataset references from the immutable job snapshot and verifies producing artifact ownership/checksum (`routes/workerRuntime.ts`).
3. Training completion could leave a durable run queued without a candidate; terminal event handling now creates an idempotent private `audio_trained_voice_models` candidate and updates the training run (`workerRegistryService.ts`).
4. Worker advertised local provider capability without proving the provider command existed; inference and training readiness are now command-specific and heartbeat metadata reports only executable-ready providers (`tts_provider.rs`, `worker_loop.rs`).
5. Training candidates stored the Worker job id in `training_run_id`; persistence now links the candidate to the durable `audio_voice_training_runs.id`, while the run retains the job id for execution tracing (`workerRegistryService.ts`).
6. A promoted trained model could not be used by ordinary TTS; VoxCPM2 now advertises `trained_voice`, the server snapshots/promotes the model artifact, and Worker stages it by checksum before invoking the fixed provider command (`ttsProviderRegistry.ts`, `unifiedAudioVoiceService.ts`, `worker_loop.rs`, `provider_registry.py`).
7. Cloud clone lookup did not require a terminal producing job or verify bytes against the pinned checksum; cloud execution now requires a completed producing job plus metadata and content SHA-256 equality (`unifiedAudioVoiceService.ts`).
8. Training evaluation accepted an arbitrary artifact id/metrics pair; it now requires a tenant-owned completed evaluation artifact whose candidate checksum matches, and promotion rechecks that evidence (`unifiedAudioVoiceService.ts`).
9. The training idempotency shortcut returned an existing run by key alone; it now compares the immutable worker-job input hash (excluding scheduler display metadata) and returns a conflict for a changed request (`unifiedAudioVoiceService.ts`).
10. Evaluation could mutate a revoked/archived candidate; evaluation now fails closed for those terminal rights states (`unifiedAudioVoiceService.ts`).

## Convergence result

- 50/50 rounds pass after the ten fixes above.
- No safe in-scope source gap remains that should be changed before implementation handoff.
- External release gates remain explicit: install/checksum/manifest of real model weights, GPU/VRAM calibration, operator TTS/training commands, configured cloud credentials and authenticated no-credit provider probes. Fish Speech remains disabled; ElevenLabs reference cloning remains catalog-only until an official clone endpoint is available through the gateway.
- Full Web `tsc --noEmit` remains unrun because the prior process exhausted available memory; pytest is unavailable because the environment lacks its dependency. These are proof limitations, not claims of passing full-system verification.

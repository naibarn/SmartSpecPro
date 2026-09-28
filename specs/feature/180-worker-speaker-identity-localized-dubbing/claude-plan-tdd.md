# Feature 180 TDD Plan

> v2 implementation prerequisite: read contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

Tests are written before each implementation section. Use existing Vitest/Playwright, Worker Vitest and Python pytest conventions. Keep media/provider tests mocked or fixture-based; no paid live generation is part of the default test command.

## section-01-contracts-and-gateway

- Schema tests reject unknown adapter/provider variants, invalid milliseconds, cross-tenant references and secrets.
- Artifact lineage tests require source checksum, schema version, provenance and retention metadata.
- Gateway tests enforce server-authorized local execution and server-only external cloud dispatch, provider allowlists and tenant/project ownership.
- Idempotency tests replay the same job and prove one provider request and one credit reservation.
- Credit tests cover preflight failure, provider failure, partial usage and successful reconciliation.
- Source-local-path handoff, artifact lineage, timeline-transform and stale-plan rejection tests.
- Cancel-before-dispatch and cancel-after-provider-dispatch reconciliation tests.
- Migration compatibility and minimum worker-runtime-manifest tests.
- No-subtitle preparation, provider rate-limit retry-after and GPU/VRAM admission tests.

## section-02-speaker-scan-and-identity-panel

- Scan normalization tests cover one speaker, overlapping speakers, audio-only speech, body-only evidence, no-face and low-confidence conflict.
- Adapter policy tests prove selected adapters and explicit fallback behavior; disabled adapters are never silently used.
- Standalone tests cover naming, frame capture, merge/split and revision persistence.
- Series tests cover character proposal, approval, uncertain match and no canonical Series mutation.
- Worker UI tests cover loading/empty/partial/error/review/success and visible scrolling/primary action.

## section-03-subtitle-localization

- Cue mapping tests preserve source IDs/ranges and support unmatched/overlapping cues.
- Skill request tests include locale, region, glossary, style, timing and condensation policy.
- Localization result tests require per-cue provenance and rationale for merged/removed content.
- Default mode tests prove no silent deletion; opt-in short-form tests prove a visible removal list.
- Partial batch tests retry only failed cues and retain successful artifacts.
- Target-duration impossibility and protected-topic preservation tests.
- Existing transcript, subtitle import, separate transcription and manual-cue preparation tests.

## section-04-voice-consent-and-providers

- Consent tests block missing, expired and revoked records.
- Clone lifecycle tests restrict samples/artifacts and enforce project/locale scope.
- UVoice tests prove ordinary TTS path remains available while clone management is unavailable without capability proof.
- ElevenLabs adapter tests prove server-only dispatch, managed sample upload and normalized response metadata.
- Provider errors and unavailable capabilities produce stable user-facing codes and no mock result.
- Voice sample format/noise/clipping/single-speaker quality and provider deletion/revocation tests.
- Provider rate-limit and retry-after tests without duplicate credit reservation.

## section-05-stem-separation-tts-timing

- Cue TTS tests create one durable artifact per cue and preserve speaker binding.
- Timing tests cover text adaptation, provider speed, bounded time-stretch and overflow review.
- Separation tests cover acceptable leakage, unacceptable leakage, missing model and manual-DAW branch.
- Mix routing tests prove generated dialogue does not coexist with source dialogue unless explicitly selected.
- Sample-rate/channel normalization, bus routing, ducking, loudness/true-peak and unresolved-cue blocking tests.
- Input audio-track selection and no-subtitle cue-policy tests.
- Resume tests restart a partial cue batch without duplicate paid generation.

## section-06-edit-map-export-qc

- Edit-map composition tests combine subtitle/manual/silence/reframe/localized audio ranges.
- FFmpeg and Remotion contract tests consume equivalent map projections.
- Post-encode QC tests cover duration, streams, loudness, black/frozen frames, subtitle timing and source-dialogue leakage.
- QC failure blocks publication and links back to cue/range.
- Artifact publication tests are atomic and signed.
- Stale input checksum/render-plan hash and versioned QC-threshold exception tests.

## section-07-verification-rollout-runbook

- Browser smoke tests cover desktop, laptop/tablet and narrow viewport panel behavior.
- Accessibility checks cover keyboard focus, labels, status semantics and reduced motion.
- Failure injection tests cover worker restart, network reconnect, gateway timeout, provider rejection and credit reconciliation.
- Rollout tests prove feature flags keep UVoice clone and unproven adapters disabled.
- Runbook checks verify diagnostic output contains no credentials, raw samples or biometric claims.
- Migration rollback, old-worker compatibility, source-path handoff and cancel-after-dispatch tests.
- GPU/VRAM capacity rejection and concurrent-job admission tests.


## v2 cross-target acceptance matrix

| ID | Sections | Required assertions |
|---|---|---|
| V2-01 | 01 | Strict scope union, cross-tenant FK/access, limits, hash conflict, stale revision, expired preflight |
| V2-02 | 04,08,09 | Same approved utterance works on local/cloud; unsupported binding rejected; no silent voice switch |
| V2-03 | 01,03,04,08,09 | Local reference/transcript/output policy each independently enforced; cache consent revocation |
| V2-04 | 08 | Model integrity, local path/symlink scope, shared GPU atomic lease, insufficient margin and restart |
| V2-05 | 09 | Cloud unknown outcome reconciliation, cancellation fencing, upload-only retry, no double reserve/charge |
| V2-06 | 05 | Real WAV/PCM/MP3 duration, RTF formula, missing metrics null, alignment-only retry and stretch checksum |
| V2-07 | 02,03,10 | Authored/narration bypass scan/translation, source text preserved, semantic privacy rejection |
| V2-08 | 06,10 | 178 exact Music3, separate buses, stale group/rights propagation, voice-only selective reuse and remix |
| V2-09 | 01,07 | Additive migration isolated DB, legacy-unverified voices, old Worker rejection, rollback preserves artifacts |
| V2-10 | 07 | Genuine local AND configured cloud artifact/timeline/export; UI target/privacy/cost and keyboard proof |

## section-08-local-runtime-resource-admission

Write subprocess/registry/resource tests before handlers. Cover cancellation during download/load/inference/upload, process-tree cleanup without removing references, lease expiry and stale completion, corrupted model, disabled license, native/WSL selection and no automatic download. Fake processes are default; genuine model test is separately opt-in.

## section-09-cloud-routing-and-provider-normalization

Write provider response fixtures before adapters. Cover explicit routing order, denied cloud privacy, exact voice approval, provider lower text limits, transient/unknown outcomes, missing usage, duration decoding, retry-after and maxCostCredits. Cloud live proof must record provider/model, artifact checksum, actual usage and reconciliation; credentials never enter evidence.

## section-10-production-audio-and-skill-integration

Write authored/standalone/group mapping fixtures before integration. Cover optional semantic direction, invalid Skill JSON/provenance, protected dialogue, 179 time transforms, 178 plan identity, native vs replacement audio, rights revocation and output-local-only. Genuine 178 integration remains its own runtime gate.

## Commands and evidence rules

Run from repo root unless noted. New test filenames below are planned implementation deliverables; do not report them as existing or passing during planning.

- Web contract: `npm --workspace apps/web test -- shared/verticalDramaMedia/__tests__/unifiedAudio.test.ts`
- Server service: `npm --workspace apps/web test -- server/services/__tests__/unifiedAudio.test.ts`
- Web component: `npm --workspace apps/web test -- --environment jsdom client/src/components/verticalDramaSeries/__tests__/UnifiedAudioPanel.test.tsx`
- Worker Rust: `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml tts`
- Existing speaker runtime regression: `npm --workspace apps/worker-app run speaker-aware:test`
- Python new sidecar: `python3 -m unittest discover -s apps/worker-app/src-tauri/sidecars/tts_runtime -p 'test_*.py'`
- Whitespace: `git diff --check` plus inspect untracked specification files explicitly.

Worker browser tests must use the existing media-workspace harness and repository Vitest config after inspecting its current command; Worker npm test runs Rust, not Vitest. Do not invent `--runInBand` for Vitest. No full resource-heavy typecheck is required by this planning package. Record command/exit/build/fixture and unavailable evidence separately; runtime generation or migration requires its own authorized environment.


## section-11-reference-voice-lifecycle

Add planned voiceLifecycle service/contract tests: begin/finalize import replay, actual MIME/checksum/size, unfinished refs, owner-worker isolation, profile draft/ready, transcript audio-range mismatch, mode-required fields, binding rev locks, exact adapter argument fixtures, private cache revocation and output consent provenance. Include local/cloud UI acceptance from voice-lifecycle-v2.md. Default tests do not invoke real providers.

## section-12-voice-training-evaluation-promotion

Add planned voiceTraining service/Worker tests: freeze dataset hash, held-out source isolation, explicit training grant, recipe allowlist/quota, checkpoint validation, budget stop, wrong base model and executable weights rejection, cloud unavailable/unknown result, baseline quality failure, human approval, trained binding inference, rollback and ancestor revocation. Add genuine recipe evidence only to opt-in Release D runbook.

| ID | Owner | New release requirement |
|---|---|---|
| V2-11 | 11 | All eight reference lifecycle steps with revision-bound input and provenance |
| V2-12 | 12 | Dataset → real trained artifact → evaluation → approved binding → inference → rollback |
| V2-13 | 01,04,11,12 | Transitive reference/dataset/model/output rights, retention and deletion outcome |
| V2-14 | 07 | A/B/C/D status separately reported; no cloning result presented as training |


## Convergence audit regression matrix

| ID | Sections | Required proof |
|---|---|---|
| C5-01 | 01,04,11 | createAudioPlan/manual preview, consent submission vs grant authorization, rollbackVoiceBinding monotonic revision, no profile/binding readiness cycle |
| C5-02 | 01,04,11 | VoiceOwnerScope project/Series membership, cross-tenant denial, private text hash admission and artifact substitution rejection |
| C5-03 | 01,04,07,12 | Derived-model/cache privacy, revoked ancestor with pending traversal, 60-second signed URL residual window and viewer redaction |
| C5-04 | 01,08,09 | Logical idempotency vs fallback attempt hashes, retryRun explicit attempt, changed plan successor, reconciliation_pending deadline and authenticated replay callback |
| C5-05 | 08,12 | Lease disconnect stop/quarantine, atomic checkpoint interruption, 10-second cancel deadline, queue TTL and 429 before reservation |
| C5-06 | 12 | Candidate with null evaluation, budgeted baseline/candidate evaluation, grouped test leakage and non-exportable provider model resource |
| C5-07 | 07 | A+B core versus D expanded training release, C optional provider state, no pending D gate blocks shipping A/B |

Each C5 row must identify actual test file/command/result during implementation. Tests may not pass by asserting only field presence; exercise observable state/authorization/side-effect behavior. Documentation audit establishes no runtime result.

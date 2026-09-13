# Feature 180 — Multi-engine ASR and script alignment implementation plan

Status: implementation blueprint; model/runtime acceptance is not certified. Scope is an additive subplan of Feature 180, retaining its 12 existing sections. This subplan does not inherit prior audit PASS claims as proof of the new functionality.

## 1. Outcome and decisions

Preserve the existing Whisper.cpp option and saved projects. Add a Faster-Whisper ASR profile with optional WhisperX forced alignment and pyannote diarization, and an optional VibeVoice-ASR profile for long-form speaker-aware transcription. UI presents three profiles, not Faster-Whisper and WhisperX as competing ASR models. Existing users keep their selected engine; new recommendations depend on verified capability. No automatic model install, paid preview or fallback on selection.

Produce an immutable canonical transcript JSON, then JSON/SRT/VTT exports from the same approved revision. Preserve existing ASS export. SRT/VTT cues do not themselves constitute portable word-level timestamp storage: word evidence remains in canonical JSON. Add word cues only as an explicit export style.

TTS subtitle text comes from the approved script. Align against final time-fitted audio, retain exact display text, and store normalization mappings separately. Optional ASR quality checks are separate approved operations and never replace that text. Existing subtitle import/manual edit, Silence Cut and speaker scan remain independent.

## 2. Verified baseline and impact

AutoSubtitleModal.tsx currently invokes worker_app_transcribe_audio with videoPath/language; it displays synthetic stage percentages, synthesizes absent end times and extends short clips to 800 ms. Replace those timing fallbacks with validated evidence and actual measured duration. Require explicit Apply, preserving undo and prior captions.

commands.rs worker_app_transcribe_audio chooses a single model from RuntimeTranscriptionManifest and rejects other model IDs. Retain this API as a compatibility facade; omitted engine uses the legacy profile. New execution must share lifecycle/admission with durable Worker jobs instead of introducing a competing heavy-process path.

worker_loop.rs contains execute_hyperframes_transcription_process and normalize_hyperframes_transcript_output; adapt their output through explicit legacy projections. runtime_manifest.rs and runtime_manifest_tests.rs own pack compatibility. subtitleFormatters.ts already exports SRT/VTT/ASS; extend/validate it rather than create another formatter. Do not change existing render prerequisites merely because optional ASR components are absent.

Server touchpoints: workerSchedulerService.ts, workerRegistryService.ts, routes/workerRuntime.ts and unifiedAudio router/service. Shared contracts belong under apps/web/shared/verticalDramaMedia. Inspect impact at implementation time and preserve unrelated changes. SocratiCode is not exposed in this session; targeted source reads were used.

## 3. Operations and wire contracts

Use public operations audio.transcribe, audio.align, audio.diarize. They are operation names, not automatically interchangeable with durable jobType. Proposed new durable types are audio_transcribe, audio_align and audio_diarize, subject to section 01 producing a mapping table for every existing compatible handler; reuse a compatible type and version its payload when available. Never rename historical jobs. The final mapping is frozen before dispatch implementation.

Schema version: audio-transcript.v1. Request fields: logicalRequestId, idempotencyKey, AudioScope, inputArtifactRef, sourceChecksum, sourceRevision, selectedAudioStreamIndex, selectedRangeMs, sourceTimelineTransformRef, engineProfileId, modelRevision, runtimeRevision, language (BCP-47 or auto), alignmentPolicy, diarizationPolicy, outputFormats, executionPolicy and expectedInputRevision. Tenant/actor/permissions derive from auth. Map th-TH to model th once in the adapter and retain original locale.

Alignment request additionally requires approvedTextArtifactRef/revision/hash, finalAudioChecksum, normalizationProfileId and speaker assignment refs. No raw path or URL is authoritative on the server. Legacy videoPath is resolved and registered by the owning Worker before admission; local-only bytes stay local. A local artifact handle contains worker ID, binding revision, checksum and opaque ID. Implement owner-worker resolution; do not force upload as a workaround.

Policy distinguishes requested granularity segment/word and required boolean, timestamp method native/forced_alignment, and diarization off/native/pyannote/existing_artifact. Required unavailable alignment returns ALIGNMENT_LANGUAGE_UNAVAILABLE or ALIGNMENT_INCOMPLETE; optional incompleteness returns needs_review and actual achievedGranularity. Fallback requires an explicit ordered list and privacy/budget revalidation before submission.

Canonical JSON fields: artifact/schema IDs; source/audio/text hashes and revisions; duration, stream, sample rate; source timebase and transform; locale; engine/model/runtime/normalizer revisions; segments with stable cue IDs, start/end integer milliseconds, text, speaker candidates; words with display-text offsets and measured times nullable when unaligned; speaker turns including overlap; quality/coverage, warnings, timingOrigin and parent artifact IDs. Unknown confidence remains null. Unaligned spans remain visible and cannot enable karaoke. ASR speaker labels are anonymous evidence; 179 mapping to Series characters remains a separate user approval.

## 4. Validation, artifacts and authorization

Preflight and create both check project editor rights, source readability, exact engine/model/runtime capabilities, privacy per audio/text/output, budget, range, disk/RAM/GPU capacity and source revision. Tenant matching alone is insufficient for project rights. Recheck current authorization/rights at claim and publication; a frozen snapshot is not proof consent remains current.

Initial control DTO limit 256 KiB; text/script max 1 MiB via bounded artifact, no unbounded inline source; transcript artifacts max 20 MiB and 100,000 words per artifact. Larger results use a bounded page manifest with cumulative range validation. Initial input range max 4 hours, streamed source max 10 GiB, manifest-declared engine duration/resource limits may be stricter. Reject before inference; no silent truncation. Probe/decode under time/memory limits, select audio stream explicitly, reject corrupt media/traversal/symlinks/oversized transfers and verify checksums.

Persist through existing worker_jobs/worker_artifacts and approved local registry. Logical request hash includes source stream/range/transform, profile/model/runtime, language, normalization, alignment and speaker policies and output revision. Same key changed input conflicts; export-only retries do not rerun ASR. Artifacts are finalized atomically with hash verification, cancellation and stale lease fencing; JSON/SRT/VTT link to identical transcript revision. Rights-restricted download uses current authorization. Publication and retry must not expose partially uploaded output.

New APIs on unifiedAudio: listTranscriptionCapabilities(scope), preflightTranscription(request), queueTranscription(request), queueAlignment(request), getAudioRun(runId), cancelAudioRun(runId,expectedStateVersion), exportTranscript(transcriptRef,formats,expectedRevision). Reuse generic get/cancel only after checking ownership, semantics and DTO redaction. Preflight expires after 60 seconds; creation rechecks. New admissions limit 10/minute/actor, preflight 100/minute/actor or stricter existing policy. Reuse billing; no invented local cloud charge. Cloud adapters remain explicitly registered/disabled when unavailable, preserving existing providers and privacy rules.

## 5. Runtime profiles and actual adapters

Faster-Whisper: adapter executes the pinned library, fully consumes its lazy segment iterator, uses bounded batch/beam settings and records native timestamp provenance. WhisperX alignment consumes approved text/segments, not a second ASR pass. pyannote is independently licensed/installed and can be bypassed when 179 or VibeVoice already provides usable speaker turns. Tokens remain in credential storage and absent from jobs/logs/UI.

VibeVoice-ASR: actual pinned model runner with structured output schema, bounded generation, timestamp validation and native speaker normalization. Do not equate segment timing with word timing. Long-form capability limit is min(model limit, measured profile limit); a advertised 60-minute model capability does not prove 60-minute execution on a 16 GiB GPU. Word mode may compose with a verified language aligner; otherwise remain unavailable/needs_review. Initial VibeVoice target is gated Linux/WSL GPU. Other OS/device profiles require separate proof.

Install each provider in isolated runtime environment with exact package/model/aligner revisions, hashes, license evidence, supported locales, tested OS/compute type and measured peak RAM/VRAM. Download is explicit, resumable and quota checked; activation is atomic and retains prior version. Readiness distinguishes installed, model_missing, dependency_error, license_required, hardware_incompatible, healthy and disabled. An executable file existing does not prove model/locale/GPU readiness. GPU admission covers ASR/TTS/Music3/separation/render; release only after process tree termination. No fabricated operator-command-only implementation may satisfy engine delivery.

## 6. Long-form, cancellation and recovery

Phase states: preparing, decoding, transcribing, diarizing, aligning, validating, artifacting; job states reuse durable queue/running/cancel/terminal semantics. Progress uses measured completed audio or indeterminate phase, never invented 15/35/85 percentages. UI can close and resume by job ID.

Windowed engines default to 10-minute windows with 5-second overlap, constrained by model limits; duration/overlap belongs to versioned profile. Persist source-offset and exact sample boundaries. Deduplicate only overlap-aligned evidence, preserving repeated legitimate dialogue; ambiguous seams are reviewable. Cross-window speaker labels require a reconciliation artifact and confidence, not numeric label coincidence. VibeVoice single-pass within admitted limits has no fictional mid-inference resume; after failure restart only with new authorized attempt and retain previous results. Longer material uses explicit window policy and warns of speaker-continuity limitations.

Checkpoint manifest records input/policy/model hashes, completed chunk artifacts and checksums. Resume only compatible hashes; pipeline stages retry independently. Deadline enforces request timeout for inference and recipe timeout when reused by training; no fixed accidental timeout. Drain stdout/stderr concurrently with bounded redacted buffers. Unix process groups and Windows job objects/WSL tree termination stop child models; graceful stop then force at 10 seconds. Stop on lease expiry. Failed kill quarantines allocation; do not schedule another heavy job on unconfirmed release.

## 7. TTS script alignment and subtitle timing

Resolve approved display text and final audio bytes by revision/hash. Normalization handles Thai numbers, punctuation, abbreviations and mixed scripts using a versioned reversible character-span map. A language aligner requires verified Thai fixtures; no default-language assumption. Preserve display grapheme boundaries and no inserted spaces between Thai words. Code-switch spans may use language-specific aligners if explicitly supported. Unsupported/ambiguous spans keep null timings and needs_review.

Quality records aligned text coverage, unaligned spans and acoustic mismatch evidence where available. Alignment does not prove every scripted word was spoken: silence/missing speech/unsupported normalization must not fabricate success. Human review is required for incomplete alignment; explicit cue-level manual timing creates a new revision. Changed audio/time-stretch invalidates timing; changed display text revalidates mapped spans. No silent semantic shortening or replacing approved script with ASR text.

Store source absolute milliseconds and apply derived cut transforms once. At NLE boundary explicitly convert absolute word times to clip-local times according to existing renderer contract; preserve gaps and overlaps. A source time less than media start or beyond probed duration is invalid. Never extend a cue to 800 ms or invent end=start+3 seconds. Readability rules may propose a cue split/merge revision, not rewrite measured word times.

## 8. UI and exports

Extend AutoSubtitleModal with three engine profiles, locale, optional word alignment and speaker detection, supported output formats and readiness repair action. Default existing profile; new recommended profile only when ready. Separate Generate/Review/Apply/Export, preserve ASS, undo, current captions and manual subtitles. Selecting profile or opening UI never executes/downloads. Advanced view exposes exact revisions and resource/estimate without credentials.

States: loading catalog; no source; ready; missing model; unsupported language; queued/resource blocked; running with cancel; partial/needs_review with unaligned spans; failed retry eligible stage; canceled; completed. Narrow 390px stacked controls, 768px sheet, 1280/1440px scroll-safe modal; keyboard labels, focus trap/restore, Escape consistent with background job behavior, live status announcements and reduced motion. Hidden primary actions are a failure. Before UI edits use repo Astryx discovery and preserve established styling/behavior.

Canonical cue builder handles locale-specific wrapping, speaker change, overlaps and readability. Plain SRT speaker prefix is opt-in; VTT voice tags require escaping and compatibility tests. Escape subtitle control syntax, HTML and ASS override tags in user text. SRT/VTT/ASS plain rendering must preserve Thai graphemes and display text. Exports carry sidecar provenance; empty speech yields valid empty result, not hallucinated captions. Browser evidence covers 390/768/1280/1440 viewports and navigation away/back during a job.

## 9. Implementation ownership and order

Eight sections in this subplan, distinct from parent section numbers. 01 contracts/mapping; 02 lifecycle/security/admission; 03 runtime installation; 04 Faster-Whisper/WhisperX; 05 VibeVoice; 06 script alignment/cue/export; 07 UI/179/DramaSeries integration; 08 proof/rollout. 05 is optional release promotion and does not block 04,06,07 rollout. Section 01 freezes exported DTO names/mapping; later sections request changes through that owner. Do not overwrite parent deep-plan state or previously implemented sections.

## 10. Tests, release and rollback

Default tests use local fixtures and fake executables, no downloads/cloud spend. Regression baseline includes legacy Tauri omitted-engine request, legacy manifest deserialization, ASS, existing subtitle source mapping and Whisper.cpp normalized output. Unit tests alone cannot prove provider integration.

S0 contracts and legacy compatibility; S1 actual Faster-Whisper + Thai alignment + UI vertical slice; S2 optional VibeVoice long-form promotion; S3 TTS-script alignment + authored DramaSeries final-audio lineage. Each release requires its enabled flows and cancellation/export proof. Cloud variants remain individually gated. Feature flags disable only new admissions; retain prior jobs/artifacts and old engine. Additive DB migration only if existing ledger cannot represent required metadata; select next migration at implementation time, use disposable DB for migration tests.

Benchmark corpus: rights-cleared Thai single speaker, multiple speakers, overlap, silence/music, names/numbers, Thai-English, edited media and generated TTS, each with approved reference. Run 1/10/30/60-minute cases plus >60-minute chunk case where admitted. Publish CER with normalization version, word-boundary p50/p95 error on manually labeled samples, speaker error/confusion, seam duplicates/omissions, cold/warm RTF, RAM/VRAM, crashes and cancellation latency. Before first engine promotion record numeric quality thresholds agreed for the versioned benchmark profile; missing thresholds blocks promotion, not plan implementation. Hard invariants: zero fabricated timestamps; zero unauthorized transfer/duplicate execution; artifact hashes match; no stale publication; cancellation tree stops within enforced deadline; target workload has no OOM. Do not borrow upstream speed claims as local evidence.

Open deployment decisions: verified Thai aligner checkpoint/hash, pinned provider package locks, measured VibeVoice GPU ceiling and quality thresholds. Section 03/04 produce these as concrete acceptance artifacts; absence keeps corresponding capabilities disabled. No user decision is required to start source implementation.

## Standalone and cloud compatibility addendum

Preserve Feature 179 standalone scope (no required Series binding), while Series jobs retain project/revision checks. Section 01 verifies existing standalone sentinel conventions before DTO changes. Local execution remains available without a cloud provider credential. Cloud ASR/alignment adapters normalize the same canonical schema, declare native versus forced timing, enforce upload-region/retention policy and use server-side credential references. Never expose provider secrets to the Worker UI. Cloud webhook/poll reconciliation must be idempotent, authenticate callbacks, fence cancelled jobs and preserve provider request IDs for reconciliation. Failed export retries must not create another billable inference. A cloud adapter without tested capability/pricing is not selectable.

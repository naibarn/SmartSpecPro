# Voice lifecycle v2 — reference cloning and optional training

Normative extension to contracts-v2.md. Status: implementation design, runtime proof pending. Existing v2 envelope, scope, privacy, job lifecycle, billing and artifact rules apply. Training is a separate capability and release gate; it is never required for reference cloning. This document defines product contracts, not a claim that all listed providers expose training APIs.

## 1. Complete reference voice flow

1. User selects/imports a recording or uploads an audio file; chooses reference privacy and records rights. Worker-local import registers an opaque local artifact; it does not upload audio.
2. Validate decode, duration, size, single speaker, speech coverage, clipping and noise using a versioned quality profile. Preserve the original; trimming/denoising/resampling creates derived artifacts and requires selection of the resulting reference. Quality uncertainty is reviewable, never fabricated success.
3. Create a draft VoiceProfile and attach validated reference IDs; profiles may be created before files finish uploading but cannot synthesize until selected references are finalized.
4. Add optional referenceTranscript, or explicitly request ASR with permitted privacy/budget. An ASR transcript is proposed with provenance; user verifies text before transcript-required cloning. Never confuse reference transcript with target speech.
5. Create/approve a provider-specific binding with exact mode and reference selection; preflight enforces language, model, transcript and rights requirements.
6. Create TTS job with voiceProfileId, voiceProfileRevision and voiceBindingId/revision. Server resolves immutable references and consent; client cannot substitute unchecked URLs or a newer profile revision.
7. Local adapter resolves reference to a scoped readable file; cloud adapter performs permitted authenticated transfer or uses its validated provider resource ID. Pass transcript only according to selected mode.
8. Finalize audio, measured timing and provenance. Approval of a preview does not auto-publish later takes. Retry/new seed, selective rerender and revocation follow existing contracts.

## 2. Named schemas

All identifiers below use shared opaque ID validation. Revisions are positive integers; timestamps are server UTC. Existing tenant/scope constraints apply.

`VoiceReferenceV2`: referenceAudioArtifactId, artifactRef (same ID plus checksum/location/revision), optional derivedFromArtifactId, optional selectedRange {startMs,endMs}, language, qualityReportArtifactId, consentId/revision. `referenceTranscript` is nullable bounded UTF-8 text (16KiB); alternatively `referenceTranscriptArtifactId` with hash, never both. Transcript metadata includes source manual/import/asr, revision, verifiedBy/At. Transcript-artifact limit is 1MiB decompressed. Changing audio selection invalidates transcript verification unless exact coverage is reverified.

`VoiceProfileV2`: voiceProfileId, revision, ownerScope (VoiceOwnerScope), displayName (1–120 characters), subjectType, defaultLocale, references (0–20), defaultReferenceAudioArtifactId nullable, consent refs, status draft/ready/disabled/revoked/archived. Profile readiness is a computed projection, not an increment of content revision. Ready requires valid selected reference or approved synthetic/catalog binding. Binding creation accepts a draft profile with otherwise valid mode inputs, avoiding a profile-ready/binding-ready cycle. Labels/descriptions are bounded and sanitized. Draft profiles may have no references; clone-mode bindings may not.

`VoiceBindingV2`: voiceBindingId/revision, voiceProfileId/revision, target, providerId/modelId/modelRevision/runtimeRevision, mode (`catalog_voice`, `reference_clone`, `transcript_clone`, `trained_voice`, `synthetic_design`), selectedReferenceAudioArtifactIds (1–provider limit for clone), consent snapshot, optional providerVoiceId, optional trainedModelArtifactId (metadata artifact for provider-managed resource), locale, approved settings, reviewer and status. Exactly the fields appropriate to mode are allowed. Model IDs and capabilities derive from registry, not client assertions.

`TtsRequestV2`: schemaVersion unified-audio.v2, scope, approvedPlanId/revision/hash, utteranceId/revision, voiceProfileId/revision, voiceBindingId/revision, executionPolicy, outputSpec, idempotencyKey. Text is resolved from approved plan; optional client text hash must match. Server stamps resolved references, consent and effective settings in attempt snapshot. Adapter payload is not the public create API.

`VoiceProvenanceV2`: profile/binding IDs and revisions, consentId/revision and policy hash, selected reference IDs/checksums, transcript hash/revision (no raw private transcript in logs), mode, provider/model/runtime revision, training lineage if present, normalization version, effective seed/settings, job/attempt/provider request IDs, input/output hashes and technical quality report. No biometric identity claim.

## 3. API contracts

Extend authenticated unifiedAudio procedures; reuse existing upload/artifact transport. Every mutation takes clientRequestId/idempotencyKey; revisioned mutations take expectedRevision. Server derives tenant/actor, validates editor rights and scope. Responses are bounded DTOs with authorized artifact presentation refs, not raw local paths or provider secrets.

| Operation | Request essentials | Response / invariant |
|---|---|---|
| beginVoiceReferenceImport | scope, filename, declared size/MIME, privacy | importId, permitted transport, expiry; local route returns no upload URL |
| finalizeVoiceReferenceImport | importId, checksum, artifact transport receipt | reference artifact and pending quality job; server/Worker verifies actual bytes |
| inspectVoiceReference | reference ID, approved quality policy | report job ID; no automatic paid ASR |
| createVoiceProfile | ownerScope, displayName, subjectType, optional references | draft/ready profile revision 1 |
| updateVoiceProfile | profileId, expectedRevision, explicit patch | new immutable revision; old bindings not silently rebound |
| setReferenceTranscript | profile/ref IDs, expectedRevision, text or artifact | new revision and verification status |
| verifyReferenceTranscript | reference/transcript revision and expected hash | verified status scoped to exact reference range |
| preflightVoiceBinding | profile revision, exact provider/mode/settings | compatibility/errors, required transcript, resource/cost estimate |
| saveVoiceBinding | preflight input hash, expected revision, reviewed selection | immutable binding; revalidates consent and capability |
| previewVoice | binding revision, approved utterance/plan, policy/budget | ordinary durable TTS job ID; no hidden free inference |
| listVoiceProfiles/getVoiceProfile | authorized scope, cursor/ID | max 100 profiles/page, scoped summaries |
| archiveVoiceProfile | profileId, expectedRevision | blocks new selection; preserves existing audit |
| deleteVoiceReference | artifactId, expectedRevision | dependency report, tombstone or restricted deletion job; no cascade destroying audit |

Imports expire after 24h; incomplete temp uploads cleaned after expiry, never finalized assets. MIME sniffing and sandboxed decode use CPU/time/memory limits; reject malformed/polyglot media, traversal and decompression bombs. Upload URL scope binds actor/import/size; checksum alone is not authorization. Duplicate finalize is idempotent. Local import must be handled by owner Worker with active binding, not asserted by browser.

Common errors: VOICE_PROFILE_STALE, VOICE_BINDING_STALE, REFERENCE_NOT_FINALIZED, REFERENCE_TRANSCRIPT_REQUIRED, REFERENCE_TRANSCRIPT_UNVERIFIED, REFERENCE_QUALITY_REVIEW_REQUIRED, VOICE_MODE_UNSUPPORTED, VOICE_SCOPE_MISMATCH, VOICE_REFERENCE_IN_USE, TRAINING_UNAVAILABLE. Reuse existing consent/artifact/budget errors. Return HTTP 409 for stale/idempotency conflict, 413 bounds, 403 scope/rights, 422 input/mode failures; unavailable provider 503 with stable reason. Durable job failures use structured codes rather than transport errors.

## 4. Provider mapping and mode negotiation

| Provider | Reference mode mapping | Transcript behavior |
|---|---|---|
| VoxCPM2 | reference_clone → reference_wav_path; transcript_clone → reference_wav_path plus prompt_wav_path | transcript_clone requires verified prompt_text; reference_clone does not invent one |
| Confucius4-TTS | prompt_wav for selected reference | not required for documented reference mode; do not pass unsupported fields |
| MOSS | selected checkpoint's documented reference input, represented through adapter normalization | exact checkpoint declares requirement; family-wide assumptions forbidden |
| Fish | reference payload per pinned runtime/API, selected audio and transcript requirements | enforce actual adapter contract; recommended 10–30s is guidance, not universal hard validation |
| Cloud providers | public supported clone create/use or reference-conditioned TTS API | negotiate catalog/persistent-clone/reference modes individually |

MOSS/Fish concrete parameter names must be locked with executable request fixtures against the selected revision in their gated adapter section before enabling that provider. Never invent an API from a family name. User sees unsupported mode instead of silent downgrade. Multiple reference clips require explicit ordered selection and real multi-reference support; do not concatenate automatically. Local prompt caches remain private and revision/hash keyed; revocation invalidates access even if cache bytes exist.

Provider-generated persistent voice IDs have create/list/delete reconciliation and failure states. A local reference clone does not create an imaginary provider voice resource. Cross-language synthesis is capability-gated and listening-reviewed; cloning similarity is not guaranteed by supporting the language.

## 5. Training and adaptation workflow

New optional operation `audio.voice_train`, durable job `voice_training_run`. Local and cloud targets share contract; cloud requires a registered official training API, otherwise TRAINING_UNAVAILABLE. Never simulate training with reference cloning. Initial candidate is a pinned VoxCPM2 LoRA recipe; full SFT and other providers are disabled until separate capability/feasibility proof. Inference memory calibration cannot authorize training. Existing master/local runtime responsibilities are unchanged.

Flow: create dataset draft → import/segment/transcribe with permission → quality/rights review → freeze dataset revision → preflight training recipe and budget → explicit training approval → train/checkpoint → held-out evaluation → review candidate → publish model artifact → create approved trained_voice binding → preview → use in ordinary TTS. No automatic canonical Series voice update.

`VoiceDatasetV2`: datasetId/revision, ownerScope (VoiceOwnerScope), consent scopes explicitly including training, immutable sample manifest artifact and checksum, sample audio/transcript refs, language/speaker labels, quality decisions, train/validation/test assignment, stats and reviewer. Freeze forbids mutation; edits create a revision. Split by source recording to prevent segment leakage, not random adjacent cuts. Validate nonempty held-out split, text/audio pairing and no cross-speaker contamination. Training consent is distinct from inference consent; missing training grant blocks dispatch.

`VoiceTrainingRecipeV2`: provider/model/baseRevision, recipeId/version, method lora/sft/provider_managed, allowlisted hyperparameters with recipe-owned bounds, seed, precision, maxSteps, walltime, disk/memory profile and package/container lock. No arbitrary Python, shell command, URL, plugin or executable checkpoint from user/Skill. Training data minimum/maximum depends on validated recipe and must be shown in preflight; insufficient dataset remains blocked, not padded with generated samples.

`VoiceTrainingRunV2`: scope, datasetId/revision/hash, recipe snapshot, consent/policy hashes, target/binding, approved budget, job/attempt, state and checkpoints. Reuse canonical run state; phases dataset_validation, preparing, training, checkpointing, evaluating, publishing. A completed training attempt produces a candidate, not a production-ready binding. Training must not run concurrently with heavy inference under the initial shared lease policy. Priority is below production inference; yield only at resumable checkpoints, never corrupt optimizer state.

`TrainedVoiceModelV2`: artifactId/checksum, base model/revision, adapter format/version, recipe/runtime identity, dataset hash, training consent lineage, checkpoint/step, evaluationReportId nullable until evaluated, status candidate/approved/rejected/revoked/archived. Prefer non-executable weight format where supported; untrusted pickle/full executable checkpoints cannot be imported. Compatibility check requires exact supported base architecture/revision; never load LoRA on an arbitrary newer base model.

Training APIs: create/update/freezeVoiceDataset, preflightVoiceTraining, createVoiceTrainingRun, getVoiceTrainingRun, cancelVoiceTrainingRun, evaluateTrainedVoice, approveTrainedVoice, rejectTrainedVoice. All mutation/expiry/revision/rate/privacy rules mirror section 3. The create operation needs frozen dataset hash, exact recipe and estimate, max steps/walltime/cost and explicit training consent. Catalog listing reports supportsTraining separately from supportsCloning. Dataset pagination <=100 samples/page, max 10,000 samples/manifest and 20MiB decompressed manifest; corpus byte/duration limits come from recipe quotas checked before download and per streamed file.

Checkpoint resume requires verified dataset/base/recipe/environment hashes and optimizer/RNG state where recipe supports exact continuation; otherwise report restart-required, obtain a new approved attempt budget and preserve old checkpoint. Max walltime/steps/cost terminate safely at checkpoint. Cloud cancellation/unknown billing outcomes reconcile before retry. Never claim remote data/model deletion until confirmed.

## 6. Evaluation, promotion and operational lifecycle

Evaluate baseline reference clone and candidate on the same held-out utterances, normalization and locale. Report measured CER, speaker similarity with method/version, human pronunciation/emotion/consistency, clipping/silence, duration/RTF and peak resources. Do not fabricate a universal similarity threshold. A versioned evaluation profile freezes thresholds before candidate evaluation; absent baseline/thresholds means needs_review and no automatic promotion. Training may fail to improve; retain baseline binding. Report model memorization/privacy checks supported by the recipe and their limitations.

Approval is separate from training completion. Actor with project voice-approval permission selects exact candidate; server rechecks rights and quality evidence. Promotion creates a new VoiceBinding revision. Rollback selects an earlier still-authorized compatible binding, never modifies model bytes. Store canary/preview evidence before series-wide use; bulk rebinding requires explicit list/approval and revision conflicts are visible. Old projects remain pinned.

Revocation walks reference → dataset → training checkpoint/model → binding → audio → export lineage. Block new inference, training, cache hits and playable publication while preserving restricted audit. Cancel active jobs and quarantine candidates; remove caches/provider resources according to recorded retention policy. Already downloaded files cannot be remotely recalled; report affected artifacts and external deletion outcomes honestly. Cross-tenant voice sharing is disabled initially; any future marketplace/share requires a separately approved rights/transfer contract.

Retention: incomplete imports 24h; failed attempt temp files 7 days unless shorter privacy policy; finalized references/models/consent evidence retained while referenced under existing tenant retention settings. Automatic cleanup never removes active lease files or finalized dependency roots. Private training checkpoints are quota-accounted; user may delete unselected checkpoints after dependency review. Backup/restore preserves encrypted local registry, scope IDs and checksums; moving local-only references to another Worker requires explicit authorized transfer, never rebinding by path coincidence.

Observability includes dataset/recipe/model IDs, attempt transitions, checkpoint availability, actual usage and missing metrics. Logs exclude raw text/audio/secrets. Diagnostics show local/cloud distinction, blocked gate and repair action. Audio library supports reference waveform/trim preview, transcript side-by-side, reference quality, profile versions, training progress, held-out comparison and rollback. Follow existing keyboard/responsive state matrix and avoid accidental generation on selection/navigation.

## 7. Delivery and proof

Release A additionally requires the complete reference-import/profile/binding/TTS flow in both local and configured cloud modes, including transcript-required rejection and provenance. Release B retains 178/localization integration. C remains individual optional provider promotion. New Release D covers actual training/evaluation/promotion/rollback for at least one proven recipe; lack of training hardware/API blocks D, not reference cloning releases. Report A/B/C/D individually; do not label training delivered from a skeleton.

Required negative tests: malformed/unfinished import, unauthorized ref, duplicate finalize, stale profile, audio/transcript mismatch, unsupported mode, multiple references, revoked consent/cache, private reference cloud fallback, training consent absent, dataset leakage, executable checkpoint rejection, wrong base model, budget exhaustion, checkpoint interruption/resume, revoked ancestor during publish, failed evaluation, rollback to revoked binding and partial remote deletion.

Default tests use fixtures and fake processes only. Runtime proof records exact model/recipe/GPU/OS revision, real output/checkpoint hashes, held-out evidence, privacy transfers and actual billing. Model downloads, cloud requests and training require explicit execution authorization; this spec authorizes no spending by itself.


## 8. API completeness and revision semantics

`createAudioPlan(scope, utterances, expectedSourceRevision, idempotencyKey)` creates a draft plan for authored or manual narration input; `updateAudioPlan(planId, expectedRevision, patch)` creates a new draft revision; `approvePlan` pins exact utterance/binding/policy hashes. A preview uses an explicitly approved short plan through these operations, not an undefined implicit plan. Draft text artifacts may be worker_local when privacy forbids cloud text. In that case server stores only allowed hashes/approval metadata and Worker verifies exact local payload against the admission hash; raw effectiveText is not required in the cloud DTO. Missing local artifact blocks the job.

Consent operations: `createVoiceConsent(scope, subject, evidenceRef, allowedOperations, providers, locales, expiry, idempotencyKey)`, `getVoiceConsent`, `supersedeVoiceConsent(consentId, expectedRevision, evidenceRef, grant)` and existing `revokeConsent`. They use existing rights-review authorization; an editor may submit evidence but cannot self-assert another person's grant without required review. Changes preserve immutable grant history. Training is an explicit allowedOperation. UI status derives from current reviewed grant and expiry.

`rollbackVoiceBinding(profileId, expectedBindingRevision, selectedHistoricalBindingRevision)` creates a new revision referencing the still-authorized historical settings/model; it never decrements the revision. Profile content revision changes require a new binding snapshot before selecting that changed profile; already approved plans pinned to an older still-authorized profile/binding remain usable. Rights revocation always invalidates them. creating a binding does not itself mutate profile content revision. Mode-specific provenance permits no actor-clone consent for catalog/synthetic voices, but requires the corresponding license/design rights snapshot. Do not demand fabricated reference IDs for those modes.


## 9. Scope, disclosure and retention enforcement

Voice ownership uses a separate `VoiceOwnerScope` union: project (workspaceId/projectId) or series (workspaceId/seriesId), tenant-derived in both cases. It does not require a productionGroupId or episode revision. AudioScope remains the immutable execution scope. Project voices are usable only in that project; Series voices require explicit character association plus a verified membership relationship for each target episode/group/project and applicable consent. `attachSeriesVoice` is an authorized explicit mapping mutation, never an automatic cross-project copy. Consent may narrow either scope. Bindings pin voice revision independently of cut revision. Cross-tenant reuse is denied.

Privacy applies transitively to derived reference audio, transcript, embeddings/prompt caches, dataset manifests and trained weights, not just original bytes. Trained weights inherit the most restrictive dataset transfer rule until an explicit valid rights/policy change authorizes transfer; approved model status alone grants no cloud upload. Exported diagnostics contain permitted hashes/IDs only. Raw reference/profile reads require project editor or voice-review permission; viewers receive approved output playback and redacted summaries only. Provider deletion and lifecycle operations obey the same permissions as creation.

Revocation checks occur on every authorized playback/download issuance and publication; use existing revocable access proxy for restricted artifacts. If existing storage can only provide presigned URLs, their maximum TTL is 60 seconds for these restricted voice/model assets, document the residual access window and do not claim instant withdrawal of an issued URL. Background dependency traversal marks descendants, while synchronous access checks verify current ancestor rights so queue lag cannot authorize access. Retention cleanup respects existing legal/tenant holds; deletion replaces bytes with an audit tombstone where permitted, never preserves sensitive bytes solely because a metadata FK exists.


## 10. Training candidate, evaluation and delivery clarification

A training job finalizes a private candidate model artifact before evaluation. Its nullable evaluationReportId is populated by a separate immutable evaluation result; approval requires that result and exact candidate checksum. This prevents the model/evaluation artifact creation cycle. Failed evaluation does not discard the candidate or baseline. An evaluation job has separate budget/consent because it synthesizes actual speech; its estimate covers both candidate and baseline and it cannot run as a free automatic post-training side effect.

Initial training dataset must have at least three distinct source recordings to create nonempty train/validation/test groups; recipe minimums may be higher. Detect exact duplicate audio and overlapping source ranges across splits. Checkpoint selection uses validation only; final held-out test cannot be reused for tuning without freezing a new split/dataset revision. If provider-managed training cannot prove held-out exclusion, label limitation and require reviewed external evaluation before promotion; do not claim equivalent reproducibility.

Trained model provenance uses a discriminated local_weights artifact or provider_managed_model resource (provider ID/resource ID/base revision and deletion state). A remote training API need not export weights; never invent a checksum of inaccessible remote weights. The managed resource metadata artifact has its own checksum and distinguishes unknown provider-internal model hash. Reproducibility/transfer capability remains explicit. Local inference may use only compatible local weights; remote resource IDs route only to that provider.

Release terminology: A+B is the core dubbing release. D is required to claim the expanded feature including training complete. C is optional per-provider promotion; disabled optional providers are not claimed implemented. Release 07 checks only gates for the release being shipped, so D hardware blocks D rather than blocking A/B. The normative dependency graph is implementation ordering, not a requirement to install every optional model before initial release.

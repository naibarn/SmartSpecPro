# Feature 180 v2 — Normative unified audio contracts

Status: implementation-ready design; no model execution or deployment certified.
This file resolves v1 execution assumptions. `spec.md` retains all speaker review, localization, accessibility, separation, export and source-preservation requirements. This contract adds both execution targets without removing existing providers or workflows.

## 1. Scope and ownership

180 owns shared audio orchestration, voice identity/consent, TTS, localization and dubbing. 179 owns scan evidence and composed edit maps; reuse `speaker_aware_media_scan` and `speaker_aware_edit_plan`. 178 owns production-group music planning, genuine Music3 generation and score mix. Never introduce a substitute model into an existing Music3 job.

All audio operations (TTS, ASR, alignment, separation, music, SFX, mix/master/export) use capability descriptors supporting `worker_local` and `server_cloud`. Support is per installed adapter, not a promise that every operation has both implementations. Existing implemented adapters are retained; unavailable combinations fail preflight. Initial release proves local VoxCPM2 plus one configured existing cloud TTS provider, and shared local deterministic processing. Other providers are staged extensions, disabled until their own evidence passes. A general cloud music/SFX adapter cannot satisfy 178's exact Music3 contract.

Authored DramaSeries dialogue skips mandatory scan/translation. Existing media can enter via subtitles, manual cues or 179 scan. Audio-only narration has no invented shot/Series ID. Stages form a DAG; scanning and localization are never prerequisites for an already approved authored line. Outputs remain immutable.

## 2. Schema and identifiers

Implement strict Zod schemas in proposed `apps/web/shared/verticalDramaMedia/unifiedAudio.ts`, with matching Rust/Python wire fixtures. Envelopes use `schemaVersion: unified-audio.v2`; existing v1 artifacts retain their own versions and are adapted by explicit projections.

`AudioScope` common fields: workspaceId/projectId (opaque nonempty IDs); server derives tenantId/actor from authentication. Discriminator:

| scopeType | Required fields | Forbidden fields |
|---|---|---|
| standalone | projectRevision | seriesId, episodeId, productionGroupId |
| series_episode | seriesId, episodeId, episodeRevision | productionGroupId |
| production_episode | seriesId, productionGroupId, groupRevision | episodeId |

Revisions are positive integers. Existing 179 nullable-Series requests convert to this union at the boundary; do not change its legacy wire meaning. Series ID wire representation follows existing shared ID schema; adapters normalize exactly once.

`UtteranceRef`: utteranceId, revision, sourceKind (`authored_line`, `subtitle_cue`, `narration`), sourceArtifactRef, sourceTextHash, effectiveText, locale (validated BCP-47), speakerRef, optional shotId, and sourceMappings [{sourceId, startMs, endMs}]. Splits/merges retain all original IDs. Start/end are nonnegative integer milliseconds, end greater than start, with explicit source/derived timebase and transform reference. Store sample count/rate for measured audio; round only at declared render boundaries.

`AudioArtifactRef`: discriminated `managed` (artifactId, checksum, revision) or `worker_local` (opaque artifactId, ownerWorkerId, bindingRevision, checksum, revision). Never accept arbitrary URL/file path as authority. Resolve signed download URLs server-side. Worker checks canonical path containment, symlinks, file size/MIME/checksum; no cross-worker dereference of a local handle.

`AudioPlan`: scope, planId/revision/hash, approved utterance revisions, voice bindings, source/edit-map hashes, selected operation graph, rightsPolicyHash, executionPolicyHash, delivery profile and approver. References 178 music plans; does not duplicate them. Mutations require expectedRevision (409 conflict on mismatch).

`VoiceProfile`: stable provider-independent identity, ownerScope (VoiceOwnerScope in voice-lifecycle-v2.md), displayName, defaultLocale, reference refs, reference transcript ref/hash, subjectType (`synthetic`, `licensed_actor`, `user_owned`), consentRef and revision. `VoiceBinding`: profile revision, providerId, modelId/revision, optional catalogVoiceId, reference hashes, locale/style/settings, approval, capability snapshot. Provider voice IDs are not portable across engines. Multiple bindings may target the same profile but need listening approval before use. Existing canonical Series voices remain unchanged unless the user invokes that mutation explicitly.

## 3. Execution and privacy policy

`AudioExecutionPolicy`: mode (`local_only`, `cloud_only`, `prefer_local`, `prefer_cloud`), ordered allowed bindings, allowFallback default false, maxAttempts default 1, maxCostCredits, maxRuntimeMs, priority, and privacyPolicyRef. Fallback candidate selection occurs before submission after privacy/rights/capability/budget validation. Never silently switch a bound voice. After ambiguous cloud submission, reconcile before any alternative attempt; explicit approval or preapproved exact binding list required.

Privacy independently declares referenceAudio, transcriptAndSkillInput, generatedOutput and diagnostics with allowed destinations (`owner_worker`, `authorized_workers`, `cloud`). Most restrictive input wins; consent does not imply upload permission. Local-only reference bytes remain on owner Worker; cloud stores only permitted metadata. Local synthesis may publish its output only when generatedOutput policy allows. Cloud processing of any input requires that input's cloud permission. Cross-worker transfer needs explicit authorized-worker policy and scoped transport.

Cloud credentials stay in existing server secret storage. Local loopback process endpoints require an unguessable session credential and bind loopback only; Worker UI never receives it. User-supplied arbitrary HTTP URLs are forbidden. No provider installation or code execution is implied by skill output.

Server remains project/approval/billing authority. Local queue/DB is execution cache. Offline mode permits playback/edit drafts; new execution requires a server-authorized admission, and restart/reconnect revalidates binding/rights before resumed synthesis or publication. No offline cloud bypass.

## 4. Capability and provider registry

Descriptor: providerId/modelId/modelRevision/runtimeRevision, operation, target, languages, nativeSampleRates/channels, nativeStreaming, nativeTimestamps, alignmentAdapters, reference requirements, supported style/seed/duration controls, OS/runtime modes, measured resource profile, license evidence and health timestamp. Unknown capability is unavailable, never inferred from provider name. Reject unsupported required fields; optional unsupported style settings require visible negotiation before approval.

| Provider | Initial policy |
|---|---|
| VoxCPM2 | First local Thai candidate; pin exact revision/dependency lock and prove actual target GPU runtime before enable |
| Existing cloud TTS | Retain current registered providers; prove one configured adapter via existing server gateway with normalized artifacts and usage |
| Confucius4-TTS | Optional A/B, disabled until checkpoint/runtime/Thai tests pass |
| MOSS Local | Explicit 1.7B vs Local v1.5 4B checkpoint identities; do not infer Thai on old 1.7B; 4B requires calibration |
| Fish S2 Pro | Optional gated adapter; initial supported profile Linux/WSL and >=24GB, plus verified license policy |
| UVoice clone management | Remains unverified/disabled absent public API and probe; ordinary configured TTS retained |

Official reference baseline: [VoxCPM2](https://huggingface.co/openbmb/VoxCPM2), [Confucius](https://github.com/netease-youdao/Confucius4-TTS), [MOSS](https://github.com/OpenMOSS/MOSS-TTS), [Fish requirements](https://speech.fish.audio/install/), [Fish model](https://huggingface.co/fishaudio/s2-pro). These were checked during preceding review; recheck license/model revision at installation, do not substitute moving branch names for locks.

Installation states: not_installed, downloading, installed, model_missing, dependency_error, license_required, hardware_incompatible, healthy, degraded, disabled. Pin package/model hashes, verify space and download approval, resumable download, isolated environments per provider, redacted logs, atomic activation with prior version retained for rollback. No model download in default tests. Removal blocks new admissions, waits for/requires cancellation of active leases and preserves user references/results.

## 5. Jobs and operation boundaries

Use `audio.tts` as capability; durable job kind is `tts_utterance_generate`. Server runs cloud adapter attempts using the existing durable orchestration mechanism; only local attempts are Worker-claimable. Localization runs through existing versioned skill execution. Do not dispatch a cloud job to a Worker just to have it call the server again.

Reuse existing job kinds for scan, ASR, 178 music and mix wherever the wire contract matches; add `audio_alignment` only if no compatible alignment handler exists. `voice_clone_create` is needed for persistent provider clone resources; zero-shot local reference conditioning is synthesis, not a fictitious clone-resource API.

Expose proposed authenticated `unifiedAudio` procedures: `preflight`, `createJob`, `getRun`, `cancelRun`, `approvePlan`, `saveVoiceBinding`, `revokeConsent`. Reuse Worker claim/progress/artifact APIs. Preflight returns eligible exact bindings, blocked codes, input/policy hashes, estimate and 60-second expiry. Create revalidates rather than trusting preflight; require expectedPlanRevision and idempotencyKey. Viewer/read-only/archive cannot mutate. Rate/size limits apply per tenant and actor.

Bounds for initial contract: 16KiB effective UTF-8 text per utterance (provider lower limits win), 500 utterances per request, 100 reference mappings per utterance, 2MiB decompressed inline JSON. Larger plans travel as checksum-addressed bounded artifacts (20MiB decompressed JSON, max 10,000 utterances). Reject oversized input before full parsing; no automatic text truncation. Audio reference maximum 120 seconds/100MiB with provider-specific smaller bounds; validate real decode metadata. Installation downloads use separately declared manifest sizes.

Canonical run states: queued → preflight → running → publishing → completed. An awaiting_review run can resume only with the identical immutable input hash and a valid approval. Changed text/settings/plan revision creates a successor run linked to the prior run; running can checkpoint to awaiting_review. Any nonterminal state can enter cancel_requested → canceled; failures enter failed; queue TTL enters expired. Completed, failed, canceled, expired are terminal. `partial` describes aggregate runs with terminal child outcomes, not a successful final export. Resource unavailability keeps queued with blockedReason and TTL; license/rights/hardware rejection before create returns typed preflight error, discovered during execution yields failed with that code. Map UI `cancelled` spelling to canonical `canceled` at adapter boundary.

TTS phase events: preparing, loading_model, synthesizing, postprocessing, aligning, artifacting. Events include run/job/attempt IDs, monotonic sequence and completed/total utterances; reject stale lease token and duplicate/out-of-order mutations. Heartbeat/lease TTL follows existing Worker constants. Child attempt tokens fence stale workers after lease expiry. Restart can reuse verified checkpoints but cannot assume a lost process produced no output.

Idempotency hash is SHA256(canonical structured scope + utterance/text/reference/voice revisions + exact provider/model/runtime + normalization + locale/style/pause + timing/output + seed + policy hash). Reusing a key with changed hash returns conflict. Attempt ID is separate from logical request. Persist external request ID/outcome before retries. Upload retry reuses verified completed audio. Different seed creates a new take. Same seed is not guaranteed byte-identical across environments. Test adapter-internal retry settings and record every attempt.

Cancellation kills local process groups cooperatively then forcibly after 10 seconds, removes only unfinalized temp files and preserves input/checkpoints. Cancellation while uploading cannot promote playable output. Server publication transaction checks current state, lease, rights, scope, hashes and active binding; cancellation/revocation wins by fencing publication. Cloud unsupported cancel records actual usage and suppresses publication; unknown outcome awaits reconciliation, not blind retry.

## 6. Persistence, security and billing

Add proposed normalized tables `audio_voice_profiles`, `audio_voice_profile_revisions`, `audio_voice_bindings`, `audio_voice_consents`, `audio_pipeline_runs`, `audio_pipeline_steps`. Profiles/revisions/consents reference existing managed or scoped-local artifact ledger. Use existing worker_jobs/worker_artifacts and credit ledger; extend existing attempt infrastructure if present, otherwise add `audio_execution_attempts` for both targets with unique (tenantId, logicalRequestId, attemptNumber). Do not implement a second queue.

Each row has tenantId, workspaceId, projectId where applicable, creator/timestamps. FK profile revision and plan/artifact references; composite tenant constraints prevent cross-tenant attachment. Unique (tenantId, profileId, revision), (tenantId, scopeFingerprint, idempotencyKey), (runId, stepKey). Index runs by tenant/project/status/updatedAt and attempts by reconciliationState/updatedAt. Scope CHECK constraints enforce the union. Source artifacts and historical consent events remain immutable. Revocation blocks new/cache-hit generation and delivery of affected derived artifacts under policy; preserve private audit records. Delete external clones with recorded provider outcome, never claim remote deletion from a local flag.

Add additive Drizzle migration using the next available sequence at implementation time and register ledger. Backfill existing voice identifiers as `legacy_unverified` bindings, not consent. Retain old tables/contracts for compatibility. Migration tests use disposable test DB, never apps/web/.env production/local project DB implicitly. Rollback disables admissions and preserves rows/artifacts; no destructive down migration.

Paid cloud/skill work uses existing estimate/reserve/settle. Local compute usage is recorded separately; no new invented charge or cloud per-character helper on local work. Existing configured local pricing applies; absent pricing is a visible zero local-compute line item (cloud skill charges remain distinct). Enforce maxCostCredits before dispatch, including preapproved fallback. Provider outcome unknown retains reconciliation state/reservation per existing policy. Successful upload cannot trigger second provider charge. Unauthorized scope/rights must fail before charging.

## 7. GPU and process lifecycle

One shared atomic lease spans TTS/Music3/ASR/separation/GPU render, model load and resident VRAM. Initial target permits one heavy inference, with required free memory measured profile plus max(1GiB, 15% of measured peak) margin. Missing calibration allows only explicitly requested bounded calibration, not production admission. Recheck free memory before loading; external GPU pressure causes visible queue/block. Disk admission includes model plus temp/output estimates. Never change another provider environment or kill unrelated GPU processes.

Priority: interactive preview, timeline rerender, production, benchmark, download. Priority affects next admission; preempt only cooperative benchmark at a safe checkpoint, not active production. Installed model does not mean GPU-ready. Maintain process/model/CUDA/license/sample health separately; sample-generation health tests require explicit generation action. Native Windows and WSL are distinct pinned runtime profiles, with explicit selected fallback policy.

## 8. Skills, timing and mix

Reuse server skill registry for `speaker-aware-dialogue-localizer` and `localized-dubbing-quality-reviewer`; add optional `dialogue-delivery-director` for authored emotion/pronunciation proposals. Inputs/outputs include source IDs, text revisions, glossary/locale, bounded timing/style, rationale; server stamps actual skill version/content hash, execution/model and input/output hashes. Untrusted output cannot alter speaker identity, consent, adapter choice or protected text. User approval makes a new immutable plan. Privacy-blocked semantic input uses manual approved text or fails clearly; no implicit local LLM migration.

Synthesis returns actual decoded sample count/rate/channels, checksum, runtime/model/seed/reference identity and measured metrics. Repair the existing `ttsService.ts` MP3 byte-size duration assumption at the normalization boundary; preserve API compatibility but never use estimated duration for final alignment. Native sample rate is recorded before mix resampling. RTF=synthesisRuntimeMs/audioDurationMs; total runtime and TTFA separately nullable if unmeasured.

Alignment consumes the final time-fitted audio checksum. Missing/unreliable alignment gives needs_review and preserves audio for alignment-only retry. Timestamps declare native/forced_alignment/observed_asr/human_verified origin. No word-level evidence implies phoneme, viseme or lip-sync support. Future lip-sync consumes a separate approved artifact and remains outside this release.

Default timed-cue policy: preserve approved text, use supported preapproved provider speed, allow pitch-preserving stretch ratio 0.90–1.10, otherwise TTS_TIMING_OVERFLOW. Semantic shortening needs explicit new approved text. Alignment re-runs after stretch. Free-duration narration has no target-error gate. Timed cues record absolute error and error/target; export must fit allocated intervals within one output frame, or an explicit approved timeline revision. Subtitle readability thresholds are locale/profile versioned.

Mix manifest uses separate dialogue/music/SFX/ambience/original buses; native-dialogue preservation, replacement-dub and mixed-per-cue routing are explicit. If no replacement is requested, never run separation merely to create stems. If separation fails, retain prior artifact and require remove-all or manual-DAW stop. Leakage detector unavailable cannot be reported as passed. 178 owns music takes and group-final-cut lineage; reuse valid takes if only voice timbre changes, rerun mix/QC. Duration/edit/rights changes stale downstream plans. Delivery uses 178 `web_drama_v1` thresholds where applicable; no second conflicting mastering constants.

## 9. UI and release gates

Extend existing panels with target policy, exact provider/model, cost estimate, reference/output privacy, capability/installation state, voice revision, waveform/alignment and retry-same/new-take distinction. Add provider management and voice library surfaces using existing routing/components. No UI owns secrets or dispatches unapproved generation. Local and cloud previews share durable job identity; streaming chunks are provisional until finalized. Preserve old Silence Cut, subtitles, native dialogue and cloud callers.

Release A requires local and cloud TTS vertical slices (authored Thai, standalone cue), consent/privacy, resources, cancel/restart, genuine audio/artifact/timeline/export QC and no duplicate billing. Release B adds localization/separation and 178 integration proof. Release C promotes optional providers individually after reproducible benchmarks; unsupported providers remain visible and disabled. All have backward compatibility, feature-flag rollback and browser accessibility gates. A missing GPU/cloud credential is blocked runtime proof, not a passing fixture test. Benchmark minimum 4 approved voices × 30 varied Thai lines; record CER normalization, human pronunciation/emotion/consistency, cold/warm p50/p95 latency, failure/OOM and resource metrics. Target >=98% synthesis success and no OOM for declared workload; human quality thresholds must be recorded with the first baseline before promotion. No p95 duration error for untimed lines.


## Reference cloning and training lifecycle extension

[voice-lifecycle-v2.md](voice-lifecycle-v2.md) is normative for exact reference import/profile/transcript APIs, TTS profile/binding revision snapshots, provider mode mapping and provenance. Sections 11/12 implement it. Reference-based cloning requires no training; optional training has explicit dataset rights, recipe/resource/budget preflight, held-out evaluation, model approval, rollback and ancestor revocation. Release A includes the full reference flow; Release D separately proves a real training recipe. Local and cloud capability is explicit, not assumed available for every provider. No runtime readiness claim may be made solely from this planning package.


## Recovery and scheduling clarifications from convergence audit

Logical request idempotency is distinct from content cache identity and provider attempt identity. A preapproved fallback keeps logical request ID but records a new attempt with its own effective provider/runtime input hash; a changed user request must create a new logical key. Same-key different-request remains conflict. Duplicate create returns existing run; an explicit `retryRun(runId, expectedStateVersion, idempotencyKey)` creates a permitted attempt only after terminal-outcome reconciliation, never resets historical attempts. New-seed regenerate uses a new logical request.

Unknown external outcome persists `reconciliation_pending` in the attempt ledger independently of run display state. Reconciliation polls honor Retry-After, exponential backoff bounded to 5 minutes, and a 24-hour deadline; deadline escalates to operator review with reservation per existing billing policy, never declares zero usage or resubmits automatically. User cancellation suppresses downstream work while reconciliation continues. A signed or otherwise authenticated provider callback is replay-deduplicated by provider event/request ID and may settle usage but cannot bypass canceled/revoked publication checks.

Queue TTL defaults to 24 hours, configurable by operation policy; it is not inference timeout. Expiration releases unused reservations while unknown provider usage still reconciles. Admission lease expiry fences a disconnected Worker; it must stop inference at heartbeat lease expiry and retain only private incomplete outputs. Reconnect requires a new admission. Do not release GPU allocation to another job until the old process is confirmed stopped; quarantine unresolved processes and surface repair. Cooperative training preemption requests a checkpoint; explicit cancellation still obeys the 10-second force-stop deadline and can lose the current incomplete checkpoint, preserving the last atomic checkpoint. Checkpoints use temporary write, checksum/fsync and atomic rename before advertising resumability.

Rate limits default to existing stricter tenant limits, with additional caps: 10 new generation/training admissions per minute per actor, 100 preflights per minute per actor, 2 active training runs per tenant (subject to the one-heavy-job Worker lease). Reject excess with 429/Retry-After before reserve. Recipe/provider lower limits take precedence. Bounds are versioned configuration and included in diagnostics.

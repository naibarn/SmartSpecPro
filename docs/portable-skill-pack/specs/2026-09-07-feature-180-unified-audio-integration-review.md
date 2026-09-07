# Feature 178–180: Unified audio integration review

Date: 2026-09-07
Status: Proposed design and specification review; not implemented or runtime-certified.

## Recommendation

Keep Feature 180 as the product workflow authority for speaker identity, localization and dubbing. Integrate the attached Worker TTS Provider Implementation Specification v1 as its execution subsystem. Reuse Feature 179 scan/edit-map contracts and Feature 178 production-group music/mix contracts. Do not create another queue, timeline, voice registry or billing ledger for local TTS.

Three options considered:

1. Cloud-only extension: smallest runtime change, but does not satisfy local GPU/privacy goals.
2. Independent Worker audio product: local flexibility, but duplicates project state, approvals and artifact lifecycle.
3. Unified server control plane with local/cloud execution adapters: recommended; requires explicit execution/privacy contracts but supports both existing and new workflows.

## Evidence inspected

- `specs/feature/178-vertical-drama-group-native-music3-plan-mix/spec.md`: final-cut group identity, genuine Music3, immutable plans, managed artifacts, shared resource budgets, mix/QC. Explicitly excludes new TTS.
- `specs/feature/179-worker-speaker-aware-vad-diarization-reframe/claude-spec.md`: user-directed scan/edit stages, evidence and composed edit map.
- `specs/feature/180-worker-speaker-identity-localized-dubbing/spec.md`, sections 6–11 and provider section plan: versioned semantic skills, server-only external provider calls, consent, cue synthesis, separation, export. Header explicitly says implementation is a follow-up.
- Attached `SmartAIHub Worker TTS Provider Implementation Specification v1`: local provider registry, isolated processes, GPU admission, line assets and alignment.
- `apps/web/server/routers/verticalDramaSpeakerAware.ts`: existing scan/edit job kinds and nullable Series scope.
- `apps/worker-app/src-tauri/src/worker_executor.rs`: existing speaker-aware and audio/Music3 job constants.
- `apps/web/server/services/verticalDramaAudioScoring.ts`: actual skill registry/execution integration and server-stamped provenance.
- `apps/web/server/services/verticalDramaAudioPipelineCoordinator.ts`: existing audio job coordination and Music3 identity.
- `apps/worker-app/src/services/audioScoring/smartAiHubSkillClient.ts`: consumes approved server-executed plans.
- `apps/worker-app/src-tauri/src/audio_runtime_sidecar.rs` and `sidecars/audio_runtime/server.py`: Music3-specific runtime; reuse lifecycle patterns, not the same provider environment.
- `apps/web/server/services/ttsService.ts`: existing Python gateway bridge, provider union and fixed character credit helper; duration is estimated from byte length using MP3 assumptions, unsuitable as authoritative WAV/PCM cue timing.

These are source findings, not proof of deployed functionality. Existing dirty files were preserved. SocratiCode tools were unavailable in this session; discovery used shell searches. No database, provider generation, model installation or build/test execution was performed.

## Responsibility and authority

| Layer | Owns |
|---|---|
| DramaSeries / standalone editor | User-authored dialogue, approved speaker/character mappings, revisions, review and export decisions |
| Versioned SmartAIHub Skills | Localization, delivery/emotion proposals, pronunciation proposals, music planning and linguistic review |
| Server control plane | Authentication, tenant/project scope, policy/rights, plan approval, durable job graph, routing, billing and artifact publication |
| Worker Core + local gateway | Local file resolution, capabilities, installation, GPU leases, runtime execution, cancellation and checkpoints |
| Provider adapters | TTS inference and factual native capability reporting |
| Media services | ASR, alignment, separation, timing fit, mixing, encoding and measured QC |

Replace 180's blanket server-only TTS wording with: external cloud provider calls and secrets remain server-side; registered local models execute on an authorized Worker after the same server admission. Local inference is not a direct Worker call to an external provider. Do not generalize existing local LLM connectivity into permission for arbitrary external TTS URLs.

Desktop master documents named in the attachment were not assessed in this review. They must not silently override the verified 178–180 scope and existing contracts; resolve authority explicitly when revising the complete implementation plan.

## Unified user flows

### Authored DramaSeries

Canonical dialogue/character voice → optional versioned delivery-direction skill → reviewed voice binding → line synthesis → measured alignment/timing QC → shot dialogue stem → Production EP assembly → group music plan from approved final cut → Music3 takes → final mix/master/QC/export.

Do not require diarization or ASR to rediscover authored speaker identity. ASR may verify synthesized speech but must not overwrite canonical text. Preserve the existing native-video dialogue route; the editor selects native, replacement dub or explicitly reviewed mixed routing. Never layer a replacement over its original dialogue automatically.

### Existing video or localized version

Source/approved derived edit → optional 179 scan and subtitle-first editing → reviewed speaker registry → skill localization → reviewed cue/voice plan → line synthesis → separation decision → alignment/timing fit → same final mix/export pipeline.

No Series is required. Bind a standalone speaker to a Series character only by explicit action. For offscreen/unknown speakers retain evidence uncertainty. Dialogue creation in the source language must also work without translation.

### Audio-only reuse

Narration or supplied script may enter through the same utterance/voice/TTS contracts without fake shot or Series IDs. Full audio-only UI can follow the initial line-dubbing release.

## Shared contracts

- `AudioScope`: discriminated standalone project, Series episode, or production group. Include tenant/workspace/project identity plus scope-specific IDs/revisions. Do not make every existing episode field nullable or replace group identity with an episode number.
- `UtteranceRef`: stable ID, source kind (`authored_line`, `subtitle_cue`, `narration`), source revision/hash and explicit one-to-many line/cue mapping. `shotId` is optional for standalone cues.
- `VoiceProfile`: provider-independent approved voice identity and reference policy. Separate provider-specific binding with model/voice/reference/locale revisions; provider voice IDs are not portable identities.
- `VoiceConsent`: reuse 180's scope/locales/provider/expiry/revocation evidence. Check at admission, execution and publication. Synthetic voice provenance is distinct from actor cloning consent.
- `AudioPlan`: links immutable utterance, voice, timing, edit-map and music/mix inputs; it references existing 178 plans rather than replacing their tables.
- `TtsExecution`: execution target (`worker_local` or `server_provider`), pinned model/runtime, requested and negotiated capabilities, input hash, job/attempt IDs and actual output references.
- `TimingArtifact`: language, timebase, origin (`native`, `forced_alignment`, `observed_asr`, `human_verified`), aligner revision, confidence and checksum. Word alignment does not imply lip-sync.
- `MixManifest`: explicit dialogue/music/SFX/ambience/retained-source tracks, selected takes, gains, ducking, delivery profile and source-to-output time transforms.

Use `audio.tts` as a capability and adapter task label. Pick one durable TTS job kind (recommended `tts_utterance_generate` from 180), mapped explicitly to the capability. Reuse `speaker_aware_media_scan` rather than introducing a duplicate `speaker_scan` queue kind. Enforce TS/Zod/Rust/Python wire parity and minimum Worker versions.

## Privacy, scheduling and charging

Separate reference privacy, generated-output privacy and transcript/skill-input privacy. A local-only reference may be represented by an opaque owner-worker artifact handle plus permitted metadata; it must not require upload to a cloud skill or provider. If semantic input cannot leave the device and no authorized local skill execution exists, mark the semantic stage unavailable or use a user-authored plan. Do not silently send it to cloud.

One shared atomic GPU lease must cover TTS, Music3, ASR, separation and GPU render, including model loading/residency and external VRAM pressure. A free-memory check alone races. Start with one heavy inference on the target 16GB configuration; actual compatibility requires pinned runtime tests. Queue priority changes admission order, not permission to kill an active production job.

Reuse billing reserve/reconcile for paid stages. Record local compute separately from external provider usage; do not assume local inference is free or apply the existing fixed cloud character price automatically. Product pricing is configuration, with an estimate before approved generation.

Retries retain logical input identity but get an attempt ID. Unknown provider outcomes must reconcile before retry. New seed or changed text/voice is a new take/input revision. Adapter-internal retries must be bounded and reported. Upload retry must reuse the completed audio instead of repeating synthesis. Completed synthesis with failed alignment remains recoverable; only timing/final acceptance is blocked.

## Attachment corrections required

1. VoxCPM2 is the first candidate, not a proven Thai production default on this machine. Official model card lists Thai, 48kHz and approximately 8GB VRAM; actual Windows/WSL performance and quality remain unmeasured.
2. MOSS `MOSS-TTS-Local-Transformer` 1.7B and `MOSS-TTS-Local-Transformer-v1.5` 4B must not share inferred language capabilities. Official repository identifies Thai in v1.5's expanded languages. Do not promise Thai on the older 1.7B checkpoint without checkpoint-specific evidence. The attachment's `MOSS-TTS-v1.5` reference is the 8B family model, not the Local 4B checkpoint.
3. Word timestamps from an optional postprocessor belong to alignment capabilities, not native TTS capability. Missing alignment must not advertise success.
4. Sample metrics are inconsistent: 7,400ms / 2,180ms yields RTF about 3.39, not 0.31. Define synthesis-only and total runtime separately. Unknown TTFA/VRAM metrics are null, not zero.
5. A p95 duration-error gate for lines without a defined target has no specified denominator. Measure target-fit error only for timed cues; separately record free-duration estimates and actual duration. Define overflow policy, allowed stretch and human/skill rewrite approval.
6. Include `completed` as terminal success. Keep blocked/failure reason codes separate from the canonical queue states; specify cancellation during every stage and publication races.
7. Hash canonical structured input, not concatenated strings. Cover scope, effective text, reference hash, voice binding, locale, normalization version, model/runtime revision, style/pause, target timing, output settings and seed. Rights checks apply even on cache hits.
8. Same seed does not guarantee byte-identical output across GPU/runtime versions. Record environment identity and distinguish deterministic cache reuse from regeneration reproducibility.
9. Mock artifacts are test fixtures only. Production capability promotion requires genuine model inference, cancel/restart recovery, real measured audio, publication and timeline proof.
10. Streaming preview uses the same admitted job lifecycle; chunks are provisional and cannot satisfy final artifact completion. Unsupported native Windows/WSL transitions need a selected runtime policy and recorded attempt.
11. Fish 16GB rejection is a chosen initial support policy aligned to documented 24GB Linux/WSL guidance, not a universal impossibility theorem. License/hardware requirements remain per pinned checkpoint.
12. Separate absence of speech, consent denial, low alignment confidence and provider failure. None may produce invented speech or an automatic alternative voice/model.

## Integration changes and migration

- Update 180 spec, synthesized spec, provider/gateway/timing sections, TDD plan and acceptance gates together before implementation; preserve 178 and 179 scope ownership.
- Add a provider-neutral TTS execution service around existing cloud paths. Keep current callers compatible; probe actual duration instead of using the current byte-length estimate for final alignment.
- Extend shared Worker contracts, scheduler/claim admission and runtime manifest for local TTS; reuse queue/artifact infrastructure.
- Add isolated TTS process adapters beside the existing Music3 runtime. Share process lifecycle/resource lease utilities only after impact review.
- Connect 180 mix manifests to 178 group music inputs and 179 timeline transforms. Dub text/timing changes invalidate affected downstream outputs. Voice-only changes can reuse music takes if cut/plan/rights hashes remain valid, but remix and QC must rerun.
- Use additive schema changes and explicit legacy voice binding conversion. Never infer actor consent or silently change canonical Series voices. Old artifacts remain readable, with unknown provenance shown honestly.
- Feature flags disable new admissions on rollback while preserving artifacts and old workflows. Never downgrade a queued payload into an older Worker contract.

## Delivery sequence and proof

1. Contract convergence: scope/utterance/voice/privacy/job/state/timebase/billing matrix; tests for old/new Worker admission, tenant ownership, stale hashes and standalone sources.
2. One real vertical slice: approved authored Thai line → VoxCPM2 → managed WAV → timing validation → timeline → mix/export/QC. Prove same flow with a standalone cue. No need to install all providers first.
3. Localization: 179 evidence → versioned localizer → approved voice → cue dub → separation/leakage checks. Test overlap, unknown speaker, timing overflow and missing stems.
4. Production-group integration: dialogue stem plus genuine 178 Music3 takes, one mix manifest, rights/staleness propagation, selective rerender and shared GPU lease contention.
5. Provider expansion: Confucius A/B; MOSS checkpoint-specific Thai/resource evaluation; Fish adapter gated by verified installation/license policy. Streaming and future phoneme/viseme consumers remain separate capabilities.

Acceptance includes cold/warm latency, actual RTF/peak memory, Thai CER with declared normalization, human pronunciation/emotion/voice consistency review, line/shot/group rerender, cancellation at load/synthesis/alignment/upload, crash/restart, no double charge, no local-reference upload, consent revocation/cache rejection, old Worker rejection and source preservation. Synthetic DSP fixtures do not count as provider quality proof.

## Official references checked

- https://huggingface.co/openbmb/VoxCPM2 — Thai, 48kHz, memory hint, model/runtime details.
- https://github.com/netease-youdao/Confucius4-TTS — Thai and transcript-free cross-lingual cloning; A/B candidate, not local hardware certification.
- https://github.com/OpenMOSS/MOSS-TTS — exact model family names/sizes and v1.5 language expansion.
- https://speech.fish.audio/install/ — 24GB inference and Linux/WSL guidance.
- https://huggingface.co/fishaudio/s2-pro — checkpoint reference for subsequent pinned license/runtime review.

Review disposition: source/spec integration review completed; proposal remains to be incorporated into the full implementation specification. No runtime completeness claim is made for Features 178–180 or any provider.

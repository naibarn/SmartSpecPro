# Feature 177 — Genuine MiniMax Music 3 Scoring, Alignment & Measured Mix (Worker App)

**Status:** SPECIFICATION — implementation not started by this task  
**Created / external evidence checked:** 2026-09-05  
**Owner:** Worker App / audio runtime / media execution  
**Companion and canonical contract owner:** [Feature 176 — Web emotion timeline](../176-drama-series-emotion-timeline-web/spec.md)  
**Builds on:** Features 169 and 175, signed runtime packs, worker leases/artifacts/publication.

## 1. Non-negotiable decision

Worker ต้องใช้ **MiniMax Music 3 จริงเท่านั้นสำหรับเพลงที่สร้างใหม่** รับแผนอารมณ์ที่ผู้ใช้ตรวจแล้วจากเว็บ ถอดเสียงและวางเวลาให้ตรงฉบับตัดต่อ สร้างเพลงจริง เก็บหลักฐานโมเดล ตัดวาง/มิกซ์ และวัดเสียงจากไฟล์จริงก่อนแสดงว่าผ่าน

If the exact model/runtime is unavailable, incompatible, out of memory, unlicensed for the configured deployment, or unable to produce an acceptable take, return a truthful blocked/failed operation. Do not produce a harmonic synth, stock BGM, another MiniMax version, another music provider, empty file or mocked metrics as a successful result. ASR, ordinary audio editing and measurement are separate processing stages, not substitute music generators.

Preserve original media and approved manual edits. No invisible video regeneration, TTS, reference song download, track replacement or paid retries.

## 2. Current code to replace or integrate

| Inspected code | Current behavior / required change |
|---|---|
| `apps/worker-app/src/screens/media-workspace/AutoAudioScoringModal.tsx:69` | Clip names and three canned fallback shots become semantics; no real series binding. Replace with 176 plan/source context and explicit missing-source states. |
| `src/services/audioScoring/dramaticBeatExtractor.ts` / `cueSegmenter.ts` | Keyword inference, unused genre/bible influence, fixed prompts, 20-second minimum and end-of-new-shot boundary. Do not use as production semantic authority. |
| `src/services/audioScoring/audioProviderRouter.ts:34` | Constant suitability/rights scores, first filename containing BGM, empty-path fallback. Remove these success paths from genuine scoring. |
| `src-tauri/src/audio_runtime_sidecar.rs:200` | HTTP polling followed by procedural WAV fallback, fabricated timing/loudness. Replace with durable adapter/ledger, exact model identity, measured reports and no fallback. |
| `src-tauri/sidecars/audio_runtime/server.py:178` | Calls sine-wave/chord generator rather than model inference; health claims GPU/model readiness without verification. Replace implementation; endpoint title is not model evidence. |
| `src-tauri/src/commands.rs:8735` | Direct UI IPC exists outside worker queue. Route through the same typed execution core/ledger as server jobs; one-click UI may not bypass budget/rights/binding checks. |
| `src/services/audioScoring/audioPlacementEngine.ts` | Replaces A2/A3 clips wholesale, can place blank sources, ignores measured cue lengths. Replace with owned non-destructive track patches. |
| `src/services/audioScoring/audioQcEngine.ts` | Simulated LUFS/peak and filename-based vocals check. Retire as production QC. |
| `src/screens/media-workspace/MediaVideoEditorPlayer.tsx:597` | Ducking indicator follows clip presence. `audioDuckingEngine.ts` has waveform logic but this does not prove preview/export wiring. Connect and verify actual processing. |
| `src-tauri/src/worker_loop.rs:2558,2671,2765` | Reuse genuine word-timed whisper.cpp/HyperFrames transcription and Footage Guide normalization. Preserve ready/partial/empty/unavailable distinctions. |
| `src/types/nleProject.ts:50` | Existing timelineStartMs, trimInMs, trimOutMs, speed supply part of the edit map. Add stable episode/shot/occurrence and plan/take provenance; do not derive identity from labels. |
| Web `shared/verticalDramaSeries/audioContracts.ts`, `server/services/verticalDramaAudioMastering.ts` | Reuse native audio contracts/filter-building where correct, but prove invocation against actual audio; correct misleading broadcast labels for web delivery profiles. |

Paths starting `src/` above are relative to `apps/worker-app`. Prototype files were partly untracked/dirty at research time; preserve unrelated work during implementation. Inspect current diffs before replacing functions. This spec does not claim those prototypes are deployed.

## 3. Official provider/runtime/licensing evidence

### 3.1 Research findings and conflicting documentation

| Official source checked 2026-09-05 | Bounded finding |
|---|---|
| [MiniMax model card](https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/README.md) | Genuine checkpoint exists. Describes CUDA, 32 kHz stereo output, SGLang and Diffusers paths, non-streaming generation and soft rather than exact musical control. Describes low-VRAM offloading; this is not a benchmark on the user's hardware. |
| [MiniMax repository](https://github.com/MiniMax-AI/MiniMax-Music3) | Older serving example says two CUDA GPUs; this differs from newer runtime guidance. Do not turn that example into a universal hardware requirement. |
| [SGLang-Omni Music 3 cookbook](https://sgl-project.github.io/sglang-omni/cookbook/minimax_music3.html) | Documents single/dual GPU serving and `/v1/audio/speech`; `input` carries lyrics and `instructions` carries musical description. `max_new_tokens` counts 25 audio frames/second and caps duration; early end is possible. Shows instrumental prompting with a minimal nonempty input. |
| [Diffusers integration PR #14456](https://github.com/huggingface/diffusers/pull/14456) | Merged on 2026-08-13. The model card's instruction to install an unmerged PR is stale. PR description and model card also differ on sample rate: probe real output rather than hardcoding either. |
| [MiniMax hosted music API](https://platform.minimax.io/docs/api-reference/music-generation) | Current documented model enum lists Music 2.6 / cover variants, not a verified Music 3 hosted route. Do not pass an invented Music 3 model ID to that endpoint or silently use 2.6. |
| [Music 3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/LICENSE) | Includes notice retention, prominent MiniMax-Music3 UI attribution, prior written authorization above its stated commercial revenue threshold, safeguards, and third-party-rights obligations. It disclaims non-infringement warranties; output is not automatically cleared. |

Source access failures: model-card link to the PR-branch Diffusers documentation returned 404. Read the merged implementation when pinning the runtime, not that stale branch link. No model weights were downloaded and no inference was run for this spec.

License release checklist for this exact model: archive the complete reviewed license/AUP and component notices with hashes; display required model attribution; operator checks the license's aggregate annual revenue condition (USD 20 million) and obtains prior written authorization when applicable; retain evidence. Include the license's public AI-content disclosure requirement in export/publication guidance and enforce the safeguards it requires. Do not copy consumer web-service terms onto a local-model deployment. Legal approval is deployment-specific and is separate from output review.

### 3.2 Selected runtime strategy

Use a **managed, pinned Music 3 runtime pack**, not a handwritten approximation of its architecture:

1. Primary feasibility candidate: Diffusers integrated Music 3 pipeline with the exact official checkpoint, tested single-GPU profile and offloading where necessary. Review a reachable merged revision; package pinned dependencies and checksums, never `pip install ...@main` on each job.
2. For suitable managed GPU hosts, a pinned SGLang-Omni adapter serving the SAME checkpoint is an allowed explicit execution profile, not an automatic fallback provider. User/admin chooses the profile before authorization; scheduling must match it.
3. No official hosted Music 3 API is assumed. A future hosted profile needs independently verified API/model identity, terms, credentials and a reviewed adapter before enablement.

Choose one verified profile for the first release, rather than supporting both without hardware evidence. Recommend proving a 24 GB CUDA device first and separately benchmarking 16 GB offload if that is the target installation. No claims of 8/16 GB usability, throughput or seconds-per-cue until measured including CPU RAM, disk, cold start and long cues. macOS/non-CUDA hosts may review plans and run supported CPU analysis/mixing but cannot advertise local Music 3 generation; use an explicitly selected verified Worker or report unavailable.

### 3.3 Genuine inference proof and capability admission

Runtime manifest MUST contain model repository + immutable revision, weight/config hashes, inference package/version/commit, dependency lock, license hash, CUDA/driver compatibility, tested hardware profile, and supported contract version. Record actual process/device and loaded model on readiness. A hardcoded `ready: true` or HTTP 200 is insufficient.

Capability family proposed: `minimax-music3-generation-v1`; analysis and mixing are separate capabilities (`episode-audio-analysis-v1`, `episode-score-mix-v1`). Native app registration, heartbeat, server scheduler and job-claim validation must agree on exact model/profile/contract. A mock development worker must never advertise production capability. Trusted package signatures/hash checks establish controlled runtime provenance; do not imply a user-owned remote computer provides cryptographic proof of every GPU operation.

Ready means: compatible runtime installed, verified model present, license policy accepted, available resources, and successful prior real smoke result matching the current runtime/model fingerprint. Probe checks must not generate music or download weights. Model installation is a visible user-triggered operation with size/resource disclosure; startup/page-open never downloads a large model silently.

## 4. Shared job and artifact contract

Require the semantic execution provenance and approved caption/output hash from 176 §5.3 in every generation request. Validate against the server-authorized plan manifest, not a self-declared string from the UI. Pin the approved bundle/output for the attempt; a skill upgrade must not rewrite an in-flight caption. Missing or mismatched provenance blocks dispatch before GPU allocation.

Use Feature 176 §6 as the single normative cross-runtime contract. Web owns schema/version and tenant/series authorization; Worker owns execution. Register these proposed kinds in `apps/web/shared/verticalDramaMedia/contracts.ts`, server worker scheduling, `worker_executor.rs`, `worker_loop.rs` and API publication validators together:

Require `vd-music-scoring-v1` and its semantic/caption execution fields, coordinate discriminator and draft-only flag. Run the shared valid/invalid JSON fixtures through Rust and Python as well as Web validation. Missing required fields, mismatched hashes or untimed regions cannot be repaired with defaults inside Worker. The transport's global protocol version remains independently negotiated.

| Job kind | Input | Output |
|---|---|---|
| `episode_audio_analyze` | immutable cut/source/edit-map refs, snapshot/timeline hash, language and analysis policy | `EpisodeAudioAnalysisV1`, word tokens/VAD/evidence artifacts, probes and actual runtime identity |
| `minimax_music3_generate` | approved plan revision/hash, selected cues, exact model/profile requirement, budget/rights/binding snapshot | `MusicScoringResultV1`, per-take audio + checksums/probes/QC/provenance; explicit per-cue failures |
| `episode_score_mix` | approved take selection, exact timeline/edit-map, source/stem refs, mix envelope and delivery profile | `EpisodeScoreMixV1`, unencoded master, encoded preview/final outputs and actual measurement reports |

Extend media artifact kinds for `music_take`, `score_mix`, and typed audio QC or reference existing `analysis` only with a discriminated payload. Existing enums will reject new kinds until changed. Preserve transcript token data in a checksum-addressed `transcript` artifact; store only bounded references/summary in publication requests. Browser cannot provide a local path to be executed/downloaded by the server.

Direct IPC serializes camelCase exactly as Rust serde expects; verify contract round trips because the current prototype supplies snake_case nested request fields despite camelCase serde. IPC input and server-job input should feed the same validator and durable execution core.

Server orchestration owns per-cue failure/approval and reservations: a multi-cue request may yield successful takes plus failures, but only an explicitly complete selected plan can advance to final mix. No missing cue is silently replaced with silence. A creator may deliberately revise the plan to remove that cue, producing a new approval/hash. Draft-only auditions remain draft-only until Feature 176's observed/human-verified timing gate passes.

On planning-to-episode materialization, Worker uses the server's explicit identity mapping and immutable plan hash; never rebases by title/episode number locally. Existing draft-only takes may be proposed for reuse but require current-cut reconciliation before final apply.

## 5. Actual audio analysis and timeline mapping

Require plan input coverage and unresolved-context flags. `CONTEXT_INCOMPLETE` on a selected critical region blocks final score generation/apply until resolved. Do not fill missing narrative intervals using a generic cue or elapsed-time intensity curve.

1. Resolve assets only through authorized workspace roots or scoped managed artifact downloads. Verify checksums and probe actual stream start, duration, sample rate, channels and frame rate. No probing arbitrary URLs from an LLM response.
2. Prefer the dialogue/native-audio cut corresponding to the final picture revision before new score is added. Existing copyrighted/baked music triggers the conflict gate in 176; do not assume ASR or stem separation clears rights.
3. Reuse bundled whisper.cpp multilingual transcription via the existing runtime pack. Keep original tokens/confidence and normalized matching text separately. Empty speech is `empty`, missing executable/model is `unavailable`, interrupted/low-coverage output is `partial` or `failed`; never populate authored dialogue as if transcribed.
4. Normalize ASR into cut-relative or source-relative timestamps explicitly. Follow 176's edit-map math; account for trims, speed, repeated clips, audio offsets, silence removal and overlaps. Do not sum requested 8-second durations when actual media differs.
5. Map authored dialogue to observed tokens with uncertainty and unmatched lines. Actual tokens do not prove character identity; unresolved speakers stay unknown. Silence/reaction emotion uses authored/visual/human evidence, not invented words.
6. Publish analysis and let Web create a reviewable observed-time plan revision. Worker never silently approves it or runs generation just because analysis completed.

Cache by source checksum + normalized edit map + ASR model/runtime/alignment version. A final-cut transcript must not be remapped twice. For speed ramps/reverse or insufficient consolidated-shot boundaries, return explicit unsupported/partial mapping and request review. Frame/sample coordinate conversions are deterministic and included in tests.

Keep `observed_asr`, `aligned_expected`, `human_verified` and `planned` timing origins distinct at token/region level. Benchmark coverage as well as error; no silence hallucination or expected-script injection may improve a metric. Non-speech confidence comes from real inspection/VAD/human evidence, not absence of tokens after an ASR error. Once corrected timing changes, regenerate dependent envelope/mix hashes without pretending the original ASR artifact changed.

## 6. Cue planning and genuine music generation

**Skill-first semantic boundary:** all automatic emotional interpretation, creative grouping and musical direction must come from the LLM skill pipeline in Feature 176 §5.0–5.3. Worker must not run keyword/intent/sentiment detection or reconstruct creative rules locally. Missing valid skill-authored direction blocks automatic scoring. Signal analysis, timestamp mapping and DSP are technical processing only; manual changes retain explicit manual provenance.

### 6.1 What belongs in the model request

Music captions arrive from the approved `compile_music_caption` mode of `vertical-drama-emotion-score-director`. The adapter only serializes these to verified runtime parameters; it must not add hardcoded genre/emotion prose. Interactive requests for a different mood return to that skill through the authorized web job flow before changing the approved caption.

The approved plan becomes a music caption: instrumentation/palette, energy progression, emotional intent, tempo/key preference, sparse arrangement around dialogue and instrumental/no-vocals intent. Technical mixing values stay in DSP, not promises embedded in music prose.

For the SGLang profile, adapt to documented fields `model`, `input`, `instructions`, `seed`, `max_new_tokens`, `response_format`, `stream`. A minimal instrumental scaffold such as `[Intro]\n(instrumental)` is a candidate per the cookbook, not proof that vocals cannot appear. The Diffusers profile maps to its pinned pipeline's verified parameters. Do not invent structured `tempo_bpm`, `target_lufs`, intensity or exact timecode controls as native model features. Store both canonical musical intent and the exact runtime request for audit.

No episode dialogue in lyrics; no reference song, cover, artist imitation or unauthorized samples. Use the rights policy in 176 before dispatch, again after prompt compilation, and before apply/export. The model's recommended caption enhancer may inspire field structure, but must not inject artist/song references behind the user's back.

### 6.2 Musical continuity and timing

Treat `uncertain` emotional regions as reviewable, not a request for generic neutral music. Worker preserves audience/character distinction and evidence references in the displayed plan; it may not convert a signal-level arousal estimate or ASR confidence into an emotion label or music style.

- The LLM skill proposes phrases/cues spanning compatible dramatic regions, not one file per second or automatically one per shot. An optional 12–45 second preference belongs in the skill, not a deterministic segmenter; no hard minimum or provider guarantee is implied. Worker validates the approved intervals without deciding which emotions to merge.
- Respect intentional music silence and dialogue-protection intervals before optimizing cue length. Split at the approved event boundary, not at the end of the next shot. Short impact cues may use a suitable passage from an approved genuine take; no procedural replacement stinger.
- Validate a complete interval coverage map: intentional no-score regions are explicit, gaps are reviewed, overlaps have approved crossfades/layers, and crossfade handles cannot intrude into protected silence. Technical overlap detection may reject a plan but cannot choose a new creative transition.
- Generate handles for fades/transitions and probe actual output duration. Early end or unsuitable phrase boundaries yields `needs_review`/insufficient coverage; never stretch/pad/loop automatically until a success flag appears.
- Select a usable musical passage using measured onset/phrase candidates and human audition. Tempo/key guesses are advisory. Exact anchor placement is an EDIT after generation, not a guarantee that Music 3 obeyed “climax at 17.2 seconds.”
- Permitted edits are declared per cue: trim, gain, fade and crossfade by default. Optional time stretch capped initially at ±3% requires user approval/audition and processing provenance; none by default. Loop only an explicitly approved seamless region. Intentional zero-music ranges remain silence, never report as generated audio.
- Series palette and selected genuine-theme assets establish continuity. Reusing a seed does not ensure the same motif across unrelated prompts. No invented reference-audio/continuation or stem-generation capability. Reuse requires explicit approved same-project genuine asset and valid rights/provenance.

### 6.3 Inference result admission

Generation admission requires completed plan and `critique_caption` skill reviews (or explicitly recorded human resolution of returned findings) and authorization covering the exact compiled caption. Missing/failed-to-run critique cannot be presented as completed. A generation/QC failure that needs a new emotional direction returns to a bounded 176 skill revision; the Worker cannot auto-rewrite the caption or consume unlimited LLM/music attempts.

Successful inference produces a nonempty decodable audio artifact with actual sample rate/channels/duration, immutable source checksum, exact model/runtime profile and request hash, seed, wall-clock timestamps, compute/resource usage and license-policy snapshot. Measure what the model emitted; a conversion to 48 kHz does not restore absent high-frequency detail.

Run vocal-presence screening and listen to selected takes. Detection uncertainty is a review state, not an automatic zero. Unwanted vocals, intrusive melody, wrong emotion, truncation and unusable edit points may fail creative admission even though inference completed. Maximum additional takes are bounded by explicit authorization; never hide an infinite regeneration loop.

Unknown existing project-bin audio cannot pass this path. A genuine approved prior take can be reused by asset ID/provenance only, never filename. Existing synth/prototype output stays historical/unverified and cannot be relabelled as MiniMax-generated.

## 7. Durable execution, resource safety and failures

Use existing server worker lifecycle (`queued`, `claimed`, `preparing`, `running`, `uploading`, `publishing`, `indexing`, terminal states) and leases. Maintain an on-disk attempt ledger with request hash, model revision, process ID, stage checkpoints, artifact checksums, cancellation and publication state. Python's in-memory dictionary is not a recovery ledger.

- One heavy inference at a time per approved GPU resource lease; coordinate with video generation, local LLM, ASR and stem-processing jobs. Schedule ASR/inference/mix sequentially where memory contention requires it. Offloading changes placement of the same model, not provider identity.
- Fixed 30-second polling windows are inadequate. Separate heartbeat/lease timeout from configurable per-profile execution deadline. Progress reports observable stages; never fake percentages or generation time. Queue wait is distinct from inference time.
- Idempotency includes tenant/scope, plan hash, cue ID, model/runtime, request hash and seed; server deduplicates duplicate clicks. Retrying upload/index uses existing bytes. Uncertain running/finished inference must be reconciled before re-execution.
- Cancellation stops the owned job/process group safely, records terminal state and prevents late publication/apply. Do not kill unrelated Worker/IDE processes. If the backend cannot interrupt a kernel safely, drain/quarantine the result and report cancellation truthfully.
- Resource admission failure leaves no successful take. Downloads/uploads use bounded timeouts, size checks, retry caps and temporary files with atomic final rename.
- Binding revocation, expired credentials or stale plan during execution permits cleanup/history but never unauthorized publication or apply. Deleting a project must not expose orphaned private artifacts.

Typed errors include `MODEL_NOT_INSTALLED`, `MODEL_IDENTITY_MISMATCH`, `RUNTIME_INCOMPATIBLE`, `GPU_UNAVAILABLE`, `INSUFFICIENT_RESOURCES`, `LICENSE_REVIEW_REQUIRED`, `PLAN_STALE`, `TRANSCRIPT_UNAVAILABLE`, `TIMELINE_MAPPING_PARTIAL`, `NATIVE_MUSIC_CONFLICT`, `GENERATION_FAILED`, `GENERATION_OUTCOME_UNKNOWN`, `VOCALS_DETECTED`, `TAKE_TOO_SHORT`, `QC_FAILED`, `RIGHTS_REVIEW_REQUIRED`, `PUBLICATION_FAILED`, `CANCELED`.

Worker emits stage/attempt usage with an idempotent attempt ID and output hash; server is the billing authority. Persist generation-complete state before upload so a restart can reattach existing bytes. A failed publication cannot consume another music or semantic attempt. Never self-extend the authorized deadline/attempt budget to hide a failed run.

## 8. Non-destructive placement, preview and export

### 8.1 Timeline patch

Each generated clip is owned by plan/cue/take IDs with a unique occurrence ID. Applying a plan patches only its owned score clips, creates the music track if absent, and preserves manual A2/A3 clips and original V1/A1. Existing manual music conflicts require review; do not overlap blindly. Undo restores the prior owned score change set and selected score mix while preserving unrelated later edits.

Apply actual source in/out, timeline start, measured duration, handles and envelope. Validate every source path before patching. Never create empty SFX clips; SFX design remains the existing native/approved sound pipeline and is not a hidden fallback for music.

Apply the validated project patch atomically only if the local project revision and server-approved plan/cut hashes still match; otherwise preserve current edits and present a conflict. Validate all selected files before any track mutation. Repeated apply of the same patch is idempotent and cannot duplicate clips. Undo restores only the owned revision/change set without reverting unrelated later manual edits. Production joins consume 176's explicit composition/skill-reconciliation revision, not local duration summation or a new heuristic transition.

### 8.2 Dialogue and music mixing

Use one versioned mix description for preview and final render. Dialogue protection is driven by actual dialogue audio/VAD/manual protected intervals, not a clip's mere presence. When V1 carries the speech and A1 is empty, the routing must still use the actual speech source. Music uses envelope ramps with reviewable attack/release/attenuation; avoid blanket -16 dB settings and pumping through every breath.

Keep original dialogue/native master immutable. If no clean dialogue stem is available, use approved speech intervals to control the score and report limitations; never attenuate all original audio as a stand-in for reducing only music. Native music conflicts must be resolved before score apply. No new separation/TTS calls without their separate authorization.

Provide offline-rendered reference preview for exact approval; live WebAudio preview may be approximate but must disclose that and pass drift/gain tests. “DUCKING” appears only when the active audio graph/envelope actually attenuates music. Ensure fades are applied once, not burned into generation output and applied again unknowingly.

### 8.3 Render and measured QC

Use existing bundled FFmpeg and proven assembly/Remotion hooks. Build explicit filter inputs and labels, trim/delay/fade/mix correctly, then measure the full program and encode. Keep the unencoded master and exact filter/processing version. A server helper that merely returns a filter string is not evidence that export used it.

Selected delivery profiles are explicit product settings, not universal platform rules:

| Profile | Proposed policy |
|---|---|
| `web_drama_v1` | Default integrated target -16 LUFS, tolerance ±1 LU; post-encode true peak ≤ -1 dBTP. Listen for preserved dynamics; LRA is reported, not automatically flattened to a fixed value. |
| Existing Feature 175 -14 profile | Preserve existing saved projects; expose as an explicit alternative and remeasure. Do not silently change their target. |
| Broadcast | Separate delivery requirement and profile; do not label -14/-16 as the EBU broadcast target. |

EBU R128 specifies a -23 LUFS broadcast target and measurement requirements; adopting its measurement method does not make a -16 LUFS product preset broadcast-compliant. See [EBU R128](https://tech.ebu.ch/docs/r/r128.pdf). FFmpeg documents loudnorm's measured/two-pass parameters and audio filters used for this processing; see [FFmpeg loudnorm](https://ffmpeg.org/ffmpeg-filters.html#loudnorm).

Required actual reports: source and final duration, integrated/short-term/momentary loudness as available, true peak, LRA, clipping/nonfinite samples, dialogue protected-window levels, music silence-window level, channel/phase/mono check, decode success, and post-AAC/Opus encode measurements for the emitted formats. Include analyzer/version/command, input checksum, measurement timestamp and status. Silent/too-short material yields not-applicable/insufficient data where necessary; never convert unknown to pass or assign -16.2 by formula.

Two-pass normalize or equivalent verified measurement-driven processing; resample explicitly to project rate, initially 48 kHz stereo, and remeasure encoded output. If AAC overshoots, lower ceiling/remix within a bounded DSP-only attempt budget. No music regeneration for a fixable gain issue. A QC remediation must rerun QC and replace the displayed report; do not display the pre-remix result as final.

Mastering cannot make a bad creative cue emotionally correct. Technical pass and creative acceptance are separate, and rights review is a third independent gate.

For acceptance, music-only bus RMS must be ≤ -60 dBFS inside explicitly protected music-silence windows after approved fade tails (or digitally zero when the plan requires strict silence). This is a product test threshold, not an industry loudness standard; measure the music bus, not the dialogue/native master. Verify prescribed ducking attenuation within ±1 dB of its envelope on steady test windows and inspect attack/release transitions for artifacts. Anchor placement must be within one declared output frame and project audio length within one frame of the approved cut, with sample-rounding recorded. Report actual errors and thresholds in the QC artifact.

DSP fixes may change gain/fades only within approved edit constraints and always generate a new mix hash/report. Changes to emotional trajectory, cue grouping, a protected window or caption require the 176 skill/human revision path, not an automatic QC heuristic. Silence/short-program exceptions must be explicit not-applicable fields; missing measurement still blocks any claim that the relevant gate passed.

## 9. Security, rights and local service boundaries

Worker may emit bounded frames/audio evidence only under the requested analysis policy and active binding. Web decides authorized LLM submission; Worker must not call an unconfigured semantic provider or label raw waveform features as emotional understanding. Expired evidence URLs are refreshed through authorized artifact access, not replaced with public uploads.

Replace fixed shared bearer token with a per-install/session secret delivered via secure process environment/IPC and stored outside project exports. Loopback binding only; restrict origins and authentication, validate request lengths/durations and opaque IDs, and generate file names internally. No caller-supplied `output_dir` traversal. Remote runtime profiles need existing trusted worker transport, not an unauthenticated open inference port.

Publish through existing tenant/worker/series binding and worker-artifact proof checks. Match checksums/size/MIME, contract version, active binding revision, plan identity and job ownership. Never accept a provider/model label as sufficient evidence of trusted runtime installation. No token/private URLs in logs or specs.

Treat plan/caption text as inert data: no shell interpolation, dynamic imports, remote skill lookup or command execution from its contents. Validate server-owned authorization separately from creative output. Reject forged approved flags and path/URL references even when a payload otherwise claims valid skill provenance.

Implement 176 rights states independently of technical QC. Retain license notice bundle and required UI attribution, model/request provenance and AI-origin export metadata/disclosure guidance. Provenance helps audit; it is not a copyright clearance certificate or a substitute for listening/review. Unresolved recognizable melody, missing rights or revoked approval blocks final score export.

At mix/export admission, revalidate selected take/ancestor checksums and scoped rights status against the server snapshot; an old cached green badge is not authorization. Content changes produce a new output hash and review linkage. Emotion-skill output cannot approve rights, and no new take may inherit clearance merely because it uses the same seed or caption.

## 10. Implementation slices and explicit go/no-go gates

### W0 — Genuine-model feasibility before full feature rollout

After a separate authorized installation/compute action, use the exact pinned Music 3 weights to generate at least six short instrumental cues covering tenderness, grief, suspense, action, sparse dialogue underbed and a restrained reveal. Audition all takes; store actual output hashes and metrics. Measure cold/warm load, peak GPU and CPU memory, disk size, generation latency and failure/retry behavior on the intended supported machines.

Compare Diffusers and SGLang profiles only if hardware and budget permit; select one based on reproducible evidence. Validate the instrumental request against the pinned adapter. If clean instrumental generation or acceptable memory/latency cannot be achieved, keep generation disabled and document the failure. Do not introduce another music model to pass W0.

### W1 — Contracts/runtime truthfulness

Consume 176 schemas, implement strict model capability/readiness and managed runtime manifest; remove prototype synth/project-bin/empty-path success routes and fake metrics. Add durable ledger and camelCase IPC tests. Existing legacy assets remain readable but ineligible as genuine takes.

### W2 — Audio analysis and publication

Extract reusable ASR service from worker loop without regressing footage analysis; artifact-backed tokens, actual edit maps, tenant-safe publication, source hashes and stale-data reporting. Pass Thai timing corpus before claiming observed precision.

### W3 — Generation and take admission

Connect real adapter, resource scheduling, policy/budget checks, cancellation/recovery and per-take validation. Output genuine provenance and probes; integrate take audition. No automatic extra attempts beyond authorization.

### W4 — Placement/mix/export

Non-destructive project patches, actual speech ducking, render reference preview, measurement-driven mix/master, post-encode QC and rights-gated apply. Preserve native-audio defaults and existing saved project targets.

### W5 — Cross-product proof and release

Run 176 listening/timing evaluation, production-episode joins, full web→Worker→artifact→web→export flow, then a selected-series canary. Sign/check runtime and app releases on supported targets; pin minimum Worker/contract version. Rollback stops new jobs and permits read/undo of prior projects, never deletes user music/source files.

The narrow vertical slice order is: 176 contracts → W0/W1 → 176 draft review + W2 → observed plan approval → W3 → W4 → W5. Web planning can ship independently while generation remains unavailable.

## 11. Test and verification requirements

| Proof surface | Required evidence |
|---|---|
| Genuine-only negative paths | Missing/wrong weights, false health, wrong version, synth/project-bin output and empty artifact cannot register capability or satisfy a production job. |
| Timing | Actual vs planned lengths; nonzero stream offsets; speed, trims, gaps, repeated assets, merged shots, B-roll/J-L cuts; half-open boundaries; source/final transcript distinction; cancel during ASR. |
| Semantics | Approved 176 regions/locks stay authoritative; never fall back to keyword labels or canned scenes when plan absent. |
| Skill provenance | Missing/mismatched execution or caption hash blocks dispatch; adapter never injects creative prose; manual override provenance and production-join reconciliation remain intact. Test exact-version round trips against 176 fixtures. |
| Inference | Real W0 artifacts on supported GPU; measured duration, unwanted vocal/short-take handling and request/seed/model lineage. Test doubles may test error paths but cannot count as this acceptance evidence. |
| Durability | Restart after generation/before upload; duplicate requests; disk full; OOM; long inference; disconnect; revoked binding; cancel+late result; retries never double-charge/regenerate accidentally. |
| Mixing | A1 empty/V1 speech; music silence; waveform-driven actual attenuation; no doubled fades; preserve manual tracks; output equal within documented rounding to timeline; preview/reference sync. |
| QC | Real FFmpeg test files and genuine music samples, analyzer errors return unknown/failure, post-encode peaks checked, stereo→mono audition, no hardcoded pass values. |
| Rights/security | Missing/revoked rights blocks export; prompt-policy rejection; scoped artifact access; path traversal, token/CORS, oversized request and forged lineage tests. |
| Release | Native/Managed WSL quoting and path tests; signed pack/version/hash verification; compatibility floor; no implicit dependency/model download on startup. |

Future commands appropriate to implementation: `pnpm --dir apps/worker-app build` (currently TypeScript check + Vite), `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml --lib`, focused web contract/publication tests, Python adapter tests in its pinned environment, actual authorized GPU smoke and ffprobe/FFmpeg render checks. Use the repository's package manager; no dependency installation in this spec-writing task.

No test with mocked generation, synthesized fixture, or synthetic audio can be presented as proof that real MiniMax music sounds good. Small artificial test signals are acceptable only for isolated DSP/error-path unit tests, never as user-facing generated music or perceptual acceptance samples.

## 12. Completion definition and remaining uncertainty

Complete only when a creator can review grounded observed-time regions, authorize real Music 3 generation, audition a traceable acceptable take, apply it without destroying edits, and export a measured rights-reviewed mix against the current cut. Web/Worker revision mismatch, unknown measurement or absent generation capability must be visible and blocking where relevant.

Known unproven items: actual hardware availability/performance, robust instrumental adherence, Thai timing accuracy, listener preference improvement, and applicable deployment license review. These are concrete gates, not reasons to mock a successful implementation. This task delivers reviewed specifications only; it has not downloaded models, generated music, changed production or proven audible quality.

**Specification review:** the original two-pass review is superseded by the user-requested [sequential 20-round audit of both specs](../176-drama-series-emotion-timeline-web/review-20-rounds.md). Runtime, real LLM behavior and listening tests remain future acceptance work, not results of repeated document checks.

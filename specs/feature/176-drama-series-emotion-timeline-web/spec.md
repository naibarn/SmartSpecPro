# Feature 176 — Drama Series Emotion Timeline & Music Direction (Web)

**Status:** SPECIFICATION — implementation not started by this task  
**Created / evidence checked:** 2026-09-05  
**Owner:** Web / Vertical Drama / shared audio contracts  
**Companion:** [Feature 177 — genuine MiniMax Music 3 Worker](../177-worker-minimax-music3-scoring/spec.md)  
**Builds on:** Features 161, 169, 175; existing worker control plane and media publication.

## 1. Decision and intended outcome

เพิ่มเครื่องมือสร้าง “แผนอารมณ์และการกำกับเพลงตามเวลา” ใน Drama Series โดยอ่านเรื่องทั้งซีรีย์ แผนตอนที่ใช้งานอยู่ เรื่องย่อรายช็อต บทพูด และอารมณ์ตัวละคร ก่อนเสนอช่วงเข้าเพลง เปลี่ยนอารมณ์ หยุดเพลง และลดเพลงใต้บทพูด ผู้ใช้ตรวจและแก้แผนได้ก่อนสร้างเพลง

แผนจากบทเป็น **เวลาคาดการณ์** เท่านั้น เมื่อมีวิดีโอจริงให้ Worker ถอดเสียงและตรวจ timeline ของฉบับตัดต่อ แล้วสร้าง revision ที่อ้างอิงเวลาจริง แสดงได้ถึงวินาที/มิลลิวินาที แต่ต้องแสดงความมั่นใจของการตีความอารมณ์และความคลาดเคลื่อนของเวลาแยกกัน

All newly generated score music MUST come from the actual `MiniMaxAI/MiniMax-Music3` model through Feature 177. No synthetic music, other model, stock track, filename-based selection, mocked result, or silent provider substitution may satisfy that requirement. Intentional artistic silence is a valid plan action, never a fabricated generation success.

Expected improvement is stronger narrative alignment, deliberate silence, consistent sonic identity and clearer dialogue. This is a testable product hypothesis, not a claim that the current implementation or this specification already produces Hollywood-quality sound.

## 2. Verified baseline and evidence limits

### 2.1 Repository evidence

Paths below are relative to repository root. Line references describe the inspected working tree and can move.

| Existing surface | Evidence / design implication |
|---|---|
| Overview / active story version | `apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx:2787` uses `getActiveBreakdownItemsForDisplay`; resolver at `client/src/components/verticalDramaSeries/VerticalDramaArcReplanCard.tsx:71` prefers the active `breakdownVersions` item, then legacy breakdown. Never read only `bible.episodeBreakdown`. |
| Deep nine-shot drafts | `apps/web/server/services/verticalDramaStoryBible.ts:313,722` defines shot dialogue and episode breakdown; `shotDrafts` contains summary, characters/emotion/emotion_after, dialogue_lines and optional silence intent. |
| Materialized episode | `apps/web/drizzle/schema.ts:22857` stores script, storyboard, dialogueAudioPlan, motionPromptPack, assemblyManifest. `client/src/lib/verticalDramaStoryboardData.ts` already reconciles several display sources. |
| Planned timing | `apps/web/shared/verticalDramaSeries/durationProfiles.ts:264` returns an active nine-shot duration vector; legacy records need explicit compatibility handling. `dialogueAudioTimeline.ts:16` documents that its offsets use PLANNED clip lengths, not media probes. |
| Native audio foundation | `apps/web/shared/verticalDramaSeries/audioContracts.ts` defines native ShotAudioIntent, SeriesSoundBible and AudioManifest; `drizzle/schema.ts:24528` defines sound-bible, per-shot manifest and QC tables. These are existing infrastructure, not proof of completed production DSP. |
| Actual ASR reuse | `apps/worker-app/src-tauri/src/worker_loop.rs:2558,2671,2765` normalizes real word timings and Footage Guide transcript metadata. `runtime_manifest.rs` describes pinned whisper.cpp/large-v3 assets. |
| Publication gap | `apps/web/shared/verticalDramaMedia/contracts.ts:514` allows transcript/analysis artifacts. `server/routes/workerSeriesControlPlane.ts:752` validates artifact provenance; its searchable transcript is flattened text. Preserve token timings in a typed artifact rather than in the text index. |
| Current disconnected scoring | `apps/worker-app/src/screens/media-workspace/AutoAudioScoringModal.tsx:73` sends clip names, omits dialogue, and hardcodes series identity. Companion spec replaces this path. |

SocratiCode discovery tools were unavailable in this session; targeted shell reads were used. The working tree contains pre-existing changes, including audio prototype files. Findings refer to that tree, not a verified deployed Worker binary.

### 2.2 Read-only database observation

Inspected the database configured by local `apps/web/.env`, database name `smartspec`, using read-only transactions. No credentials, private media URLs or account identities are included here. This is NOT proof that the screenshot's hosted deployment uses the same database, nor that saved video URLs remain playable.

For series **53**, `คู่กัดลวงรัก`:

- 52 episode rows: 50 `normal`, 2 `special_tie_in`. Do not confuse normal episode number with a globally unique episode identity.
- 34 breakdown versions; active version `2bcec406-e1ae-4f11-a44c-3102dbf16758` has 50 items, all with nine shot drafts. The legacy top-level breakdown has 50 summaries but is not the richest current source.
- 21 materialized episode rows contain nine storyboard shots; 31 do not. Thus lack of a materialized storyboard does not mean lack of authored shot data.
- 16 rows have `assemblyManifest.compiledVideo.status = completed`; 36 have no compiled-video entry. These are persisted states, not fresh probe results.
- Episode **225**, normal episode 1: target 72 seconds; shot 1 has planned `00:00-00:08`, action, explicit shock emotion, narrative purpose, dialogue excerpt and target speech duration. The active overview draft has two dialogue lines in shot 1, while the materialized storyboard excerpt contains one. Source disagreement is real and must be shown rather than silently merged.
- Script contains `scene_dialogue_summary` and `character_emotional_arcs`. The first two inspected episodes have empty dialogueAudioPlan objects.
- Series 53 has zero rows in each existing sound-bible, audio-manifest and audio-QC table. Their existence does not mean analysis has run for this series.

No transcription, music generation, playback, media download, migration or data mutation was performed during specification research.

## 3. Scope, alternatives and ownership

| Approach | Benefit | Limitation | Decision |
|---|---|---|---|
| Script-only cue plan | Works before video, low latency | Cannot know actual spoken timing or performance | Supported as clearly labelled draft |
| Script + actual transcript + edit map + selected visual evidence | Uses authored meaning and actual execution; supports silence/reactions | Requires versioned analysis and user review | **Recommended production path** |
| End-to-end video-to-music black box | Fewer visible steps | Hard to audit timing, rights, cost and repairs | Not selected |

Web owns semantic source resolution, LLM analysis orchestration, plan review, revisions, rights policy, budgets, server authorization and canonical shared contracts. Worker owns media probes, ASR execution, genuine music inference, measured DSP/render/QC and artifact publication. Do not implement two independent emotion planners with different source precedence.

In scope: normal subepisodes, plan-only overview entries, selected special episodes, final-cut timeline, and explicit full-production-episode composition of approved subepisode plans. Phase 1 is stereo score over preserved dialogue/native audio.

Out of scope: new TTS/voice cloning, video regeneration, fully automated publishing, autonomous copyrighted reference-music ingestion, a full DAW, Atmos certification, and changing Feature 175's native-generation toggle semantics.

## 4. User flow and surfaces

1. In **ภาพรวม**, add “แผนอารมณ์และดนตรี” to each episode card. Use the active breakdown item even before an episode row exists. Series-level action selects episodes and shows readiness/cost; never starts all 50 by default.
2. In **ตอนย่อย**, expose the same plan linked to that episode. The nine-shot table shows authored emotion and dialogue plus planned/observed timing. Do not duplicate plan storage per tab.
3. “สร้างแผนจากบท” creates a durable analysis job, not music. Present estimated LLM cost before the user starts it. Reruns produce revisions and preserve manual edits/locks.
4. “ยืนยันเวลาด้วยวิดีโอจริง” selects an immutable cut/media revision and schedules Feature 177 analysis. Show missing assets or absent compatible Worker explicitly. Observed-ASR timing and human-verified timing (including genuinely silent material) have distinct labels; planned/expected-text alignment never receives either label automatically.
5. Review a synchronized waveform/video and a table: start/end, shot, story event, audience emotion, character emotion, energy, music action, dialogue priority, rationale, evidence, timing basis and uncertainty. Seek to a region; zoom to milliseconds; second ticks are a view, not a claim of 1-second inference accuracy.
6. User can drag boundaries, mark intentional music silence, protect a dialogue line, lock an emotion/transition, and override the suggested score. Show conflicting source texts side by side. Edits carry actor/time/reason and create a revision.
7. “อนุมัติแผน” freezes its semantic and timeline hashes. “สร้างเพลงด้วย MiniMax-Music3” is a separate explicit action showing selected cues, runtime identity, resource budget, maximum takes, and rights status. Previous plan generation is not authorization to create music.
8. Audition returned takes at matched listening loudness. Show actual measured QC and provenance; reject or select a take. Apply as a new mix revision. No replacement of unrelated manual A2/A3 content.
9. In **ตอนเต็ม (Production)**, reuse subepisode cue assets but build a NEW composition timeline/hash from actual episode trims/transitions. Review joins and remeasure the entire program. No assumption that summing target durations gives production timing.

States shown to users must distinguish: no plan, analysis queued/running/failed, planned timing, partially observed, observed timing, needs review, approved, stale, generating, awaiting audition, and render complete. Use text/icons as well as color; keyboard editing, accessible table navigation and mobile layouts are required. Follow repo Astryx discovery before implementing UI; this task creates no UI code.

## 5. Source precedence and semantic analysis

### 5.0 Mandatory skill-first LLM policy

**Every automatic judgment of emotion, dramatic meaning, musical mood, cue grouping or creative revision MUST be authored by an LLM executing the versioned application skill.** No keyword/regex lookup, intent classifier, sentiment lexicon, fixed genre-to-emotion map, embedding nearest-label lookup or hand-coded if/else may determine these outputs, even as an outage fallback. Existing authored emotion text is evidence for the LLM, not a preclassified answer copied as analysis.

Skill-first means loading the approved skill content/references and validating its contracts BEFORE semantic execution. A generic inline system prompt or calling a skill detector without executing the skill does not satisfy it. User-authored overrides remain authoritative and are labelled manual. Code may validate schemas/IDs, enforce permissions/budgets, align text timestamps, compute time/gain math and measure signals; those operations must not assign semantic emotion. The data term `ShotAudioIntent` means an artifact shape, not permission to implement text-intent detection.

### 5.1 Assemble a bounded source snapshot

- Resolve active breakdown with the existing server resolver and shared schema. Version its identity; do not import client UI into server services.
- If materialized approved episode data exists, use its shot actions/dialogue as the current production intent. Include the active outline as narrative context, not an unconditional overwrite of edited episode content.
- Include episode script structure, emotional arcs, scene dialogue summary, hook/cliffhanger, source beat indexes, silence intent, current sound bible, and relevant previous/next episode context. Include season synopsis once as bounded context, not every historical draft.
- Track each source independently. A source conflict yields `needs_review` for the affected region. Actual ASR describes what is heard, authored script describes what was intended. Neither silently replaces the other.
- Planning-only identity uses a stable `planningEpisodeKey` tied to series + active breakdown lineage + normal episode number. `episodeId` is nullable until materialization. Special episodes require their own row identity/parent relation, never an ambiguous number-only lookup.
- Preserve stable shot/line IDs or generate canonical content identifiers plus explicit mapping. Do not fuzzy-merge characters by name; use existing role bindings and surface ambiguous mappings.

### 5.2 Analysis output

Context assembly emits an input inventory: included source IDs/revisions, omitted sources with reason, token budget and chronological knowledge boundary. Structural selection by episode/shot IDs is allowed; code cannot rank emotional importance by keywords. Do not silently truncate dialogue or replace missing sections with summaries claimed as original evidence. If the required selected scope exceeds the model context, stop with `CONTEXT_INCOMPLETE` or request a smaller scope; a future LLM skill summarization stage needs a separately disclosed budget and source-linked summary, not an invisible call outside §6.1's ceiling.

Season context separates audience-known facts, author-only future facts and current character knowledge. Skill analysis may use future arcs for continuity but cannot spoil them through premature musical revelation. For multi-chunk processing, record overlapping context and run a skill-based boundary reconciliation within the authorized call budget; otherwise keep results partial instead of mechanically concatenating inconsistent emotional arcs.

Use the existing durable LLM job/cost infrastructure (Feature 161), with a validated structured-output schema and versioned prompt. Source text is untrusted data, never tool instructions. No new external provider is required by this spec for semantic analysis; choose only an already authorized model supporting the necessary text/visual input and record its actual identity.

For each dramatic interval produce:

- `narrativeEvent`, `characterEmotions`, `audienceEmotion`, tension/valence/arousal/intensity in bounded scales, point of view and rationale.
- `musicAction`: enter / sustain / build / release / accent / exit / silence; music density and instrumentation guidance, not invented exact instrumental stems.
- Separate `semanticConfidence`, `timingBasis`, `timingUncertaintyMs`, source evidence references and unresolved conflicts. Numeric confidence is a model estimate unless calibration has been measured; unknown timing uncertainty remains null, not zero.
- Dialogue-protection intervals, reaction holds, permitted transitions, motif/palette reference and “must not reveal yet” constraints. Do not score the character's private knowledge as if the audience already knows it.

Avoid reducing this to keyword matching or one emotion per shot. A shot may change from disbelief to grief. ASR provides text/time, not reliable emotional meaning by itself; facial reaction and delivery observations may be added by supported analysis or human annotation. Unsupported observations remain absent. Do not claim frame/audio inference if only script was supplied.

The skill must distinguish expressed emotion from concealed emotion and intended audience response, account for negation, sarcasm, deception, mixed feelings and evolving stakes, and allow `uncertain` rather than forcing a single label. A smile can be relief, threat or concealment depending on evidence. Require concise editorial rationale and source/line/region IDs, not hidden chain-of-thought. Validate IDs/time ranges deterministically; judge emotional appropriateness through skill critique and human review, never string-matching rationale text against an emotion dictionary.

Semantic evaluation includes paired scenes sharing words but differing in context (comforting smile versus threatening smile), meaning-preserving paraphrases, Thai indirect speech, negation and silent reactions. Expected judgments/rationale are annotated by reviewers; a real authorized LLM skill run must be evaluated, not a mocked response or only JSON validity. Report abstentions and disagreements rather than forcing agreement with a single “correct” emotion.

### 5.3 Skill execution dependency and provenance

For observed revisions, declare `modalitiesUsed` and per-evidence acquisition method: script, transcript text, human annotation, sampled frames or real audio. A text-only LLM may analyze transcript/story meaning but cannot claim to hear delivery or see a reaction. If visual/audio interpretation is requested, an authorized capable LLM must execute the same skill with those actual inputs; otherwise expose the missing modality and review limitation. Signal descriptors remain evidence, not an alternate emotion classifier.

Before external LLM submission, enforce the tenant's provider/data-residency/retention policy and user-authorized analysis scope. Send only bounded relevant evidence using protected short-lived asset access; do not include secrets, unrelated episodes or original signed URLs in reusable prompts/logs. Record what modalities/asset hashes were shared, with which actual provider, and the applicable policy snapshot. Unsupported provider privacy/capability settings fail explicitly rather than sending data elsewhere.

The semantic pipeline below is mandatory for every automatic plan/revision; timing validation alone cannot substitute for it.

Proposed application skill: `apps/web/skills/vertical-drama-emotion-score-director/` (NEW, not present at audit). Its canonical `skill.md`, input/output JSON schemas, references and positive/negative examples own creative instructions. Modes: `analyze_regions`, `critique_plan`, `revise_plan`, `compile_music_caption`, `critique_caption`. A mode is a bounded entrypoint in the same versioned package, not an independently drifting prompt embedded in TS/Rust/Python. Add registry/catalog metadata using the installed application convention, not a Codex-only skill install.

Verified precedents: `verticalDramaScriptGeneration.ts:123,1915` loads via `resolveSkillDirCandidates` → `resolveSkillManifestPath` → `parseSkillFile`, then `executeJsonPlanningCallWithRetry`; `verticalDramaStoryBible.ts:7440` keeps critique instructions in a skill. Reuse these loading/execution patterns behind a narrow scoring service and Feature 161 durable jobs. Bind this feature explicitly to the skill ID and mode: do not use `skillIntentClassifier.ts` or free-text skill detection to choose whether emotion analysis runs. Source inputs are data; skill instructions are the creative authority.

At implementation, references/schemas/example files must be included in the actual runtime load/package, with tests proving the LLM receives them. Listing a skill folder without loading its content is not completion. No application skill files are created by this specification-only task.

Missing/disabled skill, missing required reference, hash/schema mismatch or unavailable authorized LLM produces `SKILL_UNAVAILABLE`, `SKILL_REVISION_MISMATCH` or `SEMANTIC_MODEL_UNAVAILABLE`; never substitute an inline prompt, keyword heuristic or old analysis as a new success. Keep previous approved results readable with their original provenance. Required-versus-optional references are declared in the package; omission of a required creative reference is fatal.

Load skill/reference files only from the installed allowlisted bundle with canonical path checks; story text, transcript, imported plan and model output cannot name an arbitrary skill path or request remote instruction retrieval. Keep source material in a distinct data envelope. Skill execution has no tool permission to generate music, authorize budget, approve rights, run shell commands or mutate source scripts. Server-owned authorization fields are never accepted from LLM output. Test malicious dialogue that says “ignore the skill”, forged approval/provenance and reference path traversal; output must remain data or fail validation. Deterministic security checks are permitted; they are not semantic-emotion classifiers.

Each semantic execution records `skillId`, `skillVersion`, `skillContentHash` (instructions + loaded references + schemas), `skillMode`, `executionId`, actual LLM model/provider, inference parameters, sourceSnapshotHash and output hash. Plan and caption approvals include this provenance. Cache by content hash, not process lifetime; an execution pins one immutable bundle. Skill upgrades create new runs and require review before adopting changed outputs, not silent mutation of old approved plans. The new-generation policy may revoke an unsafe skill revision without erasing history.

## 6. Time and revision contract (canonical for 176 + 177)

New shared file proposed: `apps/web/shared/verticalDramaSeries/musicScoringContracts.ts`. Feature 176 owns the schema; Worker consumes a generated/versioned compatible representation. Do not reuse the differently shaped Worker prototype `ShotAudioIntent` by name or unchecked cast.

### 6.1 Timing rules

Semantic acceptance precedes technical dispatch: `analyze_regions` → `critique_plan` → (if needed) `revise_plan` → `critique_plan` → user plan review → `compile_music_caption` → `critique_caption` → user generation authorization of the exact caption hash. Critique runs in a separate invocation with the same frozen evidence and manual locks, examining chronology, point of view, subtext, dialogue protection, silence, unsupported claims and cross-cue continuity. Caption critique checks that musical prose preserves the approved emotional arc/locks and adds no lyrics, imitation references or unsupported musical controls. A critic does not need a second provider, but must load its skill mode instead of reusing a hardcoded numeric rubric.

Initial budget ceiling is seven total LLM calls for one authorized analysis/caption cycle: at most six stage calls above plus one schema repair across all stages; at most one semantic plan revision. All calls share a token/cost reservation. The existing retry wrapper must respect this global ceiling rather than multiplying retries per stage. Invalid/unfinished critique or exhausted budget gives `needs_review`/failed analysis, never auto-approval; failed caption critique requires recorded human resolution or a new bounded authorized revision, not an eighth hidden call. A subsequent user-requested revision is a new bounded authorization. Resuming after human review reloads the pinned job ledger and validates unexpired authorization; expired reservations require a new estimate, never unrestricted continuation. The 20-round review requested for these documents is NOT a requirement to run 20 paid model calls for each episode.

- Store integer milliseconds, half-open intervals `[startMs,endMs)`, and original media sample/frame information. Time zero is the selected cut's first presentation frame; normalize container stream-start offsets. Keep rational frame rate and frame-boundary rounding policy in the edit map.
- Three coordinate spaces: original asset, clip occurrence, final cut. One original asset may appear multiple times; key mappings by occurrence ID, not filename or source asset alone.
- For constant positive speed: `cutMs = occurrence.timelineStartMs + (sourceMs - sourceInMs) / playbackRate`. Clip to source in/out; split tokens crossing trims; omitted ranges produce no output token. Store exact mapping segments for speed ramps, J/L cuts, B-roll and transitions. Unsupported reverse/ambiguous mappings fail observed alignment instead of guessing.
- A transcript of the exact final-cut audio is already on cut time; never transform it again. It still needs shot/event mapping before exact shot labels can be claimed. Audio inserted from another shot may overlap video cuts.
- Planned shot time uses the active duration vector or explicitly labelled legacy estimate. Nine shots do not imply nine equal durations, nine media clips, or exactly 72 seconds. Consolidated clips use `sourceShotNumbers` plus evidence; do not invent internal boundaries from equal division.
- Thai line-to-token alignment uses normalized matching with original text retained, monotonic matching, competing candidate detection, VAD and pause context. Repeated lines, ad libs, overlapping speakers, whispers and missing speech can yield unmatched/ambiguous spans. Never force all authored words into observed timestamps.
- A per-second display samples the interval plan; it does not start a new song every second. Artistic transitions may anticipate or follow an event; store an explicit anchor offset and reason, while preserving hard protected-silence boundaries.

### 6.2 Required artifact shapes

| Artifact | Required contract fields |
|---|---|
| `EpisodeAudioSourceSnapshotV1` | `contractVersion`, tenant/series identity, episode or planning key, episodeKind, activeBreakdownVersion, per-source hashes, approved shot/script refs, `timelineRevision`, `timelineHash`, ordered occurrences/edit-map ref, `cutMediaRef`, probed duration or planned duration + basis, sound-bible revision, rights-policy revision |
| `EpisodeAudioAnalysisV1` | source snapshot hash, immutable asset checksum, actual runtime/model/version, status ready/partial/empty/unavailable/failed, coordinate space, token artifact ref + checksum, speech intervals, optional speaker mapping/evidence, alignment quality and unmatched lines, measured media probe, generatedAt |
| `EmotionTimelinePlanV1` | plan ID/revision/parent, source snapshot hash, analysis refs, timeline hash, scope, timing coverage, semantic model/prompt version, regions, cue proposals, music silence windows, manual locks, approval actor/time, warnings, createdAt |
| Region | stable region ID, start/end or untimed shot anchor for an overview-only draft, shot/occurrence/line IDs, semantic fields from §5.2, music action, source evidence and separate confidences |
| Cue proposal | cue ID, covered region IDs, start/end, anchor event + allowed offset, approved palette/motif ID, instrumental-only caption, generation duration including handles, permitted edit operations, gain/ducking envelope ref, rights-policy verdict; no dialogue lyrics |
| `MusicScoringJobV1` | `kind`, contract version, plan ID/revision/hash, source/timeline hashes, selected cue IDs, model requirement, binding revision, rights snapshot, authorization/budget ID, idempotency key, artifact refs; exclude user-supplied executable paths/commands |
| `MusicScoringResultV1` | matching request/plan/timeline identity, per-cue take artifacts + hashes, genuine model/runtime provenance, actual probes, QC artifact refs, generation timings/resource usage, rights status, failures; no empty-path successful takes |
| `EpisodeScoreMixV1` | plan/timeline hashes, selected take IDs, exact edits/envelopes, native-source/stem refs, processing versions, pre/post-encode measurement reports, final mix artifact + checksum, approval and rights manifest refs |

All cross-runtime payloads are strict versioned schemas. Reject unsupported versions and unknown enum values explicitly. Large transcripts/waveforms travel as authenticated checksum-addressed artifacts, not giant embedded JSON in the existing 256 KiB media-publication request. Enforce bounded decompressed artifact size, token count and audio duration before parsing.

Wire contract identifier: `vd-music-scoring-v1` (new payload version, not a replacement for the global worker protocol). Add `semanticExecutions[]`, `critiqueDisposition`, `captionExecutionRef`, `captionHash`, `modalitiesUsed`, `inputCoverage`, `draftOnly` and `authorizationRef` to relevant plan/job/result shapes above. Store IDs as opaque strings on the wire, revisions as positive integers, timestamps in declared units, finite bounded numeric values only; reject NaN, negative/zero-length intervals, out-of-cut times and ambiguous source-vs-cut coordinates. Untimed overview regions are a separate discriminated shape and cannot enter render payloads.

Check that each referenced execution/output/caption hash belongs to the same tenant, scope and approved revision. Maintain one language-neutral valid/invalid JSON fixture corpus for Zod, Rust serde plus validation and Python adapter validation. A serde deserialize alone does not enforce timing/rights constraints. Schema changes increment the payload version when incompatible; workers without support cannot claim the job.

Production admission requires a current immutable cut/edit map, observed or explicitly human-verified timing for all critical anchors, and resolved critical source conflicts. An overview-only plan can be approved as a creative draft, but that approval is not final-cut approval. Optional draft music auditions require their own explicit budget and `draft_only` output classification; they cannot be applied/exported as a final scored episode until timing is reconciled. ASR is not mandatory for genuinely silent material: a probed cut, documented no-speech evidence and reviewed visual/shot anchors can establish its timing without fabricated tokens.

Report timing accuracy together with coverage: matched speech duration/total annotated speech, matched lines/total expected lines, exclusions and per-condition errors. Target ≥90% speech-duration coverage on the held-out evaluation set alongside §9's boundary threshold; evaluate whispers/overlaps separately. Low coverage cannot receive an “accurate” overall badge by considering only easy matches. Forced alignment of expected text is `aligned_expected`, not `observed_asr`; it cannot establish that those words were actually spoken. Human-corrected times carry `human_verified` source, original token reference, actor and cut hash.

### 6.3 Staleness and concurrency

Source resolution is a provenance operation: select approved production fields when explicitly available, expose competing draft/script/ASR values, and let the skill explain semantic differences while the user resolves authoritative intent. Absence of an approval marker must not imply approval merely because an episode row exists. Critical line/action conflicts remain unresolved until an explicit selection or documented human resolution.

When a planning-only episode materializes, persist an explicit mapping from its stable planning key to the episode row within the same tenant/series. Keep source-revision snapshots unchanged; switching a breakdown version does not erase old keys. Reparent via a transactional link and provenance audit, never matching title text or episode number alone. A materially changed draft creates a new candidate plan rather than transferring approval automatically. Special-episode identity remains separate even when numbers coincide.

Hash canonical content using existing browser-safe `canonicalJsonStringify` / `sha256Hex` conventions. Hash semantic inputs and timeline independently: changing only mix gain must not rerun ASR; replacing audio invalidates its analysis; changing an outline flags semantic drift but preserves observed timing.

Approval and apply use compare-and-swap against plan revision, source/timeline hashes and current binding. A changed cut, dialogue, selected take, speed, clip trim/order, native-audio policy, sound-bible or rights policy marks dependent output stale. Manual locks survive as proposed changes with conflict warnings, not automatic reapproval. Results from stale jobs remain in history; they cannot overwrite the current plan/mix. Upload/index retry must not generate another song.

## 7. Persistence, APIs, jobs and integration

### 7.1 Additive persistence

Proposed tables (new migrations, never `db:push`):

1. `vertical_drama_audio_analyses`: ID, tenant/series, nullable episodeId + planning key, source/timeline fingerprints, analysis version/status, typed artifact references, metrics/coverage metadata, worker job ID, timestamps. Immutable successful rows; unique cache identity within tenant + source audio hash + edit-map hash + ASR/alignment version.
2. `vertical_drama_emotion_plans`: ID, tenant/series, nullable episodeId + planning key, revision/parent ID, source and analysis refs, source/timeline hashes, typed plan JSON, status/approval/audit, timestamps. Unique scope + revision and indexed tenant/series/episode-or-key/status queries. App and DB constraints enforce exactly one stable scope and legal series/episode relations.

Use existing worker jobs/artifacts and managed media for music takes and mix files. Add versioned music-generation/mix metadata and artifact kinds to their schemas; do not squeeze episode-level results into Feature 175's required per-shot `shotNumber` rows. Extend the existing sound-bible representation with a versioned `scorePolicy` (palette, motif refs, default opt-in, delivery profile) through an explicit DB/shared-schema serializer. Current DB `audioStyle` shape is not identical to `seriesSoundBibleSchema.globalRules`; do not assume direct casts work.

Approved music assets may be reused only with exact genuine-model provenance, same tenant/authorized series, compatible plan intent, reviewed rights and explicit take selection. Content hashing does not authorize cross-tenant deduplication/access.

### 7.2 Proposed procedures

Implement a narrow `verticalDramaMusicScoring` tRPC router and service modules, mounted in the existing app router:

- `getSources`, `getPlan`, `listPlanRevisions`, `estimateAnalysis`, `generatePlanFromScript`.
- `requestAudioAnalysis`, `revisePlanFromAnalysis`, `updatePlan` (expected revision), `approvePlan`.
- `estimateMusicGeneration`, `generateApprovedCues`, `getScoringJob`, `cancelScoringJob`.
- `selectTake`, `requestScoreMix`, `applyScoreMix` (current cut/plan comparison), `getRightsManifest`.

Read authorization follows tenant and series ownership/binding rules, not knowledge of an episode ID. Mutation handlers reload canonical source snapshots on the server. User text cannot choose another tenant, arbitrary model, cloud endpoint, filesystem location or executable.

Plan LLM jobs reuse Feature 161's durable job pattern; media jobs reuse worker scheduling/claims, leases, progress, cancellation, artifact upload and publication. Proposed new media job kinds: `episode_audio_analyze`, `minimax_music3_generate`, `episode_score_mix`. Extend the strict job union in `shared/verticalDramaMedia/contracts.ts`, server scheduling, runtime capability gating and Worker dispatch together. Keep the existing worker lifecycle states; plan/QC labels are not new worker-job states.

Persist authorization, reservation, immutable input hash and dispatch intent atomically using the existing durable job/outbox pattern or an equivalent reconciled transaction. Enforce unique request identity before dispatch; queue delivery can be at least once, but admission/settlement must be idempotent. Record actual usage per semantic stage/music attempt; release unused reservation after cancellation/failure while retaining legitimately consumed usage under disclosed billing rules. An LLM timeout with unknown completion is reconciled before another call and never reported as a free successful plan. Local GPU time and platform-credit charges remain separately labelled.

Approval is not a blanket reservation: changes to skill/model/caption, selected cues or maximum attempts require validation against the original authorization scope and a new estimate when exceeding it. All schema-repair/critique calls count against the shared ceiling; duplicated callbacks cannot double-settle or promote stale plans.

### 7.3 Feature 175 compatibility

Manual overrides preserve the parent skill analysis and record changed fields separately as `manual`, never falsely claiming a new LLM inference. A manual mood/caption change requiring automatic music direction passes through `compile_music_caption` and exact-caption authorization; the skill must respect locked user decisions or report a conflict. Pure technical edits within approved bounds do not trigger unnecessary semantic calls.

Production-episode composition has its own scope ID, ordered subepisode revision hashes and edit-map hash. New automatic musical transitions across subepisode joins require a skill-based reconciliation run with bounded adjacent context and budget; deterministic concatenation cannot decide the joined emotional arc. Existing approved takes can remain selected where unchanged, while affected join regions become reviewable/stale independently.

`nativeAudioEnabled` continues to govern VIDEO-generation audio. Introduce separate explicit `externalScoreEnabled` defaulting false. Turning native audio off must not implicitly generate background music; a creator can separately opt into this post-production score.

Preserve original native master and dialogue. If native music is baked into the source, block automatic score addition until the user resolves the conflict through an authorized clean stem/replacement source or reviewed existing repair path. Do not layer two scores, discard dialogue, regenerate video, or claim perfect separation. Existing no-background-score default remains effective until explicit score opt-in. Existing manifests/QC are reusable only when they match the exact media hash.

## 8. Copyright, provenance and generation policy

This is a risk-control workflow, not a legal guarantee of non-infringement. Model licensing, rights in inputs, and rights/risk in generated output are separate checks. Feature 177 §3 records the applicable official model license and its conditions; do not substitute consumer-site or Music 2.6 API terms for this deployment.

Product policy for Phase 1:

- Generate original instrumental directions using mood, tempo ranges, instrumentation and dramatic purpose. Reject requests to reproduce a song, recognizable melody, lyrics, recording, named artist/composer soundtrack imitation, or unauthorized cover. This conservative product policy is not a claim that every style reference is legally prohibited.
- Do not feed episode dialogue to a lyrics field. Do not upload commercial reference audio. Rights attestation alone must not enable an unsupported reference-audio feature.
- Retain model/license revision, approved prompt, policy version, take checksum, generation runtime/job/seed, creator authorization and review record. No `licenseStatus=100` shortcut and no “copyright-free guaranteed” label.
- Rights lifecycle: `unreviewed`, `needs_review`, `approved_for_project`, `blocked`, `revoked`; approval states have scope, evidence and reviewer identity. A technical QC pass never advances rights status.
- Known-match checks, if available with lawfully usable fingerprints, are advisory with coverage recorded. No match is not proof of originality; manual audition remains required before publishing a new take. Suspected recognizable music is quarantined, not automatically applied.
- Block final score export when required rights evidence is missing/revoked. Preserve private history for audit subject to retention policy; revocation propagates to dependent mixes and prevents new exports.

## 9. Quality hypothesis and release acceptance

Rights approval is bound to an exact take checksum, usage scope, model/license snapshot and reviewer record; semantic critique cannot grant it. Changing a caption creates a new take lineage and does not inherit the old take's output review. Reusing/editing an approved genuine take retains its ancestor/provenance chain; export revalidates rights for every ancestor used and the current intended distribution scope. A revoked ancestor blocks dependent new exports, but the system must not claim it can recall copies already distributed externally.

The semantic skill may flag recognizable references for review, while server policy and a human rights decision remain authoritative. No LLM statement of “original” or “copyright-safe” can set `approved_for_project`. License interpretation and runtime feasibility remain dated evidence gates in 177 rather than invented assurances added by the planner.

Separate precise placement from subjective emotion. Millisecond representation does not prove millisecond understanding.

Proposed initial evaluation gates, to be measured rather than advertised as current results:

| Dimension | Acceptance |
|---|---|
| Timing | On a manually annotated Thai corpus, ≥95% of high-confidence matched dialogue boundaries within 500 ms; unmatched/uncertain regions visibly flagged. Critical approved music anchors align within one output video frame. |
| Grounding | Every timed emotion region references valid source evidence; no unseen future reveal, fabricated dialogue or fabricated ASR on silence. Source conflicts prevent automatic final approval. |
| Audible improvement | At least 12 varied 30–90 second scenes, including grief, threat, tenderness, silence and fast dialogue; ≥5 Thai-speaking listeners, randomized loudness-matched comparison against current/no-score baseline. Target ≥70% preference for emotional fit and median improvement ≥1 point on a 5-point scale, without reduced dialogue clarity. Report counts and uncertainty, not only an aggregate score. |
| Series continuity | At least 3 consecutive subepisodes and one composed production episode; reviewers confirm palette/theme continuity and no jarring joins. Matching seed alone is not evidence of motif continuity. |
| Technical / rights | Feature 177 measured export gates pass; 100% take lineage uses genuine Music 3, no silent fallback, and every selected take has valid scoped rights review. |

First pilot uses a small selected subset of series 53 (or creator-approved equivalent), not all episodes. The current research did not run this experiment. If instrumental reliability, hardware latency, dialogue masking or preference gates fail, ship planning-only behind a flag and keep generation disabled; do not substitute another model to meet a deadline.

QC presentation exposes measured protected-window/sync/attenuation results from 177 §8.3, applicable thresholds and not-applicable reasons. No overall pass can hide a failed required subcheck. A technical remix retains the semantic plan but updates mix provenance; a creative change must return to skill-authored revision or an explicitly labelled manual edit and renewed approval.

## 10. Implementation sequence and verification plan

1. **Contract/data slice:** canonical source resolver, strict shared schemas, migration, snapshot hashes, tenant/episode constraints. Feature 177 consumes this frozen version. Verify active-vs-legacy breakdown and plan-only materialization.
2. **Draft planning slice:** durable LLM job, existing billing, overview/subepisode review UI and revision locks. No music dependency; truthful planned-time labels.
   Deliver/register the `vertical-drama-emotion-score-director` application bundle, required references/schemas/examples, explicit mode binding, content-hash cache invalidation, execution provenance and bounded skill critique/revision. Include its runtime packaging and failure states in this slice, not as optional follow-up.
3. **Observed timing slice:** implement Worker analysis plus publication; ingest token artifact and edit map, reconcile sources, support partial/empty/unavailable, evaluate Thai alignment.
4. **Approved score slice:** genuine-model feasibility gate in 177, explicit budgeted dispatch, take/provenance/rights review, no automatic generation on page load or approval-only action.
5. **Mix/apply slice:** shared render contract, protected dialogue/silence, non-destructive revisions, final-cut staleness and production composition.
6. **Canary:** bounded corpus and listening evaluation, then opt-in rollout. Rollback disables new generation/apply but preserves prior assets, source video and plans.

Required tests include: conflicting overview vs materialized dialogue; all 50 plan-only drafts; partial nine-shot data; variable-duration and consolidated clips; one asset used twice; trimmed/speed-changed cuts; final-cut tokens not remapped twice; Thai repeated lines/ad libs; stale jobs and optimistic concurrency; revoked worker binding; cross-tenant asset references; oversized transcripts; unsupported capability; double-click generation and credit deduplication; native-score conflict; manual-track preservation; canceled job result quarantine; genuine failure never reported as music success.

Skill-specific acceptance: prove actual prompt construction loads the named skill and required references; missing/disabled/corrupt bundle yields no semantic call or heuristic success; approved output stores real execution/model/hash; changed bundle invalidates cache; malicious source cannot set approval; model unavailability cannot activate intent/keyword fallback; critique/repair counts respect the global budget. Unit mocks prove transport/failure handling only. A separate authorized real LLM evaluation on held-out Thai contrastive/context examples proves semantic behavior; compare against prior keyword output without routing any new user result through it. Reviewer corpus and stage outputs retain privacy-safe evidence and measured disagreements. Skill/LLM versions must be pinned for the evaluation and reported with results.

Future verification commands (not executed for this documentation-only task): focused `pnpm exec vitest run ...` in `apps/web` with `--environment jsdom` for UI tests; relevant app/widget production build after shared imports; migration-ledger and additive migration checks in a disposable DB; Worker tests/build listed in 177. Do not run broad `npm run check` as a substitute for these proofs.

## 11. Cost, limits and operational behavior

Cue-count/duration limits are resource admission constraints, not creative algorithms. If a skill plan exceeds them, show the estimate and request a smaller authorized scope or a bounded skill revision; never drop cues, merge emotions, shorten protected silence or remap tempo in code merely to fit the cap. Optional duration preferences belong in the versioned skill and are overridden by justified narrative structure, subject to user review.

Estimate and record analysis tokens separately from Music 3 compute and storage. Start with one selected subepisode, ≤6 cues and one take per cue; a second take requires an explicit remaining budget. These are configurable product admission limits, not model limits. Never automatically spend on 50 episodes or infinitely regenerate for QC.

Cache ASR by immutable audio/model hash; cache semantic context per revision; page plan lists without loading all transcript tokens. Serialize GPU-heavy work per device and honor tenant fairness. Poll durable job state through existing infrastructure. A failed upload resumes upload only, a failed plan parse gets at most one bounded repair within budget, and an uncertain inference outcome requires reconciliation before another generation attempt.

Monitoring: source conflict rate, observed timing coverage, unmatched dialogue, plan-to-first-audition latency, actual take duration, GPU time/memory, retries, stale result count, listener preference, rights holds and export failures. Never log credentials or full private dialogue in general telemetry.

## 12. Decisions still requiring measured evidence, not another design guess

- Confirm actual hardware/OS/runtime profile and Music 3 instrumental success with the bounded real benchmark in 177. No model download/inference is authorized by merely writing these specs.
- Validate speaker/emotion inference quality; fall back to explicit unknown/manual annotation, not fabricated observations.
- Confirm the operator's applicable commercial license obligations and retain the reviewed license snapshot before enabling generation publicly.
- Exact implementation filenames and migration sequence may shift if parallel work lands. Recheck impact through SocratiCode when available before changes; retain this contract and task scope.

**Specification review:** the original two-pass review is superseded by the user-requested [sequential 20-round audit of both specs](review-20-rounds.md), with per-round findings and hashes. Implementation, real LLM evaluation, audible gain and deployment readiness remain unproven until the stated gates run.

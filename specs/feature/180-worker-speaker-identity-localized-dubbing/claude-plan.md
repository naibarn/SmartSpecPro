# Feature 180 Implementation Plan

> v2 implementation prerequisite: read contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

## 1. Implementation objective

Build a durable, user-directed speaker identity and localized dubbing workflow across SmartAIHub Web, Worker App and the Python media runtime. The feature must add capability without breaking Feature 179 scan/reframe, Silence Cut, manual timeline edits, existing subtitle flows, or the current FFmpeg/Remotion render split.

The implementation is artifact-first. Every scan, identity decision, localized subtitle revision, voice binding, consent decision, cue audio, stem report, edit map and QC result is versioned and linked to immutable source artifacts. The server is the only external-provider boundary and the only credit authority.

## 2. Existing boundaries to extend

### Web/server

Extend the existing worker runtime contracts and routes in `apps/web/shared/workerRuntime.ts` and `apps/web/server/routes/workerRuntime.ts`. Reuse worker registration/scheduling, media provider gateway, managed media artifacts and credit reserve/reconcile services. Keep tenant and project ownership checks at the server boundary.

Add feature-specific schemas/services under the existing shared/server conventions rather than creating a second queue or an independent billing path. Proposed symbols include `SpeakerIdentityRegistryV1`, `VoiceConsentRecordV1`, `LocalizedSubtitlePlanV1`, `VoiceBindingV1`, `StemSeparationReportV1`, `DubbingCueAudioV1`, `LocalizedDubbingEditMapV1` and `LocalizedDubbingQcReportV1`.

### Worker App

Extend `MediaWorkspaceHost.tsx`, `MediaVideoEditorPlayer.tsx` and `SpeakerAwareWorkflowPanel.tsx` with a dockable `Speakers & Dubbing` surface. The panel consumes server job/artifact state and sends explicit mutations. It must not contain provider credentials, direct provider SDKs or hidden generation side effects.

### Python/media runtime

Extend the existing audio worker/provider gateway conventions. Keep VAD, diarization, visual tracking, active-speaker fusion, Demucs/stem separation, time-stretch, mix and encoding as deterministic runtime services. Keep semantic localization/review in the versioned Skill execution boundary.

## 3. Contracts and persistence

Define strict, versioned schemas with millisecond source timelines, checksum-linked inputs, tenant/project scope, provenance, creation time, job ID, retention and status. Every schema must reject unknown variants and secrets. IDs are opaque and workspace-local.

### 3.1 Speaker registry

`SpeakerIdentityRegistryV1` contains source artifact ID/checksum, scan configuration, speaker clusters, speech intervals, face/person tracks, active-speaker candidates, confidence/evidence, user display name, optional Series character mapping, representative-frame artifact and review status. It must distinguish `anonymous`, `standalone_named`, `series_character`, `unknown` and `unresolved` without making a real-world identity claim.

### 3.2 Subtitle/localization plan

`LocalizedSubtitlePlanV1` contains source cue IDs and ranges, source text, speaker candidate IDs, target locale/region, glossary/style policy, condensation policy, target text, rationale/source references for changed or removed material, approval status and skill/provider provenance. Source subtitle artifacts remain immutable.

### 3.3 Voice/consent

`VoiceConsentRecordV1` and `VoiceBindingV1` separate rights from provider capability. Consent contains evidence artifact, granter, scope, locale, expiry and revocation. Binding contains provider/model/voice ID, clone status, capability probe result, settings and review. A provider voice without rights evidence is not eligible for a clone-based export.

### 3.4 Audio/edit/QC

`DubbingCueAudioV1` records cue text, speaker, provider artifact, duration, timestamps, speed/time-stretch decisions and timing flags. `StemSeparationReportV1` records model/runtime, stem artifacts, leakage/quality metrics and the user decision. `LocalizedDubbingEditMapV1` composes Feature 179 source/manual/silence/reframe ranges with localized cues and audio routing. `LocalizedDubbingQcReportV1` records the same checks for FFmpeg and Remotion.

Add a common lineage envelope containing source/derived artifact kind, checksum, duration/timebase, timeline transform, dependency IDs and render-plan hash. Reject stale checksums and cross-revision references. Add additive database migrations and schema compatibility markers so old workers can read old jobs while new job types require a minimum runtime manifest.

## 4. Gateway, capability and credits

Implement one server-side orchestration service that validates scope, capability, consent, idempotency and credits before dispatching a paid stage. All provider adapters are registered by explicit capability descriptors. Worker payloads contain scoped job and cloud/local artifact references; no cloud provider secrets.

### 4.1 Adapter policy

Persist and display the user-selected VAD/diarization/visual/fusion adapters and fallback policy. Preflight must check actual model/runtime/license readiness. If a requested adapter is unavailable, return a stable error and repair action. Never reinterpret a disabled adapter as an implicit fallback.

### 4.2 Provider policy

Keep ordinary UVoice TTS in the existing server provider path. Add an explicit `voiceCloneCreate` capability. UVoice remains `unverified_api` until official public clone endpoints and server-side validation exist; no private website action is allowed. Implement a server-only ElevenLabs clone adapter behind consent and provider configuration. Provider errors are terminal/actionable when no safe retry exists.

### 4.3 Credit policy

Before paid provider/skill work, calculate an estimate, create a reservation and persist an idempotency key. On completion, reconcile with provider usage (characters, duration, model and returned metadata). On preflight failure or pre-provider cancellation, release unused reservation. On provider failure, follow existing refund/reconciliation policy. Replayed worker delivery returns the prior result and never creates a second provider request.

Define explicit preflight, create, claim/heartbeat, progress, cancel, publish and signed-download operation contracts. Cancellation after dispatch stops downstream publication and reconciles actual usage. Source-local paths must be resolved by the worker and converted to a managed artifact before server media stages consume them.

## 5. Speaker scan and review plan

Reuse Feature 179 scan inputs and add a normalized registry output. Scan the full source or the user-approved derived artifact. Fuse time-aligned VAD/diarization, face/person tracks and subtitle overlap. Preserve audio-only and body-only intervals. When candidates disagree, record all candidates and show `needs_review`; do not jump the camera automatically.

For standalone projects, provide rename, representative-frame capture, merge, split and unknown controls. For Series projects, load the character roster/read-only portrait references, propose a match and require explicit approval. Keep all mappings project-local unless an existing Series mutation flow is explicitly invoked.

The review panel must support jump-to-time, cue filtering, confidence/evidence inspection and revision history. Saving a review creates a new registry revision rather than mutating scan evidence.

When the input is a derived edit, persist the source-to-derived timeline transform. A registry revision must be invalidated or remapped when its input checksum changes; it must never silently bind to a different cut.

## 6. Subtitle localization and condensation

Add a cue-level localization orchestration job that calls a versioned `speaker-aware-dialogue-localizer` Skill through the server skill gateway. The request includes selected source cues, context, locale/region, glossary, speaker style, timing budget and condensation policy. The result must include target text and provenance per cue.

When no subtitle/transcript exists, keep scan/reframe/Silence Cut usable and offer existing transcript selection, subtitle import, the existing transcription capability as a separate approved job, or manual cue creation. Localization must not force transcription for a user who only selected visual/audio analysis.

Add a `localized-dubbing-quality-reviewer` Skill contract for language, terminology, pronunciation hints and semantic drift flags. It is advisory unless the user selects a blocking review policy. Default localization preserves every cue. Short-form condensation is opt-in and requires a visible list of removed/merged source cues.

Support full-batch, selected-range and single-cue regeneration. A partial failure preserves successful cue artifacts and lets the user retry only failed cues.

Short-form controls include target duration/range, protected topics and removable-content policy. If the target cannot be met under policy, return a reviewable failure instead of silently deleting more cues.

## 7. Voice binding, clone and timing

Create a voice binding review surface with provider catalog, locale/model compatibility, clone status, rights/consent and preview action. Preview and final generation use the same gateway and credit rules; preview artifacts are clearly labeled.

For a clone request, validate consent immediately before creation and immediately before generation. Store samples as restricted managed or owner-worker local artifacts according to privacy policy. Allow revocation/expiry to block new jobs and mark existing outputs for review.

Validate sample duration/format/noise/clipping/single-speaker quality before upload. Record provider deletion/revocation outcome and never expose raw samples in logs or diagnostics.

Generate one TTS artifact per cue/speaker. Fit timing in this order: semantic condensation if selected, provider speed, bounded pitch-preserving time-stretch, then needs-review. Do not solve overflow by silently shortening meaning or using extreme stretch. Record all timing decisions in `DubbingCueAudioV1`.

## 8. Separation, mix and export

Run real capability preflight for Demucs/stem separation. Evaluate dialogue leakage and music/SFX preservation on fixture media. If quality passes, route generated dialogue over retained stems. If not, require the user to choose all-original-audio removal or manual-DAW stop. No original dialogue may remain under a dub without an explicit user decision.

Create the canonical localized edit map before rendering. FFmpeg consumes it for source/audio fast path; Remotion consumes it when subtitle/overlay/full composition is needed. Both use the same cue audio and stem artifacts. Post-encode QC checks stream integrity, duration, loudness/peaks, cue timing, black/frozen frames, subtitle timing and source-dialogue leakage. QC failure blocks publication with a linked range/cue.

Normalize sample rate/channel layout and record input audio-track selection, dialogue/music/SFX bus routing, ducking, headroom, loudness target and true-peak ceiling. Unresolved localized cues require an approved voice or explicit retention/non-dub policy. QC thresholds are versioned configuration with measured values and explicit per-export exceptions only.

## 9. Worker jobs and recovery

Add durable job handlers for `speaker_aware_media_scan`, `subtitle_localization_plan`, `voice_clone_create`, `tts_utterance_generate`, `dialogue_stem_separation`, `localized_dialogue_mix`, `localized_episode_export` and `localized_dubbing_qc`. Each job has input artifact checksums, idempotency key, checkpoint, progress, attempt policy, terminal failure code and publication step.

Worker restart/reconnect must resume from the last checkpoint. A terminal paid job is not blindly retried. Artifact publication is atomic and signed. The UI can navigate away and return without losing progress or review decisions.

Use an explicit job state machine with `cancel_requested` and `awaiting_review`. Offer jobs only to workers whose runtime manifest supports the schema and required adapters. Additive migrations and rollback flags must preserve old artifacts and prevent new jobs from being claimed by incompatible workers.

Worker preflight must estimate GPU/VRAM and temporary disk requirements for the selected adapters and concurrency slot. If the resource budget is unavailable, return a resumable `GPU_RESOURCE_UNAVAILABLE`/capacity state rather than starting a job that can OOM.

## 10. UI/UX contract

### Target user and JTBD

An editor needs to understand who is speaking, assign a name/character and approved voice, create a localized version and preserve control over timeline/audio decisions.

### Surface inventory

1. Existing Media Studio/video editor.
2. Right/dockable Speakers & Dubbing panel opened from the existing speaker-analysis action.
3. Existing subtitle and waveform/timeline surfaces.
4. Existing render/export panel with localized map and QC summary.
5. Series character picker when applicable.

### Component ownership

- `SpeakerIdentityPanel`: scan progress, evidence, naming/mapping and revision.
- `LocalizationReviewPanel`: cue text, locale, glossary, condensation and approvals.
- `VoiceBindingPanel`: catalog, consent, capability, preview and binding.
- `DubbingReviewPanel`: cue waveform, timing, separation decision and QC flags.
- `LocalizedExportPanel`: edit-map summary, render path, credit estimate, job status and artifact.

No panel directly calls an external provider or mutates source media.

### State matrix

Every panel has visible loading, empty, ready, running, partial, error, needs-review, success and disabled states. Errors include stable code and repair action. Paid actions disable duplicate submission and show job/credit state. Empty states show the next valid action. Previous immutable artifacts remain visible while a new revision runs.

### Responsive matrix

- 1440×900: right dock with timeline still visible and sticky primary action.
- 1280×800: resizable drawer with no hidden nested action area.
- 768×1024: full-height sheet with sticky header/footer.
- 390×844: stacked review cards; all content scrolls in one predictable container.

### Accessibility and visual direction

Use existing Worker Media tokens, panel/drawer patterns and button hierarchy. Keyboard navigation reaches every cluster, cue, adapter, consent and action. Labels/descriptions/errors are programmatically associated. Focus remains visible after tab/panel changes. Status uses text/icon plus color. Reduced-motion mode provides static evidence. Thai copy is primary with established English technical terms retained.

### Browser evidence

Capture desktop, laptop/tablet and narrow viewport evidence for source auto-resolution, scan progress, standalone naming, Series mapping, subtitle review, consent blocking, provider unavailable, separation decision, export progress, QC failure and successful artifact. Switching tabs must preserve state, and the primary action must remain reachable without hidden scroll.

Also capture stale-source/plan rejection, cancellation before and after provider dispatch, unresolved-cue blocking, sample-quality rejection and worker-version incompatibility.

## 11. Verification and rollout

Write focused Vitest tests for shared schemas, server routes/services, idempotency, billing and Web state; Worker tests for panel states, source resolution, adapter policy and durable job consumption; pytest tests for Python provider/audio runtime; Playwright/browser smoke for panel UX. Add deterministic Thai/multi-speaker/music/SFX fixtures and mocked provider responses. Do not use live paid provider generation in unit tests.

Include additive migration/rollback tests, source-lineage/time-transform tests, old-worker/new-server compatibility tests, mix-bus/loudness tests, no-subtitle cue preparation tests, GPU/VRAM admission tests and cancel-after-dispatch reconciliation tests.

Run focused tests and `git diff --check`; do not require `npm run check` because of the stated RAM constraint. Stage rollout behind feature flags. Start with scan/review and server capability probes, then enable localization/TTS for configured providers, then enable clone/export only after consent, separation and QC proof. UVoice clone remains disabled until its public API is verified.

## 12. Implementation order (v2)

Follow `sections/index.md`: 01 → 04 → 11 → 08 → 09 → 02 → 03 → 05 → 06 → 10 → 12 → 07. User execution remains an optional-stage DAG. An authored utterance can enter synthesis without scan/localization. Required contracts, table/index design, APIs, resource/cancel semantics and limits are specified in `contracts-v2.md`.

## 13. Concrete implementation boundaries

Section 01 owns proposed unifiedAudio shared schemas, normalized voice/run tables and additive migration, authenticated orchestration procedures and shared wire fixtures. Sections 08/09 own local/cloud execution; 05 owns provider-neutral result/timing processing; 10 owns 178 integration. Use existing worker scheduler/registry/credit/artifact infrastructure. Run impact discovery before modifying shared exports; current SocratiCode absence is not permission to skip impact review during implementation.

Default tests are fixture-only. Live local generation, cloud API proof, model installation and deployment are separate recorded operations, not side effects of test collection. Repair relevant legacy timing normalization while preserving existing callers. Never run migrations against the IDE-selected database merely because it is configured.


## Reference cloning and training lifecycle extension

[voice-lifecycle-v2.md](voice-lifecycle-v2.md) is normative for exact reference import/profile/transcript APIs, TTS profile/binding revision snapshots, provider mode mapping and provenance. Sections 11/12 implement it. Reference-based cloning requires no training; optional training has explicit dataset rights, recipe/resource/budget preflight, held-out evaluation, model approval, rollback and ancestor revocation. Release A includes the full reference flow; Release D separately proves a real training recipe. Local and cloud capability is explicit, not assumed available for every provider. No runtime readiness claim may be made solely from this planning package.

# Feature 180 Synthesized Specification

> v2 implementation prerequisite: read contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

Feature 180 extends Feature 179’s speaker-aware scan/reframe foundation into an optional, user-directed localized dubbing workflow for standalone and Series videos. It adds speaker registry and review, subtitle-aware translation/localization, consented voice binding/cloning, cue-level TTS timing, stem separation, shared FFmpeg/Remotion edit-map export and post-encode QC.

The control plane is SmartAIHub Server. Execution branches to registered local Worker adapters or the server cloud provider gateway, returning scoped artifacts. Cloud provider keys remain server-side. Credits are estimated/reserved before paid work, reconciled against actual usage and protected by idempotency. The worker never calls external UVoice, ElevenLabs or cloud LLM endpoints directly. Registered local models execute only under admitted job policy.

The workflow is a DAG, not a fixed pipeline. Users may cut by subtitles in 16:9 first, scan speakers later, crop to 9:16 afterward, or start with speaker coverage. All source/derived artifacts are versioned and immutable. Existing Silence Cut and manual edit ranges remain composable.

Standalone speaker names are user-entered and workspace-scoped. Series mappings resolve existing character data but require explicit review. Face/person/audio evidence is never presented as proof of real-world identity.

Semantic translation and optional condensation are skill-first, cue-level and provenance-preserving. Voice clones require a consent/rights record with scope and revocation. UVoice clone management is `unverified_api` until an official public API is validated; private website actions are prohibited. ElevenLabs can be the first automated clone adapter through the server gateway.

If original dialogue separation is unacceptable, the UI must offer remove-all-original-audio or manual-DAW stop. It must never silently leave source dialogue under a generated dub. FFmpeg and Remotion consume `LocalizedDubbingEditMapV1` and run identical post-encode QC.

The implementation is divided into contracts/gateway, scan/identity UI, localization, voice/consent/provider adapters, stem/TTS timing, mix/export/QC and verification/rollout sections.

The final review also requires explicit source/derived timeline lineage, worker-local source handoff, cancellation-after-provider reconciliation, minimum Worker runtime compatibility, additive migration/rollback, clone sample-quality preflight, unresolved-cue blocking, deterministic mix settings and versioned QC thresholds.

## v2 required outcome

Both worker_local and server_cloud TTS consume the same approved utterance/voice plan. Cloud-first and local-first routing is explicit and privacy/budget constrained. Local-only data never uploads implicitly. All audio operations declare target capabilities, with unimplemented combinations visibly unavailable. Reuse 178 Music3/mix and 179 evidence/edit-map authorities. Implement the complete twelve-section manifest and normative contracts-v2.md; old review files do not establish v2 completion.


## Reference cloning and training lifecycle extension

[voice-lifecycle-v2.md](voice-lifecycle-v2.md) is normative for exact reference import/profile/transcript APIs, TTS profile/binding revision snapshots, provider mode mapping and provenance. Sections 11/12 implement it. Reference-based cloning requires no training; optional training has explicit dataset rights, recipe/resource/budget preflight, held-out evaluation, model approval, rollback and ancestor revocation. Release A includes the full reference flow; Release D separately proves a real training recipe. Local and cloud capability is explicit, not assumed available for every provider. No runtime readiness claim may be made solely from this planning package.

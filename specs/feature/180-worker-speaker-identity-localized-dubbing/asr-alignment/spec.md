# ASR and alignment extension to Feature 180

Status after implementation slice: core contracts, legacy projection, capability gating, Worker routing and UI review/apply flow are implemented. Faster-Whisper/WhisperX, VibeVoice and cloud adapters remain disabled until their signed runtime/provider gates pass; generated TTS currently records truthful `script_timed` provenance until an acoustic `audio.align` runtime is installed.

Canonical transcript artifacts carry `sourceChecksum`, model/runtime revisions and `normalizerRevision` so a normalization rule change cannot silently reuse an older transcript artifact.

ASR queue admission is also fail-closed: `audio_transcribe` and `audio_align` require an explicit `runtimeGate: "signed_ready"` in the versioned request before any credit reservation. Local profiles execute only on the Worker; cloud profiles are reserved for `server_cloud` adapters so provider credentials never enter the Worker UI.

User-approved scope: retain Whisper.cpp; add Faster-Whisper with optional WhisperX alignment/diarization and optional VibeVoice-ASR; export JSON/SRT/VTT with truthful word evidence; use approved script plus final-audio alignment for TTS. Preserve ASS and existing edit flow.

The implementation blueprint and acceptance requirements are in [claude-plan.md](claude-plan.md). This remains an additive extension rather than a new numbered feature; the core contract and Worker/UI slice is implemented, while real provider promotion follows the gates above.

# ASR and alignment extension to Feature 180

User-approved planning scope: retain Whisper.cpp; add Faster-Whisper with optional WhisperX alignment/diarization and optional VibeVoice-ASR; export JSON/SRT/VTT with truthful word evidence; use approved script plus final-audio alignment for TTS. Preserve ASS and existing edit flow.

The implementation blueprint and acceptance requirements are in [claude-plan.md](claude-plan.md). This is an additive extension rather than a new numbered feature; its core contract and Worker/UI slice is implemented, with real provider promotion controlled by the runtime gates in `spec.md`.

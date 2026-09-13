# Research and current source evidence

SocratiCode tools are unavailable in the exposed tool catalog; used targeted shell source discovery. Existing source is authoritative; prior 50-row PASS reports do not establish these new capabilities.

Verified: AutoSubtitleModal invokes worker_app_transcribe_audio, receives words/segments, synthesizes missing end timestamps and enforces 800ms NLE clips. subtitleFormatters already implements SRT/VTT/ASS. commands.rs requires the single runtime manifest transcription model. worker_loop.rs owns legacy HyperFrames Whisper.cpp invocation and transcript normalization. Runtime manifest integration tests already exist. Parent 180 manifest has twelve sections; this subplan leaves them intact.

Official sources consulted for design (2026-09-07):
- https://github.com/SYSTRAN/faster-whisper : CTranslate2-based Whisper backend, optional word timestamps, quantized CPU/GPU and lazy segments. Runtime dependencies require a pinned compatibility lock.
- https://github.com/m-bain/whisperX : Faster-Whisper backend plus language-dependent forced alignment and optional pyannote diarization. Thai aligner readiness is not proven by ASR language support.
- https://github.com/microsoft/VibeVoice : ASR structured speaker/time/text and long-form capability. Native timing granularity and target hardware behavior require adapter fixtures and measured acceptance.

Testing: existing Web Vitest, Worker frontend tests and Rust library/runtime-manifest tests. New Python adapter tests should use unittest or the project's installed test runner without requiring model downloads. Full Web typecheck is not a prerequisite for document-only planning; use focused checks during implementation and report unexecuted release evidence.

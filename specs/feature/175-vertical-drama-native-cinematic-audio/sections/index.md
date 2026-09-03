<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npm --workspace apps/web test --
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-fingerprints
section-02-compiler-and-adapters
section-03-worker-qc-and-transcoding
section-04-demucs-surgical-repair
section-05-mastering-and-codec-delivery
section-06-storyboard-ui-and-metering
END_MANIFEST -->

# Feature 175 — Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-contracts-and-fingerprints | - | 02, 03, 04, 05, 06 | No |
| section-02-compiler-and-adapters | 01 | 03, 04, 05, 06 | No |
| section-03-worker-qc-and-transcoding | 01, 02 | 04, 05, 06 | No |
| section-04-demucs-surgical-repair | 01, 02, 03 | 05, 06 | No |
| section-05-mastering-and-codec-delivery | 01, 02, 03, 04 | 06 | No |
| section-06-storyboard-ui-and-metering | 01–05 | - | No |

## Execution order

1. **Section 01:** Data contracts, TypeScript schemas, backward-compatible Python JSON schema, fingerprint cache invalidation, and tRPC audio settings procedures.
2. **Section 02:** Enhanced prompt compiler audio shaping in `enhanced_bridge.py` and model adapter prompt formatters (Toggle ON vs OFF invariants).
3. **Section 03:** Worker audio analysis engine (CFR 25fps + 48kHz float resampling, Silero VAD, Faster-Whisper ASR CER, AV sync offset, BGM detection, and F0 pitch anchor).
4. **Section 04:** Surgical Demucs v4 stem repair pipeline, TTS replacement, Thai particle preservation, room impulse response (IR) convolver, and Stage 4b mouth realignment.
5. **Section 05:** Final master assembly, Remotion timeline graph, sidechain mid-band ducking, EBU R128 loudness normalization (-14 LUFS / -1.0 dBFS True Peak), FastStart `moov` atom placement, and dual-codec delivery.
6. **Section 06:** Storyboard UI integration, episode-level header toggle, 3-stem mixer faders, WebAudio synchronized clock, real-time studio LUFS/VU meters, and Take history rollback.

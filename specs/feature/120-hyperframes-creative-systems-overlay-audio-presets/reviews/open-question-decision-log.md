# Open Question Decision Log

Date: 2026-06-12
Feature: 120 HyperFrames Creative Systems Overlay, Subtitle, Audio, And SFX Presets

This log is the required decision record for Feature 120 open questions. Do not
enable the affected capability until its row has a recorded decision, evidence,
rollback note, and rollout gate owner.

| ID | Question | Default Blocked Capability | Decision Status | Required Evidence Before Enablement |
|---|---|---|---|---|
| OQ-01 | Should SmartSpecPro bundle a small licensed SFX starter pack, or require tenant-uploaded/Library-selected audio assets first? | SFX packs and any preset requiring bundled or third-party SFX | Open | Commercial-use license proof, source/checksum manifest, staged asset fixture, audio QA, retention policy |
| OQ-02 | Should music generation be integrated through existing media providers, or remain asset-library based in V1? | Music generation and generated music presets | Open | Provider/product decision, cost/credit mapping, license/source metadata, no-charge/charge tests, audio QA |
| OQ-03 | Should word-level karaoke timing depend on transcript generation, TTS output, or manual cue editing? | Word-level karaoke active presets | Open | Timing source contract, cue fixture, fallback policy, Thai snapshot evidence, audio/subtitle sync QA |
| OQ-04 | Should the first producer path use HyperFrames CLI or `@hyperframes/producer` directly in the worker image? | Producer-only presets and non-FFmpeg render path | Open | Dependency audit, doctor readiness, worker image proof, runtime version manifest, rollback path |
| OQ-05 | Should HyperFrames Studio/player become the long-term preview surface instead of custom React preview? | Studio/player preview integration | Open | Security review, sandbox/trusted-player proof, route evidence, reduced-motion/accessibility evidence |

## Decision Requirements

Each decision update must record:

- decision date and owner;
- selected option and rejected alternatives;
- capability flags or preset lifecycle states affected;
- tests and fixture evidence that prove the decision is safe;
- rollback behavior if the decision causes render, preview, or licensing issues;
- whether completed Library media remains playable after rollback.

## Gate Rules

- SFX/music presets that depend on unresolved OQ-01 or OQ-02 remain hidden,
  disabled, or candidate-only.
- Word-level karaoke presets remain candidate-only until OQ-03 is resolved.
- Producer-only presets remain disabled under normal rollout until OQ-04 is
  resolved and dependency/doctor/production gates pass.
- Studio/player preview work remains contract-only until OQ-05 is resolved.
- Section 09 release gates must fail if any enabled capability depends on an
  `Open` decision row.

<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-motion-parity-and-preset-expansion
section-02-slideshow-pause-resume-hardening
section-03-export-warning-ux-surfacing
section-04-regression-parity-and-release-guardrails
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-motion-parity-and-preset-expansion | - | 02, 03, 04 | No |
| section-02-slideshow-pause-resume-hardening | section-01 | 04 | Yes |
| section-03-export-warning-ux-surfacing | section-01 | 04 | Yes |
| section-04-regression-parity-and-release-guardrails | section-02, section-03 | - | No |

## Execution Order

1. section-01-motion-parity-and-preset-expansion
2. section-02-slideshow-pause-resume-hardening, section-03-export-warning-ux-surfacing
3. section-04-regression-parity-and-release-guardrails

## Section Summaries

### section-01-motion-parity-and-preset-expansion

Unifies motion semantics, adds diagonal pan presets, and introduces deterministic pan overscan behavior shared by `Play Slideshow`, `PlayMode`, and `mp4 export`.

### section-02-slideshow-pause-resume-hardening

Locks playback behavior so `Play Slideshow` and `PlayMode` both render media motion correctly, with pause/resume continuing from the same progress without remounting live video.

### section-03-export-warning-ux-surfacing

Turns backend media-motion omission warnings into human-readable export UI copy so users understand why static exports lose motion.

### section-04-regression-parity-and-release-guardrails

Completes parity tests, regression coverage, and visual/behavioral checks needed to ship the hardening round safely.

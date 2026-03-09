<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --dir apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-motion-contract
section-02-media-properties-authoring
section-03-preview-and-export-runtime
section-04-regression-coverage-and-release-guardrails
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-shared-motion-contract | - | 02, 03, 04 | No |
| section-02-media-properties-authoring | section-01 | 04 | Yes |
| section-03-preview-and-export-runtime | section-01 | 04 | Yes |
| section-04-regression-coverage-and-release-guardrails | section-02, section-03 | - | No |

## Execution Order

1. section-01-shared-motion-contract
2. section-02-media-properties-authoring, section-03-preview-and-export-runtime
3. section-04-regression-coverage-and-release-guardrails

## Section Summaries

### section-01-shared-motion-contract

Adds the optional media-motion contract, shared defaults, and deterministic transform math used as the foundation for all later work.

### section-02-media-properties-authoring

Adds authoring controls for image/video motion inside the Presentation Editor property panel without making the edit canvas permanently animated.

### section-03-preview-and-export-runtime

Applies the motion model to slideshow preview and export render paths, and broadens MP4 dynamic-capture detection to include motion-only slides.

### section-04-regression-coverage-and-release-guardrails

Closes the loop with regression tests, static-export degradation warnings, and compatibility checks for existing drafts.

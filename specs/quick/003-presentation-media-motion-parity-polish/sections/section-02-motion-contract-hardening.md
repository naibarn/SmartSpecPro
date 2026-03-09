# Section 02: Motion Contract Hardening

## Goal

Make motion normalization, active-motion detection, and export classification agree on what counts as real motion.

## Scope

- shared motion helper normalization
- export dynamic-capture detection
- static export degradation warning detection

## Implementation Notes

- define preset/easing validation at the normalization boundary
- unknown preset should normalize to `none`
- invalid easing should normalize to the shared default easing
- classification helpers must use normalized data, not raw untrusted values

## Acceptance

- garbage presets do not trigger active-motion behavior
- garbage presets do not trigger static-export motion warnings
- garbage presets do not force MP4 dynamic-capture path

## Tests

- `mediaMotion.test.ts`
- `presentationPlaybackExport.test.ts`
- `presentationExportDegradation.test.ts`

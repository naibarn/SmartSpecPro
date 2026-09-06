<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test -- --runInBand
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-contracts-and-edit-map
section-02-adapter-policy-and-preflight
section-03-subtitle-vad-diarization
section-04-visual-tracks-and-active-speaker
section-05-durable-scan-and-edit-plan-jobs
section-06-render-map-ffmpeg-remotion
section-07-worker-and-web-ui
section-08-verification-rollout-and-runbook
END_MANIFEST -->

# Feature 179 Implementation Sections

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| 01 contracts and edit map | - | 02–07 | no |
| 02 adapter policy and preflight | 01 | 03–05, 07 | no |
| 03 subtitle/VAD/diarization | 01, 02 | 04, 05, 07 | yes after 02 |
| 04 visual tracks/active speaker | 01, 02, 03 | 05, 06, 07 | no |
| 05 durable jobs/edit plans | 01–04 | 06, 07 | no |
| 06 render map/FFmpeg/Remotion | 01, 04, 05 | 08 | no |
| 07 Worker/Web UI | 01–05 | 08 | yes after 05 |
| 08 verification/rollout/runbook | 01–07 | - | no |

## Execution order

1. Section 01.
2. Section 02.
3. Sections 03 and 04 in dependency order (04 consumes 03 evidence types).
4. Section 05.
5. Sections 06 and 07 can proceed in separate file ownership after 05.
6. Section 08 final integration and evidence.

## Ownership rule

Section writers must not rewrite unrelated dirty files. If an existing file is already modified, preserve unrelated hunks and add only the Feature 179 slice. SocratiCode is unavailable in this session; use targeted symbol reads and record that fallback in implementation reviews.

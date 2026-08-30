<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-role-aware-prompt-contract
section-02-stop-persistence-and-jobs
section-03-video-media-integration
section-04-storyboard-stop-frame-ui
section-05-tests-and-verification
section-06-rollout-observability
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
| --- | --- | --- | --- |
| section-01-role-aware-prompt-contract | - | 02, 03, 05 | No |
| section-02-stop-persistence-and-jobs | 01 | 03, 04, 05, 06 | No |
| section-03-video-media-integration | 01, 02 | 04, 05, 06 | No |
| section-04-storyboard-stop-frame-ui | 02, 03 | 05, 06 | No |
| section-05-tests-and-verification | 01, 02, 03, 04 | 06 | No |
| section-06-rollout-observability | 02, 03, 04, 05 | - | No |

## Execution Order

1. `section-01-role-aware-prompt-contract`
2. `section-02-stop-persistence-and-jobs`
3. `section-03-video-media-integration`
4. `section-04-storyboard-stop-frame-ui`
5. `section-05-tests-and-verification`
6. `section-06-rollout-observability`

Sections are sequential because the shared JSONB field contract, prompt-job
payload, and canonical asset mapping must be stable before client consumers and
verification are added. No section may overwrite unrelated dirty work.

## Section Summaries

### section-01-role-aware-prompt-contract

Add role-aware start/stop prompt contracts, semantic handoff, long-prompt
boundary, and skill instructions while preserving the existing nine-shot start
envelope.

### section-02-stop-persistence-and-jobs

Add additive stop-frame state, hash/CAS/stale merge rules, durable prompt/image
jobs, ownership, idempotency, and authorized asset selection procedures.

### section-03-video-media-integration

Add canonical stop-frame mapping, protected URL projection, provider capability
gating, post-sync motion mode, and conditional first/last formatter grounding.

### section-04-storyboard-stop-frame-ui

Add a separate optional Stop Frame slot and independent prompt/image controls to
the existing storyboard without changing start interaction labels or flow.

### section-05-tests-and-verification

Implement focused Vitest coverage, typecheck/diff gates, and browser-evidence
recording for semantics, persistence, provider mapping, and UI state/accessibility.

### section-06-rollout-observability

Reuse the existing first/last bridge flag for attachment, add bounded telemetry
and recovery behavior, and document rollout/rollback evidence.

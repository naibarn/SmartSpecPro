<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-foundation-contracts
section-02-architecture-dispatch
section-03-checkpoint-spend-guard
section-04-story-arc-planner
section-05-image-prompt-and-generation
section-06-video-director-and-video-gate
section-07-audio-assembly-and-render-gates
section-08-ui-checkpoint-workflow
section-09-observability-rollout-verification
END_MANIFEST -->

# Feature 141 implementation sections

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-foundation-contracts | — | 02, 03, 04, 05, 06, 07, 08, 09 | Yes |
| section-02-architecture-dispatch | 01 | 03, 04, 05, 06, 07, 08, 09 | No |
| section-03-checkpoint-spend-guard | 01, 02 | 04, 05, 06, 07, 08, 09 | No |
| section-04-story-arc-planner | 01, 02, 03 | 05, 08, 09 | Yes after 03 |
| section-05-image-prompt-and-generation | 01, 02, 03, 04 | 06, 07, 08, 09 | No |
| section-06-video-director-and-video-gate | 01, 02, 03, 05 | 07, 08, 09 | No |
| section-07-audio-assembly-and-render-gates | 01, 02, 03, 05, 06 | 08, 09 | No |
| section-08-ui-checkpoint-workflow | 01, 02, 03, 04, 05, 06, 07 | 09 | No |
| section-09-observability-rollout-verification | 01–08 | — | No |

## Execution Order

1. `section-01-foundation-contracts`
2. `section-02-architecture-dispatch`
3. `section-03-checkpoint-spend-guard`
4. `section-04-story-arc-planner`
5. `section-05-image-prompt-and-generation`
6. `section-06-video-director-and-video-gate`
7. `section-07-audio-assembly-and-render-gates`
8. `section-08-ui-checkpoint-workflow`
9. `section-09-observability-rollout-verification`

The first three sections are the shared contract and server safety critical path.
Story authoring can proceed only after the architecture and checkpoint guard
contracts exist. Image, video, audio, and UI sections are intentionally ordered
by the credit-bearing workflow. Implementation may use small parallel test-fixture
work inside a section, but no provider path may bypass the preceding section's
checkpoint contract.

## Section Summaries

### section-01-foundation-contracts

Shared v2 metadata, checkpoint types, safe reason codes, nine-shot fixtures,
feature-flag contract, and legacy regression harness.

### section-02-architecture-dispatch

Frozen architecture selection, v2 start/resume/redraft/retry/recovery dispatch,
durable operation envelope, authorization, and idempotent outbox boundary.

### section-03-checkpoint-spend-guard

Server-authoritative checkpoint state machine, revision/hash/model/reference/safety/
cost validation, worker-side pre-provider guard, and no-spend invariants.

### section-04-story-arc-planner

Story Arc Planner skill bundle, bounded strict output, validation/repair, story
review checkpoint, and prompt-compilation release transition.

### section-05-image-prompt-and-generation

Deterministic synopsis-direct prompt compiler, per-shot prompt review, image task
scheduling, image QA, accepted-image checkpoint, retries, and concurrency limits.

### section-06-video-director-and-video-gate

Shot Video Director skill bundle, accepted-image input contract, per-shot video
prompt review, provider guard, and shot-local retry behavior.

### section-07-audio-assembly-and-render-gates

Separate TTS/audio review, native-audio no-duplicate rule, final assembly
projection, render/library-finalize approval, and completion evidence.

### section-08-ui-checkpoint-workflow

Typed safe projections, Marketplace and Storyboard Review surfaces, checkpoint
cards/actions, Thai-first copy, responsive/accessibility states, and browser proof.

### section-09-observability-rollout-verification

Trace/credit/alert contracts, external failure/backpressure handling, evaluation
corpus, live smoke, staged rollout, rollback, and final acceptance evidence.

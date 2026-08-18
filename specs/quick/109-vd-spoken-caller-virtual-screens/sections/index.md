<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --workspace @smartspec/web run test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-spoken-caller-policy
section-02-start-frame-and-pipeline
section-03-video-prompt-and-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks |
| --- | --- | --- |
| 01 spoken-caller-policy | - | 02, 03 |
| 02 start-frame-and-pipeline | 01 | 03 |
| 03 video-prompt-and-verification | 01, 02 | - |

## Execution order

1. Implement and test the pure shared policy.
2. Wire start-frame generation and canonical pipeline speaker order.
3. Wire video prompts, run cross-boundary focused verification, and document
   baseline failures.

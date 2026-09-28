<!-- PROJECT_CONFIG
runtime: cargo
test_command: cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-worker-analysis-transcription
section-02-worker-preparation-render-runtime
END_MANIFEST -->

# Feature 169 sections

1. [Worker media intelligence and transcription pipeline](section-01-worker-analysis-transcription.md)
2. [Preparation, B-roll render, runtime and recovery](section-02-worker-preparation-render-runtime.md)

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-worker-analysis-transcription | - | section-02 | No |
| section-02-worker-preparation-render-runtime | section-01 | - | No |

## Execution Order

1. section-01-worker-analysis-transcription
2. section-02-worker-preparation-render-runtime

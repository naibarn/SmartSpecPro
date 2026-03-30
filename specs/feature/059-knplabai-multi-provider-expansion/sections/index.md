<!-- PROJECT_CONFIG
runtime: python-uv
test_command: uv run pytest && npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-core-provider-contract
section-02-llm-provider-registration
section-03-media-catalog-admin-ui
section-04-media-dispatch-recovery
section-05-image-video-adapters
section-06-tts-embeddings
section-07-security-credits-rollout
section-08-tests-verification
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-core-provider-contract | - | section-02, section-03, section-04, section-05, section-06, section-07, section-08 | No |
| section-02-llm-provider-registration | section-01 | section-04, section-07, section-08 | Yes |
| section-03-media-catalog-admin-ui | section-01 | section-04, section-05, section-06, section-07, section-08 | Yes |
| section-04-media-dispatch-recovery | section-01, section-03 | section-05, section-06, section-08 | No |
| section-05-image-video-adapters | section-01, section-04 | section-08 | Yes |
| section-06-tts-embeddings | section-01, section-04 | section-08 | Yes |
| section-07-security-credits-rollout | section-01, section-02, section-03 | section-08 | Yes |
| section-08-tests-verification | section-01, section-02, section-03, section-04, section-05, section-06, section-07 | - | No |

## Execution Order

1. section-01-core-provider-contract
2. section-02-llm-provider-registration, section-03-media-catalog-admin-ui, section-07-security-credits-rollout
3. section-04-media-dispatch-recovery
4. section-05-image-video-adapters, section-06-tts-embeddings
5. section-08-tests-verification

## Section Summaries

### section-01-core-provider-contract
Create the KNPLabs Python provider contract, config keys, shared allowlists, and lazy client initialization.

### section-02-llm-provider-registration
Seed the KNPLabs LLM provider row and model mappings, then extend the chat routing and admin provider UI.

### section-03-media-catalog-admin-ui
Seed the KNPLabs media provider and media catalog, and surface the new provider in the media admin UI.

### section-04-media-dispatch-recovery
Wire KNPLabs into media dispatch and add stuck-task recovery for in-flight KNPLabs jobs.

### section-05-image-video-adapters
Implement KNPLabs image and video request adapters, including Gemini-native image generation and bounded polling.

### section-06-tts-embeddings
Add explicit KNPLabs support for internal TTS and embeddings APIs without changing default embedding behavior.

### section-07-security-credits-rollout
Apply security guardrails, Decimal-safe credit handling, and conservative rollout defaults for the new provider.

### section-08-tests-verification
Add pytest and vitest coverage for the provider, routers, seeds, recovery paths, security, and admin UI.

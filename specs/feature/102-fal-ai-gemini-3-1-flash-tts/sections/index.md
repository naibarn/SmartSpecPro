<!-- PROJECT_CONFIG
runtime: node-tsx-vitest
test_command: JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 vitest run
END_PROJECT_CONFIG -->
<!-- SECTION_MANIFEST
section-01-catalog-and-seed
section-02-shared-input-schema-and-ui
section-03-audio-payload-and-tests
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| `section-01-catalog-and-seed` | - | `section-02-shared-input-schema-and-ui`, `section-03-audio-payload-and-tests` | Yes |
| `section-02-shared-input-schema-and-ui` | `section-01-catalog-and-seed` | `section-03-audio-payload-and-tests` | No |
| `section-03-audio-payload-and-tests` | `section-01-catalog-and-seed`, `section-02-shared-input-schema-and-ui` | - | No |
 
## Execution Order

1. `section-01-catalog-and-seed`
2. `section-02-shared-input-schema-and-ui`
3. `section-03-audio-payload-and-tests`

## Section Summaries

### `section-01-catalog-and-seed`
Register the Gemini TTS model in provider templates, seeds, and registry fallbacks.

### `section-02-shared-input-schema-and-ui`
Preserve structured `speakers` arrays, expose `language_code`, and render the model inputs in Media Studio.

### `section-03-audio-payload-and-tests`
Keep the structured payload intact, enforce server-side validation, canonicalize abuse hashing, and update regression coverage.

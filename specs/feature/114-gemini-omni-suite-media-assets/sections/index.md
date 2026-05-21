<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-validation-and-metadata-foundation
section-02-provider-assets-data-and-api
section-03-kie-provider-asset-contract
section-04-gemini-omni-skill-packages
section-05-admin-presets-seeds-and-pricing
section-06-media-studio-gemini-omni-ux
section-07-generation-qa-learning-orchestration
section-09-media-studio-production-director
section-10-cross-modal-asset-orchestration
section-11-production-quality-loop-and-final-render
section-08-rollout-verification-and-regression
END_MANIFEST -->

# Implementation Sections Index - Feature 114: Gemini Omni Suite Media Assets

This plan spans TypeScript/Vitest, React UI, Drizzle migrations, skill packages, helper validation scripts, cross-modal production orchestration, and Python provider tests. The TypeScript web app is the primary runtime, with Python provider work isolated in section 03 except optional offline skill verification helpers.

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-validation-and-metadata-foundation | - | 02, 05, 06, 07 | Yes |
| section-02-provider-assets-data-and-api | 01 | 03, 06, 07 | Yes after 01 |
| section-03-kie-provider-asset-contract | 02 | 06, 07 | Yes after 02 |
| section-04-gemini-omni-skill-packages | 01 | 06, 07 | Yes after 01 |
| section-05-admin-presets-seeds-and-pricing | 01 | 06, 07, 09, 10, 11 | Yes after 01 |
| section-06-media-studio-gemini-omni-ux | 01, 02, 03, 04, 05 | 07, 09, 10 | No |
| section-07-generation-qa-learning-orchestration | 02, 03, 04, 05, 06 | 09, 10, 11 | No |
| section-09-media-studio-production-director | 01, 04, 05, 06, 07 | 10, 11 | No |
| section-10-cross-modal-asset-orchestration | 01, 02, 03, 04, 05, 06, 07, 09 | 11 | No |
| section-11-production-quality-loop-and-final-render | 01, 02, 03, 04, 05, 06, 07, 09, 10 | 08 | No |
| section-08-rollout-verification-and-regression | 01, 02, 03, 04, 05, 06, 07, 09, 10, 11 | - | No |

## Execution Order

1. `section-01-validation-and-metadata-foundation`
2. `section-02-provider-assets-data-and-api`, `section-04-gemini-omni-skill-packages`, and `section-05-admin-presets-seeds-and-pricing`
3. `section-03-kie-provider-asset-contract`
4. `section-06-media-studio-gemini-omni-ux`
5. `section-07-generation-qa-learning-orchestration`
6. `section-09-media-studio-production-director`
7. `section-10-cross-modal-asset-orchestration`
8. `section-11-production-quality-loop-and-final-render`
9. `section-08-rollout-verification-and-regression`

## Section Summaries

### section-01-validation-and-metadata-foundation
Add shared metadata and validation primitives so the rest of the suite can represent hidden provider fields, provider asset pickers, reference units, and Gemini Omni constraints.

### section-02-provider-assets-data-and-api
Add durable provider asset storage and server APIs for Gemini Omni Character and Audio assets.

### section-03-kie-provider-asset-contract
Implement Kie.ai Character and Audio asset creation contract and preserve existing Gemini Omni Video task behavior.

### section-04-gemini-omni-skill-packages
Create Gemini Omni Director, Prompt QA, and Video Quality QA skills with schemas, fixtures, references, verification scripts, production quality gate contracts, and reviewer-role outputs.

### section-05-admin-presets-seeds-and-pricing
Update static registry, seed scripts, admin presets, and pricing tests so Gemini Omni managed config is accurate.

### section-06-media-studio-gemini-omni-ux
Build the dedicated Gemini Omni suite panel and remove confusing raw/synced fields from normal user flow.

### section-07-generation-qa-learning-orchestration
Wire director, deterministic validators, reviewer-role quality gate, QA, credit validation, video generation, video QA, retries, and learning recommendations.

### section-09-media-studio-production-director
Add a centralized Media Studio Production/Director workspace for goal-driven cinematic storytelling, product campaigns, audience targeting, Story Bible planning, and cross-tab orchestration.

### section-10-cross-modal-asset-orchestration
Plan and generate required image, video, character, audio, TTS, sound, product, and reference assets across all supported Media Studio providers before final video generation.

### section-11-production-quality-loop-and-final-render
Add the end-to-end production quality loop, provider-fit selection, final render preflight, Gemini Omni/Seedance 2 final-provider routing, Storyboard Review handoff, and targeted revision cycles.

### section-08-rollout-verification-and-regression
Add feature flags, rollout controls, regression coverage, and final verification for the full Gemini Omni and Production Director scope.

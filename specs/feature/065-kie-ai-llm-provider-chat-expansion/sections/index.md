<!-- PROJECT_CONFIG
runtime: node-typescript
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-provider-template-and-admin-catalog
section-02-llm-request-config-contract
section-03-kie-endpoint-routing-and-request-shapes
section-04-model-catalog-mappings-and-capabilities
section-05-tests-rollout-and-guardrails
END_MANIFEST -->

# Implementation Sections Index

## Dependency graph

| Section | Depends on | Blocks | Parallelizable |
|---|---|---|---|
| section-01-provider-template-and-admin-catalog | - | section-02, section-03, section-04, section-05 | No |
| section-02-llm-request-config-contract | section-01 | section-03, section-04, section-05 | No |
| section-03-kie-endpoint-routing-and-request-shapes | section-01, section-02 | section-05 | No |
| section-04-model-catalog-mappings-and-capabilities | section-01, section-02 | section-05 | Yes |
| section-05-tests-rollout-and-guardrails | section-01, section-02, section-03, section-04 | - | No |

## Execution order

1. section-01-provider-template-and-admin-catalog
2. section-02-llm-request-config-contract
3. section-03-kie-endpoint-routing-and-request-shapes and section-04-model-catalog-mappings-and-capabilities
4. section-05-tests-rollout-and-guardrails

## Section summaries

### section-01-provider-template-and-admin-catalog

Add the Kie provider template, extend provider catalog metadata to support per-model `apiStyle`, and make the admin catalog honor it for unmapped rows.

### section-02-llm-request-config-contract

Introduce a media-style per-model request-config contract for LLM models so inputs, passthrough fields, and conflict rules are stored explicitly.

### section-03-kie-endpoint-routing-and-request-shapes

Add Kie-specific URL resolution rules and make request-shape handling follow `apiStyle` and model request config where required.

### section-04-model-catalog-mappings-and-capabilities

Register the requested Kie model catalog entries, define capability defaults, and keep enablement conservative.

### section-05-tests-rollout-and-guardrails

Add regression tests, response-normalization coverage, and rollout-safe validation checks.

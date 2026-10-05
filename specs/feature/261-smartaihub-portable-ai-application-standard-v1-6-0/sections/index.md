<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/spaas-standard test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-package-contract
section-02-manifest-schema-parser
section-03-package-structure
section-04-dependency-graph
section-05-secret-scanning
section-06-package-digest
section-07-validation-pipeline
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-package-contract | - | 02, 03, 04, 05, 06, 07 | No |
| section-02-manifest-schema-parser | 01 | 03, 04, 05, 07 | No |
| section-03-package-structure | 01, 02 | 04, 05, 06, 07 | No |
| section-04-dependency-graph | 01, 02, 03 | 07 | Yes |
| section-05-secret-scanning | 01, 03 | 07 | Yes |
| section-06-package-digest | 01, 03 | 07 | Yes |
| section-07-validation-pipeline | 02, 03, 04, 05, 06 | - | No |

## Execution Order

1. section-01-package-contract
2. section-02-manifest-schema-parser
3. section-03-package-structure
4. section-04-dependency-graph, section-05-secret-scanning, section-06-package-digest (after structure contracts are frozen)
5. section-07-validation-pipeline

## Section Summaries

### section-01-package-contract
Workspace package, ESM exports, public types, diagnostics and shared limits.

### section-02-manifest-schema-parser
Versioned manifest schema, safe YAML/JSON parsing, feature negotiation and canonical manifest model.

### section-03-package-structure
Normalized package inventory, safe file/path handling, reference integrity and structural validation.

### section-04-dependency-graph
Typed dependency edges, version/reference checks, deterministic topological ordering and bounded cycle reporting.

### section-05-secret-scanning
Bounded secret detection with path/rule-only redacted diagnostics.

### section-06-package-digest
Documented versioned canonical framing, deterministic SHA-256 and exclusions.

### section-07-validation-pipeline
Compose V1–V8 results, contextual `not_evaluated` stages, deterministic reports and package usage docs.

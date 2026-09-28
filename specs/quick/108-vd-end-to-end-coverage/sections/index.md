<!-- PROJECT_CONFIG
runtime: node-pnpm-typescript
test_command: cd apps/web && pnpm exec vitest run
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-product-reference-contract
section-02-lineage-propagation
section-03-qc-enforcement
section-04-regression-rollout
END_MANIFEST -->

# Section index

Execution order: 01 → 02 → 03 → 04. Section 01 is independent of Section 02. Section 03 consumes the reference and lineage contracts. Section 04 validates the integrated behavior and rollout.

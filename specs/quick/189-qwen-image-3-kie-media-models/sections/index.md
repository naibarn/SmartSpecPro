<!-- PROJECT_CONFIG
runtime: node-ts-python-postgres
test_command: npm --workspace apps/web exec vitest run server/services/__tests__/qwenImage3MediaModels.test.ts
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-catalog-contract
section-02-provider-routing-proof
section-03-migration-and-local-verification
END_MANIFEST -->

# Sections

Implementation is serial because the seed and migration are shared catalog resources and the repository has a broad dirty worktree. The conductor owns all writes.

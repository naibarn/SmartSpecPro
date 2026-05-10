<!-- PROJECT_CONFIG
runtime: node-vitest-python-unittest
test_command: npm --prefix apps/web test -- server/services/__tests__/skillUpgradeApplier.test.ts server/routers/__tests__/skills.legacy-upgrade-queue.test.ts client/src/pages/__tests__/AdminSkills.test.tsx
python_test_command: cd apps/web/skills/intelligence-skill-creator && python -m unittest tests.test_runner_paths
-->

<!-- SECTION_MANIFEST
section-01-runtime-path-hygiene.md: Stop ISC from launching out of nested workspace copies.
section-02-proposal-and-finalization-contract.md: Align JSON/diff proposal handling and apply-run finalization.
section-03-admin-recovery-and-verification.md: Add truthful diagnostics, recovery behavior, and verification.
-->

# Section Index

Implement sections in order. Section 01 prevents recurrence, Section 02 fixes state/proposal contracts, and Section 03 makes the operator workflow clear.


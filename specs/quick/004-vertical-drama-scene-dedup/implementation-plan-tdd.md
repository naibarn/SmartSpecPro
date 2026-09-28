# TDD plan

1. Add pure tests for normalization and candidate ranking, including living-room variants and a distinct office corner.
2. Add service tests proving exact normalized special labels reuse without insert and near labels return candidates without insert.
3. Add resolver tests proving reuse/create decisions are owner-scoped and return the canonical key.
4. Add contract tests for optional `sceneLocationKey` and worker precedence over auto-provisioning.
5. Add UI tests for candidate review, explicit create-new, and selected-key propagation.
6. Run focused suites, then diff check and bounded typecheck.

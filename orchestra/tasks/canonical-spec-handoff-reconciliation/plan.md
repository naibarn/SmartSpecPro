# Orchestra Plan

## Task
Design, implement, and migrate a single evidence-backed canonical Spec handoff and repository-wide reconciliation system without implementing legacy feature requirements.

## Classification
- scope: project
- risk: high
- affected_domains: [spec metadata, Python tooling, lifecycle contracts, developer skills, generated indexes, tests]
- estimated_file_count: 20+ framework files plus generated per-Spec records
- chosen_route: full-pipeline (deep-project decomposition, then bounded planning/implementation slices)
- task_summary: dynamically inventory configured canonical Spec roots, reconcile lifecycle/disposition/continuation independently from evidence, generate durable per-Spec/global handoff, integrate workflow consumers, and produce a consolidated status/ambiguity report
- bug_route: not applicable
- parallel_default: false
- planned_agents: []
- dispatch_preference: direct-standard-light

## Impact preflight

- Directly changed files: new `tools/spec_handoff/**`, `specs/_status/**`, per-Spec generated `handoff/**`, existing lifecycle skill files and their behavior tests, task-local planning records.
- Dependent files/tests: `skills/deep-project/**`, `skills/deep-plan/**`, `skills/deep-plan-quick/**`, `skills/deep-implement/**`, `skills/orchestra/**`, `skills/session-finish/**`, `skills/integration-controller/**`, skill behavior scenarios and tests.
- Read-only evidence surfaces: all canonical/alternate `spec.md` files, plans, sections, implementation evidence, code/tests/schemas/routes, Git history. Legacy feature code is not modified.
- Risk-sensitive: status authority, completion evidence, exact revision binding, generated metadata integrity. No DB schema or runtime security boundary planned.
- Parallel work: none dispatched (standard light mode and overlapping shared contract); sequential ownership stays with conductor.
- Confidence: medium. Initial search found 304 `spec.md` files across 6 top-level areas; canonical roots and candidate/child/template classification still require evidence-based configuration.
- Discovery fallback: SocratiCode tools unavailable in the active tool catalog; targeted rg/filesystem traversal used.

## Isolation and preservation

- Source checkout `/home/dev/projects/SmartSpecPro` is heavily dirty, including overlapping skill/package/spec changes and deleted Orchestra artifacts. It was not modified for implementation.
- Isolated worktree: `/home/dev/.codex/worktrees/canonical-spec-handoff-reconciliation`, based on `origin/main` SHA `26a276dd49f3bc0ecfbd5bf9e3492ea96efc6722`.
- Canonical target: repository policy in current AGENTS selects `origin/main`; no `.development-repository.toml` exists in the checkout.
- Existing `orchestra/` files in the primary checkout were not archived because user-owned deletion/modification exists there. This task's artifacts are kept in `orchestra/tasks/canonical-spec-handoff-reconciliation/` to avoid overwriting prior active records.

## WorkUnits and sequence

See `specs/project/canonical-spec-handoff-reconciliation/project-manifest.md` for six bounded splits and dependency DAG. First implement shared contract, then inventory/reconciliation, then views/migration, skill integrations, and exhaustive proof. No Spec-by-Spec agent dispatch.

## Completion and evidence

Use `test-design.md` and `lifecycle.md`. Completion must satisfy the user's 32-part Definition of Done, with production deployment/acceptance marked unverified when no exact-SHA runtime evidence exists. No full application build/UAT is planned for metadata-only changes. No repository-wide TypeScript typecheck.

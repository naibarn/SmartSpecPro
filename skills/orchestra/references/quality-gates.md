# Quality Gates — Development vs Acceptance

Use **only the check justified by the changed code and the repository's actual merge protection**. This file is not a mandatory checklist of all available reviewers.

## Development integration (fast)

- Confirm the changed scope is syntactically/structurally usable with the smallest suitable compile, lint, or focused test command.
- Resolve real merge conflicts and prevent accidental secret commits.
- Honor checks/reviews actually required by the protected Git branch. A required check that fails must be diagnosed and repaired; no false green, skip-as-pass or bypass.
- Use a targeted security check **only** where the diff changes auth, tenant isolation, secrets, access control, sensitive data processing, or another concrete security-sensitive path. Cosmetic UI changes do not automatically invoke a multi-specialist security gate.

A normal code defect is a task to repair, not a reason to request user permission. A missing verifier, pending full suite or unavailable browser is `PENDING/NOT_RUN`, not `FAIL` and never `PASS`. It is not an additional barrier to development integration unless it is itself a real repository-required check.

## Build, QA and acceptance (after integration)

Run appropriate broader checks as needed: whole-project typechecks/builds, UI screenshot and browser tests, accessibility/responsive review, security/dependency audits, load/performance tests, cross-section review, migration and runtime smoke, and final SPEC acceptance. Track real defects and repair against canonical Main; defer only checks that cannot yet be executed. Production release and destructive migrations have their own authorization boundaries.

## Failure handling

1. Inspect the decisive log or failing assertion and narrow the cause.
2. Apply the smallest correct repair and rerun the affected check. If repeated attempts have no information gain, change strategy or use an authorized equivalent verifier.
3. Carry unresolved non-integration gaps in the existing HandOff. Continue independent ready work instead of halting the overall session.
4. Report verified checks separately from pending, inconclusive, skipped or failed checks.

Do not run exhaustive reviewer waves, mandatory clean-round counts, a requirement-to-test matrix, seven-stage convergence, or full repository resource admission by default for a development merge. If repository protection itself requires one, follow the actual configured check rather than overriding it here.

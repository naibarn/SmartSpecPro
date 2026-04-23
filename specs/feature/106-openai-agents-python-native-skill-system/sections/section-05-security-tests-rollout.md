# section-05-security-tests-rollout

## Scope

Add the security, compatibility, and rollout tests that prove the feature works end to end.

## What this section must cover

- Path traversal rejection.
- Undeclared entrypoint rejection.
- Output path confinement.
- Secret redaction in checkpoints and artifact indexes.
- Finalize gating on verification success.
- Cross-provider compatibility validation for at least one OpenAI model and one non-OpenAI tier.
- End-to-end create, load, resume, verify, and migrate coverage.
- Workspace artifacts land in the expected `state/`, `out/`, and `logs/` locations.

## Plan constraints

- This section should validate the end state rather than redefine behavior already owned by sections 01-04.
- Keep tests focused on the contractual outcomes rather than implementation internals.

## Tests to write before implementation

- path traversal is rejected.
- undeclared entrypoints are rejected.
- writes outside declared outputs are rejected.
- checkpoints redact secrets.
- finalize fails when verify fails.
- at least one OpenAI-capable path and one non-OpenAI tier pass compatibility checks.
- a migrated legacy skill can run through the native path.
- workspace artifacts land in the expected state/output/log directories.

## Dependencies

This section depends on all earlier implementation slices because it verifies their integrated behavior.

# TDD Plan — Spec 261 Phase A

All tests are package-scoped Vitest suites under `packages/spaas-standard/tests`. Write each suite before its implementation. Commands are run from `apps/web` only if the existing Vitest configuration requires it; otherwise add the smallest package-local test script/config using existing workspace tooling. Do not run repo typecheck.

## 1. Goal and boundary
- Assert package exports do not import app/router/DB/runtime modules or execute package files.
- Assert scope exclusions: no registry persistence, workflow runtime, OpenSandbox/Docker dispatch or provider calls.

## 2. Package architecture
- Assert ESM entrypoint exports only stable SPAAS contract APIs and types.
- Assert package dependency graph is limited to existing schema/YAML dependencies and Node built-ins.

## 3. Contract and parser behavior
- Valid manifest fixture produces the expected canonical model.
- Invalid required fields, enums, apiVersion/schema versions and malformed semantic values return stable diagnostics.
- Duplicate keys, unsupported tags/aliases, multiple YAML documents, oversized input, excessive nesting/node count, invalid UTF-8 and non-finite numbers reject safely.
- Feature/extension tests cover supported required, unsupported required, safe optional preservation, unsafe optional omission and unknown security-critical semantics.
- Error serialization does not include secret-like input values or arbitrary source snippets.

## 4. Package inventory and canonical model
- Normalize valid relative paths and manifest references consistently in the structural layer; reject absolute/traversal/control/empty paths, normalization collisions and symlink escapes. The manifest parser must retain validated path strings without claiming inventory-normalized identity.
- Reject non-regular entries, duplicate IDs, duplicate normalized entries, missing required references and dangling component/file references.
- Exercise entry-count, per-file and aggregate byte limits at and over boundaries.
- Verify directory names and file extensions never trigger package execution.

## 5. Deterministic package digest
- Golden vector for documented v1 framing and SHA-256 output.
- Input enumeration order, host absolute root, separator and metadata changes do not affect digest.
- Included file byte/path changes change digest; caller-declared external secret binding and documented metadata exclusions do not enter package digest.
- Exclusion report is deterministic; ambiguous or secret-bearing package files are rejected/reported rather than silently ignored.

## 6. Dependency graph validation
- Valid graph returns deterministic topological order.
- Missing endpoints, duplicate/self edges, invalid ranges, required unresolved dependency and cycles return stable codes and deterministic locations/cycle path.
- Optional unavailable resolution is contextual only where permitted.
- Large bounded graph validates iteratively without recursion failure; over-limit graph fails closed.

## 7. Secret scan and security validation
- Detect representative credentials/private keys and sensitive file patterns.
- Do not flag declared secret references as embedded material.
- Findings and serialized reports include only file path, rule ID and severity; assert the secret and snippets never appear.
- Binary/oversized entries obey scan policy and resource bounds.

## 8. Validation pipeline and output
- Assert stages V1–V8 are stable ordered and have only `passed`, `failed`, or `not_evaluated` states.
- Missing runtime, DB/migration, external-test and marketplace context never appears as passed.
- Required failed stages make overall invalid; required unevaluated stages make `needs_context`; all applicable required checks passing yields valid.
- Diagnostic ordering and report serialization remain deterministic across input order.

## 9. Test-driven implementation order
- Each section suite is run directly and together with the package's focused suite.
- Run pnpm workspace package tests and applicable planning validators; never run repository-wide typecheck.

## 10. Acceptance and proof boundary
- Verify digest vectors, redaction, path/graph resource limits, public package exports and retired-system scan.
- Record commands and outcomes; do not represent external/provider/runtime checks as locally proven.

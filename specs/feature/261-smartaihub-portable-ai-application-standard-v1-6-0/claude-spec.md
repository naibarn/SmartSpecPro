# Synthesized Specification — Spec 261 Phase A

## Objective
Implement the canonical portable SmartAIHub application package contract and deterministic offline validator described by Spec 261, with focus on Phase A in §81. The result is an independently consumable workspace package that parses a package manifest, produces a canonical in-memory representation, validates package structure and declarations, computes an immutable deterministic package digest, checks dependency graphs, and scans for embedded secrets.

## In-scope requirements
1. Canonical manifest schema and typed model conforming to Spec 261 §6–7 and relevant later amendments.
2. Safe YAML parsing, schema/version/feature compatibility checks and stable typed diagnostics.
3. Package file/path inventory and structure validation without executing content.
4. Uniqueness, reference integrity, dependency graph validity, deterministic cycle diagnostics and bounded graph traversal.
5. Secret scanning with safe diagnostic redaction.
6. Canonicalization and stable SHA-256 digest contract, with golden vectors and explicit exclusion rules.
7. Validation pipeline reports for applicable V1–V8 checks; checks that require unavailable runtime/platform/registry context are represented as `not_evaluated` or contextual findings, never falsely passed.
8. Focused package tests, usage/API documentation and CLI only if it is needed to exercise the package contract without adding runtime integration.

## Required behavior
- Manifest parsing rejects malformed YAML, duplicate keys, ambiguous/non-JSON values, unsupported schema versions and malformed fields.
- Unknown required or security-critical semantics fail closed. Unknown optional fields/extensions are retained without execution only under the manifest's explicit safe-preservation contract.
- All file references are normalized relative package paths; absolute paths, traversal, symlink escape and duplicate normalized paths are rejected.
- Dependency constraints and component references are validated before resolution. Cycles and unresolved references produce stable reason codes and useful paths without recursive-stack risk.
- Digest is independent of filesystem enumeration order and host path/separator; include sorted normalized relative paths and file bytes with unambiguous framing. Exclusions and digest algorithm/version are documented and tested.
- Secret scanning is bounded; findings disclose file path and rule identifier only. No content value is returned, logged, or serialized.
- Validator output distinguishes `valid`, `invalid`, and `not_evaluated`/context-needed stages. A missing runtime, marketplace, provider, migration database or registry is not success evidence.

## Out of scope
Registry records/storage, database schema/migrations, lifecycle APIs, release orchestration, Spec 224 generation/Final Verify integration, deployment/runtime resolution, adapters, marketplace operations, UI, provider/network calls and all retired systems.

## Constraints
Use pnpm workspace conventions, ESM TypeScript, existing Zod and YAML packages, package-scoped Vitest. Preserve unrelated worktree files. Do not run repository typecheck. No package content execution or arbitrary manifest-provided shell commands.

## Acceptance criteria
- A valid fixture parses into the canonical typed model and passes all context-free checks.
- Invalid schema, path/reference/dependency/secret cases yield deterministic stable codes and safe diagnostics.
- Feature and extension negotiation fails closed for unsupported required/security-critical declarations while safe optional data round-trips.
- Digest vectors remain stable across input ordering and host path differences and change when included package bytes change.
- Package tests and planning validators pass; `git diff --check` is clean; no repository-wide typecheck is run.

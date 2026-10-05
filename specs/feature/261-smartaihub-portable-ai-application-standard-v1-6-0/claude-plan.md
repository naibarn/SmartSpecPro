# Spec 261 Phase A — Implementation Plan

## 1. Goal and boundary

Deliver the SPAAS package contract and offline validator for Spec 261 §81 Phase A. This plan includes only the manifest/package boundary: typed schema, parser, canonical in-memory model, deterministic digest, dependency graph validation, secret scan and a staged validation report. It excludes registry/lifecycle persistence, APIs, migrations, Spec 224 integration, runtime execution, providers, marketplace actions, and UI. No legacy custom workflow engine or retired execution system may be used; a package directory with a `workflows/` name remains inert input.

The validator must not execute package code, contact providers, deploy resources, apply migrations or claim checks that require external context. Such stages return `not_evaluated` with a stable reason.

## 2. Package architecture

Create `packages/spaas-standard` as an ESM workspace package, exported as `@smartspec/spaas-standard`. It owns public types, schema/parser, canonical package model, pure validation, digest and focused fixtures/tests. It may depend on existing `zod` and `js-yaml` workspace-resolved libraries, but not on `apps/web`, persistence, runtime adapters or services.

Suggested modules:

- `src/model.ts`: public manifest, package inventory, diagnostic, stage and canonical model types.
- `src/schema/`: strict Zod schemas for stable contract portions and safe extension containers.
- `src/parser.ts`: bounded safe YAML/JSON parsing to validated typed input.
- `src/canonicalize.ts`: deterministic semantic-value normalization and canonical manifest serialization; package-path policy is owned by `src/paths.ts` in the structural layer.
- `src/paths.ts`: host-independent canonical relative path policy shared by manifest-reference validation and package inventory construction.
- `src/validate/`: schema, structural, dependency, security, runtime-context, migration-context, tests and marketplace-context validators.
- `src/digest.ts`: versioned package digest implementation and exclusion policy.
- `src/index.ts`: stable exports; no internal app coupling.
- `tests/`: focused fixture-driven Vitest suites and deterministic golden vectors.

Keep the schemas aligned with Spec 261 §6–7 and revisions through 1.6.0. Known core fields receive explicit types; extension/forward-compatible fields are handled by an explicit policy, not silently stripped. The schema/parser must retain semantically preserved optional data and reject unsupported required/security-critical semantics.

## 3. Contract and parser behavior

The public parser accepts manifest bytes/text plus explicit supported schema/API versions and feature/extension support context. It returns either a canonical typed manifest with canonical separators on declared relative-path fields or diagnostics with stable codes, severity and JSON-pointer-like locations. Inventory/path normalization and existence checks are performed by the structural stage. Parser errors must not echo secret-like values or arbitrary file content.

Use the existing YAML parser with JSON-compatible values only. Reject duplicate mapping keys, aliases/tags or other constructs that permit ambiguous/resource-amplifying interpretation, non-finite numbers, multiple documents, excessive bytes/depth/nodes and invalid UTF-8. Apply equivalent shape validation to JSON input if JSON is supported. Parser limits are named constants with boundary tests.

Compatibility decisions are explicit inputs. Unsupported `requiredFeatures`, required/security-critical extension namespaces or schema versions fail closed. Unsupported optional features/extensions are retained but marked unexecuted only when the declaration proves safe omission. Unknown security-relevant declarations are never dropped. Stable diagnostics must include code, stage, location and non-sensitive explanation.

## 4. Package inventory and canonical in-memory model

Define an immutable in-memory package object containing the canonical manifest, normalized package entries, dependency edges, digest metadata and validation provenance. The API receives package entries from a caller; it does not assume filesystem authority or perform network reads. If a filesystem adapter is needed for tests, it is explicitly isolated and must reject symlinks, non-regular files, traversal, absolute paths, duplicate normalized names and paths that escape a supplied root. The parser validates manifest path fields as strings with canonical `/` separators but leaves package-relative normalization and existence checks to the structural stage, avoiding duplicate normalization logic.

Canonical relative paths use `/`, reject `.`/`..`, empty or control segments, reserved metadata collisions and case/Unicode ambiguities according to one documented normalization policy. The single `paths.ts` owner applies the exact same policy to inventory names and manifest references. Do not silently rewrite two distinct entries to the same canonical path. Enforce bounded entry count, individual/aggregate byte size and content scan limits before expensive processing.

Cross-reference validation covers declared components and referenced files, unique stable IDs, known component kinds, declared package sections, and required-file existence. Do not infer executable authority from file extensions or directory names.

## 5. Deterministic package digest

Define a versioned digest contract (for example `spaas-package-v1:sha256:<hex>`) and document exact framing: canonical relative path, byte length and content commitment for each included entry in lexicographic path order, with domain/version separators to avoid concatenation ambiguity. The manifest is committed by its canonical semantic representation so YAML formatting and map ordering do not alter its digest; other entries use exact bytes unless their media contract explicitly defines canonicalization. The digest must not depend on host absolute paths, filesystem enumeration order, path separator, timestamps or permissions.

Use fixed, documented exclusions only for VCS metadata and the digest's self-referential signature/attestation envelope. `app.lock.json`, manifest secret-reference identifiers, and all normal package content remain included. Secret values are forbidden from the package and are never supplied to the digest function; secret resolution/binding values exist outside the package. Do not permit caller-defined arbitrary exclusions, which would make the package malleable. Exclusion decisions are inspectable and tested. Any excluded package path is reported for review. A semantic manifest change or included file content/path change changes the digest.

## 6. Dependency graph validation

Represent package component and capability dependencies as typed edges. Validate endpoint existence, duplicate/self edges, supported version syntax/ranges, immutable production references where the manifest declares production/release intent, and declared capability semantics without claiming remote resolution. Produce deterministic topological order for acyclic graphs and stable cycle paths for cyclic graphs. Use iterative bounded algorithms to avoid stack exhaustion. Unknown or unresolvable dependencies are errors when required and contextual/not-evaluated only where the spec permits optional resolution.

## 7. Secret scan and security validation

Scan bounded text package entries for common credential classes and explicit secret-bearing file patterns, while avoiding binary false positives. Detection rules return only path, rule ID and severity; never return matched values, snippets, hashes of secret values or logs containing the bytes. Detect likely `.env`/private-key/token files and high-confidence credential assignments. Distinguish declared secret references/bindings from embedded values. Test exact output serialization for non-disclosure.

The package API must be pure with respect to execution: it may inspect bounded bytes only. It must not evaluate YAML tags, import package modules, invoke scripts, contact URLs or follow symlinks. Error handling must fail closed on limit overflow and unsupported security-sensitive semantics.

## 8. Validation pipeline and output

Expose a single validator that composes checks and returns ordered stage records for V1–V8. Each record has `passed`, `failed` or `not_evaluated`, stable diagnostics, and the reason/context required. V1 schema and V2 structure are locally decidable; V3 dependency checks separate static resolution from unavailable registries; V4 security scans local declarations/content; V5 runtime feasibility, V6 actual migration-chain execution, V7 external test execution and V8 publisher/entitlement/marketplace checks require explicit context/adapters. Missing context is never represented as passed.

Diagnostics are deterministically ordered by stage, normalized path/location, code and stable tie-breakers. Overall status is invalid if any required check fails; it is valid only when all required checks for the selected validation profile pass and no mandatory stage is unevaluated; otherwise it is `needs_context`.

## 9. Test-driven implementation order

1. Package setup and stable public type/diagnostic contracts.
2. Schema and parser, including malformed/ambiguous/resource-limit inputs and feature negotiation.
3. Canonical package inventory, safe path/reference and structural checks.
4. Dependency graph validation and deterministic ordering/cycle reporting.
5. Secret scanning and diagnostic redaction.
6. Versioned deterministic digest and golden vectors.
7. Integrated V1–V8 report composition, API exports and user documentation.

Every section adds tests before implementation. Use package-scoped Vitest; avoid all repository-wide typecheck commands per project rule. No new dependencies unless existing workspace versions cannot satisfy the parser/schema contract.

## 10. Acceptance and proof boundary

Required proof: all new focused package tests pass; schema and section planning validators pass; package metadata resolves through pnpm workspace; `git diff --check` passes; contract fixture vectors are deterministic; a retired-system scan confirms no new retired imports/callers; at least ten documented gap-audit passes find and close all in-scope gaps. Do not claim runtime/provider, migration execution, marketplace, Spec 224 or production conformance evidence.

The ten gap audits are a post-implementation review requirement from the user, not permission to manufacture repeated edits: each pass examines a distinct risk surface, records findings and fixes, and continues until all in-scope gaps are closed.

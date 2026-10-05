# Section 01 — Package Contract

## Purpose and boundary

Create the standalone ESM workspace package that is the public, pure TypeScript boundary for Spec 261 Phase A: `@smartspec/spaas-standard` in `packages/spaas-standard`. This section establishes stable exports, model types, diagnostics, limits, and package test plumbing before schema parsing or filesystem/package validation exists.

The package represents an untrusted SPAAS application artifact. It must never execute package files, import package modules, invoke scripts, contact providers, persist data, or depend on `apps/web`, runtime adapters, routers, database code, registry/lifecycle services, or retired systems. A directory called `workflows/` is inert package input only.

This section deliberately does not implement manifest schemas/parsing, path inventory, graph validation, secret scanning, digesting, or V1–V8 composition. Those belong to dependent sections.

## Ownership

Create or modify only the package-contract surfaces below:

| File | Responsibility |
| --- | --- |
| `packages/spaas-standard/package.json` | Workspace identity, ESM entrypoints, focused test script, and only existing workspace-compatible dependencies. |
| `packages/spaas-standard/tsconfig.json` | Minimal package TypeScript configuration aligned with repository ESM conventions. |
| `packages/spaas-standard/src/model.ts` | Public contract types, stable diagnostic vocabulary, result/status types, immutable package-input types, and named resource limits. |
| `packages/spaas-standard/src/index.ts` | Curated stable public exports only. |
| `packages/spaas-standard/tests/package-contract.test.ts` | Test-first coverage for package metadata and public-contract invariants. |

Do not create a CLI in this section. Do not add a package-local copy of Zod, YAML, Vitest, or unrelated tooling when a workspace-provided dependency/configuration can be used.

## Tests first

Write `packages/spaas-standard/tests/package-contract.test.ts` before the production files it proves. The suite must cover the following observable contract:

1. The package resolves as `@smartspec/spaas-standard`, declares ESM behavior, and its supported public entrypoint resolves to `src/index.ts` according to local workspace conventions.
2. The entrypoint exposes the stable public contract types and values needed by later sections, without exposing implementation-private module paths as the supported API.
3. Importing the entrypoint is side-effect free: it performs no filesystem enumeration, network access, provider call, process execution, or package-content execution.
4. Package source and metadata do not introduce imports/callers for app routers, DB/persistence, runtime execution, provider adapters, Agency, `work/request`, `workpacks`, the legacy `/workflows` engine, OpenSandbox, `sandbox_jobs`, or Docker/OpenSandbox dispatch.
5. Diagnostic objects can represent a stable machine-readable code, severity, validation stage, JSON-pointer-like location, and non-sensitive explanation; no type requires raw manifest text, source snippets, or secret values.
6. Stage status is restricted to `passed`, `failed`, and `not_evaluated`; an overall result can distinguish `valid`, `invalid`, and `needs_context` without treating missing context as success.
7. Package input and model types accept caller-supplied package entries and explicit compatibility/limit context; they do not require filesystem authority, a database, network credentials, or a runtime object.
8. Named default limits and documented override shape exist for parser/inventory/scan consumers. Their contract permits bounded byte, node/depth, entry-count, per-entry-byte, aggregate-byte, graph, and scan workloads; values are finite positive integers and callers cannot disable limits through zero, negative, `NaN`, or infinity values.

Keep the tests focused and package-scoped. The eventual command is `pnpm --filter @smartspec/spaas-standard test`; do not run a repository-wide typecheck.

## Public contract design

Implement the following type families in `src/model.ts`. Field-only interfaces/types and constants are appropriate; no implementation algorithms belong here.

### Manifest and compatibility types

- A `SpaasManifest` canonical manifest type with typed core identity/version fields and explicit containers for the package portions Phase A must inspect: metadata, compatibility, components, declared package sections, requirements, security/privacy declarations, and extensions.
- The canonical model must preserve only extension/optional data whose omission is explicitly safe. Its type must carry preserved extension data separately from known core fields so unknown fields cannot silently become trusted core semantics.
- `ManifestSupportContext` (or equivalent) must make supported API/schema versions, supported required/optional features, known extension namespaces/versions, and extension criticality support explicit inputs. It must not imply a provider, registry, or remote capability is available.
- Model an extension declaration with namespace, version/schema identity, criticality (`required`, `optional`, `advisory`, or `security_critical`), configuration payload, and an explicit safe-omission/fallback assertion where optional preservation is requested.

### Package input and canonical-model types

- `PackageEntry` represents caller-provided untrusted content using a relative path and bytes, plus only non-authoritative metadata required for Phase A classification. It must not accept an executable callback, stream with ambient authority, host absolute path as canonical identity, or filesystem handle.
- `CanonicalPackage` represents immutable validated/canonical state: canonical manifest, normalized entries, typed declared component/capability dependency edges, optional digest metadata, and validation provenance. Later sections populate those values through this contract.
- Provide a small provenance type that can identify schema/parser/normalization contract versions and selected validation profile without claiming external checks occurred.

### Diagnostics and validation result types

- Define a finite string-union or readonly catalog for stable Phase A diagnostic codes. Reserve code groups for parser/schema, compatibility/extension, package path/structure, dependency, security/secret, digest, resource limit, and unavailable context. Codes must be stable and machine-readable; explanatory text is separate.
- `Diagnostic` must include `code`, `severity` (`error`, `warning`, `info`), `stage`, normalized `location`, and a safe human explanation. Optional structured metadata must be an allowlisted, non-secret-safe record; never make raw matched input, YAML exception dumps, package bytes, stack traces, or credentials part of the public diagnostic contract.
- Define `ValidationStage` as V1 through V8 and `StageResult` with only `passed`, `failed`, or `not_evaluated`, ordered diagnostics, and a stable context/unblock reason for `not_evaluated`.
- Define `ValidationReport` / overall status so a required failure is `invalid`; a required unevaluated stage is `needs_context`; `valid` is reachable only when all required selected checks pass. These are contract definitions only; section 07 composes the report.
- Define parser/result discriminated unions that make a successful canonical manifest mutually exclusive with failure diagnostics. Preserve source-format-neutral errors and avoid a thrown raw-parser-error API.

### Limits

Export named, readonly defaults plus a narrow `SpaasValidationLimits` override type. Later sections use these limits for manifest byte size, YAML nesting/node count, package entry count, per-entry and aggregate bytes, graph nodes/edges, and text scan bytes. Document each unit and inclusive boundary in comments. Merge/validation behavior belongs to the consuming parser/inventory/scan code, but this section must make every security/resource bound addressable and versionable.

## Implementation steps

1. Inspect root workspace/package conventions and create the smallest `packages/spaas-standard` ESM package metadata that pnpm recognizes. Keep `main`/`types`/exports aligned with the repository pattern of source TypeScript ESM packages.
2. Create `src/model.ts` with the stable, field-only public types and readonly constants described above. Use `readonly` properties/collections where practical so the canonical model cannot be accidentally mutated after later validation succeeds.
3. Create `src/index.ts` as the only supported public surface. Re-export model contracts intentionally; do not use a broad wildcard that would accidentally make future internal helpers public.
4. Add the contract tests first, then write the minimum metadata/types/entrypoint necessary to make them pass.
5. Confirm no dependency was added unless existing workspace packages cannot supply it. Schema/parser dependencies, if needed later, are introduced by Section 02 with the same constraint.

## Acceptance criteria

- `pnpm --filter @smartspec/spaas-standard test` can discover and run the focused contract suite once later test configuration is in place.
- The package is a pure ESM workspace boundary with no app, database, runtime, provider, or retired-system coupling.
- All downstream sections have stable types for manifests, input entries, extensions/features, diagnostics, limits, stage results, and canonical-package provenance.
- Diagnostics and result states make it impossible for callers to confuse unavailable external context with a passed check, or to require raw/secret input in returned errors.
- Resource bounds are named and typed before untrusted input is parsed or scanned.

## Dependencies and handoff

This is the first section and has no implementation dependency. Freeze exported names, diagnostic/stage semantics, and limits before Section 02 begins. Section 02 owns schema and parser behavior and consumes `SpaasManifest`, `ManifestSupportContext`, parser-result types, diagnostics, and parser limits from this section. Sections 03–07 consume the remaining package/diagnostic/stage contracts.

## Verification boundary

Run only the focused package test command and lightweight checks such as `git diff --check` after implementation. Do not run `npm run typecheck`, a repository-wide typecheck/build, browser/E2E suite, provider call, runtime execution, registry check, migration, or deployment as evidence for this section.

## Implementation result

- Created the ESM package metadata, package-local Vitest config, TypeScript config, model contracts, curated entrypoint and package contract tests.
- Added fixed stage/status catalogs, stable diagnostic-code catalog, typed manifest/package/result contracts and finite inclusive resource limits.
- Verification: `pnpm --filter @smartspec/spaas-standard test` — 1 file / 5 tests passed; `git diff --check` passed for the package and this section file.
- Deviation: declared Vitest as a package-local development dependency so the standalone package test script resolves under pnpm filtering; Vitest is already present in the monorepo.
- Review fixes: constrained `valid` reports to eight ordered stage results with no mandatory failure/unevaluated result; made missing-context reasons mandatory; added typed required/optional feature support, typed dependency/digest metadata, a partial limit-override type, broader retired-system and contract guards, and the package lockfile importer. Limit merge/runtime validation remains with consuming validators per this section's contract-only boundary.

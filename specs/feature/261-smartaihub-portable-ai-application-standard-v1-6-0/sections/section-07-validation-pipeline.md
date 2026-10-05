# Section 07 — Validation Pipeline and Deterministic Report

## Purpose and boundary

Complete the public, offline validation entrypoint for `@smartspec/spaas-standard`. It composes the already-produced schema, structure, dependency, security, and digest facts into one deterministic V1–V8 report. It also documents how a package consumer calls the entrypoint and how a trusted host can supply external evidence without making this workspace package a runtime, registry, migration, test runner, provider adapter, or marketplace client.

The package processes an untrusted SPAAS artifact. It must not execute package files, import package modules, run shell commands, follow links, read an ambient filesystem, contact a network service, resolve a registry, deploy resources, apply a migration, or run a package test. A `workflows/` directory is inert input. No Agency, `work/request`, `workpacks`, legacy workflow engine, OpenSandbox, `sandbox_jobs`, Docker/OpenSandbox dispatch, persistence, UI, or Spec 224 integration may be introduced.

This is a report-composition section. It owns stage classification, deterministic sorting, overall-status calculation, and package-only usage documentation. It does not reimplement manifest parsing, inventory normalization, graph traversal, secret scanning, or digest framing.

## Prerequisites and integration ownership

This section requires the stable public contracts produced by Sections 02–06. Consume their final exported results only; do not import an internal implementation module or reinterpret their diagnostics.

| Dependency | Consumed contract | Pipeline responsibility |
| --- | --- | --- |
| Section 02 | Discriminated manifest parser result and canonical manifest | V1 schema verdict and its ordered parser diagnostics. |
| Section 03 | Normalized inventory and structural validation result | V2 referenced-file, component-ID, package-section, path, and resource-limit verdicts. |
| Section 04 | Static dependency graph result and contextual-resolution facts | V2 local graph verdict; V3 local reference/version/immutability verdict and external-resolution requirement. |
| Section 05 | Bounded secret/security scan result | V4 embedded-secret and local security-content verdict. |
| Section 06 | Deterministic digest result and exclusion report | Attach digest provenance to the report; a digest failure is a V2 local package-integrity failure with its original diagnostic. |

Do not duplicate any of those validators. The composer accepts their immutable result values. Its input must be a discriminated preparation result: if parsing cannot produce a trusted canonical manifest, V1 fails and dependent local stages are `not_evaluated` with a stable prerequisite reason rather than receiving a partial manifest.

## Owned files

| File | Responsibility |
| --- | --- |
| `packages/spaas-standard/src/validate/pipeline.ts` | Pure composition API, V1–V8 applicability/evidence rules, stable ordering, and overall verdict. |
| `packages/spaas-standard/src/model.ts` | Add public pipeline input, context/evidence, stage-report, report, and reason-code types only where Section 01's public model requires extension. Keep the existing diagnostic contract authoritative. |
| `packages/spaas-standard/src/index.ts` | Export the deliberate public pipeline API and public report types. |
| `packages/spaas-standard/tests/validation-pipeline.test.ts` | Test-first focused coverage using only in-memory canonical results and evidence fixtures. |
| `packages/spaas-standard/README.md` | Package-only usage and evidence-boundary documentation. It must not document application, provider, registry, database, runtime, or CLI integration. |

## Tests first

Create `packages/spaas-standard/tests/validation-pipeline.test.ts` before `src/validate/pipeline.ts`. Use minimal fixtures shaped as real outputs from the prerequisite public contracts; do not mock their private functions and do not use a filesystem, network, process, registry, database, or executable package fixture.

1. **Stable complete stage sequence:** a valid locally decidable package returns exactly V1, V2, V3, V4, V5, V6, V7, V8 in that order. Every stage status is exactly `passed`, `failed`, or `not_evaluated`; no alias such as `skipped`, `warning`, `pending`, or `not_applicable` is permitted.
2. **Local-stage composition:** parser/schema findings make V1 fail; inventory/structure or local graph findings make V2 fail; static dependency findings make V3 fail; secret/security-scan findings make V4 fail. Assert that a failure retains the prerequisite diagnostic's code, severity, safe location, and source stage meaning without rewriting it into an unstable message.
3. **Dependency-context truthfulness:** a clean static V3 result that declares a required remote registry/capability fact but receives no matching trusted evidence is `not_evaluated`, never `passed`. An optional external dependency is only deferrable when the prerequisite graph result has already proved explicit optionality and safe omission. A required unresolved local endpoint remains `failed`, never contextual.
4. **Missing external context:** required runtime feasibility (V5), migration-chain/rollback evidence (V6), required test/smoke evidence (V7), and applicable marketplace publisher/entitlement/policy evidence (V8) all become `not_evaluated` with a stable reason when their explicit evidence is absent. None may be promoted to `passed` merely because the relevant manifest field is present or because another stage passes.
5. **Trusted external evidence classification:** supply valid, complete, revision-bound evidence for each applicable V3 and V5–V8 check and assert the corresponding stage passes. Supply a negative or incomplete evidence item and assert the stage fails or remains `not_evaluated` according to the evidence contract; a host assertion with the wrong package digest, manifest identity, validation-profile identity, or expired/unsupported evidence version is never accepted as a pass.
6. **Applicability:** V8 is `not_evaluated` with the stable `NOT_APPLICABLE` reason only when the canonical manifest has no marketplace/publish intent. It is non-mandatory in that case. If such intent exists, V8 is mandatory for a profile that requests release/marketplace conformance and missing evidence yields `not_evaluated`. Apply the same manifest-and-profile-derived applicability rule to V5–V7; do not infer a requirement from file names or arbitrary package content.
7. **Overall status:** any required failed stage yields `invalid`; otherwise a required `not_evaluated` stage yields `needs_context`; `valid` is possible only when every required selected check is `passed`. Non-mandatory `not_evaluated` stages do not downgrade a fully satisfied selected profile. Test the precedence when failed and unevaluated stages coexist: `invalid` wins.
8. **Deterministic diagnostics and serialization:** permute input entry order, prerequisite diagnostic order, graph facts, and external-evidence map order. Assert byte-for-byte equivalent serialized reports. Diagnostics sort by V1–V8 stage order, normalized location/path, code, severity rank, and documented safe tie-breakers. Stage-local evidence/findings use their documented stable key order. The report must never serialize package bytes, manifest source, a secret value/snippet/hash, raw exception, stack trace, host path, provider token, or arbitrary external-adapter payload.
9. **Digest binding:** a report exposes the Section 06 versioned digest and deterministic exclusion summary. External evidence accepted for this report must bind to that digest. Changing an included file changes the digest and makes stale evidence unusable, yielding `not_evaluated` or `failed` rather than a pass.
10. **Purity and immutability:** composing a report does not mutate the canonical manifest, inventory, prerequisite results, evidence objects, or caller arrays. Assert it performs no I/O/execution hooks. The composer must not invoke callbacks supplied in evidence; evidence is data that a trusted host has produced before calling this package.
11. **Public usage contract:** import only from `@smartspec/spaas-standard`, call the documented parser/preparation/validation API with in-memory entries and explicit context, and assert no app/router/database/runtime package appears in the import graph or README example.

Run `pnpm --filter @smartspec/spaas-standard test` for the focused package suite. Do not run a repository-wide typecheck, build, integration suite, or external runner from this section.

## Public pipeline contract

Expose one public pure entrypoint, named consistently with the package style, such as:

```ts
validateSpaasPackage(input: SpaasValidationInput): SpaasValidationReport
```

`SpaasValidationInput` contains only:

- the explicit manifest bytes/text, source format, support context, limits, and caller-supplied `PackageEntry` values needed by the prerequisite preparation APIs;
- a selected `ValidationProfile` that declares which stage/check families are mandatory for this validation request; and
- an optional `externalEvidence` collection containing data already obtained and verified by a trusted host outside this package.

`validateSpaasPackage` performs the Sections 02–06 pure validators in dependency order from those explicit in-memory inputs, then composes their public result values. It does not expose a second preparation API and must not accept prerequisite results supplied by a caller. This keeps trusted preparation, digest binding, and report provenance in one deterministic flow. Do not offer an API that accepts a callback, URL, database handle, provider client, runtime adapter, shell command, filesystem root, or arbitrary context object.

External evidence must be a narrow discriminated data contract. Each item identifies its V3/V5/V6/V7/V8 check, outcome, evidence schema version, package digest, canonical manifest identity/version, selected profile identity, observed time, expiry policy, and safe machine-readable reason/diagnostics. It must not carry raw provider responses, credentials, log contents, test output, migration SQL, or executable instructions. Reject unsupported versions and malformed/ambiguous evidence fail closed. The pipeline does not validate that a remote action happened; it only checks that supplied evidence is structurally complete and bound to the exact package/report request. Remote trust, signature verification, adapter invocation, and persistence are host responsibilities outside this package.

Each `SpaasValidationStageReport` contains the fixed stage ID, allowed status, whether the stage is mandatory under the selected profile, a stable reason when `not_evaluated`, ordered safe diagnostics, and a minimal ordered summary of accepted evidence identifiers. `SpaasValidationReport` contains all eight stage reports, overall status (`valid`, `invalid`, or `needs_context`), the selected profile identifier, canonical manifest identity/version where trusted, Section 06 digest metadata/exclusions, ordered diagnostics, and a format version. Make all arrays/read-only records immutable before returning them.

## V1–V8 behavior

Stage order is normative and fixed. A stage may pass only on positive evidence for every check that is mandatory and applicable within that stage. Absence of a needed external fact is always `not_evaluated`; it is never an empty pass.

| Stage | Required check family | Local source/evidence | Status behavior |
| --- | --- | --- | --- |
| V1 | Manifest syntax, required fields, enums, API/schema compatibility, feature/extension negotiation | Section 02 parser result | Pass only on successful canonical parsing and compatibility. Parser failure is `failed`; dependent stages receive prerequisite `not_evaluated` facts. |
| V2 | Referenced files, normalized inventory, component-ID uniqueness, declared package sections, canonical digest, and local dependency endpoint/edge/cycle integrity | Section 03 structural result, Section 04 static local graph result, and Section 06 digest result | Pass only when all local structural/graph/digest checks pass. No registry, runtime, or provider conclusion belongs here. |
| V3 | Dependency version/range policy, production immutability, compatibility constraints, and any declared external resolution | Section 04 static result plus digest-bound trusted resolution evidence where required | Static defects fail. If an applicable external fact has no admissible evidence, return `not_evaluated`; never call a resolver. |
| V4 | Embedded-secret detection and locally declared permission, side-effect, network, and suspicious-content policy supported by the canonical local scanner | Section 05 scan/local-security result | Local violations fail; pass only when the available bounded local checks pass. Do not claim remote policy enforcement or execution analysis. |
| V5 | Runtime requirements, placement feasibility, and required capabilities | Digest-bound trusted runtime/placement evidence | If applicable and evidence is absent, `not_evaluated`. A negative trusted finding fails. This package never probes or allocates a runtime. |
| V6 | Migration-chain validity and declared rollback consistency | Digest-bound trusted migration/rollback evidence | If applicable and evidence is absent, `not_evaluated`. This package never connects to a database, applies SQL, or runs a rollback. |
| V7 | Required test and package smoke-test outcome | Digest-bound trusted test evidence | If applicable and evidence is absent, `not_evaluated`. This package never executes tests or interprets arbitrary test logs. |
| V8 | Marketplace metadata, entitlement/pricing, publisher identity, and marketplace policy scan when publishing applies | Canonical publish intent plus digest-bound trusted marketplace evidence | No publish intent: `not_evaluated` with `NOT_APPLICABLE` and non-mandatory. Applicable but unevidenced: `not_evaluated`; negative evidence: `failed`. No marketplace API is called. |

The selected profile must have a finite documented identifier and a closed set of mandatory check families. Derive mandatory status from both that profile and canonical manifest declarations; never let callers mark a declared required/security-critical condition optional. A basic offline/package profile may reach `valid` only for packages whose selected mandatory checks are locally decidable and pass. A release or marketplace profile makes its applicable V3 and V5–V8 check families mandatory, so missing evidence yields `needs_context`.

## Composition algorithm and deterministic diagnostics

Implement the pipeline in this exact high-level order:

1. Parse and prepare the explicit in-memory package through the prerequisite public APIs, stopping trust propagation after V1 failure but still emitting all eight stage records.
2. Obtain V1–V4 local facts from their owners. Attach the Section 06 digest/provenance after inventory preparation; never calculate a second digest in this module.
3. Determine each stage's applicable and mandatory check families from the canonical manifest plus the closed selected profile.
4. Match external evidence by stage/check identity and require exact package-digest, manifest-identity/version, profile-identity, schema-version, timestamp/expiry, and complete safe outcome fields. Ignore unrecognized evidence only after adding a safe `EVIDENCE_UNSUPPORTED` or `EVIDENCE_MISMATCH` diagnostic where the evidence was required; never silently turn it into a pass.
5. Set each stage status: any relevant local/evidence failure is `failed`; otherwise missing mandatory evidence/prerequisites is `not_evaluated`; otherwise all required applicable checks proved positive is `passed`. Preserve a non-mandatory `NOT_APPLICABLE` stage as `not_evaluated`.
6. Sort stage diagnostics and construct a separately sorted report-wide diagnostic list. Compute the overall status only after all stage records are final.

Use one centralized comparator. Order diagnostics by numeric V1–V8 stage order, normalized JSON-pointer-like location (or canonical package path), code, severity in documented deterministic rank, and a final safe structural key such as check identity. Do not use insertion order, object property enumeration, raw-message text, timestamps, host paths, secret-bearing values, or arbitrary evidence payload as a tie-breaker. Normalize report serialization field ordering and arrays so equivalent caller input produces identical JSON bytes.

Use stable codes centrally defined with the Section 01 diagnostic vocabulary. Add only pipeline-owned codes needed to distinguish `VALIDATION_PREREQUISITE_UNAVAILABLE`, `VALIDATION_CONTEXT_REQUIRED`, `NOT_APPLICABLE`, `EVIDENCE_INVALID`, `EVIDENCE_MISMATCH`, `EVIDENCE_EXPIRED`, and `EVIDENCE_UNSUPPORTED`. Their messages state the rule and safe check/stage identity; they never expose raw input or evidence details.

## Package-only usage documentation

Write `packages/spaas-standard/README.md` with a short TypeScript example that imports the stable public API, supplies a manifest, in-memory entries, explicit support/profile context, and optionally a pre-validated digest-bound evidence record. The example must show callers branching on `valid`, `invalid`, and `needs_context`, and inspecting ordered stage/diagnostic codes. It must state:

- validation is deterministic, bounded, offline, and non-executing;
- V1–V4 are package-local only to the extent their prerequisite contracts prove them;
- V3 and V5–V8 external conclusions require trusted digest-bound evidence and otherwise report `not_evaluated`/`needs_context`;
- the package does not provide deployment, registry resolution, provider calls, database migration execution, test execution, marketplace action, persistence, or runtime admission; and
- diagnostics intentionally exclude source content, secret material, raw external responses, and stack traces.

Do not add a CLI unless the existing package contract cannot be exercised by the documented TypeScript API. A CLI does not improve this offline composition boundary and is outside this section by default.

## Acceptance criteria

- The package exports a single deterministic V1–V8 validation report API and the report always contains all stages in fixed order with only `passed`, `failed`, or `not_evaluated` statuses.
- V1–V4 use the prerequisite section results without duplicating validation logic; V3 separates static failure from unavailable external resolution; V5–V8 require explicit digest-bound trusted evidence.
- Missing runtime, registry, database/migration, external-test, provider, publisher, entitlement, or marketplace context is never reported as a pass.
- Overall `invalid` takes precedence over `needs_context`; `valid` requires every mandatory selected applicable check to pass.
- Equivalent input permutations produce an identical report and diagnostic serialization; diagnostics/evidence summaries disclose no package content, secret, raw error, credential, host path, or arbitrary adapter payload.
- The composer remains pure, non-executing, and package-only. It introduces no retired-system reference or external integration.
- Focused `@smartspec/spaas-standard` tests and `git diff --check` pass. This section provides no proof that a runtime, migration, external test, provider, registry, marketplace, Spec 224 flow, or production deployment actually succeeded.

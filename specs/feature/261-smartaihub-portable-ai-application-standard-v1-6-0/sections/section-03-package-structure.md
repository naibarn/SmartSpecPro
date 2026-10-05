# Section 03 — Package Structure and Reference Integrity

## Purpose and boundary

Implement the local, non-executing package inventory and structural validation boundary for the Spec 261 Phase A SPAAS package. A package is caller-supplied manifest data plus caller-supplied entries; this section must not enumerate an ambient directory, read the network, import a package module, execute scripts, infer authority from an extension/directory name, or contact a provider. A package directory called `workflows/` remains inert content.

This section provides the normalized inventory that the dependency graph, secret scanner, digest, and composed validator consume. It covers V2's locally decidable requirements: referenced files exist, component IDs are unique, and package path containment is established. V3 resolution, V4 secret inspection, digest construction, and V1 manifest parsing are owned by later/earlier sections.

## Dependencies and handoff

- **Requires section 01:** public diagnostic/result types, severity/stage conventions, shared limits, canonical package model types, and package entry input type.
- **Requires section 02:** a successful canonical manifest with syntactically validated relative path strings, component declarations, and package-section declarations. This section applies canonical path normalization to both manifest references and entries. Do not reparse YAML/JSON here.
- **Blocks sections 04–07:** expose one immutable normalized inventory and structural result. Consumers must use these values instead of re-normalizing input paths.

### Owned implementation and test files

- Create `packages/spaas-standard/src/paths.ts` for the sole pure path-normalization policy and reference normalization.
- Create `packages/spaas-standard/src/validate/structure.ts` for structural/reference validation.
- Update `packages/spaas-standard/src/model.ts` only to add the inventory/result members agreed by section 01; do not redefine section 01's public diagnostic contract.
- Update `packages/spaas-standard/src/index.ts` to export only the finalized stable structural API and types.
- Create `packages/spaas-standard/tests/package-structure.test.ts` with in-memory fixtures. A test-only filesystem adapter, if needed, belongs under `packages/spaas-standard/tests/helpers/` and must be isolated from the production API.

## Tests first

Write the focused Vitest suite before implementing the modules. Fixtures are in-memory `PackageEntry` values unless a test specifically verifies the optional test-only filesystem adapter.

1. **Canonical valid inventory:** paths such as `app.manifest.yaml`, `ui/index.html`, and `components/assistant.yaml` normalize to the same slash-separated relative names on every host. The result is immutable and sorted by canonical path without depending on caller enumeration order.
2. **Unsafe path rejection:** independently reject absolute POSIX paths, drive/UNC-style absolute paths, `.` or `..` segments, empty segments, NUL/control characters, excessive path length/depth, and names reserved by the package policy. Diagnostics identify the normalized location/path and a stable code, never file bytes.
3. **Collision rejection:** reject duplicate input entries, separator aliases, and distinct inputs that collapse under the chosen documented Unicode/case normalization policy. Never pick one winner or silently rewrite a collision.
4. **Entry-kind containment:** reject non-regular entries. Where the test adapter reads a filesystem, reject symlinks, hardlink/special-file abuse, and a resolved target outside its supplied root before accepting bytes.
5. **Resource boundaries:** accept values exactly at named entry-count, per-entry byte, aggregate-byte, pathname-length, and scan-content limits; reject one-unit-over inputs before expensive downstream work. The implementation must not retain/process an over-limit inventory partially.
6. **Reference integrity:** a manifest declaration for a component source or another declared file succeeds only when the exact normalized inventory entry exists. Missing/dangling references, duplicate stable component IDs, unknown component kinds under the section-02 contract, and undeclared/missing required package sections receive deterministic diagnostics.
7. **No execution:** entries named `workflows/anything`, executable-looking filenames, and script-like bytes are treated solely as data. Assert this API has no process, module-loading, network, or filesystem-side-effect call.
8. **Determinism:** permuting input entries yields byte-for-byte equivalent normalized inventory, structural verdict, and ordered diagnostics. Diagnostics sort by normalized path/location, then stable code and tie-breaker.

Run the package-scoped suite directly and with the other package tests; do not run repository-wide typecheck.

## Implementation plan

### 1. Establish one canonical path policy

Define named limits and a single `canonicalizePackagePath(input: string): Result<CanonicalPackagePath>` in `src/paths.ts`. It must accept only logical relative package paths, use `/` as the canonical separator, and reject unsafe/ambiguous inputs before creating a normalized value. Document the selected case/Unicode comparison policy adjacent to the function and apply it consistently to uniqueness, manifest references, digest inputs, and diagnostics. Preserve the original input only in internal non-secret test context; public diagnostics use the safe normalized location or an input-field location, not arbitrary content.

Use a branded/read-only canonical path type so consumers cannot accidentally pass host absolute paths. Do not use `path.resolve()` as proof of logical package validity; its host-dependent behavior is unsuitable for the canonical package contract.

### 2. Normalize caller-provided entries without filesystem authority

Expose a pure `normalizePackageInventory(entries, limits)` operation that receives entry descriptors and bytes already supplied by its caller. It must:

- validate the entry kind as regular data and validate declared byte length against supplied bytes;
- canonicalize each logical path once;
- enforce count, per-entry, aggregate-byte, depth, and content-scan limits before handing data to other validators;
- reject canonical-path collisions and return a deterministic immutable inventory ordered lexicographically by canonical path; and
- preserve bytes as opaque data. No content execution, type-based loading, archive extraction, symlink following, or network request is permitted.

If tests need extraction-like coverage, implement only a test helper with an explicit root. It must use non-following metadata inspection and verify containment of every resolved target; production APIs remain inventory-in/inventory-out.

### 3. Validate manifest-to-inventory structure

Implement `validatePackageStructure(manifest, inventory, limits)` in `src/validate/structure.ts`. It consumes the canonical manifest from section 02 and normalized inventory from this section. Check:

- the authoritative `app.manifest.yaml` entry is present exactly once;
- every manifest-referenced component source and declared package-section file resolves to a normalized regular entry;
- component IDs are nonempty stable identifiers and unique;
- every component kind is in the known registry/schema supplied by section 02, while the registry remains extensible through that contract;
- manifest declarations do not create ambiguous references after the shared path policy; and
- declared package sections accurately describe required files that are actually present.

Return V2 diagnostics using section 01's stable shape (`stage`, `code`, `severity`, safe `location`, non-sensitive message). Add stable structural codes to the section-01-owned code union, using names such as `PACKAGE_PATH_INVALID`, `PACKAGE_PATH_COLLISION`, `PACKAGE_ENTRY_INVALID`, `PACKAGE_LIMIT_EXCEEDED`, `PACKAGE_REFERENCE_MISSING`, `COMPONENT_ID_DUPLICATE`, `COMPONENT_KIND_UNKNOWN`, and `PACKAGE_SECTION_INVALID`. The exact names must be centralized and tested; no raw parser exceptions may escape.

### 4. Freeze the handoff contract

The structural result must expose: the canonical manifest reference, immutable sorted entries, a path lookup keyed by canonical path, validated component/file reference facts, deterministic V2 diagnostics, and any limit accounting needed by later bounded scanners. It must not calculate a digest, resolve external dependencies, assess runtime availability, or scan secrets. Section 04 receives component/capability declarations and their normalized source/reference facts from this result.

## Acceptance criteria

- A valid package inventory and manifest references produce a stable immutable V2 structural result independent of host path separators and input enumeration order.
- No absolute/traversal/control/ambiguous/colliding path, symlink escape, non-regular entry, duplicate component ID, missing reference, or limit overflow is accepted.
- All structural failures are stable, safely located diagnostics with no package content disclosure.
- The structural API never executes package content or derives execution authority from paths, names, or extensions.
- Section 04 can build its graph solely from the canonical manifest plus this normalized structural result; no later section re-implements path normalization.

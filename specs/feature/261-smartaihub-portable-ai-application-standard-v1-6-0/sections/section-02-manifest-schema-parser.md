# Section 02 — Manifest Schema and Safe Parser

## Purpose and boundary

Implement the deterministic, bounded parser for the authoritative SPAAS `app.manifest.yaml` contract. It converts untrusted YAML (and JSON only if deliberately supported by the same public API) into the canonical `SpaasManifest` contract from Section 01, or returns stable safe diagnostics. It validates known Spec 261 core semantics and performs explicit API/schema, feature, and extension negotiation.

The parser is offline and pure. It must not read a package directory, follow symlinks, execute tags/modules/scripts, resolve a registry/provider, or validate package references. Package inventory/structure begins in Section 03; graph/security/digest/pipeline work begins in later sections.

## Prerequisite and owned files

This section depends on Section 01, whose public types, diagnostic vocabulary, limits, and package ESM boundary must be present and stable.

| File | Responsibility |
| --- | --- |
| `packages/spaas-standard/src/schema/manifest.ts` | Strict Zod schemas for known core SPAAS manifest semantics and explicitly governed extension containers. |
| `packages/spaas-standard/src/schema/index.ts` | Internal schema exports consumed by the parser; avoid exposing an accidental second public contract. |
| `packages/spaas-standard/src/parser.ts` | Bounded YAML/JSON decoding, ambiguity rejection, schema conversion, canonicalization, and compatibility negotiation. |
| `packages/spaas-standard/src/canonicalize.ts` | Deterministic semantic normalization for manifest values and preserved safe optional extension data. |
| `packages/spaas-standard/src/index.ts` | Add only the deliberate parser API exports. |
| `packages/spaas-standard/tests/manifest-parser.test.ts` | Test-first fixture and adversarial parser/compatibility coverage. |
| `packages/spaas-standard/tests/fixtures/manifest-valid.yaml` | Minimal valid Phase A fixture with representative typed core fields. |
| `packages/spaas-standard/tests/fixtures/manifest-valid-reordered.yaml` | Semantically equivalent fixture that proves canonical output is independent of YAML map ordering. |

Do not modify package structure/path validation files, graph/security/digest/pipeline files, app code, persistence, or runtime adapters.

## Tests first

Create `packages/spaas-standard/tests/manifest-parser.test.ts` and its small fixtures before parser implementation. Use the public parser entrypoint and assert result values/codes, never raw implementation exceptions. Cover all cases below.

1. A valid manifest with `apiVersion`, `kind`, `metadata`, `compatibility`, and representative declared package sections/components parses to the expected canonical typed model.
2. Semantically identical YAML map ordering yields an equivalent canonical model. Canonicalization must not rely on source object insertion order.
3. Missing required fields, invalid field types/enums, invalid identifiers/versions, malformed component declarations, and unsupported API/schema versions fail with deterministic code, stage, JSON-pointer-like location, severity, and safe explanation.
4. Reject malformed YAML, duplicate mapping keys, multiple YAML documents, aliases, custom tags, ambiguous constructs, non-JSON-compatible scalar/object values, non-finite numbers, invalid UTF-8, and parser inputs exceeding byte, nesting, or node limits. Assert the failure is a safe parser/limit diagnostic rather than a leaked dependency exception.
5. A supported required feature succeeds. An unsupported required feature fails closed. A supported optional feature succeeds. An unsupported optional feature is retained only when its declaration contains the explicit safe fallback/omission assertion; otherwise it fails closed.
6. A known extension is validated against its declared namespace/version/criticality policy. Unknown `required` and `security_critical` extensions fail closed. An unknown optional extension is preserved without execution only when safe omission is explicit. An unsafe optional declaration fails closed. Unknown security-relevant fields cannot be silently discarded.
7. Extension containers cannot override core security semantics. Conflicting declarations for the same namespace/version identity fail deterministically.
8. Parser diagnostics and serialized result output do not include a deliberately inserted secret-like value, arbitrary manifest source substring, raw YAML error dump, stack trace, or entire input document.
9. Parser behavior is caller-contextual: the same manifest receives different compatibility diagnostics when an explicit support context changes. The parser must not call a network/provider/registry to manufacture support facts.
10. The public result is discriminated: success exposes the canonical manifest and no failure payload; failure exposes ordered diagnostics and no partially trusted manifest.

Use boundary-value cases for each named limit from Section 01: exactly at the allowed threshold is handled predictably, and one unit over returns the stable resource-limit diagnostic. Run only `pnpm --filter @smartspec/spaas-standard test` for focused verification; no repository-wide typecheck.

## Schema contract

Use existing `zod` and `js-yaml` workspace-compatible dependencies only when the new package needs them. Configure YAML decoding for JSON-compatible data, then apply strict Zod validation; do not use permissive parsing followed by silent stripping.

The schema must model these known core portions explicitly:

- `apiVersion`: supported SPAAS API identifier/version.
- `kind`: valid SPAAS application kind.
- `metadata`: stable application identity, name, slug, version, optional description/labels/annotations under documented safe value restrictions.
- `compatibility`: minimum platform version, manifest schema version, `requiredFeatures`, `optionalFeatures`, and explicit optional-feature fallback/omission metadata.
- Declared package sections and component declarations sufficient for Section 03 to cross-check IDs and file references. This parser validates shape, identifiers, and duplicates; it does not read the referenced files.
- `requires`, `security`, and privacy-related known core containers sufficiently typed to prevent an extension or unknown object from masquerading as core security semantics.
- `extensions`: namespaced declarations containing version/schema identity, criticality, config, owner/authority information where declared, and explicit safe-omission terms for unknown optional data.

Preserve forward-compatible data only through a separate, controlled representation. Known core objects are strict. Do not silently accept typoed core keys as opaque optional data. Unknown top-level/core fields fail unless the manifest's explicit extension/preservation policy identifies them as safe, optional, and non-security-relevant.

## Parser API and behavior

Expose one small public API from `src/index.ts`, for example a `parseSpaasManifest(input, supportContext, limits?)` function with a field-only input contract for bytes/text plus declared source format. The exact name may follow local code style, but it must:

- accept only explicit bytes/text, `ManifestSupportContext`, and bounded-limit overrides defined in Section 01;
- return the Section 01 discriminated parser result rather than throwing raw YAML/Zod errors for untrusted input;
- normalize successful results into the canonical `SpaasManifest` deterministically;
- report stable diagnostics with `stage` set to schema/manifest validation and normalized JSON-pointer-like locations;
- keep error explanations useful but source-free and secret-safe.

Parsing sequence:

1. Enforce input byte and encoding limits before decoding.
2. Detect/accept the explicitly supported source format. For YAML, reject anything outside a single JSON-compatible document: duplicate keys, aliases, tags, multiple documents, and resource-amplifying/ambiguous forms. If JSON input is supported, apply the same finite-number, depth/node, and strict-shape requirements.
3. Walk decoded data with bounded depth/node accounting before or while schema validation so adversarial nesting cannot cause uncontrolled work.
4. Validate known core fields with strict schemas, including duplicate IDs and extension identity conflicts that are observable within the manifest.
5. Canonicalize semantic values: stable key ordering where representation needs it, normalized identifier/version representation according to the documented schema, validate declared package-reference fields as relative-path-shaped strings with canonical `/` separators without rewriting or resolving them, and controlled retention of safe unknown optional extension data. Section 03's sole `paths.ts` policy performs actual normalization and inventory matching. Preserve semantic identity; do not invent defaults that change package meaning.
6. Evaluate schema/API/feature/extension support only against the supplied support context. Emit fail-closed diagnostics for unsupported schema versions, required features, required extensions, security-critical extensions, unsafe optional omissions, and unknown security semantics.
7. Deterministically sort diagnostics by normalized location, code, and stable tie-breakers before returning a failure.

`canonicalize.ts` must define and document which fields are semantically ordered lists versus set-like lists. Do not sort a list where order is part of application meaning. It owns semantic-object canonicalization only and must not normalize package paths. The later digest section will consume canonical semantic manifest data so YAML formatting and map ordering do not change the digest.

## Diagnostics and fail-closed rules

Use the diagnostic/stage contracts from Section 01. Assign distinct stable codes for malformed syntax, duplicate key, unsupported YAML construct, invalid UTF-8, resource limit, schema violation, unsupported API/schema, unsupported required feature, unsafe optional feature, unsupported required/security-critical extension, unsafe optional extension, and prohibited core-security override.

Never echo values from raw YAML, Zod/YAML exception messages, source snippets, or unknown extension configs in diagnostics. A path such as `/compatibility/requiredFeatures/0` and a safe statement of the violated rule are sufficient. Unknown optional data may be preserved only as unexecuted canonical data; preservation is not execution, validation success, or a claim of portability.

## Acceptance criteria

- The parser produces a canonical typed manifest for the valid fixture and deterministic safe diagnostics for all rejection/negotiation cases.
- Untrusted YAML/JSON cannot cause code execution, tag construction, alias expansion, uncontrolled nesting/work, network access, or raw-input disclosure.
- Supported behavior is chosen entirely from explicit support context; no platform/provider/registry fact is guessed or remotely resolved.
- Required and security-critical unknown semantics always fail closed. Optional unknown data survives only under explicit safe-omission policy and remains marked unexecuted.
- Strict known-core schemas prevent typos or extension data from weakening identity, compatibility, security, or privacy declarations.
- The parser public API remains pure and is exported through the package entrypoint without exposing raw parser exceptions.

## Handoff and verification boundary

Section 03 consumes the canonical manifest and uses its typed declarations to validate the supplied package-entry inventory and references. Sections 04–07 consume the same diagnostic, compatibility, and canonical-manifest contracts; none may reinterpret feature/extension negotiation independently.

Run focused package tests and `git diff --check`. Do not claim filesystem safety, dependency resolution, secret scanning, digest stability, V1–V8 report composition, provider support, runtime feasibility, migrations, marketplace checks, or deployment proof from this parser section.

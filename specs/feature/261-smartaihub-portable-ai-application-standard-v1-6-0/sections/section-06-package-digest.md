# Section 06 — Versioned Canonical Package Digest

## Purpose and boundary

Implement the deterministic offline content identity for a Spec 261 Phase A SPAAS package. The digest identifies one canonical manifest plus one normalized package inventory using SHA-256 and a versioned, unambiguous byte framing. It is local integrity evidence only: it does not verify a signature, trust an attestation, resolve dependencies, access a registry, perform secret scanning, or establish production admission.

The API receives canonical values from sections 02–03. It must not enumerate a host directory, use absolute paths, read timestamps/permissions, follow symlinks, execute content, contact a network service, or accept caller-defined exclusions. A deterministic digest may be computed for inspection before V4 completes, but section 07 must not accept a failed or incomplete secret scan as a secret-free release.

## Dependencies and handoff

- **Requires section 01:** public digest/result types, common limits, stable diagnostic contract, and package exports.
- **Requires section 02:** canonical manifest semantic representation. YAML formatting, map order, comments, and line endings must not become manifest digest inputs.
- **Requires section 03:** immutable lexicographically sorted entries with canonical relative paths, opaque exact bytes, collision-free path policy, and bounded inventory accounting. Do not re-normalize raw paths.
- **Coordinates with section 05:** secret-reference identifiers remain canonical manifest semantics and are included. Resolved secret values and external binding material are outside the package input and must never be received by this module.
- **Blocks section 07:** return digest algorithm/version, digest string, included-entry facts, and deterministic exclusion decisions for V1–V8 report composition.

### Owned implementation and test files

- Create `packages/spaas-standard/src/digest.ts`.
- Update `packages/spaas-standard/src/model.ts` only for public digest input/result/exclusion types and centralized diagnostic codes agreed by section 01.
- Update `packages/spaas-standard/src/index.ts` to export the stable digest API and types.
- Create `packages/spaas-standard/tests/package-digest.test.ts` with in-memory golden vectors.
- Keep digest framing/exclusion documentation in this section and expose policy constants from `src/digest.ts`; section 07 owns the package README and must document this API without redefining its algorithm.

## Tests first

Write the Vitest suite before the digest implementation. Use literal test bytes and a fixed expected SHA-256 vector calculated from the documented framing, not a value re-derived by the implementation under test.

1. **Golden v1 vector:** one canonical manifest and at least two ordinary entries produce the exact `spaas-package-v1:sha256:<lowercase-hex>` result. The fixture exercises path length and content length framing so concatenation ambiguities would change the expected vector.
2. **Manifest semantic invariance:** equivalent canonical manifests obtained from YAML with different indentation, comments, key order, and newline convention produce the same digest. Changing a semantic manifest value, including a manifest secret-reference identifier, changes the digest.
3. **Inventory invariance:** permuting caller entry order, changing a caller's host absolute root, source separator representation already normalized by section 03, timestamps, permissions, or executable metadata does not change the digest.
4. **Included-content sensitivity:** changing an included canonical path, byte length, or one byte of an ordinary entry changes the digest. `app.lock.json` is included and any change to it changes the digest.
5. **Fixed exclusions only:** `.git` metadata and the documented self-referential signature/attestation envelope are excluded and appear in a deterministic exclusion report. A normal file under `provenance/`, a file merely named like an attestation, or any caller-supplied exclusion request remains included or is rejected; it must never be silently omitted.
6. **No arbitrary exclusions:** the public input type has no exclusion callback/list. Runtime attempts to supply one are rejected with a stable diagnostic. Exclusion classification is path-based and fixed by the versioned contract, not inferred from content, extension, size, or a secret-like filename.
7. **Secret boundary:** external resolved secret/binding values cannot be supplied to the digest API. A canonical manifest secret-reference identifier remains included and changes the digest when changed. Pair this with section 05's failed-scan fixture to prove that no sensitive file is silently excluded to obtain a clean digest.
8. **Deterministic errors and purity:** duplicate/noncanonical/over-limit inventory input is rejected through stable diagnostics rather than hashing an ambiguous package. The digest module does no filesystem, network, process, package loading, logging, or content execution.

Run the suite directly and with the package-scoped test command. Do not run repository-wide typecheck.

## Implementation plan

### 1. Freeze the digest input and result contract

Expose a pure operation such as `computePackageDigest({ manifest, inventory }): PackageDigestResult`. `manifest` is section 02's canonical semantic value/UTF-8 canonical serialization; `inventory` is section 03's immutable normalized entry list. Reject raw manifest text, host paths, mutable directory handles, exclusion lists, callbacks, secret-resolution objects, and arbitrary metadata at this boundary.

Return an immutable result with algorithm/version, `digest` formatted exactly as `spaas-package-v1:sha256:<64 lowercase hex characters>`, included canonical paths/counts needed for audit, and a deterministic exclusion report containing only canonical path plus fixed exclusion reason. Do not publish file bytes, arbitrary metadata, secret values, or a content-derived per-file hash in that report.

### 2. Specify and implement canonical v1 framing

Use Node's built-in `node:crypto` SHA-256 implementation. Feed the hash the following exact byte sequence; all text is UTF-8 and integer lengths are unsigned big-endian:

1. `UTF8("spaas-package-v1\\0")` once as the domain/version separator.
2. The canonical manifest commitment: `UTF8("manifest\\0")`, then `u64be(manifestCanonicalUtf8.byteLength)`, then `manifestCanonicalUtf8`.
3. For every included inventory entry in ascending bytewise canonical-path order: `UTF8("entry\\0")`, then `u32be(pathUtf8.byteLength)`, then `pathUtf8`, then `u64be(entry.bytes.byteLength)`, then the exact entry bytes.
4. `UTF8("end\\0")` once after the last entry.

Validate safe integer/length bounds before encoding a frame. The `manifest` entry is committed once by its canonical semantic bytes, never again by its source YAML/JSON bytes. Every other included entry uses exact supplied bytes; no generic newline/media/content canonicalization is allowed in v1. This makes an entry boundary, path boundary, and empty file unambiguous while retaining semantic manifest equivalence.

Sorting uses the canonical path policy from section 03 and a locale-independent bytewise comparator. Defensive revalidation must reject duplicate/noncanonical order or path collisions rather than selecting a winner. The result must have no dependency on filesystem enumeration order, absolute roots, path separators, timestamps, mode bits, ownership, locale, or platform.

### 3. Use one closed exclusion policy

Implement `classifyDigestExclusion(canonicalPath)` as a closed, exported-for-test policy with exactly these version-1 exclusions:

- `.git` and descendants, reason `vcs_metadata`; and
- `provenance/signatures` and descendants, reason `self_referential_attestation_envelope`.

The signature/attestation envelope is excluded because it may bind or sign the resulting package digest; it cannot be part of the bytes it recursively attests. This is a path-only rule. It does not exclude all provenance, all generated files, hidden files, caches, `.env` files, or arbitrary files named `signature`/`attestation`. `app.lock.json`, manifest secret-reference identifiers, normal provenance/SBOM/build files, and every other normal package entry remain included.

There is no user option, manifest field, environment variable, or callback to add/remove exclusions. If an API boundary receives undeclared exclusion data, reject it with `DIGEST_EXCLUSION_UNSUPPORTED`; never ignore it. Return every fixed exclusion in sorted order. Section 05 reports/rejects secret-bearing package content; this module must not omit it based on a filename or scanner result.

### 4. Make errors safe and composable

Centralize stable codes such as `DIGEST_INPUT_INVALID`, `DIGEST_LIMIT_EXCEEDED`, and `DIGEST_EXCLUSION_UNSUPPORTED` in the section-01 diagnostic union. Diagnostics use safe canonical paths and fixed messages. Do not stringify an entry, manifest, unknown option, or exception into a diagnostic or log.

Fail before hashing when any required canonical input is absent, malformed, ambiguous, duplicate, exceeds digest framing limits, or conflicts with the closed policy. No partial digest is authoritative. The module remains synchronous or async only as needed by the package's existing public contract; it must be deterministic either way and may depend only on Node built-ins plus sections 01–03 types/helpers.

### 5. Define the security and validation handoff

Digest computation establishes reproducible package identity, not secret safety. A changed secret-reference identifier is a semantic manifest change and must change the digest; an external secret binding's resolved value is deliberately unavailable here and cannot influence it. Do not encode raw secrets into an attestation, exclusion report, diagnostic, or digest input.

Section 07 combines this result with section 05: a V4 failure/incomplete scan prevents a package from being represented as a secret-free valid release even when this module returned a deterministic inspection digest. Signature verification, signer trust, provenance trust, and release admission remain outside this section and must be `not_evaluated` until their explicit contexts exist.

## Acceptance criteria

- The documented v1 framing yields a stable golden SHA-256 digest across supported hosts and input enumeration orders.
- Equivalent manifest semantics yield the same digest; every semantic manifest change, included path change, or included-byte change yields a different digest.
- Only the two closed path policies above are excluded and every exclusion is deterministically reviewable. `app.lock.json` and manifest secret-reference identifiers are included.
- Resolved secret values, host metadata, filesystem state, arbitrary exclusions, execution, network access, and signature/trust claims are outside the API.
- Invalid/ambiguous/over-limit input fails with stable non-sensitive diagnostics; no caller can create a malleable digest through silent exclusions.

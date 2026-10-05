# Section 05 — Secret Scanning and Redacted Security Findings

## Purpose and boundary

Implement V4's local secret-safety check for the Spec 261 Phase A SPAAS package. The scanner consumes the immutable normalized inventory from section 03 and inspects bounded caller-supplied bytes as data only. It detects embedded credentials and sensitive file paths, distinguishes portable secret references from literal material, and returns deterministic redacted findings.

The scanner must not execute, import, parse as executable configuration, follow links, enumerate a filesystem, evaluate YAML tags, invoke scripts, contact a URL, resolve a secret, or mutate the manifest/inventory. It is a local static check, not proof of secret-store authorization, key validity, credential ownership, runtime secret binding, or production admission.

## Dependencies and handoff

- **Requires section 01:** stable diagnostic/result types, severity and stage conventions, public limits, deterministic ordering, and exports.
- **Requires section 03:** immutable sorted regular-file inventory, canonical paths, byte/count accounting, and structural diagnostics. Do not accept raw paths or ambient filesystem access.
- **Consumes section 02 output when available:** canonical manifest declarations identify approved secret-reference/binding fields. A reference identifier is data that remains permitted; only an embedded credential value is a V4 failure.
- **Blocks section 07:** return a deterministic V4 security result with redacted findings and explicit scan-completeness facts. Section 07 alone composes the stage report and overall status.

### Owned implementation and test files

- Create `packages/spaas-standard/src/validate/secrets.ts`.
- Update `packages/spaas-standard/src/model.ts` only to add the public secret-scan input/result/finding types and centralized diagnostic codes agreed by section 01.
- Update `packages/spaas-standard/src/index.ts` to export the finalized scanner API and public types only.
- Create `packages/spaas-standard/tests/secret-scanning.test.ts` with in-memory canonical inventory fixtures.

## Tests first

Write the focused Vitest suite before implementing the scanner. Fixtures contain synthetic secrets solely in test memory. Assertions must never print those values or place them in snapshots.

1. **Representative credential detection:** a text entry containing a PEM private-key boundary, a high-confidence API/token assignment, or another documented credential class produces one V4 error finding with canonical path, rule ID, severity, code, and safe location. Cover quoted and unquoted assignment forms without depending on one provider's token format.
2. **Sensitive-path detection:** `.env`, `.env.local`, a private-key filename/extension, and explicitly named credential/secret files produce deterministic sensitive-path findings even when content inspection is unnecessary. A benign filename that merely contains an unrelated word must not match unless it meets the documented path rule.
3. **Declared references are allowed:** manifest fields that contain a declared secret/binding reference identifier, and ordinary non-secret identifiers named `secretRef` or `bindingRef`, do not produce an embedded-material finding. A literal credential placed in an otherwise valid reference field still produces a finding.
4. **Non-disclosure:** serialize the result and diagnostics for each detected test fixture. Assert the literal secret, a substring of it, source line/column excerpt, byte encoding, and a hash derived from the matched value are absent. Findings contain only `path`, `ruleId`, `severity`, stable code, and a non-sensitive location/message.
5. **Binary and text classification:** binary entries are not decoded as text or regex-scanned. They remain subject to sensitive-path detection. Valid UTF-8 text is scanned deterministically; invalid UTF-8/text-classification ambiguity fails closed with a stable scan diagnostic rather than exposing bytes.
6. **Boundaries:** accept text entries exactly at per-entry and aggregate scan budgets. Exceed either budget, nesting/work budget, or configured finding cap by one unit and return a deterministic `SECRET_SCAN_LIMIT_EXCEEDED` failure before unbounded work. Do not silently truncate a file and claim V4 passed.
7. **Determinism and immutability:** permuting inventory input produces identical ordered findings and serialized diagnostics. The scanner does not mutate entry bytes, paths, canonical manifest data, or structural accounting.
8. **Pure boundary:** prove the implementation performs no filesystem/network/process/module-loading action and never logs raw entry bytes. Entries named `workflows/` and script-looking text are scanned as inert bytes only.

Run the suite directly and with the package-scoped test command from the workspace package. Do not run repository-wide typecheck.

## Implementation plan

### 1. Define a deliberately small, inspectable detection contract

In `src/validate/secrets.ts`, define immutable `SecretScanRule` metadata with a stable rule ID, severity, matcher category, and non-sensitive description. Rules must be finite, local, versioned with the package contract, and evaluated in declared order. Start with these high-confidence classes:

- `SECRET_PATH_ENV_FILE` for exact `.env` and documented environment-file variants that can carry values;
- `SECRET_PATH_PRIVATE_KEY` for conventional private-key names/extensions;
- `SECRET_PATH_CREDENTIAL_FILE` for explicitly designated credential/secret filenames;
- `SECRET_PRIVATE_KEY_PEM` for private-key PEM boundaries; and
- `SECRET_CREDENTIAL_ASSIGNMENT` for a named credential/token/password/key assignment whose value has a high-confidence credential shape.

Do not add a heuristic that guesses from arbitrary entropy, hashes matched text, or records snippets. The contract must prefer a bounded false positive over accepting an uninspectable likely credential. Keep rule names, path matching, value-shape thresholds, and case policy in source beside tests so a future rule change is a reviewable contract change.

### 2. Scan only normalized bounded inputs

Expose a pure operation such as `scanPackageSecrets(structuralResult, options?): SecretScanResult`. It receives section 03's canonical sorted entries and, when required for reference classification, section 02's canonical manifest/reference facts. It must use canonical paths and named maximums for scanned text bytes per entry, total text bytes, rule evaluations, and returned findings.

For each entry, first apply path-only rules without reading content. Then classify its bytes conservatively: binary data is never coerced into JavaScript text for regex inspection; valid UTF-8 text is scanned only within the declared budget. Invalid UTF-8 or a limit overflow that prevents a required scan yields a stable V4 failure. Never skip an oversized text candidate, silently truncate it, or treat missing scan evidence as clean.

Do not make the scanner a general parser. It may inspect plain bytes/text only. It must neither resolve environment substitution nor evaluate templates, YAML, JSON, shell, source code, archives, or package modules.

### 3. Preserve reference semantics without accepting values

Use the canonical manifest model's typed secret-reference/binding locations from section 02. A reference is an opaque identifier such as a managed-secret or authorization-binding reference; it is retained for portability and is not a raw credential. It must not be removed, normalized into a value, or reported merely because its field name includes `secret`/`binding`.

The exemption is structural, not textual: only an allowed canonical reference location and reference-shaped identifier qualify. A literal credential in that field, a private key embedded anywhere, or a token assignment in a package entry remains an error. The scanner never resolves a reference or receives the resolved value. Unsupported security-critical reference semantics remain a section-02 fail-closed concern and must not be hidden by V4.

### 4. Return redacted, deterministic V4 evidence

Return an immutable `SecretScanResult` containing `findings`, `diagnostics`, scan accounting, and a completeness/verdict value. A finding may expose only:

- the canonical logical path;
- the stable rule ID and stable diagnostic code;
- severity and V4 stage; and
- a JSON-pointer-like field/path location that identifies the declaration without quoting its value.

Never expose a matched value, source excerpt, line content, byte offset that can reconstruct the value, value length when it would materially aid reconstruction, encoded bytes, or a digest/hash of a matched secret. Use a fixed non-sensitive message per rule. Sort results by canonical path, rule ID, safe location, then code. Deduplicate identical `(path, ruleId, location)` findings so repeated matching expressions cannot make output depend on regex traversal.

Add centralized codes such as `SECRET_EMBEDDED`, `SECRET_SENSITIVE_PATH`, `SECRET_SCAN_LIMIT_EXCEEDED`, and `SECRET_SCAN_INPUT_INVALID` to the section-01-owned union. A raw decoder/regex exception must become one of these stable diagnostics; it must never escape or be logged with package content.

### 5. Define the validation and digest handoff

V4 fails when any secret finding or scan-completeness failure is present. It passes only when every required eligible entry was scanned within bounds and no findings exist. This result is local evidence only; it cannot mark external secret storage, bindings, rotation, revocation, or runtime policy as passed.

Section 06 computes content identity from section 03's inventory and section 02's canonical manifest; it must retain secret-reference identifiers as manifest semantics. The pipeline in section 07 must not treat a package with failed/incomplete V4 as an acceptable secret-free release, even if a deterministic inspection digest was computed. No API may pass raw secret bytes or resolved binding values into a digest, report, log, or public result.

## Acceptance criteria

- Common embedded private keys, high-confidence credential assignments, and documented sensitive paths fail V4 with stable redacted findings.
- Valid declared secret/binding references remain portable identifiers and do not trigger a value finding; resolved secret material never enters this package API.
- Every result, error, snapshot, and serialized report excludes values, snippets, encodings, and value-derived hashes.
- Binary/invalid/oversized inputs obey explicit bounded policy and never become an unscanned V4 pass.
- Output is immutable and deterministic across input enumeration; the scanner is pure and non-executing.

# SPEC-310 Pi Provenance and Compatibility Research

**Method:** read-only upstream metadata and static artifact inspection on
2026-10-22. The Windows executable and npm package were downloaded only to
`/tmp`, hashed, and inspected as archives/metadata; no Pi binary, installer,
package script, or production host was executed or modified.

## Exact upstream identity and artifact checks

| Item | Evidence |
|---|---|
| Project/release | `earendil-works/pi`, release/tag `v1.0.3`, published 2026-10-05. GitHub tag resolves directly to commit `d78dc83d633229d12f8b79631384c4c2717c399f`; GitHub reports the tag commit unsigned. |
| Windows x64 release asset | `pi-windows-x64.zip`, size 45,050,113 bytes. GitHub API digest and independently computed SHA-256 both equal `6cddc3d11210539faa7ba0188504813f2f3ae6d8f93a161d4145cc61a8bdd5de`; the upstream `SHA256SUMS` entry also verifies. ZIP contains `pi.exe` (111,047,168 bytes), `native/win32/prebuilds/win32-x64/win32-platform.node`, and `photon_rs_bg.wasm`. Static PE inspection: AMD64 (`0x8664`), PE32+ (`0x20b`), no Authenticode certificate table. |
| npm package | `@earendil-works/pi-coding-agent@1.0.3`, MIT metadata, Node engine `>=22.19.0`, package tarball SHA-512 `b7695bd1dc38cbf8ebe5ad8f468e9e4c719364e3c1dff600315ca1858142d56dc7979c44fb8eb623f80c5a31788022ee8468a93447ee36a38d16676a2c5cf849`. Local tarball hash matches the npm SLSA provenance subject. |
| Provenance | npm registry returned a Sigstore bundle with npm publish attestation and SLSA provenance (`https://slsa.dev/provenance/v1`), one Rekor entry, source `https://github.com/earendil-works/pi`, workflow `.github/workflows/build-binaries.yml`, ref `refs/tags/v1.0.3`, source commit `d78dc83d633229d12f8b79631384c4c2717c399f`, and GitHub-hosted runner invocation `37283145663/attempts/1`. `npm audit signatures` on an isolated temporary install reported 120 verified registry signatures and 36 verified attestations. This verifies the npm package chain in that test; it does **not** attest the standalone Windows ZIP. |
| Release build workflow | Tag push starts a pinned GitHub Actions workflow; it sets up Bun `1.3.14` and Node `22`, builds release binaries from the source archive, creates `SHA256SUMS`, then runs binary smoke tests on `windows-latest`. The recorded run for the exact tag commit is successful. The inspected workflow has no standalone-binary SLSA attestation or Authenticode signing step. |

## Package, license, SBOM and dependency requirements

- The npm package declares `MIT` and pins its own dependency graph through the
  release's `pi-coding-agent-install-package-lock.json`. Runtime dependencies
  include the five `@earendil-works/*` Pi packages at `^1.0.3`, plus the exact
  package versions recorded in its `package.json`; the native Windows asset
  also contains a `.node` prebuild and WASM payload. Certification must archive
  the exact lock and produce a dependency/license inventory for the full
  closure, including native components.
- No SPDX/CycloneDX SBOM asset was present in the observed release payload or
  npm package file list. Treat SBOM as missing and generate/approve one before
  managed installation. Do not infer transitive license compliance from the
  root `MIT` field.
- The Git tag is unsigned, and the release workflow supplies checksums but no
  provenance attestation or code signature for the Windows ZIP/EXE. The
  matching checksum proves byte identity against the published checksum, not
  trusted build provenance. Require independently verifiable binary
  provenance and an approved signing policy before certification.

## Windows x64 runtime compatibility

- The npm package requires Node `>=22.19.0`; use a private, side-by-side
  Node runtime at a certified version if embedding the JS SDK. Do not mutate
  system/global Node or project dependencies.
- The standalone Windows x64 ZIP contains a Windows AMD64 executable and native
  `.node`/WASM assets; upstream runs its binary smoke workflow on
  `windows-latest`. This is upstream smoke evidence only, not SmartAIHub Runner
  compatibility, permission isolation, update/rollback acceptance, or a
  production install proof.
- Upstream Windows guidance says native Windows uses Git Bash for its default
  `bash` tool, with PowerShell optional. That is incompatible with treating
  default Pi tools as governed Native capabilities. A Harness adapter must
  suppress unrestricted built-in `bash`/`write`/`edit` tools and expose only
  individually granted tool ports. Git remains optional for general work.

## SmartAIHub Gateway adapter compatibility

- Pi v1.0.3's provider type includes `openai-responses` and
  `openai-completions`; its custom provider/SDK surface can use a compatible
  endpoint or an extension. SmartAIHub exposes `/v1/responses` and
  `/v1/chat/completions`; the Python OpenAI Agents gateway adapter builds an
  `AsyncOpenAI` client against `/v1` and sends SmartAIHub attribution headers.
- Pi's upstream guidance says provider extensions execute inside Pi and can
  inspect credentials, prompts, tool declarations, responses and usage; its
  built-in OAuth provider stores credentials under `~/.pi/agent/auth.json`.
  Therefore the managed adapter must not place desktop or execution credentials
  in Pi's provider storage or expose a raw grant to extensions. Resolve
  per-attempt Gateway authority in the trusted Gateway adapter and pass only
  bounded model events/usage references across the port.
- This is **API-family overlap, not verified adapter compatibility**. No
  credential-backed Native Pi request, tool-call/event normalization, usage
  reconciliation, cancellation, or settled-credit receipt was exercised. The
  G1 contract therefore keeps a version-neutral `GatewayModelPort` and requires
  a small adapter that binds the per-attempt Gateway grant, tenant/actor/run
  attribution, usage receipt and deny-by-default egress. Direct Pi providers
  and provider fallback remain disabled.

## Certification decision

Research supports continuing with offline contract/fake work only. It does not
certify a Pi release for managed execution. Section 03 stays live-gated on
owner-approved provenance/signature/SBOM, certified Windows/Node ABI, isolated
non-production authority, Gateway test credentials, real usage/settlement and
runtime pin/rollback evidence. Runtime feature flag remains off.

### Sources

- [Pi v1.0.3 release](https://github.com/earendil-works/pi/releases/tag/v1.0.3)
- [Pi v1.0.3 package metadata](https://github.com/earendil-works/pi/blob/v1.0.3/packages/coding-agent/package.json)
- [Pi v1.0.3 Windows guidance](https://github.com/earendil-works/pi/blob/v1.0.3/packages/coding-agent/docs/windows.md)
- [Pi v1.0.3 custom provider guide](https://github.com/earendil-works/pi/blob/v1.0.3/packages/coding-agent/docs/custom-provider.md)
- [Pi v1.0.3 model API types](https://github.com/earendil-works/pi/blob/v1.0.3/packages/ai/src/types.ts)
- [Pi v1.0.3 binary release workflow](https://github.com/earendil-works/pi/blob/v1.0.3/.github/workflows/build-binaries.yml)
- [npm provenance attestation endpoint](https://registry.npmjs.org/-/npm/v1/attestations/@earendil-works%2fpi-coding-agent@1.0.3)

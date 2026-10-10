# SPEC-208 W4 Independent Moli Advisory and Provenance Recheck — 2026-10-10

## Scope and disposition

- Assigned starting SHA: `06068ae9db6c433b9a10353f71f2becdba18218e`.
- Latest fetched `origin/main` during review: `b3267afed557162c49cfa5894e634ca0d1d461a3`; this worktree is six commits behind it. The intervening commits include an unrelated W1 evidence update; the Moli runtime source files checked here are unchanged.
- Verdict: **W4 remains OPEN; production No-Go.** In this repository, Moli is an experimental adapter target pinned to v1.1.15, not a deployable production engine. `computerUseRunnerJobExecutor.ts` still sets `browserEngineConstraint: "chromium"`; Moli defaults and production flag are false; the adapter refuses production and requires runtime version `1.1.15`. No deployment artifact, Moli image/package reference, or production dispatch path is present in the reviewed repository. An external deployment inventory was not available, so deployments outside this repository cannot be ruled out.
- The 11 OSV records are **applicable to the v1.1.15 source/lockfile prototype graph** as package-version findings, with conditions/reachability qualifications below. They are **not applicable to the in-repository production job path**, which remains Chromium. This does not establish that an external deployment is unaffected.
- No binary was downloaded or executed during this refresh. No advisory was suppressed and no risk acceptance was inferred.

## Exact target and primary-source checks

The immutable Moli v1.1.15 tag resolves to commit `eaaf6f2dbfe26bf8de33387cd3ae6c31d0931a0e`. A GET of the raw `Cargo.lock` at that commit returned 152,068 bytes and SHA-256 `bc816c83f9a0a6bb5fb08497b3fb936ee1b86c524a6acd9cc5da8a29b7f329e5`, matching the repository's recorded lockfile digest. Parsing that lockfile confirmed `crossbeam-epoch 0.9.18`, `paste 1.0.15`, `rand 0.9.2` (also `rand 0.8.8`), `rustls 0.23.38`, `rustls-webpki 0.103.12`, `smallbitvec 2.6.0`, and `thin-vec 0.2.14`.

GitHub Releases API `GET /repos/lexmount/moli/releases/latest` returned v1.1.15, published `2026-10-07T15:56:35Z`, target commit `eaaf6f2...`. The API's x86_64 Linux asset digest is `sha256:f7c9455451bffd4d3a6353431b3596c1d18ad4d9fe6725d8d4033f6fff5fa59d`, matching the archive digest recorded in the Phase 0 evidence. The tag-ref API says the tag directly names the commit (not an annotated signed tag). Attestation endpoint GETs with both the raw digest and the `sha256:`-prefixed digest returned HTTP 404. Therefore release metadata and local hashes identify the recorded artifact but do not provide independently authenticated publisher provenance. The extracted-binary digest in Phase 0 was not re-measured in this read-only refresh.

A fresh latest-release lookup still returned v1.1.15; no fixed Moli release was found. Crate-level fixed versions listed below are available and currently not yanked in crates.io metadata (checksums are recorded below), but an unverified local lockfile edit would not remediate the published binary. A newly built Moli would require a lockfile/source change, rebuild, tests, artifact digest, and provenance tied to the resulting artifact.

## Advisory re-evaluation

The authoritative version query was against the OSV vulnerability API on 2026-10-10 for all 11 IDs shown below. Package versions were independently checked against the pinned upstream lockfile above. “Prototype status” describes version-range applicability, not proof that an exploitable call path is reachable in a particular platform build. The checked-in Cargo metadata/SBOM includes normal/build edges without platform/feature filtering.

| Advisory record(s) | Pinned package version | Prototype status and conditions | Remediation status |
| --- | --- | --- | --- |
| `RUSTSEC-2026-0204` | `crossbeam-epoch 0.9.18` | **Applicable** by version. Invalid-pointer dereference is in pointer formatting; the exact formatting call on an invalid pointer is not shown reachable from page input. | Fixed crate `0.9.20` exists and is not yanked; no Moli release/build with this fix verified. |
| `RUSTSEC-2024-0436` | `paste 1.0.15` | **Applicable as an unmaintained-crate notice**, not a security vulnerability. It is on the V8/proc-macro build graph and not itself a runtime page path. | No fixed version; replacement/removal in Moli not verified. |
| `GHSA-cq8v-f236-94qc`, `RUSTSEC-2026-0097` | `rand 0.9.2`; lock also has `rand 0.8.8` | **Applicable** to 0.9.2 by range; 0.8.8 is outside the affected 0.8 range (fixed at 0.8.6). Exploit conditions require particular enabled `log`/`thread_rng` features, a custom logger that calls `rand::rng()`, reseeding, and logging/entropy conditions; those conditions were not established for Moli. | Fixed crate `0.9.3` exists and is not yanked; no Moli release/build with this fix verified. |
| `GHSA-2mjx-qc3c-rqvc`, `RUSTSEC-2026-0285` | `rustls 0.23.38` | **Applicable** by version; CVSS 5.3 / Medium. TLS 1.3 handshake messages can be accepted across encryption-level boundaries. Actual exposed TLS client/server path and attacker-controlled peer path were not proven for a deployment. | Fixed crate `0.23.45` exists and is not yanked; no Moli release/build with this fix verified. |
| `GHSA-82j2-j2ch-gfr8`, `RUSTSEC-2026-0104` | `rustls-webpki 0.103.12` | **Applicable** by version; GHSA rates CVSS 7.5 / High. Malformed CRL BIT STRING can panic, but the source advisory says CRL checking is opt-in; Moli's CRL configuration and attacker-influenced CRL path were not established. | Fixed crate `0.103.13` exists and is not yanked; no Moli release/build with this fix verified. |
| `GHSA-97wc-2hqc-cjgr` | `smallbitvec 2.6.0` | **Applicable** by version; safe API integer overflow can produce heap-buffer overflow. The dependency graph includes Stylo/rendering, but input-triggerability and platform-feature reachability were not proven. Treat as high residual risk for an untrusted-page browser. | Fixed crate `2.6.1` exists and is not yanked; no Moli release/build with this fix verified. |
| `GHSA-xphw-cqx3-667j`, `RUSTSEC-2026-0103` | `thin-vec 0.2.14` | **Applicable** by version; panic while dropping elements may cause UAF/double-free in safe APIs. The package is in the DOM graph; a page-controlled panic/drop trigger was not proven. Treat as high residual risk for an untrusted-page browser. | Fixed crate `0.2.16` exists and is not yanked; no Moli release/build with this fix verified. |

For all seven unique issues / 11 records, in-repo production status is **not applicable because the production executor remains Chromium**; prototype dependency status is as shown. External-runtime deployment status remains **unresolved** without an inventory or image digest.

Crates.io version GETs (`GET /api/v1/crates/{crate}/{version}`) returned `yanked=false` for the following candidate pins. The registry checksums identify the exact crate archives, but do not establish that each upgrade is semver-compatible with Moli or passes its build/tests:

| Crate candidate | crates.io archive SHA-256 |
| --- | --- |
| `crossbeam-epoch 0.9.20` | `2d6914041f254d6e9176c01941b21115dcfb7089e55135a35411081bd106ef3f` |
| `rand 0.9.3` | `7ec095654a25171c2124e9e3393a930bddbffdc939556c914957a4c3e0a87166` |
| `rustls 0.23.45` | `0d41d731c7d2f962d1ccc364cec258de3c0e93b38c2fb3ba97ac74513048d634` |
| `rustls-webpki 0.103.13` | `61c429a8649f110dddef65e2a5ad240f747e85f7758a6bccc7e5777bd33f756e` |
| `smallbitvec 2.6.1` | `9b0e903ee191d8f7a8fbf0d712c3a1699d19e04ceba5ad1eb673053c7d938a09` |
| `thin-vec 0.2.16` | `259cdf8ed4e4aca6f1e9d011e10bd53f524a2d0637d7b28450f6c64ac298c4c6` |

## SBOM, licenses, notices, and source provenance

The existing CycloneDX 1.5 report inventories 626 components and 438 dependency relationships from Moli's normal/build graph. It is not tied cryptographically to a deployed binary and does not filter target-specific platform/features. The license-metadata inventory covers the same 626 metadata records, contains 40 distinct license-expression strings, and reports 3 missing package license fields (`moli-html-input-type`, `moli-url-policy`, `moli-window-features`). The pinned upstream root manifest says `MIT OR Apache-2.0`; the source also contains Chromium BSD and Selenium notices. Those facts do not establish license compatibility for every bundled dependency, font, fixture, or native asset. A complete per-platform notice bundle and legal review remain incomplete. W4 license closure is therefore **unresolved**.

The current release API's digest matched the previously recorded archive SHA-256, but no signature or artifact attestation was found. The raw root `Cargo.toml` and `license-metadata.json` were fetched from the immutable commit; their local response hashes were respectively `48aa1843855d046812baaa36628e978b2c06ba8f50dfda1e0b5febec83caa256` and `ca028237546876bd4ca633f1f8d71f12629e80ee95787cba465ef7ab15f6e2ba`. These are retrieval integrity notes, not publisher signatures. SBOM/source-to-binary reproducibility and the publisher build provenance remain unverified.

## Commands and outcomes

- `git fetch origin main`; `git rev-parse origin/main` → `b3267afed557162c49cfa5894e634ca0d1d461a3`. `git log 06068ae..origin/main -- <Moli source/evidence scopes>` showed only the W1 evidence update; reviewed Moli runtime source files did not change.
- Targeted `rg` of Moli version/flags and `computerUseRunnerJobExecutor.ts` → found version gate `1.1.15`, production defaults false, executor constraint `chromium`; no package/image deployment pin found in the reviewed paths.
- Python 3 read-only `urllib` GET of GitHub Release API, tag-ref API, raw immutable `Cargo.lock`, `Cargo.toml`, `license-metadata.json`, plus OSV `GET /v1/vulns/{id}` for the 11 records and crates.io `GET /api/v1/crates/{crate}/{version}` for six fixed-version candidates; `tomllib` parsed the lockfile; extraction process exit 0. Asset attestation GET returned HTTP 404. No binary download, build, test, or runtime execution was performed.
- Python whitespace/final-newline validation of the owned evidence artifact exited 0; no implementation tests apply to this read-only audit.

## Remaining proof gaps and next action

1. Obtain an authoritative deployed-image/package inventory and digest; otherwise the “not deployed” classification is limited to this repository's current dispatch path.
2. Require an upstream signed release/provenance attestation or a reproducible, independently verified build from the immutable source commit.
3. Build/test a fixed Moli release or owned rebuild with all applicable crate updates, regenerate platform-filtered SBOM and OSV evidence, and verify the resulting artifact digest before any runtime use.
4. Complete per-platform component/license/notice review and produce the actual distributable notices bundle; obtain legal approval.
5. Keep Moli disabled and Chromium as production default until W2/W3 isolation and vertical slice, security review, and these W4 gates pass.

## Primary sources

- [v1.1.15 release and assets](https://github.com/lexmount/moli/releases/tag/v1.1.15)
- [Immutable upstream commit](https://github.com/lexmount/moli/commit/eaaf6f2dbfe26bf8de33387cd3ae6c31d0931a0e)
- [Upstream lockfile](https://raw.githubusercontent.com/lexmount/moli/eaaf6f2dbfe26bf8de33387cd3ae6c31d0931a0e/Cargo.lock)
- [Upstream license metadata](https://raw.githubusercontent.com/lexmount/moli/eaaf6f2dbfe26bf8de33387cd3ae6c31d0931a0e/license-metadata.json)
- [GitHub release API](https://api.github.com/repos/lexmount/moli/releases/latest); [tag ref API](https://api.github.com/repos/lexmount/moli/git/ref/tags/v1.1.15); [attestations endpoint](https://api.github.com/repos/lexmount/moli/attestations/sha256:f7c9455451bffd4d3a6353431b3596c1d18ad4d9fe6725d8d4033f6fff5fa59d)
- [OSV advisories: crossbeam-epoch](https://osv.dev/vulnerability/RUSTSEC-2026-0204), [paste](https://osv.dev/vulnerability/RUSTSEC-2024-0436), [rand GHSA](https://osv.dev/vulnerability/GHSA-cq8v-f236-94qc), [rand RustSec](https://osv.dev/vulnerability/RUSTSEC-2026-0097), [rustls GHSA](https://osv.dev/vulnerability/GHSA-2mjx-qc3c-rqvc), [rustls RustSec](https://osv.dev/vulnerability/RUSTSEC-2026-0285), [rustls-webpki GHSA](https://osv.dev/vulnerability/GHSA-82j2-j2ch-gfr8), [rustls-webpki RustSec](https://osv.dev/vulnerability/RUSTSEC-2026-0104), [smallbitvec](https://osv.dev/vulnerability/GHSA-97wc-2hqc-cjgr), [thin-vec GHSA](https://osv.dev/vulnerability/GHSA-xphw-cqx3-667j), [thin-vec RustSec](https://osv.dev/vulnerability/RUSTSEC-2026-0103).

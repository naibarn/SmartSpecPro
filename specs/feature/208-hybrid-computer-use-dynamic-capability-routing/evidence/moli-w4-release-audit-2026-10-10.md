# SPEC-208 W4 Moli v1.1.15 release and advisory refresh — 2026-10-10

## Scope and starting point

Repository starting canonical SHA: `8be32bb6746af744aed36e36748910d1c49fc65a`.

This is a read-only refresh of the pinned upstream release, its binary digest metadata, and the seven vulnerable crate versions in the release Cargo.lock. No Moli executable was downloaded or run. The lockfile was fetched from the immutable source commit `eaaf6f2dbfe26bf8de33387cd3ae6c31d0931a0e` and parsed as TOML.

## Release identity and artifact digest

GitHub Releases API reports `v1.1.15`, published `2026-10-07T15:56:35Z`, at commit `eaaf6f2dbfe26bf8de33387cd3ae6c31d0931a0e`. The immutable tag ref resolves directly to that commit. GitHub release metadata publishes the Linux x86_64 archive digest `sha256:f7c9455451bffd4d3a6353431b3596c1d18ad4d9fe6725d8d4033f6fff5fa59d`, matching the locally recorded archive digest in `moli-phase0-prototype-2026-10-08.md` and the SBOM.

This establishes equality with the digest served in GitHub release metadata. It does not establish a signed publisher attestation: the tag is lightweight, and the GitHub artifact attestations endpoint for the archive digest returned 404. Publisher provenance therefore remains unresolved.

## Refreshed OSV result

A fresh OSV `querybatch` request on `2026-10-10` queried the seven named crate versions found in the pinned release Cargo.lock. It returned the same 11 advisory records (7 unique issues) as the existing report:

| Crate | Pinned version | Advisory records | Fixed versions previously identified in advisory metadata |
| --- | --- | --- | --- |
| `crossbeam-epoch` | `0.9.18` | `RUSTSEC-2026-0204` | `>=0.9.20` |
| `paste` | `1.0.15` | `RUSTSEC-2024-0436` | Unmaintained notice; no vulnerability fix version |
| `rand` | `0.9.2` | `GHSA-cq8v-f236-94qc`, `RUSTSEC-2026-0097` | `>=0.9.3` |
| `rustls` | `0.23.38` | `GHSA-2mjx-qc3c-rqvc`, `RUSTSEC-2026-0285` | `>=0.23.45` |
| `rustls-webpki` | `0.103.12` | `GHSA-82j2-j2ch-gfr8`, `RUSTSEC-2026-0104` | `>=0.103.13` |
| `smallbitvec` | `2.6.0` | `GHSA-97wc-2hqc-cjgr` | `>=2.6.1` |
| `thin-vec` | `0.2.14` | `GHSA-xphw-cqx3-667j`, `RUSTSEC-2026-0103` | `>=0.2.16` |

No fixes are present in the pinned lockfile for the affected versions. This query was a targeted version-presence refresh, not a platform/feature reachability proof or a full regenerated SBOM. Existing dependency paths remain subject to platform and feature review. No advisory was suppressed and no risk acceptance was created.

## W4 outcome

Partial progress: release API digest equality is confirmed; signature/attestation, complete dependency/license notice review, and a fixed audited Moli artifact are still missing. Keep Moli unavailable and production disabled. Next safe actions are to obtain a publisher-verifiable build/provenance and fixed release, regenerate SBOM/license/advisory evidence for that exact artifact, then reclassify exploitability against its deployed platform graph.

## Evidence sources

- Release: <https://github.com/lexmount/moli/releases/tag/v1.1.15>
- Immutable source commit: <https://github.com/lexmount/moli/commit/eaaf6f2dbfe26bf8de33387cd3ae6c31d0931a0e>
- OSV: <https://api.osv.dev/v1/querybatch> (POST, exact pinned versions listed above)
- Advisories: <https://osv.dev/vulnerability/RUSTSEC-2026-0204>, <https://osv.dev/vulnerability/RUSTSEC-2024-0436>, <https://osv.dev/vulnerability/RUSTSEC-2026-0097>, <https://osv.dev/vulnerability/RUSTSEC-2026-0285>, <https://osv.dev/vulnerability/RUSTSEC-2026-0104>, <https://github.com/servo/smallbitvec/security/advisories/GHSA-97wc-2hqc-cjgr>, <https://rustsec.org/advisories/RUSTSEC-2026-0103.html>

## Source-license notice refresh

At the same immutable commit, the upstream workspace manifest declares `license = "MIT OR Apache-2.0"` and `license-metadata.json` identifies `LICENSE-APACHE` and `LICENSE-MIT`. The three local packages missing crate-level Cargo license fields (`moli-html-input-type`, `moli-url-policy`, and `moli-window-features`, all `0.1.0`) have no per-package override in their manifests. The source tree also contains `licenses/Chromium-BSD-3-Clause.txt` and `licenses/Selenium-NOTICE.txt`. This corroborates the repository-level dual-license coverage and confirms two bundled notices are present at the pinned source commit.

This source inspection does not independently determine the legal compatibility of all 626 components, validate all bundled assets/fonts/native libraries, or produce a deployment-ready notices bundle. W4's full license/notice gate remains open pending a complete per-platform inventory and legal review.

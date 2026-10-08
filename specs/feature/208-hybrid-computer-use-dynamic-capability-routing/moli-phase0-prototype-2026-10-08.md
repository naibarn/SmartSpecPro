# SPEC-208 Moli Phase 0 and Prototype Evidence — 2026-10-08

## Scope and decision

This evidence note supplements Revision 6 and the Moli integration audit. It records source pinning, artifact hashes, dependency inventory, protocol smoke tests, and the current security/integration boundary. It does not certify the broader SPEC-208 runtime or production readiness.

**Decision: prototype research only; production No-Go.** Moli remains disabled. The backend command path still requires `browserEngineConstraint: "chromium"`. The repository contains the SmartAIHub control-plane Runner client, but not the paired Runner process that owns browser process launch, egress controls, and profile cleanup. A control-plane-side CDP connection would bypass that boundary, so this work does not connect Moli to the live job route.

## Upstream source and license

- Upstream: [lexmount/moli](https://github.com/lexmount/moli), [release v1.1.15](https://github.com/lexmount/moli/releases/tag/v1.1.15), [Cargo.toml](https://github.com/lexmount/moli/blob/v1.1.15/Cargo.toml), [license metadata](https://github.com/lexmount/moli/blob/v1.1.15/license-metadata.json)
- Pin: release `v1.1.15`, tag commit `eaaf6f2dbfe26bf8de33387cd3ae6c31d0931a0e`, published 2026-10-07. The source archive and executable were fetched from versioned GitHub release URLs; no floating `latest` installer was used.
- Source archive SHA-256: `15f8b1a9adb2da0098a2be5b6e719a6b35f8370b6a5ba15aeac5812f127dbd99`.
- Linux x86_64 release archive SHA-256: `f7c9455451bffd4d3a6353431b3596c1d18ad4d9fe6725d8d4033f6fff5fa59d`.
- Extracted Linux x86_64 executable SHA-256: `f927b72192905c092ec95c8f528e35087224f3fe8750f72fb2147efa676eab8d`.
- `Cargo.lock` SHA-256: `bc816c83f9a0a6bb5fb08497b3fb936ee1b86c524a6acd9cc5da8a29b7f329e5`.
- Upstream workspace declares `MIT OR Apache-2.0`; upstream also records file and third-party license exceptions. The generated SBOM does not establish per-component license compatibility. A complete license/notice review remains open.
- Upstream release notes contain continuing CDP, navigation, forms, cookies, and V8 fixes. The release page does not provide a verified checksum/signature for the downloaded artifact; local hashes provide identity for this audit, not publisher authenticity.

## SBOM and security report

- CycloneDX 1.5 inventory: [`evidence/moli-v1.1.15.cdx.json`](evidence/moli-v1.1.15.cdx.json), generated from the pinned lockfile and Cargo metadata. It contains 626 components and 438 dependency records in the normal/build dependency closure for the `moli` package. Platform-specific resolution was not applied.
- License inventory: [`evidence/moli-v1.1.15-license-inventory.json`](evidence/moli-v1.1.15-license-inventory.json) records Cargo license metadata for the same 626-package closure. Three local workspace crates omit explicit license metadata; upstream's repository-wide MIT/Apache default appears to cover them, but the license/notice gate still requires a full source-tree and legal compatibility review.
- OSV report: [`evidence/moli-v1.1.15-security-report.json`](evidence/moli-v1.1.15-security-report.json), queried 509 locked crates.io package versions in 11 batches on 2026-10-08. The query returned 11 advisory records across `crossbeam-epoch`, `paste`, `rand`, `rustls`, `rustls-webpki`, `smallbitvec`, and `thin-vec`; the report includes shortest dependency paths from the `moli` package. Findings include HIGH severity advisories for `rustls-webpki`, `smallbitvec`, and `thin-vec`, and a MODERATE `rustls` TLS issue. These packages are reachable in the Cargo metadata normal/build graph; platform-specific reachability and remediation status still need review. Treat this as a security blocker for production use.
- `cargo-audit` was not installed or run. Metadata was generated with `GIT_EXEC_PATH=/usr/lib/git-core cargo metadata --locked --format-version 1`; the local SBOM generator and OSV query scripts are under [`tools/moli-prototype`](../../../tools/moli-prototype/).

## Executed local protocol checks

The pinned Linux executable reported `moli 1.1.15`. It was launched with a loopback-only listener (`127.0.0.1:19222`) and a separate temporary profile directory. The listener was stopped after the checks.

| Check | Result | Evidence |
| --- | --- | --- |
| CDP discovery/navigation | PASS | `/json/version` reported protocol 1.3; adapter `Page.navigate`, DOM query, and Runtime evaluation succeeded against a loopback fixture. |
| JavaScript | PASS | Adapter Runtime evaluation returned the expected document title and field state. |
| Form interaction | PASS | Adapter CDP focus plus `Input.insertText` populated a local form input. |
| WebDriver Classic | PARTIAL PASS | `/status`, session creation, local navigation, element lookup, and typing returned success. |
| Session isolation | PARTIAL / WARNING | Two distinct CDP BrowserContexts had isolated `localStorage`. Two WebDriver sessions on the same Moli server shared `localStorage`; WebDriver sessions therefore are not an isolation boundary. Use a distinct CDP BrowserContext per job or a distinct process/profile, and test the selected mode again in the Runner. |
| Cancellation/cleanup | PARTIAL PASS | Adapter cancellation closed its target/context and invoked the Runner cleanup callback; stopping the isolated Moli process closed the listener. Actual Runner profile deletion, lease revocation, and durable cleanup receipts were not exercised. |
| Security policy / egress | NOT VERIFIED | Unit/live tests prove non-loopback CDP rejection, require authorization/isolation callbacks, and reject a denied navigation. Those callbacks are not yet wired to SmartAIHub's real Runner policy service. DNS rebinding, redirect revalidation, private-address, metadata, and proxy-enforcement tests remain open. |
| Fallback | PASS (selector unit scope only) | Six tests cover default Chromium, disabled Moli, shadow behavior, capability gating, explicit opt-in, and flag parsing. This does not prove Runner fallback behavior. |
| SmartAIHub Runner/CDP/WebDriver integration | NOT RUN | The actual Runner executor is outside this repository checkout; no job was dispatched. |
| Benchmark/UAT | NOT RUN | No SmartAIHub paired corpus, load test, or browser UAT was executed. |

## Prototype code and flags

The prototype adds [`moliCdpBrowserAdapter.ts`](../../../apps/web/server/services/moliCdpBrowserAdapter.ts), which requires an existing attempt authorization callback, network-isolation confirmation, navigation authorization, audit callback, Runner cleanup callback, a loopback CDP endpoint, and the pinned Runner-reported version. It creates one isolated CDP BrowserContext per adapter/job attempt and refuses WebDriver session storage as an isolation boundary. The control-plane routing helper defines `moli_enabled=false`, `moli_shadow_mode=true`, and `moli_production_enabled=false` as defaults and returns Chromium unless explicitly gated. Neither the helper nor CDP adapter is wired to the job executor: that executor still constrains browser jobs to Chromium. No route accepts user-supplied capability claims or a remote CDP endpoint.

Focused tests run from `apps/web`: `moliBrowserEngine.test.ts`, `moliCdpBrowserAdapter.test.ts`, and the unchanged `computerUseRunnerJobExecutor.test.ts`. With the pinned Moli server running on loopback and `MOLI_CDP_ENDPOINT=http://127.0.0.1:19222`, all 13 tests passed. This is prototype evidence only; the live Runner policy callbacks are mocked in the test.

## Remaining blockers and next executable phase

1. Obtain the paired Runner source/runtime ownership and integrate Moli process launch there, behind the existing authorized `worker_jobs` attempt and Runner grant. Keep the CDP listener loopback-only and one CDP BrowserContext/profile per job attempt.
2. Enforce destination policy outside page JavaScript with the approved Runner egress/proxy boundary; prove redirects, DNS/IP revalidation, and metadata/private-address denial.
3. Resolve all OSV findings against the exact `moli` target graph, upgrade or document accepted exceptions, run a maintained Rust advisory scanner, and complete per-component license/notice review.
4. Add reproducible Runner tests for navigation, JavaScript, forms, CDP/WebDriver surface, cross-tenant isolation, cancellation/profile deletion, policy denial, and fallback. Keep Chromium as the production default and do not enable Moli until all security and acceptance gates pass.

No Moli production job was enabled or replayed in this audit.

## QA review passes

The Lane B review checked (1) latest release selection, (2) immutable tag-to-commit resolution, (3) source archive digest, (4) binary archive and executable digests, (5) Cargo.lock digest, (6) Cargo metadata graph and SBOM reference integrity, (7) OSV query coverage and dependency paths, (8) Cargo license metadata gaps, (9) CDP navigation/DOM/JavaScript/form behavior, (10) WebDriver Classic status/session/element behavior, (11) separate CDP BrowserContext storage isolation versus shared WebDriver session storage, (12) cancellation listener shutdown and Runner cleanup callback, (13) non-loopback/authorization/navigation-policy gates, (14) default-off/shadow/production flag behavior, and (15) the unchanged executor's Chromium constraint. The review found the documented WebDriver storage leak and unresolved reachable advisories; no production route was enabled.

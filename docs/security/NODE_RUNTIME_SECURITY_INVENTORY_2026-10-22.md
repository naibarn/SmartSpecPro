# Node.js Security Runtime Inventory — 2026-10-22

**Observation time:** 2026-10-22 01:36 UTC (08:36 Asia/Bangkok)

**Canonical source deployed to Linux production:** `ad1bea2d679110908d0c9a8928738562dfc041e4`
**Advisory source:** [Node.js security releases, 2026-10-21](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)

This is an evidence snapshot of runtimes observable from the SmartSpecDev Linux host and repositories available to this task. A configured version is not treated as a running version. Processes were inventoried through `/proc/<pid>/exe` and the referenced executable's `--version`; service identity came from systemd. No environment files or service credentials were read.

## Linux Host Inventory

The scan observed **20 Node.js process instances** across four executable installations. Process counts include child Node processes; they are not counts of independent services. A final service check at 01:36 UTC confirmed all four managed units active and public `https://smartaihub.app/healthz` HTTP 200.

| Environment / service | Observed runtime and executable | Process instances | Status | Evidence and action |
|---|---|---:|---|---|
| Production `smartspec-web.service` | Node `v22.23.4`, `/home/dev/.nvm/versions/node/v22.23.4/bin/node` | 1 | `PATCHED` | Release `smartspec-web-ad1bea2d679110908d0c9a8928738562dfc041e4-53700617a4b9`; process executable/version verified after activation; internal `/healthz` returned 200. |
| Production `smartspec-node-worker.service` | Node `v22.23.4`, same executable | 1 | `PATCHED` | Same immutable release and source revision; service active and worker runtime attestation passed. Queue settlement and billing regression suites were not run. |
| Shared Hermes worker `smartspec-hermes-worker.service` | Node `v22.23.4`, same executable | 3 | `PATCHED` | Installed the repository unit template, preserved the prior unit at `/etc/systemd/system/smartspec-hermes-worker.service.pre-node-20261022`, and restarted through systemd. The worker handles SIGTERM by draining active jobs before stopping. |
| Development `smartspec-dev-web.service` | Node `v22.23.4`, same executable | 2 | `PATCHED` | Set the nvm default to `22.23.4`, added a service PATH override without reading or changing the existing environment file, then used `scripts/restart-dev-web.sh`. The script preserved the dirty, noncanonical checkout and passed web/API readiness and diagnostics guard checks (HTTP 403). |
| User session / Orca PTY processes | Node `v22.22.3`, `/home/dev/.nvm/versions/node/v22.22.3/bin/node` | 3 | `VULNERABLE` | Still active after service remediation. Their session ownership and in-flight work were not established, so they were not terminated. New shells now select Node `22.23.4`; these existing sessions need a safe restart. |
| VS Code Server | Node `v24.21.0`, `/home/dev/.vscode-server/cli/servers/Stable-6d62b1d5dace93a33b3a6d3eca1317bd5e15bcb1/server/node` | 7 | `VULNERABLE` | Below the fixed Node 24 floor `24.22.1`. Microsoft documents that the VS Code client installs and updates this server. Updating the active server requires the connected client workflow; no remote-server binary replacement was performed. |
| Orca-managed runtime | Node `v24.21.0`, `/home/dev/.config/orca/orcad-artifacts/linux-x64-glibc/runtimes/node-7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c/bin/node` | 3 | `BLOCKED_UNVERIFIED` | Below the fixed Node 24 floor. `orca-ide status` reported `unsupported-headless-serve`, `automatic=false`, and `updater-unavailable`; this runtime needs the desktop app's supported update path. Vendor files were not edited. |

### Other Requested Environments

| Environment | Runtime type | Status | Evidence gap |
|---|---|---|---|
| Windows 11 development PC | Node / bundled tools | `BLOCKED_UNVERIFIED` | This task environment cannot observe that host's processes, installed tools, or container images. |
| Separate SmartAIHub infrastructure, external runners, and self-hosted CI runners | Node / container | `UNKNOWN` | No direct host or image-digest observation was available. Repository declarations alone do not establish runtime status. |
| GitHub-hosted workflow Node setup | Node 22 | `PATCHED` for the repository setup step | Authored setup-node pins use `22.23.4`; the Node runtime embedded in GitHub's runner/actions is provider-managed and was not independently inventoried. The dedicated runtime attestation step passed on `ad1bea2d`. |
| Cloudflare Workers staging artifact | Workerd | `NOT_APPLICABLE` to Node native CVEs | Workerd is a separate runtime. Canonical staging bundle was published with source `ad1bea2d679110908d0c9a8928738562dfc041e4`, digest `sha256:ad0311ca74f880caba5df36d8c2f66f85705af160163e89ea413647210b7462c`, 1,593 assets; no activation/deployment to a Worker was performed. Use Workerd-specific compatibility policy. |

## CVE Applicability by Node Release Line

`✓` means the official October 21 advisory includes that release line; `—` means it does not. Fixed floors are Node `22.23.4`, `24.22.1`, and `26.12.1` respectively.

| CVE | Issue | Node 22 | Node 24 | Node 26 |
|---|---|:---:|:---:|:---:|
| CVE-2026-111497 | Brotli decoder out-of-bounds write | ✓ | ✓ | ✓ |
| CVE-2026-105482 | DNS resolution NUL character | ✓ | ✓ | ✓ |
| CVE-2026-105483 | TLS hostname validation | — | ✓ | ✓ |
| CVE-2026-106069 | TLS hostname validation bypass | ✓ | ✓ | ✓ |
| CVE-2026-105481 | HTTP keep-alive | ✓ | ✓ | ✓ |
| CVE-2026-106072 | Certificate validation | ✓ | ✓ | ✓ |
| CVE-2026-106074 | Random entropy cache / snapshot | ✓ | ✓ | ✓ |
| CVE-2026-106070 | ZIP validation | — | — | ✓ |
| CVE-2026-106071 | Permission Model | — | — | ✓ |
| CVE-2026-106073 | Filesystem Permission Model | ✓ | ✓ | ✓ |

## Application Exposure Review

Static review found these relevant paths; no production exploit was attempted:

- `apps/web/server/services/geoSources/fetch.ts` resolves pinned external targets and accepts gzip/deflate/Brotli responses. Decompression is size-bounded (`maxOutputLength` and a maximum decoded size). This is a potential compressed-input path; production web/worker now run the fixed Node 22 release.
- `apps/web/server/services/notificationWebhookService.ts` and `marketplaceAssetService.ts` resolve configured or caller-selected hostnames. The webhook path requires HTTPS and rejects private/reserved IPs; marketplace images also require an allowed host and public addresses. DNS parsing remains a potential runtime-sensitive path and uses patched service runtimes.
- `apps/web/server/_core/applicationDatabaseTls.ts` requires certificate verification and checks the configured server hostname.
- `crypto.randomUUID()` and `crypto.randomInt()` are used for identifiers and device-auth codes; no startup snapshot or SEA build configuration was found in the scoped Node application sources/configuration.
- `contentProtection.ts` uses `AdmZip` to create a generated evidence archive. The reviewed call site does not parse an uploaded ZIP. No Node HTTP Agent keep-alive override was found in the scoped application sources; the web server does configure its keep-alive timeout.
- Embedded VS Code and Orca runtimes can process user workspace or agent input, but their internal API call paths were not reviewed. Their observed Node 24.21.0 versions remain below the fixed floor.

## Patch, Gate, and Verification Evidence

- Repository runtime declarations, authored CI setup-node pins, Docker Node images, and systemd templates were raised to the supported Node 22 floor `22.23.4`. The runtime guard rejects versions below the floor and has a negative test.
- `.github/workflows/node-runtime-security.yml` checks the official Node security feed daily and fails on an advisory newer than the reviewed timestamp. The direct scan reviewed 77 feed entries and found none newer than 2026-10-21.
- `linux_backend_release.py` attests the executable and version of the actual web and Node worker processes. The sudo-gated release installs scoped systemd overrides for the patched Node executable and retains that runtime override if the application artifact rolls back.
- Focused local evidence: Linux release tests 24 passed; runtime tests 5 passed; Node guard and HyperFrames runtime tests 8 passed; patched Node version gate passed; the old Node 22.22.3 negative gate failed as expected; `git diff --check` passed.
- Canonical frontend/backend build for `ad1bea2d679110908d0c9a8928738562dfc041e4` passed. The protected release receipt recorded `DEPLOYED_VERIFIED`, artifact digest `sha256:292fb9b5904c7e1c5cc8f403a2ef3309bb05e9d720ddcf62bb71f593136b6619`, both production service PIDs on Node `v22.23.4`, runtime revision `ad1bea2d679110908d0c9a8928738562dfc041e4`, internal health HTTP 200, and anonymous diagnostics HTTP 403. Public checks returned `https://smartaihub.app/healthz` HTTP 200 and `https://api.smartaihub.app/api/v1/health` JSON status `ok`.
- Receipt: `/mnt/SmartSpecDev/.cache/codex/canonical-sources/.development-build-results/f29801373bfd4154c0d8/production-deployments/smartspec-web-ad1bea2d679110908d0c9a8928738562dfc041e4-53700617a4b9-35.json`.
- GitHub Actions run `39704996399` for `ad1bea2d679110908d0c9a8928738562dfc041e4` had the Node runtime attestation pass. At the last observation, the overall CI run was still in progress; its Python and `turbo_build` jobs failed. The parent run for `35d92f1e` had the same Python `StateManager` import error and baseline TypeScript failures. Cloudflare local readiness also fails on the same `CLOUDFLARE_STAGING_ARTIFACT_MISMATCH` seen on parent revisions. These failures are not evidence that the Node security tests failed, and they remain open CI issues.
- Full authentication, billing/settlement, queue idempotency, runner, MCP/A2A, and Windows/container suites were not run in this task. Production process health is verified; end-to-end queue processing and billing are not claimed.

## Focused Review Passes

| Pass | Review | Result |
|---:|---|---|
| 1 | Runtime inventory coverage | Observed 20 processes on the available Linux host; Windows, remote hosts, and provider-managed runners remain explicitly unknown or blocked. |
| 2 | CVE applicability | Mapped the ten CVEs to fixed Node 22/24/26 release lines using the official advisory; did not apply Node native CVE conclusions to Workerd. |
| 3 | Patch floors | Updated authored Node 22 declarations to `22.23.4`; active Node 24.21.0 embedded runtimes remain below `24.22.1`. |
| 4 | Docker and embedded runtimes | Authored Docker bases were updated; direct process observation found VS Code and Orca Node 24.21.0 bundles that declarations cannot update. |
| 5 | CI/CD and release configuration | CI setup-node pins, runtime guard, daily feed check, service templates, and release attestation were reviewed. GitHub-hosted runner internals remain provider-managed. |
| 6 | CVE-related source paths | Reviewed Brotli, DNS, TLS, random APIs, ZIP use, realpath, keep-alive, startup snapshots, and SEA/permission flags; findings are summarized above. |
| 7 | Security controls and secrets | Used process executables, systemd metadata, and health checks; did not read `.env` or credential environment files. Runtime release overrides are scoped to approved service units. |
| 8 | Queue, worker, and billing stability | Confirmed Hermes worker SIGTERM drain behavior and active service state. Queue completion, idempotency, credit reservation, and settlement integration suites remain unverified. |
| 9 | Build and deployment evidence | Canonical build passed, staging artifact published, sudo-gated production release verified against actual service processes, and public health endpoints returned healthy responses. |
| 10 | Acceptance and residual gaps | Recorded CI baseline failures, remaining vulnerable processes, unavailable hosts, updater limits, and non-passing SPEC-295 requirements; overall result remains PARTIAL. |

## Remaining Work

1. Update the VS Code Server through the connected VS Code client's supported update flow, then re-observe every active process under its new server version. Microsoft documents that the server is client-managed and updated by the client: [Remote Development FAQ](https://code.visualstudio.com/docs/remote/faq).
2. Update Orca through its desktop app's supported updater when available; the current headless runtime reports `updater-unavailable`.
3. Restart the three remaining Node 22.22.3 user-session processes only after their session owners confirm that in-flight work is safe to stop; new sessions now default to Node 22.23.4.
4. Inventory the Windows development PC, external SmartAIHub hosts, deployed containers, self-hosted runners, and CI provider runtimes from their actual processes or immutable image digests.
5. Wire new official advisories to idempotent security-task creation through the existing Task Control authority. The advisory detector and release floor gate exist; automatic Task Control task creation and the existing monitoring dashboard integration are not yet verified.
6. Re-run focused workflow checks after the baseline CI failures are repaired; run the relevant queue, billing, runner, and agent integration suites before claiming full acceptance.

**Overall result: PARTIAL.** Linux production runtime security and the four managed Linux service runtimes are patched and observed. Thirteen active Linux Node processes remain on affected runtimes (three Node 22.22.3 session processes and ten Node 24.21.0 embedded tool processes); additional hosts and provider runtimes remain unknown or blocked. Do not count these gaps as pass.

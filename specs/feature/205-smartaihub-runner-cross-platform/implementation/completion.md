# Feature 205 implementation completion

Status: repository runtime/control-plane implementation complete; target rollout evidence pending

The deep-plan was completed from the nine section files and then implemented
in the planned order. The standalone Runner foundation is separated from
`apps/worker-app`, supports local-device and managed-container contracts,
normalizes the six initial external-agent families plus approved tool families,
publishes one bounded capability snapshot, and uses a distinct Runner token
namespace. Native transport, generic process supervision and assignment-scoped
container lifecycle are implemented and focused-tested. Provider-specific
auth/session behavior and target-environment evidence remain explicitly
separate; the generic runtime does not claim those external effects.

The server boundary is:

```text
POST /api/runners/setup                 (authenticated browser enrollment)
POST /api/runners/:runnerId/enroll
POST /api/runners/:runnerId/control       (HTTPS durable control fallback)
POST /api/runners/:runnerId/control/rotate
POST /api/runners/:runnerId/access/refresh
POST /api/runners/:runnerId/revoke        (authenticated owner offboarding)
WSS  /api/runners/:runnerId/control       (authenticated low-latency path)
POST /api/runners/:runnerId/capabilities
POST /api/runners/:runnerId/heartbeat
GET  /api/runners/:runnerId/status
```

Capability publication remains tenant-bound, idempotent, monotonic by revision,
redacted and separate from Worker registration. Durable projection tables are
`runner_nodes` and `runner_capability_snapshots`; Job execution still belongs to
the existing `worker_jobs`/outbox control plane.

The user surface remains one combined `AI Chat & Feedback` button. Its
`Task Control` tab now shows SmartAIHub Runner nodes separately from legacy
Worker App devices, including platform/profile, safe display state, status,
tool count and capability count.
The existing expandable multistep task view remains the only task-tracking UI.

The native Runner now has a real bounded PATH scanner, approved `--version`
probe, authenticated WSS client, HTTPS durable fallback, Runner device-proof
signing for enrolled local devices, sequence/idempotency queue, direct no-shell
process host, lease/fence cancellation and atomic journal/workspace safeguards.
The local `run` command repeats the authenticated discovery/reconciliation
cycle at a bounded interval and `rescan` performs one explicit refresh. The
`/workers/connect` surface now contains the separate Runner enrollment form;
it does not accept or return a private key.
The backend accepts the same versioned envelope on both WSS and HTTPS, rechecks
scope on each event, recomputes the signed body hash from the parsed request,
rejects revoked nodes before WSS handshake/credential rotation, and commits
capabilities through the idempotent gateway. Enrollment ignores client-supplied
owner identity, binds ownership from authenticated server claims, and validates
the device public key before issuing credentials. The shared profile
has assignment-scoped workspace creation/cleanup and an explicit Cloudflare
start/reconcile/release lifecycle adapter. Provider-specific
authentication/session evidence is still kept separate from generic
executable discovery.

## Release distribution and update implementation

Runner distribution is now a separate SmartAIHub-owned release catalog. It is
not coupled to the Worker App release tables or the Cloudflare Container
deployment path. Migration `0336_runner_release_assets.sql` stores package,
raw update binary, checksum and shared-container manifest metadata with
recomputed SHA-256, validation state, provenance and publication/withdrawal
state. Public catalog and download routes expose only same-origin SmartAIHub
paths and return only published, valid, non-withdrawn assets.

The manual-only `runner-release.yml` workflow builds Windows x64, macOS Intel
x64, macOS arm64 (Apple Silicon) and Linux x64 artifacts, records the selected checkout commit,
emits unique package/raw/manifest/checksum names and creates a
`runner-v<version>` GitHub Release only when the explicit publish input is
true. The admin release panel dispatches and monitors this workflow through the
server, then imports the completed release into the catalog without exposing
repository or token details to normal users.

The build record persists the explicit publish decision in migration
`0339_runner_release_build_publish.sql`. Artifact-only runs can complete and
remain inspectable, but cannot be synced into the public catalog; published
runs import package, raw binary, checksum and shared-container manifest assets
only after the selected target set is complete.

Migration `0337_runner_update_commands.sql` adds a durable update command
ledger. Browser requests are tenant/owner/admin checked and platform/profile
compatible; Runner polling and acknowledgements require the Runner audience,
`runner:update` scope and device proof. Downloads are command-bound. The
Runner verifies SHA-256 and RSA-SHA256 metadata, acknowledges the durable
`downloading → verifying → replacing → restarting → completed` state sequence,
copies a post-exit helper so Windows can release the live executable lock,
performs same-filesystem atomic replacement with backup/rollback, confirms an
authenticated connection using the new binary, restarts the refresh loop and
reports the terminal state idempotently.

The Dashboard now includes a localized, same-origin Runner card for version
check, native download and connected-Runner update progress. The admin release
console contains manual build/sync controls. It does not navigate normal users
to `/chat`, GitHub or raw provider URLs.

## External gates still required

- Manual GitHub dispatch on a real repository ref with Windows x86_64, macOS
  Intel (x64), arm64 (Apple Silicon) and Linux x86_64 artifact inspection.
- Real Cloudflare target-account Container start/health/drain/replacement,
  lease/fence and two-tenant isolation evidence owned by Feature 204.
- Real host scans/probes for Claude Code, Codex, DeepSeek Harness, Antigravity,
  Hermes and OpenClaw with approved credentials/transports.
- Browser/Playwright proof on the deployed authenticated surface and release
  signing/provenance secret availability.

These are explicitly unverified environment gates, not hidden blockers in the
local code proof.

## Remaining implementation/evidence boundary

The generic runtime implementation is complete. The remaining gate is
provider-specific and environment-specific: each of the six external agent
families still needs a real installation/auth/session acceptance run, while
Feature 204 must prove the deployed Container image, target bindings and
replacement behavior. Those are not silently inferred from a generic CLI
probe or local fake host.

Local verification also includes the focused release/update test matrix,
`node scripts/verify-runner-release-workflow.mjs`, the module import probe and
the 10-round release-management audit. The repository-wide TypeScript check
was intentionally not run because of the project RAM constraint.

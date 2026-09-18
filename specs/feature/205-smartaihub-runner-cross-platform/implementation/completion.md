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

## External gates still required

- Manual GitHub dispatch on a real repository ref with Windows x86_64, macOS
  Intel/Apple Silicon and Linux x86_64 artifact inspection.
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

Local verification also includes `node scripts/verify-runner-evidence.mjs` and
`node scripts/audit-runner-implementation.mjs` (10/10 audit rounds passed).

# Synthesized Specification — SmartAIHub Runner Cross-Platform Runtime

## Outcome

Introduce a concrete SmartAIHub Runner product/runtime that is independently
installable and operable on Windows x86_64, macOS Intel (x64), macOS arm64
(aarch64, Apple Silicon)
and Linux x86_64. The same provider-neutral execution contract must also be
usable by a Cloudflare Container as a shared, ephemeral execution node for
multiple users.

The Runner is not the existing SmartAIHub Worker App. The Worker App remains
the Tauri/media/render desktop product with its own protocol and release
artifacts. Runner and Worker may share neutral versioned contract types, but
must not share package identity, executable/config roots, credentials,
process lifecycle or release workflow.

## Authoritative boundaries

- Feature 195 owns durable worker_jobs, attempts, leases, fencing, events,
  outbox and reconciliation truth.
- Feature 196 owns Goal/Plan/Task semantics and dependencies.
- Feature 197 owns Runner offer, capability-fit and adaptive execution
  semantics.
- Features 198 and 200 own Chat/Assistant intent and External Agent
  session/task/event/result semantics.
- Feature 199 owns MCP upstream lifecycle, grants and transport.
- Feature 203 owns editor/media evidence, project/revision and artifact
  semantics.
- Feature 204 owns Cloudflare Container lifecycle, pool, autoscaling, cost
  limits, rollout and deployment.
- Feature 205 owns the local Runner executable, the shared Container Runner
  entrypoint, process/workspace isolation, known-tool scanner and the common
  execution adapter/gateway boundary.

No feature may create a second queue, task ledger, execution registry,
provider transport, MCP bypass or retired execution system.

## Execution profiles

### LOCAL_DEVICE_RUNNER

- persistent user/device-bound identity;
- authenticated enrollment, revocation and key rotation;
- capability snapshot and local runtime discovery;
- persistent authenticated control channel with durable HTTPS fallback;
- bounded protected local journal and replay/reconciliation;
- OS workspace/process/resource enforcement;
- local Agent/CLI/MCP adapter host.

### SHARED_CONTAINER_RUNNER

- managed pool/node identity, not a user device identity;
- every Job receives server-derived tenant/user authorization, lease, attempt
  and fencing context;
- fresh per-Job workspace, process scope and context;
- no direct user-to-container command channel;
- durable truth is worker_jobs, worker_job_events and outbox;
- no reliance on Container-local storage across replacement;
- provider wait must persist provider task identity and return to durable
  orchestration so the Container can stop;
- Feature 204 controls instance selection/lifecycle/cost/burst policy.

## Required runtime flow

Approved Goal/Plan/Task enters canonical worker_jobs admission and outbox,
then capability-aware scheduling selects a local Runner or shared Container.
The Runner scans the known tool catalog, probes recognized installations and
publishes one redacted tool/capability snapshot before it is eligible for
selection. The execution node validates tenant, job, attempt, lease,
capability revision and fencing version, creates an isolated
process/workspace session, emits bounded normalized progress and evidence
references, verifies results and artifacts, and performs a canonical terminal
transition. Duplicate, stale, out-of-order, revoked and cross-tenant
operations are rejected or reconciled without false success.

For local SmartAIHub-dispatched work, the Runner is the authenticated gateway
between the control plane and Claude Code, Codex, DeepSeek Harness,
Antigravity, Hermes Agents, OpenClaw-compatible runtimes and other approved
tools. This does not imply that the Runner can observe every internal tool or
MCP call made by an agent's own account; only the adapter-exposed or explicitly
mediated surface is governed by the Runner.

## Contracts

Every command/event includes protocol version, node/profile identity, Job ID,
attempt/lease identity, fencing version, correlation ID, sequence and
idempotency key where applicable. The protocol distinguishes accepted, applied,
rejected, unknown, duplicate and out-of-order outcomes.

Capability publication uses one bounded idempotent snapshot contract at
`POST /api/runners/:runnerId/capabilities` (or a versioned equivalent): the
request carries one revision/expiry, legacy capability IDs,
`toolInventory[]` and `capabilityInventory[]`; the response returns the
accepted revision/expiry plus safe per-entry rejection reasons. Older
revisions cannot overwrite newer registry state, and absent/revoked entries
become stale or unavailable.

The implementation must first evaluate existing
apps/web/server/services/runnerContracts.ts and use additive versioning or a
neutral package/re-export when the current shape cannot express managed
Container semantics. Existing Worker endpoints and Worker identity semantics
must remain compatible.

## Security and safety

- Server-derived tenant/user authority is authoritative.
- Local Runner authentication follows the Worker App's server-side invariants:
  signed token/JTI checks, distinct audience/token-use, required scopes,
  tenant/runtime/node binding, optional device proof, durable revocation and
  refresh rotation. Runner uses a separate credential namespace and rejects
  Worker tokens/endpoints; it never accepts a browser session token.
- Shared Container authentication uses a managed node credential plus
  server-derived per-Job delegated scope, attempt, lease and fencing context;
  it is not a per-user device and does not use per-user device proof.
- Path traversal, absolute-path abuse, symlink escape and unapproved roots
  fail closed.
- Provider keys, refresh tokens, raw prompt context and arbitrary upstream
  payloads never enter UI, logs, event payloads or Container-local durable
  state.
- MCP access requires a scoped Feature 199 gateway grant.
- Known tools are discovered before selection. Installation, configuration,
  authentication, health, availability and policy approval are separate
  states; an arbitrary executable or PATH name is never executable by
  discovery alone.
- Process controls require declared adapter capabilities and policy approval.
- Unknown ownership or uncertain lease state blocks unsafe completion and new
  claims.
- Shared Container cleanup must prevent workspace, credential cache, process
  or context reuse across Jobs and tenants.

## Repository and release deliverables

Create apps/runner-app as a standalone Rust package with runner-core,
runner-cli, adapters, supervisor, workspace, identity, control channel,
journal/discovery/leasing and diagnostics boundaries. Add a separate
workflow, tentatively .github/workflows/runner-release.yml, whose only
trigger is workflow_dispatch. It accepts ref/version/platform/profile,
artifact-only versus GitHub release, release notes and signing mode.

The workflow produces:

- Windows x86_64 native artifact;
- macOS Intel native artifact;
- macOS arm64 (Apple Silicon) native artifact;
- Linux x86_64 native artifact;
- shared Cloudflare Container Runner artifact/image manifest and digest.

It generates checksums, signed metadata when configured, deterministic
artifact names and a machine-readable manifest. It does not alter Worker App
workflows and does not auto-build or deploy on push, pull request, tag,
schedule or dependency update. Feature 204 must explicitly invoke deployment.

## Product UI integration

No new standalone Task Control page is required. The existing combined
Feedback/Chat launcher and Universal Control Plane panel expose the same
canonical Job/Runner projection. Settings /workers/connect handles local
Runner enrollment and distinguishes Runner from Worker App. The UI must show
real connection/readiness, active step, reconciliation and verification
states, never infer process health from a Job row, and never expose paths or
secrets.

UI/UX contract:

- **Target user/JTBD:** a user wants to connect a local Runner or understand
  whether a shared Container is executing a multi-step request without leaving
  the current page.
- **Surfaces:** combined Feedback/Chat launcher, Universal Control Plane panel,
  /chat, and /workers/connect settings entry point.
- **Ownership:** Feature 198/200 owns shared projection/presentation; Feature
  205 supplies the Runner status contract; Feature 204 supplies Container
  lifecycle/health projection.
- **States:** loading, no eligible Runner, connected/ready, running,
  waiting-for-lease, waiting-external, reconnecting, reconciling, paused,
  failed, verification-pending, completed, revoked and permission-denied.
- **Responsive:** compact launcher and panel on mobile; expandable step detail
  and connection diagnostics on tablet/desktop; no raw local paths in any
  viewport.
- **Accessibility:** keyboard-openable launcher, labelled controls, semantic
  expandable step groups, visible focus, status announcements, sufficient
  contrast and reduced-motion behavior.
- **Visual/copy direction:** reuse existing SmartAIHub tokens/components and
  established Thai/English localization; labels distinguish Runner, Worker App
  and shared Cloudflare execution. Do not add a new global reset.
- **Browser evidence:** test the combined launcher, panel, connection states,
  multi-step expansion, Runner-versus-Worker labels and no-secret/no-path
  rendering with focused Playwright evidence.

## Verification gates

Focused tests must cover protocol validation, authentication and revocation,
Runner/Worker token-namespace separation, bootstrap-only enrollment, WSS
credential transport safety, capability expiry, stale lease/fence rejection,
duplicate delivery, journal replay, process cancellation, workspace
confinement, artifact verification, Container tenant isolation, restart
reconciliation, explicit no-provider-wait behavior and manual workflow trigger
policy.

Platform install/start/stop/reconnect and Cloudflare deployment remain
environment gates. Whole-repository TypeScript typecheck is prohibited by the
repository RAM constraint; verification must stay focused.

## Rollout

Enable Runner eligibility behind a feature gate. If a local Runner or Container
is unavailable, revoked, incompatible or uncertain, preserve canonical Job
admission and select another approved execution target when policy allows.
Rollback disables eligibility and revokes credentials without deleting Jobs,
events, artifacts or Worker configuration.

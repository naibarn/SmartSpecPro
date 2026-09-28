# Deep-Plan Research — Spec 205 SmartAIHub Runner

## Research decision

- **Codebase research: required.** This is an existing git monorepo with
  current Worker, Web, Cloudflare and control-plane implementations.
- **SocratiCode status:** the configured SocratiCode MCP tools were not
  available in this session. Targeted shell discovery was used as the fallback,
  with exact source line verification after narrowing the search.
- **Web research: required.** The spec names Cloudflare Containers, Durable
  Objects, container lifecycle and manual image deployment. Current platform
  behavior must be checked during implementation because the platform evolves.
- **Testing research: required.** Existing Rust, Vitest and Playwright patterns
  are available; platform-native install and Cloudflare deployment evidence
  remain environment gates rather than claims that local unit tests can prove.

## Current repository boundary

### Existing Worker App is not the requested Runner

- apps/worker-app/package.json identifies @smartspec/worker-app and exposes
  Tauri/media/render packaging and a Cargo test command. Its current package
  identity, UI, sidecars and release scripts must remain independent.
- apps/web/server/routes/workerRuntime.ts currently exposes
  /api/workers/register, /api/workers/:workerId/heartbeat and
  /api/workers/:workerId/jobs/claim. These are Worker protocol boundaries,
  not proof of a standalone Runner Control Channel.
- apps/worker-app/src-tauri/src/worker_control_plane.rs posts the existing
  Worker heartbeat and claim requests. worker_loop.rs contains the existing
  polling/claim execution loop.
- No standalone apps/runner-app or complete Runner gateway/client was found.
  The new implementation must therefore introduce an explicit boundary instead
  of renaming or extending the Worker App until both protocols are conflated.

### Existing shared contracts are useful but incomplete

- apps/web/server/services/runnerContracts.ts already contains a versioned
  contract constant, identity, capability snapshot, work-offer, control-command
  and control-event types plus validation helpers.
- Its current runtime union (desktop, container, worker) and identity shape do
  not by themselves express the new distinction between a persistent user device
  and a managed, ephemeral shared Container node. The plan must evaluate an
  additive versioned extension and compatibility re-exports rather than
  silently changing existing meanings.
- Existing worker_jobs, worker_job_events, lease/fence and outbox services are
  the durable control-plane source. The Runner must not create a second ledger
  or let a Container-local journal become durable truth.

### Existing Cloudflare boundary

- apps/cloudflare is the current Cloudflare package and contains wrangler.jsonc
  plus contract tests. Feature 204 owns Cloudflare-specific Runtime Scheduler,
  Container lifecycle, instance caps, cost controls and deployment orchestration.
- Feature 204 already treats the Container filesystem as disposable, keeps
  durable job/status/billing/lease truth outside the Container and forbids
  keeping a Container alive only to poll a remote provider.
- Feature 205 therefore supplies the compatible in-container execution
  entrypoint and process/workspace isolation. It does not provision a new
  Cloudflare application or direct user-to-Container transport.

## Existing release and package conventions

- Root package.json uses npm workspaces, npm 10.9.8 and Node 22. The plan
  should keep the Runner package independent under apps/runner-app and avoid
  adding a broad workspace typecheck.
- .github/workflows/desktop-release.yml is already a manual workflow_dispatch
  workflow for the Worker/Desktop App. It currently has Windows, macOS and
  Linux matrix logic and must not be repurposed for Runner artifacts.
- .github/workflows/worker-app-macos-release.yml is also manual and Worker
  specific. Feature 205 needs a separate workflow whose only trigger is
  workflow_dispatch, with explicit profile inputs and no push/PR/schedule
  trigger.
- The native target list for the new Runner is:
  x86_64-pc-windows-msvc, x86_64-apple-darwin,
  aarch64-apple-darwin, and x86_64-unknown-linux-gnu. Cloudflare's
  Container profile is an additional managed Linux artifact, not a local
  device binary.

## Test and verification conventions

- Web unit/service tests use Vitest through apps/web/package.json; focused
  files can be run with npm --workspace @smartspec/web test -- <paths>.
- Worker App Rust tests use Cargo through its package script and direct
  cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml when
  needed. The new Runner should have its own Cargo manifest and focused test
  commands.
- Existing browser evidence uses Playwright specs under apps/web/tests/e2e.
  Task Control/connection projections need browser evidence for the shared
  launcher and /chat panel, but headless Runner correctness cannot be inferred
  from a UI screenshot.
- Do not run npm run typecheck, npm --workspace @smartspec/web run check, or
  any whole-repository TypeScript typecheck because of the documented RAM
  constraint. Use focused tests, Rust package tests, static workflow assertions,
  and touched-file checks that do not start the whole workspace compiler.

## Cross-spec ownership findings

| Boundary | Owner | Planning implication |
|---|---|---|
| Job lifecycle, lease, fencing, outbox and durable events | Feature 195 | Runner consumes and acknowledges canonical state |
| Goal/Plan/step metadata | Feature 196 | Runner executes approved step metadata only |
| Runner offer/capability semantics | Feature 197 | New executable satisfies the existing semantic contract |
| Chat and shared Assistant control surface | Features 198/200 | Project Runner state through existing inline UI |
| MCP upstream lifecycle and grant | Feature 199 | Runner never opens arbitrary upstream MCP URLs |
| External Agent task/session/event/result semantics | Feature 200 | Runner hosts the process envelope; Feature 200 owns semantics |
| Shared editor/media evidence/artifact meaning | Feature 203 | Runner returns evidence/artifact references without owning project state |
| Cloudflare provisioning/pool/autoscaling/deployment | Feature 204 | Scheduler selects a shared Container node and controls lifecycle |
| Local executable and shared Container entrypoint | Feature 205 | One provider-neutral execution contract with two profiles |

The key non-overlap rule is that LOCAL_DEVICE_RUNNER has persistent
device-bound identity and bounded local recovery state, while
SHARED_CONTAINER_RUNNER has managed pool identity, fresh per-Job workspace and
no direct user-device channel. Both use the same canonical Job/lease/event
semantics; neither creates another queue, task ledger or realtime control
plane.

## Cloudflare platform findings

Authoritative Cloudflare documentation checked on 2026-09-18:

- The Container class is backed by a Durable Object; the Durable Object manages
  routing, persistent state and lifecycle hooks while the process runs in a
  Linux VM. See
  https://developers.cloudflare.com/containers/reference/container-class/.
- Containers can be started on demand, expose lifecycle hooks and can sleep
  after inactivity. The platform sends SIGTERM before a bounded graceful
  shutdown and may replace instances during rollout. See
  https://developers.cloudflare.com/containers/concepts/architecture/.
- wrangler deploy can build/push a Dockerfile image or use a registry image,
  and Worker activation and Container rollout are not transactional. The
  implementation plan must therefore publish a digest/manifest and make
  deployment an explicit Feature 204 handoff. See
  https://developers.cloudflare.com/containers/guides/deploy/ and
  https://developers.cloudflare.com/containers/configuration/rollouts/.
- Instance type, memory, vCPU, disk, image size and account limits are
  deployment-level constraints. Capability readiness and scheduler admission
  must account for them rather than treating a shared Container as an
  unlimited desktop. See
  https://developers.cloudflare.com/containers/platform/limits/.
- Cloudflare Workflows can sleep and wait for external events, which supports
  the existing rule that a Container should persist the provider task identity
  and stop instead of waiting in-process. See
  https://developers.cloudflare.com/workflows/.

These sources support the boundary in the spec; they do not prove SmartAIHub's
production deployment, account limits, image availability or runtime behavior.
Those remain implementation and environment acceptance gates.

## Planning decisions derived from research

1. Add a new Runner product/package and do not modify Worker App identity or
   release workflows.
2. Reuse and version existing Runner/control-plane shapes where compatible;
   introduce additive node/profile fields only when current contracts cannot
   represent managed shared Container semantics safely.
3. Keep worker_jobs plus outbox/lease/fence as the sole durable command path
   for shared Containers. Use a bounded local journal only for local device
   recovery.
4. Make the release workflow manual-only and separate native local artifacts
   from the shared Container artifact. Build, upload and deployment are
   separate explicit decisions; Feature 204 remains the deployment owner.
5. Prove tenant isolation, per-Job workspace/process cleanup, restart
   reconciliation, stale-fence rejection and no-provider-wait behavior before
   enabling the shared Container profile.

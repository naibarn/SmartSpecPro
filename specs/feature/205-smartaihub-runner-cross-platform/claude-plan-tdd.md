# TDD Plan — Spec 205 SmartAIHub Runner

Tests are written before the implementation in each section. The test plan
uses the repository's focused Rust, Vitest, YAML/static and Playwright
conventions. It intentionally excludes whole-repository TypeScript typecheck
because the repository RAM constraint makes that command unsafe.

## Test fixtures and shared invariants

Create deterministic fixtures for:

- local device identity and managed Container node identity;
- valid/invalid protocol envelopes;
- two tenants with distinct Jobs, attempts, lease tokens and fencing versions;
- capability snapshots before/after expiry;
- duplicate, stale, out-of-order and unknown event sequences;
- bounded workspace/context/artifact references;
- provider task submitted with a lost response;
- Container restart/replacement at each terminal transition.

Every test must assert that tenant authority comes from the server-side
assignment, not from a client-provided tenant field, and that no fixture
contains real credentials or raw provider secrets.

## Section test outline

### section-01-contracts-and-profile-boundary

Write Rust and focused Web contract tests for:

- profile parsing accepts exactly LOCAL_DEVICE_RUNNER and
  SHARED_CONTAINER_RUNNER;
- node/runtime compatibility remains backward compatible for legacy Worker
  values;
- envelopes reject missing version, Job, attempt, fence, sequence or
  idempotency data;
- malformed and over-limit payloads fail closed;
- shared Container identity cannot be interpreted as a persistent user device;
- compatibility re-export and fixture serialization remain stable.
- Runner-vs-Worker authentication boundaries reject wrong audience, token use,
  scope, tenant binding, revoked JTI and missing device authorization, while
  allowing only bounded refresh replay grace for the intended token family.
- Shared Container auth uses managed-node credentials plus server-derived Job
  scope and does not require per-user device proof.
- Worker registration/execution/upload tokens are rejected by Runner routes;
  Runner tokens are rejected by Worker routes; device-proof, revocation and
  effective-scope checks match the Worker App policy boundary.
- Runner audience/token-use identifiers are distinct from the Worker namespace;
  bootstrap credentials cannot open WSS or execute a Job, and WSS credentials
  never appear in URL query parameters.
- Known-tool scanning recognizes Claude Code, Codex, DeepSeek Harness,
  Antigravity, Hermes Agents and OpenClaw-compatible runtimes, while unknown
  executables remain metadata-only.
- Tool inventory and capability inventory are separate, bounded and redacted;
  material changes publish one idempotent snapshot revision and missing tools
  become stale/unavailable.

### section-02-backend-registry-and-gateway

Write Vitest/service tests for:

- local enrollment binds authenticated tenant/user/device and supports revoke
  and rotation;
- managed Container assignment uses canonical Job/attempt/lease/fence data;
- cross-tenant lookup, user-supplied hostname and user-supplied Container ID
  are rejected;
- stale capability, stale fence, expired lease and revoked node cannot be
  accepted;
- duplicate mutation is idempotent and no second ledger/outbox is created;
- local control commands use the authenticated gateway while Container work
  uses the canonical outbox assignment.

### section-03-runner-foundation-and-local-journal

Write Rust tests before implementation for:

- local/shared configuration separation and safe default profile;
- key material never serializes into diagnostics;
- bounded journal rejects or explicitly marks overflow;
- corruption/incomplete replay becomes unknown and fences unsafe work;
- duplicate journal replay is idempotent;
- clean shutdown drains safely and does not orphan child scopes.

### section-04-local-discovery-and-control-channel

Write tests for:

- discovery recognizes the six initial external-agent families and
  distinguishes installed, configured, authenticated, healthy, available and
  policy-allowed;
- discovery uses bounded approved sources/probes, fingerprints candidates,
  rejects arbitrary executable launch and keeps unknown tools metadata-only;
- tool and capability inventories are separated, redacted and published as
  one idempotent Runner snapshot with stale/tombstone behavior;
- PATH-only binaries are not advertised as ready;
- capability revision and expiry are enforced in offer acceptance;
- handshake/version negotiation and ACK state transitions;
- sequence ordering rejects duplicate/out-of-order events safely;
- WSS loss falls back to durable HTTPS and reconnect reconciliation;
- revoked identity cannot reconnect or accept work.

### section-05-job-execution-and-adapters

Write Rust integration tests for:

- each initial external-agent adapter registers only after valid transport,
  version and health/auth probes;
- Runner-gateway launch/control/evidence boundaries do not claim mediation of
  private internal agent tools that the adapter cannot observe;
- valid lease/fence starts exactly one supervised process scope;
- stale/expired lease and mismatched fence cannot start or complete work;
- cancellation stops the process tree according to adapter capability;
- pause/resume/steer are rejected when unsupported;
- adapter events are bounded, redacted and mapped to Feature 200 semantics;
- MCP access requires a Feature 199 grant and arbitrary upstream URLs fail;
- provider task identity is persisted before returning external-wait state;
- lost response/reconnect does not silently repeat irreversible submission;
- result/artifact verification precedes terminal success.

### section-06-shared-container-runner

Write isolation and lifecycle tests before the Container entrypoint:

- two tenants run concurrently with distinct workspaces and process scopes;
- a Job cannot read another Job's workspace, context or credential cache;
- Container restart during heartbeat, event or terminal reporting is safely
  reconciled by lease/fence rules;
- SIGTERM drains/aborts safely and does not claim success without canonical
  acknowledgement;
- Container does not stay alive only to poll an external provider;
- Container-local state loss does not lose durable Job truth;
- instance health/resource profile mismatch prevents admission;
- direct user-to-container command attempts are rejected.

Where Cloudflare integration tests require the platform, keep a local contract
fake plus a staging environment gate. Do not claim production deployment from
the fake.

### section-07-ui-task-control-and-connection

Write focused Vitest tests for:

- Runner and Worker App labels are distinct;
- local connection/readiness/reconciliation/revoked states render correctly;
- shared Container status is a projection of canonical Job state;
- expandable Task Control groups expose active step, target, latest safe event
  and verification state;
- no raw path, token, prompt or provider payload appears in the projection;
- unauthorized task groups are not rendered.

Write Playwright tests for:

- combined Feedback/Chat launcher opens inline without navigating to /chat;
- panel can show Runner connection and multi-step task state;
- /workers/connect can enroll/identify Runner distinct from Worker App;
- mobile/tablet/desktop layout keeps controls reachable;
- keyboard focus, disclosure semantics and status announcements work;
- loading, empty, reconciling, failure and success copy is localized.

### section-08-manual-release-workflow

Write static YAML/script tests for:

- workflow trigger contains workflow_dispatch only;
- no push, pull_request, schedule, tag, release or dependency trigger exists;
- platform/profile inputs include all four native targets and shared Container;
- artifact-only and publish decisions are explicit;
- manifest/checksum/source commit fields are required;
- secrets are referenced without echoing values;
- Container deployment is a Feature 204 handoff, not an implicit step;
- Worker App workflow files are unchanged.

Use a small parser/fixture test rather than starting the full Web compiler.

### section-09-platform-and-rollout-evidence

Define evidence checklists and focused smoke tests for:

- native target artifact naming and checksum verification;
- install/start/stop/reconnect on each native target;
- Container staging run with concurrent tenants and forced replacement;
- lease/fence and cost/instance gates;
- feature-gate enablement and rollback;
- completion/review documents linking each acceptance item to evidence.

These are environment gates and must be marked unverified when the target
platform or Cloudflare account is unavailable.

## Verification command policy

Allowed focused commands include:

- cargo test with the apps/runner-app manifest;
- selected Vitest files in apps/web;
- selected Playwright specs in apps/web/tests/e2e;
- YAML/static scripts and protocol fixture checks.

Do not run npm run typecheck, npm --workspace @smartspec/web run check or
another whole-repository TypeScript check.

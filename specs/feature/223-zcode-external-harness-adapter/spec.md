# Spec 223 — SmartAIHub ZCode External Harness Adapter
## Production-grade upstream-first integration, SmartAIHub Runner execution, Skill/MCP access, reliability, security, compatibility and controlled-fork fallback

**Status:** Proposed / Target architecture; in-repo ZCode adapter implementation pending  
**Spec ID:** 223  
**Revision:** 5 — ZCode context/Skill retrieval through Specs 230/229 without private vector stacks
**Date:** 2026-09-22  
**Target repository path:** `specs/feature/223-zcode-external-harness-adapter/spec.md`  
**Primary owner:** SmartAIHub External Agent Runtime / Harness Adapter Layer  
**Canonical upstream:** `https://github.com/zai-org/ZCode`  
**License at time of review:** Apache-2.0  
**Primary execution host:** SmartAIHub Runner; SmartAIHub Worker App may consume the same adapter package  
**Depends on:** Specs 186, 199, 200, 206, 218, 220, 221, 222 (learning/advisory), 229 (retrieval authority), 230 (harness context/bootstrap); Feature 195 Runner Control; existing `worker_jobs` / `worker_job_events`; shared Approval, Capability, Audit and Billing infrastructure  
**External architecture references verified on 2026-09-21:** ZCode upstream README/source tree, root package metadata, `zai-org/zcode-plugins` documentation, and current upstream feedback/known-issue records

---

## 0.1 Codebase alignment snapshot — 2026-09-22

No SmartAIHub-owned ZCode adapter, provider registration, Runner discovery/launch path, ZCode transport bridge or ZCode persistence was found in the current repository. The ZCode repository/package/version details below are external upstream observations, not codebase implementation evidence. Spec 223 therefore remains an adapter target and must not be described as an active provider.

# 0. Executive Decision

SmartAIHub SHALL integrate ZCode as a **replaceable external coding/agent execution harness**, not as a new SmartAIHub control plane and not as a second source of truth.

The implementation SHALL use an **upstream-first adapter**:

```text
SmartAIHub Web / Universal Assistant / Builder
                  ↓
          Spec 200 External Agent Control
                  ↓
        worker_jobs / worker_job_events
                  ↓
          SmartAIHub Runner Control
                  ↓
         ZCodeHarnessAdapter (Spec 223)
                  ↓
        ZCode Transport Strategy Resolver
        ├─ official RPC/client/server API
        ├─ local HTTP/WebSocket server
        ├─ structured Agent CLI
        └─ controlled subprocess fallback
                  ↓
              ZCode Runtime
                  ↓
        ┌─────────┼─────────┐
        │         │         │
     ZCode     Subagents   Tools
     Skills                / Hooks
        │
        └──────────────┐
                       ↓
             SmartAIHub Developer MCP/API
              Spec 199 / Spec 220 contracts
                       ↓
          SmartAIHub Skills / Assets / Knowledge
```

The adapter SHALL preserve ZCode-native capability while projecting it into the common provider interface defined by Spec 200.

SmartAIHub SHALL remain authoritative for:

- job identity and durable lifecycle;
- execution-node selection and Runner leases;
- approval and policy decisions;
- project/tenant authorization;
- Project Context Pack;
- SmartAIHub Skill identity, execution and publication;
- Library/Asset identity;
- billing/credits/revenue attribution;
- audit/provenance;
- independent result verification;
- release/publish state.

ZCode SHALL remain authoritative only for the internal mechanics of a ZCode session/turn/subagent/tool execution while that harness is executing.

---

# 1. Why a Separate Spec Is Required

Spec 200 intentionally treats ZCode as a future provider and already owns the provider-neutral runtime, normalized events, approvals, job lifecycle, Runner reliability and result verification. Spec 230 owns cross-harness bootstrap, Project Context Pack generation, version pinning and engineering instruction adapters. Spec 221 owns SmartAIHub Runtime Skill quality/release semantics.

Spec 223 therefore SHALL define only ZCode-specific behavior:

1. runtime discovery and installation;
2. upstream version compatibility;
3. transport negotiation;
4. process/server/session lifecycle;
5. mapping between SmartAIHub jobs and ZCode sessions/turns;
6. ZCode-native event parsing and normalized event emission;
7. approval/permission mapping;
8. cancellation/resume/recovery;
9. SmartAIHub Developer MCP/API injection;
10. ZCode plugin/skill/subagent interoperability boundaries;
11. result/evidence collection;
12. controlled fork and patch policy;
13. conformance and certification.

Spec 223 MUST NOT introduce:

- a second queue;
- a second approval database;
- a second Capability Registry;
- a second SmartAIHub Skill registry;
- a second Project Context Pack format;
- a second billing ledger;
- a second Runner control channel;
- a parallel release/publish path.

---

# 2. Current ZCode Integration Surface

At the time of this spec, upstream ZCode documents:

- Desktop, Web and terminal Agent surfaces;
- a standalone `zcode` package containing TUI, Web and Agent runtime;
- local Web/backend operation;
- HTTP/WebSocket backend service;
- `packages/server` for HTTP/WebSocket/remote connection;
- `packages/rpc` and `packages/client` for shared protocol / Agent client SDK;
- provider abstraction packages;
- `apps/zcode-cli` for Agent CLI, TUI, runtime and tools;
- local Web startup with `zcode --web --workspace ... --port ... --no-open`;
- localhost binding by default;
- token authentication options for server/API/WebSocket;
- a plugin system supporting commands, skills, subagents, hooks and MCP servers.

These are implementation observations, not permanent SmartAIHub assumptions. The adapter SHALL discover actual capability at runtime and SHALL NOT hard-code current internal URLs or private RPC shapes without a versioned compatibility profile.

Review-time upstream snapshot (informational, **not** a production pin): the upstream ZCode repository root `package.json` reports ZCode `3.14.0`; the official plugin contract documents session-scoped Hook snapshots and newline-delimited JSON-RPC for stdio MCP servers. Upstream feedback also contains active runtime/session issues, including a resumed-session failure report. Certification MUST therefore be based on exact-version real execution rather than package version or advertised capability alone.

**Review snapshot (2026-09-21):** the upstream repository root currently reports package version `3.14.0`; this is a source-tree observation only and MUST NOT be interpreted as an automatic production version selection. Production remains pinned by the certified compatibility profile. Current upstream documentation also states that Web mode binds to `127.0.0.1` by default, supports token authentication for server/API/WebSocket use, and packages runtime checksum metadata.

---

# 3. Goals

## 3.1 Primary Goals

- Add ZCode as a first-class Spec 200 provider.
- Allow users to select ZCode from SmartAIHub Web without opening the ZCode UI.
- Allow SmartAIHub to delegate Skill/Product/Mini App/platform engineering tasks to ZCode.
- Preserve ZCode-native strengths such as subagents, tools, plugins, hooks and skills when safe.
- Give ZCode governed access to SmartAIHub capabilities through existing MCP/API contracts.
- Keep jobs resumable and auditable when browser, backend, Runner or ZCode restarts.
- Support user-managed and SmartAIHub-managed ZCode installations.
- Pin and certify versions before production use.
- Support official upstream as primary and controlled fork as emergency fallback.
- Make ZCode replaceable without changing `DevelopmentWorkPackage` or `AgentTaskManifest` semantics.

## 3.2 Secondary Goals

- Enable ZCode as an optional builder/reviewer/tester in multi-harness workflows.
- Enable ZCode to build SmartAIHub Runtime Skills under Spec 221 without bypassing Skill certification.
- Allow future official ACP support without making ACP mandatory today.
- Allow ZCode runtime to evolve without forcing SmartAIHub core changes for every upstream release.

---

# 4. Non-Goals

Spec 223 SHALL NOT:

- fork ZCode into SmartAIHub as the default product strategy;
- embed ZCode Web/Desktop UI into SmartAIHub;
- use browser/UI automation to control ZCode in the normal path;
- copy user-created SmartAIHub Runtime Skills into ZCode as local harness skills;
- let ZCode directly access SmartAIHub Core SQL/R2/Vector/provider master credentials;
- let ZCode self-approve privileged operations;
- let ZCode self-declare a job successful without independent verification;
- publish a SmartAIHub Skill merely because a ZCode task completed;
- make a ZCode-local DB/session store a SmartAIHub source of truth;
- require the ZCode upstream `main` branch in production;
- auto-upgrade ZCode before compatibility certification.

---

# 5. Canonical Ownership Matrix

| Concern | Owner | Spec 223 role |
|---|---|---|
| Durable job | Spec 186 / `worker_jobs` | consume only |
| Job events | Spec 186 / `worker_job_events` | emit normalized/native-derived events |
| External-agent lifecycle | Spec 200 | implement ZCode provider |
| Runner channel | shared Runner infrastructure | use existing channel |
| MCP upstream gateway | Spec 199 | consume; do not duplicate |
| SmartAIHub developer data/capability API | Spec 220 | consume scoped contracts |
| A2A routing where applicable | Spec 206 | optional future interoperability |
| Development workspace/build mechanics | Spec 218 | integrate, do not replace |
| Runtime Skill lifecycle | Spec 221 | ZCode may author; never publish directly |
| Harness context/bootstrap | Spec 230 | consume generated pack/instructions |
| ZCode-native session/subagent details | ZCode + Spec 223 adapter | map/preserve |
| Adapter compatibility | Spec 223 | own |
| Controlled fork patch queue | Spec 223 / release engineering | own |

---

# 6. High-Level User Experience

## 6.1 User Chooses ZCode

Example:

```text
Build method
○ SmartAIHub
○ Claude Code
○ Codex
● ZCode
○ Auto
```

The Web UI SHOULD show:

```text
Provider        ZCode
Runtime         Local Runner / Managed Runner
Machine         DEV-WIN-01
Version         3.x.y (Certified)
Workspace       project-123 / isolated worktree
Status          Running
Current phase   Tests
Approvals       1 pending
Files changed   7
Tests           48 passed / 0 failed
Subagents       3 completed / 1 running
Context Pack    ctx_abc v12
Cost/usage      where available
```

The user SHALL NOT need to understand ZCode internals for normal use.

## 6.2 Harness Choice Remains User-Controlled

SmartAIHub MAY recommend eligible providers according to capability/policy, but the UI SHOULD expose valid alternatives when policy permits. Provider selection SHALL be recorded in job provenance.

---

# 7. Adapter Package Boundary

Recommended package structure:

```text
packages/smartaihub-agent-runtime/
  providers/
    zcode/
      index.ts
      zcode-adapter.ts
      capability-probe.ts
      runtime-discovery.ts
      runtime-installer.ts
      version-policy.ts
      compatibility-matrix.ts
      transport-resolver.ts
      transports/
        rpc-client-transport.ts
        web-server-transport.ts
        structured-cli-transport.ts
        subprocess-transport.ts
        acp-transport.ts              # disabled until certified
      process-manager.ts
      session-manager.ts
      event-normalizer.ts
      approval-mapper.ts
      permission-policy.ts
      context-adapter.ts
      mcp-config-builder.ts
      result-collector.ts
      verifier-input-builder.ts
      recovery-manager.ts
      redaction.ts
      telemetry.ts
      errors.ts
      types.ts
      tests/
```

The adapter package MUST implement the common Spec 200 provider interface. ZCode-specific fields MAY be added only under namespaced/native extension fields.

---

# 8. Provider Adapter Contract

Illustrative interface; exact shared types SHALL come from Spec 200 implementation rather than being duplicated.

```ts
interface ExternalHarnessAdapter {
  readonly providerId: string;

  discoverRuntime(ctx: DiscoveryContext): Promise<RuntimeCandidate[]>;
  probeRuntime(candidate: RuntimeCandidate): Promise<RuntimeProbe>;
  getCapabilities(runtime: ResolvedRuntime): Promise<ProviderCapabilities>;

  prepare(input: PrepareTaskInput): Promise<PreparedExecution>;
  start(input: StartExecutionInput): Promise<ProviderSession>;
  resume(input: ResumeExecutionInput): Promise<ProviderSession>;
  sendTurn(input: ProviderTurnInput): Promise<void>;

  approve(input: ProviderApprovalDecision): Promise<void>;
  cancel(input: CancelProviderExecution): Promise<void>;
  interrupt(input: InterruptProviderExecution): Promise<void>;

  streamEvents(session: ProviderSession): AsyncIterable<ProviderEventEnvelope>;
  collectResult(session: ProviderSession): Promise<ProviderResult>;
  health(runtime: ResolvedRuntime): Promise<ProviderHealth>;
  shutdown(session: ProviderSession): Promise<void>;
}
```

ZCode implementation SHALL NOT expose a second job abstraction above this interface.

---

# 9. Runtime Discovery

## 9.1 Discovery Order

Runner SHALL inspect, without modifying user state:

1. configured explicit ZCode path;
2. `PATH` (`zcode`, platform-specific wrappers);
3. known SmartAIHub-managed ZCode runtime directory;
4. optional configured workspace-local runtime;
5. controlled-fork runtime only when policy selects it.

## 9.2 Discovery Result

```ts
interface ZCodeRuntimeCandidate {
  executablePath: string;
  executableRealPath: string;
  source: 'USER_PATH' | 'SMARTAIHUB_MANAGED' | 'WORKSPACE' | 'CONTROLLED_FORK';
  version?: string;
  commit?: string;
  platform: 'windows' | 'macos' | 'linux' | string;
  arch: string;
  binarySha256?: string;
  installRoot?: string;
  dataRoot?: string;
  owner: 'USER' | 'SMARTAIHUB';
  mutableBySmartAIHub: boolean;
  trustState: 'USER_MANAGED' | 'MANAGED_VERIFIED' | 'MANAGED_UNVERIFIED';
}
```

## 9.3 User-Managed Runtime Protection

A user-managed ZCode installation MUST NOT be silently upgraded, removed, replaced or reconfigured by SmartAIHub.

If an incompatible user runtime is detected, UI options MAY include:

- Use existing version with limited/uncertified mode if policy allows;
- Install certified SmartAIHub-managed copy side-by-side;
- Select another provider.

---

# 10. SmartAIHub-Managed Installation

## 10.1 Installation Model

Managed ZCode SHALL be installed side-by-side under Runner-owned application data, for example:

```text
<runner-data>/runtimes/zcode/<version-or-build-id>/
```

It SHALL NOT overwrite the user's global `zcode` executable.

## 10.2 Install Manifest

```json
{
  "provider": "zcode",
  "source": "zai-org/ZCode",
  "version": "x.y.z",
  "commit": "...",
  "artifactSha256": "...",
  "adapterVersion": "1.0.0",
  "compatibilityProfile": "zcode-x.y",
  "installedAt": "...",
  "installationOwner": "SMARTAIHUB",
  "forkMode": "UPSTREAM"
}
```

## 10.3 Supply-Chain Controls

Managed installation SHALL:

- use allowlisted source/release channels;
- pin version/build identity;
- verify checksums/signatures where upstream provides them;
- retain third-party notices required by upstream licensing;
- record download source and hash;
- never execute an unreviewed installer purely because an LLM requested it;
- support rollback to last certified version;
- support offline/pre-provisioned artifacts for enterprise deployments.

---

# 11. Version Policy and Compatibility Matrix

Production SHALL NOT follow upstream `main` automatically.

A compatibility record SHALL exist:

```ts
interface ZCodeCompatibilityProfile {
  zcodeVersionRange: string;
  adapterVersionRange: string;
  runnerVersionRange: string;
  normalizedSchemaVersion: string;
  platforms: Array<{ os: string; arch: string }>;
  transports: ZCodeTransportKind[];
  transportContractVersion?: string;
  protocolFingerprint?: string;
  supportedCapabilities: string[];
  limitations: string[];
  testSuiteVersion: string;
  certificationStatus:
    | 'UNTESTED'
    | 'PROBING'
    | 'LAB_CERTIFIED'
    | 'CANARY'
    | 'CERTIFIED'
    | 'DEGRADED'
    | 'QUARANTINED'
    | 'BLOCKED'
    | 'RETIRED';
  certifiedAt?: string;
  upstreamCommit?: string;
  knownIssues?: string[];
  rollbackProfileId?: string;
}
```

Upgrade flow:

```text
upstream release/change
      ↓
compatibility probe
      ↓
unit/contract tests
      ↓
integration tests
      ↓
real ZCode smoke
      ↓
fault-injection/recovery tests
      ↓
security checks
      ↓
certify
      ↓
optional staged rollout
      ↓
default promotion
```

Failure MUST leave the previously certified runtime available.

---

# 12. Upstream vs Controlled Fork Policy

## 12.1 Default

```text
Primary source = zai-org/ZCode official upstream
```

## 12.2 Zero-Diff Mirror/Fork

SmartAIHub MAY maintain:

```text
smartaihub/ZCode
```

as a zero-diff mirror/emergency fallback.

## 12.3 Patched Fork

Patched fork SHALL be used only when an upstream blocker materially prevents production integration and no adapter-only workaround is safe.

Every local patch MUST include:

```yaml
patch_id: SAH-ZCODE-PATCH-xxx
reason: ...
upstream_issue: ...
security_impact: ...
introduced_against: <commit/version>
owner: ...
remove_when: ...
tests: ...
```

Local patches SHOULD be submitted upstream where appropriate.

## 12.4 No Silent Divergence

Release tooling MUST report:

- commits ahead/behind upstream;
- active patch IDs;
- upstream target commit;
- last rebase/test date;
- compatibility status.

---

# 13. Transport Strategy Resolver

ZCode transport SHALL be capability-driven rather than hard-coded to one mechanism.

Priority:

```text
T1 official stable RPC/client/server programmatic surface
T2 local HTTP/WebSocket server surface
T3 structured Agent CLI surface
T4 controlled subprocess/stdio fallback
T5 official ACP transport, only after upstream support is stable/certified
```

UI automation SHALL NOT be an accepted production transport except for separately approved diagnostics/testing outside normal execution.

## 13.1 Selection Record

Every provider session SHALL persist:

```json
{
  "provider": "zcode",
  "runtimeVersion": "...",
  "transport": "LOCAL_HTTP_WS",
  "transportContractVersion": "...",
  "adapterVersion": "..."
}
```

## 13.2 Failover

Transport failover is permitted only before the first mutating turn unless the target transport can prove safe session resume.

After mutation begins, switching transport MUST NOT duplicate a turn or replay a non-idempotent command blindly.

---

# 14. Local Server Lifecycle

For a certified Web/server transport, Runner SHOULD start ZCode against an isolated workspace and a dynamically allocated localhost port.

Conceptual invocation:

```text
zcode --web
  --workspace <isolated-workspace>
  --port <ephemeral-port>
  --no-open
```

Runner SHALL:

- bind to loopback for local integration;
- generate an ephemeral strong auth token where server transport supports token auth;
- pass token through process environment/secure IPC rather than logs;
- never expose the port publicly by default;
- wait for positive health readiness;
- record PID/process group;
- terminate child process group safely;
- detect stale prior processes;
- not reuse a server across tenants unless a certified isolation model explicitly permits it.

---

# 15. Authentication Boundary

## 15.1 ZCode User Authentication

Where ZCode uses a user's existing local account/session, SmartAIHub Runner SHALL invoke it under that local user context when technically supported.

Runner MUST NOT:

- scrape ZCode cookies/tokens;
- export subscription credentials to SmartAIHub backend;
- log local access tokens;
- copy credentials between users/machines;
- store ZCode credentials in `worker_jobs`.

## 15.2 Adapter-to-ZCode Server Token

A local server token generated by Runner is an IPC control secret, distinct from provider subscription credentials.

It SHALL be:

- job/session scoped where practical;
- short lived;
- held locally;
- redacted from logs/events;
- rotated on server restart where practical.

---

# 16. Workspace Isolation

Default execution SHALL use Spec 218 workspace isolation, preferably a dedicated Git worktree or managed sandbox workspace.

```text
canonical repo
    ↓
immutable base revision
    ↓
isolated worktree/workspace
    ↓
ZCode
    ↓
candidate changes
    ↓
independent diff/test/build verification
```

ZCode SHOULD NOT edit the user's canonical working tree by default for SmartAIHub-delegated jobs.

Exceptions require explicit user/policy selection and visible risk disclosure.

---

# 17. Project Context Pack Integration

Spec 223 SHALL consume Spec 230's canonical Project Context Pack.

It SHALL transform the pack into the minimum ZCode-facing instruction/bootstrap files needed for the selected task without duplicating the full platform documentation.

Possible generated artifacts:

```text
AGENTS.md or ZCode-appropriate project instruction map
.smartaihub/context-manifest.json
.smartaihub/task-manifest.json
.smartaihub/retrieval-policy.json
.smartaihub/capability-endpoints.json
```

These files are **instructions/context, not permissions**.

The adapter MUST NOT infer authorization from repository text, ZCode plugin text, MCP tool descriptions or model output.

---

# 18. SmartAIHub Engineering Skill Pack in ZCode

ZCode supports harness-local skills/plugins. Spec 230 may therefore project SmartAIHub first-party engineering guidance into a ZCode-compatible harness package.

This is a `HARNESS_ENGINEERING_SKILL`, not a Spec 221 Runtime Skill.

Recommended ZCode-facing engineering components:

```text
smartaihub-orchestrator
smartaihub-platform-context
smartaihub-skill-engineering
smartaihub-miniapp-engineering
smartaihub-ui-ux-engineering
smartaihub-capability-integration
smartaihub-release-verification
```

The adapter SHALL version these packages independently of user-created SmartAIHub Runtime Skills.

---

# 19. ZCode Plugin Boundary

ZCode plugins can include commands, skills, subagents, hooks and MCP declarations.

SmartAIHub SHALL treat enabling such plugins as executable-code trust.

Policy classes:

```text
UPSTREAM_BUILTIN
SMARTAIHUB_FIRST_PARTY
TENANT_APPROVED
USER_LOCAL
UNTRUSTED_OR_UNKNOWN
```

Enterprise/tenant policy MAY allowlist plugin IDs/versions/hashes.

A ZCode plugin SHALL NOT automatically become a SmartAIHub Plugin or SmartAIHub Runtime Skill.

---

# 20. SmartAIHub MCP/API Access

ZCode SHALL access SmartAIHub capabilities through governed external contracts, not direct database/storage credentials.

The adapter MAY inject job-scoped MCP configuration for capabilities such as:

```text
smartaihub.capability.search
smartaihub.capability.describe
smartaihub.skill.search
smartaihub.skill.describe
smartaihub.skill.invoke
smartaihub.skill.status
smartaihub.skill.result
smartaihub.asset.describe
smartaihub.asset.materialize
smartaihub.knowledge.search
smartaihub.development.submitEvidence
```

Actual names SHALL follow Spec 199/220 canonical contracts.

MCP/API credentials SHALL be:

- job scoped;
- tenant scoped;
- least privilege;
- time bounded;
- revocable;
- audited;
- never committed into repository files.

---

# 21. SmartAIHub Runtime Skills Must Stay Remote

A critical invariant:

```text
ZCode must not need to download/install SmartAIHub Runtime Skill packages
in order to invoke them.
```

Invocation path:

```text
ZCode
  ↓
SmartAIHub MCP/API
  ↓
Capability/Skill Gateway
  ↓
Policy + Billing + Version Resolution
  ↓
Skill Runtime
  ↓
Result
```

This preserves:

- Skill licensing/IP;
- current versions;
- credit accounting;
- revenue sharing;
- permissions;
- tenant isolation;
- execution policy.

---

# 22. Agent Task Mapping

Spec 223 SHALL accept the provider-neutral `AgentTaskManifest` / `DevelopmentWorkPackage` from Specs 200/222.

It SHALL convert that into ZCode-native turn/session input while preserving:

- user intent;
- task constraints;
- workspace;
- selected assets;
- context pack;
- allowed capabilities;
- approval policy;
- budgets/limits;
- required evidence;
- expected artifact class.

Provider prompt syntax MUST NOT become the canonical task format.

---

# 23. Session Mapping

Persist a mapping:

```ts
interface ZCodeSessionBinding {
  workerJobId: string;
  smartaihubSessionId: string;
  zcodeSessionId?: string;
  zcodeConversationId?: string;
  transportSessionId?: string;
  runtimeInstanceId: string;
  workspaceId: string;
  runtimeVersion: string;
  adapterVersion: string;
  transport: ZCodeTransportKind;
  state: string;
  executionAttemptId: string;
  fencingToken: string;
  normalizedSchemaVersion: string;
  extensionSnapshotHash?: string;
  createdAt: string;
  lastObservedAt: string;
}
```

ZCode IDs are provider metadata; `workerJobId` remains canonical.

---

# 24. Turn Identity and Exactly-Once Intent

Every mutating turn SHALL receive a SmartAIHub idempotency/correlation key.

```text
job_id + turn_index + command_id
```

The adapter SHALL distinguish:

- command accepted by Runner;
- submitted to ZCode;
- acknowledged by ZCode transport;
- mutation observed;
- turn completed;
- result verified.

A reconnect MUST NOT automatically re-submit a turn merely because the completion event was missed.

Recovery SHALL reconcile observed state first.

---

# 25. Normalized Event Mapping

Spec 223 SHALL emit Spec 200 normalized event envelopes and preserve raw/native provider payload separately.

Required families include at minimum:

```text
provider.runtime.detected
provider.runtime.health
provider.session.starting
provider.session.started
provider.session.resumed
provider.session.stopped
provider.turn.started
provider.turn.completed
provider.turn.failed
agent.message.delta
agent.message.completed
agent.plan.updated
agent.tool.started
agent.tool.completed
agent.tool.failed
agent.command.started
agent.command.completed
agent.file.changed
agent.subagent.started
agent.subagent.completed
agent.subagent.failed
approval.requested
approval.resolved
usage.updated
artifact.discovered
verification.requested
provider.error
```

Each normalized event SHALL include sequence/correlation metadata and MAY include:

```json
{
  "provider": "zcode",
  "normalized": {},
  "nativeRef": "blob_or_event_ref",
  "nativeSummary": {}
}
```

Large native payloads SHOULD be offloaded from hot event rows to object/log storage with an immutable reference.

---

# 26. Native Event Preservation

Normalization MUST NOT erase ZCode-specific details such as:

- subagent identity/parentage;
- native tool name;
- plugin/hook identity;
- ZCode session/turn IDs;
- provider usage details;
- internal step types;
- native stop/error codes.

Native detail SHALL be retained according to audit/privacy retention policy. Native preservation is subordinate to secret/DLP policy: a payload containing credentials or prohibited sensitive content MUST be redacted, encrypted/restricted, or omitted according to policy rather than persisted indefinitely merely to preserve provider-native fidelity.

---

# 27. Durable Runner Event Boundary

Required path:

```text
ZCode
  ↓
ZCode Adapter
  ↓
Normalized event + native reference
  ↓
Runner durable local event buffer
  ↓
Runner Control Channel
  ↓
Backend ACK
  ↓
worker_job_events / trace storage
```

The ZCode runtime MUST NOT depend on a live browser or direct SmartAIHub backend socket.

Runner disconnect SHALL not lose already observed provider events.

---

# 28. Approval Mapping

ZCode-native permission/tool confirmation requests SHALL be mapped into the shared SmartAIHub Approval Service.

Example risk classes:

```text
READ_WORKSPACE
WRITE_WORKSPACE
DELETE_FILE
RUN_COMMAND
NETWORK_ACCESS
INSTALL_DEPENDENCY
MODIFY_GIT
PUSH_REMOTE
WRITE_REMOTE
CREATE_EXTERNAL_RESOURCE
DELETE_EXTERNAL_RESOURCE
ACCESS_SECRET
CALL_SMARTAIHUB_CAPABILITY
DEPLOY
PUBLISH
```

The adapter SHALL send enough structured context for the user/policy engine to decide, but SHALL redact secrets.

ZCode SHALL receive only the resulting decision appropriate to its native protocol.

---

# 29. Approval Authority

Neither ZCode, a ZCode plugin, a ZCode subagent nor a repository instruction may widen SmartAIHub authorization.

Approval precedence:

```text
Platform hard deny
  > tenant policy
  > project policy
  > job grant
  > user approval
  > harness request
```

A denied operation SHALL fail closed.

---

# 30. Cancellation and Interrupt

User cancel from SmartAIHub Web SHALL propagate:

```text
Web
 ↓
Spec 200 job command
 ↓
Runner
 ↓
ZCode adapter
 ↓
native cancel/interrupt if supported
 ↓
process termination fallback when safe
```

Cancellation states SHALL distinguish:

```text
CANCEL_REQUESTED
CANCEL_ACKNOWLEDGED
CANCELLED
CANCEL_FAILED
```

Hard process kill is a last resort and SHALL trigger workspace reconciliation/verification.

---

# 31. Resume

Resume capability SHALL be advertised dynamically.

Possible resume levels:

```text
NONE
WORKSPACE_ONLY
NEW_SESSION_FROM_STATE
NATIVE_SESSION_RESUME
NATIVE_TURN_RESUME
```

SmartAIHub must not claim native resume unless the certified ZCode transport/version supports it.

If native session resume is unavailable, Spec 230 engineering state + workspace + context pack MAY seed a new ZCode session.

---

# 32. Crash and Restart Recovery

Recovery cases:

1. browser closes;
2. backend restarts;
3. Runner reconnects;
4. Runner process restarts;
5. ZCode server dies;
6. ZCode session store becomes unavailable;
7. machine sleeps/wakes;
8. network drops;
9. SmartAIHub MCP credential expires;
10. upstream ZCode process hangs.

Recovery procedure SHALL be:

```text
load canonical worker_job
      ↓
load Runner durable execution record
      ↓
inspect workspace/process/server/session
      ↓
reconcile observed state
      ↓
choose resume/restart/fail-safe action
      ↓
emit recovery evidence
```

It MUST NOT assume a job failed solely because the ZCode process disappeared; workspace and result state must be inspected.

---

# 33. ZCode Local Persistence Is Non-Authoritative

Any ZCode local database/session store is an implementation detail.

SmartAIHub SHALL persist enough platform-owned state to recover or continue with a new harness:

- requirement;
- plan/work items where available;
- workspace/base/candidate revisions;
- context pack version;
- approvals;
- capability grants;
- evidence/results;
- adapter/runtime/transport versions;
- budget/limits;
- last known provider state.

A ZCode DB failure MUST NOT corrupt SmartAIHub job history.

---

# 34. Subagents

ZCode subagents MAY execute inside one ZCode provider session.

SmartAIHub SHOULD expose them as provider-native child activities/events, not automatically as independent `worker_jobs`.

Promote a subtask to a SmartAIHub child job only when orchestration semantics require independent:

- retry;
- provider choice;
- approval scope;
- budget;
- workspace/revision;
- verification;
- audit ownership.

This prevents duplicating ZCode's internal orchestration in the SmartAIHub job graph.

---

# 35. Hooks

ZCode plugin hooks may execute at lifecycle/tool boundaries.

SmartAIHub SHALL treat hook side effects as part of harness execution trust and SHOULD capture hook-related native events where exposed.

SmartAIHub first-party ZCode hooks MAY be used for:

- injecting non-secret correlation IDs;
- evidence capture;
- policy advisory checks;
- formatting structured completion evidence.

They MUST NOT become the sole enforcement point for platform security policy.

---

# 36. File Change Detection

The adapter SHALL NOT rely only on model self-report.

Independent workspace observer SHALL collect:

```text
base revision
current revision
untracked files
modified files
staged files
Git diff
binary changes
large-file changes
symlink changes
```

Final result SHALL identify actual changed files independently of ZCode output.

---

# 37. Command Evidence

Where permitted, the adapter/Runner SHALL record structured command evidence:

```text
command hash / redacted command summary
cwd
start/end
exit code
stdout/stderr references
resource limits
approval ID if applicable
```

Secrets SHALL be redacted before persistence.

---

# 38. Result Collection

Provider result SHALL include, where available:

```ts
interface ZCodeProviderResult {
  provider: 'zcode';
  providerSessionId?: string;
  completionStatus: string;
  summary?: string;
  changedFiles: string[];
  nativeArtifacts: ProviderArtifactRef[];
  subagentSummary?: unknown;
  usage?: unknown;
  nativeMetadataRef?: string;
}
```

This is not yet the trusted SmartAIHub result.

---

# 39. Independent Verification

After ZCode reports completion:

```text
ZCode completion
   ↓
workspace inspection
   ↓
required test commands
   ↓
lint/typecheck/build
   ↓
artifact validation
   ↓
security/policy checks
   ↓
Spec 221 evals where Skill task
   ↓
verification verdict
```

A job SHALL NOT be marked `SUCCEEDED_VERIFIED` solely because ZCode says it is complete.

---

# 40. Skill Engineering Flow

For `artifactClass = RUNTIME_SKILL`:

```text
User request
 ↓
Spec 230 classification/context
 ↓
Spec 221 Skill Engineering job
 ↓
ZCode selected as builder
 ↓
ZCode edits isolated Skill workspace
 ↓
SmartAIHub Skill capability calls via governed API/MCP
 ↓
Spec 221 tests/evals/security/review
 ↓
Release candidate
 ↓
Publication decision by Spec 221 policy
```

ZCode SHALL NOT publish the Skill directly.

---

# 41. Product / Mini App Engineering Flow

For Product/Mini App work:

```text
DevelopmentWorkPackage
 ↓
Spec 230 context/methodology
 ↓
Spec 218 isolated workspace
 ↓
ZCode adapter
 ↓
implementation
 ↓
build/test/preview evidence
 ↓
Spec 218 release candidate
 ↓
Spec 219 deployment lifecycle if approved
```

---

# 42. Platform-Core Engineering Boundary

ZCode MAY be used for SmartAIHub Core development only in separately authorized admin engineering workspaces.

Normal tenant/product credentials SHALL NOT grant access to SmartAIHub Core repositories, secrets or deployment authority.

---

# 43. Capability Advertisement

Runner SHALL advertise a ZCode runtime record to the shared execution-node/capability registry:

```json
{
  "provider": "zcode",
  "status": "READY",
  "version": "...",
  "adapterVersion": "...",
  "certification": "CERTIFIED",
  "transports": ["LOCAL_HTTP_WS"],
  "capabilities": {
    "coding": true,
    "multiTurn": true,
    "resume": "NATIVE_SESSION_RESUME",
    "subagents": true,
    "mcp": true,
    "plugins": true,
    "hooks": true,
    "structuredEvents": true
  }
}
```

Capabilities SHALL be probed, not assumed globally.

---

# 44. Health Model

```text
NOT_INSTALLED
DETECTED
PROBING
READY
AUTH_REQUIRED
DEGRADED
INCOMPATIBLE
QUARANTINED
CRASH_LOOP
DISABLED
```

Health SHALL combine:

- executable/server availability;
- version compatibility;
- authentication readiness where detectable without exposing secrets;
- transport handshake;
- workspace write/read probe where safe;
- event stream probe;
- SmartAIHub MCP connectivity if required by task.

---

# 45. Error Contract

Map ZCode failures into Spec 200 errors, preserving native detail separately.

At minimum:

```text
RUNTIME_NOT_FOUND
RUNTIME_UNSUPPORTED
RUNTIME_INCOMPATIBLE
AUTH_REQUIRED
AUTH_FAILED
SESSION_NOT_FOUND
SESSION_EXPIRED
PROVIDER_BUSY
PROVIDER_RATE_LIMITED
PERMISSION_DENIED
APPROVAL_TIMEOUT
PROCESS_CRASHED
PROTOCOL_ERROR
TRANSPORT_LOST
TRANSPORT_UNSUPPORTED
WORKSPACE_ERROR
PLUGIN_ERROR
MCP_ERROR
CONTEXT_INJECTION_ERROR
VERIFICATION_FAILED
CANCELLED
RECOVERY_REQUIRED
UNKNOWN_PROVIDER_ERROR
```

---

# 46. Timeouts and Watchdogs

Separate timeouts SHALL exist for:

- process startup;
- server readiness;
- transport handshake;
- first event;
- approval wait;
- turn inactivity;
- tool inactivity;
- cancellation;
- graceful shutdown;
- verification.

Long model reasoning MUST NOT be treated as a dead process solely due to lack of text tokens if heartbeat/process health remains valid.

---

# 47. Resource Limits

Runner policy MAY enforce:

- CPU/memory limits where platform supports them;
- max child processes;
- disk/workspace quota;
- max generated file size;
- max execution duration;
- max provider turns;
- max retries;
- max concurrent subagents where observable/configurable;
- network egress policy.

Provider limits and SmartAIHub job limits SHALL be distinguished.

---

# 48. Network Security

Local integration SHOULD bind ZCode server to loopback only.

Remote ZCode server use, if later supported, SHALL require a separate certified profile with:

- authenticated encrypted transport;
- explicit endpoint allowlist;
- tenant policy;
- server identity validation;
- egress controls;
- no implicit trust from endpoint reachability alone.

---

# 49. Secrets Handling

Secrets SHALL NOT appear in:

- prompts unless explicitly required and securely projected;
- generated instruction files;
- Git diffs;
- normalized events;
- native event previews;
- UI logs;
- artifact manifests.

Use secret references/ephemeral environment injection where required.

Runner SHALL redact known token/password patterns before persistence.

---

# 50. Prompt-Injection / Untrusted Repository Content

Repository files, issue text, web content, MCP descriptions, Skill descriptions and generated artifacts SHALL be treated as untrusted data with respect to authorization.

The adapter SHALL preserve Spec 230 trust labels/context provenance where available.

Untrusted content cannot override:

- platform hard denies;
- tenant policy;
- job grant;
- MCP capability scope;
- deployment/publish restrictions;
- billing limits.

---

# 51. Data Isolation

Each execution SHALL be scoped to one authorized tenant/project/workspace context unless an explicit cross-project job grants more.

No shared ZCode server/session may leak:

- prompts;
- workspace paths;
- session history;
- plugin data;
- MCP credentials;
- native event payloads

across tenants/users.

---

# 52. Local Data Directory Strategy

SmartAIHub-managed ZCode MAY receive a dedicated `ZCODE_DATA_BASE_DIR` per Runner profile or execution isolation policy.

Modes:

```text
USER_EXISTING_DATA          # only for explicitly user-managed local harness use
SMARTAIHUB_MANAGED_PROFILE  # recommended managed runtime
JOB_EPHEMERAL_PROFILE       # strongest isolation, higher startup cost
```

The chosen mode SHALL be recorded in provenance.

---

# 53. Plugin Installation Policy

A model SHALL NOT autonomously install arbitrary ZCode plugins without policy/approval.

Plugin installation request SHALL include:

- source;
- version/commit;
- requested components;
- commands/scripts;
- network access;
- filesystem writes;
- hooks;
- MCP servers;
- third-party dependencies/licenses.

SmartAIHub first-party certified plugin packs MAY be preapproved by tenant policy.

---

# 54. SmartAIHub First-Party ZCode Bridge Plugin

Optional first-party bridge package MAY be created if it materially simplifies integration.

Recommended contents:

```text
.zcode-plugin/plugin.json
skills/
  smartaihub-orchestrator/
  smartaihub-platform-context/
agents/
  smartaihub-reviewer.md
hooks/
  hooks.json
.mcp.json
README.md
```

However, critical transport/reliability/security SHALL remain in Runner adapter code, not only in plugin hooks.

---

# 55. Billing and Usage

The adapter SHALL report available usage metadata but SHALL NOT invent provider cost when ZCode does not expose authoritative usage/cost.

SmartAIHub Skill invocations initiated by ZCode SHALL flow through normal Skill billing/revenue attribution. Each job MAY define a `smartaihubSkillSpendBudget` and per-capability ceilings; exceeding them SHALL require policy-defined approval or fail closed rather than silently continuing paid calls.

Local subscription/account cost is distinct from SmartAIHub credits unless a future explicit billing integration exists. SmartAIHub-managed automation SHALL respect applicable ZCode/Z.ai account entitlement and service terms; possession of a local authenticated session does not imply authorization to bypass seat, account, rate-limit or automation restrictions.

---

# 56. Observability

Metrics SHOULD include:

```text
zcode_runtime_detect_total
zcode_runtime_probe_latency
zcode_session_start_total
zcode_session_start_failure_total
zcode_turn_total
zcode_turn_duration
zcode_event_lag
zcode_approval_wait_duration
zcode_transport_disconnect_total
zcode_recovery_total
zcode_process_crash_total
zcode_verification_failure_total
zcode_version_block_total
zcode_patch_fork_usage_total
```

Labels MUST avoid high-cardinality secrets/user content.

---

# 57. Trace Correlation

Propagate non-secret IDs:

```text
trace_id
job_id
command_id
session_id
turn_id
provider_session_id
runner_id
workspace_id
context_pack_id
```

Provider-native IDs SHALL be mapped but not used as the sole cross-system identifier.

---

# 58. Audit Trail

Audit SHOULD answer:

- who requested ZCode;
- which provider/runtime/version was selected;
- which machine/Runner executed;
- which workspace/base revision;
- which context pack/version;
- which SmartAIHub capabilities were granted;
- which approvals were requested/resolved;
- which plugins/skills/hooks were active;
- which files changed;
- which tests/builds/evals ran;
- which artifacts were created;
- whether upstream or patched fork ran;
- final verification verdict.

---

# 59. Admin UI Requirements

Admin/Developer settings SHOULD show:

```text
ZCode provider
  Enabled                 yes/no
  Policy                  Allowed / Restricted / Blocked
  Runtime source          User / SmartAIHub managed / Fork
  Installed version       x.y.z
  Certified version       x.y.z
  Adapter version         a.b.c
  Transport               HTTP/WS
  Health                  Ready
  Auth                    User-managed / Required
  Active patches          none
  Last probe              ...
  Known limitations       ...
```

Actions:

- Probe;
- Install certified copy;
- Roll back;
- Disable;
- View compatibility;
- View diagnostics;
- View licenses/notices;
- select preferred source policy.

---

# 60. End-User UI Requirements

Normal users SHOULD see only task-relevant information:

- ZCode available/unavailable;
- version certification warning if relevant;
- device/runtime choice;
- job progress;
- approvals;
- changed files/evidence;
- result;
- retry/resume/cancel.

They SHOULD NOT be forced to configure ports, RPC endpoints or local database paths.

---

# 61. Degraded Mode

If ZCode is installed but only a lower-grade transport is available, the adapter MAY advertise degraded capabilities.

Example:

```text
READY:
  structured events
  approvals
  native resume

DEGRADED:
  text/structured CLI only
  no native approval callback
  workspace-only resume
```

SmartAIHub SHALL not silently claim features absent from the selected compatibility profile.

---

# 62. Provider Selection Eligibility

ZCode SHALL be eligible only if:

- runtime passes minimum probe;
- version is permitted by tenant/system policy;
- required task capability is present;
- workspace is accessible;
- required auth is ready;
- required SmartAIHub capability path is reachable;
- no active quarantine/block exists.

---

# 63. Quarantine

A ZCode version/profile MAY be quarantined for:

- security issue;
- protocol incompatibility;
- data corruption risk;
- repeated crash loop;
- unsafe approval behavior;
- event loss/recovery failure;
- verified upstream regression.

Quarantine SHALL prevent new jobs but SHOULD preserve evidence and permit safe recovery/export of existing work.

---

# 64. Upstream Change Detection

CI/release automation SHOULD monitor:

- new upstream tags/releases when available;
- relevant changes to server/rpc/client/CLI contracts;
- plugin/hook/MCP contract changes;
- runtime dependency changes;
- security notices;
- license/NOTICE changes.

Detection SHALL create a compatibility review; it SHALL NOT auto-promote production.

---

# 65. Test Strategy

## 65.1 Unit Tests

1. runtime path discovery;
2. user-managed runtime protection;
3. version parsing;
4. compatibility resolution;
5. transport priority;
6. token redaction;
7. context transformation;
8. MCP config generation;
9. event normalization;
10. error normalization;
11. approval mapping;
12. cancellation state machine;
13. resume-level calculation;
14. result collection;
15. fork/patch policy.

## 65.2 Contract Tests

16. common Spec 200 adapter interface;
17. normalized event schema;
18. `worker_job` correlation;
19. Runner command ACK/event ACK;
20. durable local event replay;
21. Approval Service integration;
22. Context Pack version integrity;
23. Capability Registry advertisement;
24. Spec 220 scoped capability access;
25. Spec 221 Skill evidence handoff.

## 65.3 Integration Tests With Real ZCode

26. detect existing installation;
27. managed installation;
28. start local server/runtime;
29. handshake;
30. create session;
31. send coding task;
32. observe message events;
33. observe command/tool events;
34. file mutation;
35. approval request/decision;
36. SmartAIHub MCP tool invocation;
37. subagent activity;
38. complete task;
39. collect result;
40. independent verification.

## 65.4 Reliability / Fault Injection

41. disconnect Runner Control channel mid-turn;
42. backend restart;
43. browser close;
44. Runner restart;
45. ZCode process crash;
46. ZCode server crash;
47. machine sleep/wake simulation;
48. duplicate command delivery;
49. lost event ACK;
50. out-of-order event arrival;
51. approval timeout;
52. MCP token expiry;
53. workspace disk full;
54. process hang;
55. partial result after crash;
56. native session unavailable but workspace intact.

## 65.5 Security Tests

57. token not logged;
58. secret redaction;
59. loopback-only binding;
60. unauthorized MCP capability denied;
61. cross-tenant isolation;
62. malicious repository instruction cannot widen permission;
63. malicious ZCode plugin requires approval/policy;
64. symlink/path traversal defense;
65. command approval enforcement;
66. deployment/publish hard deny;
67. user runtime not modified;
68. fork artifact hash verification.

## 65.6 Upgrade Tests

69. certified old → candidate new;
70. adapter old/new compatibility;
71. rollback;
72. active job remains pinned to original runtime;
73. incompatible upstream version blocked;
74. patch fork activated explicitly;
75. patched fork removed after upstream fix.

## 65.7 Skill Engineering Tests

76. ZCode creates valid Skill source;
77. schemas generated correctly;
78. Skill discovery via remote SmartAIHub gateway;
79. Skill invocation billed normally;
80. no local Runtime Skill install;
81. eval failure prevents publication;
82. successful ZCode completion still requires Spec 221 release gate.

---

# 66. Certification Matrix

Each certified profile SHOULD record:

```text
OS: Windows x64
Runner: version
ZCode: version/commit
Adapter: version
Transport: kind/version
Node/runtime prerequisite: version
Auth mode: local user
MCP: yes/no
Subagents: yes/no
Native resume: level
Approval callback: level
Fault-injection suite: pass/fail
Security suite: pass/fail
Known limitations
```

Certification SHOULD cover Windows, macOS and Linux independently where supported.

---

# 67. Implementation Phases

## Phase 0 — Contract Lock

- confirm Spec 200 adapter interface;
- confirm shared event/error/approval types;
- add `provider_id = zcode`;
- add compatibility registry schema;
- no runtime execution yet.

## Phase 1 — Discovery + Probe

- executable discovery;
- version detection;
- capability probe;
- UI readiness state;
- user-managed runtime protection.

## Phase 2 — Primary Transport

- implement highest-quality currently stable official programmatic transport;
- local server process manager if selected;
- session start/stop;
- event stream;
- basic task/turn.

## Phase 3 — Reliability

- durable Runner event buffer;
- sequence-aware ACK/replay and backpressure;
- lease fencing / split-brain prevention;
- workspace exclusive lock;
- cancel;
- pause/interrupt/steering where supported;
- resume/reconciliation;
- crash recovery;
- orphan-process/resource cleanup;
- watchdogs.

## Phase 4 — Policy + Approval

- permission mapping;
- Approval Service;
- command/network/file risk classes;
- egress/SSRF policy;
- dependency-install policy;
- secret projection, scanning, quarantine and redaction;
- plugin/hook/MCP extension snapshot policy;
- audit trace.

## Phase 5 — SmartAIHub Capability Bridge

- job-scoped MCP/API projection;
- context pack transformation;
- SmartAIHub engineering skill pack;
- asset/knowledge/capability access.

## Phase 6 — Skill Engineering

- Spec 221 source workflow;
- tests/evals/evidence;
- no-publish bypass validation.

## Phase 7 — Managed Install + Version Governance

- managed side-by-side runtime;
- checksum/license/SBOM/provenance records;
- compatibility and rolling-schema certification;
- rollback profile;
- canary burn-in;
- emergency profile kill switch;
- staged rollout.

## Phase 8 — Controlled Fork Fallback

- zero-diff mirror;
- patch metadata system;
- build/sign/hash pipeline;
- explicit fallback policy;
- upstream rebase/removal workflow.

## Phase 9 — Advanced Native Capabilities

- richer subagent visualization;
- plugin inventory/policy;
- hook observability;
- richer usage telemetry;
- official ACP transport if upstream certifies it.

---

# 68. Migration / Rollout

Rollout SHALL be additive.

```text
Existing Spec 200 providers continue unchanged
              +
           ZCode provider
```

No existing Claude/Codex/Antigravity/DeepSeek workflow shall be migrated automatically.

Suggested stages:

```text
OFF
→ ADMIN_ONLY
→ INTERNAL_BETA
→ TENANT_ALLOWLIST
→ GENERAL_AVAILABLE
```

Each stage SHOULD support immediate provider disable without damaging jobs executed by other adapters.

---

# 69. Acceptance Criteria

The implementation is acceptable only when all applicable items pass:

- [ ] `zcode` is a Spec 200 provider, not a new control plane.
- [ ] No second job queue/database is created.
- [ ] Existing `worker_jobs` / `worker_job_events` remain canonical.
- [ ] Existing Runner Control Channel is reused.
- [ ] ZCode runtime is automatically discoverable.
- [ ] User-managed ZCode is never silently replaced.
- [ ] SmartAIHub-managed side-by-side install exists.
- [ ] Production ZCode version is pinned/certified.
- [ ] Upstream `main` is never an implicit production dependency.
- [ ] Runtime/version/adapter/transport identity is recorded per job.
- [ ] Transport is negotiated by capability profile.
- [ ] Official programmatic transport is preferred.
- [ ] Local server binds loopback by default.
- [ ] Local server control token is redacted and local.
- [ ] SmartAIHub does not scrape ZCode user credentials.
- [ ] Workspace isolation is default.
- [ ] Spec 230 Project Context Pack is consumed, not reinvented.
- [ ] Generated instructions cannot widen permissions.
- [ ] SmartAIHub Developer MCP/API uses least-privilege job credentials.
- [ ] SmartAIHub Runtime Skills remain remotely invoked.
- [ ] ZCode plugin skills are not confused with Spec 221 Runtime Skills.
- [ ] Normalized events are emitted.
- [ ] Native event detail is retained separately.
- [ ] Runner durable buffer survives control-channel outage.
- [ ] Duplicate command delivery does not duplicate mutation blindly.
- [ ] Approval requests map into shared Approval Service.
- [ ] Denied operations fail closed.
- [ ] Web cancel reaches ZCode.
- [ ] Resume capability is truthfully advertised.
- [ ] Crash recovery reconciles observed workspace/process state.
- [ ] ZCode local DB/session state is non-authoritative.
- [ ] Subagents are visible without forcing every subagent into `worker_jobs`.
- [ ] File diff is collected independently.
- [ ] Tests/build/evals are verified independently.
- [ ] ZCode self-report alone cannot mark verified success.
- [ ] Skill publication still follows Spec 221.
- [ ] Product release/deploy still follows Specs 218/219.
- [ ] Tenant credentials cannot modify SmartAIHub Core.
- [ ] Provider health/capabilities are advertised to shared registry.
- [ ] Incompatible versions can be blocked/quarantined.
- [ ] Secrets are redacted.
- [ ] Cross-tenant isolation tests pass.
- [ ] Prompt-injection tests pass.
- [ ] Plugin installation obeys policy/approval.
- [ ] Usage/billing boundaries are explicit.
- [ ] Admin compatibility UI exists.
- [ ] End-user provider status/progress UI exists.
- [ ] Controlled fork is optional fallback, not default.
- [ ] Every fork patch is traceable and removable.
- [ ] Rollback to a certified runtime works.
- [ ] Real ZCode smoke tests pass on each supported OS profile.
- [ ] Fault-injection suite passes before GA.
- [ ] Security suite passes before GA.

---

# 70. Definition of Done

Spec 223 is DONE when a user can, from SmartAIHub Web:

1. choose ZCode for an eligible engineering task;
2. have SmartAIHub select an authorized Runner;
3. have Runner discover or launch a certified ZCode runtime;
4. execute against an isolated workspace;
5. receive Spec 230 context and governed SmartAIHub capabilities;
6. stream normalized progress/subagent/tool events to the Web;
7. request approvals through SmartAIHub;
8. survive browser/backend/control-channel interruption without event loss;
9. cancel/resume/recover according to certified capability;
10. return changed files/artifacts/evidence;
11. run independent verification;
12. complete the canonical Spec 221 or Spec 218 release path;
13. preserve full audit/provenance;
14. do all of the above without making ZCode the source of truth or requiring a permanent SmartAIHub fork;
15. enforce lease fencing so a stale Runner cannot keep mutating after authority moves;
16. independently verify candidate output against trusted verification inputs;
17. preserve correctness-critical events under backpressure;
18. produce content-hashed artifact/evidence manifests;
19. pass the applicable production-hardening gates in Sections 96–98.

---

# 71. Recommended Initial Implementation Boundary

The first production slice SHOULD support:

```text
Windows + Linux Runner
ZCode runtime discovery
Certified pinned upstream version
One high-quality native/server transport
Isolated Git worktree
Project Context Pack
Job-scoped SmartAIHub MCP/API bridge
Normalized events
Approval mapping
Cancel
Workspace/state-based recovery
Independent diff/test verification
Lease fencing + workspace lock
Sequence-aware durable event replay/backpressure
Artifact/evidence content hashes
Secret/egress minimum security policy
Admin diagnostics
```

Do NOT block the first production slice on:

- full ZCode Desktop integration;
- remote public ZCode server;
- every ZCode plugin type;
- ACP;
- automatic patched fork activation;
- perfect cost telemetry;
- converting SmartAIHub Runtime Skills into local ZCode skills.

---

# 72. Open Compatibility Questions to Resolve During Implementation

These are implementation-time probes, not reasons to redesign SmartAIHub architecture:

1. Which ZCode RPC/client APIs are explicitly stable/public in the target certified release?
2. Which native events expose tool/subagent/approval lifecycle without scraping logs?
3. What native session resume guarantees exist in each transport?
4. Can the runtime expose a machine-readable capability/version handshake?
5. Which provider-auth states can be checked safely without touching credentials?
6. Can job-scoped MCP config be injected per session without mutating global user config?
7. What concurrency limits apply to multiple isolated ZCode processes on one Runner?
8. Which ZCode state directories can be isolated per job/profile?
9. What is the cleanest native cancellation API for the certified transport?
10. What upstream contract changes should trigger automatic compatibility quarantine?
11. Does the pinned upstream build expose any official ACP surface? As of the 2026-09-21 review, official ACP support is not documented as a stable ZCode surface and community requests remain open; `acp-transport.ts` therefore remains disabled unless a future official contract is certified.
12. What exact protocol/schema fingerprint can be recorded for the selected RPC/client/server transport?
13. Which extension/configuration changes are guaranteed to require a new ZCode session in the pinned release?

All answers SHALL be captured in the compatibility profile rather than encoded as undocumented assumptions.

---

# 73. Cross-Spec Invariants

The following SHALL remain true even if ZCode upstream changes substantially:

```text
SmartAIHub owns authorization.
SmartAIHub owns durable jobs.
SmartAIHub owns capability identity.
SmartAIHub owns Skill publication.
SmartAIHub owns release verification.
SmartAIHub owns project/tenant isolation.
ZCode remains replaceable.
Provider-native strengths are preserved when safe.
No external harness receives direct production authority by default.
```

---

# 74. Execution Fencing and Split-Brain Prevention

Spec 186 lease/heartbeat semantics SHALL be strengthened at the ZCode adapter boundary with an execution fencing token.

Every mutating Runner command SHALL carry at minimum:

```text
worker_job_id
execution_attempt_id
lease_owner_id
lease_epoch / fencing_token
command_id
turn_id
```

The adapter MUST reject a command when its fencing token is older than the latest accepted token for the execution attempt.

A Runner that loses its lease MUST transition its local execution to `FENCED` and MUST NOT continue mutating the workspace, invoking SmartAIHub capabilities, pushing Git changes, deploying, publishing, or acknowledging new approvals even if the ZCode process is still alive.

If an old Runner later reconnects, it may upload read-only recovery evidence, but MUST NOT reclaim authority without a new canonical lease.

Required split-brain tests:

- two Runners receive stale/duplicated start commands;
- old Runner wakes after machine sleep;
- backend reconnect delivers commands out of order;
- lease expires while ZCode is executing a long tool;
- old process survives a Runner restart;
- two adapters point at the same workspace accidentally.

Only the execution holding the newest valid fencing token may mutate canonical candidate state.

---

# 75. Canonical Provider Session State Machine

ZCode-specific state MUST map onto a deterministic provider state machine rather than free-form strings.

Minimum states:

```text
DISCOVERING
PROBING
PREPARING
STARTING
RUNNING
WAITING_APPROVAL
WAITING_USER_INPUT
INTERRUPTING
CANCELLING
RECOVERING
VERIFYING
COMPLETED_UNVERIFIED
SUCCEEDED_VERIFIED
FAILED
CANCELLED
FENCED
QUARANTINED
```

Every transition SHALL define:

- allowed predecessor states;
- transition trigger;
- persisted evidence;
- timeout behavior;
- retry safety;
- whether workspace mutation remains permitted;
- whether a user action is required.

Unknown/out-of-order native events SHALL NOT directly mutate canonical job state. They SHALL first pass through the event normalizer/reconciler.

A terminal SmartAIHub state MUST be monotonic unless an explicit recovery/reopen transition exists in Spec 200.

---

# 76. Event Backpressure, Replay and Storage Policy

The durable Runner event buffer SHALL define explicit backpressure semantics.

Events SHALL be classified:

```text
CLASS_A_CONTROL
  approvals, state transitions, errors, cancel, fencing, verification verdicts

CLASS_B_EVIDENCE
  tool/command boundaries, file mutations, artifacts, usage checkpoints

CLASS_C_PROGRESS
  message deltas, token streams, heartbeat/progress detail
```

Rules:

- Class A MUST never be dropped.
- Class B MUST be durably retained or replaced by an immutable equivalent evidence reference.
- Class C MAY be coalesced under pressure, but sequence continuity and final completed message/result MUST remain reconstructable.
- Buffer quotas SHALL be bounded by bytes and event count.
- A full buffer SHALL trigger controlled throttling before data loss.
- Backend ACK SHALL identify the highest contiguous accepted sequence, not merely a boolean acknowledgement.
- Replay SHALL be idempotent by `(execution_attempt_id, sequence)`.
- Sequence reset requires a new execution-attempt identity.
- Native payload blobs SHALL have size limits and content hashes.

UI SHALL surface `event_stream_degraded` when fine-grained progress has been coalesced while preserving correctness-critical evidence.

---

# 77. Workspace Locking, Git Safety and Base-Revision Drift

Each mutable isolated workspace SHALL have an exclusive SmartAIHub execution lock tied to the current fencing token.

Before every mutating turn and before final verification, the Runner SHALL verify:

- workspace lock ownership;
- expected repository identity;
- expected base revision;
- no unauthorized external writer was detected where observable;
- no path escaped the workspace root.

The adapter SHALL explicitly handle:

- Git worktrees;
- detached HEAD;
- untracked files;
- case-insensitive filesystems;
- line-ending normalization;
- symlinks/junctions;
- Git submodules;
- Git LFS pointers/assets;
- sparse checkout;
- repository ownership / `safe.directory` behavior;
- nested repositories;
- file mode changes where supported.

If upstream base moves while a job is running, SmartAIHub SHALL NOT silently rebase/merge. It SHALL produce a `BASE_REVISION_DRIFT` condition and apply the project policy: continue pinned, rebase in a separate controlled step, or require user/orchestrator decision.

Merge/rebase conflict resolution is a distinct auditable operation and MUST preserve the pre-conflict candidate revision.

Path containment checks MUST be enforced at the point of access where feasible, not only once during preparation, to reduce symlink/junction/reparse-point time-of-check/time-of-use escapes.

---

# 78. Independent Verification Trust Boundary

Verification MUST assume that the coding harness can modify project tests, scripts, CI configuration and build commands.

Therefore the verifier SHALL distinguish:

```text
PROJECT_OWNED_CHECKS
TASK_REQUIRED_CHECKS
PLATFORM_TRUSTED_CHECKS
GENERATED_ADDITIONAL_CHECKS
```

Critical release gates SHALL NOT depend solely on tests that ZCode could modify in the same workspace.

For high-risk tasks, SmartAIHub SHOULD verify from a clean verifier workspace created from:

```text
trusted base revision + candidate patch/artifact
```

The verifier SHALL record:

- verifier image/toolchain identity;
- exact commands/check definitions;
- checksums of trusted verification scripts;
- candidate revision/diff hash;
- environment inputs that affect results;
- pass/fail/skip with reason.

Detection targets SHALL include test deletion, assertion weakening, hidden skip/only flags, altered golden files, modified security rules and changes to verification scripts.

Flaky-test retries MUST be bounded and separately reported; retries MUST NOT convert an indeterminate result into an unqualified PASS.

---

# 79. Artifact and Evidence Integrity Manifest

Every material output SHALL be represented by an immutable evidence manifest.

```ts
interface ZCodeEvidenceArtifact {
  artifactId: string;
  kind: string;
  relativePath?: string;
  sizeBytes: number;
  sha256: string;
  mediaType?: string;
  producedBy: {
    jobId: string;
    executionAttemptId: string;
    turnId?: string;
    commandId?: string;
    provider: 'zcode';
  };
  createdAt: string;
  storageRef?: string;
  redactionState?: 'NONE' | 'REDACTED' | 'QUARANTINED';
}
```

Before upload/publication, paths MUST be normalized and checked against traversal, symlink escape and device/special-file abuse.

Large/binary artifacts SHALL be streamed with bounded memory use and verified by content hash after upload where supported.

A result referencing an artifact whose hash cannot be verified SHALL be `UNVERIFIED_ARTIFACT`, not `SUCCEEDED_VERIFIED`.

---

# 80. OS-Level Process Containment

Process management SHALL be platform-specific rather than assuming POSIX process behavior.

Required execution containment profiles:

- Windows: process tree tracking with Job Object or equivalent kill-on-parent/job containment where feasible;
- Linux: process groups plus cgroup/systemd/container controls where available;
- macOS: process-group containment and supported OS resource controls;
- Cloud/container Runner: container-native PID/resource/network limits.

The Runner SHALL prevent orphaned ZCode/tool processes from surviving indefinitely after terminal job state.

PID identity MUST include process-start identity where available to prevent PID-reuse mistakes.

Shutdown escalation SHALL be explicit:

```text
native cancel
→ graceful interrupt
→ graceful process stop
→ bounded wait
→ process-tree termination
→ workspace reconciliation
```

Shell execution SHALL avoid concatenating untrusted text into shell strings when argv-based spawning is possible.

Runner SHALL create a sanitized execution environment and SHALL explicitly account for security-sensitive inherited configuration such as `PATH`, `HOME`, shell startup files, Git credential helpers, `core.hooksPath`, package-manager config, proxy variables and language/runtime startup hooks. Repository-controlled configuration MUST NOT silently expand privileges outside the job grant.

---

# 81. Network Egress, SSRF and Local-Service Protection

`NETWORK_ACCESS` approval alone is insufficient for production safety.

SmartAIHub SHALL support an egress policy with destination classes:

```text
DENY_ALL
ALLOW_PUBLIC_HTTPS
ALLOWLIST_HOSTS
ALLOW_PACKAGE_REGISTRIES
ALLOW_GIT_REMOTES
ALLOW_SMARTAIHUB_ENDPOINTS
CUSTOM_TENANT_POLICY
```

The network layer SHOULD defend against:

- SSRF to localhost/loopback services;
- private/link-local/cloud-metadata ranges;
- DNS rebinding;
- redirects from allowlisted public hosts to blocked addresses;
- credential leakage through URLs/headers;
- proxy environment variables supplied by untrusted repository content.

A job-scoped ZCode server listening on loopback is a local control surface and MUST NOT automatically become reachable by arbitrary child tools/plugins.

Network policy decisions and exceptions SHALL be auditable.

---

# 82. Secrets and DLP Lifecycle

Secret handling SHALL cover the entire execution lifecycle, not only log redaction.

Required controls:

1. pre-execution scan of selected context files when policy requires;
2. allowlisted secret projection by reference, never broad environment inheritance;
3. environment minimization for ZCode and child processes;
4. real-time redaction on event/log ingestion;
5. pre-commit/pre-upload secret scanning for candidate changes;
6. artifact quarantine when a probable secret is detected;
7. revocation path for ephemeral credentials after cancel/failure/completion;
8. audit record containing secret reference IDs, never secret values.

A discovered secret leak SHALL be treated as a security event, not a normal test failure.

The Runner SHALL minimize inherited environment variables. By default it SHOULD NOT forward unrelated cloud credentials, `SSH_AUTH_SOCK`, package-registry credentials, browser/session tokens, or user shell secrets into ZCode/tool child processes unless the job grant explicitly requires them.

The adapter-to-ZCode server control token MUST NOT be exposed to normal workspace commands/tools. If the certified upstream transport cannot prevent that control credential from leaking into child-process environments, that transport/profile SHALL be treated as uncertifiable for privileged production use unless an equivalent containment mechanism is proven.

SmartAIHub capability credentials SHOULD be brokered and narrowly scoped so theft of one job token cannot grant broader tenant or platform access.

SmartAIHub SHALL distinguish `SECRET_REQUIRED`, `SECRET_DENIED`, `SECRET_LEAK_DETECTED` and `SECRET_REVOKED` conditions.

---

# 83. ZCode Plugin, Hook and MCP Snapshot Semantics

For every ZCode session, the adapter SHALL persist an execution snapshot of all enabled ZCode extensions that can affect behavior:

```text
plugin ID
plugin version
source
content hash / distribution hash where available
hook configuration hash
MCP server declarations hash
user/workspace/plugin source class
approval status
```

Because ZCode hook configuration is session-scoped, changing hook configuration or enabling/disabling a plugin SHALL NOT be assumed to alter an already-running session. The adapter SHALL start a new provider session when a policy-critical extension snapshot changes.

The SmartAIHub first-party bridge SHOULD prefer deterministic argv/process hooks over shell-string hooks where available.

For ZCode plugin MCP stdio servers, the bridge SHALL use the protocol required by the certified ZCode version. For the currently reviewed upstream plugin contract this is newline-delimited JSON-RPC on stdin/stdout; protocol assumptions MUST remain versioned in the compatibility profile.

A plugin update during an active job SHALL NOT alter the job's effective extension set unless an explicit restart/rebind transition is recorded.

The currently reviewed upstream Hook contract permits `Stop` hooks to request continuation only for a bounded number of consecutive rounds. SmartAIHub SHALL therefore NOT depend on ZCode Hook continuation as the platform's autonomous development loop; Planning → Implement → Test → Debug → Review → Verify remains owned by the higher SmartAIHub orchestration/job layer.

---

# 84. Dependency Installation Governance

`INSTALL_DEPENDENCY` SHALL be decomposed into policy-aware operations rather than a single generic approval.

The adapter/verifier SHALL record:

- package manager;
- registry/source;
- requested package/version;
- lockfile impact;
- lifecycle scripts enabled/disabled;
- native build steps;
- network destinations;
- license/security findings when policy requires.

Production defaults SHOULD prefer lockfile-preserving deterministic installs.

The system SHOULD detect dependency-confusion indicators, unexpected registry changes and package-manager configuration changes.

Commands that disable integrity checks or rewrite registry/auth configuration require elevated policy or explicit approval.

---

# 85. Admission Control, Concurrency and Provider Rate Limits

The existence of a READY ZCode runtime does not imply capacity for another job.

Runner SHALL advertise dynamic capacity separately from capability:

```text
max_sessions
active_sessions
max_mutating_sessions_per_repo
cpu_pressure
memory_pressure
disk_pressure
provider_rate_limit_state
cooldown_until
```

Admission SHALL prevent two mutating jobs from sharing the same workspace/repository lock unless an explicit multi-writer design is certified.

Rate-limit handling SHALL use bounded retry with jitter/backoff and MUST respect job deadline/budget.

Repeated provider failures SHOULD activate a circuit-breaker state to stop retry storms.

`PROVIDER_RATE_LIMITED` and `RUNNER_CAPACITY_EXHAUSTED` MUST remain distinguishable.

---

# 86. Budget, Context and Long-Running Session Governance

Long coding jobs SHALL have explicit bounded budgets independent of provider-native defaults:

```text
wall_clock_deadline
max_turns
max_tool_calls
max_subagent_count
max_command_runtime
max_network_bytes where enforceable
max_artifact_bytes
max_context_refreshes
max_recovery_attempts
max_smartaihub_skill_spend
max_external_side_effect_count where applicable
```

Where token/usage information is available, SmartAIHub MAY enforce token/cost budgets without assuming ZCode exposes authoritative monetary cost. Budget enforcement SHALL remain platform-owned and SHALL not rely solely on provider-native usage reporting.

Context compaction performed by ZCode SHALL be treated as provider-native behavior. SmartAIHub SHALL preserve platform-owned task state, decisions, approvals and evidence independently so provider context loss/compaction cannot erase control-plane facts.

Before a context-reset/new-session recovery, the adapter SHALL create a checkpoint containing at least current objective, completed work, remaining work, candidate revision, unresolved failures and approval state.

---

# 87. Schema Evolution and Rolling Upgrade Compatibility

Normalized events, session bindings, compatibility profiles and durable Runner records SHALL be explicitly schema-versioned.

During SmartAIHub rolling deployment:

- old Runner + new backend;
- new Runner + old backend;
- old adapter + new backend;
- new adapter + old durable records

MUST either interoperate within a declared compatibility window or fail closed before mutation.

In-flight jobs SHALL remain pinned to their adapter/runtime/transport profile unless an explicit recovery migration is supported and certified.

A schema migration MUST preserve replay/idempotency keys and audit provenance.

Unknown required fields SHALL produce `PROTOCOL_INCOMPATIBLE`, not silent defaulting.

---

# 88. Data Retention, Privacy and Residency

Spec 223 SHALL classify ZCode-derived data into retention classes:

```text
CONTROL_METADATA
AUDIT_EVIDENCE
NATIVE_EVENT_PAYLOAD
COMMAND_OUTPUT
PROVIDER_MESSAGE_CONTENT
ARTIFACT
SECRET_REFERENCE
DIAGNOSTIC_BUNDLE
```

Each class SHALL inherit platform/tenant retention policy and, where applicable, data-residency constraints.

Native payload retention SHOULD be minimized when normalized evidence is sufficient.

Deletion/retention expiry SHALL remove or tombstone all linked provider-native blobs consistently with platform policy while preserving legally/audit-required metadata where applicable.

The UI/admin diagnostics path MUST disclose when opening a native payload may expose source code, prompts or command output.

---

# 89. Human Steering, Pause and Mid-Run Intervention

Cancel is not sufficient for interactive engineering workflows.

Where the certified ZCode transport supports it, Spec 223 SHOULD expose provider-neutral commands:

```text
PAUSE_AT_SAFE_POINT
RESUME
SEND_USER_GUIDANCE
REQUEST_STATUS_CHECKPOINT
INTERRUPT_CURRENT_TURN
CANCEL
```

`SEND_USER_GUIDANCE` MUST become a new correlated turn/input and MUST NOT be appended invisibly to an already acknowledged mutating command.

If native pause is unavailable, SmartAIHub may implement `PAUSE_AT_SAFE_POINT` by preventing the next turn/tool boundary while allowing the current atomic operation to finish.

UI SHALL clearly distinguish:

- paused by user;
- waiting approval;
- waiting user input;
- provider idle;
- transport disconnected;
- execution fenced.

---

# 90. Authentication Expiry and Re-Authentication

Provider authentication can expire while a job is active.

The adapter SHALL distinguish:

```text
AUTH_REQUIRED_BEFORE_START
AUTH_EXPIRED_DURING_RUN
AUTH_REFRESHABLE_LOCALLY
AUTH_USER_INTERACTION_REQUIRED
AUTH_REVOKED
```

SmartAIHub backend SHALL NOT request raw ZCode user credentials.

When user interaction is required, the Runner/UI SHALL provide a local re-authentication instruction/launch path appropriate to the installed ZCode runtime without exposing secrets to SmartAIHub servers.

After re-authentication, the adapter MUST reconcile provider session/workspace state before resuming; it MUST NOT blindly replay the last mutating turn.

---

# 91. Managed Runtime Provenance, SBOM and Release Integrity

For SmartAIHub-managed ZCode builds/distributions, install provenance SHALL include more than a checksum.

Recommended manifest fields:

```text
source repository
upstream commit/tag
build workflow identity
build timestamp
artifact SHA-256
platform/architecture
Node/runtime prerequisites if external
third-party notices
SBOM reference
signature/attestation reference where available
adapter compatibility profile
security scan result
```

SmartAIHub-built patched forks SHOULD produce an SBOM and signed/attested artifact where release infrastructure supports it.

Rollback MUST pin both runtime artifact and compatibility profile; rolling back the binary while keeping an incompatible profile is not valid rollback.

---

# 92. Diagnostics and Support Bundle

Admin diagnostics SHALL be exportable as a redacted support bundle containing:

- job/execution IDs;
- Runner version/platform;
- ZCode runtime/version/commit;
- adapter/transport/profile versions;
- health/probe output;
- state transitions;
- event sequence gaps;
- retry/recovery history;
- approval metadata without secrets;
- workspace/revision metadata;
- verification summary;
- plugin/hook/MCP snapshot hashes;
- active fork patch IDs;
- recent redacted errors/log references.

The bundle MUST exclude raw credentials and SHOULD exclude source code by default unless explicitly selected/authorized.

Support-bundle generation SHALL be read-only and MUST work for failed/quarantined jobs.

---

# 93. Canary, Compatibility Burn-In and Emergency Disable

Certification SHALL include a staged burn-in before broad promotion of a new ZCode/runtime/adapter profile.

Recommended profile lifecycle:

```text
UNTESTED
→ LAB_CERTIFIED
→ CANARY
→ CERTIFIED
→ DEFAULT
```

Any stage may transition to:

```text
DEGRADED
QUARANTINED
BLOCKED
RETIRED
```

The control plane SHALL support an emergency kill switch by:

- ZCode runtime version;
- adapter version;
- transport profile;
- plugin/bridge version;
- OS/architecture combination.

Emergency disable MUST stop new starts while preserving safe evidence collection/recovery for active jobs.

Canary telemetry SHALL compare at minimum start failures, crash rate, recovery rate, verification failures, approval anomalies and event-loss indicators against the previous certified profile.

---

# 94. Cleanup, Garbage Collection and Abandoned Execution Recovery

Temporary resources SHALL have ownership tags and deterministic cleanup policy:

- worktrees/workspaces;
- temporary ZCode data profiles;
- local server processes;
- IPC tokens;
- event spool files;
- command output blobs;
- materialized assets;
- temporary MCP configuration;
- verifier workspaces;
- downloaded runtime archives.

Cleanup MUST NOT destroy evidence still required by an active/recoverable job.

A periodic reconciler SHOULD detect:

```text
orphan process
orphan workspace
orphan event spool
expired credential projection
abandoned lock
stale runtime archive
unreferenced diagnostic blob
```

Destructive cleanup SHALL be idempotent and auditable.

---

# 95. Twenty-Round Production Audit Record

This revision was hardened through twenty explicit review passes. The table records the gap class and the normative correction now present in this spec.

| Round | Audit focus | Result / correction |
|---:|---|---|
| 1 | Control-plane ownership | PASS; retained Spec 186/200 authority and no second queue/source of truth. |
| 2 | Runtime discovery/install | HARDENED; added provenance, platform identity and managed-runtime release integrity. |
| 3 | Version compatibility | HARDENED; added schema/rolling compatibility and in-flight version pinning. |
| 4 | Transport negotiation | HARDENED; fail-closed compatibility and no unsafe mid-mutation transport switching remain mandatory. |
| 5 | Process lifecycle | HARDENED; added OS-specific process-tree containment and PID-reuse protection. |
| 6 | Lease/retry split-brain | GAP FIXED; added fencing token and stale-Runner mutation denial. |
| 7 | Event durability | GAP FIXED; added event classes, backpressure, contiguous ACK and bounded spool policy. |
| 8 | Exactly-once mutation | HARDENED; tied replay safety to execution attempt, command, turn and observed-state reconciliation. |
| 9 | Workspace concurrency | GAP FIXED; added exclusive workspace lock and multi-writer prevention. |
| 10 | Git edge cases | GAP FIXED; added base drift, submodule/LFS/sparse/symlink/case/line-ending handling. |
| 11 | Verification integrity | GAP FIXED; verifier no longer trusts harness-modifiable tests as the sole release gate. |
| 12 | Artifact integrity | GAP FIXED; added SHA-256 evidence manifest, path safety and post-upload validation. |
| 13 | Secrets/DLP | HARDENED; added lifecycle scanning, quarantine and credential revocation semantics. |
| 14 | Network security | GAP FIXED; added egress classes, SSRF/private-range/DNS-rebinding controls. |
| 15 | Plugins/hooks/MCP | HARDENED; added extension snapshots and session-bound hook semantics. |
| 16 | Dependency supply chain | GAP FIXED; added lockfile/registry/lifecycle-script governance. |
| 17 | Capacity/rate limits | GAP FIXED; added admission control, provider rate-limit state and circuit breaker. |
| 18 | Long-running jobs/context | GAP FIXED; added bounded budgets and context-loss-independent checkpoints. |
| 19 | Data governance/operations | GAP FIXED; added retention/residency classes, support bundles and cleanup reconciler. |
| 20 | UX/recovery/certification | HARDENED; added human steering, auth-expiry recovery, canary burn-in and emergency kill switches. |

No audit round changes the fundamental architecture: ZCode remains a replaceable external harness beneath SmartAIHub's provider-neutral control plane.

---

# 96. Additional Production-Hardening Tests

The following tests extend Section 65 and are mandatory where applicable before GA:

83. stale Runner with old fencing token cannot mutate;
84. duplicate start on two Runners yields one authorized writer;
85. event spool pressure preserves all Class A control events;
86. Class C message deltas coalesce without losing final message/result;
87. backend contiguous ACK/replay resumes from exact sequence;
88. workspace lock blocks concurrent mutation;
89. base revision drift is detected before verification;
90. symlink/junction escape is denied;
91. submodule/LFS/sparse checkout behavior is deterministic or explicitly blocked;
92. verifier detects deleted/disabled/weakened tests;
93. clean verifier workspace reproduces candidate patch;
94. artifact hash mismatch blocks verified success;
95. orphan child process is terminated on job shutdown;
96. PID reuse does not terminate unrelated process;
97. SSRF attempt to loopback/private/metadata address is blocked by policy;
98. DNS rebinding/redirect cannot bypass egress policy;
99. secret inserted into generated file is quarantined before upload/publish;
100. secret/token is absent from event spool/support bundle;
101. plugin/hook change during active session does not silently change session behavior;
102. plugin snapshot hash mismatch blocks certified execution when policy requires;
103. MCP stdio framing matches certified ZCode contract;
104. dependency registry change requires policy/approval;
105. lifecycle-script policy is enforced;
106. Runner capacity exhaustion does not start an unsafe extra session;
107. provider rate-limit retry respects deadline and budget;
108. circuit breaker stops retry storm;
109. context compaction does not erase platform-owned approvals/evidence;
110. recovery checkpoint seeds a new session without redoing completed mutation;
111. old/new backend/Runner schema compatibility matrix passes;
112. incompatible required event field fails closed;
113. auth expiry pauses safely and resumes only after state reconciliation;
114. user guidance creates a new correlated input/turn;
115. safe-point pause differs from cancel and preserves workspace;
116. managed runtime SBOM/provenance is linked to install record;
117. emergency kill switch blocks only targeted profile scope;
118. canary rollback leaves in-flight pinned jobs recoverable;
119. retention expiry removes native blobs according to policy;
120. abandoned execution reconciler removes orphan resources without deleting required evidence;
121. local ZCode server control token is not visible to ordinary workspace commands;
122. unrelated SSH/cloud/package-manager credentials are not inherited by default;
123. hostile Git hook / `core.hooksPath` configuration cannot bypass approval policy;
124. remote resource create/delete requires the correct approval class;
125. SmartAIHub Skill spend ceiling stops further paid calls at the configured budget.

---


## 96.1 Second-Wave Production-Hardening Tests

The Revision 3 audit adds the following mandatory tests where applicable:

126. approval is bound to an immutable operation digest and cannot be reused after command/tool arguments change;
127. stale approval UI cannot authorize a newer execution attempt or policy snapshot;
128. policy/capability revocation during execution prevents the next privileged action without corrupting completed work;
129. capability grant expiry mid-turn fails closed at the capability boundary;
130. retry classifier never retries an unproven non-idempotent remote mutation automatically;
131. `Retry-After` / provider cooldown never extends beyond the canonical job deadline or spend budget;
132. wall-clock rollback/forward jump does not corrupt lease, deadline, or timeout decisions;
133. ANSI/OSC terminal sequences and control characters cannot inject UI links, clipboard actions, or forged log structure;
134. Windows reserved names, long paths, Unicode normalization and case-fold collisions are detected before mutation/release;
135. archive extraction rejects traversal, absolute paths, special files and decompression bombs;
136. stdout/stderr/event flood cannot exhaust Runner memory or starve Class A control events;
137. file-descriptor/inode/temp-disk/process-count exhaustion produces a bounded controlled failure;
138. one tenant/repository cannot monopolize Runner admission beyond configured fairness policy;
139. clean verification with pinned inputs reproduces the candidate result without hidden user-home/tool caches;
140. poisoned shared dependency/build cache cannot cross tenant/project trust boundaries;
141. push/force-push/protected-branch/tag mutation is blocked unless the exact remote/ref operation is authorized;
142. host SSH agent, cloud CLI, Docker/Kubernetes contexts and Git credential helpers are absent unless explicitly projected;
143. provider/model/toolchain/config drift during a session is detected and recorded before the next mutating turn;
144. concurrent paid Skill/tool calls cannot overspend a reserved job budget through race conditions;
145. asset/context-pack materialization verifies identity/hash and cannot substitute a stale or different object;
146. a ZCode version with a known open resume regression cannot advertise certified native resume unless the exact certification probe passes;
147. two simultaneous operator actions (approve/cancel/steer) resolve deterministically by command ordering and execution attempt;
148. UI reconnect cannot replay a stale approval or duplicate a user-guidance turn;
149. load test demonstrates bounded event lag and queue/admission behavior at the certified concurrency target;
150. soak test demonstrates no unbounded process, spool, workspace, handle or memory growth;
151. chaos test covers backend restart, Runner restart, local server crash, network partition and credential expiry under load;
152. verification remains reproducible when external network is denied unless the verification profile explicitly allows it;
153. environment variables such as `NODE_OPTIONS`, `PYTHONPATH`, shell init paths and package-manager hooks cannot inject unauthorized code into trusted verification;
154. Git URL rewrite rules (`insteadOf`), credential config and submodule URLs cannot redirect an approved remote to an unapproved endpoint;
155. policy snapshot/hash mismatch produces `POLICY_STALE` / re-authorization rather than silent continuation;
156. capability snapshot/hash mismatch produces `CAPABILITY_STALE` / re-resolution rather than silent continuation;
157. operation fingerprint mismatch invalidates an existing approval before side effect;
158. billing reservation release/refund is idempotent after failure/cancel/recovery;
159. known-issue quarantine can disable one runtime/profile without disabling other certified ZCode profiles;
160. release certification records measured SLO/load/soak results, not only functional pass/fail.


# 97. Additional Acceptance Gates

In addition to Section 69, GA requires:

- [ ] Mutating commands are protected by lease fencing tokens.
- [ ] Stale/fenced Runners cannot continue mutation after lease loss.
- [ ] Workspace exclusive locking prevents accidental multi-writer execution.
- [ ] Durable event buffering has explicit quota/backpressure/replay semantics.
- [ ] Control/approval/error events cannot be dropped under load.
- [ ] Event ACK is sequence-aware and replay-idempotent.
- [ ] Base-revision drift is detected and never silently rebased.
- [ ] Git submodule/LFS/sparse/symlink edge cases are tested or explicitly unsupported by profile.
- [ ] Independent verification cannot be satisfied only by harness-modifiable tests.
- [ ] Critical verification can run from a clean verifier workspace.
- [ ] Artifact/evidence hashes are persisted and validated.
- [ ] OS process-tree containment prevents orphan execution.
- [ ] Egress policy blocks SSRF/private-range/metadata access unless explicitly permitted.
- [ ] Secret scanning/quarantine runs before release/publish where policy requires.
- [ ] ZCode plugin/hook/MCP extension set is snapshotted per session.
- [ ] Dependency install policy records registry, lockfile and lifecycle-script effects.
- [ ] Runner admission control and provider rate-limit/circuit-breaker behavior are implemented.
- [ ] Long-running jobs have explicit platform budgets and recovery checkpoints.
- [ ] Durable schemas declare compatibility across rolling backend/Runner upgrades.
- [ ] Auth expiry does not cause blind replay of mutating turns.
- [ ] Human pause/steer/interrupt semantics are distinct and auditable where supported.
- [ ] Managed runtime provenance/SBOM/signature metadata is retained where available.
- [ ] Redacted support bundles can be produced for failed/quarantined jobs.
- [ ] Version/adapter/transport profile has canary and emergency-disable controls.
- [ ] Orphan process/workspace/spool/credential cleanup is automated and safe.
- [ ] ZCode control credentials are not inherited by ordinary workspace commands.
- [ ] Unrelated host credentials/SSH agents/package-manager secrets are excluded by default.
- [ ] Remote external-resource mutations have explicit approval classes.
- [ ] SmartAIHub Skill spending limits are enforced independently of ZCode.

---


## 97.1 Revision 3 Acceptance Gates

GA additionally requires:

- [ ] Approval decisions are cryptographically/logically bound to the exact operation fingerprint, execution attempt and authorization snapshot.
- [ ] Approval reuse after command/tool-input mutation is impossible.
- [ ] Policy/capability grants are snapshotted and support explicit revocation/expiry semantics.
- [ ] Retry classification distinguishes transient read/idempotent failures from uncertain/non-idempotent mutations.
- [ ] Lease/deadline logic does not depend on unsynchronized wall-clock ordering alone.
- [ ] Terminal/log output is sanitized for ANSI/OSC/control-sequence injection before UI rendering.
- [ ] Cross-platform filename/path portability checks cover Windows reserved names, Unicode normalization and case-fold collisions.
- [ ] Archive/materialized-asset extraction has traversal and decompression limits.
- [ ] Runner resource-exhaustion limits cover output bytes, handles/file descriptors, process count, temp space and inodes where applicable.
- [ ] Capacity policy includes tenant/project fairness or an explicitly documented scheduling policy.
- [ ] Verification is hermetic enough to identify the exact trusted toolchain, dependency inputs, network policy and cache namespace.
- [ ] Build/dependency caches are tenant/project/profile scoped or content-addressed with trust validation.
- [ ] Git remote/ref mutations, especially force-push/tags/protected branches, require explicit scoped authorization.
- [ ] Host SSH/cloud/container/package credentials are not inherited by default.
- [ ] Provider/model/toolchain/config identity is pinned or drift-detected for the execution attempt.
- [ ] Billing/spend uses reservation/idempotency semantics that remain correct under concurrent calls and recovery.
- [ ] Materialized Context Pack/assets are identity/hash verified before use.
- [ ] Known upstream regressions are represented in compatibility profiles/quarantine rules.
- [ ] Concurrent user/admin commands have deterministic conflict ordering and stale-UI protection.
- [ ] Certified concurrency has load, soak and chaos evidence with explicit thresholds.


# 98. Production-Readiness Gate

Spec 223 SHALL be considered **implementation-ready**, but the ZCode provider SHALL NOT be considered **production-certified** until all mandatory capability-profile-specific tests pass against an exact pinned upstream build.

Production certification evidence MUST include:

```text
pinned ZCode version/commit
runtime artifact hash
adapter version
transport profile/version
normalized schema version
OS/architecture
plugin/hook/MCP snapshot
fencing/recovery test result
security test result
verification-integrity test result
fault-injection result
canary/burn-in result
approval operation-fingerprint scheme
policy/capability snapshot versions
provider/model/toolchain configuration digest
verification environment/cache identity
billing reservation/idempotency profile
known-issue/quarantine profile
load/soak/chaos result and certified concurrency target
known limitations
rollback target
```

A feature unsupported by the certified upstream build SHALL be advertised as unsupported/degraded rather than emulated through fragile scraping unless a separate explicitly approved compatibility profile defines that fallback.

---


# 99. Approval Binding and TOCTOU-Safe Authorization

A SmartAIHub approval MUST authorize one precisely identified operation, not a vague future permission.

Every privileged action SHALL derive an `operation_fingerprint` from canonicalized security-relevant inputs, including where applicable:

```text
execution_attempt_id
fencing_token
workspace/repository identity
operation/risk class
tool or command identity
canonical argv / structured tool input
cwd / target path or Git remote+ref
network destination class
artifact/capability identity
requested side-effect scope
policy_snapshot_id
capability_snapshot_id
```

The Approval Service decision SHALL persist the approved fingerprint or an explicitly bounded rule scope. Immediately before the side effect, the Runner/adapter MUST recompute the fingerprint and reject/re-authorize when security-relevant inputs changed.

Approval MUST NOT be reusable across execution attempts, materially different targets, rewritten commands, redirected remotes, changed capability scopes, or expired policy snapshots unless the approval explicitly represents a reusable platform rule whose scope permits that operation.

A ZCode Hook/permission request is only a request source; SmartAIHub remains the authority binding authorization to the final concrete operation.

---

# 100. Policy and Capability Snapshot / Revocation Semantics

Every provider session SHALL record the effective authorization context used at preparation/start:

```text
platform_policy_version
tenant_policy_version
project_policy_version
job_grant_version
capability_snapshot_id
approval_policy_version
billing_budget_id
secret_projection_set_id
```

The snapshot is evidence, not a promise that access remains valid forever. Hard-deny changes, credential revocation, capability revocation, quarantine and budget exhaustion MAY take effect immediately according to platform policy.

Before every privileged boundary call, the authoritative gateway SHALL validate current revocation/expiry state. The adapter SHALL NOT cache an old `ALLOW` indefinitely.

When a policy/capability change invalidates a running session, SmartAIHub SHALL choose an explicit outcome:

```text
CONTINUE_READ_ONLY
PAUSE_FOR_REAUTHORIZATION
RESTART_SESSION_WITH_NEW_SNAPSHOT
CANCEL
FENCE
QUARANTINE
```

Completed evidence remains immutable; future side effects fail closed.

---

# 101. Retry Taxonomy, Backoff and Side-Effect Safety

Retries SHALL be operation-class aware.

Minimum retry classes:

```text
SAFE_READ
IDEMPOTENT_WRITE_WITH_KEY
RECONCILABLE_WRITE
NON_IDEMPOTENT_WRITE
UNKNOWN_COMMIT_STATE
USER_ACTION_REQUIRED
PERMANENT_FAILURE
```

Rules:

- `SAFE_READ` MAY retry within bounded deadline/backoff policy.
- `IDEMPOTENT_WRITE_WITH_KEY` MAY retry only with the same idempotency key.
- `RECONCILABLE_WRITE` MUST inspect authoritative state before retry.
- `NON_IDEMPOTENT_WRITE` MUST NOT auto-retry after ambiguous acknowledgement.
- `UNKNOWN_COMMIT_STATE` MUST enter reconciliation, never blind replay.
- provider `Retry-After`/cooldown MUST respect the canonical job deadline and budget.
- retry count, classifier reason and previous outcome SHALL be auditable.

Network, MCP, Git remote, package publish, deployment and paid Skill calls MUST explicitly declare retry class.

---

# 102. Time Semantics, Clock Skew and Deadline Safety

Distributed correctness MUST NOT depend on comparing unsynchronized wall-clock timestamps alone.

Lease/fencing authority SHALL use canonical epochs/tokens from Spec 186. Local timeout measurement SHOULD use a monotonic clock where available.

Persisted timestamps remain useful for audit, but the adapter SHALL tolerate:

- NTP correction;
- machine sleep/wake;
- daylight-saving/timezone changes;
- wall clock moving backward/forward;
- backend and Runner clock skew.

Deadlines SHALL persist an authoritative deadline plus local monotonic budget where possible. Clock anomalies MUST NOT revive an expired lease, extend an approval indefinitely, or cause a stale Runner to regain mutation authority.

---

# 103. Output Sanitization, Terminal Escape and Log Injection

ZCode, tools, builds, tests and repository content may emit hostile terminal/log sequences.

Before UI rendering or structured-log projection, SmartAIHub SHALL neutralize or safely encode:

- ANSI/OSC escape sequences not explicitly supported;
- terminal title/link/clipboard control sequences;
- carriage-return/backspace tricks that rewrite visible logs;
- embedded NUL/control characters;
- forged newline/prefix content that impersonates platform audit fields;
- excessively long single lines.

Raw evidence MAY be retained as an immutable blob subject to access policy, but UI/audit summaries MUST use a safe representation. Sanitization SHALL preserve enough content for debugging without making the browser/terminal execute control behavior.

---

# 104. Cross-Platform Path, Encoding and Filename Portability

A candidate valid on one Runner OS may fail or alias on another.

The workspace/verifier SHALL detect or explicitly profile:

- Windows reserved device names;
- trailing dot/space behavior;
- path-length constraints;
- illegal filename characters;
- Unicode normalization collisions;
- case-fold collisions (`Foo` vs `foo`);
- filesystem encoding failures;
- newline/encoding/BOM differences;
- executable-bit semantics;
- junction/reparse-point behavior.

Path authorization SHALL operate on canonical/real containment semantics appropriate to the OS, not only textual prefix comparison.

Cross-platform products SHOULD run portability checks before verified success when deployment targets differ from the editing Runner.

---

# 105. Archive, Extraction and Materialized-Asset Safety

Any archive or bundle consumed from Library, repository, dependency, plugin or provider output SHALL be treated as untrusted input.

Extraction/materialization controls SHALL include:

- path traversal / zip-slip rejection;
- absolute-path rejection;
- symlink/hardlink/special-device policy;
- maximum file count;
- maximum expanded bytes;
- compression-ratio/decompression-bomb limits;
- nested-archive depth limits where inspected;
- filename portability checks;
- content hash verification when an expected hash exists.

Extraction MUST occur into a controlled destination and MUST NOT overwrite files outside the authorized workspace/profile.

---

# 106. Resource Exhaustion and Output Flood Protection

CPU/memory/disk limits are necessary but not sufficient.

Where supported, execution profiles SHALL bound or monitor:

```text
stdout/stderr bytes and rate
native event rate
open files / file descriptors / handles
process/child count
thread count
temporary storage
inode/file-count consumption
workspace growth
single-file size
memory / OOM condition
CPU time / sustained CPU pressure
network connection count
```

Output/event flood MUST apply backpressure/spooling without starving Class A control events. Resource exhaustion SHALL terminate/recover in a controlled state with preserved evidence rather than destabilizing the Runner host.

---

# 107. Tenant Fairness, Noisy-Neighbor Isolation and Capacity SLOs

Shared Runner pools SHALL define an explicit scheduling/fairness policy instead of first-come unbounded monopolization.

Possible policy inputs include:

- tenant/project concurrency quota;
- per-repository mutating-session limit;
- job priority/class;
- reserved admin/emergency capacity;
- CPU/memory/disk headroom;
- provider/account rate-limit pool;
- expected job weight.

The platform SHOULD expose queue/admission reason separately from provider health.

A high-volume tenant/project MUST NOT starve unrelated tenants beyond configured service policy.

---

# 108. Hermetic Verification and Reproducibility

Independent verification SHALL minimize hidden dependencies on the user's interactive machine state.

The verifier SHOULD record or control:

```text
OS/image/toolchain identity
language/runtime versions
dependency lockfiles and registry policy
environment allowlist
network allow/deny policy
timezone/locale where relevant
trusted verification scripts
cache namespace/input digest
candidate patch/artifact digest
```

Critical verification SHOULD run with network denied unless the verification profile explicitly requires external access.

A PASS that depends on undocumented user-home configuration, mutable global tools or stale local caches is not sufficient production evidence.

Where deterministic reproduction is impossible, the limitation and required external dependencies SHALL be explicit in the compatibility/certification record.

---

# 109. Cache Isolation and Cache-Poisoning Defense

Build, dependency, compiler, package-manager and test caches can cross trust boundaries.

Shared caches SHALL be either:

- content-addressed with validated immutable inputs; or
- scoped by tenant/project/toolchain/trust profile; or
- disabled for high-risk verification.

Untrusted candidate code MUST NOT be allowed to write executable state into a cache later consumed as trusted verifier/platform code without revalidation.

Cache keys SHOULD include material toolchain and lockfile/config digests. Cache hit/miss identity SHOULD be evidence for critical verification when it materially affects results.

---

# 110. Git Remote, Branch, Tag, PR and Protected-Ref Policy

`MODIFY_GIT` is not sufficient granularity for remote side effects.

SmartAIHub SHALL distinguish at minimum:

```text
LOCAL_BRANCH_CREATE
LOCAL_COMMIT
LOCAL_REBASE_OR_MERGE
REMOTE_FETCH
REMOTE_PUSH_NEW_BRANCH
REMOTE_PUSH_UPDATE_BRANCH
FORCE_PUSH
TAG_CREATE_OR_UPDATE
PR_CREATE_OR_UPDATE
PROTECTED_REF_MUTATION
REMOTE_DELETE_REF
```

Remote operations SHALL bind approval/policy to the canonical remote identity and ref. URL rewrite rules, redirects or submodule URLs MUST NOT silently redirect an approved operation to a different endpoint.

Force push, protected-branch mutation, tag rewrite and remote deletion SHOULD default to deny or explicit elevated approval.

ZCode SHALL NOT receive persistent repository-owner authority merely because a coding job is allowed to edit a workspace.

---

# 111. Host Credential and Tool Context Isolation

Runner execution SHALL use an allowlist-oriented environment projection.

Credentials/context that MUST NOT be inherited by default include, where present:

- `SSH_AUTH_SOCK` / SSH agents;
- Git credential helpers/stores;
- cloud CLI credentials/profiles;
- Docker registry auth;
- Kubernetes contexts/tokens;
- package-manager auth files;
- browser/session tokens;
- unrelated API keys;
- signing keys;
- production deployment credentials.

If a job needs one of these capabilities, SmartAIHub SHALL project a scoped credential/reference specifically for the approved operation and revoke/expire it afterward where supported.

---

# 112. Provider, Model, Toolchain and Configuration Pinning

A session can drift even when the ZCode binary version does not.

Execution provenance SHOULD capture where observable:

```text
ZCode runtime/profile
provider/model identifier
provider endpoint/account class without secret
relevant ZCode config digest
plugin/hook/MCP snapshot
shell/toolchain/runtime versions
critical environment/config digest
```

If a provider model, critical configuration or toolchain changes mid-run, the adapter SHALL either record the new epoch and re-evaluate compatibility/authorization or restart from a new session/checkpoint according to policy.

SmartAIHub SHALL NOT claim reproducibility while silently allowing material model/config/toolchain drift.

---

# 113. Billing Reservation, Spend Concurrency and Idempotency

For paid SmartAIHub Skills/capabilities, a simple post-hoc counter is insufficient under concurrent subagents/tool calls.

The platform billing layer SHALL support, as applicable:

```text
job budget ceiling
atomic reservation/authorization
per-call idempotency key
commit/settle
release/refund on known non-execution
reconciliation for unknown commit state
```

Concurrent ZCode subagents MUST NOT overspend the configured job ceiling through race conditions.

Provider/local subscription cost remains separate unless an explicit integration exists, but SmartAIHub-paid capability spend MUST remain authoritative and auditable.

---

# 114. Context Pack and Asset Materialization Integrity

Before exposing a Project Context Pack, Library asset, generated reference or task attachment to ZCode, Runner SHALL bind the materialized object to the intended logical identity/version.

Where available, record:

```text
logical object id
version/revision
content hash
source/storage reference
materialized path
size/media type
access grant id
```

Stale local copies MUST NOT silently substitute a newer/older requested version. Materialization SHALL obey the same path/archive/secret policies as other untrusted inputs.

A recovery on another Runner MUST be able to reconstruct the same authorized inputs or explicitly report drift.

---

# 115. Known-Issue Watchlist and Behavioral Certification

Compatibility cannot be inferred solely from semantic version or static capability discovery.

Each compatibility profile SHALL support `knownIssues[]` entries with at least:

```text
issue_id / upstream_url
affected_version_range or unknown
capability affected
severity
workaround if certified
required regression probe
quarantine/block rule
last revalidated_at
```

At review time, upstream feedback contains an open report where resumed sessions can reject sends with a runtime-model warning. This is an example of why `resume = true` MUST be certified by an exact-version behavioral probe and real resumed-session send, not by a version flag alone.

Known issues MAY degrade or quarantine one capability/profile without disabling unrelated certified profiles.

---

# 116. Operator Command Ordering, Stale UI and Conflict Resolution

Web UI, backend automation and admin controls can issue concurrent commands.

Every operator command SHALL carry:

```text
command_id
expected_execution_attempt_id
expected_job_state_version
actor identity
issued_at
operation intent
```

The backend SHALL serialize/conflict-check commands against canonical job state. Examples:

- approve racing with cancel;
- pause racing with tool completion;
- user guidance racing with session restart;
- retry racing with late completion;
- admin quarantine racing with a new start.

A stale browser MUST NOT reuse an old approval request or silently send guidance to a newer execution attempt. UI SHALL surface conflict/rejected-stale-command outcomes explicitly.

---

# 117. Load, Soak, Chaos and Operational SLO Certification

Functional tests alone are insufficient for a long-running external harness adapter.

Each production profile SHALL define measurable certification targets for at least:

- session start success/latency;
- event-lag/backlog under target concurrency;
- approval round-trip persistence;
- recovery success after injected failures;
- memory/process/spool/workspace growth over soak duration;
- cleanup convergence;
- verification throughput;
- error-rate/circuit-breaker behavior.

Certification SHALL include:

```text
LOAD_TEST
SOAK_TEST
CHAOS_RECOVERY_TEST
RESOURCE_PRESSURE_TEST
```

The exact thresholds MAY vary by Runner class, but the profile MUST record target concurrency, tested duration, measured result and blocking regressions. New runtime/adapter releases SHOULD compare these results to the previous certified profile.

---

# 118. Second Twenty-Round Production Audit Record

Revision 3 performs a fresh twenty-pass review over Revision 2 rather than treating the previous audit as final.

| Round | Audit focus | Revision 3 result |
|---:|---|---|
| 1 | Authority/approval TOCTOU | GAP FIXED — operation fingerprint and pre-side-effect revalidation added. |
| 2 | Policy/capability changes mid-run | GAP FIXED — snapshot + revocation/expiry semantics added. |
| 3 | Retry correctness | GAP FIXED — operation-class retry taxonomy and unknown-commit reconciliation added. |
| 4 | Lease/deadline time correctness | GAP FIXED — monotonic-time/clock-skew requirements added. |
| 5 | Log/terminal rendering | GAP FIXED — ANSI/OSC/control-sequence sanitization added. |
| 6 | Cross-platform filesystem portability | GAP FIXED — Windows/Unicode/case/path constraints added. |
| 7 | Archive/materialization safety | GAP FIXED — traversal and decompression controls added. |
| 8 | Resource exhaustion | GAP FIXED — output/handle/process/inode/temp pressure controls added. |
| 9 | Multi-tenant fairness | GAP FIXED — explicit scheduling/quota/noisy-neighbor policy added. |
| 10 | Verification reproducibility | HARDENED — hermetic environment/network/toolchain evidence added. |
| 11 | Shared caches | GAP FIXED — cache isolation/content-addressing and poisoning defense added. |
| 12 | Git remote/ref side effects | GAP FIXED — granular remote/force-push/tag/protected-ref authorization added. |
| 13 | Host credential inheritance | HARDENED — SSH/cloud/container/package credential projection rules added. |
| 14 | Runtime/model/config drift | GAP FIXED — provider/model/toolchain/config provenance and drift handling added. |
| 15 | Paid capability concurrency | GAP FIXED — atomic budget reservation/idempotent settlement semantics added. |
| 16 | Context/asset integrity | GAP FIXED — logical version/hash binding for materialization added. |
| 17 | Upstream behavioral regressions | GAP FIXED — known-issue registry and exact-version regression probes added. |
| 18 | Concurrent operator/UI actions | GAP FIXED — command state-version ordering and stale UI rejection added. |
| 19 | Load/soak/chaos readiness | GAP FIXED — operational certification targets/evidence added. |
| 20 | Cross-spec / implementation readiness | PASS WITH HARDENING — no new control plane introduced; new rules stay within Spec 186/200/218/220/221/222 ownership boundaries. |

Revision 3 therefore strengthens the adapter boundary without changing the primary architecture or creating a second source of truth.

---

# 119. External References

Primary upstream references used when drafting this revision:

- ZCode upstream: https://github.com/zai-org/ZCode
- ZCode Plugins: https://github.com/zai-org/zcode-plugins
- ZCode Plugin Development Guide (English): https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT.md
- ZCode Plugin Development Guide (Chinese): https://github.com/zai-org/zcode-plugins/blob/main/docs/PLUGIN_DEVELOPMENT_CN.md
- ZCode Plugin AGENTS contract: https://github.com/zai-org/zcode-plugins/blob/main/AGENTS.md
- ZCode root package metadata/version snapshot: https://github.com/zai-org/ZCode/blob/main/package.json
- ZCode ACP feature request/status reference: https://github.com/zai-org/feedback/issues/571
- ZCode ACP feature request/status reference: https://github.com/zai-org/feedback/issues/585
- ZCode resumed-session known-issue example: https://github.com/zai-org/feedback/issues/223
- ACP status MUST be revalidated from official upstream before enabling any ACP transport; community bridges are not a certification source.

Relevant upstream observations MUST be revalidated against the pinned target version during implementation/certification.

---

# 120. Final Architectural Rule

**Do not modify SmartAIHub architecture to imitate ZCode.**

Implement ZCode as one strong external harness behind the same stable SmartAIHub execution contract used by other providers:

```text
SmartAIHub Control Plane
        ↓
Provider-neutral contracts
        ↓
ZCode Adapter
        ↓
ZCode upstream
```

This keeps SmartAIHub future-proof if ZCode improves rapidly, changes internal implementation, gains official ACP support, or is later replaced by another harness.

---

# Revision 4 Canonical Learning/Fabric Split

Historical references in this Spec to Spec 230 mean the Agentic Development Fabric: Project Context Pack, protocol/Skill materialization and harness bootstrap.

Cross-run learning, replay, provider strategy evaluation and historical ranking belong to **Spec 222 Self-Improving Exploration Layer**. The ZCode adapter MAY emit normalized verified outcome evidence to Spec 222, but Spec 222 does not control a live ZCode session.

Kimi Code is a peer harness family, not a ZCode mode. ZCode-specific transport/plugin behavior remains isolated in Spec 223.


## Shared Retrieval Contract Family — `SAH-RETRIEVAL-2`

All production consumers in Specs 214–230 that require semantic/document/entity search SHALL use the canonical Spec 229 Retrieval Broker contract rather than provider-specific search APIs.

The shared request MUST carry at least:

```text
request_id
principal / tenant / project / environment
purpose
query_class
query_text or structured selector
source_classes
required_visibility / ACL scope
language hints
exact identifiers if present
maximum evidence budget
freshness requirement
consumer spec / run / workflow references
```

The normalized response MUST carry at least:

```text
retrieval_trace_id
provider/profile/version
query plan
EvidenceRef[]
source identity + source revision/digest
ACL/provenance/freshness state
retrieval/rerank scores as non-authoritative evidence
quality-gate result
partial/degraded indicators
```

`EvidenceRef` SHALL be a reference to authorized canonical content; retrieved text/vector similarity SHALL NOT become lifecycle state, authorization, approval, identity or source-of-truth data.


---

# Revision 5 — ZCode Retrieval and Skill Context Boundary

ZCode SHALL consume SmartAIHub Skill/project/spec knowledge through Spec 230-prepared context or governed SmartAIHub MCP/API calls backed by Spec 229. The ZCode adapter SHALL NOT implement a second SmartAIHub-wide vector database or bypass Spec 220 scope checks.

Repository-local ZCode/native search over the checked-out workspace remains allowed and useful. Cross-project, Library, Help, private RAG and Skill Marketplace search remain SmartAIHub-governed retrieval.

When a Skill is selected for a ZCode run, the adapter SHALL receive a pinned/digested Skill reference or run-scoped materialization from Spec 230; a raw semantic search hit MUST NOT be auto-installed/executed.

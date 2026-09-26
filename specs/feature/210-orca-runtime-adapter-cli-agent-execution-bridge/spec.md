# Spec 210 — SmartAIHub Orca Runtime Adapter & CLI Agent Execution Bridge
## Governed Runtime Integration for Claude Code, Codex, Antigravity and Future CLI Agents

**Status:** Architecture Freeze Candidate / Ready for implementation planning; repository alignment is partial and the Orca route is not production-enabled  
**Spec ID:** 210  
**Revision:** 7 — repository-convergence hardening after the 20-pass 207–210 cross-spec audit; explicitly records current Runner, Job Control Plane, runtime adapter and implementation gaps  
**Date:** 2026-09-19  
**Suggested repository path:** `specs/feature/210-orca-runtime-adapter-cli-agent-execution-bridge/spec.md`  
**Primary owner:** Spec 200 — Universal External Agent Control Plane  
**Routing owner:** Spec 206 — A2A-First Hybrid External Agent Interoperability  
**Execution substrate:** SmartAIHub Runner / shared Execution Control Plane  
**Durable execution truth:** existing `worker_jobs`, `worker_job_attempts`, `worker_job_events`, `worker_job_dispatches`, `worker_job_outbox` and `worker_job_settlements`  
**Capability/tool owner:** Capability Registry/Resolver + Spec 199 External MCP Gateway  
**Computer-use owner:** Spec 208 Hybrid Computer Use Engine  
**Workflow owner:** Spec 209 AI Workflow Studio  
**Economic owner:** Spec 207 Economic Control Plane / existing billing-credit ledger  
**Product horizon:** Q4 2026 foundation, designed for 2027+ runtime/provider churn without binding SmartAIHub to Orca or any one CLI agent.

---

# 0. Executive Decision

SmartAIHub SHALL integrate [stablyai/orca](https://github.com/stablyai/orca) as a first-class **external CLI agent runtime adapter** under Spec 200.

Orca SHALL NOT become:

- SmartAIHub's canonical workflow engine;
- SmartAIHub's durable job database;
- SmartAIHub's capability registry;
- SmartAIHub's permission/approval system;
- SmartAIHub's MCP gateway;
- SmartAIHub's A2A implementation;
- SmartAIHub's billing source of truth;
- SmartAIHub's artifact store;
- the only way to run Claude Code, Codex, Antigravity, or future agents.

The canonical role is:

> **Orca is a replaceable execution substrate for terminal-based external agents. SmartAIHub remains the control plane, policy authority, durable state owner, capability gateway, audit owner, billing owner, and user-facing product.**

The canonical architecture is:

```text
User / API / AI Workflow Studio / Universal Assistant
                       │
                       ▼
             Goal / Workflow Orchestrator
                       │
                       ▼
              Capability Resolver
                       │
                       ▼
          Spec 206 External-Agent Router
             ┌─────────┴──────────┐
             │                    │
     eligible A2A route      Spec 200 route
             │                    │
             ▼                    ▼
         A2A Adapter      External Agent Gateway
                                  │
                         Runtime Route Resolver
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
               Orca Adapter   Native Direct   Generic PTY
                    │           Adapter         Adapter
                    ▼
             SmartAIHub Runner
                    │
                    ▼
               Orca Runtime
           ┌────────┼────────┬──────────┐
           ▼        ▼        ▼          ▼
        Claude    Codex  Antigravity  Future CLI
```

Default routing SHALL remain compatible with Spec 206:

```text
A2A-first when an eligible A2A interface safely satisfies the task
        ↓ otherwise
Spec 200 native execution plane
        ↓ runtime resolution inside Spec 200
Orca / direct-native / generic PTY
```

Orca is therefore **inside the Spec 200 fallback/native execution plane**, not a parallel protocol that bypasses Spec 206.

---

# 1. Why This Spec Exists

Spec 200 already defines SmartAIHub's universal external-agent execution architecture, including provider adapters, Runner execution, session/event/result normalization, scoped assets/context, provider-native authentication, and tool access.

Without Spec 210, SmartAIHub would progressively duplicate the same lower-level runtime work for every terminal-based agent:

- terminal spawning;
- readiness detection;
- prompt delivery;
- prompt submission confirmation;
- process/session tracking;
- terminal scrollback;
- worktree creation;
- parallel worktrees;
- local provider login reuse;
- multi-agent task fan-out;
- agent-specific CLI quirks;
- terminal/session cleanup;
- SSH-hosted development environments.

Orca already provides a substantial portion of that substrate and supports CLI agents including Claude Code, Codex, Antigravity, Hermes, Qwen Code, OpenCode, Grok, Cursor, and other terminal agents.

The implementation objective is therefore:

```text
Reuse Orca where it creates leverage
+
retain SmartAIHub governance and durable control
+
retain direct provider adapters where they are superior
+
retain a generic PTY escape hatch
+
prevent runtime dependency lock-in
```

---

# 2. Current Orca Baseline and Compatibility Assumption

As of the research baseline for this spec, 2026-09-19:

- Orca presents itself as an AI orchestrator/ADE for parallel coding agents.
- It supports Claude Code, Codex, Antigravity and many other CLI agents.
- It supports isolated Git worktrees and parallel agents.
- It exposes CLI automation and structured orchestration primitives.
- It supports a headless `orca serve` runtime on Linux.
- It provides JSON-oriented CLI surfaces intended for automation.
- It ships rapidly and its own documentation advises callers to load the version-matched CLI guide rather than assume old command/flag behavior.
- Orca is MIT-licensed.
- Stable releases are frequent; the implementation MUST assume command/schema drift.
- Recent public issues demonstrate that agent readiness, prompt injection/submission, Antigravity integration, and lifecycle semantics can vary by version/provider.

Therefore:

> **Spec 210 MUST implement feature probing and contract conformance. Version number alone is insufficient evidence that an Orca/provider combination is safe to dispatch production work.**

---

# 3. Goals

Spec 210 SHALL deliver:

1. A replaceable `OrcaRuntimeAdapter` under Spec 200.
2. Automatic discovery of locally usable Orca runtimes.
3. Automatic discovery of Orca-supported/configured CLI agents.
4. Safe routing among `a2a`, `orca`, `native_direct`, and `generic_pty`.
5. Reuse of existing provider-native logins where policy permits.
6. Full SmartAIHub job/session/event/result normalization.
7. Verifiable prompt submission rather than trusting a byte-write acknowledgement.
8. Durable reconciliation after Runner/Orca/network/process restart.
9. Parallel worktree execution without uncontrolled same-worktree writers.
10. Scoped SmartAIHub Skill/MCP access from agents.
11. Scoped Library/Asset materialization for image/video/audio/document/code tasks.
12. Human approvals and runtime user-input waits.
13. Cancellation, fencing, and unknown-outcome handling.
14. Runtime compatibility certification and automatic degradation/blocking.
15. Managed install/update/rollback support for Runner deployments.
16. Windows, macOS, Linux and headless Linux support where certified.
17. User-facing status and diagnostics without forcing ordinary users to understand Orca internals.
18. Multi-agent execution compatible with Spec 209 workflows.
19. No duplicate durable job/control/permission/billing/audit systems.
20. A safe migration path that does not delete existing direct Claude/Codex/Antigravity adapters.

---

# 4. Non-Goals

Spec 210 SHALL NOT:

- replace Spec 200;
- replace Spec 206;
- replace A2A;
- make Orca mandatory;
- expose raw Orca management to ordinary end users;
- make Orca orchestration the top-level SmartAIHub workflow engine;
- use Orca's local database as SmartAIHub execution truth;
- allow agents to bypass Spec 199 and connect directly to arbitrary SmartAIHub-managed upstream MCP servers;
- download/install SmartAIHub Skill packages into external agents;
- store provider passwords in SmartAIHub merely to make Orca work;
- infer successful execution from `input_accepted`;
- retry an ambiguous execution by starting another writer before the previous attempt is fenced/reconciled;
- allow arbitrary user-provided shell command strings as agent definitions;
- silently modify provider credentials/configuration without explicit installation/runtime policy;
- automatically merge competing code changes without verification/policy;
- expose unrestricted Computer Use directly through Orca when Spec 208 should govern the action.

---

## 4.1 Retired-System Boundary

Spec 210 MUST NOT add new callers, routes, schemas, migrations, feature flags,
compatibility shims or dispatch adapters for any retired system, including:

```text
Agency and Agency-related services/integrations
work/request and work/requests
workpacks/*
the legacy custom /workflows engine
OpenSandbox and sandbox_jobs
Docker/OpenSandbox dispatch
```

Existing residue may be migration input only after a separately authorized
read-only dependency/runtime audit. Orca is not a migration shortcut. Approved
isolated server-side execution uses the Cloudflare Container boundary under the
canonical Job Control Plane; local execution uses the governed Runner.

# 5. Cross-Spec Ownership Contract

This section is normative.

| Concern | Canonical Owner | Spec 210 Responsibility |
|---|---|---|
| Universal Assistant | Spec 196/shared platform | consume existing delegation path |
| Durable jobs | existing `worker_jobs`, attempts, events, dispatches, outbox and settlements | map Orca execution into existing jobs and subordinate attempt/dispatch evidence |
| External-agent semantics | Spec 200 | implement one runtime adapter |
| A2A vs native routing | Spec 206 | participate only after route selection |
| MCP upstream transport | Spec 199 | never duplicate |
| Capability Registry | shared | publish Orca/provider runtime availability |
| Skills | SmartAIHub Skill platform | expose remotely through Capability Gateway |
| RAG/Help/Context | shared Retrieval Broker | materialize scoped context package |
| Runner control channel | shared execution infrastructure | reuse existing channel |
| Local process supervision | Runner | supervise Orca/runtime child processes |
| Computer Use | Spec 208 | invoke governed capability when required |
| Workflow authoring/execution graph | Spec 209/shared runtime | Orca may execute a bounded delegated node/subgraph only |
| Billing/credits/revenue | shared economic plane | emit usage dimensions, no second ledger |
| Approval | shared Approval Service | map agent/tool/input requests |
| Library/assets | shared Library/Asset Gateway | materialize/upload via canonical AssetRefs |
| Audit/trace | shared platform | normalize Orca/provider events |
| Secrets | shared secrets + provider-native local auth | never copy credentials unnecessarily |

No new parallel system is permitted for any concern already owned above.

---

## 5.1 Current Repository Compatibility Baseline — 2026-09-19

This section is normative for implementation planning. The architecture in this
spec is a target contract; the following repository evidence is the current
baseline and MUST NOT be presented as proof that Spec 210 is already implemented.

| Contract area | Current repository evidence | Spec 210 consequence |
|---|---|---|
| Durable Job truth | `apps/web/drizzle/schema.ts` contains `workerJobs`, `workerJobAttempts`, `workerJobEvents`, `workerJobDispatches`, `workerJobOutbox` and `workerJobSettlements`; `apps/web/server/services/jobControlPlaneGateway.ts` is the producer boundary | Reuse these physical tables and the existing gateway. Do not add `orca_jobs`, an Orca queue, or a second outbox. |
| Current Job status vocabulary | `worker_job_status` currently includes `pending`, `queued`, `leased`, `claimed`, `preparing`, `running`, `waiting_external`, `retry_scheduled`, `uploading`, `publishing`, `indexing`, `completed`, `succeeded`, `failed`, `canceled`, `cancelled` and `expired`; `jobControlPlaneTypes.ts` also exposes a narrower canonical transition projection | The detailed Spec 210 phases are adapter/phase detail. They MUST map to the existing Job contract and MUST NOT require vendor state names or an unplanned new top-level enum. |
| Proposed runtime-attempt fields | `workerJobs` does not currently expose `runtime_adapter`, `route_attempt_id`, `runtime_generation` or `workspace_binding_id`; `workerJobAttempts` currently carries lease/attempt ownership fields | These fields require an explicit shared migration or a subordinate attempt record before implementation. JSON metadata alone is not sufficient for indexed reconciliation. |
| Runner wire contract | `apps/web/server/services/runnerContracts.ts` and `apps/runner-app/src/protocol.rs` define `sah-runner-v1`, authenticated identity, sequence/idempotency, fencing and secret-key rejection; `runnerControl.ts` exposes authenticated WSS plus HTTPS fallback | Orca MUST use this existing Runner identity/control boundary. It MUST NOT create a public Orca control plane or a second device registry. |
| Current Runner control coverage | `runnerControl.ts` currently handles capability publication and reconciliation envelopes; `apps/runner-app/src/adapters.rs` has approved Claude/Codex/Antigravity/Hermes/OpenClaw manifests but no `orca.v1`; `execution.rs` supports bounded direct approved-process start/cancel | Orca probe, command catalog, PTY/session lifecycle, prompt proof, event mapping and effect reconciliation remain implementation work. A capability snapshot or direct process test is not Orca certification. |
| Current agent runtimes | Web calls `/api/internal/openai-agents-runtime/*` through `apps/web/server/services/agentRuntime/client.ts`; Python provides the approved OpenAI Agents bridge and `langgraph_runtime.py` is an approved governed graph runtime | Spec 210 is an external CLI adapter only. It MUST NOT replace, fork or silently reroute the approved native agent runtime or restore the retired custom `/workflows` engine. |
| Existing external-agent jobs | `workerSchedulerService.ts` and `runEngine.ts` currently use `external_agent_task` with existing runtime types such as `openclaw_gateway` and `hermes_agent_gateway` | This is reusable admission/scheduling evidence, not proof of the Spec 210 session/result contract. The Orca route must register through the existing executor, capability, lease and settlement contracts. |
| Server authority | `createControlPlaneJob()` derives tenant, actor, authorization scope and idempotency context server-side and requires a registered executor | Orca/CLI/hostname/queue values MUST remain non-authoritative input. Every dispatch must carry server-derived tenant/job/attempt/lease/fencing scope. |
| Retired boundaries | The repository/spec baseline prohibits Agency, `work/request`, `work/requests`, `workpacks/*`, legacy `/workflows`, OpenSandbox, `sandbox_jobs` and Docker/OpenSandbox dispatch; approved isolated server-side execution is via Cloudflare Containers | Spec 210 MUST NOT add compatibility callers, adapters, schemas or migration shortcuts for those systems. |

Implementation status at this revision is therefore:

```text
architecture: specified
repository integration: partial
Orca adapter implementation: not present in the inspected Runner/Web/Python paths
production route: disabled until probe, command, session, security, migration and certification gates pass
```

The absence of an Orca implementation is an explicit release gap, not permission
to infer one from the presence of other CLI adapters. Before enabling production
auto-routing, implementation planning MUST close at least these blockers:

1. register a versioned Orca adapter/capability contract through the existing Runner;
2. add the shared Job/attempt persistence needed for route identity and reconciliation;
3. add authenticated session/control commands without expanding the public control surface;
4. add fake-agent, adapter, tenant-isolation, secret-redaction, crash/restart and mixed-version tests;
5. publish a certified Orca/agent/Runner/OS compatibility tuple and an operator rollback gate.

# 6. Core Architectural Rule: Anti-Corruption Layer

SmartAIHub SHALL never let upstream Orca JSON schemas, state names, terminal handles, or command-line conventions leak into product-domain APIs.

Runner SHALL implement:

```text
ExternalAgentRuntimeAdapter
    ├── OrcaRuntimeAdapter
    ├── ClaudeNativeAdapter
    ├── CodexNativeAdapter
    ├── AntigravityNativeAdapter
    └── GenericPtyRuntimeAdapter
```

Conceptual interface:

```ts
interface ExternalAgentRuntimeAdapter {
  probeRuntime(): Promise<RuntimeProbe>;
  discoverAgents(): Promise<AgentRuntimeCapability[]>;
  validateTask(req: AgentTaskRequirements): Promise<RouteEligibility>;
  startSession(req: StartSessionRequest): Promise<SessionReceipt>;
  submitTurn(req: SubmitTurnRequest): Promise<SubmissionReceipt>;
  observe(req: ObserveRequest): AsyncIterable<RuntimeEvent>;
  sendInput(req: RuntimeInput): Promise<InputReceipt>;
  requestCancel(req: CancelRequest): Promise<CancelReceipt>;
  reconcile(req: ReconcileRequest): Promise<ReconcileResult>;
  collectResult(req: ResultRequest): Promise<RuntimeResult>;
  cleanup(req: CleanupRequest): Promise<CleanupResult>;
}
```

All upstream Orca details SHALL be translated into canonical SmartAIHub contracts.

---

# 7. Runtime Route Model

Every external-agent attempt SHALL record:

```text
protocol_route:
  a2a
  spec200_native

runtime_adapter:
  orca
  native_direct
  generic_pty
  remote_api
```

`protocol_route` and `runtime_adapter` are different dimensions.

Examples:

```text
A2A remote Claude-compatible agent
protocol_route = a2a
runtime_adapter = remote_api
```

```text
Local Claude Code through Orca
protocol_route = spec200_native
runtime_adapter = orca
```

```text
Local Codex JSON-RPC/direct adapter
protocol_route = spec200_native
runtime_adapter = native_direct
```

User-visible product selection SHOULD normally remain agent-oriented:

```text
SmartAIHub
Claude
Codex
Antigravity
Auto
```

not:

```text
A2A
Orca
PTY
JSON-RPC
```

Runtime routing details belong in Advanced/Diagnostics.

---

# 8. Route Eligibility and Selection

Route selection SHALL be capability-driven.

Input dimensions include:

```text
task_family
required_agent/provider
required_model
required_reasoning_effort
requires_local_workspace
requires_git_worktree
requires_parallel_agents
requires_interactive_terminal
requires_structured_events
requires_computer_use
requires_assets
requires_smartaihub_tools
requires_user_subscription_login
requires_headless_execution
requires_remote_machine
privacy/residency constraints
approval policy
known runtime health
compatibility certification
provider rate-limit state
cost policy
user route preference
```

Canonical resolution:

```text
1. Spec 206 evaluates eligible A2A interfaces.
2. If A2A safely satisfies task + policy, use A2A unless policy explicitly requests native.
3. Otherwise enter Spec 200 native plane.
4. Evaluate Orca, native-direct and generic PTY eligibility.
5. Reject routes that fail conformance/security/health requirements.
6. Select the highest-policy-priority eligible route.
7. Snapshot the route decision into the job attempt.
8. Never silently change route after ambiguous side effects without reconciliation.
```

Runtime preference values:

```text
auto
orca_preferred
native_direct_preferred
generic_pty_allowed
orca_required
native_direct_required
```

`auto` is default.

---

# 9. Provider Strategy

## 9.1 Claude Code

Orca route is attractive when:

- worktree isolation is useful;
- parallel terminal agents are useful;
- user already authenticates Claude Code locally;
- terminal-native interaction is acceptable;
- Orca compatibility probe is healthy.

Native/direct Claude route MAY be preferred when:

- richer structured provider events are required;
- provider SDK/session APIs expose semantics Orca cannot safely preserve;
- Orca runtime is degraded;
- lower-latency direct interaction matters.

## 9.2 Codex

Orca route is attractive for:

- terminal/worktree workflow;
- parallel code agents;
- reuse of local ChatGPT/Codex login;
- unified terminal supervision.

Native Codex adapter MAY remain preferred for:

- structured JSON-RPC/provider-native events;
- deterministic session APIs;
- features not available or reliable through Orca.

## 9.3 Antigravity

Antigravity MUST be treated as a separately certified combination.

Public Orca support listings are not sufficient certification.

As of this spec baseline, current public issues indicate recent problems around:

- Antigravity `tui-idle` readiness;
- orchestration inject recognition;
- startup/trust-workspace interactions on some versions/platforms.

Therefore initial production policy SHOULD be:

```text
Orca + Antigravity = EXPERIMENTAL/DEGRADED until local conformance suite passes.
```

If a native SmartAIHub Antigravity adapter is healthy, `auto` SHOULD prefer the healthy native route over a degraded Orca route.

## 9.4 Future CLI Agents

Future agents MAY become available through Orca without SmartAIHub core changes when all are true:

1. agent command is registered by administrator/installer;
2. Orca discovers/launches it;
3. SmartAIHub generic conformance suite passes;
4. security/approval behavior is known;
5. prompt submission can be proven or safely classified as unknown;
6. completion/result semantics can be normalized;
7. capability access is scoped;
8. cancellation/reconciliation behavior is known.

A README claim alone MUST NOT promote an agent to `CERTIFIED`.

---


## 9.5 Orca Execution Subtransport

Spec 210 MUST NOT assume every useful Orca execution path is necessarily terminal/PTY based forever.

The adapter SHALL distinguish:

```text
orca_subtransport:
  terminal_tui
  structured_native
```

`structured_native` MAY be selected only when the exact Orca/agent/platform tuple exposes a machine-verifiable structured session contract and passes certification for:

```text
start
input acknowledgement
turn-start proof
stream/progress
approval/question
cancel
resume/reconcile
result
model/account/workspace binding
```

If both paths are certified, route policy MAY prefer structured-native execution for tasks where it materially reduces TUI paste/readiness ambiguity. Terminal/TUI remains a fallback only when allowed by policy.

A change between `terminal_tui` and `structured_native` is a route-attempt change and MUST NOT occur silently after an ambiguous start.


# 10. Compatibility Certification

Every runtime tuple SHALL have a compatibility state:

```text
UNKNOWN
PROBING
CERTIFIED
DEGRADED
BLOCKED
QUARANTINED
```

Tuple key SHOULD include:

```text
runner_os
runner_arch
orca_app_version
orca_cli_version
orca_runtime_schema_version
agent_id
agent_cli_version
agent_model_family (when behavior differs)
execution_mode
```

Certification is based on executable probes, not version strings alone.

Required probe groups:

```text
runtime_reachable
json_contract
version_matched_guide_available
terminal_create
tui_readiness
prompt_submit
turn_started
stream/read
completion_signal
cancel
resume/reconcile
worktree_create
worktree_cleanup
large_prompt
unicode
path_with_spaces
provider_update_prompt
provider_login_required
approval_required
```

Optional groups:

```text
orchestration_task
worker_start
worker_done
ask_reply
nested_dispatch
remote_ssh
computer_use_bridge
```

---

# 11. Version-Matched Orca Command Discovery

Spec 210 SHALL NOT hard-code the full Orca CLI surface as a permanent contract.

At runtime, the adapter SHALL:

```text
1. resolve one exact Orca executable;
2. run read-only status/version probe;
3. obtain version-matched Orca CLI/orchestration guide when supported;
4. query `--help`/capabilities for required commands;
5. derive a capability map;
6. cache the map keyed by executable digest + Orca version;
7. invalidate on binary/version change;
8. execute only known/certified command forms.
```

If the selected Orca executable fails:

> Do not silently fall through to a different Orca executable/build.

This prevents a production job from unexpectedly targeting another installation or dev build.

The adapter SHALL prefer machine-readable JSON output.

---

# 12. Orca Runtime Binding

A Runner may encounter:

- desktop Orca already running;
- a managed SmartAIHub headless Orca runtime;
- multiple installed Orca binaries;
- stale runtime processes;
- unreachable runtime state.

The adapter SHALL bind a job to one explicit runtime identity:

```text
orca_executable_digest
orca_app_version
orca_runtime_id
runtime_endpoint_if_applicable
runner_id
runtime_generation
```

Once execution begins, that binding SHALL NOT silently jump to another runtime.

If the runtime disappears:

```text
mark attempt UNVERIFIABLE / RECONCILING
discover whether prior session still exists
fence prior attempt where possible
only create replacement after reconciliation policy allows
```

---

## 12A. Repository / Worktree / Terminal Scope Guard

Orca runtime discovery and listing surfaces can be broader than the current repository. SmartAIHub MUST therefore treat every Orca object as **runtime-global until ownership is independently verified**.

Every destructive or state-changing operation against an Orca object SHALL verify a binding tuple:

```text
runner_id
orca_runtime_id
runtime_generation
repo_id
workspace_binding_id
worktree_id
terminal_handle / dispatch_id / task_id
worker_job_id
route_attempt_id
```

Rules:

- never select a worktree, terminal, task, dispatch, or session by display name alone;
- never accept "first match" semantics from runtime-global listings;
- every discovered Orca object used by SmartAIHub MUST be checked against the expected repository/workspace owner before mutation;
- a listing result that lacks sufficient ownership fields is read-only evidence until SmartAIHub can corroborate the binding from another certified source;
- cross-repository objects discovered during reconcile MUST NOT be attached to the current job merely because they are active;
- `stop`, `remove`, `cleanup`, `resume`, `worker_done`, and similar mutations require scope verification immediately before execution;
- scope verification failure becomes `RUNTIME_SCOPE_MISMATCH` and blocks automatic mutation.

SmartAIHub's own `workspace_binding_id` remains canonical even if Orca uses a different repository/worktree identity model.

## 12B. Stable Identity, Not Human Labels

Orca tab names, generated session titles, provider thread names and user-visible labels are non-authoritative.

SmartAIHub SHALL maintain its own stable display mapping:

```text
logical_agent_run_id
worker_job_id
provider_session_id (when known)
orca terminal/dispatch/worktree ids
safe display label
```

Renaming a tab/session MUST NOT change identity. Duplicate labels MUST NOT create ambiguity in automation.

## 12C. Resume Preflight and Stale-CWD Protection

Before resuming any Orca/provider session, Runner SHALL validate:

```text
recorded_cwd exists
recorded_cwd canonical path is inside the expected allowed workspace
workspace binding still exists
worktree generation is current
repository identity matches
target branch/base revision is compatible with resume policy
```

If the recorded cwd/worktree was deleted or replaced:

- do not execute a resume command that blindly `cd`s into the stale path;
- prefer a provider-supported explicit rebind/resume into the intended workspace when certified;
- otherwise start a new session with a Context Package summarizing the prior session;
- mark the old session as `STALE_WORKSPACE`;
- require explicit operator/user action before attaching it to a different repository.

A historical provider session identity does not grant authority over a newly created directory that happens to reuse the same path.



## 12D. Canonical Repository Identity and Rename / Transfer Handling

SmartAIHub MUST NOT use an Orca display project id, cached provider label, icon label, sidebar grouping key, directory basename, or a single remote URL string as canonical repository identity.

SmartAIHub SHALL own a stable `repo_id` and maintain independently observed aliases/evidence:

```text
repo_id                         # immutable SmartAIHub identity
provider_repository_id          # stable provider id when available
canonical_remote_fingerprint
observed_remote_urls[]
local_git_common_dir_fingerprint
workspace_binding_ids[]
identity_epoch
last_revalidated_at
```

Rules:

- repository rename/account rename/org transfer MUST NOT create a second SmartAIHub repo merely because Orca changes or retains a label;
- a newly observed remote that conflicts with the bound identity triggers `REPO_IDENTITY_REVALIDATION_REQUIRED` rather than silent merge/split;
- provider-stable repository IDs, when available and authorized, outrank presentation labels;
- a fresh canonical remote observation outranks stale vendor display metadata;
- SmartAIHub MAY retain historical aliases to reconcile old Orca sessions/worktrees after rename/transfer;
- cross-host project equivalence MUST be proven from SmartAIHub evidence, not Orca sidebar grouping alone;
- every identity-changing observation increments or revalidates `identity_epoch` before mutation is allowed.

This specifically protects multi-host fleets where one Orca runtime may retain stale provider presentation metadata while another host discovers the new repository name.

## 12E. Unknown / Conflicted Runtime Ownership Is Non-Executable

Any Orca/runtime object whose owner resolves to an unknown, sentinel, conflicted, stale, or ambiguous identity SHALL be represented as:

```text
OWNER_UNKNOWN
OWNER_CONFLICTED
OWNER_STALE
```

Such an object MAY be shown as diagnostic evidence but MUST NOT be accepted as a valid runtime/environment/worktree target for:

```text
resume
send
stop
remove
cleanup
merge
worker_done
artifact authority
```

SmartAIHub MUST NOT reinterpret an unresolved-owner marker as if it were a normal remote runtime id.

## 12F. Workspace-Disappearance Recovery Surface

Loss or deletion of a workspace directory MUST NOT make an active agent uncontrollable.

If the bound workspace disappears while the process/session is still alive:

```text
workspace_state = MISSING
agent_process_state = independently observed
job_state = RECONCILING / ATTENTION_REQUIRED
```

Runner SHALL retain, where technically possible:

- process/session identity;
- recent safe transcript tail;
- cancellation/termination ability;
- recovery actions;
- original workspace binding and revision evidence.

SmartAIHub MUST NOT automatically recreate a directory at the same path and attach the old session to it without generation/identity verification. A recreated path is a new filesystem object until proven otherwise.



## 12G. Provider Session Origin / Working-Directory Attestation

A provider session identifier is not sufficient proof that the session belongs to the currently selected SmartAIHub workspace.

Before resume/adopt/continue, Runner SHALL attest the provider session origin using the strongest available evidence:

```text
provider_session_id
provider-recorded project/root when available
observed process cwd
SmartAIHub workspace_binding_id
canonical repo_id
worktree generation
origin runner/runtime identity
```

The Orca pane/worktree association is only one observation.

If the provider session was originally created from a different directory than the Orca pane's current worktree, SmartAIHub SHALL NOT silently resume it into the pane worktree.

Classify:

```text
SESSION_ORIGIN_MATCH
SESSION_ORIGIN_MISMATCH
SESSION_ORIGIN_UNKNOWN
```

Policy:

- `MATCH` may resume if the rest of the resume manifest also matches;
- `MISMATCH` requires a new session or explicit user/admin recovery flow;
- `UNKNOWN` is not eligible for unattended write-capable resume on high-risk tasks;
- a historical session id MUST NOT authorize access to a newly created directory that reuses the same path.

This prevents cross-project context leakage and agents continuing with valid conversation history in the wrong filesystem location.


# 13. Deployment Modes

## 13.1 User Desktop Mode

Used when user already runs Orca/agents locally.

Characteristics:

- runs in interactive user session;
- may reuse provider-native login state;
- SmartAIHub Runner discovers Orca;
- user consent applies to local file/workspace access;
- no SmartAIHub copy of provider password required.

## 13.2 Managed Headless Runner Mode

Used on Linux servers/build machines.

Characteristics:

- Runner manages a pinned Orca runtime;
- run as unprivileged service user;
- dedicated runtime directory;
- explicit binary digest/version;
- health probe;
- controlled update/rollback;
- Xvfb/runtime prerequisites installed where required;
- provider login is provisioned through provider-supported methods;
- SmartAIHub backend does not connect directly to the Orca listener.

## 13.3 Remote Developer Box Mode

Runner may live on a remote Windows/macOS/Linux machine.

Canonical path:

```text
SmartAIHub Backend
      │
      │ existing authenticated outbound Runner Control Channel
      ▼
SmartAIHub Runner
      │ local process/CLI boundary
      ▼
Orca Runtime
      ▼
Agent CLI
```

SmartAIHub SHALL NOT open a new public inbound Orca control port merely for Spec 210.

---

# 14. Network Security

Default managed policy:

```text
Backend ↔ Runner = existing SmartAIHub Runner Control Channel
Runner ↔ Orca = same-host/local/private execution boundary
```

If Orca's WebSocket/headless server is used:

- prefer loopback/private binding where supported;
- do not expose unauthenticated/public WS to the Internet;
- if cross-host access is genuinely required, place behind approved private networking/tunnel and authentication controls;
- pairing URLs/device credentials are secrets;
- pairing material MUST NOT be written to ordinary logs;
- managed SmartAIHub deployments SHOULD disable unnecessary mobile/pairing features where supported and policy permits;
- firewall rules MUST be explicit;
- runtime endpoint is not a tenant authorization boundary.

---


## 14A. Trust Zones and Execution Profiles

Orca can launch powerful local agents that may inherit ambient filesystem, shell, Git, network and provider capabilities. SmartAIHub MUST model this explicitly rather than assume every action is mediated by the Capability Gateway.

Execution profile SHALL be one of:

```text
USER_MANAGED_TRUSTED
SMARTAIHUB_MANAGED_RESTRICTED
SMARTAIHUB_MANAGED_ISOLATED
```

### `USER_MANAGED_TRUSTED`

Typical personal desktop/owner-operated Runner.

- agent may inherit the user's normal local CLI capabilities;
- SmartAIHub still governs capabilities invoked through SmartAIHub;
- SmartAIHub MUST clearly state that local shell/network tools outside SmartAIHub cannot be fully mediated by the platform;
- high-risk workflow policies MAY disallow this profile.

### `SMARTAIHUB_MANAGED_RESTRICTED`

Managed Runner profile.

- dedicated workspace root;
- environment allowlist;
- resource limits;
- explicit provider credentials;
- controlled network policy where available;
- no unrelated user home access;
- managed runtime configuration.

### `SMARTAIHUB_MANAGED_ISOLATED`

Highest-isolation profile for untrusted/multi-tenant work.

- container/VM/OS-account isolation as appropriate;
- dedicated runtime/profile;
- isolated filesystem;
- bounded network egress;
- explicit artifact ingress/egress;
- no ambient user credentials.

Route eligibility SHALL include the required execution profile. A lower-isolation route MUST NOT be silently selected for a task that requires a stronger profile.

## 14B. Ambient Capability Containment

Orca/provider agents may have access to native commands or integrations such as:

```text
git
ssh
gh
curl
package managers
cloud CLIs
Orca-native GitHub/Linear/browser features
provider-local MCP/config
```

These are **ambient capabilities**, distinct from SmartAIHub-governed capabilities.

For managed runtimes:

- ambient capabilities SHALL be inventoried;
- disallowed commands/network destinations SHOULD be restricted by the managed execution profile;
- sensitive side effects SHALL require SmartAIHub approval/policy where technically enforceable;
- SmartAIHub MUST NOT claim that all agent side effects are mediated if the selected trust profile permits unrestricted local shell/network access;
- high-risk tasks SHOULD use `SMARTAIHUB_MANAGED_ISOLATED`.


# 15. Provider Credential Policy

Local provider credentials SHOULD remain provider-native.

SmartAIHub SHALL NOT:

- scrape plaintext passwords;
- upload local OAuth refresh tokens merely to run a local CLI;
- mirror provider credential directories to the cloud;
- expose provider tokens to LLM prompts or UI.

Runtime modes:

```text
LOCAL_USER_AUTH
MANAGED_SERVICE_AUTH
PLATFORM_API_AUTH
```

Credential ownership SHALL remain explicit:

```text
user
tenant
platform
```

If Orca or a provider modifies provider configuration/hook files, SmartAIHub managed installation MUST:

1. disclose the integration effect;
2. back up owned/affected configuration where feasible;
3. scope modifications to the managed profile where possible;
4. validate before/after state;
5. provide repair/rollback;
6. never copy credentials into SmartAIHub logs.

---


## 15A. Provider Account Binding

A machine may contain multiple provider accounts. Orca may expose account switching/usage information.

Every production attempt SHALL bind to a provider account identity **without storing the secret itself**.

Conceptual binding:

```text
provider
account_binding_id
account_display_alias
credential_owner
runtime_profile
binding_generation
```

Rules:

- account selection is explicit or policy-derived;
- never silently switch to another account because the requested account is rate-limited;
- account change during an active attempt invalidates the execution binding and requires reconciliation;
- usage/rate-limit telemetry is scoped to the bound account;
- another tenant/user MUST NOT inherit the prior user's provider session;
- UI may show a safe alias, never raw tokens.

## 15B. Model / Reasoning Binding Continuity

Requested model and reasoning effort SHALL be snapshotted per attempt.

On resumed/reused Orca terminals, SmartAIHub SHALL verify that the actual provider session uses the requested:

```text
agent
model
reasoning effort/profile
account binding
```

A resumed pane that silently retains an older model/profile SHALL be treated as `RUNTIME_BINDING_MISMATCH`, not successful resume.


## 15C. Resume Launch-Profile Attestation

A resumed provider session is not assumed to preserve the launch profile used by a fresh session.

Before SmartAIHub marks a resumed session usable, the adapter SHALL verify, where the provider/runtime exposes the evidence:

```text
agent executable/profile
provider account binding
model
reasoning effort
permission/sandbox mode
required environment/config profile fingerprint
workspace/cwd
```

The requested attempt snapshot and observed resume state MUST match for policy-critical fields.

If an exact field cannot be observed:

- mark it `UNVERIFIED`;
- route policy decides whether that uncertainty is acceptable;
- a task that requires an exact model/account/sandbox profile MUST NOT continue on an unverified resumed session.

Do not rely on interactive shell aliases to reconstruct provider launch state. Managed execution SHALL use explicit structured executable/args/environment and a stored non-secret `launch_profile_fingerprint`.

## 15D. Headless Multi-Account Policy

SmartAIHub SHALL NOT assume Orca account switching behaves identically in desktop, SSH and headless modes.

For headless/shared infrastructure, account routing SHOULD use one of:

```text
dedicated provider profile
dedicated OS/service account
dedicated managed runtime profile
provider-supported explicit account selection
```

until the exact Orca/provider tuple passes multi-account conformance.

A UI account-switch control is not sufficient evidence that a newly launched headless session actually changed account.

If exact account binding cannot be proven, the route is ineligible for tasks requiring a specific user/provider account.

## 15E. Per-Host Launch Profile

Agent launch commands/configuration can differ by execution host.

SmartAIHub SHALL keep a Runner-owned launch profile per:

```text
runner_id
host/runtime profile
agent_id
provider account binding
OS/architecture
```

The adapter MUST NOT assume that one Orca global `agentCmdOverrides` / default args / environment configuration is valid across local, SSH and remote hosts.

Global Orca settings MAY be read as user preferences but SHALL NOT be the sole canonical launch configuration for SmartAIHub-managed multi-host execution.



## 15F. Continue / New-Session CWD Safety

Starting a fresh continuation from a historical provider session is not the same as resuming that exact session.

Before creating a new session from old history, Runner SHALL reject or rebind a starting directory that would cause provider user configuration to be interpreted as project-local configuration.

At minimum validate:

```text
candidate cwd exists
candidate cwd belongs to expected workspace
candidate cwd is not the provider config root itself
candidate cwd does not change provider config precedence unexpectedly
path comparison uses the TARGET EXECUTION HOST semantics
```

Examples of provider config roots include user-level `.codex`, `.claude`, or equivalent provider directories.

If no safe target workspace exists, continuation SHALL fail with `UNSAFE_CONTINUATION_CWD` rather than silently launching in the user's home/config root.

## 15G. Target-Host Path Semantics

Path normalization MUST use the execution host's platform semantics, not the SmartAIHub web server or controlling desktop's semantics.

The binding layer SHALL account for:

```text
case sensitivity
separator rules
UNC/network paths
symlink/junction resolution
WSL vs Windows namespaces
remote SSH host paths
```

A path comparison performed on the wrong host semantics cannot establish workspace authority.


# 16. Provider Config Isolation

Global home-directory mutation is risky for managed automation.

Preferred strategies in order:

```text
1. provider-supported per-session/project configuration
2. provider-supported environment/config override
3. dedicated managed OS/service profile
4. narrowly managed user-profile config with explicit consent
```

SmartAIHub MUST NOT invent unsupported provider config redirection that breaks authentication semantics.

Any persistent config mutation SHALL record:

```text
config_owner
path
pre_change_hash
post_change_hash
reason
runtime_version
rollback_status
```

Secret values themselves SHALL NOT be stored in audit.

---

## 16A. Provider Configuration Mutation Lock

Some agent/runtime integrations mutate shared provider configuration files during launch or remirroring. Concurrent launches can therefore race even when they use different worktrees.

Runner SHALL support a provider-configuration mutex keyed by the narrowest shared mutation domain, for example:

```text
runner_id
OS user/profile
provider
provider config path/profile
account binding
```

The lock SHALL cover only the mutation/launch critical section, not the entire agent run.

If a provider's configuration behavior is unknown, certification SHALL test concurrent startup before allowing concurrency > 1.

A global config mutation failure SHALL become a typed startup/config error, not a silent worker death.

## 16B. Config Integrity and Mid-Session Drift

For model/profile-critical managed configuration, Runner SHOULD record a non-secret fingerprint at:

```text
before launch
after launch
after resume
before authoritative completion
```

Unexpected change that can alter model, reasoning effort, sandbox, account or endpoint becomes:

```text
RUNTIME_CONFIG_DRIFT
```

and may require pause/reconciliation.

SmartAIHub SHALL NOT assume provider config regeneration/remirroring preserves every top-level model/effort field.



## 16C. Managed Agent Hook Governance

Orca/provider hook installation can modify global user configuration and therefore belongs to the managed-runtime change surface.

For every managed hook, SmartAIHub SHALL inventory:

```text
provider
config file/path class
hook event
exact command digest
interpreter/executable
expected stdin format
expected stdout format
timeout
failure policy
installed_by_runtime_version
```

Rules:

- prefer provider-supported local/project/profile-scoped configuration over synchronized/global user configuration when available;
- back up and fingerprint any affected persistent config before managed mutation;
- uninstall/repair MUST remove only SmartAIHub/Orca-owned entries and preserve unrelated user config;
- a hook that exists for observability/coordination MUST NOT become an undocumented security gate;
- a hook required for security/approval MUST be explicitly classified and fail closed when unavailable;
- hook status is part of runtime certification and health, not an assumed implementation detail.

## 16D. Hook Timeout, I/O and Failure Semantics

Every certified hook path SHALL have bounded execution time and a validated I/O contract.

Required tests:

```text
valid stdin is fully consumed or intentionally ignored
stdout exactly matches provider-required schema
stderr/noise cannot corrupt structured stdout
nonzero exit remains observable
hook target unavailable returns within bounded time
provider process is not stalled by a dead telemetry endpoint
```

For observability-only hooks, the default desired behavior is bounded fail-open with a visible degraded-health signal rather than blocking every agent tool call for an extended provider default timeout.

For security/approval hooks, fail-open is prohibited.

## 16E. Windows Hook Interpreter Portability

On Windows, SmartAIHub MUST NOT assume that the executable named `bash` means Git Bash, nor that `powershell` and `pwsh` have equivalent stdin/stdout behavior.

Certification SHALL resolve and record the exact interpreter binary used by each hook.

Requirements include:

- avoid ambiguous shell operators that force execution through an unintended shell;
- use explicit interpreter paths or provider-supported direct commands where possible;
- verify paths containing spaces;
- verify PowerShell 5.1 and PowerShell 7 behavior where supported;
- verify WSL-present and WSL-interop-disabled machines;
- detect wrappers that swallow a real failure by emitting synthetic success output;
- a hook that silently fails while returning syntactically valid success is `HOOK_FALSE_HEALTH` and degrades certification.


# 17. SmartAIHub Tool Access from Orca-Hosted Agents

An external agent running through Orca MAY use SmartAIHub capabilities.

Canonical path:

```text
Claude/Codex/Antigravity
        │
        ▼
job-scoped SmartAIHub capability/MCP endpoint
        │
        ▼
Capability Gateway / Resolver
        ├── Skill
        ├── Workflow
        ├── Internal Service
        └── Spec 199 External MCP Gateway
```

The agent MUST NOT receive:

- Skill ZIPs as the normal invocation model;
- arbitrary upstream MCP credentials;
- unrestricted tenant token;
- cross-project Library access;
- permanent user bearer token.

The runtime SHALL receive a short-lived, task/job-scoped capability credential with:

```text
tenant_id
user_id
job_id
agent_session_id
allowed_capability_ids/policy
asset scopes
expiry
revocation epoch
```

---


## 17A. Runner Local Capability Proxy

Preferred managed architecture is to avoid placing broad SmartAIHub bearer credentials directly into third-party agent environments.

Where practical:

```text
Agent CLI
   ↓ localhost job-scoped endpoint
Runner Local Capability Proxy
   ↓ authenticated Runner channel / short-lived delegated credential
SmartAIHub Capability Gateway
```

The local proxy SHALL:

- bind requests to `worker_job_id` and active runtime generation;
- expose only approved capability scope;
- enforce expiry and revocation;
- attach canonical correlation/idempotency metadata;
- prevent one local session from reusing another job's capability authority;
- redact upstream credentials;
- stop accepting calls after job settlement/revocation.

If a provider requires direct MCP endpoint configuration, use the narrowest short-lived job/session credential possible.

## 17B. Ephemeral Capability/MCP Configuration

Provider/Orca MCP configuration created for a SmartAIHub job SHOULD be ephemeral.

Lifecycle:

```text
prepare scoped config
→ launch/bind session
→ execute
→ revoke credential
→ remove/expire job-specific config
→ verify cleanup
```

Persistent global MCP configuration MUST NOT accumulate one job token per execution.

Side-effecting capability calls SHALL carry a SmartAIHub invocation/idempotency identity where supported so retries/reconciliation cannot silently duplicate operations.


# 18. Context Package Strategy

Large SmartAIHub context SHALL NOT be pasted wholesale into terminal composers.

For substantial specs/repos/assets, use a Context Package:

```text
context-package/
  manifest.json
  task.md
  selected-specs/
  retrieved-context/
  asset-manifest.json
  instructions/
```

Bootstrap prompt SHOULD be concise:

```text
You are executing SmartAIHub job <id>.
Read <local-context-manifest>.
Follow task.md.
Use only approved SmartAIHub capabilities.
Report result through the active execution contract.
```

Benefits:

- avoids huge paste races;
- reduces terminal/TUI fragility;
- supports exact file provenance;
- improves resume/reconcile;
- avoids unnecessary token duplication;
- allows selective context refresh.

Every materialized context file SHALL include lineage and access expiry semantics where relevant.

---


## 18A. Job Directory Protection

Materialized context/assets SHALL live under a job-scoped directory with:

- owner-only or least-privilege filesystem ACL;
- canonicalized paths;
- tenant/project/job identity;
- disk quota;
- cleanup lease;
- no reuse as another tenant's job directory.

Sensitive temporary files SHOULD use encrypted storage at rest when the Runner platform/organization policy requires it.

Cleanup means unlink/removal according to platform guarantees; SmartAIHub MUST NOT promise cryptographic secure erasure on storage where the OS/filesystem cannot provide it.


## 18B. Context Snapshot, Integrity and Freshness

A Context Package SHALL have a manifest containing immutable source references:

```text
context_package_id
generated_at
tenant_id
project_id
source revision/version ids
source hashes where practical
retrieval query/version
ACL snapshot reference
manifest hash
```

Before dispatch after a long queue delay, SmartAIHub SHALL revalidate:

- user/tenant still has access;
- referenced project/workspace still exists;
- critical spec/repository base revision has not invalidated the task;
- job policy does not require a fresher context snapshot.

Context Package files SHALL be written atomically:

```text
build in temp directory
→ verify hashes/manifest
→ atomic publish/rename
→ expose to agent
```

Partially materialized context MUST NOT be exposed.

If the task allows stale-but-consistent input, the job records the exact snapshot used. If it requires latest state, a fresh package is generated before start.

## 18C. Context Revocation During Execution

Revoking source access after an agent has already read a local Context Package cannot make the bytes unread.

Therefore:

- new capability/retrieval calls SHALL fail after revocation;
- server-side projection of late transcript/result data SHALL re-check current ACL;
- the job MAY be cancelled/fenced according to policy;
- local package is scheduled for cleanup;
- audit records that revocation occurred after materialization;
- UI MUST NOT claim that previously materialized data was retroactively erased.


# 19. Asset and Media Handling

For image/video/audio/document tasks:

```text
SmartAIHub Library AssetRef
        ↓
Asset Gateway authorization
        ↓
Runner materialization
        ↓
job-scoped local path
        ↓
Orca-hosted agent
```

The agent receives a manifest such as:

```json
{
  "assets": [
    {
      "asset_ref": "asset_123",
      "role": "input_video",
      "local_path": "<job-scoped path>",
      "sha256": "<digest>",
      "read_only": true
    }
  ]
}
```

Outputs SHALL return through:

```text
local result file
   ↓
Runner verifies type/size/hash
   ↓
Library upload
   ↓
canonical AssetRef
   ↓
worker_job result
```

Orca is never the permanent asset store.

---

## 19A. Asset Materialization Integrity

Before an input asset becomes visible to an agent, Runner SHALL verify:

```text
authorized AssetRef
expected tenant/project
declared media/document type
download size limit
content hash when supplied
canonical local path
read/write mode
```

A remote filename or MIME header alone is not trusted.

Output ingestion SHALL:

- canonicalize path;
- reject symlink/path escape;
- enforce type/size policy;
- compute hash;
- scan according to existing Library policy;
- upload first, then publish canonical `AssetRef`;
- never treat a local path as a durable result.

## 19B. Partial Upload and Resume

Large media artifacts may upload after agent execution finishes.

`RESULT_STAGED` and `VERIFYING` therefore remain distinct from `COMPLETED`.

Upload retry SHALL be idempotent by result/artifact identity. A duplicate upload retry MUST NOT create duplicate Library assets unless policy explicitly requests versions/copies.


# 20. Workspace Binding

Every code/task session SHALL have explicit workspace identity:

```text
project_id
repo_id
workspace_binding_id
base_revision
worktree_mode
write_mode
```

Worktree modes:

```text
CURRENT_READ_ONLY
CURRENT_EXCLUSIVE_WRITE
ISOLATED_CHILD
ISOLATED_TOP_LEVEL
EXTERNAL_BOUND
```

Default for concurrent code-writing agents:

> one isolated worktree per writer.

Two independent write agents MUST NOT share the same mutable worktree unless a SmartAIHub workspace lock explicitly permits it.

---


## 20A. Multi-Repository Workspaces

SmartAIHub MUST NOT assume the installed Orca version supports a VS Code-style multi-root/multi-repository worktree model.

For tasks spanning multiple repositories, route resolver SHALL choose one of:

```text
SMARTAIHUB_WORKSPACE_BUNDLE
SEPARATE_REPO_CHILD_JOBS
CERTIFIED_ORCA_MULTI_REPO
NATIVE_DIRECT
```

`CERTIFIED_ORCA_MULTI_REPO` is eligible only after the exact Orca version passes a multi-repo conformance test.

Cross-repo commit/merge order and dependency consistency remain SmartAIHub workflow/project concerns.



## 20B. Non-Git / Media / General Task Workspace

Spec 210 SHALL NOT force every Orca-hosted task into Git.

For media editing, document processing, research, data transformation or other non-repository work, Runner SHALL support:

```text
JOB_SCRATCH_WORKSPACE
ASSET_MATERIALIZED_WORKSPACE
PROJECT_FOLDER_BINDING
```

A scratch workspace SHALL have the same job/tenant ACL, quota, cleanup and artifact-ingress/egress controls as code workspaces.

Example:

```text
User selects 3 videos + reference images
        ↓
Asset Gateway materializes inputs
        ↓
Orca-hosted Claude/Codex receives task + asset manifest
        ↓
Agent invokes approved SmartAIHub ffmpeg/media Skills
        ↓
result video is verified
        ↓
uploaded to Library
```

Git/worktree semantics apply only when the task actually requires a repository.

## 20C. Remote SSH / Nested Execution Boundary

Although Orca supports SSH worktrees, SmartAIHub SHOULD prefer:

```text
install/register SmartAIHub Runner on the actual execution machine
```

rather than:

```text
Runner A → Orca → SSH → unmanaged machine B
```

because the latter can bypass normal Execution Node Registry, resource telemetry, local policy and reconciliation.

`ORCA_SSH_NESTED` MAY be supported only when:

- remote host identity is explicitly registered;
- host-key verification is enforced;
- target workspace/root is policy-scoped;
- remote process/worktree lifecycle is observable;
- asset transfer is governed;
- cancellation/reconciliation behavior is certified;
- audit records both controlling Runner and remote execution target.

An unregistered SSH destination SHALL NOT become a production execution node merely because Orca can reach it.

Cloud/container targets likewise require explicit certification; Spec 210 MUST NOT assume an Electron/AppImage headless runtime is suitable for every Cloudflare/container environment.


## 20D. Base Revision Drift

For Git-backed tasks, the attempt snapshots:

```text
base_commit
target_branch
remote tracking state when relevant
```

If the target branch moves while an agent works:

- the worktree result remains valid evidence for its original base;
- SmartAIHub MUST NOT silently claim it is current;
- merge/PR policy may require fetch/rebase/merge;
- verification runs again after conflict resolution/rebase where required;
- automatic merge is blocked when base-drift policy says review is required.

## 20E. Network-Egress Health

Workspace existence does not imply usable network egress.

Runner SHALL model network capability separately:

```text
NO_NETWORK_REQUIRED
SMARTAIHUB_ONLY
REPOSITORY_HOSTS
PROVIDER_REQUIRED
GENERAL_EGRESS
```

Before a task that requires remote Git/package/provider/network access, route admission SHOULD probe the relevant class without leaking secrets.

Mid-run loss of egress becomes a typed runtime/network condition. The system SHALL not misclassify it as an agent reasoning failure.

## 20F. Process Custody Inside a Workspace

Agents may launch child servers/watchers/background processes.

Default rule:

> processes spawned for a job are job-scoped and are reaped after settlement unless explicitly declared as a durable output/runtime service.

A task may declare:

```text
allowed_background_processes
expected_listen_ports
handoff_lifecycle
```

Unregistered detached processes are treated as cleanup candidates and must not silently persist across unrelated jobs.


# 21. Parallel Agent Execution

Spec 210 SHALL support:

## Mode A — Single Agent

```text
1 worker_job
→ 1 external agent
→ 1 Orca session/dispatch
```

## Mode B — SmartAIHub-Tracked Fan-Out

Preferred for visible multi-agent workflows.

```text
parent worker_job
   ├── child job → Claude via Orca
   ├── child job → Codex via Orca
   └── child job → Antigravity/native
```

Each child has separate durable job identity and may have separate worktree.

## Mode C — Bounded Orca Local Coordination

Allowed only when the delegated task explicitly benefits from Orca-local coordination.

SmartAIHub still requires:

```text
parent job
delegation budget
max child agents
max nesting depth
time/cost bounds
artifact/result projection
audit summary
cancellation propagation
```

Hidden unbounded sub-agent spawning is prohibited.

---

## 21A. Provider-Internal / Hidden Sub-Agents

Claude/Codex/other harnesses may spawn provider-internal sub-agents that Orca surfaces imperfectly or not at all.

Rules:

- only the SmartAIHub-bound primary job/dispatch/session may authoritatively settle the parent `worker_job`;
- an observed sub-agent idle/completion signal MUST NOT be interpreted as top-level completion;
- hidden sub-agent work remains inside the parent's runtime/resource/cost budget unless explicitly promoted into SmartAIHub child jobs;
- if the provider exposes lineage, SmartAIHub MAY show it as diagnostic child activity;
- duplicated visibility through Orca terminal + provider thread MUST be de-duplicated by stable provider/session identity where possible;
- nested agent depth/count MAY be capped by runtime policy;
- a provider that can spawn uncontrolled sub-agents is ineligible for execution profiles whose policy requires strict process/agent-count enforcement unless containment enforces it externally.

## 21B. Delegation Budget Enforcement

For Orca-local coordination or provider-internal sub-agents, the parent attempt SHALL carry budgets:

```text
max_agent_processes
max_nested_depth
max_runtime_minutes
max_context_bytes
max_tool_calls
max_smartaihub_spend
max_output_bytes
```

Where the upstream runtime cannot enforce a semantic budget directly, Runner/container resource limits and Capability Gateway limits remain authoritative.


# 22. Orchestration Boundary

Spec 209 / shared workflow runtime is the canonical deterministic workflow owner.

Orca orchestration MAY be used as a runtime-local primitive for:

- supervised agent dispatch;
- agent inbox/ask-reply;
- worker completion;
- local task decomposition;
- bounded parallel review;
- worktree lifecycle.

It SHALL NOT own top-level:

- business workflow definition;
- tenant scheduling;
- cross-product workflow state;
- economic authorization;
- durable SmartAIHub retries;
- workflow publication/versioning;
- marketplace semantics.

Canonical rule:

> **SmartAIHub orchestrates products and durable workflows; Orca may orchestrate a bounded local agent execution inside a SmartAIHub-owned job.**

---

# 23. Canonical Job and Attempt Model

`worker_jobs` remains truth.

A job MAY have multiple route attempts, but only according to safe retry/reconciliation rules.

Conceptual metadata:

```json
{
  "runtime_adapter": "orca",
  "route_attempt_id": "rat_...",
  "runner_id": "runner_...",
  "orca": {
    "runtime_id": "...",
    "app_version": "...",
    "cli_version": "...",
    "runtime_generation": 3,
    "run_id": "...",
    "task_id": "...",
    "dispatch_id": "...",
    "terminal_handle": "...",
    "worktree_id": "..."
  },
  "provider": {
    "agent_id": "codex",
    "cli_version": "...",
    "session_id": "...",
    "model": "..."
  }
}
```

Do not make any Orca identifier the primary SmartAIHub job key.

---

# 24. Canonical State Machine

SmartAIHub SHALL use its own normalized lifecycle:

```text
QUEUED
ASSIGNED
RUNTIME_PREPARING
RUNTIME_READY
AGENT_STARTING
AGENT_READY
PROMPT_ACCEPTED_UNPROVEN
TURN_SUBMITTED
TURN_STARTED
RUNNING
WAITING_FOR_AGENT_INPUT
WAITING_FOR_USER
WAITING_FOR_APPROVAL
RESULT_STAGED
VERIFYING
COMPLETED
```

Failure/recovery states:

```text
START_UNKNOWN
DEGRADED
RECONCILING
CANCEL_REQUESTED
CANCEL_CONFIRMED
ABANDONED
UNKNOWN_OUTCOME
FAILED
TIMED_OUT
QUARANTINED
```

No Orca state name is authoritative outside the adapter.

To avoid exploding the top-level job state machine, detailed preparation/start phases SHALL be carried in a normalized `phase_detail` field. Initial required values include:

```text
WORKSPACE_SETUP_PENDING
SETUP_IN_PROGRESS
WORKSPACE_SETUP_SUCCEEDED
AGENT_PROCESS_STARTING
AGENT_TUI_READY
PROMPT_DELIVERY_PENDING
PROMPT_WRITE_ATTEMPTED
PROMPT_DELIVERY_CONFIRMED
INTERACTIVE_PAYLOAD_INCOMPLETE
WORKSPACE_MISSING
OWNER_REVALIDATION_REQUIRED
```

`phase_detail` does not override top-level fencing/terminal state. For example:

```text
state = RUNTIME_PREPARING
phase_detail = SETUP_IN_PROGRESS
```

and:

```text
state = RECONCILING
phase_detail = WORKSPACE_MISSING
```

State-transition invariant:

- terminal states (`COMPLETED`, `FAILED`, `CANCEL_CONFIRMED`, `ABANDONED`) require canonical SmartAIHub proof and compare-and-set against the current attempt generation;
- vendor observations cannot move a terminal SmartAIHub attempt back to a non-terminal state;
- late evidence may open a separate reconciliation record but cannot rewrite settled authority without the shared job-control reconciliation procedure;
- `UNKNOWN_OUTCOME` remains non-success terminal/attention semantics until explicitly reconciled.


---


## 24A. Vendor-State Contradiction Reducer

Orca/provider receipts are observations, not SmartAIHub truth. A single receipt may contain mutually inconsistent fields.

The adapter SHALL normalize vendor observations using explicit precedence rules.

Example:

```text
vendor top-level state = failed
setup.state = running
setup activity observed recently
```

MUST normalize to:

```text
state = RUNTIME_PREPARING
phase_detail = SETUP_IN_PROGRESS
```

rather than authoritative `FAILED`, unless an independent terminal failure is proven.

General rule:

```text
live/progressing subordinate state
+ terminal-looking parent state
+ no independent terminal evidence
=> UNKNOWN/PENDING, not terminal failure
```

Every terminal SmartAIHub transition requires a valid transition proof set; contradictory vendor fields are retained as diagnostic evidence.

## 24B. Setup Progress Is Separate from Agent Readiness

Repository/worktree setup and agent TUI readiness are distinct normalized phases. Represent them without inventing a second job lifecycle:

```text
state=RUNTIME_PREPARING, phase_detail=SETUP_IN_PROGRESS
state=RUNTIME_PREPARING, phase_detail=WORKSPACE_SETUP_SUCCEEDED
state=AGENT_STARTING, phase_detail=AGENT_PROCESS_STARTING
state=AGENT_READY, phase_detail=AGENT_TUI_READY
```

If policy says `wait-for-setup`, the agent readiness budget SHALL NOT expire merely because a legitimate setup step is still making progress.

Use separate configurable controls:

```text
setup_absolute_max
setup_idle_timeout
agent_ready_timeout
turn_start_timeout
```

`setup_idle_timeout` SHOULD reset on certified progress signals such as bounded setup-terminal output, structured setup events or filesystem/package milestones.

Activity-based extension remains bounded by `setup_absolute_max` so noisy output cannot keep a permanently stuck setup alive forever.


# 25. Prompt Submission Is a Two-Phase Boundary

This is a critical invariant.

A terminal write/receipt such as:

```text
input_accepted
```

MUST NOT mean:

```text
agent has begun executing
```

SmartAIHub SHALL distinguish:

```text
PROMPT_ACCEPTED_UNPROVEN
TURN_SUBMITTED
TURN_STARTED
```

Evidence for `TURN_STARTED` may include a certified combination of:

- Orca/provider lifecycle event;
- verified agent session turn;
- transcript state transition;
- TUI composer cleared plus provider turn evidence;
- provider-native hook;
- other certified proof.

A timeout after bytes were accepted but before turn proof becomes:

```text
START_UNKNOWN
```

not immediate retry.

---


## 25A. Durable Prompt-Delivery Proof for Unattended Runs

For automation/background execution, SmartAIHub SHALL maintain an explicit prompt-delivery record:

```text
prompt_delivery_id
payload_hash
payload_bytes
agent_process_incarnation
composer/readiness_generation
write_attempted_at
write_result
submit_attempted_at
turn_start_evidence
```

A task cannot be considered dispatched merely because an agent terminal was created.

If readiness expires **before any write attempt**, bounded retry of delivery is safe.

If a write may have occurred but confirmation is missing:

```text
PROMPT_ACCEPTED_UNPROVEN / START_UNKNOWN
```

and blind re-paste is forbidden.

An unattended run MUST NOT transition to `COMPLETED` unless SmartAIHub has observed a certified fresh work/turn-start edge attributable to that run, followed by completion/result evidence.

A startup banner or idle snapshot is not task execution evidence.

## 25B. Retry Placement Is Explicit, Never Inherited by Assumption

When retrying an Orca dispatch/start, SmartAIHub SHALL explicitly resend the original placement contract:

```text
repo_id
workspace_binding_id
worktree_id/path binding
base revision
runner_id
execution profile
account binding
model/profile
```

The adapter MUST NOT assume an upstream `retry-of` primitive inherits placement correctly.

Any intentional placement change creates a new route/placement decision and is audited.


# 26. Duplicate-Execution Prevention

When a start is ambiguous:

```text
DO NOT:
spawn another agent
re-send full task
create another writer
```

until one of these occurs:

```text
prior attempt proven not started
prior attempt cancelled/fenced
prior process/session proven gone
prior worktree placed under exclusive quarantine
operator resolves ambiguity
reconciliation determines safe continuation
```

If only the submit keystroke is known to be missing and the certified adapter has an idempotent/one-shot submit recovery, it MAY send a bounded submit action without re-sending the body.

Every recovery action SHALL be recorded.

---

# 27. Runtime Readiness

Readiness is layered:

```text
ORCA_PROCESS_READY
ORCA_RUNTIME_REACHABLE
AGENT_PROCESS_PRESENT
AGENT_TUI_READY
PROMPT_CHANNEL_READY
```

A generic terminal that merely exists is not enough.

Per-agent readiness adapters MAY use:

- provider lifecycle hook;
- provider-native session event;
- certified TUI-idle signal;
- structured CLI status;
- bounded transcript signature.

Readiness signatures are untrusted input and must be version/provider scoped.

---

## 27A. Startup Blocker Classification

Readiness wait MUST distinguish legitimate transient startup from deterministic blockers.

Typed startup blockers include:

```text
AUTH_REQUIRED
WORKSPACE_TRUST_REQUIRED
TERMS_ACCEPTANCE_REQUIRED
UPDATE_REQUIRED
MODEL_SELECTION_REQUIRED
PERMISSION_MODE_REQUIRED
SESSION_BUS_UNAVAILABLE
DISPLAY_RUNTIME_UNAVAILABLE
PROVIDER_CONFIG_LOCKED
```

A blocker SHALL NOT be retried as a generic timeout loop.

Agent-specific readiness recognizers MUST be scoped to certified version families; a generic prompt-shaped line is not sufficient proof of readiness.

## 27B. Headless Environment Readiness

For headless Orca, `orca_server_ready` proves the Orca runtime listener/pairing subsystem reached a ready state; it does **not** prove agent PTYs are usable.

Headless certification SHALL separately verify:

```text
display/Xvfb requirements
D-Bus/session-bus requirements
PTY creation
child environment propagation
provider login/auth state
agent TUI readiness
network/provider connectivity
filesystem/worktree operations
```

A ready server with unusable terminal environment is `RUNTIME_READY_AGENT_ENV_BROKEN`, not healthy.

## 27C. Safe Submit Recovery

A recovery that sends only `Enter` MAY run only when all are proven:

- the exact intended prompt body is already present in the bound composer;
- no user/provider turn has begun;
- the terminal/session identity and generation still match;
- the certified provider recognizer says the submit key is the missing transition;
- the recovery has not already been attempted for this submission identity.

The recovery is at most once by default.

If these facts are not provable, transition to `START_UNKNOWN` and reconcile rather than guessing.


# 28. Completion Semantics

Completion requires more than process exit.

Possible facts are distinct:

```text
agent idle
agent process exited
Orca worker_done received
task result emitted
files changed
tests passed
SmartAIHub verification passed
```

SmartAIHub SHALL not equate them automatically.

A coding job normally completes only after:

```text
agent result received
+
workspace/result collected
+
required verifier/QC policy completed
+
authoritative worker_job completion committed
```

An Orca `worker_done` is valuable lifecycle evidence, not a replacement for SmartAIHub verification.

---

# 29. Ask/Reply and Human Input

Orca/local agent requests SHALL map into canonical SmartAIHub attention events:

```text
AGENT_QUESTION
USER_INPUT_REQUIRED
APPROVAL_REQUIRED
CREDENTIAL_REQUIRED
LOCAL_INTERACTION_REQUIRED
```

Web UI SHALL allow user to respond from SmartAIHub.

The response SHALL be correlated to:

```text
worker_job_id
route_attempt_id
agent_session_id
question_id
dispatch_id where applicable
```

Late replies to a settled/stale attempt SHALL be rejected or explicitly rebound after confirmation.

---


## 29A. Interactive Prompt / Question Payload Budget

Human-input prompts are control-plane objects and MUST NOT be silently truncated by Orca/provider/mobile transport limits.

Canonical question envelope SHALL carry:

```text
question_id
schema_version
text_length
options_count
payload_hash
full_payload_ref when large
truncated = false
```

If the inline transport budget is insufficient:

```text
store full question in SmartAIHub durable state
send a bounded summary + reference
render full content from SmartAIHub on the web UI
```

Any upstream truncation or checksum/length mismatch becomes `INTERACTIVE_PAYLOAD_INCOMPLETE`; the UI MUST NOT present an incomplete prompt as authoritative and MUST NOT auto-select an option.

Large free-form tool input, repository text, or model context SHALL NOT be embedded into a human-input card merely because the upstream transport accepts a large string field.


# 30. Human Takeover

If the user manually types into or takes control of an automated agent terminal:

```text
AUTOMATED_CONTROL
→ USER_TAKEOVER
```

The adapter SHALL:

- stop automatic prompt injection into that terminal;
- preserve transcript/audit boundary;
- prevent stale coordinator commands from continuing silently;
- require explicit re-attach/resume before automation regains control.

This avoids interleaving human and automated instructions.

---

# 31. Cancellation and Fencing

On cancellation:

```text
SmartAIHub marks CANCEL_REQUESTED
→ adapter asks Orca/provider to stop
→ Runner fences SmartAIHub attempt generation
→ collect cancellation evidence
→ classify outcome
```

Possible final cancellation states:

```text
CANCEL_CONFIRMED
ABANDONED
UNKNOWN_OUTCOME
```

Cancellation of a local coding turn does not imply rollback of:

- already written files;
- pushed Git commits;
- external tool calls;
- network side effects.

Those require explicit reconciliation.

---


## 31A. Cancellation / Stop Is Verified by Effect, Not Receipt

An Orca/provider `stop`, `close`, or cancellation receipt is an observation, not proof that execution stopped.

After a stop/close request, Runner SHALL verify applicable postconditions:

```text
target provider process exited
descendant process tree exited or is explicitly re-owned
PTY incarnation no longer accepts input
terminal/session is absent or classified as retained-evidence-only
workspace file handles/process cwd no longer pin cleanup
no active SmartAIHub capability token remains usable
```

A command may therefore normalize as:

```text
COMMAND_REPORTED_SUCCESS_EFFECT_UNPROVEN
COMMAND_REPORTED_FAILURE_EFFECT_CONFIRMED
COMMAND_EFFECT_PARTIAL
COMMAND_EFFECT_CONFIRMED
```

SmartAIHub state is derived from observed effect plus fencing generation, not from `ok: true/false` alone.

If effect cannot be proven within the bounded cancellation window, the effect intent is `EFFECT_UNPROVEN` and the job retains `CANCEL_UNCONFIRMED` / `UNKNOWN_OUTCOME` semantics rather than fabricating successful cancellation.


# 32. Unknown Outcome

`UNKNOWN_OUTCOME` SHALL be used when SmartAIHub cannot prove whether an externally visible side effect happened.

Examples:

- agent may have called a payment/tool API before disconnect;
- Git push may have crossed the boundary;
- external MCP tool may have committed a write;
- cloud deployment may have started.

SmartAIHub SHALL NOT automatically re-run the same side-effecting task until the effect is reconciled or a provider idempotency mechanism proves retry safety.

---

# 33. Lease, Fencing and Generations

Existing execution-control lease/fencing rules apply.

Every authoritative Runner execution attempt SHALL have a monotonic generation/fencing token.

A stale Runner/Orca attempt MAY produce late output, but it SHALL NOT overwrite current job state.

Late results may be retained as diagnostic evidence.

---

# 34. Reconciliation

Runner SHALL persist enough local state to reconcile after restart:

```text
worker_job_id
route_attempt_id
runtime_adapter
orca_runtime_id
dispatch/session identifiers
terminal handle
worktree identity/path
provider session identity where known
last event cursor
last authoritative state
fencing generation
```

Reconcile sequence:

```text
1. fetch desired active jobs from server
2. inspect local state
3. inspect Orca runtime/process
4. match session/dispatch/worktree identities
5. classify:
   ACTIVE
   FINISHED_UNREPORTED
   ORPHANED
   STALE
   UNKNOWN
6. replay or summarize missing events
7. fence stale attempts
8. commit reconciled state
```

Loss of contact means **unverifiable**, not automatically dead.

---

## 34A. Resume Manifest

To make restart/resume deterministic, local durable state SHALL include a non-secret `resume_manifest`:

```text
agent_id
provider_session_id
workspace_binding_id
expected_cwd
launch_profile_fingerprint
model
reasoning profile
provider account binding id
runtime adapter/runtime generation
context package id/hash
capability profile revision
asset manifest revision
```

On resume, the adapter compares observed reality against the manifest.

Mismatch policy:

```text
safe + explainable -> rebind with audit
policy-critical mismatch -> block
unobservable critical field -> UNVERIFIED and route-policy decision
```

Do not reconstruct the original environment from shell history, aliases or human-readable terminal titles.

## 34B. Reconciliation Authority Order

When sources disagree, use this precedence for SmartAIHub-owned state:

```text
1. server worker_job desired state / fencing generation
2. Runner durable attempt record
3. provider/Orca stable execution identifiers
4. Orca terminal/session observations
5. transcript/UI text heuristics
```

Lower layers provide evidence but cannot override a newer SmartAIHub fencing generation.



## 34C. Reconciliation When Workspace or Terminal Surface Is Missing

Reconciliation SHALL independently classify:

```text
workspace existence
git/worktree identity
agent process existence
PTY existence
Orca pane existence
provider session existence
SmartAIHub lease/generation
```

Loss of the Orca pane/UI MUST NOT be treated as proof that the underlying agent process died; loss of the directory MUST NOT be treated as proof that the process stopped.

Recovery choices MAY include:

```text
reattach certified existing process
preserve evidence + cancel process
start replacement only after fencing old incarnation
restore/re-materialize workspace then start NEW session
```

A restored path must not be attached to an old process automatically unless workspace generation and repository identity can be proven continuous.



## 34D. Unsolicited Auto-Restore and Session Adoption

Orca/provider runtimes may restore historical panes or sessions after restart independently of current SmartAIHub job intent.

Every discovered/restored agent process/session SHALL be classified:

```text
BOUND_TO_ACTIVE_ATTEMPT
KNOWN_SETTLED_HISTORY
UNSOLICITED_RESTORED
UNKNOWN_ORIGIN
```

`UNSOLICITED_RESTORED` and `UNKNOWN_ORIGIN`:

- receive no new SmartAIHub prompt;
- receive no new capability authority;
- generate no SmartAIHub runtime billing interval merely because they exist;
- cannot publish authoritative job results;
- are shown in diagnostics/recovery;
- may be adopted only after matching provider session, workspace, account, model/profile and user/tenant ownership;
- otherwise are cancelled/quarantined according to local policy.

One logical SmartAIHub route attempt SHALL have at most one authoritative provider-process incarnation at a time.

Automatic Orca pane restoration MUST NOT create a second authoritative agent for the same job merely because the UI/runtime recreated a tab.


# 35. Event Normalization

Canonical event types SHOULD include:

```text
agent.runtime.preparing
agent.runtime.ready
agent.session.starting
agent.session.ready
agent.turn.accepted
agent.turn.submitted
agent.turn.started
agent.progress
agent.tool.requested
agent.approval.required
agent.question
agent.file.changed
agent.artifact.produced
agent.turn.completed
agent.result
agent.warning
agent.runtime.degraded
agent.cancel.requested
agent.cancel.confirmed
agent.reconcile
agent.failed
```

Each normalized event SHALL preserve optional raw/provider metadata under a bounded, redacted namespace.

---

# 36. Event Ordering and Replay

Every Runner-emitted event SHALL include:

```text
job_id
route_attempt_id
event_id
sequence
runner_generation
timestamp
runtime_adapter
```

Server ingestion SHALL be idempotent.

Duplicate/replayed events MUST NOT duplicate:

- billing;
- approvals;
- artifacts;
- workflow transitions;
- completion.

Out-of-order events SHALL be buffered or reconciled according to the shared worker-job event model.

---

## 36A. Event Durability Classes and Backpressure

Events SHALL be classified:

```text
AUTHORITATIVE
  lifecycle transitions
  approvals/questions
  capability side effects
  artifact/result commits
  cancellation/reconciliation

DURABLE_PROGRESS
  bounded semantic progress
  important warnings

EPHEMERAL_STREAM
  raw terminal chunks
  token-like streaming text
  high-volume debug output
```

Requirements:

- `AUTHORITATIVE` events are never intentionally dropped;
- `DURABLE_PROGRESS` may be coalesced but retains latest meaningful state;
- `EPHEMERAL_STREAM` may be sampled/truncated/spooled according to limits;
- server backpressure MUST NOT block the agent PTY indefinitely;
- Runner uses a bounded local outbox for durable events;
- outbox exhaustion pauses new work/admission before sacrificing authoritative events;
- raw terminal capture has an independent byte/time budget.

## 36B. Hook / Status Transport Sensitivity

Agent lifecycle hooks or local callbacks may contain prompts, tool I/O or sensitive status data.

If Orca/provider uses loopback TCP hooks:

- treat the hook endpoint as a sensitive local service;
- bind/restrict it to the smallest local scope supported;
- authenticate/correlate callbacks where supported;
- never forward raw hook payloads to other tenants;
- redact before durable logs;
- high-sensitivity managed profiles MAY reject runtime versions that cannot satisfy the required local-transport policy.

SmartAIHub SHALL prefer structured local IPC / supported authenticated runtime channels over scraping or exposing full prompt/tool traffic whenever possible.



## 36C. Telemetry / Diagnostic Egress Boundary

Vendor telemetry is outside SmartAIHub's canonical audit and MUST be treated as a separate egress channel.

SmartAIHub managed profiles SHALL NOT assume vendor documentation guarantees are sufficient proof of the actual emitted payload for every release.

Requirements:

- record the vendor telemetry/privacy policy state applied to the managed runtime;
- sanitize SmartAIHub-owned diagnostic events before any external telemetry path;
- raw exception strings that may contain paths, usernames, URLs, branch names, prompts or secrets MUST be reduced to typed error classes before SmartAIHub transmits them externally;
- support bundles remain local or explicitly user-approved for upload;
- high-sensitivity execution profiles MAY require network-level blocking of nonessential vendor telemetry when technically/legal-operationally appropriate and compatible with the product;
- telemetry behavior changes are part of runtime certification diff review.

SmartAIHub MUST distinguish:

```text
SmartAIHub audit/telemetry
provider telemetry
Orca telemetry
support bundle/manual diagnostic export
```

and never represent them as one privacy boundary.

## 36D. Discovery Result Is Tri-State, Not Boolean

Runtime scans/listings SHALL normalize to:

```text
KNOWN_NONEMPTY
KNOWN_EMPTY
UNKNOWN_SCAN_FAILED
```

A failed/timed-out scan MUST NOT overwrite a previously healthy capability/worktree inventory with authoritative empty state.

Stale cached observations may remain visible with an explicit freshness/uncertainty marker, but new destructive operations require fresh-enough ownership proof.



## 36E. Observation Freshness and Surface / PTY / Process Separation

Runtime inventory fields such as `connected`, `writable`, tab presence or pane visibility SHALL NOT be treated as complete liveness proof.

Normalize independent observations:

```text
PROCESS_LIVENESS
PTY_LIVENESS
INPUT_PATH_LIVENESS
SURFACE_BINDING
PROVIDER_SESSION_LIVENESS
```

Example surface states:

```text
SURFACE_ATTACHED
HEADLESS_LIVE
SURFACE_LOST_PROCESS_LIVE
SURFACE_GHOST_PROCESS_GONE
UNKNOWN
```

Destructive or recovery actions require fresh-enough observations from the layers they affect.

A terminal may continue producing output while input is no longer deliverable; a pane may disappear while the remote PTY/process remains alive; a close command may remove the process while returning a tab-related error. The adapter SHALL preserve these distinctions instead of reducing them to one boolean `connected`.


# 37. Runtime Capability Advertisement

Runner capability snapshot MAY include:

```json
{
  "external_agent_runtimes": {
    "orca": {
      "status": "ready",
      "app_version": "1.4.x",
      "runtime_id": "...",
      "certification": "CERTIFIED",
      "agents": {
        "claude_code": {"status": "ready"},
        "codex": {"status": "ready"},
        "antigravity": {"status": "degraded"}
      }
    }
  }
}
```

The Runner MAY advertise availability.

It MUST NOT self-grant permission for any tenant/user/task.

---

## 37A. Capability Snapshot Freshness

Runtime advertisement is a snapshot, not a promise.

Every capability snapshot SHALL include:

```text
snapshot_revision
observed_at
expires_at / freshness policy
runtime_generation
certification_revision
```

Before dispatch, the scheduler revalidates critical capabilities if the snapshot is stale.

A Runner reconnect that changes runtime generation invalidates cached terminal/session availability even if agent names are unchanged.


# 38. Orca Adapter Capability Matrix

The adapter SHALL maintain machine-readable capabilities such as:

```text
supports_json
supports_version_matched_guides
supports_terminal_wait
supports_wait_submit
supports_retry_request
supports_orchestration
supports_worker_start
supports_worker_done
supports_ask_reply
supports_worktree_create
supports_remote_ssh
supports_headless_server
supports_runtime_id
supports_cancel
supports_resume
supports_agent:<id>
```

The matrix comes from probe/certification, not assumptions.

---


## 38B. Contract-Version Negotiation

The execution path spans independently deployable components:

```text
SmartAIHub Backend
Runner Control Protocol
Runner Agent Runtime Core
OrcaRuntimeAdapter
Orca runtime/CLI
agent CLI
```

Handshake SHALL expose compatible versions/capabilities for:

```text
runner_control_protocol_version
external_agent_contract_version
orca_adapter_contract_version
event_schema_version
result_schema_version
runtime feature set
```

Rules:

- backend MUST NOT send a command the Runner says it cannot understand;
- Runner MUST NOT advertise a runtime feature until its adapter can normalize it;
- additive unknown fields are ignored only when the relevant schema contract permits it;
- breaking mismatch becomes `CONTRACT_VERSION_UNSUPPORTED`;
- rolling upgrade SHALL support at least the documented compatibility window;
- queued jobs are revalidated against the current compatible route before dispatch.


# 39. Runtime Command Safety

Runner MUST launch processes using structured argument arrays, not concatenated shell strings.

User-controlled fields SHALL never directly become:

- executable path;
- shell fragment;
- CLI flag name;
- environment variable name;
- output redirection;
- command substitution.

Allowed agent definitions come from an administrator-controlled/runtime-discovered registry.

Model/effort/profile values SHALL be validated against discovered capability schemas.

---


## 39A. Resource and Process Containment

Managed runtime profiles SHALL impose bounded resource controls appropriate to platform capabilities:

```text
CPU
memory
process count
open files
disk usage
temporary storage
execution duration
stdout/stderr volume
network egress where supported
```

Runner SHALL supervise the full process tree, not only the immediate Orca/agent parent process.

A runaway child process, fork bomb, or detached subprocess MUST NOT be allowed to consume unbounded shared Runner capacity.


## 39B. Same-Host Transport Preference

When SmartAIHub Runner and Orca runtime are on the same host, managed integration SHOULD prefer Orca's supported local CLI/native IPC transport over a remotely reachable WebSocket.

If a WebSocket server is used:

- parse the actual ready JSON;
- verify `schemaVersion`;
- inspect `boundEndpoint` separately from `advertisedEndpoint`;
- do not assume `--pairing-address` changes listener bind scope;
- if the certified Orca build binds a wildcard listener and exposes no supported bind-host control, SmartAIHub SHALL enforce the desired reachability with OS firewall, private network namespace/container policy, Tailscale/ACL, or equivalent network controls rather than inventing an unsupported CLI flag;
- under a local/private-only policy, admission SHALL verify the listener is not reachable from disallowed network zones;
- never write the pairing URL/code into ordinary logs;
- pairing/device credentials are secrets with explicit lifecycle/revocation.

## 39C. Root / `--no-sandbox` Production Policy

Managed production SHALL run Orca as an unprivileged service/user identity.

The Chromium/Electron `--no-sandbox` workaround required when running AppImage as root MUST NOT be the normal production mode.

If a development/emergency environment explicitly enables it:

- mark runtime `DEGRADED_SECURITY`;
- exclude it from high-sensitivity auto-routing;
- require administrator opt-in;
- surface the weakened boundary in diagnostics/audit.

## 39D. Container/AppImage Packaging

Managed container images MUST NOT assume FUSE is available for AppImage execution.

Installer/build pipeline MAY extract the AppImage at image-build/install time and run the certified internal entrypoint, provided:

- digest/provenance remains tied to the original release asset;
- extracted contents are not mutated unexpectedly;
- conformance suite runs against the packaged form;
- update/rollback handles the whole extracted runtime atomically.

Cloudflare/container execution SHALL be enabled only for a separately certified packaging/runtime tuple.



## 39E. Pairing / Device-Credential Lifecycle

When a headless/pairing flow is used, pairing material SHALL have explicit capture and retention policy.

Rules:

- pairing URLs/codes are secret-bearing bootstrap material;
- stdout/journal collectors SHALL redact them before general log ingestion;
- only the component performing approved pairing may access the full value;
- stale pairing material is never used as a runtime identity;
- loss of a pairing URL MUST NOT force destructive runtime restart if a safe already-paired control path exists;
- pair/re-pair/revoke actions are audited separately from ordinary agent execution;
- runtime/device credential rotation invalidates prior control sessions according to the Orca version's certified semantics.



## 39F. Shell Startup, Repository Hook and Local Bootstrap Trust Boundary

Launching a terminal can execute code before the intended agent command through:

```text
shell rc/profile files
direnv / environment managers
repository bootstrap scripts
Git hooks
package-manager lifecycle hooks
Orca project hooks
provider hooks
```

Managed execution SHALL inventory which bootstrap layers are enabled.

For `SMARTAIHUB_MANAGED_RESTRICTED` and `SMARTAIHUB_MANAGED_ISOLATED`:

- prefer controlled non-login/non-interactive shell startup where compatible;
- do not source arbitrary user shell profiles by default;
- repository/project hooks are untrusted code and follow approval/policy;
- project-controlled hooks MUST NOT inherit platform secrets not required by the task;
- any required hook is included in the compatibility/security fingerprint;
- unexpected bootstrap output or mutation before agent launch is recorded as setup evidence;
- shell/bootstrap policy changes invalidate relevant certification.

SmartAIHub MUST NOT claim a sandboxed agent environment if uncontrolled startup scripts can escape that boundary before the agent starts.


# 40. Environment Variable Policy

The adapter SHALL use an environment allowlist.

Do not pass the entire Runner process environment blindly into agent processes.

Classify:

```text
SAFE_RUNTIME
PROVIDER_AUTH_REFERENCE
SMARTAIHUB_JOB_SCOPED
DENIED_SECRET
```

Job-scoped SmartAIHub credentials SHALL expire and be revocable.

Logs SHALL redact:

- bearer tokens;
- API keys;
- OAuth material;
- pairing credentials;
- cookies;
- signed URLs where sensitive.

---

# 41. Filesystem Security

The adapter SHALL enforce workspace roots.

It SHALL reject or require approval for:

- traversal outside allowed roots;
- symlink escape;
- sensitive home-directory access not required by provider auth;
- system directories;
- other tenant/project workspace paths.

Provider-native configuration access is a separately declared runtime permission.

---

# 42. SmartAIHub Capability Token Projection

Per-job agent capability token SHOULD support:

```text
read-only vs write scopes
specific capability IDs
specific project/library prefixes
max invocation count
spend limit
expiry
approval requirement
revocation epoch
```

Agents SHALL discover capabilities through the same canonical model:

```text
capability.search
capability.describe
capability.invoke
capability.status
capability.result
```

No Orca-only Skill registry is permitted.

---

## 42A. Capability Invocation Exactly-Once Accounting

Every SmartAIHub capability invocation initiated by an Orca-hosted agent SHALL carry:

```text
capability_invocation_id
worker_job_id
route_attempt_id
agent_session_id
idempotency_key when semantics allow
```

Server ingestion and billing use the invocation identity to prevent duplicate:

- side effects;
- usage ledger rows;
- revenue-share events;
- artifact publication.

Retries caused by Runner reconnect or duplicated agent tool messages MUST NOT double-charge.

## 42B. Capability Authority Cannot Be Delegated by Prompt

An agent cannot expand its own scope by asking another sub-agent, shell process, Orca worker, or MCP client to reuse the job credential.

The local Capability Proxy binds authority to the active job/runtime generation and applies the same scope regardless of which local child process presents the request.

For stricter profiles, the proxy MAY require a per-session child credential rather than a broadly inherited environment token.


# 43. Computer Use Integration

If an Orca-hosted agent needs browser/desktop interaction:

```text
Agent intent
   ↓
SmartAIHub Capability Gateway
   ↓
Spec 208
   ↓
WebMCP / DOM-accessibility / deterministic executor / vision fallback
```

The agent SHALL NOT receive unrestricted raw mouse/keyboard authority outside shared Spec 208 policy simply because Orca itself has UI automation features.

Direct Orca Computer Use MAY be supported later only as a Spec 208 execution adapter with equivalent approval, target binding, evidence, safety and audit semantics.

---

# 44. A2A Integration

Spec 206 remains authoritative.

Spec 210 amendment to routing:

```text
A2A route eligible and healthy
→ use A2A by default

A2A unavailable/ineligible/degraded
→ Spec 200 native plane
   → Orca adapter may be selected
```

A2A failure due to policy denial MUST NOT be bypassed by Orca.

A2A failure due solely to transport/runtime inability MAY fall back if Spec 206 policy allows and duplicate execution is impossible.

---

# 45. MCP Integration

Spec 199 remains authoritative.

Orca/provider config MAY point an agent to a SmartAIHub-governed capability endpoint.

It MUST NOT automatically inject arbitrary upstream MCP credentials.

All SmartAIHub-managed MCP access remains:

```text
External Agent
→ SmartAIHub Capability Gateway
→ Spec 199
→ approved upstream MCP
```

---

# 46. AI Workflow Studio Integration

Spec 209 may expose an `External Agent` workflow node.

User chooses logical executor:

```text
Auto
Claude
Codex
Antigravity
Other registered agent
```

Advanced node policy MAY include:

```text
execution_route: auto | orca_preferred | native_preferred
workspace_mode
parallelism
model
reasoning_effort
max_duration
max_cost
approval_profile
required_capabilities
fallback_policy
```

Workflow definition MUST NOT hard-code transient Orca terminal/worktree IDs.

Those exist only in run state.

---

# 47. Multi-Agent Workflow Semantics

Example:

```text
Analyze requested feature
      ↓
Parallel Review
 ┌────────┬────────┬─────────┐
 ▼        ▼        ▼
Claude   Codex  Antigravity
 └────────┴────────┴─────────┘
      ↓
Synthesis / Verification
      ↓
User approval / Merge
```

Spec 209 owns graph semantics.

Spec 210 only executes selected external-agent nodes.

A child job may use Orca even when another child uses a direct adapter.

---

# 48. Output Verification

Agent output SHALL be treated as untrusted until verification policy completes.

Verification MAY include:

```text
expected files exist
schema validation
lint/typecheck
unit/integration tests
build
diff limits
secret scan
malware/content scan for artifacts
media duration/codec checks
required report structure
cross-agent reviewer
human review
```

Success from Orca/provider does not bypass SmartAIHub verifier policy.

---

## 48A. Verification Input Snapshot

Verification SHALL run against an explicit result snapshot:

```text
workspace/result revision
artifact hashes
base revision
verification policy revision
toolchain/runtime versions
```

If files change after verification begins, the verification result is stale and MUST NOT authorize merge/publish.

A successful provider/Orca completion followed by a failed SmartAIHub verifier yields a failed/needs-review SmartAIHub job according to workflow policy.

## 48B. Verifier Independence

For high-risk code/content workflows, verifier selection SHOULD avoid relying solely on the same mutable agent session that produced the result.

Options include:

```text
deterministic tests/builds
separate SmartAIHub verifier
separate external-agent child job/worktree
human review
```

The verifier receives read-only output where practical.


# 49. Git and Merge Policy

Orca worktrees are useful execution isolation, but merge remains SmartAIHub/project policy.

Allowed merge modes:

```text
NO_MERGE
CREATE_PATCH
CREATE_BRANCH
CREATE_COMMIT
CREATE_PR
MERGE_AFTER_APPROVAL
```

Automatic merge SHALL require:

- clean base relationship;
- no unresolved conflicts;
- verification gates;
- permission;
- branch policy;
- no stale attempt;
- no unapproved cross-agent overwrite.

---


## 49A. Unpublished Work / Ref-Reachability Safety

A clean worktree is not sufficient evidence that deletion is safe.

Before removing a SmartAIHub-managed worktree or deleting its branch/ref, Runner SHALL inventory:

```text
working tree dirty/untracked state
HEAD commit
upstream tracking ref
merge/review target reachability
unpushed commits
SmartAIHub rescue refs
repo-wide stash entries attributable to the job when known
pending patch/artifact capture
```

SmartAIHub MUST NOT perform an unconditional branch force-delete merely because the worktree itself is clean.

If commits would become unreachable and no rescue/authorization exists, cleanup stops with `UNPUBLISHED_WORK_AT_RISK`.

Before deleting the final local ref to commits not known to be reachable from a protected/published ref, create a durable rescue representation according to policy:

```text
SmartAIHub rescue ref
patch/bundle artifact
retained branch
explicit user-approved destructive cleanup
```

Cleanup result records the commit/ref reachability proof.

## 49B. Git Stash Is Repository-Global, Not Worktree-Local

Git stash state is shared across worktrees of the same repository and therefore is unsafe as an implicit per-agent scratch store.

Default managed policy for concurrent agents:

```text
do not use global git stash as automatic isolation
```

Prefer:

```text
job-scoped WIP commit/ref
patch artifact
dedicated clone
isolated output directory
```

If stash ownership cannot be proven for a destructive stash operation, return `GIT_STASH_OWNERSHIP_UNCLEAR` rather than selecting an entry by display index.

If a task explicitly uses `git stash`:

- capture pre/post stash OIDs;
- attribute created entries to the job where possible;
- never drop/pop an entry by stack position alone;
- worktree cleanup checks for job-attributable stash content;
- branch deletion does not imply stash deletion or ownership resolution.

## 49C. Git Author, Credential and Remote-Side-Effect Isolation

Agent execution SHALL NOT mutate global Git identity/credential configuration merely to create a job commit.

Use per-command/per-worktree/environment-scoped identity where practical:

```text
author/committer identity
credential binding
SSH key / token binding
remote URL policy
signing policy
```

Remote Git effects are side effects:

```text
push
force push
tag push
PR creation/update
remote branch delete
```

and remain governed by Approval/Unknown-Outcome rules.

Provider/agent access to an existing user's ambient `gh`, SSH agent or credential helper is part of the execution trust profile and MUST be disclosed/controlled for managed runtimes.

## 49D. Concurrent Ref Update and Branch Namespace Safety

Parallel agents SHALL not implicitly share one mutable branch/ref.

SmartAIHub SHOULD allocate unique job/attempt branch namespaces where code-writing isolation is required.

Before updating a shared local or remote ref:

```text
expected_old_oid
new_oid
job/attempt identity
approval/policy
```

must be known.

Use compare-and-swap / lease-style Git semantics where supported. A forced update MUST NOT silently overwrite commits created after the verifier/approval snapshot.

Branch-name collision across concurrent jobs becomes `GIT_REF_CONFLICT`, not last-writer-wins.


# 50. Worktree Cleanup

Cleanup is not equivalent to task completion.

A worktree may need retention for:

```text
review
debugging
failed verification
user inspection
unknown outcome
artifact collection
```

Retention policy fields:

```text
cleanup_on_success
cleanup_on_failure
retain_minutes
retain_until_review
max_retained_worktrees
```

Deletion SHALL verify that no active job still references the worktree.

---


## 50A. Cleanup Is a Durable Transaction

Cleanup SHALL be modeled as a resumable effect transaction:

```text
PRECHECK
FREEZE_NEW_INPUT
DRAIN_OR_FENCE_AGENT
VERIFY_PROCESS_TREE
SNAPSHOT_UNPUBLISHED_WORK
TEARDOWN_EXTERNAL_ROUTES
REMOVE_WORKTREE
REMOVE/RETAIN_REF
VERIFY_POSTCONDITIONS
COMMIT_METADATA_CLEANUP
DONE
```

Critical rule:

> **SmartAIHub/Orca metadata that is required to target a retry MUST NOT be deleted before physical/process/filesystem cleanup is proven or a durable recovery locator has been stored.**

If cleanup stops halfway, the cleanup/effect intent becomes:

```text
CLEANUP_INCOMPLETE
```

with the completed phases/evidence retained so the operation is safely retryable.

`CLEANUP_INCOMPLETE`, `EFFECT_UNPROVEN` and related values are **effect-intent / operational-attention states**, not a second `worker_jobs` lifecycle. The parent job remains in the canonical job state appropriate to its workflow while the cleanup/effect record carries the unresolved physical side effect.

## 50B. Remote Deletion Safety Uses Target-Host Semantics

Recursive deletion safety for SSH/remote/headless execution SHALL be evaluated on the target host, using target-host facts:

```text
realpath/canonical path
filesystem path semantics
filesystem root
target user's home
repository root
worktree root
mount boundaries where relevant
```

The controller's local `homedir`, drive rules or path normalization MUST NOT be reused to decide whether a remote path is safe to delete.

If target-host safety cannot be established, return `REMOTE_DELETE_GUARD_UNKNOWN` and preserve the workspace.

## 50C. Cleanup Postconditions

Cleanup success requires the applicable postconditions, not merely successful API receipts:

```text
agent/descendant processes stopped or intentionally re-owned
PTY/session no longer authoritative
job-scoped network routes/forwarders removed or retained intentionally
worktree path absent when deletion requested
Git worktree registry no longer references removed path
branch/ref action matches requested retention policy
unpublished-work rescue proof exists when required
job capability credentials revoked
temporary assets/context cleanup scheduled/complete
```

A vendor command reporting failure while postconditions are satisfied may normalize to successful effect with warning.

A vendor command reporting success while postconditions are not satisfied is `CLEANUP_INCOMPLETE`.

## 50D. Emergency Force Cleanup

Force cleanup is a recovery operation, not normal GC.

It SHALL require:

- explicit operator/user authority appropriate to the resource;
- target scope preview;
- current process/workspace/ref census;
- unpublished-work warning/rescue attempt;
- fencing of the affected attempt;
- evidence capture;
- postcondition verification.

Force cleanup MUST NOT recursively kill/delete by ambiguous human label or branch name.


# 51. Runtime Installation

Runner SHALL support Orca states:

```text
NOT_INSTALLED
DETECTED
INSTALLABLE
INSTALLING
READY
UPDATE_AVAILABLE
UPDATING
DEGRADED
REPAIR_REQUIRED
BLOCKED
```

Managed installer requirements:

- platform/architecture detection;
- trusted release source;
- checksum/signature verification where available;
- exact version recording;
- staged install;
- health/conformance test before activation;
- rollback artifact/version;
- no silent switch to daily/hourly/unvetted build.

---

# 52. Update Policy

Because Orca ships rapidly, SmartAIHub SHALL separate:

```text
stable-certified
stable-candidate
development
```

Production Runner default:

```text
stable-certified
```

A newly released Orca version is not automatically certified.

Promotion flow:

```text
release discovered
→ sandbox compatibility suite
→ provider matrix tests
→ security smoke tests
→ canary runners
→ certification
→ gradual rollout
```

Rollback SHALL be possible after runtime health regression.

---


## 52A. Runtime Update Lock

Orca/runtime update and repair operations SHALL acquire a runtime maintenance lease.

Rules:

- no in-place binary replacement while active bound attempts depend on that runtime;
- updater waits for drain or operator-approved forced maintenance;
- forced maintenance transitions affected jobs to reconciliation before process replacement;
- old binary/digest remains available for rollback until the rollout window closes;
- post-update conformance probe completes before new production jobs are admitted.


# 53. Headless Linux Runtime

For managed Linux deployments, implementation SHALL follow the current Orca headless deployment requirements for that version.

SmartAIHub-specific constraints:

- use unprivileged service account;
- keep runtime binary/install directory protected from service-user replacement where feasible;
- install required virtual-display dependencies where necessary;
- capture versioned ready JSON when supported;
- enforce startup timeout;
- do not treat an open port alone as healthy;
- verify runtime ID/schema;
- use bounded log rotation;
- reap orphan processes;
- restart with backoff;
- pin compatible glibc/platform requirements.

---

## 53A. Headless Ready Contract

When the certified Orca version supports JSON ready output, the supervisor SHALL prefer it over parsing human-readable startup text.

Expected evidence includes, according to version:

```text
type = orca_server_ready
schemaVersion
runtimeId
boundEndpoint
advertisedEndpoint
pairing.available / reason
```

SmartAIHub SHALL validate the fields it relies on and tolerate only documented additive fields.

`pairing.available=false` may still mean the local runtime is usable by Runner; pairing availability is not identical to agent-runtime health.

## 53B. Headless Dependency Certification

Linux distribution/version, glibc/runtime dependencies, display/session bus behavior and packaging form are part of the certification tuple.

A passing Ubuntu build does not automatically certify Debian or a minimal container.

On packaged Linux, the externally available CLI name may differ from the terminal-scoped `orca` shim. Runner command discovery SHALL resolve the certified absolute executable/entrypoint (for example the packaged `orca-ide` launcher where applicable) and MUST NOT rely on a shell alias being present.

Headless runtime upgrade/restart SHALL be treated as disruptive to live terminal/agent processes unless the exact certified version proves otherwise. Before planned restart:

```text
drain new admissions
capture active terminal/dispatch census
persist resume manifests
mark in-flight jobs RECONCILING
restart/upgrade
re-probe runtime
resume/reconcile individually
```

SmartAIHub notifications/status MUST come from SmartAIHub Runner/job events; it MUST NOT depend on Orca desktop-renderer/mobile push behavior being present in headless mode.

Certification artifact SHOULD record:

```text
distro/version
kernel/arch
glibc
display strategy
session-bus strategy
packaging form
Orca digest/version
agent versions
```



## 53A. PTY / Pane Reattach Deduplication

Remote/SSH reconnect and UI reattachment can create duplicate PTYs if upstream runtime semantics are not sufficiently fenced.

SmartAIHub SHALL maintain an adapter-level terminal incarnation identity:

```text
logical_terminal_id
pty_incarnation_id
process_group_id where available
pane/runtime id
creation_generation
```

Before spawning a replacement terminal for a previously known pane/session:

1. acquire a replacement lock;
2. probe the prior PTY/process incarnation;
3. attempt certified reattach when appropriate;
4. fence/terminate the old incarnation before creating a replacement when exclusive control is required;
5. register the new incarnation atomically.

Repeated reconnect loops MUST NOT create unbounded detached PTYs.

## 53B. Default-Terminal / Reattach Spawn Dedupe

SmartAIHub SHALL NOT infer that a newly appearing default terminal belongs to the job merely because it appeared during reattach.

Runtime-owned default panes and SmartAIHub-owned execution panes SHALL be distinguished.

An adapter MUST de-duplicate terminal creation using its SmartAIHub session manifest and upstream terminal identity/generation. Duplicate auto-created panes are diagnostics unless explicitly bound.



## 53C. Runtime Auto-Restore Policy

Managed headless/remote runtimes SHALL NOT assume Orca's automatic pane/session restoration matches SmartAIHub desired state.

After runtime restart:

```text
discover
→ classify against active SmartAIHub attempts
→ quarantine unsolicited restorations
→ reconcile/adopt only verified matches
→ terminate or retain as recovery evidence per policy
```

If the certified Orca version exposes a safe setting to suppress undesired auto-restore for managed profiles, SmartAIHub SHOULD use it.

If suppression is unavailable, the classification/quarantine layer is mandatory.

## 53D. Remote Surface Binding Is Not Process Ownership

For remote/headless/SSH execution, maintain separate identity/generation for:

```text
remote process
PTY
Orca runtime terminal handle
desktop/web tab/surface
SmartAIHub route attempt
```

Loss/recreation of a desktop tab cannot mint a new provider process automatically for an already-active attempt.

A newly materialized UI surface must attach to the existing certified PTY/process identity or remain read-only/recovery-only until reconciled.

## 53E. Stop / Close Effect Receipt

For terminal/process teardown the adapter SHALL emit a normalized effect receipt containing, where observable:

```text
command_id
target identity
vendor receipt
process_before/process_after
pty_before/pty_after
surface_before/surface_after
descendants_remaining
postcondition_state
```

This receipt is the input to cancellation/cleanup state reduction.

`tab_not_found`, `selector_not_found`, or similar vendor errors SHALL NOT automatically imply the process effect failed; likewise `ok=true` SHALL NOT prove descendants exited.


# 54. Windows Runtime

Windows conformance MUST test:

- installed desktop Orca discovery;
- executable path with spaces;
- provider config access;
- PowerShell/cmd quoting boundaries;
- terminal creation;
- worktree path handling;
- process-tree cancellation;
- restart/reconciliation;
- Windows file locks;
- concurrent provider startup;
- Antigravity-specific behavior;
- user-session vs service-session execution.

Interactive provider CLIs MAY require a user session; the Runner MUST advertise this limitation.

---

# 55. macOS Runtime

macOS conformance MUST test:

- signed app discovery;
- Apple Silicon/Intel differences where applicable;
- user-session access;
- shell/profile differences;
- provider binaries;
- worktree/file permissions;
- sleep/wake reconciliation;
- SSH target reconnection;
- process tree cancellation;
- local privacy/accessibility permissions where computer-use interaction is involved.

---

# 56. Provider Update/Login Prompts

Agent startup can be blocked by:

```text
login required
workspace trust
update available
terms changed
permission prompt
model unavailable
rate limit
```

These SHALL become typed SmartAIHub states, not generic timeout.

Examples:

```text
AUTH_REQUIRED
TRUST_REQUIRED
UPDATE_PROMPT_BLOCKED
MODEL_UNAVAILABLE
RATE_LIMITED
PERMISSION_REQUIRED
```

UI SHALL tell the user the precise corrective action where known.

The adapter MUST NOT blindly press confirmation keys through unknown dialogs.

---

# 57. Rate Limits and Account State

Runner MAY report provider-local usage/rate-limit hints.

Such hints:

- are attributed to the specific provider/account/runtime binding;
- do not become a global provider outage;
- may influence route eligibility;
- do not expose private account data to other users/tenants;
- expire according to provider/runtime evidence freshness.

---

## 57A. Account/Rate-Limit Routing Safety

Rate-limit fallback across accounts is allowed only when:

- policy/user explicitly permits alternate account use;
- alternate account belongs to an authorized binding;
- tenant/credential ownership is compatible;
- model/task policy remains satisfied;
- no billing/terms boundary is crossed silently.

A depleted account MUST NOT cause SmartAIHub to opportunistically use a different user's local provider subscription.

## 57B. Runtime Network vs Provider Throttle

Health classification SHALL distinguish:

```text
local network failure
DNS/TLS/proxy failure
repository-host failure
provider transport outage
provider account throttle
provider model quota
SmartAIHub capability-gateway throttle
```

Circuit breakers and UI guidance use the narrowest verified cause.


# 58. Billing and Cost Attribution

Spec 210 does not create billing.

It emits usage dimensions:

```text
external_agent_runtime_minutes
provider/model identifiers where known
SmartAIHub Skill calls
MCP calls
media generation calls
Runner compute
artifact storage/transfer
verification compute
```

For user-subscription local CLI usage, SmartAIHub MAY have zero direct provider API cost while still accounting for platform/Skill/Runner costs according to existing business rules.

Do not estimate provider charges as authoritative when the provider subscription does not expose exact per-task cost.

---

## 58A. Idempotent Usage Ledger

Usage events emitted by Spec 210 SHALL have stable identities.

Duplicate lifecycle/event replay MUST NOT produce duplicate charges.

Recommended key:

```text
usage_event_id
worker_job_id
route_attempt_id
usage_type
source_invocation_id / runtime_interval_id
```

Runtime-minute accounting SHALL define interval ownership so overlapping reconnect/replay observations are not double-counted.

Provider-internal subscription consumption that cannot be measured reliably is displayed as `provider cost unavailable/externally billed`, not guessed as an authoritative currency amount.



## 58B. Attempt-Level Economic Attribution

A worker job may consume resources on several route attempts even when only one produces the final result.

The economic plane SHALL receive attempt-scoped usage with:

```text
worker_job_id
route_attempt_id
runtime/provider/account binding
usage identity
started/settled timestamps
result classification
```

Costs already incurred by an abandoned/degraded attempt are not erased merely because SmartAIHub safely falls back.

UI/reporting SHOULD distinguish:

```text
final-route usage
failed/abandoned-attempt usage
SmartAIHub-billable usage
externally billed/provider-subscription usage
refunded/waived usage according to economic policy
```

Spec 210 reports facts; refund/credit policy remains owned by the economic plane.

## 58C. Retry / Fallback Budget Is Aggregate

Retrying or falling back SHALL NOT silently reset the user/job spend and resource budget.

Budget evaluation uses aggregate committed/reserved usage across route attempts:

```text
agent runtime
Runner compute
SmartAIHub Skill/MCP calls
media/model calls
verification
storage/transfer
```

Before a new route attempt starts, re-evaluate the remaining budget.

If insufficient:

```text
BUDGET_EXHAUSTED_BEFORE_FALLBACK
```

rather than starting another potentially expensive executor.


# 59. Concurrency Control

Concurrency SHALL be limited by:

```text
runner capacity
CPU/RAM/GPU
provider/account concurrency
Orca runtime stability
workspace locking
tenant plan
job priority/fairness
agent-specific known limits
```

Per-runtime semaphores MAY be necessary for agents known to mutate shared global configuration.

Concurrency limits are part of certification and MAY differ by provider/OS/version.

---

## 59A. Admission Reservation and Launch Storm Control

Concurrency admission SHALL use short-lived reservations so several schedulers cannot all observe the same final slot as available.

Runner SHOULD also apply:

```text
startup rate limit
provider-config mutation mutex
per-agent startup semaphore
per-account concurrency
per-repository writer lock
```

A burst of queued jobs MUST NOT start dozens of provider TUIs simultaneously and destabilize the user machine/runtime.

## 59B. Resource Pressure Degradation

When memory/disk/process pressure crosses thresholds:

```text
stop admitting new work
preserve authoritative event/outbox capacity
prefer finishing/cancelling existing jobs
surface RESOURCE_PRESSURE
```

Do not wait for OS OOM/disk-full failure before changing route health.



## 59C. Reservation Ownership and Scheduler Failover

Admission reservation SHALL have a unique reservation id and fencing generation.

Only the scheduler/Runner generation holding the current reservation may convert it into an active runtime attempt.

If the scheduler/control-plane leader changes:

- old reservations expire or are explicitly transferred with generation bump;
- a replacement scheduler re-reads durable reservation/job state;
- it MUST NOT infer free capacity solely from missing in-memory ownership;
- the Runner rejects duplicate activation for the same attempt/reservation identity.

This prevents two schedulers from launching the same job during failover.


# 60. Circuit Breakers

Circuit breaker key SHOULD be granular:

```text
runner_id
runtime_adapter
orca_version
agent_id
agent_cli_version
failure_class
```

Examples of breaker-triggering failures:

```text
runtime_unreachable
prompt_submit_unproven spike
provider startup block
reconcile mismatch
orchestration schema drift
repeated crash
credential/config corruption
```

A degraded agent SHOULD NOT necessarily disable all other Orca agents.

---

## 60A. Emergency Kill Switch and Quarantine

Operations SHALL support scoped disable/quarantine keys such as:

```text
all_orca
orca_version
runner_id
agent_id
agent_cli_version
OS + agent tuple
specific certification revision
```

Kill switch behavior:

- remove affected routes from new-job eligibility immediately;
- mark active affected attempts for policy-defined cancellation/reconciliation;
- preserve evidence;
- do not automatically reactivate merely because process health looks green;
- require explicit unquarantine/certification revision.

This is separate from transient circuit breaking.



## 60B. Failure Attribution for Setup / Hook / Transport Degradation

Circuit breakers SHALL attribute failures to the narrowest proven component.

Examples:

```text
setup still progressing after generic readiness timeout
  != provider agent failure

hook observer failed
  != agent execution failure, unless hook is a required security gate

runtime scan failed
  != zero installed agents

Orca pane disappeared
  != provider process definitely dead
```

Misattributed failures MUST NOT poison the provider/account/global route breaker.



## 60C. Circuit-Breaker Recovery Uses Probation

A breaker/incident quarantine that recovers SHALL NOT immediately receive full production traffic.

Recovery flow SHOULD be:

```text
OPEN/BLOCKED
→ probe
→ HALF_OPEN / PROBATION
→ bounded canary attempts
→ evaluate error/start-unknown/reconcile metrics
→ READY
```

Any recurrence returns the narrow affected tuple to blocked/degraded state.

Probation traffic limits are independent of ordinary concurrency limits.


# 61. Health Model

Health dimensions:

```text
runtime_health
agent_launch_health
prompt_submission_health
completion_health
cancel_health
worktree_health
tool_bridge_health
asset_bridge_health
reconcile_health
```

Composite status:

```text
READY
READY_WITH_LIMITATIONS
DEGRADED
UNAVAILABLE
BLOCKED_BY_POLICY
```

UI should expose the composite status first, with detailed dimensions under diagnostics.

---

# 62. Observability and Correlation

Every execution trace SHOULD correlate:

```text
chat_run_id
workflow_run_id
worker_job_id
route_attempt_id
runner_id
orca_runtime_id
orca_run_id
orca_task_id
orca_dispatch_id
orca_terminal_handle
orca_worktree_id
provider_session_id
capability_call_id
asset_ref
```

Not every field exists for every mode.

Logs/metrics must remain queryable by `worker_job_id`.

---

# 63. Metrics

Recommended metrics:

```text
orca_runtime_ready_seconds
agent_start_seconds
prompt_submit_seconds
turn_first_event_seconds
job_runtime_seconds
reconcile_seconds
cancel_seconds
start_unknown_total
duplicate_prevented_total
route_fallback_total
runtime_crash_total
agent_blocked_total
worktree_leak_total
late_event_total
capability_call_total
artifact_upload_bytes
```

Dimensions MUST avoid unbounded cardinality from raw prompt/session IDs.

---

## 63A. Service-Level Objectives and Alerting

Operational rollout SHOULD define SLO/SLA-style targets for at least:

```text
runtime probe success
agent start success
TURN_STARTED confirmation rate
START_UNKNOWN rate
reconcile success
cancel confirmation rate
orphan worktree/process rate
event outbox age
artifact upload success
```

Alerts SHOULD fire on ratios/trends, not only individual job failures.

A rising `PROMPT_ACCEPTED_UNPROVEN` / `START_UNKNOWN` ratio is a release-blocking signal even if terminal processes remain alive.



## 63B. Time, Deadline and Clock Semantics

Distributed runtime correctness SHALL NOT depend on synchronized wall clocks for fencing or event ordering.

Use:

```text
sequence / generation for authority ordering
monotonic local clock for local elapsed-time deadlines
server-issued expiry with tolerated skew for credentials/control commands
wall-clock UTC timestamps for human audit only
```

Runner SHALL report excessive clock skew as a health dimension.

A wall-clock jump backward/forward MUST NOT:

- extend a local execution timeout indefinitely;
- resurrect an expired lease;
- reorder authoritative events;
- reuse an expired job-scoped credential.

Where absolute expiry is validated locally, define and test the allowed skew window.


# 64. Audit

Audit SHALL record:

- who initiated the job;
- tenant/project;
- logical selected agent;
- selected protocol/runtime route;
- route decision reasons;
- Runner/runtime version;
- certification state;
- workspace/worktree binding;
- approval decisions;
- capability invocations;
- route fallback;
- cancellation;
- reconciliation;
- final verification;
- artifact lineage.

Do not record raw secrets.

---

## 64A. Audit Tamper / Provenance Boundary

SmartAIHub audit is authoritative for SmartAIHub decisions, but Orca/provider local history is external evidence.

Where compliance requires stronger integrity:

- canonical audit events SHOULD be append-only/tamper-evident according to shared platform policy;
- runtime raw evidence stores include hash/provenance where practical;
- edited/deleted Orca local history cannot erase already-ingested canonical audit events;
- absence of an Orca history entry does not prove an action never occurred.



## 64B. Runtime Evidence Bundle

For incidents, reconciliation and high-risk jobs, SmartAIHub SHOULD be able to produce a bounded evidence bundle containing references/hashes for:

```text
route decision snapshot
runtime/agent binary digests
resume manifest
workspace/repo/base revision
prompt-delivery proof
authoritative lifecycle events
approval decisions
capability side-effect receipts
artifact hashes
cleanup/cancellation effect receipts
verification result
```

The evidence bundle is generated from canonical SmartAIHub records plus explicitly identified vendor evidence.

It MUST NOT imply that mutable vendor local history is tamper-proof.

Where shared platform policy supports it, bundle manifests SHOULD be content-addressed/signed or chained to tamper-evident audit storage.


# 65. User Experience — External Agent Connections

Add/extend:

```text
Settings
└── AI Connections / External Agents
    ├── Claude
    ├── Codex
    ├── Antigravity
    └── Orca Runtime
```

Orca card shows:

```text
Status
Installed version
Runtime status
Certified/Degraded state
Detected agents
Runner/device
Update channel
Last health check
Repair
Diagnostics
Advanced settings
```

Ordinary users SHOULD NOT need to manually paste terminal commands.

---

# 66. User Experience — Agent Selection

At task start:

```text
How should this task run?

Auto
SmartAIHub
Claude
Codex
Antigravity
```

If user chooses Claude, SmartAIHub may still choose:

```text
A2A
Orca
native-direct
```

under the hood according to route policy.

Advanced users MAY pin a route.

---

# 67. User Experience — Job Detail

Job page SHALL show:

```text
Agent
Model
Execution route
Runner/device
Workspace/worktree
Current lifecycle phase
Elapsed time
Progress/events
Approvals/questions
Artifacts
Verification
Fallback/recovery history
Usage/cost where available
```

Raw terminal may be available under Advanced/Diagnostics with security filtering.

---


## 67A. Effect / Cleanup Status Must Be Explicit

The Job Detail UI SHALL distinguish command receipt from confirmed effect.

Examples:

```text
Cancel requested
Cancellation confirmed
Cancel command returned an error, but process stop was verified
Cleanup incomplete — background process remains
Workspace removed, branch retained
Workspace removed, unpublished work rescued
Outcome unknown — reconciliation required
```

Do not collapse these into generic `Failed` or `Stopped`.

Recovery actions SHALL target canonical identities and show the expected effect before execution.


# 68. User Experience — Multi-Agent View

For fan-out:

```text
Parent task
├── Claude      Running
├── Codex       Reviewing
└── Antigravity Degraded → native fallback
```

Each card may expose:

- route;
- branch/worktree;
- last activity;
- result summary;
- changed files;
- verification;
- attention required.

The system SHALL NOT force users to manage Orca panes directly.

---

# 69. Runner UI/CLI Diagnostics

Runner diagnostic command/UI SHOULD expose:

```text
Orca executable
digest
app/CLI version
runtime ID
runtime reachability
agent list
agent versions
certification matrix
failed probes
provider auth readiness (non-secret)
worktree support
headless readiness
last reconciliation
```

Support bundle SHALL redact secrets.

---

## 69A. Repair / Diagnostic Actions

Diagnostics SHALL distinguish read-only checks from mutations.

Read-only:

```text
probe
show versions/digests
show certification failures
show account alias/readiness
show runtime binding
show stale/orphan candidates
```

Mutating repair:

```text
restart runtime
repair config
recreate managed profile
remove stale worktree
revoke pairing/device
update/rollback
```

Mutating repair requires appropriate user/admin permission and confirmation when it can affect active work.

"Repair" MUST NOT silently delete a user's manually managed Orca workspace/session.


# 70. Data Model Changes

Prefer extending existing Spec 200/shared structures.

Required conceptual fields:

```text
worker_jobs.runtime_adapter
worker_jobs.route_attempt_id
worker_jobs.runtime_metadata_json
worker_jobs.runtime_generation
worker_jobs.workspace_binding_id
```

If equivalent fields already exist, reuse them.

Runner capability snapshot gains `external_agent_runtimes.orca`.

Provider/runtime binding configuration SHOULD extend the existing external-agent provider/runtime configuration rather than create a second provider registry.

Optional normalized runtime-attempt table MAY be used only if the existing execution-attempt model cannot represent multiple adapter attempts:

```text
external_agent_runtime_attempts
  id
  worker_job_id
  attempt_no
  protocol_route
  runtime_adapter
  runner_id
  runtime_identity
  provider_identity
  state
  started_at
  settled_at
  metadata_json
```

This table, if needed, is subordinate to `worker_jobs`; it is not another job system.

---

## 70A. Required Integrity Constraints and Indexes

If a runtime-attempt table is added, minimum logical constraints SHOULD include:

```text
UNIQUE(worker_job_id, attempt_no)
UNIQUE(route_attempt_id)
INDEX(worker_job_id, state)
INDEX(runner_id, state)
INDEX(orca_runtime_id, runtime_generation)
INDEX(provider_session_id) where non-null
```

Event ingestion SHALL have an idempotency uniqueness constraint equivalent to:

```text
UNIQUE(worker_job_id, route_attempt_id, runner_generation, event_id)
```

or the canonical shared event identity already defined by the Job Control Plane.

Runtime metadata JSON is not a substitute for indexed canonical fields needed for reconciliation and cleanup.

## 70B. Referential Cleanup Safety

A runtime/worktree/session record referenced by an active or reconciling job cannot be garbage-collected merely because its last heartbeat is old.

Cleanup queries SHALL join against canonical job terminal states and generation ownership.



## 70C. Effect / Cleanup Intent Persistence

Durable records SHALL be sufficient to resume a destructive/cancellation operation after process or control-plane restart.

Conceptual fields/record:

```text
effect_intent_id
worker_job_id
route_attempt_id
effect_type
target_canonical_identity
expected_generation
requested_by
phase
vendor_receipts
verified_postconditions
started_at
updated_at
settled_at
```

Examples of `effect_type`:

```text
CANCEL_AGENT
CLOSE_TERMINAL
REMOVE_WORKTREE
DELETE_BRANCH
REVOKE_CAPABILITY
TEARDOWN_REMOTE_ROUTE
```

This is subordinate execution evidence, not a new job system.

## 70D. Transactional State + Event / Outbox Commit

An authoritative SmartAIHub state transition and the durable event/outbox record that announces it SHALL be committed atomically or via the platform's transactional-outbox pattern.

The system MUST NOT allow:

```text
DB state changed but authoritative event permanently lost
authoritative event published but state transaction rolled back
usage/artifact side effect committed with no durable invocation identity
```

Retries of outbox publication are idempotent.

This applies especially to:

```text
TURN_STARTED
approval transitions
capability side effects
artifact commit
terminal job settlement
cancellation/cleanup settlement
```


# 71. Runner Control Commands

Prefer provider-neutral command names:

```text
runner.agent.runtime.probe
runner.agent.session.prepare
runner.agent.session.start
runner.agent.session.input
runner.agent.session.cancel
runner.agent.session.reconcile
runner.agent.session.cleanup
runner.agent.runtime.install
runner.agent.runtime.update
runner.agent.runtime.repair
```

Payload contains:

```text
runtime_adapter = orca
```

Avoid making the server depend on `runner.orca.*` for ordinary execution.

Adapter-specific diagnostics MAY use an internal namespace.

---

## 71A. Command Idempotency and ACK Semantics

Every server→Runner control command SHALL have:

```text
command_id
worker_job_id
route_attempt_id
expected_generation
issued_at
expires_at when applicable
```

Runner records command application idempotently.

ACK means only that the Runner accepted/applied the command at the relevant layer; it does not implicitly mean the provider turn started or cancellation completed.

Command replay after reconnect SHALL return the prior receipt when safe rather than re-executing the mutation.



## 71B. Mutation Command Effect Query

For commands whose acknowledgement cannot prove final effect, the protocol SHOULD support querying the durable command/effect identity:

```text
runner.command.status(command_id)
runner.agent.session.effect_status(effect_intent_id)
```

or equivalent shared Job Control Plane operations.

A reconnecting backend SHALL query/reconcile an existing command/effect before issuing a replacement mutation.

Mutation command identity survives WebSocket/control-channel reconnect.


# 72. Start Session Request

Conceptual request:

```json
{
  "job_id": "job_123",
  "route_attempt_id": "rat_1",
  "runtime_adapter": "orca",
  "agent": "codex",
  "model": "gpt-...",
  "workspace": {
    "binding_id": "ws_123",
    "mode": "ISOLATED_CHILD"
  },
  "context_package_ref": "ctxpkg_123",
  "asset_manifest_ref": "assetmanifest_123",
  "capability_profile_id": "cap_prof_1",
  "approval_profile_id": "approval_1",
  "timeouts": {
    "runtime_ready_ms": 60000,
    "agent_ready_ms": 120000,
    "turn_start_ms": 60000
  }
}
```

Exact schema belongs in implementation API package and SHALL be versioned.

---

# 73. Submission Receipt

Canonical receipt:

```json
{
  "accepted": true,
  "submission_state": "TURN_STARTED",
  "evidence": [
    "provider_turn_event"
  ],
  "runtime_session_ref": "...",
  "warnings": []
}
```

Possible `submission_state`:

```text
REJECTED
PROMPT_ACCEPTED_UNPROVEN
TURN_SUBMITTED
TURN_STARTED
START_UNKNOWN
```

No caller may collapse all accepted states into `RUNNING`.

---

# 74. Result Contract

Canonical result:

```json
{
  "outcome": "succeeded",
  "summary": "...",
  "artifacts": [],
  "workspace_result": {
    "changed_files": [],
    "commit": null,
    "patch_ref": null
  },
  "verification": {},
  "runtime_metadata": {},
  "raw_provider_result_ref": null
}
```

Raw transcripts/provider payloads MAY be stored separately with retention/ACL controls.

---

# 75. Error Taxonomy

Typed errors SHOULD include:

```text
ORCA_NOT_INSTALLED
ORCA_RUNTIME_UNAVAILABLE
ORCA_SCHEMA_UNSUPPORTED
ORCA_VERSION_UNCERTIFIED
AGENT_NOT_INSTALLED
AGENT_AUTH_REQUIRED
AGENT_TRUST_REQUIRED
AGENT_UPDATE_BLOCKED
AGENT_MODEL_UNAVAILABLE
AGENT_RATE_LIMITED
AGENT_READINESS_TIMEOUT
PROMPT_SUBMISSION_UNKNOWN
DISPATCH_CAPABILITY_MISSING
WORKTREE_CONFLICT
WORKSPACE_LOCKED
RUNTIME_CONFIG_CONFLICT
RUNTIME_SCOPE_MISMATCH
REPO_IDENTITY_REVALIDATION_REQUIRED
OWNER_UNKNOWN
OWNER_CONFLICTED
OWNER_STALE
STALE_WORKSPACE
UNSAFE_CONTINUATION_CWD
RUNTIME_BINDING_MISMATCH
HOOK_FALSE_HEALTH
HOOK_REQUIRED_UNAVAILABLE
PROMPT_DELIVERY_FAILED
INTERACTIVE_PAYLOAD_INCOMPLETE
DISCOVERY_SCAN_UNKNOWN
PTY_REATTACH_CONFLICT
CONTRACT_VERSION_UNSUPPORTED
NO_COMPLIANT_RUNTIME
SESSION_ORIGIN_MISMATCH
SESSION_ORIGIN_UNKNOWN
CANCEL_UNCONFIRMED
CLEANUP_INCOMPLETE
REMOTE_DELETE_GUARD_UNKNOWN
UNPUBLISHED_WORK_AT_RISK
GIT_STASH_OWNERSHIP_UNCLEAR
GIT_REF_CONFLICT
BUDGET_EXHAUSTED_BEFORE_FALLBACK
EFFECT_UNPROVEN
LOCAL_STATE_CORRUPT
RECONCILE_REQUIRED
RUNTIME_QUARANTINED
```

Typed errors SHALL include safe next-step metadata where applicable.

---

# 76. Fallback Policy

Fallback is not simply "if error, try next adapter."

Allowed immediate fallback examples:

```text
Orca absent before execution
Orca probe incompatible before session start
agent absent
known certification block
runtime cannot start and no agent turn began
```

Fallback requiring reconciliation:

```text
prompt accepted but turn start unknown
agent may have begun editing
agent may have invoked external capability
connection lost during run
cancel unconfirmed
```

Fallback prohibited:

```text
policy denial
permission denial
economic authorization denial
explicit user route requirement
security quarantine
```

---

## 76A. User-Pinned Route Semantics

If a user/admin explicitly pins:

```text
orca_required
native_direct_required
specific runner
specific provider account
```

and the route becomes unavailable, SmartAIHub SHALL fail/ask for a new choice rather than silently relaxing the pin.

`auto` and `*_preferred` may fall back according to policy.

This distinction must be visible in job diagnostics.


# 77. Route Attempt Budget

Prevent adapter thrashing.

Default policy SHOULD bound:

```text
max_route_attempts
max_runtime_restarts
max_prompt_submit_recovery
max_reconcile_cycles
max_agent_restarts
```

Each attempt transition must be explainable in audit.

---

# 78. Runtime Drift

During an active attempt:

- Orca auto-update MUST NOT silently replace the runtime underneath a running job;
- agent CLI update MUST NOT silently change execution binary for the active turn;
- runtime binary/config digests SHOULD be snapshotted;
- updated runtime becomes eligible for new jobs only after probe/certification;
- active jobs may finish on their bound runtime if policy permits.

---

## 78A. Runtime Generation Change Mid-Job

If Orca runtime restarts and returns the same logical runtime identifier but a new generation/process identity:

- old terminal handles are presumed stale until revalidated;
- no stale handle may receive new input;
- Runner enters reconciliation;
- provider session resume is a new controlled binding step;
- authoritative events from the old generation remain evidence only.

## 78B. Auto-Update Detection

Even when SmartAIHub does not manage Orca installation, Runner SHALL detect binary/version/digest change.

On change:

```text
invalidate old command catalog
invalidate certification cache for the changed tuple
run probe/conformance subset
exclude from production auto-route until policy permits
```

User-managed update is therefore not invisible to SmartAIHub.



## 78C. Upstream Incident Overlay for Certification

A previously certified tuple may become temporarily unsafe because of newly discovered upstream regressions even before a new binary release is installed.

SmartAIHub SHOULD support a signed/maintained compatibility advisory overlay containing rules such as:

```text
orca_version_range
agent_id / agent_version_range
platform
feature
severity
mitigation
route_effect
expires_or_recheck_at
source_reference
```

Possible route effects:

```text
WARN
DISABLE_FEATURE
DEGRADE_TUPLE
BLOCK_AUTO_ROUTE
REQUIRE_NATIVE_FALLBACK
```

Advisory rules MUST be narrowly scoped and time/review bounded. They are not permanent hard-coded folklore.

Open upstream issues alone do not automatically prove every installation is affected; the overlay requires reproducible applicability criteria or local probe evidence.



## 78D. Rolling Deployment and Persisted-Schema Compatibility

Runtime/adapter contract compatibility is not sufficient if persisted SmartAIHub records cannot be read by both old and new components during rollout.

Schema evolution SHALL follow shared platform migration policy, including:

- expand-before-contract migrations;
- old Runner/backend compatibility window;
- versioned JSON payloads for `runtime_metadata`, resume manifests and effect receipts;
- no destructive column/enum contraction until old writers/readers are drained;
- queued/reconciling jobs created by the previous version remain readable;
- rollback tests include reading state written by the candidate version.

A runtime rollout MUST NOT strand active/reconciling jobs merely because their metadata schema came from the adjacent deployment version.


# 79. Development Builds

Daily/hourly/adhoc Orca builds MAY be supported in developer mode.

They SHALL be:

```text
UNCERTIFIED by default
visibly marked
excluded from normal production auto-routing
```

A user/admin may explicitly opt into testing.

---


## 79A. Supply-Chain and Redistribution Requirements

Managed Orca distribution SHALL record:

```text
source URL/repository
release/tag
binary digest
signature/checksum status
install timestamp
installer version
SBOM/provenance where available
```

SmartAIHub SHALL NOT automatically promote hourly/daily/adhoc builds to production.

If SmartAIHub redistributes Orca binaries, installers or modified copies, packaging SHALL preserve the applicable MIT license/copyright notice and any required third-party notices.

Modified/forked Orca builds, if ever used, MUST have a distinct runtime identity and certification channel so they cannot be confused with upstream stable Orca.


# 80. Telemetry and Privacy

SmartAIHub managed installation SHALL document:

- what SmartAIHub records;
- what Orca may record under its own settings/version;
- what provider CLI records;
- where local transcripts/config live;
- how long SmartAIHub retains runtime logs.

When Orca exposes supported telemetry controls, SmartAIHub managed deployments SHOULD apply the configured organization privacy policy through supported settings.

Do not patch vendor binaries merely to alter telemetry behavior.

---

## 80B. Local Vendor-State Retention

SmartAIHub SHALL distinguish:

```text
SmartAIHub-managed job temp data
SmartAIHub canonical audit
Orca/vendor local state
provider local session/history
```

Uninstalling or disabling Spec 210 SHOULD remove/revoke SmartAIHub-managed integration material without deleting vendor/provider history the user owns unless the user explicitly requests that cleanup.

Managed isolated profiles may be ephemeral by policy, but that policy must be declared before execution.


# 81. Transcript Handling

Terminal transcripts may contain:

- source code;
- secrets printed by tools;
- user data;
- command output;
- credentials accidentally echoed.

Rules:

- do not upload full transcript by default when a structured result suffices;
- server-side transcript sync is opt-in/policy-scoped;
- redact known secret patterns;
- preserve minimal evidence needed for audit/debug;
- apply project/tenant retention policy;
- model access to transcripts obeys current ACL at projection time.

---


## 81A. Orca Local Session-History Boundary

Orca may maintain its own local terminal/session/history/index data independently of SmartAIHub.

Managed deployment SHALL:

- document the local history location/retention behavior for the certified version where known;
- avoid treating Orca local history as SmartAIHub canonical audit;
- never rely on local history as the sole recovery source;
- use dedicated profiles for multi-tenant managed runtimes;
- clean or rotate SmartAIHub-managed profiles according to retention policy using supported mechanisms;
- not directly mutate an opaque vendor database unless a documented repair/migration procedure explicitly requires it.


# 82. Prompt Injection / Untrusted Repository Content

Repository files, issues, comments, terminal output and external content are untrusted data.

The agent runtime SHALL be instructed that repository/content instructions do not override:

- SmartAIHub system/runtime policy;
- approval requirements;
- capability scopes;
- secret handling;
- task boundary.

Capability Gateway enforcement MUST remain server-side; prompt text alone is never the security boundary.

---

# 83. Approval Boundary

High-risk actions remain subject to shared Approval Service.

Examples:

```text
git push
merge
deployment
deletion
external write tool
publishing content
financial action
credential/config mutation
computer-use destructive action
```

An Orca/provider-native confirmation prompt MAY be additionally required, but it does not replace SmartAIHub approval.

---

## 83A. Approval Revalidation

An approval authorizes a specific intended action snapshot, not an unlimited future mutation.

Immediately before applying an approved high-risk action, SmartAIHub SHALL revalidate material fields such as:

```text
job/attempt generation
target repository/environment/account
operation type
artifact/diff hash where applicable
amount/destination for economic actions
capability arguments
approval expiry/policy revision
```

If the material target changed after approval, obtain a new approval.

An Orca/provider prompt confirmation cannot broaden the approved SmartAIHub action.


# 84. Installation Consent

For user-owned desktop machines, first-time Orca integration SHALL explain:

- what is detected/installed;
- which agents may be launched;
- workspace/file access;
- provider login reuse;
- optional config/hook integration;
- SmartAIHub Runner role;
- how to disable/remove the runtime integration.

Do not imply Orca is required if direct adapters remain available.

---


## 84A. Multi-Tenant Isolation

A single Orca runtime/profile that holds local provider credentials, terminal history and filesystem state MUST NOT be treated as a safe isolation boundary between mutually untrusted tenants.

Default rules:

```text
personal desktop Runner:
  one user-owned trust domain

shared managed Runner:
  isolate tenants by OS account/container/VM/runtime profile according to risk policy
```

For shared managed execution:

- tenant A worktree/context MUST not be readable by tenant B;
- provider account bindings MUST not bleed across tenants;
- Orca runtime/session history MUST be isolated;
- local MCP/capability proxy authority MUST be job/tenant scoped;
- caches containing private source/assets MUST include tenant/project namespace and ACL;
- runtime reuse across tenants is allowed only when the selected isolation technology actually enforces separation.

## 84B. Sensitive Task Routing

Tasks classified as high sensitivity MAY require:

```text
SMARTAIHUB_MANAGED_ISOLATED
no ambient network
no shared provider profile
ephemeral workspace
restricted capability profile
mandatory artifact scan
```

If no compliant execution target exists, SmartAIHub SHALL report `NO_COMPLIANT_RUNTIME` rather than degrade to a less isolated local runtime.


# 85. Migration from Existing Spec 200

Migration is additive.

Phase 0:

```text
Existing:
Spec 200 → Claude/Codex/Antigravity native adapters
```

Phase 1:

```text
Add OrcaRuntimeAdapter
but route disabled except developer/test
```

Phase 2:

```text
Capability probe + certification
shadow route decision only
```

Phase 3:

```text
Enable Orca for opt-in users/runners
native adapters retained
```

Phase 4:

```text
Auto route healthy certified tasks
fallback rules enforced
```

Phase 5:

```text
Expand supported CLI agents
without deleting direct adapters
```

---

# 86. Cross-Spec Amendments

## 86.1 Spec 200 Amendment

Add:

> Spec 210 defines Orca as a replaceable Runtime Adapter inside Spec 200's native External Agent execution plane. Spec 200 remains owner of canonical Agent Task/session/event/result semantics. Direct provider adapters remain valid.

## 86.2 Spec 206 Amendment

Add:

> Orca does not compete with A2A at the protocol layer. Spec 206 first resolves A2A vs Spec 200 native execution. If Spec 200 is selected, Spec 210 may resolve Orca vs direct-native vs generic PTY.

## 86.3 Spec 199 Amendment

Add:

> Orca-hosted agents use SmartAIHub Capability Gateway for Skills/MCP. Spec 210 MUST NOT inject arbitrary upstream MCP credentials or bypass Spec 199.

## 86.4 Spec 208 Amendment

Add:

> UI/browser/desktop actions requested by Orca-hosted agents are governed by Spec 208 unless an explicitly certified Spec 208 Orca adapter exists.

## 86.5 Spec 209 Amendment

Add:

> External Agent workflow nodes select logical agents and runtime policy; transient Orca runtime/session/worktree identities belong to run state, never workflow definition.

---

# 87. Implementation Modules

Recommended Runner structure:

```text
runner/
  agent_runtime/
    adapter.ts|rs
    registry
    routing
    lifecycle
    reconcile
    events
    context_package
    assets
    verification
    adapters/
      orca/
        probe
        command_catalog
        runtime_binding
        terminal
        orchestration
        worktree
        submission_verifier
        result_mapper
        error_mapper
        install
        update
        diagnostics
      claude_native/
      codex_native/
      antigravity_native/
      generic_pty/
```

Exact language/path MAY follow current Runner implementation.

---

# 88. Orca Command Catalog

`OrcaRuntimeAdapter` SHALL maintain a runtime-generated command catalog, not hard-coded scattered shell strings.

Conceptual object:

```json
{
  "runtime_version": "...",
  "executable_digest": "...",
  "commands": {
    "status": {...},
    "terminal_create": {...},
    "terminal_wait": {...},
    "terminal_send": {...},
    "terminal_read": {...},
    "worktree_create": {...},
    "orchestration_worker_start": {...}
  }
}
```

Every command definition includes:

```text
supported
schema_version
required_flags
json_output
known_warnings
certification_state
```

---

# 89. Fake Agent Test Harness

SmartAIHub SHALL build deterministic fake CLI agents to reproduce edge cases.

Fake agents MUST simulate:

```text
slow startup
composer ready late
prompt pasted but Enter ignored
prompt accepted and turn starts late
no heartbeat
crash mid-turn
completion without process exit
process exit without completion
approval prompt
login prompt
update prompt
huge output
invalid unicode
partial JSON
worktree write
external side-effect marker
```

Production safety cannot rely only on real-provider integration tests.

---

# 90. Conformance Test Matrix

Required matrix:

```text
OS:
  Windows
  macOS
  Linux desktop/headless

Agents:
  Claude Code
  Codex
  Antigravity
  generic fake CLI

Modes:
  current workspace
  isolated worktree
  parallel worktrees
  large context package
  SmartAIHub capability access
  asset input/output
  cancellation
  restart/reconcile
```

Every certified tuple must pass the relevant subset.

Revision 5 mandatory regression scenarios additionally include:

```text
provider session origin cwd != pane worktree
runtime restart auto-restores historical panes
surface lost while remote PTY/process remains live
close reports failure but effect succeeded
close reports success but descendant process survives
unpublished local commits during worktree cleanup
repo-global stash created by another worktree
concurrent ref update / branch collision
remote delete guard evaluated on different host OS
cleanup crash after each durable phase
shell/profile/repository bootstrap attempts secret access
scheduler failover after reservation before activation
clock jump/skew during lease/expiry handling
state commit crash before/after outbox publication
disk full during Runner local-state/outbox write
rolling upgrade N ↔ N+1 reading resume/effect metadata
```

---

## 90A. Compatibility Matrix Publication

SmartAIHub SHOULD maintain an operator-visible certified matrix rather than hide compatibility knowledge in source code.

Example dimensions:

```text
SmartAIHub Runner version
Orca version/digest
OS/distro
agent + version
execution mode
features certified
known limitations
certification date
test-suite revision
```

The scheduler consumes the machine-readable matrix; Admin UI exposes the human-readable projection.

## 90B. Regression Corpus from Upstream Incidents

Conformance tests SHALL retain fixtures for known failure classes, including:

```text
Codex prompt pasted but Enter lost
Antigravity login-phase injection loss
Antigravity readiness prompt shape change
runtime-global repo listing ambiguity
resume into deleted worktree
resumed model/profile mismatch
headless pairing/runtime-ready but PTY unusable
provider config concurrent mutation race
network egress lost mid-worktree
```

Closing an upstream issue does not remove the regression fixture.


# 91. Fault Injection

Automated tests SHALL inject:

```text
Runner disconnect
Orca crash
agent crash
network partition
slow filesystem
locked provider config
disk full
worktree creation failure
server event ACK loss
duplicate event
out-of-order event
cancel timeout
late worker_done
stale fencing token
runtime version changes
vendor stop/close false-success receipt
vendor stop/close false-failure receipt
descendant process survives parent PTY exit
runtime auto-restores a settled historical session
cleanup crash between physical removal and metadata settlement
remote path safety probe unavailable
scheduler leader changes after capacity reservation
wall clock jumps backward/forward
disk fills during local durable-state/outbox write
database transaction commits state while simulated publisher is unavailable
```

Expected outcome must preserve durable correctness and prevent duplicate side effects.

---

# 92. Security Test Cases

Required:

1. shell injection through task text;
2. malicious model name/CLI arg;
3. path traversal;
4. symlink escape;
5. token in terminal output;
6. stale job token;
7. cross-tenant AssetRef;
8. unauthorized Skill invocation;
9. direct upstream MCP bypass attempt;
10. runtime endpoint exposed publicly;
11. pairing secret in logs;
12. stale Runner publishes completion;
13. repository prompt injection requests secret;
14. agent tries to read another workspace;
15. config mutation outside declared profile.
16. runtime-global listing returns another repository's terminal/worktree;
17. stale display name collides with another session;
18. headless runtime unexpectedly binds a wildcard/public WebSocket;
19. pairing URL/device secret appears in logs;
20. same local capability token reused by another job/session;
21. shared headless account/profile bleeds across tenants;
22. hidden sub-agent attempts to reuse parent credential outside policy;
23. root + `--no-sandbox` runtime attempts high-sensitivity admission;
24. stale approval target changes before execution.
25. malicious shell/profile/bootstrap script tries to read platform secrets before agent launch.
26. remote deletion target is dangerous only under target-host path/home semantics.
27. restored historical session from another tenant/project attempts adoption.
28. ambient Git/SSH/GitHub credentials are available contrary to selected managed trust profile.
29. destructive stash/ref cleanup targets an entry/ref not proven to belong to the job.
30. rescue refs/artifacts from one tenant are not enumerable by another tenant.

---

# 93. Reliability Test Cases

Required:

1. `input_accepted` without turn;
2. delayed provider hook;
3. `START_UNKNOWN` reconcile;
4. lost Enter recovery without duplicate body;
5. stale terminal;
6. old runtime process after Runner restart;
7. worktree retained after failure;
8. orphan dispatch;
9. completion event duplicated;
10. job cancel while agent tool call is in-flight;
11. fallback before start;
12. fallback forbidden after ambiguous start.
13. resume points to deleted worktree/cwd.
14. resume preserves wrong model/effort/account.
15. provider config mutation races during concurrent startup.
16. headless server ready but session bus/PTY unusable.
17. network egress disappears mid-job.
18. runtime-global listing exposes unrelated repository objects.
19. old generation terminal handle receives attempted input.
20. local durable outbox reaches pressure threshold without dropping authoritative events.
21. hidden sub-agent completion arrives before primary session completion.
22. artifact upload resumes without duplicate Library publication.
23. user-managed Orca binary changes while Runner is connected.
24. provider account fallback is forbidden without policy/user authorization.
25. close returns error after target process is actually gone.
26. close returns success while provider/MCP descendants remain.
27. cleanup resumes after crash at every phase without losing its target locator.
28. worktree deletion preserves/rescues unpublished commits.
29. repo-global stash is not popped/dropped by another worktree's cleanup.
30. auto-restored pane is quarantined and does not duplicate an active attempt.
31. surface loss with live PTY/process remains recoverable.
32. effect-intent query after control-channel reconnect prevents duplicate cancel/cleanup.
33. scheduler failover preserves one admission owner.
34. clock skew does not change fencing/event authority.
35. Runner detects partial/corrupt local durable state.
36. N/N+1 rolling deployment reads active resume/effect records bidirectionally within compatibility window.

---

# 94. Performance and Scale

The design SHALL support:

- many Runners;
- multiple Orca runtimes across devices;
- multiple agents per runtime;
- bounded parallel worktrees;
- long-running jobs;
- large repositories/context packages.

Server SHALL not stream every raw terminal character into durable job events.

Use aggregation/sampling for noisy terminal output.

Structured lifecycle/progress events remain durable.

---

# 95. Capacity Admission

Before dispatch, Runtime Route Resolver SHALL confirm:

```text
runner online
runtime healthy
agent certified
workspace available
concurrency slot available
disk space sufficient
resource headroom
provider not blocked/rate-limited
required capability bridge ready
```

Reservation should be held through the start boundary to avoid overcommit races.

---

# 96. Artifact and Result Limits

Enforce configurable limits:

```text
max artifact count
max single artifact bytes
max total output bytes
max transcript sync bytes
max context package bytes
max terminal tail bytes
max event payload bytes
```

Oversized outputs go to object storage/Library and events reference them.

---

# 97. Cleanup and Garbage Collection

GC SHALL cover:

```text
stale Orca sessions
orphan terminals
orphan worktrees
expired context packages
expired job capability tokens
temporary asset materializations
old install rollback packages
bounded runtime logs
```

GC must never delete resources still referenced by active/reconciling jobs.

---


## 97A. Crash-Safe Local State

Runner local durable state used for reconciliation SHALL use crash-safe write semantics appropriate to the storage technology.

Requirements:

- atomic replace/transaction rather than in-place partial JSON overwrite;
- version/checksum or corruption detection;
- fsync/durability policy appropriate to authoritative local facts;
- bounded backup/previous snapshot where useful;
- startup validation before trusting state;
- corrupted state becomes `LOCAL_STATE_CORRUPT` and triggers server/runtime reconciliation rather than silent reset.

Disk-full behavior:

- stop admitting new work before the durable-state/outbox partition is exhausted;
- reserve emergency capacity where feasible for authoritative cancellation/reconciliation records;
- partial context/artifact writes are never published as complete;
- temporary file is written/verified before atomic publish/rename.


# 98. Rollout Gates

Orca auto-routing cannot reach general availability until:

```text
Gate 1: adapter contract tests pass
Gate 2: duplicate-execution tests pass
Gate 3: Claude certified
Gate 4: Codex certified
Gate 5: restart/reconcile certified
Gate 6: security test suite passes
Gate 7: canary metrics acceptable
Gate 8: rollback tested
Gate 9: runtime-global scope guard / cross-repo isolation tests pass
Gate 10: resume profile/account/model fidelity tests pass
Gate 11: headless listener/session-bus/PTy security tests pass
Gate 12: event backpressure/outbox durability tests pass
Gate 13: unpublished Git work / stash / branch cleanup safety tests pass
Gate 14: cleanup postcondition / false-positive-false-negative close tests pass
Gate 15: auto-restore / duplicate-session adoption tests pass
Gate 16: transactional state+outbox and crash-safe local-state tests pass
Gate 17: scheduler failover/admission fencing tests pass
Gate 18: rolling persisted-schema compatibility tests pass
Gate 19: repository baseline checks prove the selected adapter, Job migration and Runner command path are present before any Orca route is enabled
```

Antigravity has its own independent certification gate.

---

# 99. Acceptance Criteria

Spec 210 is implementation-complete only when all of the following are demonstrated:

1. SmartAIHub can discover a certified Orca runtime on Runner.
2. SmartAIHub can launch Claude Code through Orca and prove turn start.
3. SmartAIHub can launch Codex through Orca and prove turn start.
4. Antigravity is either certified through Orca or visibly routed through a healthy alternate path.
5. A large spec is delivered through Context Package without giant terminal paste.
6. A Library asset can be materialized to an agent and an output returned to Library.
7. Agent can discover/invoke an approved SmartAIHub Skill without installing the Skill locally.
8. External MCP-backed capability still traverses Spec 199.
9. `input_accepted` alone never marks a job `RUNNING`.
10. Ambiguous start does not create duplicate writer.
11. Runner restart reconciles an active Orca job.
12. Stale attempt cannot overwrite current job due to fencing.
13. Parallel agents use isolated worktrees by default.
14. User can answer an agent question from SmartAIHub Web.
15. User can cancel and see `confirmed` vs `unknown outcome`.
16. Orca update is staged/certified before production routing.
17. Route can fall back to native direct before execution safely starts.
18. Policy denial is never bypassed via fallback.
19. User-visible workflow need not expose Orca-specific IDs.
20. All usage/audit/artifact records correlate back to canonical `worker_job_id`.
21. A shared managed Runner demonstrates tenant/profile isolation with no cross-tenant workspace, history, provider-account or capability-token leakage.
22. A resumed/reused agent session is rejected when actual model/account binding differs from the requested binding.
23. A managed high-risk task refuses to downgrade from `SMARTAIHUB_MANAGED_ISOLATED` to a weaker trust profile.
24. Job-scoped capability/MCP authority is revoked and cleaned after job settlement.
25. A non-Git media task runs in a job scratch workspace and returns a verified Library artifact.
26. A multi-repository task does not assume Orca multi-root support unless the exact runtime is certified.
27. Runtime update cannot replace the binary underneath an active bound attempt.
28. Backend/Runner/adapter incompatible contract versions fail explicitly rather than silently executing.
29. An unregistered Orca SSH target cannot bypass SmartAIHub Execution Node policy.
30. Managed installation records binary provenance/digest and required license notices.
31. Runtime-global Orca listings cannot attach/stop/remove objects from a different repository or SmartAIHub workspace binding.
32. Resume into a removed/stale worktree is blocked or safely rebound through a certified provider mechanism.
33. Resumed sessions verify effective model, effort, account and launch-profile binding when policy requires exactness.
34. Headless runtime cannot be marked agent-ready merely because `orca_server_ready` was emitted.
35. Same-host managed integration rejects an unexpected public/wildcard runtime listener under local-only policy.
36. Concurrent provider config mutation is serialized or the runtime tuple is certified safe.
37. A hidden provider sub-agent cannot settle the parent SmartAIHub job.
38. Authoritative events survive server backpressure while raw terminal stream may be bounded/coalesced.
39. Context Package is atomically materialized and queue-time ACL/freshness is revalidated.
40. Capability invocation replay does not duplicate side effects, billing, revenue share or artifacts.
41. Runtime binary/version drift invalidates the command catalog/certification cache before new production dispatch.
42. User-pinned route/account/runner constraints are never silently relaxed.
43. Git base-revision drift is detected before merge/publish.
44. Background child processes are cleaned unless explicitly handed off as durable runtime outputs.
45. Provider account rate-limit fallback never crosses user/tenant account boundaries silently.
46. Approval is revalidated against the final target/action snapshot immediately before high-risk execution.
47. Repository rename/transfer across multiple hosts does not split one SmartAIHub `repo_id` merely because Orca cached display identity differs.
48. An unknown/conflicted Orca owner sentinel cannot be treated as an executable runtime target.
49. Workspace deletion preserves enough independent process/session control to cancel or reconcile an active agent where technically possible.
50. `worker-start`-style contradictory vendor state (`failed` while setup is still progressing) normalizes to pending/unknown rather than false terminal failure.
51. Long but active setup uses bounded progress-aware waiting and does not consume the normal agent-readiness timeout.
52. Retry explicitly preserves original worktree/runner/account/model placement unless a new placement decision is authorized.
53. A background prompt that never reaches the agent cannot produce a successful/completed SmartAIHub run.
54. Prompt delivery that may already have written bytes cannot be blindly re-pasted.
55. Oversized/truncated interactive questions are detected and rendered from durable SmartAIHub state rather than silently losing options/content.
56. Observability hooks have bounded timeout, validated structured I/O and do not stall normal agent operation when their classified policy is fail-open.
57. Windows hook certification proves the exact interpreter and detects WSL/Git-Bash/PowerShell wrapper mismatches.
58. Vendor telemetry/free-form error egress is independently governed and SmartAIHub never forwards unsanitized path/user/prompt-bearing errors as its own telemetry.
59. SSH/remote reconnect does not create unbounded detached PTYs for one logical terminal.
60. A failed runtime/worktree scan produces `UNKNOWN_SCAN_FAILED`, not authoritative empty inventory.
61. New-session continuation refuses a provider config-root cwd that would alter config precedence or model/account behavior.
62. Path authority checks use target-host path semantics.
63. Orca `structured_native` and `terminal_tui` subtransports are separately certified and cannot switch after ambiguous start.
64. Runtime-owned auto/default panes cannot be mistaken for the SmartAIHub job's execution pane.
65. Newly applicable upstream incident advisories can degrade/block a precise tuple without permanently disabling unrelated Orca routes.
66. Circuit breaker attribution does not count setup-progress, observer-hook failure, failed discovery scan or missing UI pane as a provider-wide agent failure without independent proof.

67. A provider session whose real origin cwd/repository differs from the bound workspace is not silently resumed into that workspace.
68. An Orca auto-restored historical pane is not given SmartAIHub capability authority or made authoritative until adoption succeeds.
69. A runtime inventory saying `connected/writable` cannot override proof that the input surface is lost or the provider process is gone.
70. `terminal close`/stop returning an error but actually terminating the target is normalized from verified effect, not blindly retried.
71. `terminal close`/stop returning success while descendant processes survive is not marked cleanup-complete.
72. Worktree cleanup cannot delete the final ref to unpublished commits without rescue/explicit destructive authorization.
73. Concurrent worktrees do not use a shared untracked Git stash stack as implicit per-agent isolation.
74. Job commits use scoped Git identity/credentials without mutating unrelated global user configuration.
75. Two agents cannot silently last-writer-win the same protected branch/ref.
76. Cleanup interrupted after process drain but before filesystem/ref removal resumes from durable cleanup phase rather than losing target metadata.
77. Remote recursive deletion evaluates path/home/root safety on the remote execution host, not the controller OS.
78. Cleanup verifies external routes/forwarders and job capability authority are torn down or intentionally retained.
79. Managed isolated execution does not source uncontrolled shell/profile/repository bootstrap code with platform secrets.
80. Failed/abandoned route attempts retain accurate incurred-usage attribution without duplicate ledger charges.
81. A fallback attempt cannot reset or exceed the aggregate job spend/resource budget.
82. Scheduler/control-plane failover cannot convert one admission slot into two active runtime attempts.
83. Circuit-breaker recovery uses bounded probation/canary traffic before full production eligibility.
84. Clock skew or wall-clock jumps cannot resurrect leases, extend local deadlines indefinitely or reorder authority.
85. Canonical terminal-state DB change and authoritative outbox event cannot permanently diverge under crash injection.
86. A reconnecting backend queries an existing destructive effect intent before sending a replacement cancel/cleanup command.
87. Candidate/previous deployments can both read active attempt/resume/effect metadata during rolling upgrade and rollback.
88. Runner local reconciliation state survives process crash/partial write, and corruption is detected instead of silently reset.
89. Job Detail distinguishes command receipt, verified effect, cleanup-incomplete and unknown-outcome states.
90. A high-risk incident can produce a bounded evidence bundle linking route/runtime/prompt/side-effect/artifact/cleanup proofs.
91. The implementation uses the existing `sah-runner-v1` identity/control boundary and does not expose a parallel public Orca control plane.
92. The implementation does not claim Orca readiness from the existing Claude/Codex/Antigravity manifests; a versioned `orca.v1` capability and certified command catalog are present before route admission.
93. The implementation maps detailed Orca phases into the existing `worker_jobs` status contract and subordinate evidence, with no unreviewed top-level status enum or duplicate Job/outbox tables.
94. The approved OpenAI Agents/LangGraph runtime paths and all retired-system prohibitions remain unchanged when the Orca route is disabled or rolled back.

---

# 100. Definition of Done

The architecture is successful when SmartAIHub can execute:

```text
CASE A — A2A-capable agent
Spec 206 selects A2A
→ same SmartAIHub UX/job/audit/artifact model
```

```text
CASE B — Local Claude/Codex through Orca
Spec 206 selects Spec 200 native
→ Spec 210 selects Orca
→ Runner executes
→ same SmartAIHub UX/job/audit/artifact model
```

```text
CASE C — Orca degraded
Spec 210 route resolver safely selects native direct
→ no duplicated execution
→ same SmartAIHub UX
```

```text
CASE D — Antigravity Orca combination uncertified
Auto route excludes Orca
→ native adapter/generic certified route
→ user still sees Antigravity as logical executor
```

```text
CASE E — Future CLI agent
Orca discovers agent
→ conformance suite
→ certification
→ SmartAIHub can expose the agent without rewriting Core
```

```text
CASE F — Non-Git media task
Library assets
→ job scratch workspace
→ external agent + governed SmartAIHub media Skills
→ verified output
→ Library AssetRef
```

```text
CASE G — Shared managed infrastructure
task requires isolated execution
→ tenant-specific runtime/profile boundary
→ no cross-tenant account/history/workspace leakage
→ no weaker fallback
```

```text
CASE H — Runtime-global Orca state
Orca lists objects across multiple repositories
→ SmartAIHub Scope Guard verifies repo/workspace ownership
→ only bound objects are eligible for mutation/reconciliation
```

```text
CASE I — Resume after environment drift
historical session exists
→ cwd/model/account/profile preflight
→ safe resume only if binding satisfies policy
→ otherwise new controlled session/context handoff
```

```text
CASE J — Headless runtime
orca_server_ready received
→ listener/security checks
→ session bus/display/PTY/provider conformance
→ only then agent route becomes READY
```

```text
CASE K — Slow workspace setup
setup still progressing with bounded activity evidence
→ SETUP_IN_PROGRESS
→ no false failure / destructive retry
→ agent launches only after setup success
```

```text
CASE L — Prompt delivery failure
agent terminal exists but task prompt was never delivered
→ PROMPT_DELIVERY_FAILED / safe bounded retry if no write occurred
→ never report task completion
```

```text
CASE M — Repository rename/transfer
Orca hosts disagree on cached project label
→ SmartAIHub stable repo_id + revalidated identity evidence
→ no cross-host project split or unsafe merge
```

```text
CASE N — Remote reconnect
pane/SSH connection drops
→ probe prior PTY/process incarnation
→ reattach or fence before replacement
→ no PTY launch storm
```

---


```text
CASE O — Cleanup receipt contradicts reality
vendor close/stop response
→ verify process/PTy/worktree postconditions
→ normalize actual effect
→ no destructive blind retry
```

```text
CASE P — Worktree has unpublished/stashed work
cleanup requested
→ reachability/stash inventory
→ rescue/retain or explicit destructive approval
→ no silent data loss
```

```text
CASE Q — Runtime restart auto-restores old sessions
discover restored panes
→ classify/adopt/quarantine
→ only verified active job becomes authoritative
→ no duplicate agent execution
```

```text
CASE R — Control-plane failover during admission/effect
new leader reads durable reservation/effect intent
→ fencing/idempotency check
→ one activation/one destructive effect
→ continue reconciliation safely
```


# 101. Completeness / Gap Audit History

Revision 3 performed **24 additional independent focused review passes** after Revision 2. Each pass checked the latest Spec 210 against current Orca documentation/public issues and the existing SmartAIHub ownership contracts. Every gap below was corrected in the normative sections before this audit record.

| Pass | Audit dimension | Gap found | Revision 3 correction |
|---:|---|---|---|
| 1 | Cross-spec ownership | Rechecked risk of Orca becoming a second job/workflow/control plane | Existing ownership rules retained; no duplicate control plane introduced |
| 2 | A2A vs runtime routing | Protocol route and runtime route could regress into one flattened fallback chain | Revalidated `protocol_route` vs `runtime_adapter`; user-pinned semantics added in 76A |
| 3 | Orca CLI/version drift | User-managed Orca may update outside SmartAIHub installer | 78B invalidates command catalog/certification on observed binary/version drift |
| 4 | Runtime-global repository scope | Orca listings may include objects from unrelated repositories | 12A adds mandatory Repository/Worktree/Terminal Scope Guard |
| 5 | Object identity | Human labels/session titles are not stable unique identifiers | 12B bans label-based automation identity |
| 6 | Stale session cwd | Historical session may point to a removed worktree | 12C adds resume preflight and stale-CWD protection |
| 7 | Resume profile fidelity | Resume can lose or retain wrong model/effort/args/env | 15C + 34A require launch-profile/model/account attestation and resume manifest |
| 8 | Headless multi-account | UI account switching may not prove headless account selection | 15D requires explicit certified account binding/isolation |
| 9 | Multi-host launch configuration | One global agent launch command may not fit every execution host | 15E makes launch profile Runner/host specific |
| 10 | Shared provider-config races | Concurrent starts can race on global provider configuration | 16A adds provider-configuration mutation mutex |
| 11 | Mid-session config drift | Provider config remirroring may alter model/effort/profile | 16B adds config fingerprint/drift classification |
| 12 | Context consistency | Context Package lacked explicit atomic publish and queue-time freshness/ACL revalidation | 18B–18C add immutable snapshot manifest, atomic publish and revocation semantics |
| 13 | Asset integrity | Materialization/upload lifecycle needed stronger hash/path/idempotency rules | 19A–19B add ingress/egress validation and idempotent upload |
| 14 | Workspace drift | Base branch, network egress and agent-spawned background processes were under-specified | 20D–20F add base drift, network capability and process custody |
| 15 | Hidden provider sub-agents | Sub-agent completion/visibility could be mistaken for top-level completion | 21A–21B add authoritative-primary rule and delegation budgets |
| 16 | Prompt/startup safety | Generic readiness timeout did not classify deterministic startup blockers or headless env failure | 27A–27C add typed blockers, headless PTY readiness and at-most-once safe Enter recovery |
| 17 | Reconciliation | Resume facts lacked a canonical manifest and source-authority order | 34A–34B add resume manifest and reconciliation precedence |
| 18 | Event pressure | Raw terminal streaming could block/drop important events under server backpressure | 36A adds durability classes, bounded outbox and drop/coalesce policy |
| 19 | Local hook/privacy boundary | Loopback lifecycle/status hooks can contain prompt/tool data | 36B treats hook transport as sensitive local service |
| 20 | Runtime listener/security | Same-host integration could accidentally depend on wildcard/public WebSocket; `pairing-address` is not a bind control; root `--no-sandbox` risk under-specified | 39B–39D add local transport preference, actual reachability/firewall enforcement, bound-vs-advertised endpoint checks, sandbox and container packaging rules |
| 21 | Exactly-once capability/economic effects | Tool/event replay could duplicate side effects or ledger rows | 42A–42B + 58A add invocation/usage identities and delegated-authority limits |
| 22 | Operational resilience | Admission races, resource pressure and emergency runtime quarantine needed explicit handling | 59A–60A add reservations, launch-storm control, resource degradation and kill switch |
| 23 | Data integrity / command replay | Attempt/event DB uniqueness and Runner command ACK/idempotency were incomplete | 70A–71A add canonical constraints/indexes and command replay semantics |
| 24 | Production regression coverage | Latest incident classes were not all permanent test fixtures | 90A–90B, expanded security/reliability matrix, rollout gates and Acceptance Criteria 31–46 close the gap |

Revision 3 therefore contains **24 additional audit passes** on top of the 12 passes recorded in Revision 2. Gaps found during these passes have already been integrated; this table is an audit record, not a future-work list.

## 101A. Revision 4 — Additional 24-Pass Completeness / Gap Audit

Revision 4 performed **24 additional independent focused review passes** after Revision 3, including current Orca 1.4.205 behavior and public issues observed through 2026-09-19. Every identified gap was incorporated into the normative sections before this record.

| Pass | Audit dimension | Gap found | Revision 4 correction |
|---:|---|---|---|
| 1 | Canonical repository identity | Vendor/cached presentation identity may survive repo rename/transfer differently across hosts | 12D makes SmartAIHub `repo_id` canonical and adds identity epochs/aliases/revalidation |
| 2 | Ambiguous runtime ownership | Sentinel/conflicted owner values could be mistaken for real remote runtimes | 12E makes unknown/conflicted/stale owner states non-executable |
| 3 | Workspace loss recovery | Deleting a workspace could also remove the practical control surface for a still-running agent | 12F + 34C preserve independent process/session recovery semantics |
| 4 | Session continuation cwd | A new continuation can start in provider config root/home and change configuration precedence | 15F blocks unsafe continuation cwd |
| 5 | Cross-platform path authority | Controller-host path semantics can differ from target execution host | 15G requires target-host canonicalization semantics |
| 6 | Orca transport evolution | Spec assumed Orca usefulness remains PTY/TUI-only | 9.5 adds separately certified `terminal_tui` vs `structured_native` subtransports |
| 7 | Setup vs readiness state | Vendor receipt may say failed while setup is still progressing | 24A–24B add contradiction reduction and separate setup/readiness phases |
| 8 | Slow healthy setup | One fixed readiness timeout confuses slow dependency install with failure | 24B adds bounded activity-aware setup timeout |
| 9 | Retry placement | Upstream retry primitives may not preserve worktree/placement | 25B requires explicit full placement on every retry |
| 10 | Background prompt loss | Terminal creation can succeed while automation prompt never reaches the agent | 25A requires durable prompt-delivery proof |
| 11 | Premature completion | Startup/idle snapshot can look complete without a task turn ever starting | 25A requires fresh turn/work edge before unattended completion |
| 12 | Interactive payload truncation | Large tool/question payloads can lose prompt cards/options silently | 29A adds durable question refs, length/hash checks and incomplete-payload state |
| 13 | Hook config ownership | Runtime hooks modify provider config but lacked first-class inventory/repair contract | 16C adds managed hook governance |
| 14 | Hook blocking/I-O | Slow/dead hooks can stall every prompt/tool call or corrupt structured stdout | 16D adds bounded timeout and explicit fail-open/fail-closed classification |
| 15 | Windows shell portability | `bash` may resolve to WSL; PowerShell wrapper behavior varies; synthetic fallback may mask failure | 16E makes exact interpreter behavior part of certification |
| 16 | Vendor telemetry/privacy | Vendor telemetry can contain free-form errors despite expected privacy claims | 36C separates vendor egress from SmartAIHub audit and requires typed/redacted errors |
| 17 | Discovery uncertainty | Failed scans can be misread as authoritative empty inventory | 36D adds tri-state discovery semantics |
| 18 | SSH/PTy reconnect | Reconnect can spawn multiple detached PTYs for one logical pane | 53A adds PTY incarnation fencing and replacement lock |
| 19 | Reattach default-pane duplication | Runtime-generated/default panes can be confused with SmartAIHub execution panes | 53B adds terminal ownership/deduplication |
| 20 | Failure attribution | Setup progress, observer-hook failure, missing pane or failed scan can poison provider breakers | 60B narrows failure attribution |
| 21 | Pairing secret lifecycle | Pairing stdout/bootstrap material needed explicit log-capture/revocation treatment | 39E adds pairing/device-credential lifecycle |
| 22 | Incident-aware certification | A certified tuple may later gain a reproducible upstream regression before version changes | 78C adds narrowly scoped compatibility advisory overlay |
| 23 | Multi-host identity/cache drift | Runtime/project caches can remain locally coherent while globally disagreeing | 12D identity epoch + fresh mutation-time scope checks close the gap |
| 24 | End-to-end regression gates | New incident classes needed executable acceptance tests rather than prose only | Acceptance Criteria 47–66 + DoD Cases K–N make the new protections testable |

Revision 4 therefore adds **24 more audit passes**, bringing the recorded review history in this file to **60 focused passes** (12 + 24 + 24), with all discovered Revision 4 gaps already integrated.

---


## 101B. Revision 5 — Additional 24-Pass Completeness / Gap Audit

Revision 5 performed **24 additional independent focused review passes** after Revision 4, including review of current Orca terminal/worktree/session failure modes and SmartAIHub distributed-execution invariants. Every identified gap was incorporated into normative sections before this record.

| Pass | Audit dimension | Gap found | Revision 5 correction |
|---:|---|---|---|
| 1 | Provider session origin | Provider session id/pane binding may resume valid history into the wrong cwd/repository | 12G requires provider-session origin/cwd/repo attestation |
| 2 | Unsolicited auto-restore | Runtime restart may restore historical panes outside current SmartAIHub desired state | 34D classifies/adopts/quarantines restored sessions |
| 3 | Remote surface vs process | Tab/pane presence can diverge from PTY/process reality | 36E separates surface, PTY, input path and process liveness |
| 4 | Close/stop false verdict | Vendor close can report failure after effect or success before descendants exit | 31A + 53E require effect/postcondition receipts |
| 5 | Process-tree teardown | Parent PTY exit is insufficient on platforms where descendants survive | 31A + 50C require descendant/process-cwd verification |
| 6 | Unpublished Git data | Clean worktree may still own unpublished commits that branch deletion can destroy | 49A adds ref-reachability/rescue policy |
| 7 | Git stash isolation | Stash is repo-global across worktrees and can cross-contaminate concurrent agents | 49B forbids implicit stash-based isolation and tracks OIDs |
| 8 | Git identity/credentials | Agent commits/pushes can mutate or inherit unrelated global identity/credential state | 49C scopes author/credential/remote side effects |
| 9 | Concurrent branch/ref writes | Parallel writers can collide on one branch/ref | 49D adds ref namespace and expected-old-OID/lease semantics |
| 10 | Cleanup atomicity | Partial removal can delete metadata needed to retry physical cleanup | 50A makes cleanup a durable resumable transaction with metadata-last rule |
| 11 | Remote delete guards | Controller-host path/home semantics are unsafe for remote deletion decisions | 50B moves safety evaluation to target-host facts |
| 12 | External cleanup residue | Process/worktree cleanup may leave routes/tokens/forwarders alive | 50C adds complete cleanup postconditions |
| 13 | Emergency recovery | Force cleanup lacked a sufficiently explicit high-risk contract | 50D adds preview, authority, rescue, fencing and verification |
| 14 | Shell/bootstrap trust | Shell profiles, repo hooks and lifecycle scripts can execute before agent policy begins | 39F brings startup/bootstrap into the trust boundary |
| 15 | Attempt-level economics | Fallback hides resource/cost already consumed by abandoned attempts | 58B attributes usage per route attempt |
| 16 | Aggregate retry budget | New route attempt could appear to have a fresh spend budget | 58C makes retry/fallback budget cumulative |
| 17 | Admission failover | Two schedulers can consume one free slot during control-plane leadership change | 59C adds reservation identity/generation and failover fencing |
| 18 | Breaker recovery | Recovered tuple could receive full load immediately after a transient green probe | 60C adds half-open/probation canary state |
| 19 | Time semantics | Wall-clock skew/jumps were not explicitly excluded from authority/deadline ordering | 63B defines monotonic/sequence/server-expiry semantics |
| 20 | State/event atomicity | Durable state and authoritative event/outbox could diverge across crash | 70D requires transactional state+outbox semantics |
| 21 | Destructive effect replay | Reconnect could reissue cancel/cleanup because ACK does not prove effect | 70C + 71B add durable effect intents/status queries |
| 22 | Local state corruption/disk full | Reconcile metadata could be partially written or silently reset | 97A adds atomic/checksummed local state and disk-pressure behavior |
| 23 | Rolling persisted-schema compatibility | Contract negotiation alone did not ensure old/new deployments can read active records | 78D adds expand-before-contract and rollback-read requirements |
| 24 | User/evidence clarity | Cleanup ambiguity and incident proof were insufficiently explicit in UX/forensics | 64B + 67A + Acceptance Criteria 67–90 make evidence/effect semantics testable |

Revision 5 therefore adds **24 more audit passes**, bringing the recorded review history in this file to **84 focused passes** (12 + 24 + 24 + 24), with all discovered Revision 5 gaps already integrated.

## 101C. Revision 6 — 20-Pass Repository-Convergence Audit

Revision 6 performed 20 focused passes against the current SmartSpecPro
repository and Specs 195–209 on 2026-09-19. The audit found and immediately
closed the missing current-baseline gap: this document now distinguishes the
target Orca architecture from the current partial Runner/Job Control Plane
implementation, records the actual status/runtime vocabulary, identifies the
absence of an `orca.v1` adapter, and adds repository-gated acceptance criteria.
The detailed evidence ledger is maintained in the combined audit at
`orchestra/spec-audit-207-210-2026-09-19.md`.

The cumulative review history recorded by this spec is now **104 focused
passes** (12 + 24 + 24 + 24 + 20). No code implementation or production route
enablement is implied by this documentation audit.

## 101D. Revision 7 — 20-Pass 207–210 Cross-Spec Audit

Revision 7 performed a fresh 20-pass cross-spec audit against Specs 207–210,
the companion Specs 195–206, and the current repository on 2026-09-19. It
closed the remaining documentation gaps by making Spec 209 workflow ownership
explicit, binding all four specs to the existing Job Control Plane tables and
canonical vocabulary, recording the current absence of `orca.v1`, and
preserving the retired-system boundary. The complete round-by-round ledger is
at `orchestra/spec-audit-207-210-2026-09-19.md`.

The cumulative review history recorded by this spec is now **124 focused
passes** (104 + 20). This remains a documentation/specification convergence
audit; implementation and production route enablement remain release gates.


# 102. Implementation Order

Recommended implementation sequence:

```text
Phase 1 — Adapter foundation
  ExternalAgentRuntimeAdapter
  Orca probe/status
  command catalog
  capability snapshot

Phase 2 — Single-agent execution
  workspace binding
  context package
  terminal/session start
  prompt submission proof
  event normalization
  result collection

Phase 3 — Reliability
  cancellation
  verified stop/close effect receipts
  cleanup transaction + unpublished-work rescue
  local durable state
  reconciliation
  auto-restore adoption/quarantine
  fencing
  START_UNKNOWN handling
  circuit breakers

Phase 4 — SmartAIHub capability bridge
  job-scoped capability token
  Spec 199 path
  Skill path
  assets

Phase 5 — Worktrees/multi-agent
  isolated worktrees
  parent/child jobs
  bounded Orca orchestration

Phase 6 — Managed install
  Windows/macOS/Linux detection
  Linux headless runtime
  update/certification/rollback

Phase 7 — UX
  Connections
  agent selection
  job detail
  diagnostics
  multi-agent view

Phase 8 — Certification
  Claude
  Codex
  Antigravity
  future agents
```

---

# 103. Initial Implementation Priority

Priority order SHOULD be:

```text
P0
- Orca probe/runtime binding
- Claude + Codex single-agent path
- prompt submission verification
- worker_jobs mapping
- cancellation/reconciliation
- verified cleanup/effect receipts
- session-origin/cwd attestation
- context package
- direct-native fallback

P1
- worktree fan-out
- SmartAIHub Skill/MCP bridge
- asset materialization
- managed install/update
- full diagnostics

P2
- Antigravity Orca certification
- bounded Orca local orchestration
- additional CLI agents
- remote/headless advanced deployment
```

Antigravity remains usable through existing Spec 200 paths while the Orca-specific combination matures.

---

# 104. Key Architectural Decisions

1. **Orca is an adapter, not the platform.**
2. **A2A remains protocol-first under Spec 206.**
3. **Spec 200 remains external-agent semantic owner.**
4. **`worker_jobs` remains durable execution truth.**
5. **SmartAIHub keeps native adapters.**
6. **Feature probing beats version assumptions.**
7. **Prompt byte acceptance is not execution proof.**
8. **Ambiguous starts reconcile before fallback.**
9. **Worktree isolation is default for parallel writers.**
10. **Skills/MCP stay centrally governed by SmartAIHub.**
11. **Provider credentials remain local/provider-native where possible.**
12. **Orca runtime is locally controlled through Runner, not exposed as a new public control plane.**
13. **SmartAIHub Workflow Studio owns deterministic workflow semantics.**
14. **Orca local orchestration is bounded and subordinate.**
15. **Every new CLI agent must pass conformance before production auto-routing.**
16. **Runtime updates are certified before rollout.**
17. **User UX remains agent/task-oriented, not terminal-runtime-oriented.**
18. **Cancellation never fabricates rollback.**
19. **Late/stale events are evidence, not authority.**
20. **SmartAIHub can remove/replace Orca later without changing product-domain contracts.**
21. **Vendor command success/failure is never a substitute for destructive-effect postcondition verification.**
22. **Worktree cleanup preserves unpublished Git work by default; metadata required for retry is deleted last.**
23. **Runtime auto-restoration cannot create authoritative SmartAIHub work without adoption.**
24. **Provider session origin/cwd/repository identity is attested independently from Orca pane presentation state.**
25. **Retry/fallback economics are cumulative across attempts, not reset per adapter.**
26. **Distributed authority uses fencing/sequence/monotonic deadlines rather than wall-clock ordering.**
21. **Every Orca object mutation is repository/workspace scoped; runtime-global discovery is never trusted implicitly.**
22. **Resume is a fresh binding decision, not blind continuation of old cwd/model/account/environment.**
23. **Headless runtime-ready is not agent-ready; PTY/session-bus/provider readiness is separately certified.**
24. **Same-host SmartAIHub integration prefers local IPC/CLI over remotely exposed Orca WebSocket.**
25. **Authoritative events and exactly-once effects survive replay/backpressure; raw terminal stream is expendable/bounded.**
26. **Provider-internal sub-agents cannot settle the parent SmartAIHub job.**
27. **User/admin route and account pins are hard constraints, not suggestions.**
28. **Runtime/global provider config mutations are serialized or explicitly certified concurrency-safe.**
29. **SmartAIHub repository identity is stable across vendor-label drift, rename and transfer.**
30. **Vendor terminal-looking states are not authoritative when subordinate evidence proves work is still progressing.**
31. **Unattended execution requires durable prompt-delivery and fresh work-edge proof.**
32. **Hook behavior is part of the certified execution contract, including interpreter, timeout and I/O semantics.**
33. **Failed discovery is UNKNOWN, never silently equivalent to EMPTY.**
34. **PTY replacement is fenced by process/incarnation identity to prevent reconnect launch storms.**
35. **Vendor telemetry is a separate egress boundary from SmartAIHub audit and observability.**
36. **Orca structured-native and TUI execution are separate certified subtransports under one adapter contract.**

---

# 105. References

Primary Orca references used when preparing this spec:

- https://github.com/stablyai/orca
- https://github.com/stablyai/orca/blob/main/README.md
- https://github.com/stablyai/orca/blob/main/skill-guides/orca-cli.md
- https://github.com/stablyai/orca/blob/main/docs/reference/headless-linux-server.md
- https://github.com/stablyai/orca/releases
- https://github.com/stablyai/orca/issues/15125
- https://github.com/stablyai/orca/issues/21110
- https://github.com/stablyai/orca/issues/21152
- https://github.com/stablyai/orca/issues/13821
- https://github.com/stablyai/orca/issues/16095
- https://github.com/stablyai/orca/issues/15190
- https://github.com/stablyai/orca/issues/11229

- https://github.com/stablyai/orca/issues/9295
- https://github.com/stablyai/orca/issues/17745
- https://github.com/stablyai/orca/issues/10922
- https://github.com/stablyai/orca/issues/20552
- https://github.com/stablyai/orca/issues/6281
- https://github.com/stablyai/orca/issues/6846
- https://github.com/stablyai/orca/issues/14473
- https://github.com/stablyai/orca/issues/15620
- https://github.com/stablyai/orca/issues/11217
- https://github.com/stablyai/orca/issues/8400
- https://github.com/stablyai/orca/issues/21515
- https://github.com/stablyai/orca/issues/21512
- https://github.com/stablyai/orca/issues/21506
- https://github.com/stablyai/orca/issues/21492
- https://github.com/stablyai/orca/issues/21490
- https://github.com/stablyai/orca/issues/21514
- https://github.com/stablyai/orca/issues/16931
- https://github.com/stablyai/orca/issues/9034
- https://github.com/stablyai/orca/issues/18117
- https://github.com/stablyai/orca/issues/18097
- https://github.com/stablyai/orca/issues/11524
- https://github.com/stablyai/orca/issues/7323
- https://github.com/stablyai/orca/issues/17977

- https://github.com/stablyai/orca/issues/10004
- https://github.com/stablyai/orca/issues/10747
- https://github.com/stablyai/orca/issues/11143
- https://github.com/stablyai/orca/issues/12250
- https://github.com/stablyai/orca/issues/13695
- https://github.com/stablyai/orca/issues/14719
- https://github.com/stablyai/orca/issues/16783
- https://github.com/stablyai/orca/issues/16960
- https://github.com/stablyai/orca/issues/17767
- https://github.com/stablyai/orca/issues/18191
- https://github.com/stablyai/orca/issues/18275
- https://github.com/stablyai/orca/issues/2927
- https://github.com/stablyai/orca/issues/8613

SmartAIHub companion specifications:

- Spec 199 — External MCP Gateway
- Spec 200 — Universal External Agent Control Plane
- Spec 206 — A2A-First Hybrid External Agent Interoperability
- Spec 207 — Economic / Wallet / Payment Control Plane
- Spec 208 — Hybrid Computer Use & Dynamic Capability Routing
- Spec 209 — AI Workflow Studio

---

# 106. Final Architecture Snapshot

```text
                           SmartAIHub Web
            Universal Assistant / Workflow Studio / API
                                  │
                                  ▼
                       Shared Goal Orchestrator
                                  │
                    Capability Registry / Resolver
                                  │
                                  ▼
                        Spec 206 Route Policy
                       /                      \
                      /                        \
                 A2A Route               Spec 200 Native Plane
                      │                        │
                      │                 Runtime Route Resolver
                      │            ┌───────────┼────────────┐
                      │            │           │            │
                      │            ▼           ▼            ▼
                      │          Orca       Native       Generic
                      │         Adapter      Direct         PTY
                      │            │
                      │            ▼
                      │      SmartAIHub Runner
                      │            │
                      │       Orca Runtime
                      │      ┌─────┼─────┐
                      │      ▼     ▼     ▼
                      │   Claude Codex Antigravity
                      │
                      └──────────────┬────────────────────────
                                     │
                             Shared Platform Services
                     ┌───────────────┼──────────────────┐
                     ▼               ▼                  ▼
                 worker_jobs    Capability Gateway   Library
                     │               │                  │
                     │          Skill / Spec 199        │
                     │               │                  │
                     └──── Approval / Audit / Billing ──┘
```

The implementation MUST preserve this boundary even if Orca later adds richer orchestration, A2A support, browser control, or provider-native APIs. SmartAIHub adopts useful runtime capability without surrendering platform ownership.

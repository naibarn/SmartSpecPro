# Cross-Spec Node and Capability Coverage

This is a normative amendment to the Typed Workflow Node Platform v1. It maps
the workflow-facing functions from Specs 200, 204, 205, 206, 207, 208, 210, and
211 into one registry without creating a second queue, capability registry,
approval service, runner registry, browser control plane, or economic ledger.

## Design rule: node versus execution metadata

Not every function in the companion specs should be a draggable visual node.

- A **workflow node** represents a user-composable input, transformation,
  decision, effect, human gate, output, or observable operation.
- **Execution metadata** selects an approved implementation for that node:
  protocol, provider, Runner, Container profile, Orca, ACP, Gas City, A2A,
  budget, approval, workspace, and verification policy.
- **Runtime/service state** remains in canonical `worker_jobs`, attempts,
  events, outbox, Runner/Capability Registry, Approval Service, Library/Asset
  Gateway, and Economic Control Plane. Transient session IDs must never become
  workflow-definition inputs or node identity.

This prevents one node type per vendor while still making every companion-spec
function visible, configurable, validated, and observable.

## Shared cross-spec execution envelope

Every execution-capable node may declare this registry-owned metadata:

```text
execution:
  routePolicy: auto | native_required | native_preferred | a2a_required | a2a_preferred | orca_preferred | acp_preferred
  protocol: native | a2a | acp | mcp | runner_control | http
  runtimeTarget: auto | CLOUD_SHARED | CLOUD_JOB_ISOLATED | CLOUD_SESSION_ISOLATED | SANDBOX | LOCAL | EXTERNAL_PROVIDER_NO_CONTAINER
  runtimeProfile: media-utils-runtime | video-render-runtime | remotion-render-runtime | document-runtime | hermes-runtime | code-sandbox-runtime | cpu-ml-runtime
  providerRef: logical provider/agent reference, never a credential
  capabilityRequirements: versioned capability IDs and constraints
  workspaceBinding: project/workspace reference and policy
  resourcePolicy: cpu/memory/disk/gpu/network/duration/concurrency
  approvalPolicy: shared approval profile and effect class
  economicPolicy: quote/budget/mandate/reserve policy reference
  verificationProfile: required postcondition/evidence checks
  retryPolicy: bounded attempts, backoff and retryable classes
  timeoutPolicy: soft/hard deadline
```

The server resolves this envelope into a pinned route/capability/runtime
snapshot at admission. The client cannot authorize a tenant, wallet, Runner,
browser session, provider, or secret by sending an ID.

## Workflow-facing node additions

### Spec 200 — External Agent, Skill, Asset, Context, and Verification

| nodeType | Inputs | Outputs | Required settings |
|---|---|---|---|
| `external-agent-task` | goal, context package, assets | agent-result, events, artifacts | task family (`coding`, `research`, `automation`, `media_edit`), logical agent, route/runtime policy, workspace, capability scope, max turns/duration/cost, approval and verification |
| `capability-search` | query, context | capability[] | capability type, semantic query, tenant scope, health/readiness filter, result limit |
| `capability-describe` | capability ref | capability manifest | version policy, detail level, allowed fields |
| `capability-invoke` | capability ref, typed args | tool/skill/agent result | pinned version, input schema, permission scope, idempotency, approval/economic policy |
| `capability-status` | job/capability ref | status/progress | job scope, refresh policy, event projection |
| `capability-result` | job/capability ref | result/artifact[] | result schema, artifact policy, verification profile |
| `asset-select` | filters/query | asset-ref[] | tenant/project scope, asset types, collection/tags, authorization |
| `asset-preview` | asset-ref | preview/evidence | preview mode, redaction, size/retention |
| `context-package` | query, refs | scoped context/citations | RAG scope, Library/project sources, token/size budget, freshness, provenance |
| `workspace-bind` | project/repository ref | workspace-binding | workspace mode, branch/worktree policy, allowlist, cleanup policy |
| `git-operation` | workspace-binding | git-receipt/diff/artifact | operation allowlist, ref/branch policy, verification and unpublished-work policy |
| `verification` | output/artifact/evidence | verification-report, pass/fail | profile (`quick`, `standard`, `strict`), authoritative checks, human confirmation policy |
| `code-task` | goal, workspace, context | code-result, diff, artifacts | approved commands/profile only, runtime target, workspace, tests/build/lint profile, timeout, approval |

`skill` remains the user-friendly node for a registered Skill. It must expose
the canonical `input.json`/`ui.json` contract and internally use the same
capability discovery/invoke/status/result path. The extra capability nodes are
for workflows that intentionally inspect or orchestrate capability lifecycle.

### Spec 204 — Cloudflare Container runtime

Container classes are runtime profiles, not arbitrary user-created containers.
The following node bindings are required:

| Runtime profile | Node bindings | Required runtime evidence |
|---|---|---|
| `media-utils-runtime` | media probe/transform, `media-qc`, lightweight `file-transform` | image/version, resource limits, health, progress, output postcondition |
| `video-render-runtime` | `render`, `media-compose`, subtitle/mux/export adapters | render job, FFmpeg progress, artifact, timeout/OOM/stall state |
| `remotion-render-runtime` | `render` with composition adapter | pinned Node/Remotion/Chromium image, render proof, artifact |
| `document-runtime` | parser/OCR/document transform | parser image/version, bounded input/output, conversion evidence |
| `hermes-runtime` | `external-agent-task` | session/runtime binding, external state, reconnect/reconcile |
| `code-sandbox-runtime` | `code-task`, `git-operation`, `verification` | isolated workspace, egress/resource policy, cleanup receipt |
| `cpu-ml-runtime` | embedding/OCR/classifier where approved | model/image/version, resource and quality evidence |

The node form selects requirements and policy; the Runtime Router selects the
actual profile. A node cannot inject a raw image, container ID, host path, or
container credential.

### Spec 205 — Runner and execution-node functions

Runner discovery, enrollment, capability snapshots, leases, fencing, local
journal, control channel, process supervision, and update/release are services
and execution metadata. They are surfaced through these node settings and
outputs:

- `external-agent-task` and `code-task` accept `executionTarget`,
  `runnerCapabilityRequirements`, `workspaceBinding`, and `verificationProfile`.
- `workspace-bind` returns a server-authorized workspace binding, never a raw
  local path.
- `capability-search` can filter the current redacted Runner/Capability
  Registry snapshot.
- `capability-status` and `capability-result` expose real job/attempt state,
  not local process guesses.
- `verification` consumes Runner evidence and authoritative postconditions.

Runner control commands, enrollment, device credentials, local journal,
reconnect, release/update, and runner cancellation are not user-authored graph
nodes. They must remain under the authenticated Runner boundary and canonical
job control plane.

### Spec 206 — A2A interoperability

`external-agent-task` must support a protocol policy with:

```text
a2a_required | a2a_preferred | native_required
```

Its runtime snapshot must record Agent Card hash/freshness, protocol version,
supported interface, AgentSkill match, auth readiness, health/conformance,
selected route, fallback reason, and dispatch ambiguity state. Add these
optional projections as dedicated nodes when a workflow needs discovery:

- `capability-search` → discover external agents/capabilities;
- `capability-describe` → inspect Agent Card/skill contract;
- `external-agent-task` → SendMessage/stream/task lifecycle;
- `capability-status`/`capability-result` → GetTask/Subscribe/result/artifact.

No A2A task table replaces `worker_jobs`; a binding is subordinate metadata.
Fallback is allowed only for bounded pre-dispatch failures. An ambiguous remote
dispatch must reconcile before any native retry.

### Spec 207 — Economic authorization and settlement

Economic nodes reference the shared Economic Control Plane and never handle raw
wallet credentials. They are required for monetized or side-effecting flows:

| nodeType | Inputs | Outputs | Required settings |
|---|---|---|---|
| `economic-quote` | capability/task/cost estimate | quote/effective-cost | pricing model, currency, provider/route, expiry, fee/FX/risk policy |
| `budget-guard` | quote/cost/mandate | authorized/blocked decision | user/tenant/project/agent/job budget, spend limit, reserve policy |
| `economic-reserve` | economic intent/quote | reservation ref/status | idempotency, expiry, amount/currency, budget envelope |
| `economic-authorization` | intent/reservation/mandate | authorization receipt | approval threshold, mandate scope, destination/capability, finality policy |
| `economic-capture` | reservation + execution usage | capture receipt/ledger ref | measured usage, amount bounds, attempt/effect identity |
| `economic-release` | reservation/failed attempt | release/refund receipt | release/refund policy, unknown-finality handling |
| `economic-status` | intent/job/receipt ref | economic status | projection freshness and redacted breakdown |
| `settlement-report` | ledger/settlement ref | settlement/reconciliation report | period, currency, tenant/partner scope, export/redaction |

Workflow-level cost display remains in Result/Run surfaces, but paid capability
execution must link immutable economic facts to `worker_job_id`, attempt,
workflow run, capability invocation, and artifact. Spec 207 remains owner of
quote/reserve/capture/refund/ledger/settlement; Workflow Studio only composes
the references and gates.

### Spec 208 — Browser and Computer Use

The existing four browser session node types remain supported and must be
expanded with typed action/evidence nodes:

| nodeType | Inputs | Outputs | Required settings |
|---|---|---|---|
| `browser_session_start` | URL/session policy | browser-session | target (`existing`, `isolated`, `cloud`), profile/tab binding, allowlist, timeout, feature flag |
| `browser_observe` | browser-session | observation/browser-evidence | observation mode, redaction, target binding, screenshot/DOM policy |
| `browser_action` | browser-session, typed action | browser-session, action-result | action kind, target binding, batch order, approval/effect class, stale-target policy |
| `browser_session_instruction` | browser-session, instruction | browser-session, browser-evidence | bounded instruction, allowed action set, model/route policy, no raw unrestricted input |
| `browser_file_transfer` | browser-session, asset/file | asset-ref/browser-evidence | upload/download direction, destination, authorization, cleanup, finality verification |
| `browser_session_wait_for_user` | browser-session | browser-session/evidence | assignee, allowed interaction, expiry, lease handoff |
| `browser_session_review_gate` | browser-session/evidence | approved/rejected/evidence | reviewer, action summary, economic/irreversible-effect policy |
| `browser_verify` | browser-session/result/evidence | verification-report | authoritative postcondition, DOM/download/Library evidence, confidence policy |
| `browser_takeover` | browser-session | takeover receipt/browser-session | human takeover, AI fencing, release/reobserve policy |

Typed browser actions include screenshot, click, double-click, right-click,
drag, key, type text, scroll, wait, select, upload, download, and submit. The
node cannot accept arbitrary coordinates/selectors without target binding and
policy validation. Spec 208 owns browser/desktop execution and verification;
Workflow Studio only requests it.

Browser route metadata must support the approved route order/policy from Spec
208: WebMCP, DOM/deterministic, local Runner, cloud/native CUA adapter, with
upgrade/fallback reason, human takeover and postcondition verification. The
graph stores the logical route policy only; the browser control plane owns the
session and selected adapter.

### Spec 210 — Orca runtime adapter

`external-agent-task` must support `native_preferred`, `orca_preferred`, and an
Orca runtime snapshot. The node contract must include:

- logical agent/provider, Orca adapter/version, route policy;
- workspace mode, parallelism, model, reasoning effort, max duration, max cost,
  approval profile, and required capability constraints;
- workspace/context/assets/Skill references;
- prompt submission proof and session/turn correlation;
- approval and tool/capability scope;
- cancellation, verified stop/cleanup, restart/reconcile, and result mapping;
- usage/economic facts without raw payment credentials.

The UI may expose presets `Orca Agent` and `Native Agent`, but they resolve to
the same canonical `external-agent-task` node contract. Orca session/pane/
worktree IDs remain run-state metadata.

### Spec 211 — ACP, Gas City, and managed agent fleet

`external-agent-task` must support `acp_preferred` and runtime composition:

```text
protocol: acp | native
sessionRuntime: direct_runner | gascity | orca | cloud_container
gascityProvider: acp | tmux | subprocess | exec | kubernetes | auto
```

For multi-agent workflows add:

| nodeType | Inputs | Outputs | Required settings |
|---|---|---|---|
| `managed-agent-fleet` | goal/context/assets | agent-result[], child-events, artifacts | fleet profile, max child agents, delegation lease, child capability scope, concurrency, aggregate budget, join/failure policy |
| `agent-session-control` | agent/session/job ref | session status/receipt | pause/resume/cancel/close, protocol/runtime version, lease/fence policy |

ACP lifecycle, session resume, permission/user input, background task, event
normalization, Gas City provider selection, child lineage, store health,
reconciliation, runtime upgrade, and process custody remain adapter/runtime
functions. The workflow definition stores only logical requirements and pinned
policy; transient ACP/Gas City/session/bead IDs belong to run state.

## Companion-spec coverage matrix

| Source spec | Workflow-facing nodes | Execution metadata/owner that must be resolved | Required proof |
|---|---|---|---|
| 200 | external-agent-task, capability-*, asset-*, context-package, workspace-bind, git-operation, verification, code-task | Capability Gateway, Skill/Agent/Asset/Library, workspace/Git and verification authority | typed manifest, scoped context, workspace/Git receipt, authoritative verification |
| 204 | media/document/code/agent nodes consume runtime profiles | Container Runtime Router, resource/health/stall/cost policy | image/profile snapshot, progress, resource, artifact, cleanup |
| 205 | external-agent-task, code-task, workspace-bind, capability-status/result | authenticated Runner, capability snapshot, lease/fencing and control channel | Runner identity/capability, lease, heartbeat, effect/verification receipt |
| 206 | capability-search/describe, external-agent-task, capability-status/result | Agent Card, protocol/interface/skill conformance, route/fallback policy | Card hash/freshness, selected route, ambiguity reconciliation, result |
| 207 | economic-quote, budget-guard, economic-reserve/authorization/capture/release/status, settlement-report | Economic Control Plane quote/mandate/reservation/ledger/settlement | immutable economic linkage, amount/usage, finality, refund/settlement |
| 208 | browser session start/observe/action/instruction/file-transfer/wait/review/verify/takeover | Browser/CUA route, target binding, feature flag, approval and human takeover | typed action, screenshot/DOM/download evidence, finality, fencing/cleanup |
| 210 | external-agent-task, agent-session-control | Orca adapter/runtime route under external-agent authority | probe, prompt submission, session correlation, cancel/reconcile/cleanup |
| 211 | external-agent-task, managed-agent-fleet, agent-session-control | ACP/Gas City provider/session runtime, child lineage and aggregate policy | lifecycle/resume, child events, provider/permission scope, verification/economics |

The matrix is a completeness gate: every row needs a registry entry or an
explicit execution-metadata binding, a dedicated adapter contract, a focused
test fixture, a representative workflow, and a truthful readiness state. A
companion service feature is not covered merely because a generic
`external-agent` or `http-request` node can be renamed to resemble it.

## Cross-spec readiness and validation

Publish/run validation must fail closed when:

- required capability snapshot is missing/stale;
- A2A Agent Card or interface conformance is unverified;
- Runner/Container profile is unavailable or incompatible;
- Orca/ACP/Gas City tuple is uncertified;
- browser feature flag/target/approval/verification is unavailable;
- economic quote/budget/mandate/reservation is required but absent;
- workspace, asset, context, or verification authority is missing;
- the requested route would create duplicate dispatch or bypass a canonical owner.

The inspector must show these as separate readiness states and the run must
persist the resolved cross-spec snapshot for replay and audit.

## Cross-spec acceptance workflows

1. Spec 200 coding task: form → workspace-bind → code-task → git-operation →
   verification → artifact.
2. Spec 204 media: media input → media-qc → render with video-render/remotion
   profile → artifact-publish.
3. Spec 205 Runner: capability-search → external-agent-task with Runner target →
   capability-status → verification.
4. Spec 206 A2A: capability-search → capability-describe → external-agent-task
   with `a2a_preferred` → status/result, with safe pre-dispatch fallback.
5. Spec 207 paid capability: economic-quote → budget-guard → reserve → approval
   → capability-invoke → capture/release → economic-status.
6. Spec 208 browser: session-start → observe → typed browser-action →
   browser-verify → artifact; include takeover and review gate.
7. Spec 210 Orca: external-agent-task with `orca_preferred` → prompt proof →
   status → verified cleanup → result.
8. Spec 211 fleet: external-agent-task with ACP/Gas City → managed-agent-fleet
   → child events/results → aggregate budget/verification.

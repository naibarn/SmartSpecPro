# Section 06 — Agent Runtime orchestration and graceful degradation

## Objective

Integrate the Vertical Drama assurance adapters with the existing Node and
Python Agent Runtime without creating another runtime, credit owner, provider
path, or content authority. The Agent path may produce bounded structured
proposals, findings, and allowlisted repair plans, but the existing Node domain
validators, durable attempt owner, billing/provider owner, final gate, and
candidate-versus-active CAS remain authoritative.

This section must leave editing, saving, inspection, and deterministic preview
available when the Agent SDK, Python service, capability manifest, or model
gateway is unavailable. It must also fail closed at activation, paid-provider,
export, and publication boundaries whenever an independent deterministic path
cannot prove every required gate.

## Dependencies and hand-off contract

Implementation begins only after Sections 01, 02, 03, and 05 have exported the
following contracts. This section consumes them and must not redefine them:

- Section 01 owns `ProductionContextSnapshot`, the Vertical Drama domain task
  taxonomy, the domain-to-`OrchestraTaskKind` mapping, assurance request/result
  schemas, compatibility mode, readiness, disposition, stable error codes, and
  canonical fingerprints.
- Section 02 owns durable admission, immutable attempt identity, event order,
  lease/fence state, checkpoint references, current projection, recovery,
  reconciliation, and final candidate CAS. Redis state and Agent checkpoints
  are not content or attempt authorities.
- Section 03 owns billing policy, reservations, draws/refunds, provider call
  IDs, one-time side-effect authorization, unknown-outcome reconciliation, and
  the rule that each adapter has exactly one billing owner.
- Section 05 owns tenant-scoped profile/source/visual/claim/B-roll admission and
  the current `ProductionContextSnapshot` reference and fingerprint.

Section 01 creates the pure contract/mapping skeleton in
`verticalDramaAssuranceAdapter.ts`; this section is the sole writer that extends
that skeleton with runtime selection, dispatch, fallback, and normalization
during its execution wave. The output is one reusable
`verticalDramaAssuranceAdapter` runtime seam. Section 07 must call that seam rather than invoking
`executeSharedSkillRuntime`, the Python internal API, a model, or a provider
directly. Section 09 consumes the flag/trace/metric vocabulary defined here for
canary operations and the runbook. Section 10 supplies browser, deployment,
provider, migration, and production evidence; local tests in this section are
not sufficient to claim production activation.

## Scope and non-goals

In scope:

- map an admitted Vertical Drama assurance request into the existing shared
  Agent Runtime request and capability manifest;
- enforce Node/Python contract parity, structured outputs, manifest authority,
  guardrails, redaction, trace correlation, checkpoints, and bounded execution;
- define deterministic `legacy`, `shadow`, `active`, and active-failure
  fallback behavior for advisory and final-boundary operations;
- account for every Agent, legacy-model, and fallback call under the Section 03
  attempt budget and billing owner;
- expose stable runtime/fallback metadata to the durable projection without
  persisting private story or media content in traces;
- consume the five default-off runtime-family flags created by Section 01 and
  enforce their selection/kill-switch precedence at dispatch and resume.

Out of scope:

- changing the six-step wizard, routes, or browser components;
- moving domain validation, source policy, credit deduction, provider
  submission, durable media ownership, or candidate activation into Python;
- allowing Agents to query the database, read arbitrary storage, fetch URLs,
  call providers, submit media, spend credits, publish, export, or mutate a
  draft directly;
- replacing existing story, prompt, Draft QC, or media composers with free-form
  Agent output;
- adding a second retry loop around an existing provider/model retry loop;
- enabling production flags, changing tenant cohorts, or claiming live runtime
  proof in this section.

## Current seams and required corrections

The implementation must preserve and extend the existing Feature 151 runtime
rather than introducing parallel services.

Current behavior to retain:

- `AgentRuntimeRequestSchema` already carries the optional assurance envelope,
  execution envelope, trusted capability manifest, context evidence, version
  tuple, correlation IDs, and side-effect policy.
- Node `requestBuilder.ts` already sanitizes unsafe plan-context keys, delegates
  context memory lifecycle to the context engine, and forwards the assurance
  envelope.
- Node `client.ts` already rejects missing assurance results, attempt mismatch,
  contract-hash mismatch, and tools/skills/agents outside the request envelope.
- `skillRuntimeOrchestrator.ts` already implements generic `legacy`, `shadow`,
  and `active` selection, preserves the legacy visible result in shadow mode,
  rejects active execution without a trusted manifest, and enforces a recursion
  ceiling.
- Python validates Node/Python contract versions, tenant/envelope identity,
  manifest/tool/agent/output-schema authority, refs-only media-production
  checkpoints, and internal-route authentication.
- Python `openai_agents_orchestra.py` performs deterministic assurance
  preflight before the SDK and echoes assurance attempt/hash identity.
- Node and Python trace helpers already produce stable correlation/event IDs and
  redact secrets, JWTs, signed URLs, and sensitive fields.

Corrections required by this section:

- The generic Python SDK agent currently does not bind the trusted output schema
  to SDK `output_type`; add an allowlisted schema registry and pass the resolved
  Pydantic type to the Agent. Never compile or execute a client-supplied schema.
- SDK output guardrails are not a substitute for application validation and do
  not cover every hosted tool or handoff path. Add the bounded output guardrail
  at the Python seam, then always repeat shared-schema and domain validation in
  Node before readiness or activation.
- The generic active-mode path currently surfaces manifest/runtime failure
  directly. Add adapter-owned fallback classification so advisory operations
  can use one deterministic fallback while paid/export boundaries remain
  fail-closed unless the deterministic path independently satisfies all gates.
- The assurance budget exists in the contract, but the generic SDK Runner does
  not consistently consume its turn, tool, wall-clock, output, and repair
  ceilings. Bind every enforceable field at the Node request, Python Runner,
  tool wrapper, timeout, and post-run usage boundaries; reject unsupported or
  unenforceable combinations before spending.
- Python `provider_ready` currently means only that its bounded runtime stage
  completed. Preserve that compatibility value, but make the Node adapter
  explicitly downgrade or reject it until required mode, context/source
  readiness, rights/disclosure, credit/provider authorization, output contract,
  freshness, final gate, and CAS all pass.
- A frozen generic runtime decision currently takes precedence over the generic
  rollback flag. Do not make a broad shared-runtime semantic change without an
  impact review. The Vertical Drama adapter must check its domain kill switch
  and the generic force-rollback signal before dispatch or resume, fence future
  Agent calls, preserve accepted data, and then use the deterministic path or an
  actionable waiting state.

The initial implementation does **not** add a new runtime surface, origin
surface, entry point, `OrchestraTaskKind`, top-level Agent Runtime contract
version, or assurance contract version. Vertical Drama uses `surface: "skill"`,
`originSurface: "workflow"`, and `entryPoint: "system"`; the admitted domain
task remains explicit in the versioned `schemaRef`, contract hash, bounded
`planContext.assuranceContext` references, and structured output echo. This is
the smallest mixed-deploy-safe route because all three wire enum values already
exist on Node and Python. If a future implementation cannot satisfy a hard
contract test with these existing fields, that is a new coordinated contract
version decision, not permission to send a Node-only field to an older Python
worker.

## Files and ownership

### Shared Node contracts

- Reuse `OrchestraAssuranceRequestSchema.outputContract.schemaRef`,
  `requiredFields`, and `maxChars` in
  `apps/web/shared/agentRuntime/orchestraSchemas.ts`. Encode the trusted output
  schema version in the allowlisted reference, for example
  `vd.assurance.draft-qc-findings.v1`; do not accept a client-provided JSON
  Schema, Python class/module name, or executable schema fragment.
- Do not change `apps/web/shared/agentRuntime/types.ts` or bump its runtime,
  trace, or checkpoint version for the initial implementation. The existing
  `planContext`, `traceMetadata`, `assurance`, `terminalReason`, and checkpoint
  fields can carry the required bounded references and numeric usage. Parse the
  Feature 157 metadata with dedicated schemas at the Vertical Drama adapter
  boundary rather than weakening a generic `z.record` into authority.
- Reuse `apps/web/shared/agentRuntime/skillManifest.ts` for capability authority;
  do not create a Vertical Drama-only manifest parser.
- Extend the Section 01 task/output mapping in
  `apps/web/shared/verticalDramaSeries/assurance.ts` only with its runtime output
  schema and budget bindings and the runtime-specific stable error codes listed
  below; do not rename or redefine its domain tasks. Each domain task maps to
  one shared runtime kind, one trusted output schema reference/version, one
  required mode, and one budget profile.
- Consume the five flags already registered by Section 01 in
  `apps/web/shared/featureFlags.ts`; extend focused tests only for runtime
  precedence and frozen-attempt behavior. Do not add an alias or a sixth
  Story/Season flag.

### Node runtime and Vertical Drama adapter

- Extend `apps/web/server/services/agentRuntime/requestBuilder.ts` to carry the
  admitted context/attempt/mapping references, trusted output schema, explicit
  budget, side-effect policy, and frozen runtime selection without copying raw
  story, prompt, evidence, or media payloads into plan metadata.
- Extend `apps/web/server/services/agentRuntime/client.ts` to verify response
  attempt, contract, context, task mapping, output schema/version, manifest,
  usage, and fallback metadata before a response reaches the domain adapter.
  Add optional `supportedAssuranceOutputSchemas: string[]` parsing to
  `AgentRuntimeHealthSchema`; absence means no Feature 157 structured-output
  capability, not wildcard support.
- Reuse `apps/web/server/services/agentRuntime/runtimeSelection.ts` for generic
  master/skill mode selection. Add the Vertical Drama-specific precedence and
  task-family decision in `apps/web/server/services/verticalDramaAssuranceAdapter.ts`
  rather than silently changing unrelated Chat, Team, Responses, or Skill
  callers.
- Extend `apps/web/server/services/agentRuntime/skillRuntimeOrchestrator.ts`
  additively so `ExecuteSharedSkillRuntimeInput` can receive an explicit
  `requestId`, `idempotencyKey`, `frozenSelection`, `requestedOperationMode`,
  and `assurance`. `buildRuntimeRequestPayload` must use those durable values
  and forward `assurance` to `buildAgentRuntimeRequest`; its current generated
  IDs remain the default for all unrelated callers. Keep product fallback in
  `verticalDramaAssuranceAdapter.ts`, not in the generic orchestrator.
- Reuse and extend
  `apps/web/server/services/agentRuntime/orchestraFinalGate.ts` for the runtime
  result check, but keep Vertical Drama `requiredMode`, context currentness,
  profile/source readiness, rights/disclosure, billing/provider authorization,
  and candidate CAS in the domain adapter and Section 02 repository.
- Reuse `checkpointService.ts`, `orchestraEventReplay.ts`, `traceService.ts`,
  `redaction.ts`, `backpressure.ts`, `teamAttemptBudget.ts`, and
  `shadowPolicy.ts`; add fields and tests rather than parallel checkpoint,
  trace, redaction, concurrency, budget, or shadow-effect implementations.
- Add focused adapter tests at
  `apps/web/server/services/__tests__/verticalDramaAssuranceAdapter.agentRuntime.test.ts`
  and extend the existing Agent Runtime tests listed under the TDD plan.

### Python runtime

- Reuse `python-backend/app/services/agent_output_assurance.py` unchanged for
  the initial wire contract. Its canonical hash, evidence, budget, prompt-limit,
  and side-effect validation remain generic and must continue to match
  `orchestraSchemas.ts`.
- Add
  `python-backend/app/services/openai_agents_vertical_drama_outputs.py` as the
  sole registry of trusted Vertical Drama Pydantic output types and
  task-to-schema resolution. Keeping domain output models out of the generic
  SDK adapter prevents the adapter from becoming a second domain authority.
- Keep `python-backend/app/services/openai_agents_contracts.py` wire-compatible
  for the initial implementation. Preserve `extra="forbid"`, version checks,
  tenant/envelope identity, capability-manifest checks, and refs-only
  checkpoint policy; add no Python-only request or response field.
- Extend `python-backend/app/services/openai_agents_orchestra.py` for bounded
  preflight, trusted output-type resolution, output guardrail invocation, and
  budget accounting. Attempt/contract identity continues through
  `AssuranceResult`; context/task/schema identity is echoed by the structured
  output and redacted trace metadata. It must not make the product fallback,
  billing, activation, or provider-submission decision.
- Extend `python-backend/app/services/openai_agents_adapter.py` to pass the
  allowlisted Pydantic `output_type`, bounded `max_turns`, safe run config,
  approved tools/handoffs, and timeout/cancellation context into the existing
  SDK Runner. Its `health()` result lists the exact registry keys in
  `supportedAssuranceOutputSchemas`. Add `_extract_assurance_usage` to
  normalize SDK turns/tool calls/token usage/wall time into redacted numeric
  `traceMetadata.assuranceUsage`; missing provider usage remains explicit
  rather than becoming zero. Preserve the gateway model resolver and
  application-owned model attribution.
- Extend `python-backend/app/services/openai_agents_trace.py` only for the new
  safe correlation and fallback/budget metadata. Keep sensitive SDK input/output
  capture and external export disabled for production assurance runs.
- Reuse `python-backend/app/services/openai_agents_skill_runtime.py` only when a
  registered skill bundle is the chosen capability. Vertical Drama assurance
  must not activate its shell/native-skill path or widen workspace access.
- Keep `python-backend/app/api/internal_openai_agents_runtime.py` as the sole
  authenticated run/stream/resume/cancel HTTP seam. Changes are additive schema
  projection and error mapping only; do not add a second internal route.
- Add `python-backend/tests/unit/test_openai_agents_orchestra.py` and
  `python-backend/tests/unit/test_openai_agents_vertical_drama_outputs.py`, then
  extend the existing assurance, contracts, adapter, trace, security, and
  internal API tests.

### Cross-runtime fixture

Add one checked-in golden fixture at
`apps/web/shared/agentRuntime/__tests__/fixtures/verticalDramaAssuranceRuntime.v1.json`.
It contains only synthetic IDs and redacted sample values. Both Vitest and
pytest read the same fixture to prove canonical JSON/hash parity, task/schema
mapping, version compatibility, budget shape, request echo, response echo, and
stable error/fallback codes. Neither test suite may maintain an independent
copy of the fixture.

## Exact runtime adapter interfaces

Extend `apps/web/server/services/verticalDramaAssuranceAdapter.ts` with these
public symbols. These are orchestration interfaces; they do not replace the
Section 01 request/result schemas or the Section 02/03 repositories.

```ts
type VerticalDramaRuntimeBoundary = "advisory" | "activation" | "paid" | "export";

interface VerticalDramaRuntimeDispatchInput<TLegacy> {
  request: VerticalDramaAssuranceRequest;
  durableAttempt: {
    executionId: string;
    attemptId: string;
    requestId: string;
    idempotencyKey: string;
    fenceToken: string;
    frozenMode: VerticalDramaAssuranceMode;
  };
  boundary: VerticalDramaRuntimeBoundary;
  context: ProductionContextSnapshot;
  skillSlugs: string[];
  modelConfig: RuntimeModelConfig;
  legacyExecute: () => Promise<TLegacy>;
  legacyNormalize: (value: TLegacy) => Promise<VerticalDramaAgentProposal>;
}

interface VerticalDramaRuntimeDispatchResult {
  proposal: VerticalDramaAgentProposal | null;
  runtimeRequest: AgentRuntimeRequest | null;
  runtimeResponse: AgentRuntimeResponse | null;
  runtimeEvidence: VerticalDramaRuntimeEvidence;
  fallback: VerticalDramaRuntimeFallback;
}

interface VerticalDramaRuntimeEvidence {
  runtimeStatus: AgentRuntimeStatus | "legacy" | "shadow_skipped";
  orchestraState: OrchestraLifecycleState | null;
  structuredOutputValid: boolean;
  domainPostValidation: "not_run" | "passed" | "failed";
  domainReadiness: VerticalDramaAssuranceReadiness | null;
  traceId: string | null;
  providerCallId: string | null;
  usage: VerticalDramaRuntimeUsage;
}

interface VerticalDramaRuntimeUsage {
  turns: number;
  toolCalls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  wallClockMs: number;
  providerUsageKnown: boolean;
  budgetExceededField: keyof OrchestraRuntimeBudget | null;
}

interface VerticalDramaRuntimeFallback {
  eligible: boolean;
  executed: boolean;
  from: "agent_active" | "agent_shadow" | null;
  to: "legacy_deterministic" | null;
  reasonCode: VerticalDramaAssuranceErrorCode | null;
  callOrdinal: number | null;
}

interface VerticalDramaRuntimeCapabilitySnapshot {
  adapterVersion: string;
  sdkVersion: string | null;
  runtimeContractSupported: boolean;
  outputSchemaSupported: boolean;
  productionSafeTracing: boolean;
  checkedAt: string;
}
```

Export these functions:

- `executeVerticalDramaAssuranceRuntime(input, deps)` — verifies the durable
  fence/current context, resolves mode, registers the physical call through
  Section 03, invokes the existing shared runtime, validates the structured
  output, and returns runtime-stage evidence. It never activates a candidate.
- `buildVerticalDramaAgentRuntimeRequest(input)` — calls
  `toOrchestraAssuranceRequest` and `buildAgentRuntimeRequest` with durable IDs,
  `surface: "skill"`, `originSurface: "workflow"`, `entryPoint: "system"`, no
  tools/handoffs/hosted capabilities, and refs-only context metadata.
- `validateVerticalDramaStructuredOutput(request, response)` — parses the
  versioned proposal schema, verifies every identity echo and server-issued
  reference, then invokes the task's deterministic post-validator.
- `classifyVerticalDramaRuntimeFailure(error, boundary, budgetState)` — the
  only function allowed to decide fallback eligibility and stable error/state
  mapping.
- `resolveVerticalDramaRuntimeCapability(client, schemaRef)` — reads/caches the
  authenticated `AgentRuntimeClient.health()` result for a short bounded
  interval and requires the exact `schemaRef`, compatible runtime versions, and
  production-safe tracing before active/shadow dispatch. A health failure or
  omitted schema list is capability unavailable; it never means “try and parse
  free-form output.”
- `assertVerticalDramaDomainFinalGate(input)` — composes
  `assertOrchestraFinalGate` with Section 05 currentness/readiness, Section 03
  billing/authorization state, and Section 02 fence/CAS prerequisites. It is
  called after runtime output validation and before domain activation/provider
  submission; it does not perform the CAS itself.

Extend `ExecuteSharedSkillRuntimeInput` in
`apps/web/server/services/agentRuntime/skillRuntimeOrchestrator.ts` with
optional fields so existing callers compile and behave identically:

```ts
requestId?: string;
idempotencyKey?: string;
frozenSelection?: AgentRuntimeSelection | null;
requestedOperationMode?: AgentRuntimeMode | null;
assurance?: OrchestraAssuranceRequest | null;
```

`executeSharedSkillRuntime` passes `frozenSelection` and
`requestedOperationMode` to `selectAgentRuntime`; `buildRuntimeRequestPayload`
uses the explicit IDs when present and passes `assurance` to
`buildAgentRuntimeRequest`. It must not add automatic active-mode fallback,
because fallback depends on the domain boundary, budget, and billing state.
The Vertical Drama adapter catches `SharedSkillRuntimeError`, classifies it,
and invokes the already-supplied `legacyExecute` at most once when policy
allows.

The Python registry in
`python-backend/app/services/openai_agents_vertical_drama_outputs.py` exports:

- `VERTICAL_DRAMA_OUTPUT_TYPES: Mapping[str, type[BaseModel]]`;
- `resolve_vertical_drama_output_type(request) -> type[BaseModel]`;
- `validate_vertical_drama_output_identity(request, output) -> BaseModel`;
- `build_vertical_drama_output_guardrails(request) -> list[OutputGuardrail]`.

The registry key is the complete versioned `schemaRef`; there is no fallback to
an arbitrary class or generic `dict`. `openai_agents_adapter.py` adds an
optional resolved `output_type` and output-guardrail list to `_build_sdk_agent`,
passes `max_turns=request.assurance.budget.maxTurns` to `Runner.run`/
`run_streamed`, and wraps the call in the admitted wall-clock timeout. Tool,
handoff, output-size, token, and usage checks remain mandatory after the SDK
returns because SDK enforcement does not cover every path equally.

## Runtime request and result contract

Every admitted request must include or reference all of the following before
Node may select a runtime:

- tenant ID, user ID, domain owner/entity reference, durable execution ID,
  logical attempt ID, runtime request ID, and idempotency key;
- Vertical Drama domain task, mapped shared runtime task/capability, mapping
  version, compatibility mode, and trusted capability-manifest hash;
- `ProductionContextSnapshot` ID/revision/fingerprint, source/candidate version,
  contract hash/version, policy/rule/model hashes, and required readiness mode;
- trusted output schema reference and version, required fields, maximum output
  size, and whether only a proposal/finding/allowlisted patch is permitted;
- explicit runtime budget and current usage/reservation summary;
- outer domain side-effect intent and authorization reference. The inner
  `OrchestraAssuranceRequest.sideEffectPolicy` and execution-envelope policy
  are always `read_only` for Feature 157 Agent proposal/evaluation calls, even
  when the outer domain request requires `provider_ready`. Section 03's
  one-time authorization is consumed only later by the Node-owned provider
  boundary and is never forwarded as Agent tool authority;
- trace, parent trace, checkpoint, and durable event references rather than raw
  SDK state or private content.

The normalized result must preserve:

- execution/attempt/request IDs and contract/context/mapping/output-schema
  echoes;
- requested runtime mode, selected runtime mode, effective `assuranceMode`,
  compatibility mode, selection reason, and frozen flag snapshot;
- structured candidate/proposal or finding references, schema validation
  status, deterministic post-validation status, and Node final-gate status;
- runtime error code, fallback eligibility, fallback-from/fallback-to mode,
  fallback reason, and whether a deterministic fallback actually ran;
- turns, tool calls, input/output tokens, wall-clock time, model/provider call
  identity, cost ownership, known/unknown usage, and budget exhaustion field;
- trace/event/checkpoint references and a stable next action/disposition;
- no raw prompts, story text, private evidence, signed URLs, provider URLs,
  tokens, credentials, or unrestricted model output in durable trace metadata.

`assurance.state = provider_ready` returned by Python is runtime-stage evidence
only. Node must not project `provider_ready` or `production_ready` to the domain
result until all domain checks pass. A completed Agent response with stale
context, wrong required mode, invalid source/rights/disclosure, missing billing
authorization, blocking findings, unverified output, or failed CAS remains
blocked, stale, awaiting action, or retryable according to the Section 01
taxonomy.

The readiness ladder is deliberately one-way:

| Evidence | Meaning | What it cannot authorize |
| --- | --- | --- |
| `AgentRuntimeResponse.status = completed` | SDK/adapter returned normally | schema acceptance, domain pass, billing, provider call, activation |
| `response.assurance.state = provider_ready` | Python bounded assurance stage completed and echoed attempt/hash | Vertical Drama `provider_ready`, paid submission, export, CAS |
| `structuredOutputValid = true` | Python and Node structural/identity checks passed | immutable/domain semantics or currentness |
| `domainPostValidation = passed` | task-specific deterministic checks passed for the candidate | paid work while context/billing/authorization/CAS is unresolved |
| domain readiness `verified`/`provider_ready` | Node final gate proved the required current boundary | `production_ready` unless assembly/export checks also pass |
| domain readiness `production_ready` | final assembly/export policy and current CAS/authorization evidence passed | nothing beyond the exact bound output/context/version |

`normalizeVerticalDramaAssuranceResult` must initialize domain readiness to
`null` for raw runtime output and set it only from the Node final-gate result.
It must never copy Python's lifecycle state into the domain readiness field.

## Structured output and guardrail plan

### Trusted output types

Register a fixed Python Pydantic output type for each output schema reference
owned by the Section 01 mapping. The initial registry covers bounded Draft QC
findings, Draft repair proposals, prompt QC findings, story-quality findings,
and season-continuity findings. Each object includes its schema version,
source/context fingerprint, stable finding codes/severities, server-issued
evidence references, and only the task-specific allowlisted proposal fields.

Extend `apps/web/shared/verticalDramaSeries/assurance.ts` with the browser-safe
`VerticalDramaAgentProposalSchema` discriminated union and the
`VerticalDramaAgentProposal` type. Every variant has this common identity:

```ts
{
  schemaRef: string;              // complete allowlisted ref ending in .v1
  schemaVersion: 1;
  taskKind: VerticalDramaAssuranceTaskKind;
  attemptId: string;
  sourceFingerprint: string;
  contextFingerprint: string;
  findings: Array<{
    code: string;
    severity: "info" | "warning" | "error" | "blocking";
    messageKey: string;
    evidenceRefs: string[];       // server-issued refs only
    targetPath: string | null;
  }>;
  proposalKind: "findings_only" | "allowlisted_patch";
}
```

The variant payload is domain-owned and closed: Draft repair uses only the
Section 04 mutable-path/candidate contract; prompt/media variants use only the
Section 07 prompt/binding proposal contracts; story/season variants use the
Feature 152/153 proposal contracts. Unknown keys fail because both Zod and
Pydantic are strict. `targetPath` and every patch path are still checked
against the Node allowlist; typing a path does not authorize it.

Freeze this schema mapping in the Section 01 runtime map and in the Python
registry:

| Domain task | Trusted `schemaRef` | Proposal authority |
| --- | --- | --- |
| `draft_qc` | `vd.assurance.draft-qc-findings.v1` | findings only |
| `draft_repair` | `vd.assurance.draft-repair-proposal.v1` | Section 04 allowlisted mutable draft proposal |
| `start_frame_prompt`, `reference_image_prompt`, `video_prompt_qc` | `vd.assurance.prompt-findings.v1` | Section 07 composer input/findings; never final prompt text authority |
| `broll_assembly_qc` | `vd.assurance.media-findings.v1` | findings/binding proposal over server-issued asset and segment refs |
| `premise_expansion`, `story_architecture`, `full_story` | `vd.assurance.story-findings.v1` | Feature 152/153 findings or allowlisted candidate proposal |
| `season_qc` | `vd.assurance.season-findings.v1` | continuity findings/repair plan only |

The mapped skill candidates are likewise explicit and manifest-backed:
`vertical-drama-draft-quality-controller`,
`vertical-drama-shot-start-frame-prompt`,
`vertical-drama-video-prompt-judge`,
`vertical-drama-story-architecture-planner`,
`vertical-drama-script-builder`, and
`vertical-drama-season-dramaturgy-critic` where those capabilities match the
task. Section 07 may supply an additional existing prompt/B-roll skill slug,
but active mode remains unavailable until `evaluateSkillCapabilityActivationGate`
finds a trusted manifest whose task type, caller, output schema, risk, and
read-only side-effect class match. Do not synthesize a permissive manifest from
the skill name alone.

The Node request sends the schema reference/version, not executable Python,
free-form JSON Schema, module paths, or class names. Python rejects an unknown,
untrusted, incompatible, or task-mismatched schema before the first model call.
The SDK Agent receives the resolved `output_type`; normalized output is then
validated again against the Python contract, serialized, validated by the
TypeScript schema, and passed through the authoritative Vertical Drama domain
validator. Structural repair, if supported by the task budget, creates a new
call ordinal under the same logical attempt and never mutates the prior raw
result in place.

### Guardrail layers

1. Node admission verifies tenant/user/domain ownership, current context,
   source/candidate version, task mapping, manifest identity, required mode,
   budget, and side-effect class before Python is called.
2. Python contract and Orchestra preflight repeat tenant/envelope/version,
   evidence, manifest, tool/agent/handoff, schema, side-effect authorization,
   and budget-shape checks before SDK execution.
3. SDK input/output guardrails enforce the bounded runtime contract and trip on
   untrusted schema output, disallowed references, output-size overflow, or
   forbidden proposal fields. They are defense in depth, not final authority.
4. Function tools, if introduced in a later feature, require manifest
   registration, Node execution, tenant authorization, idempotency, timeout,
   per-attempt call cap, output trust classification, and tool guardrails.
   Feature 157 starts with no Agent-callable DB, storage, credit, provider,
   shell, URL-fetch, publication, or media-generation tools.
5. Node validates the returned structured object, evidence IDs, immutable-field
   boundary, context fingerprint, and domain semantics, then applies the final
   readiness/authorization gate and Section 02 CAS.

Guardrail, tenant, manifest, tool-denial, side-effect authorization, contract
hash, or context-identity failures are non-retryable security/contract failures
for that admitted input. They must not be hidden by model fallback. A
schema-invalid model response may use only the task's explicit structural
repair allowance; it does not authorize a wider tool set, a different schema,
or a paid side effect.

## Runtime mode and fallback policy

The adapter records both the generic runtime mode (`legacy`, `shadow`, or
`active`) and the domain `assuranceMode` (`legacy_deterministic`,
`agent_shadow`, `agent_active`, or `recovered_result`). Mode selection is frozen
on the durable attempt so queue redelivery or flag drift cannot switch engines
mid-attempt. The domain and generic kill switches are the only overrides before
a future Agent dispatch/resume; they fence the old execution rather than
rewriting its history.

| Condition | Advisory/edit/preview behavior | Activation/paid/export behavior | Durable result |
| --- | --- | --- | --- |
| `legacy` selected | Execute the existing helper once and run current deterministic validation. | Permit only if that path independently completes every required final gate. | `legacy_deterministic`; no Agent call. |
| `shadow` selected and manifest compatible | Execute legacy once as the caller-visible result, then run one bounded read-only Agent comparison. | Never treat shadow output as provider/final-gate evidence and never activate it. | `agent_shadow` plus comparison and platform-owned usage. |
| `shadow` manifest/runtime/budget failure | Return the already computed legacy result; record why comparison was skipped or failed. | Shadow contributes no readiness evidence. | `legacy_deterministic` with shadow error metadata. |
| `active` returns schema-valid output | Run Node shared and domain post-validation; preserve the prior valid baseline until CAS. | Permit only after current context, required mode, rights/disclosure, billing/provider authorization, final gate, and CAS pass. | `agent_active`; Python completion alone is not final readiness. |
| `active` manifest missing/incompatible, SDK unavailable, gateway unavailable, or timeout before a known side effect | For advisory stages, run at most one supported deterministic fallback with the same admitted input and fingerprint if the attempt/cost budget allows it. | Use fallback only if it independently completes every hard gate; otherwise return `retryable_failed` or `awaiting_action`. | Record original error, fallback call ordinal, and `legacy_deterministic` effective mode. |
| `active` schema-invalid output | Preserve baseline; use only the bounded structural-repair allowance, then an allowed deterministic advisory fallback if budget remains. | Never mark lossy/truncated output ready. | Rejected candidate plus repair/fallback lineage. |
| tenant/owner mismatch, contract/hash mismatch, stale context, tool denial, prompt injection tripwire, unauthorized side effect, or manifest authority mismatch | Do not call a model fallback for the compromised request; expose a stable corrective action. | Fail closed; no activation/provider/export. | `awaiting_action` or `fatal_failed` according to the stable taxonomy. |
| call may have reached a paid provider or usage is unknown | Preserve source/baseline and stop automatic retries. | Never resubmit or auto-refund; enter Section 03 reconciliation. | `reconciliation_required`. |
| exact current durable result already exists | Return the exact ledger result without another runtime call. | Re-run currentness/final gate before use; recovered is not succeeded. | `recovered_result`. |
| kill switch or force rollback asserted | Stop new Agent calls/resumes, retain accepted evidence, and use the safe deterministic path where supported. | Await action unless deterministic proof is complete; never delete, refund, or resubmit blindly. | Stable kill-switch reason and preserved attempt history. |

Fallback is adapter policy, not a behavior Python may choose silently. Every
network call receives a unique `providerCallId`; Agent and legacy fallback calls
share the logical attempt but have separate call ordinals, usage, cost, and
reconciliation. A fallback cannot run merely because a queue job was redelivered
or because the browser retried a mutation.

Extend the Section 01 stable error-code set and make
`classifyVerticalDramaRuntimeFailure` exhaustive over these runtime outcomes:

| Stable code | Source examples | Fallback policy | Domain state / next action |
| --- | --- | --- | --- |
| `VD_ASSURANCE_RUNTIME_UNAVAILABLE` | `sdk_not_installed`, connection failure, 502/503, circuit open | one advisory deterministic fallback if budgeted and no usage uncertainty | `retryable_failed` / `retry` when fallback cannot prove the boundary |
| `VD_ASSURANCE_RUNTIME_TIMEOUT` | `adapter_timeout`, `timeout_run`, `timeout_step` | fallback only when the call is proven not to have an unknown billable outcome; otherwise reconcile | `retryable_failed` / `retry`, or `reconciliation_required` / `reconcile` |
| `VD_ASSURANCE_MANIFEST_MISSING` | no candidate manifest for a known task | advisory fallback allowed; active boundary remains blocked | `awaiting_action` / `retry` after deployment/config correction |
| `VD_ASSURANCE_MANIFEST_INCOMPATIBLE` | known manifest lacks task/caller/schema/version support | advisory fallback allowed; no silent manifest widening | `awaiting_action` / `retry` |
| `VD_ASSURANCE_MANIFEST_UNTRUSTED` | hash/tenant/agent/tool/output authority mismatch | never fallback the compromised request | `fatal_failed` / `inspect` |
| `VD_ASSURANCE_OUTPUT_SCHEMA_INVALID` | malformed/truncated output or unknown key | one structural repair call if admitted; then advisory fallback only if a call slot remains | `awaiting_action` or `retryable_failed` / `retry` |
| `VD_ASSURANCE_OUTPUT_IDENTITY_MISMATCH` | wrong attempt/task/schema/source/context echo or unknown server ref | never fallback the compromised output | `fatal_failed` / `inspect` |
| `VD_ASSURANCE_GUARDRAIL_BLOCKED` | prompt-injection or forbidden proposal-field tripwire | no model fallback for the same input; preserve source | `awaiting_action` / `edit` or `inspect` |
| `VD_ASSURANCE_TOOL_DENIED` | any tool/handoff/hosted capability outside the read-only manifest | never fallback as if transient | `fatal_failed` / `inspect` |
| `VD_ASSURANCE_RECURSION_LIMIT` | `runtime_recursion_ceiling_reached` | legacy result remains visible in shadow; active advisory may use only a free deterministic fallback | `awaiting_action` / `retry` |
| `VD_ASSURANCE_BUDGET_EXCEEDED` | turn/tool/token/wall-clock/repair/cost/concurrency ceiling | no limit widening and no fallback after budget exhaustion | `awaiting_action` or `retryable_failed` / `retry` |
| `VD_ASSURANCE_RUNTIME_INTERRUPTED` | paused/checkpointed run | resume the same attempt only after fence/context/budget/kill-switch revalidation | `running` or `awaiting_action` / `continue` |
| `VD_ASSURANCE_USAGE_UNKNOWN` | provider may have run but usage cannot be proven | no fallback, retry, or refund | `reconciliation_required` / `reconcile` |
| `VD_ASSURANCE_FINAL_GATE_BLOCKED` | runtime completed but Node required mode/currentness/rights/billing/CAS failed | no runtime retry unless the resulting domain action explicitly admits a new attempt | state and action from the authoritative domain finding |

Unknown runtime errors fail closed as `VD_ASSURANCE_RUNTIME_UNAVAILABLE` only
when the classifier proves they are transport/runtime failures before a side
effect. Otherwise classify them as `VD_ASSURANCE_USAGE_UNKNOWN`; never choose
fallback from string matching alone. Preserve the original internal error code
in tenant-safe operator metadata, but expose only the stable Feature 157 code
and action to API/UI consumers.

## Budget, backpressure, and cost policy

Every Vertical Drama assurance request must carry an explicit budget profile;
production adapters may not rely on schema defaults. The current shared schema
provides defaults but does not impose matching maxima. This section establishes
Feature 157 server-side ceilings no larger than that default envelope: eight
turns, sixteen tool calls, three parallel agents, plan depth four, 180 seconds,
32,000 input tokens, 8,000 output tokens, and two repair attempts. Unrelated
runtime surfaces retain their existing behavior unless separately reviewed.

The Section 01 task mapping must freeze these stricter initial profiles:

| Domain task family | Turns | Tools | Parallel agents | Plan depth | Wall clock | Input tokens | Output tokens | Structural repair attempts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `draft_qc`, `draft_repair` | 3 | 0 | 1 | 1 | 150 seconds | 24,000 | 6,000 | 1 |
| `start_frame_prompt`, `reference_image_prompt`, `video_prompt_qc`, `broll_assembly_qc` | 2 | 0 | 1 | 1 | 90 seconds | 16,000 | 4,000 | 1 |
| `premise_expansion`, `story_architecture` | 3 | 0 | 1 | 1 | 150 seconds | 24,000 | 6,000 | 1 |
| `full_story`, `season_qc` | 4 | 0 | 1 | 1 | 180 seconds | 32,000 | 8,000 | 1 |

Estimated maximum cost is calculated at admission from the selected model's
current authoritative price and the table above; it is not a hard-coded stale
currency amount. One logical attempt permits no more than two billable model
calls: the initial call plus either one structural-repair call or one
model-backed legacy fallback. Those paths share the remaining call slot. A
deterministic no-model validator/fallback is free. Shadow may run the legacy
call plus one platform-owned Agent comparison, never two tenant-billed calls.
Any future nonzero tool or specialist-agent budget requires a separately
registered read-only capability and a review of this table.

Enforcement is layered:

- Node rejects missing, negative, incompatible, or above-platform budgets and
  reserves the Section 03 upper bound before the first billable call.
- The shared backpressure controller enforces per-tenant and per-run
  concurrency before dispatch; queue redelivery reuses the durable attempt
  instead of acquiring a second logical budget.
- Python applies `maxTurns`, tool-call caps, allowed-agent/handoff limits,
  wall-clock timeout/cancellation, output type/size, and refs-only checkpoint
  limits at Runner/tool boundaries.
- Node reconciles reported turns/tokens/tool calls/wall clock and rejects a
  response whose usage exceeds the admitted budget even if the SDK returned
  `completed`.
- Budget exhaustion maps once to `awaiting_action` or `retryable_failed` with a
  stable next action. It does not recurse, widen limits automatically, truncate
  into a ready result, or start an unaccounted fallback.
- Deterministic checks and exact replay are zero user cost. Shadow calls use a
  platform-owned shadow budget or recorded fixtures. Active and fallback model
  calls follow the Section 03 billing owner and independently reconcile known
  or unknown usage.

## Security and tenant boundary

- Require explicit tenant and user identity from the authenticated Node
  boundary. Never infer tenant, owner, or rights from story text, a draft, a
  provider response, or an asset URL.
- Scope context, source, evidence, manifest, attempt, trace, checkpoint,
  candidate, and billing references to the same tenant/user/domain owner on
  both sides of the HTTP seam.
- Treat story text, prompts, retrieved pages, uploads, OCR, subtitles,
  transcripts, provider responses, and media metadata as prompt-injection-
  capable untrusted data. Send the minimum bounded fields, label trust level,
  and accept only server-issued evidence/asset/claim IDs in output.
- Do not pass provider or signed URLs as ownership evidence. Resolve managed
  media in Node through tenant-scoped storage and pass authorized references;
  Agents cannot fetch arbitrary URLs, follow redirects, access internal
  addresses, or convert a URL into a durable asset.
- Keep production hosted capabilities disabled for web search, file search,
  computer use, code interpreter, image/audio/video generation, remote MCP, and
  shell unless a later separately reviewed manifest explicitly adds one.
- Internal Python routes remain token-authenticated and verify platform request,
  tenant, surface, attribution, manifest, attempt, model, and idempotency
  headers/body identity.
- Side-effect authorization is one-time, tenant-bound, hash-bound, expiring,
  and repeated at the Node final boundary. Agent Runtime completion cannot mint
  or consume provider/media authorization.
- Trace/checkpoint persistence is refs-only and redacted. Raw SDK session state,
  raw prompts/output, secrets, JWTs, cookies, signed URLs, private evidence, and
  unrestricted document fragments must not be stored or exported.
- Contract/guardrail/security failures return stable user-safe codes; raw
  validation details and private input are restricted to tenant-safe operator
  diagnostics.

## Trace, event, checkpoint, and observability contract

Use the existing trace/event/checkpoint pipeline. Do not add another log or
event authority.

Every run and fallback records the durable execution ID, logical attempt ID,
runtime request ID, idempotency key, trace/parent trace ID, context fingerprint,
domain and mapped task, mapping/schema versions, manifest hash, selected mode,
fallback reason, call ordinal, provider call ID when present, budget profile,
redacted usage/cost ownership, final disposition, and stable error code.

Event IDs remain deterministic and duplicate persistence is an idempotent
no-op. Sequence and attempt identity mismatches fail rather than being merged.
Checkpoint resume accepts platform references only, revalidates tenant,
attempt, manifest, context currentness, budget remainder, and kill-switch state,
and never resumes raw SDK state for the production assurance surface.

Trace payloads run through both Python and Node redaction before persistence.
Add explicit tests that story text, prompt text, evidence excerpts, managed and
signed URLs, tokens, cookies, API keys, raw model output, and private document
fragments are absent while correlation, mapping, fallback, and numeric usage
metadata remain available.

Section 09 will publish metrics and alerts from these stable fields. This
section must at least emit enough data to distinguish runtime availability,
manifest rejection, schema/guardrail rejection, deterministic fallback,
shadow comparison, budget exhaustion, provider/usage uncertainty, and Node
final-gate rejection.

## Feature flags and selection precedence

Consume the following tenant flags registered by Section 01. Verify their
authoritative shared registry, allowlist, defaults, serializer/projection, and
focused tests; do not register duplicate aliases. All are `false` by default:

- `verticalDramaAssuranceShadow` enables read-only Agent comparison for mapped
  task families but never changes the caller-visible legacy result.
- `verticalDramaDraftQcOrchestraActive` enables active Agent proposals for
  Draft QC and Draft repair canary tasks only.
- `verticalDramaPromptQcOrchestraActive` enables the fingerprinted prompt/media
  assurance family only after Section 07 and prompt/media canary gates pass.
- `verticalDramaStoryAssuranceActive` enables premise, architecture, full story,
  and season-review adapters only after Feature 152/153 parity proof.
- `verticalDramaAssuranceKillSwitch` disables every new Vertical Drama Agent
  dispatch/resume while preserving deterministic editing and accepted ledger
  data.

The existing generic `openAiAgentsRuntimeEnabled`,
`openAiAgentsRuntimeSkillShadow`, `openAiAgentsRuntimeSkillActive`, and
`openAiAgentsRuntimeForceRollback` remain lower-level prerequisites/overrides.
Precedence is deterministic:

1. Domain kill switch or generic force rollback stops new Agent work.
2. An already admitted attempt keeps its frozen selection unless a kill switch
   fences a future dispatch/resume.
3. A task-family active flag can select active only when the generic master and
   shared-skill active flags also permit active mode.
4. Domain shadow can select shadow only when the generic master and shared-skill
   shadow flags permit it and no active flag applies.
5. Every other case selects legacy.

Client input, queue payloads, and Python responses cannot escalate mode. A
feature-flag store error selects the safe legacy path for advisory work and
cannot weaken a paid/export final gate. Section 09 owns cohort configuration,
production enablement, dashboards, and runbook operations; this section owns
the key names, defaults, resolver semantics, frozen snapshot, and kill-switch
tests.

## TDD implementation sequence

### 1. Freeze cross-runtime contract tests

Before changing runtime behavior, add the shared golden fixture and make both
runtimes parse it. Extend:

- `apps/web/shared/agentRuntime/__tests__/assurance.test.ts`;
- `apps/web/server/services/agentRuntime/__tests__/client.assurance.test.ts`;
- `python-backend/tests/unit/test_agent_output_assurance.py`;
- `python-backend/tests/unit/test_openai_agents_contracts.py`;
- `python-backend/tests/api/test_internal_openai_agents_runtime.py`.

The red tests must prove canonical JSON/hash parity; current/current-minus-one
version compatibility; task, mapping, manifest, tenant, attempt, context,
side-effect, output-schema, and budget echo; rejection of unknown task/schema,
tenant mismatch, stale/mismatched identity, incompatible versions, and omitted
assurance results. Health fixtures must prove that an exact advertised schema
is accepted and an omitted/unknown schema blocks dispatch. A Python `provider_ready` fixture must still fail the Node
domain final gate when required mode, source/rights, credit authorization, or
context currentness is absent.

Use explicit test names such as
`uses durable request and idempotency identities for assured skill execution`,
`rejects a response whose structured output echoes a different context`,
`does not promote Python provider_ready to domain readiness`,
`test_vertical_drama_golden_fixture_hash_matches_node`, and
`test_unknown_vertical_drama_schema_is_rejected_before_adapter_run`.

### 2. Add structured-output and guardrail tests

Add `python-backend/tests/unit/test_openai_agents_orchestra.py` and
`python-backend/tests/unit/test_openai_agents_vertical_drama_outputs.py`, and
extend `python-backend/tests/unit/test_openai_agents_adapter.py` to prove that a
trusted schema reference resolves to the expected Pydantic `output_type`, an
unknown or task-mismatched schema is rejected before Runner invocation, and
malformed, oversized, truncated, immutable-field, unknown-reference, and
prompt-injection outputs trip the correct bounded layer.

The tests must distinguish output guardrail coverage from tool/handoff
guardrails and prove that no hosted capability, DB/storage/provider/credit/url
tool, raw checkpoint payload, sensitive trace capture, or external trace export
is enabled for a Vertical Drama assurance request. A valid structured proposal
must round-trip to Node and still require deterministic domain validation.

Name the Python cases around the public contract:
`test_resolve_vertical_drama_output_type_by_versioned_schema_ref`,
`test_task_schema_mismatch_fails_before_runner`,
`test_vertical_drama_agent_receives_output_type_and_zero_tools`,
`test_output_guardrail_rejects_unknown_server_reference`, and
`test_valid_structured_output_still_requires_node_domain_gate`.

### 3. Add runtime-mode and fallback tests

Add
`apps/web/server/services/__tests__/verticalDramaAssuranceAdapter.agentRuntime.test.ts`
and extend:

- `apps/web/server/services/__tests__/skillRuntimeOpenAiAgents.test.ts`;
- `apps/web/server/services/__tests__/agentRuntimeSelection.test.ts`;
- `apps/web/server/services/agentRuntime/__tests__/orchestraFinalGate.test.ts`;
- `apps/web/server/services/agentRuntime/__tests__/orchestraEventReplay.test.ts`.

Cover legacy once-only execution, shadow legacy visibility, active structured
proposal, manifest missing/incompatible, SDK missing, timeout, gateway failure,
schema-invalid output, recursion ceiling, tool denial, context drift,
checkpoint interruption/resume, durable recovered result, kill switch, and
feature-store failure. For each condition assert effective mode, stable code,
next action, fallback call count, final-boundary behavior, and preservation of
the prior valid baseline.

Explicitly prove that shadow never charges the tenant, never writes a domain
side effect, and never counts as provider evidence; active advisory fallback
runs no more than once; contract/security failures do not model-fallback; an
unknown paid/provider outcome enters reconciliation without retry; and queue or
HTTP redelivery does not run legacy, Agent, or provider work twice.

The adapter test file must include separately named cases for `legacy`,
`shadow`, `active`, `active advisory fallback`, `active final-boundary wait`,
`kill-switch resume denial`, and `usage unknown reconciliation`; do not combine
them into one parameterized assertion that obscures call counts or billing
ownership.

### 4. Add budget, usage, and backpressure tests

Extend the shared assurance/budget tests, Node backpressure tests, Python
adapter tests, and Section 03 fake billing/provider fixtures. Test every budget
dimension at the boundary and one step beyond it: turns, tool calls, parallel
agents, depth/recursion, wall clock, input tokens, output tokens, repair rounds,
concurrency, and estimated cost.

Assert rejection before spend where possible; cooperative timeout/cancellation;
lease release after failure; stable budget-exhausted projection; no silent
limit widening or truncation; separate Agent/fallback provider call IDs; exact
known usage charging; pending reconciliation for unknown usage; platform-owned
shadow cost; and zero user cost for deterministic validation/replay.

### 5. Add redaction, trace, checkpoint, and security tests

Extend:

- `apps/web/server/services/__tests__/agentRuntimeRequestBuilder.test.ts`;
- extend the existing
  `apps/web/server/services/__tests__/agentRuntimeTraceService.test.ts`,
  `agentRuntimeRedaction.test.ts`, `agentRuntimeCheckpointService.test.ts`, and
  `agentRuntimeBackpressure.test.ts` files rather than creating duplicate test
  locations;
- extend `apps/web/shared/featureFlags.test.ts` and
  `apps/web/server/services/__tests__/agentRuntimeSelection.test.ts` for flag
  defaults, precedence, frozen selection, feature-store failure, and kill
  switch behavior;
- `python-backend/tests/unit/test_openai_agents_trace_redaction.py`;
- `python-backend/tests/security/test_openai_agents_subagent_security.py`;
- `python-backend/tests/api/test_internal_openai_agents_runtime.py`.

Use synthetic injection fixtures containing instruction-like story/evidence,
arbitrary and internal URLs, signed query strings, JWT/API-key/cookie values,
cross-tenant IDs, oversized evidence, and duplicate/out-of-order events. Prove
fail-closed tenant and capability behavior, refs-only checkpoints, stable
correlation IDs across errors/fallback, idempotent event deduplication, and
absence of private content from persisted trace payloads.

### 6. Implement the minimal runtime changes and rerun regressions

Only after the tests above fail for the intended reason, implement shared
fixture/adapter parity, trusted output-type resolution, budget enforcement,
adapter-owned fallback, trace metadata, and feature-flag selection. Keep
changes additive and rerun existing request builder, client, runtime selection, shared skill runtime,
final gate, replay, Python contracts, adapter, internal API, native-skill,
stream/resume, and trace-redaction suites to detect Feature 151 regressions.

## Migration and compatibility contract

This section has **no database migration or backfill**. Sections 02 and 03 own
durable attempt/call schema changes. The runtime integration stores only the
references and metadata those sections already require. Do not add an Agent-
specific content table, Python-owned ledger, or raw-output column.

There is also no initial Node/Python wire-version migration. Compatibility is
preserved as follows:

- existing Agent Runtime callers omit the new optional
  `ExecuteSharedSkillRuntimeInput` fields and retain generated request IDs,
  current selection, free-form output behavior, and current flags;
- Feature 157 sends the existing assurance shape, a complete versioned
  `outputContract.schemaRef`, existing budget fields, and bounded refs/scalars
  in `planContext`; Python health advertises exact supported schema refs, and
  an older deployment that omits that list is rejected before active/shadow
  dispatch. The Node adapter degrades safely rather than sending a structured
  request to a free-form worker;
- Python emits existing `AgentRuntimeResponse` fields. Feature 157-specific
  usage/correlation metadata lives under `traceMetadata` and is parsed by a
  strict adapter-local schema; unknown additive metadata remains ignorable to
  legacy callers;
- all domain active flags remain off until both deployed sides pass the golden
  fixture and health/canary checks. Shadow is the first live mode;
- if implementation proves a generic wire field is unavoidable, create a
  follow-up coordinated change that increments the relevant current version on
  TypeScript and Python, keeps the previous minimum-compatible version, extends
  `/health` capability reporting, and gates sending the new field on worker
  support. Do not fold that migration into this section implicitly.

Mixed deployment therefore fails toward legacy/advisory fallback and final-
boundary waiting. It must never reinterpret a missing structured-output
capability as a valid free-form result.

## Verification commands and evidence boundary

Run the focused Node/shared suites from the repository root:

```bash
npm --workspace apps/web test -- apps/web/shared/agentRuntime/__tests__/assurance.test.ts apps/web/shared/__tests__/verticalDramaAssuranceFeatureFlags.test.ts apps/web/server/services/agentRuntime/__tests__/client.assurance.test.ts apps/web/server/services/agentRuntime/__tests__/orchestraFinalGate.test.ts apps/web/server/services/agentRuntime/__tests__/orchestraEventReplay.test.ts apps/web/server/services/__tests__/agentRuntimeRequestBuilder.test.ts apps/web/server/services/__tests__/agentRuntimeSelection.test.ts apps/web/server/services/__tests__/skillRuntimeOpenAiAgents.test.ts apps/web/server/services/__tests__/skillRuntimeOpenAiAgentsReplay.test.ts apps/web/server/services/__tests__/agentRuntimeTraceService.test.ts apps/web/server/services/__tests__/agentRuntimeRedaction.test.ts apps/web/server/services/__tests__/agentRuntimeCheckpointService.test.ts apps/web/server/services/__tests__/agentRuntimeBackpressure.test.ts apps/web/server/services/__tests__/verticalDramaAssuranceAdapter.test.ts apps/web/server/services/__tests__/verticalDramaAssuranceAdapter.agentRuntime.test.ts
```

Run the Python contract/runtime/security suites from `python-backend`:

```bash
pytest tests/unit/test_agent_output_assurance.py tests/unit/test_openai_agents_contracts.py tests/unit/test_openai_agents_orchestra.py tests/unit/test_openai_agents_vertical_drama_outputs.py tests/unit/test_openai_agents_adapter.py tests/unit/test_openai_agents_stream_resume.py tests/unit/test_openai_agents_trace_redaction.py tests/security/test_openai_agents_subagent_security.py tests/api/test_internal_openai_agents_runtime.py
```

Run focused Python static/format validation from `python-backend`:

```bash
python3 -m ruff check app/services/openai_agents_vertical_drama_outputs.py app/services/openai_agents_orchestra.py app/services/openai_agents_adapter.py app/services/openai_agents_trace.py tests/unit/test_openai_agents_orchestra.py tests/unit/test_openai_agents_vertical_drama_outputs.py
```

```bash
python3 -m black --check app/services/openai_agents_vertical_drama_outputs.py app/services/openai_agents_orchestra.py app/services/openai_agents_adapter.py app/services/openai_agents_trace.py tests/unit/test_openai_agents_orchestra.py tests/unit/test_openai_agents_vertical_drama_outputs.py
```

Run the existing broad web diagnostic separately from the focused proof because
this checkout may be baseline-noisy/OOM:

```bash
npm --workspace apps/web run check
```

Finish from the repository root:

```bash
git diff --check -- specs/feature/157-vertical-drama-assurance-production-activation-qc-convergence apps/web/shared/agentRuntime apps/web/shared/verticalDramaSeries apps/web/shared/featureFlags.ts apps/web/server/services/agentRuntime apps/web/server/services/verticalDramaAssuranceAdapter.ts python-backend/app/services/openai_agents_vertical_drama_outputs.py python-backend/app/services/openai_agents_orchestra.py python-backend/app/services/openai_agents_adapter.py python-backend/app/services/openai_agents_trace.py python-backend/tests
```

If pytest's repository-wide coverage threshold makes the focused selection fail
despite the selected tests passing, report that threshold result separately and
rerun using the repository's established focused-test coverage override; do not
misreport it as functional proof or silently disable coverage in committed
configuration.

Local mocked tests prove contracts, deterministic policy, and regression
behavior only. They do not prove an authenticated browser flow, deployed
Node-to-Python network path, installed SDK compatibility, real model structured
output, provider usage/cost, credit ledger behavior, worker restart, migration,
staging kill switch, or production canary. Section 10 must record those evidence
classes separately.

## Rollout, rollback, and safe commit boundary

Deliver this section with every new flag disabled. First deploy contract parity,
trusted structured-output support, redaction, budget enforcement, and mode
metadata. Then allow platform-owned shadow comparison for a selected internal
cohort. Active Draft QC flags remain disabled until Sections 04, 09, and 10
have supplied durable recovery, security/operations, and canary proof. Prompt,
media, story, and season flags additionally remain disabled until Section 07
has integrated their call sites and passed its adapter contracts.

Promotion order is fixed: deployed health/schema capability → fixture-backed
shadow → live platform-paid shadow → allowlisted Draft QC active canary →
prompt/media canary → story/season canary. Each step requires zero tenant
charges/domain writes from shadow, zero identity/tenant/redaction violations,
zero invalid activations or duplicate physical effects, 100% durable terminal
or actionable waiting outcomes in the selected synthetic/canary set, and no
unexplained accepted-result drift. A passing legacy fallback proves UX
continuity only; it does not satisfy Agent-path promotion evidence.

Rollback sets `verticalDramaAssuranceKillSwitch` or the generic force-rollback
signal, prevents future Agent dispatch/resume, and returns advisory work to the
supported deterministic path. It must preserve accepted candidate/ledger data,
attempt events, trace references, reservations, and uncertain provider records;
it must not delete history, silently revert a user draft, auto-refund unknown
usage, or resubmit a possibly accepted provider task.

The safe commit boundary includes only the additive shared runtime input hooks,
the Vertical Drama runtime adapter/mapping, Python output-registry/Orchestra/
adapter/trace additions, existing flag selection semantics/tests, the shared
synthetic fixture, and focused tests. Do not include Section 07 domain call-site rollout,
Section 08 UI changes, Section 09 production cohort/runbook changes, migrations,
or unrelated formatting.

## Acceptance criteria

- Node and Python accept the same canonical fixture, produce the same assurance
  hash, support the same version range, and reject task/schema/manifest/tenant/
  attempt/context/side-effect drift with stable codes.
- Every mapped Vertical Drama task has exactly one trusted shared runtime kind,
  capability manifest, output schema/version, required mode, explicit budget
  profile, and deterministic post-validator.
- Python uses a trusted structured `output_type` and bounded guardrails; Node
  independently validates structure and domain semantics and remains the sole
  final-gate/CAS authority.
- Python runtime `provider_ready` cannot by itself activate a candidate, submit
  paid work, export, or publish.
- Legacy executes once; shadow returns legacy once and has no tenant credit or
  domain side effect; active returns only a validated structured proposal;
  allowed active failure falls back at most once; security/contract failure and
  paid-side-effect uncertainty never blind-fallback or resubmit.
- Editing, saving, inspection, and deterministic preview remain usable during
  manifest/runtime/model outages. Final boundaries return a durable terminal or
  actionable waiting state rather than an infinite spinner or raw exception.
- Turn, tool, parallelism, recursion/depth, wall-clock, input/output token,
  repair, concurrency, and cost budgets are explicit, enforced, observable, and
  cannot be widened by Agent, Python response, queue payload, or client input.
- Agent, fallback, shadow, and deterministic calls have correct separate usage
  and billing ownership; duplicate delivery creates no duplicate user credit or
  provider side effect, and unknown outcomes enter reconciliation.
- Agents cannot access arbitrary DB, storage, shell, URL, provider, credit,
  media-generation, publication, or hosted SDK capabilities. Tenant identity
  and managed references are verified at both runtime boundaries.
- Trace and checkpoint data contain stable execution/attempt/context/mapping/
  fallback/budget correlation but no private story, prompt, evidence, media URL,
  signed URL, token, credential, or raw SDK session content.
- All domain flags default off, active requires both generic and task-family
  permission, mode cannot be escalated by callers, and the kill switch stops
  future Agent work without destroying accepted or reconciling state.
- Focused Node and Python suites, cross-runtime fixture checks, changed-file
  diagnostics, and whitespace validation pass. Browser, deployment, provider,
  migration, and production-canary evidence remain explicitly pending for
  Section 10 unless they are separately executed and recorded.

## UI/UX Contract

### Target User / JTBD

Creators experience one predictable flow whether the Agent is active, shadowed, unavailable, or rolled back; operators inspect reasons without sensitive traces.

### Surface Inventory

Existing generation/QC progress, result, retry, and error surfaces consume the runtime projection. Agent mode is not a creator-facing choice.

### Component Map

The runtime adapter maps to Section 01 state/error/action contracts and Section 08 components; legacy fallback remains the compatibility renderer.

### State Matrix

Runtime `provider_ready` is not domain `provider_ready`. Schema refusal, timeout, budget exhaustion, or outage becomes typed fallback/retry, never unexplained success.

### Responsive Matrix

Progress, fallback explanation, and next action wrap at 390x844, 768x1024, and 1440x900; trace IDs never force overflow.

### Accessibility Acceptance

Mode/fallback changes are announced, retry is keyboard reachable, and sensitive runtime evidence is hidden from creator responses.

### Copy Contract

Thai/English copy says what completed, what was retried, and what is next; it never promotes a runtime field to domain readiness.

### Browser Evidence Required

Section 10 proves legacy, shadow, active, schema refusal, timeout, kill-switch, and runtime recovery with the same user-visible contract.

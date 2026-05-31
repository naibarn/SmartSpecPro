# Feature 101 Rollout, Replay, And Release Gates

## Scope

Feature 101 introduces the OpenAI Agents SDK as the shared orchestration boundary for:

- Chat
- Team
- Responses
- shared skill execution
- Media Studio prompt/custom-skill execution only

Round one explicitly excludes the actual media generation pipeline. Media Studio participates only through the shared skill/prompt execution path.

## Dependency Pin

The exact SDK pin lives in:

- `python-backend/requirements.txt`

Current pin:

- `openai-agents==0.17.4`

Compatibility note:

- `agency-swarm==1.8.0` still pins `openai-agents==0.9.3` upstream. A clean full
  `python-backend/requirements.txt` resolution requires isolating, upgrading, or
  replacing the Agency Swarm dependency before deployment.

Rules:

- do not add `openai-agents` to any Node package manifest
- do not use open-ended lower bounds for the SDK pin
- do not allow the Python adapter to drift silently across a rolling deploy

There is no separate lockfile for this dependency path in Feature 101. The requirements file is the source of truth. If the deployment image later introduces a lock/constraints file, regenerate it there as part of the upgrade flow.

Recommended update command after editing the pin:

```bash
uv pip install -r python-backend/requirements.txt
```

## Compatibility Model

Feature 101 uses explicit runtime contract versions:

- runtime contract
- trace schema
- checkpoint schema

Supported rolling window:

- `current`
- `current - 1`

Mixed-deploy compatibility must work for both directions:

- Node current / Python current-1
- Node current-1 / Python current

If a request or response advertises a future unsupported contract version, fail closed with a structured version error. Do not partially execute.

## SDK Upgrade Gate

Every SDK bump must pass the following gate in order:

1. update the exact Python dependency pin in `python-backend/requirements.txt`
2. confirm whether contract versions must change
3. run Python adapter tests
4. run Node contract/runtime tests
5. run Chat replay and runtime tests
6. run Team replay and runtime tests
7. run Responses and structured-output runtime tests
8. run shared skill replay and runtime tests
9. run Media Studio prompt/custom-skill tests through the shared skill path
10. validate mixed-deploy compatibility
11. run shadow parity checks
12. validate rollback for new work

## Required Test Commands

### Python adapter and contract suite

```bash
uv run pytest \
  python-backend/tests/unit/test_openai_agents_import_boundary.py \
  python-backend/tests/unit/test_openai_agents_contracts.py \
  python-backend/tests/unit/test_openai_agents_adapter.py \
  python-backend/tests/unit/test_openai_agents_gateway_model.py \
  python-backend/tests/unit/test_openai_agents_trace_redaction.py \
  python-backend/tests/unit/test_openai_agents_stream_resume.py
```

### TypeScript runtime suite

```bash
npm --prefix apps/web test -- \
  server/services/__tests__/agentRuntimeSelection.test.ts \
  server/services/__tests__/agentRuntimeClient.test.ts \
  server/services/__tests__/chatOpenAiAgentsRuntime.test.ts \
  server/services/__tests__/chatOpenAiAgentsReplay.test.ts \
  server/services/__tests__/teamOpenAiAgentsRuntime.test.ts \
  server/services/__tests__/teamOpenAiAgentsReplay.test.ts \
  server/services/__tests__/responsesOpenAiAgentsRuntime.test.ts \
  server/services/__tests__/responsesOpenAiAgentsReplay.test.ts \
  server/services/__tests__/callLLMStructuredOpenAiAgents.test.ts \
  server/services/__tests__/skillRuntimeOpenAiAgents.test.ts \
  server/services/__tests__/skillRuntimeOpenAiAgentsReplay.test.ts \
  server/services/__tests__/teamOpenAiAgentsAttemptBudget.test.ts \
  server/services/__tests__/teamOpenAiAgentsPlanAndReview.test.ts \
  server/services/__tests__/openAiAgentsRolloutDoc.test.ts
```

### Replay comparison command

```bash
uv run pytest \
  python-backend/tests/unit/test_openai_agents_contracts.py \
  python-backend/tests/unit/test_openai_agents_stream_resume.py \
  python-backend/tests/unit/test_openai_agents_import_boundary.py && \
npm --prefix apps/web test -- \
  server/services/__tests__/chatOpenAiAgentsReplay.test.ts \
  server/services/__tests__/teamOpenAiAgentsReplay.test.ts \
  server/services/__tests__/responsesOpenAiAgentsReplay.test.ts \
  server/services/__tests__/skillRuntimeOpenAiAgentsReplay.test.ts \
  server/services/__tests__/callLLMStructuredOpenAiAgents.test.ts \
  server/services/__tests__/agentRuntimeSelection.test.ts
```

## Rollout Phases

### Phase 0: Adapter introduced

- SDK dependency pinned exactly
- Node and Python contract tests pass
- runtime still remains legacy-visible by default

### Phase 1: Chat shadow

- Chat SDK runtime runs in shadow
- visible Chat output remains legacy
- no user-visible side effects from the SDK path

### Phase 2: Team shadow

- Team SDK runtime evaluates plan, step, review, and repair behavior in shadow where safe
- no duplicate external writes
- plan and evidence traces are recorded for comparison

### Phase 3: Responses and shared skill shadow

- Responses structured output runs in shadow
- shared skill runtime runs in shadow
- Media Studio prompt/custom-skill calls are included here through the shared skill path
- real media generation APIs remain out of scope

### Phase 4: Controlled active cohort

- enable active mode for a small cohort per surface
- monitor drift, latency, schema failures, review failures, and completion gates

### Phase 5: Broader adoption

- expand only after replay and rollout gates are green

## Rollback Procedure

Rollback is a forward-only feature flag action:

1. set `openAiAgentsRuntimeForceRollback=true` or disable the active surface flag
2. keep already persisted SDK traces intact
3. route new work to legacy only
4. do not rewrite previous runtime history

Rollback must not require a database rollback.

## Rollback Validation

Rollback validation must prove that:

- Chat new work returns to legacy immediately
- Team new work returns to legacy immediately
- Responses new work returns to legacy immediately
- shared skill new work returns to legacy immediately
- Media Studio prompt/custom-skill calls return to the shared skill legacy path
- existing persisted SDK traces remain readable after rollback
- frozen SDK work does not silently become legacy mid-flight
- frozen legacy work does not silently become SDK mid-flight

## Promotion Checklist

- exact SDK pin updated and committed
- adapter contract tests pass
- gateway/model compatibility tests pass
- trace redaction tests pass
- stream/resume/cancel tests pass
- Chat replay tests pass
- Team replay tests pass
- Responses replay tests pass
- shared skill replay tests pass
- Media Studio shared-skill tests pass
- mixed-deploy `current/current-1` validation passes
- shadow parity thresholds pass
- rollback flag is verified for new work

## Operator Recovery Playbook

| Scenario | Visible symptoms | Inspect | Safe immediate action | Permitted recovery | Escalation owner |
|---|---|---|---|---|---|
| Adapter unavailable or timed out | runtime errors, no SDK response, request stalls | adapter logs, Node runtime client error code, Python adapter health | force rollback new work to legacy | restart adapter, verify gateway credentials, retry with shadow only | runtime owner |
| Unsupported contract version during mixed deploy | `unsupported_contract_version` or `adapter_runtime_contract_unsupported` | Node client error, Python validation error, contract version fields | stop active rollout, force rollback | align Node/Python versions, re-run contract tests | runtime owner |
| Plan persisted but step links missing | plan visible, execution evidence panel empty | ledger snapshot, `plan_step` link counts, trace persistence logs | keep run read-only, do not complete | backfill trace/ledger projection, re-run projection worker | persistence/projection owner |
| Team plan review failure requiring repair | plan stopped before execution, review notes visible | plan artifact, reviewer verdict, review notes | do not advance step, keep failure explicit | fix planner/reviewer config, rerun plan review | Team runtime owner |
| Repeated schema-invalid output | structured output keeps failing validation | schema error logs, runtime trace, replay comparison | force rollback surface, preserve evidence | tighten schema, fix adapter response normalization, rerun replay | adapter owner |
| Stuck Team step in `in_progress` or `in_review` | no new step advancement, run appears frozen | current step, attempt count, checkpoint, terminal reason | pause advancement, keep current state | recover via checkpoint/resume or repair loop | Team runtime owner |
| Duplicate or missing stream events | duplicate message, missing trace event | trace event ids, dedupe counters, stream logs | stop promotion until trace shape stabilizes | fix idempotency keys / event dedupe | persistence/projection owner |
| Missing or invalid manifest | skill or step not eligible, manifest diagnostics present | manifest registry, capability checks, selection reason | fall back to legacy for new work | repair manifest, rerun validation suite | skill manifest owner |
| Media Studio prompt/custom-skill failure | prompt enhancement/custom skill execution fails while media pipeline stays untouched | shared-skill logs, manifest checks, runtime selection | keep Media Studio prompt execution on legacy | fix skill manifest/runtime selection and rerun shared-skill tests | Media Studio prompt-skill owner |

## Implementation And Manifest Ownership Matrix

| Area | Owner |
|---|---|
| runtime contract and shared adapter boundary | runtime contract owner |
| Python OpenAI Agents adapter | Python adapter owner |
| persistence and projections | persistence/projection owner |
| Team UI and ledger surfaces | Team UI/ledger owner |
| skill capability manifests | skill manifest schema/registry owner |
| Media Studio prompt/custom-skill manifests | Media Studio prompt-skill manifest owner |
| rollout, replay, and release gating | rollout/replay/runbook owner |

## Notes For Operators

- Chat and Team preserve persona/member routing from Node-side context resolution.
- Responses schema-required output must fail closed; no silent prose fallback is allowed in active mode.
- Media Studio uses the shared skill path only for prompt enhancement and custom skill execution in this feature.
- A frozen request must not switch runtime mid-flight if flags change.

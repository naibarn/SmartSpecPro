# TDD Plan: Feature 101 OpenAI Agents SDK Chat And Team Orchestration

Date: 2026-04-20

This TDD plan mirrors `claude-plan.md`. Tests should be written before or alongside the implementation for each section.

Existing project conventions:

- Node/TypeScript: Vitest-style tests under `apps/web/server/**/__tests__`, `apps/web/shared/__tests__`, and `apps/web/drizzle/__tests__`.
- Schema: exact table/column/index assertions.
- Python: pytest unit tests under `python-backend/tests/unit/**` using monkeypatch/patch-style isolation.
- Contract fixtures: shared JSON fixtures should be used by both TypeScript and Python where DTO compatibility matters.

## 1. What We Are Building

Tests:

- Test that the new runtime can be fully disabled and current legacy paths still work.
- Test that enabling SDK runtime flags does not change behavior unless the relevant per-surface active or shadow flag is also enabled.
- Test that Chat, Team, Responses, and shared skill runtime use the same runtime DTO fixture shape.

## 2. Architectural Shape

Tests:

- Test that Node never imports the OpenAI Agents SDK package.
- Test that only the approved Python adapter imports `agents`, with `agency_swarm_adapter.py` as the temporary agency-only exception.
- Test that adapter responses cannot be persisted if they fail DTO validation.
- Test that Node rejects adapter-selected tools/skills/agents outside the original allowed envelope.

## 3. Implementation Phases

Tests:

- Add one high-level integration smoke test per phase as the phase is implemented.
- For each phase, verify feature flags keep the phase inert until enabled.
- Verify phase rollback does not require schema rollback.

## 4. Runtime DTO Contract

TypeScript tests:

- Test `AgentRuntimeRequest` fixture parses as a valid Chat request.
- Test `AgentRuntimeRequest` fixture parses as a valid Team step request.
- Test `AgentRuntimeRequest` fixture parses as a valid Media Studio shared-skill request with `originSurface = media_studio`.
- Test malformed envelope fixture is rejected.
- Test streamed duplicate event fixture preserves idempotency keys and sequence data.
- Test `ReviewVerdict` accepts only `pass`, `fail`, `needs_repair`, and `blocked`.
- Test current and `current - 1` contract versions are accepted.
- Test future unsupported contract version is rejected.
- Test valid step-link fixture accepts `plan_step`, `owner_result`, and `review_result`.

Python tests:

- Test the same JSON fixtures validate against Pydantic models.
- Test Python rejects missing tenant id, missing idempotency key, missing model config, and missing execution envelope.
- Test Python rejects unknown review verdict statuses.
- Test Python emits stable validation errors without including secret payloads.

## 5. Feature Flag and Runtime Selection Design

Tests:

- Test all ten OpenAI Agents runtime flags exist in `TenantFeatureFlags`.
- Test all ten flags exist in `ALLOWED_FEATURE_FLAGS`.
- Test all ten flags exist in `FEATURE_FLAG_DEFAULTS`.
- Test every new flag defaults to `false`.
- Test force rollback has highest precedence.
- Test a frozen Team run remains legacy after active flags are enabled.
- Test a frozen SDK Team run remains SDK after rollback is toggled, unless the run is explicitly stopped.
- Test shadow flags select shadow mode but not active mode.
- Test active flags select SDK active only when master enablement is on.

## 6. Persistence and Migration Plan

Schema tests:

- Test `team_runs` has runtime hot columns and `runtimeStateJson`.
- Test `agent_runtime_traces` exists with tenant/run/trace/event/idempotency fields.
- Test `agent_runtime_traces` has uniqueness on tenant + idempotency and tenant + run + sequence.
- Test `agent_runtime_checkpoints` exists with checkpoint/resume/approval fields.
- Test migrations are additive and do not make legacy runtime columns non-null for historical rows.
- Test old Team run rows with null runtime metadata map to `legacy runtime`.

Service tests:

- Test runtime trace persistence redacts forbidden keys.
- Test duplicate runtime events do not create duplicate trace rows.
- Test generic checkpoint creation requires tenant, surface, checkpoint id, and idempotency key.
- Test Team work-backed approval uses existing work approval/checkpoint persistence rather than generic checkpoint storage.

## 7. Python Adapter Plan

Adapter DTO tests:

- Test `run` rejects missing or expired execution envelope.
- Test `run` rejects tools outside `allowedTools`.
- Test `run` rejects skills outside `allowedSkills`.
- Test `run` returns SDK version and adapter version.

Gateway model tests:

- Test SDK model client uses gateway `base_url`.
- Test SDK model client uses platform attribution token, not provider API key.
- Test direct provider base URLs are rejected for production runtime surfaces.
- Test model id comes from Node-provided model config.

Agent/tool/handoff tests:

- Test only envelope-allowed tools become SDK tools.
- Test only envelope-allowed handoff targets are registered.
- Test handoff scope is intersection, not union.
- Test mutating tool without approval requirement is rejected.

Trace tests:

- Test sensitive SDK trace capture is disabled by default.
- Test external SDK trace export is disabled by default in production mode.
- Test custom trace processor emits redacted platform events.
- Test trace output contains no raw JWT, bearer token, provider key, signed URL, cookie, or OAuth token.

Stream/resume/cancel tests:

- Test streamed events include surface, run id, step id, attempt id, sequence, and idempotency key.
- Test duplicate streamed events normalize to the same platform event id.
- Test resume references original checkpoint and creates linked attempt metadata.
- Test cancel returns structured cancelled status and redacted metadata.

## 8. Node Runtime Client Plan

Client tests:

- Test client calls the internal Python service boundary with the normalized runtime request.
- Test client includes platform request id, tenant id, surface, signed envelope, and gateway model config.
- Test client includes origin surface, entry point, and contract/schema versions for Media Studio prompt/custom-skill calls.
- Test client does not expose an endpoint callable by the frontend directly.
- Test client validates adapter response shape before persistence.
- Test client rejects selected skill/tool/agent outside the allowed envelope.
- Test structured adapter errors map to platform runtime errors.

Context-engine boundary tests:

- Test request builder calls the Feature 099 shared context-pack builder before SDK runtime invocation.
- Test request includes context pack ref, budget slot metadata, trust labels, freshness labels, and source refs.
- Test Python adapter request does not contain direct memory-store access instructions.
- Test SDK runtime result returns candidate evidence/artifact refs and does not write durable memory directly.
- Test post-run rolling summary/promotion/pruning is delegated back through the context engine lifecycle.
- Test SDK active mode fails closed when context pack construction fails and does not build an adapter-local memory fallback.

Contract fixture tests:

- Test TypeScript and Python both accept the valid runtime fixtures.
- Test TypeScript and Python both reject malformed envelope and gateway-denied fixtures.
- Test pass, needs-repair, checkpoint, and duplicate stream fixtures round-trip without field loss.

Backpressure tests:

- Test per-tenant runtime concurrency limit blocks excess SDK runs.
- Test per-room Team concurrency limit blocks duplicate active Team SDK runs.
- Test per-user Chat runtime concurrency limit blocks excess Chat SDK work.
- Test transport retry happens only for retryable transport failures with idempotency keys.
- Test denied tools, invalid envelopes, guardrail blocks, and schema-invalid responses do not retry.

Shadow side-effect tests:

- Test mutating tools are suppressed in shadow mode.
- Test connector writes are suppressed in shadow mode.
- Test media generation submissions are suppressed unless sandbox route is configured.
- Test suppressed side effect creates shadow decision trace with `sideEffectSuppressed=true`.
- Test shadow mode does not create duplicate caller-visible surface output.

## 9. Skill Capability Manifest Plan

Manifest schema tests:

- Test manifest requires all minimum fields.
- Test manifest rejects missing negative constraints or missing failure modes for active runtime skills.
- Test manifest rejects invalid surface support.
- Test manifest rejects mutating skill without side-effect class.
- Test manifest rejects connector-dependent skill without required connectors.
- Test manifest rejects missing `ownerTeam`.
- Test manifest rejects missing `ownerCodeownersPath`.
- Test Media Studio prompt skill rejects missing `supportedOriginSurfaces` or `supportedEntryPoints`.

Selection tests:

- Test runtime selection prefers skill with matching task type and required context.
- Test runtime rejects skill when `doNotUseWhen` matches.
- Test negative signals reduce ranking.
- Test required evidence kinds influence ranking.
- Test selected skill explanation includes matching signals, rejected alternatives, and missing evidence.

Coverage tests:

- Test all Chat/Team/Responses/shared-skill runtime-selectable skills have manifests before active mode can be enabled.
- Test Media Studio prompt-enhancement and custom-skill paths have manifests before active shared-skill mode can be enabled for that origin.
- Test missing manifest blocks active mode but can be reported in shadow diagnostics.

## 10. Chat Integration Plan

Shadow tests:

- Test Chat shadow flag runs SDK runtime without changing user-visible output.
- Test Chat shadow writes comparison trace.
- Test Chat shadow captures selected skill/model/gateway route.
- Test Chat shadow suppresses side effects.

Active tests:

- Test Chat active flag uses SDK runtime as source of truth.
- Test Chat active persists message using SDK runtime output.
- Test Chat active still uses Feature 099 context pack builder before runtime call.
- Test Chat memory mode controls flow into context pack builder.
- Test Chat active request carries the resolved active persona snapshot when the conversation has a persona.
- Test Chat active debug/trace metadata records the acting persona id/display label without leaking persona prompt internals.
- Test Chat active approval interruption creates generic runtime checkpoint.
- Test Chat active structured runtime error is surfaced without hidden legacy fallback.
- Test force rollback affects new Chat turns.

Replay tests:

- Replay representative Chat turns and compare selected skill/model/provider/summary.
- Test trace diff reports skill-selection drift.
- Test old Chat turns with no runtime metadata still render safely.

## 11. Team Integration Plan

Plan gate tests:

- Test Team persists plan artifact before first owner execution.
- Test side panel/ledger DTO can render persisted plan before execution trace catch-up.
- Test failed plan review persists verdict and stops/pauses without fallback plan.
- Test plan step owner/reviewer/deliverable/evidence/quality/retry fields are required.

Step execution tests:

- Test owner step request includes locked step definition and step-relevant evidence only.
- Test owner request uses Feature 099 context pack with Team budget profile.
- Test owner request includes the locked owner member/persona ids and roster snapshot.
- Test owner result persists selected skill/model/gateway metadata.
- Test owner result persists owner member/persona identity that matches the plan assignment.
- Test room message metadata links step key, attempt id, trace id, and checkpoint id when present.
- Test selected skill outside envelope fails the step.

Review tests:

- Test reviewer receives deliverable, evidence requirements, quality criteria, checklist, and prior attempts.
- Test reviewer request includes the locked reviewer member/persona ids from the plan assignment.
- Test `pass` verdict advances the serial step only after persistence succeeds.
- Test `needs_repair` persists repair instructions and retries same step.
- Test `blocked` persists checkpoint/approval state and stops advancement.
- Test `fail` terminal path records explicit terminal reason.

Repair loop tests:

- Test repair attempt references prior verdict.
- Test repair attempt increments attempt count and remains on same step.
- Test prior failed evidence remains visible.
- Test retry exhaustion records `step_failed_retry_exhausted` or `review_failed_retry_exhausted`.

Attempt budget tests:

- Test minimum budget reserves one owner and one reviewer attempt per mandatory step.
- Test too-low global cap is rejected or adjusted before execution.
- Test run cannot stop with generic max rounds before touching every mandatory step.
- Test incomplete stop records `plan_incomplete_cap_reached`.

Completion tests:

- Test complete requires every mandatory step owner output and reviewer pass.
- Test final result row is persisted before terminal `plan_completed`.
- Test old `max_rounds_reached` style terminal reason is not used for SDK Team completion.

Replay tests:

- Replay known problematic Team rooms and assert every plan step is attempted.
- Replay repair-loop case and assert pass/fail/repair states are visible in ledger.

## 12. Responses Integration Plan

Shadow tests:

- Test Responses shadow flag runs SDK runtime without changing caller-visible output.
- Test Responses shadow writes comparison trace including schema validation result.
- Test Responses shadow suppresses side effects.

Active tests:

- Test Responses active flag uses SDK runtime as source of truth.
- Test Responses active returns structured runtime error on schema-invalid output.
- Test Responses active still uses Feature 099 context pack builder before runtime call.
- Test Responses active approval interruption creates generic runtime checkpoint.
- Test force rollback affects new Responses requests.

Replay tests:

- Replay representative Responses requests and compare selected skill/model/provider/schema-validity.
- Test old Responses records with no runtime metadata still render safely in debug/admin consumption.

## 13. Shared Skill Runtime Plan

Shadow tests:

- Test shared skill shadow flag runs SDK runtime without changing caller-visible output.
- Test shared skill shadow writes comparison trace including selected skill and schema validation result.
- Test shared skill shadow suppresses mutating side effects.

Active tests:

- Test shared skill active flag uses SDK runtime as source of truth.
- Test shared skill active returns typed output when schema validation passes.
- Test shared skill active fails closed on schema-invalid output.
- Test shared skill active still uses Feature 099 context pack builder before runtime call.
- Test force rollback affects new shared skill requests.
- Test Media Studio `enhancePrompt` routes through shared skill runtime with `originSurface = media_studio`.
- Test Media Studio `executeCustomSkill` preserves prompt/custom-skill caller contract through shared runtime.
- Test real media generation APIs remain out of Feature 101 active routing.

Recursion tests:

- Test recursive skill-to-skill execution stops at configured ceiling.
- Test nested skill runtime traces preserve parent/child linkage.

Replay tests:

- Replay representative shared skill requests and compare selected skill/model/provider/schema-validity.
- Replay Media Studio prompt/custom-skill requests and compare selected skill, schema-validity, and prompt-package parity.

## 14. UI and Ledger Plan

Ledger service tests:

- Test ledger DTO exposes runtime engine/mode/version.
- Test ledger DTO exposes plan artifact/digest and step list.
- Test ledger DTO exposes owner result, reviewer verdict, repair attempts, trace links, and terminal reason.
- Test ledger DTO exposes explicit step links rather than only a plan-summary fallback.
- Test legacy runs map to safe empty states.

UI/component tests:

- Test plan panel renders plan steps from persisted plan data when execution evidence is pending.
- Test step card shows owner, reviewer, deliverable, evidence requirements, checklist, status, retry count, and trace link.
- Test step card can jump to plan-step, owner-result, reviewer-result, and repair-result anchors independently.
- Test old run with no `runtimeStateJson` does not throw.
- Test clicking step trace link does not create scroll focus lock.

## 15. Security Plan

Permission tests:

- Test missing envelope fails closed.
- Test invalid signature fails closed.
- Test expired envelope fails closed.
- Test tool/skill/connector/write-scope mismatch fails closed.
- Test tenant/run mismatch on callback or streamed event fails closed.

Prompt-injection tests:

- Test prompt-like instructions in retrieved/tool/file/browser content are treated as evidence text.
- Test untrusted evidence cannot override locked step objective.
- Test untrusted evidence cannot add permissions.
- Test Node normalization strips or references HTML/script/signed URL/oversized payloads.

Redaction tests:

- Test trace persistence redacts JWTs, bearer tokens, provider keys, internal tokens, signed URLs, cookies, OAuth refresh tokens, connector credentials, and large raw fragments.
- Test room messages and ledger payloads never include redacted secrets.

## 16. SDK Version and Upgrade Plan

Dependency tests:

- Test `openai-agents` is pinned exactly in the approved Python dependency path.
- Test Node package manifests do not include OpenAI Agents SDK dependency.
- Test adapter reports pinned SDK version.

Compatibility tests:

- Test agent construction contract.
- Test tool construction contract.
- Test handoff construction contract.
- Test guardrail construction contract.
- Test run result normalization contract.
- Test stream event normalization contract.
- Test interruption/resume contract.
- Test custom model client contract.
- Test trace redaction/export contract.
- Test mixed-deploy `current/current-1` contract compatibility between Node and Python.
- Test unsupported future contract version fails closed with structured error.

Upgrade workflow tests:

- Test replay fixture comparison can detect verdict drift.
- Test replay fixture comparison can detect trace-shape drift.
- Test rollback flag restores legacy path for new work.
- Test rollout documentation includes numeric promotion thresholds.
- Test rollout documentation includes operator recovery playbook.
- Test rollout documentation includes implementation and manifest ownership matrix.

## 17. Testing Strategy

Meta-tests:

- Test fixture directories are shared by TypeScript and Python tests.
- Test required replay fixture list exists.
- Test CI or local scripts can run the adapter contract suite independently.
- Test documentation names the commands needed for SDK upgrade validation.
- Test documentation names mixed-deploy compatibility checks.

## 18. Implementation Order

Each implementation step should follow red-green-refactor:

1. Write failing tests for the section.
2. Implement only enough to pass.
3. Refactor into the planned module boundaries.
4. Run the section's focused tests.
5. Run smoke tests for dependent prior sections.

Do not start active surface integration before flags, schema, adapter, gateway tests, trace redaction tests, and manifest coverage exist for that surface.

## 19. Acceptance Mapping

Acceptance tests:

- End-to-end shadow Chat run records runtime trace and preserves legacy visible output.
- End-to-end shadow Team run records plan, step, review, and comparison trace while preserving legacy progression.
- End-to-end shadow Responses run records schema validation and preserves legacy visible output.
- End-to-end shadow shared-skill run records selected skill and preserves caller-visible output.
- Active Team fixture completes every mandatory step or records explicit non-success terminal reason.
- Gateway-only adapter test proves no direct provider billing path.
- Import guard proves SDK isolation.
- Legacy old-run rendering test proves backward compatibility.

## 20. Risks and Mitigations

Regression tests:

- Test SDK version drift with fixture comparison.
- Test gateway bypass rejection.
- Test prompt injection through tool output.
- Test duplicate stream event idempotency.
- Test mid-run feature-flag change does not switch runtime.
- Test missing skill manifest blocks active mode.
- Test shadow side effects are suppressed.

## 21. Definition of Done

Done when all relevant section tests pass:

- feature flags
- schema/migration
- Python adapter and gateway
- import guard
- Node runtime client
- trace/checkpoint persistence
- skill manifests
- Chat shadow/active/rollback
- Team plan/step/review/repair/completion
- Responses shadow/active/schema enforcement
- shared skill runtime shadow/active/schema enforcement
- UI/ledger compatibility
- security/redaction
- SDK upgrade/replay

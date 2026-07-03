# Implementation Plan: Feature 130 Hybrid Flow OpenAI Agents SDK Runtime

## 1. Objective

Build a product-grade Hybrid Flow runtime that is independent from Chat-origin Agency workflow and backed by the existing OpenAI Agents SDK adapter introduced by Feature 101.

The implementation must replace simulated Redis-only stage advancement with durable stage execution, approval checkpoints, SDK-backed role execution, explicit commit executors, precise Chat routing, and release gates.

## 2. Architecture Overview

The implementation has seven layers:

1. Shared contracts and flags.
2. Durable Hybrid persistence.
3. Neutral Node Hybrid router and coordinator.
4. Python OpenAI Agents SDK Hybrid stage support.
5. Chat routing and neutral Hybrid UI.
6. Commit executors and approval/resume behavior.
7. Replay fixtures, rollout gates, and operator recovery.

Data flow:

```text
Chat message
  -> deterministic direct-command checks
  -> skill/media/prompt-enhance routing
  -> Hybrid-positive classifier/planner
  -> Hybrid confirmation card
  -> neutral preview token
  -> durable execution start
  -> stage runner
  -> AgentRuntimeClient.run/resume/cancel/health
  -> Python openai_agents_adapter.py
  -> normalized HybridStageResult
  -> durable stage result + trace/cost
  -> approval/repair/commit coordinator
  -> Hybrid workspace projection
```

## 3. Implementation Waves

### Wave 1: Contracts, Flags, And Replay Fixtures

Purpose:

- Establish all shared DTOs, contract versions, feature flags, executor registry types, and routing fixtures before runtime code changes.

Primary files:

- `apps/web/shared/orchestration/hybridOrchestration.ts`
- `apps/web/shared/agentRuntime/types`
- `apps/web/shared/chatSkillRouting.ts`
- `apps/web/client/src/components/chat/chatLocalRouting.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/featureFlags.js`
- New fixture file under existing test fixture conventions, such as `apps/web/shared/__fixtures__/hybridRoutingFixtures.ts`

Key decisions:

- Add `surface: "hybrid"` and Hybrid entry-point metadata through existing agent runtime contract patterns.
- Add schema/version constants for `hybridPlanSchemaVersion`, `hybridStageResultSchemaVersion`, `roleTemplateVersion`, and `executorRegistryVersion`.
- Define `HybridRuntimeStageRequest`, `HybridStageResult`, `HybridStageExecutorDefinition`, and state/status enums in shared types.
- Keep contract changes additive.
- Add feature flags:
  - `hybridFlow.enabled`
  - `hybridFlow.chatEntryEnabled`
  - `hybridFlow.openAiAgentsRuntimeEnabled`
  - `hybridFlow.openAiAgentsRuntimeShadow`
  - `hybridFlow.neutralWorkspaceEnabled`
  - `hybridFlow.agencyLegacyFallbackEnabled`
  - `hybridFlow.commitStageEnabled`

TDD emphasis:

- Routing fixtures fail first for direct image/video/prompt-enhance commands.
- Contract schema tests fail first for unsupported versions, missing stage metadata, and scope-widening attempts.

## 4. Durable Persistence And Migration

Purpose:

- Move started executions out of Redis-only TTL state.

Primary files:

- `apps/web/drizzle/schema.ts`
- generated Drizzle migration files
- `apps/web/server/services/hybridOrchestrationStore.ts` (new)
- `apps/web/server/services/__tests__/hybridOrchestrationStore.test.ts`
- `apps/web/server/services/hybridOrchestrationRuntime.ts`

Recommended model:

- Create `hybridExecutions`.
- Create `hybridExecutionStages`.
- Reuse or link to `workApprovals`, `workAutomationRunCheckpoints`, and existing agent runtime trace/checkpoint records where practical.

Required behavior:

- Preview tokens stay short-lived and may remain Redis-backed.
- Starting a preview creates or links exactly one durable execution.
- Preview tokens are single-purpose, tenant/user scoped, and contain no secrets or provider credentials.
- Expired previews may be regenerated only from the original chat message when the user still has access.
- Durable execution record stores tenant, user, conversation, origin surface, status, objective, routing decision, current stage, total credits, and version metadata.
- Durable stage record stores ordered stage metadata, executor id, input, normalized result, error code, idempotency key, and timestamps.
- Redis loss must not destroy started execution state.

Migration strategy:

- Expand: add schema and store abstraction.
- Dual-read: started executions read durable store first and Redis compatibility second.
- Cutover: neutral route writes durable records at start.
- Contract: stop relying on Redis for started execution state after rollout gates pass.

## 5. Neutral Hybrid Router And Runtime Coordinator

Purpose:

- Remove Chat-origin Agency dependency and introduce real server-side state transitions.

Primary files:

- `apps/web/server/routers/hybridOrchestration.ts`
- `apps/web/server/services/hybridOrchestrationRuntime.ts`
- `apps/web/server/services/hybridStageRunner.ts` (new)
- `apps/web/server/services/hybridExecutorRegistry.ts` (new)
- `apps/web/server/services/agentRuntime/client.ts`
- router/service tests under `apps/web/server/services/__tests__` and existing router test conventions

Router operations:

- `createPreviewToken`
- `getPreview`
- `startExecution`
- `getExecution`
- `resumeExecution`
- `cancelExecution`
- `retryStage`
- `getRuntimeHealth`

Compatibility:

- `createPreviewToken` accepts Chat-origin payload without `agencyId`.
- Agency-origin calls may still pass `agencyId`.
- Old Agency route can redirect or wrap neutral runtime, but Chat-origin cannot require `agencyId`.

Runtime behavior:

- State transitions are server-owned and idempotent.
- `startExecution` should enqueue/run the first executable stage instead of marking stages completed.
- `resumeExecution` handles approval, repair, and retry.
- `cancelExecution` stops future stages but leaves committed side effects untouched.
- `retryStage` reuses the same idempotency policy.

## 6. Python OpenAI Agents SDK Hybrid Stage Support

Purpose:

- Extend the Feature 101 Python adapter to execute Hybrid stages without adding a second SDK bridge.

Primary files:

- `python-backend/requirements.txt`
- lock/constraints file if used by this repo
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_contracts.py`
- `python-backend/app/services/openai_agents_version.py`
- `python-backend/tests/unit/test_openai_agents_adapter.py`
- `python-backend/tests/unit/test_openai_agents_contracts.py`
- New focused tests for Hybrid stage requests

Dependency policy:

- Re-check latest stable `openai-agents` at implementation time.
- Pin exact version.
- Keep OpenAI Python dependency explicit.
- Do not add SDK dependencies to Node.
- Record SDK version in health and stage outputs.

Adapter behavior:

- Accept `surface = "hybrid"` and Hybrid stage metadata.
- Validate contract/schema versions.
- Build fixed role graph for explorer, critic, synthesizer, and validator.
- Enforce tool and handoff allowlists.
- Return normalized stage output and trace metadata.
- Reject unsupported stage type or scope widening with structured errors.

Gateway behavior:

- Use SmartSpecPro gateway model config only.
- Do not rely on SDK default model.
- Do not expose provider credentials to the adapter.

## 7. Chat Routing And UI Integration

Purpose:

- Keep direct fast paths fast and expose Hybrid only when useful.

Primary files:

- `apps/web/shared/chatSkillRouting.ts`
- `apps/web/client/src/components/chat/chatLocalRouting.ts`
- `apps/web/client/src/components/chat/chatLocalRouting.test.ts`
- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/components/chat/HybridOrchestrationCard.tsx`
- `apps/web/client/src/components/chat/__tests__/HybridOrchestrationCard.test.tsx`
- `apps/web/client/src/pages/Chat.tsx`
- locale files under `apps/web/client/src/locales`

Routing order:

1. Slash/direct command.
2. Direct image/video command.
3. Prompt enhance/edit command.
4. Direct skill detection.
5. Hybrid-positive staged intent.
6. Confirmation when ambiguous.

UI/UX contract:

- Target user / JTBD: Chat user with a complex task who needs staged alternatives, critique, approval, and safe final action.
- Surface inventory: Chat composer, message list, Hybrid confirmation card, private chat empty state, public chat empty state.
- Component map: `ChatView` owns routing integration; `HybridOrchestrationCard` owns confirmation; future workspace owns execution status.
- State matrix: loading preview, no Hybrid available, error opening preview, success confirmation, disabled by flags, hover/focus.
- Responsive matrix: mobile 390x844, tablet 768x1024, desktop 1440x900.
- Accessibility acceptance: keyboard-reachable actions, visible focus, button labels, semantic status text, no composer overlap.
- Copy contract: Thai/English labels for start Hybrid, keep in chat, run direct skill, errors, approval required.
- Browser evidence required: screenshots or Playwright evidence for public chat, private chat, mobile card, and hidden Work OS restore state.

## 8. Neutral Hybrid Workspace UI

Purpose:

- Provide a neutral workspace for preview and execution that does not require Agency route context.

Primary files:

- `apps/web/client/src/pages/HybridOrchestrationPreview.tsx`
- route registration files such as `apps/web/client/src/App.tsx`
- supporting UI components under `apps/web/client/src/components`
- UI tests for route rendering and actions

Routes:

- `/hybrid/preview?hybridPreviewToken=...`
- `/hybrid/:executionId`

Required UI states:

- preview loading
- preview expired
- execution starting
- stage running
- awaiting approval
- repair required
- commit running
- completed
- failed retryable
- failed terminal
- cancelled

Agency compatibility:

- Existing `/agencies/:id/hybrid-preview` remains readable or redirects to neutral route.
- Agency context may be displayed when `originSurface = "agency"` but must not be required for Chat-origin flows.

## 9. Commit Executors, Approval, Repair, Retry, And Cancel

Purpose:

- Wire final side effects only through platform-owned, allowlisted executors.

Primary files:

- `apps/web/server/services/hybridExecutorRegistry.ts`
- `apps/web/server/services/hybridCommitExecutor.ts` (new)
- relevant direct skill/media execution services
- approval/checkpoint service files selected during implementation
- focused service tests

First-slice commit executor:

- Use a safe executor: selected direct skill execution, media prompt preview, or library save.
- Do not include publishing or broad connector writes.

Required rules:

- Commit executor id is server-selected from registry.
- Model output may recommend a commit but cannot select arbitrary executor names.
- Commit requires tenant policy, credit check, approval where required, audit record, and idempotency key.
- Retry with the same idempotency key must not duplicate side effects.
- Cancel prevents future stages but does not undo already committed side effects.

## 10. Observability, Replay, Rollout, And Operator Recovery

Purpose:

- Make runtime activation safe and debuggable.

Primary files:

- replay fixture files under existing test conventions or feature-scoped fixtures
- focused test files for routing, runtime contracts, compatibility, failure recovery
- release/operator documentation under the feature directory, for example `rollout.md` and `operator-playbook.md`
- observability/log query documentation if no dashboard file exists

Replay groups:

- direct media negative
- prompt enhancement negative
- direct skill negative
- Hybrid-positive Thai
- Hybrid-positive English
- ambiguous prompts
- SDK stage success
- SDK schema drift
- approval resume
- idempotent commit retry
- legacy Agency compatibility

Shadow mode requirements:

- keep current visible behavior
- generate candidate SDK stage result
- suppress side effects
- compare routing and stage outputs
- persist comparison metadata for QA/operator review
- never auto-fallback to Agency for Chat-origin SDK failures

Release gates:

- SDK dependency pinned and release notes reviewed.
- Adapter contract tests pass for current and current-1.
- Replay fixtures pass.
- No direct media or prompt-enhance regression.
- No Chat/Team/Responses/shared skill runtime regression from SDK upgrade.
- Migration and rollback validated.
- Operator recovery playbook exists.

Operator playbook must explain:

- how to find execution, stage, trace, SDK version, and contract version
- how to retry a safe stage
- how to cancel stuck execution
- how to resume or expire stale approval
- how to verify commit idempotency
- how to disable Chat-origin Hybrid without disabling direct chat/skills

Product metrics and SLOs:

- Track Hybrid offered, accepted, keep-in-chat, direct-skill fallback, stage failure, repair attempt, approval decision, and final completion.
- Track routing precision on labeled fixtures, direct skill false-positive rate, approval completion rate, duplicate side-effect prevention count, average credits, and final artifact acceptance or retry rate.
- Preserve the spec's initial canary targets: intake p95 under 20s, swarm p95 under 90s, validation p95 under 30s, approval resume p95 under 5s, and zero duplicate commits for retried idempotency keys.
- Include a small manually reviewed golden set for complex Hybrid-positive Thai and English prompts before broad rollout.

Billing and cost controls:

- Every stage result must carry estimated budget, actual token usage, credits used, model/provider route, and executor cost where applicable.
- Starting Hybrid should show preflight estimate when available.
- Runtime must enforce per-stage and total run ceilings.
- Insufficient credit must fail closed before the next billable stage.
- Historical cost summaries must remain stable even if model pricing changes.

Security and governance:

- No frontend SDK calls.
- No direct provider credentials in Hybrid runtime.
- All LLM calls go through SmartSpecPro gateway.
- Node and Python both enforce tool, skill, and handoff allowlists.
- Mutating tools and commit executors require approval, tenant policy checks, idempotency, and audit.
- Trace output visible in UI must be redacted.
- Cross-tenant execution ids, preview tokens, and trace ids fail closed.

Environment and configuration:

- Production defaults disabled until release gates pass.
- Missing SDK health disables SDK-backed Hybrid only, not direct chat or direct skills.
- Missing budget or executor allowlist disables commit stages.
- Staging must pass replay fixtures before active canary.

## 11. Suggested Implementation Order

1. Wave 1: contracts, flags, routing fixtures.
2. Wave 2: durable store and migration.
3. Wave 3: neutral router/coordinator without SDK execution.
4. Wave 4: SDK dependency upgrade and Python Hybrid stage support.
5. Wave 5: stage runner integration and normalized results.
6. Wave 6: Chat card neutral route and workspace UI.
7. Wave 7: first safe commit executor and approval/retry/cancel hardening.
8. Wave 8: replay fixtures, release gates, operator playbook.

## 12. Verification Commands

Focused commands should be chosen during implementation, but the expected families are:

- `cd apps/web && npm test -- chatLocalRouting.test.ts`
- `cd apps/web && npm test -- HybridOrchestrationCard.test.tsx`
- `cd apps/web && npm test -- hybridOrchestration`
- `cd apps/web && npm test -- agentRuntime`
- `cd python-backend && pytest python-backend/tests/unit/test_openai_agents_adapter.py`
- `cd python-backend && pytest python-backend/tests/unit/test_openai_agents_contracts.py`
- replay fixture command or focused Vitest suite introduced by this feature

## 13. Definition Of Done

The implementation is complete when:

1. Chat-origin Hybrid starts without Agency.
2. Hybrid stages execute real SDK-backed stage work.
3. Direct image/video/prompt-enhance/direct skill routing remains direct.
4. Durable execution state survives reload and Redis loss.
5. Approval, repair, retry, cancel, and idempotent commit are test-covered.
6. SDK version, adapter version, and contract versions are visible in health/stage metadata.
7. Legacy Agency links remain readable or redirect safely.
8. Replay and release gates pass before canary.
9. Operator recovery documentation exists.
10. Billing, security, environment, and product metric gates from the spec are implemented or explicitly verified in rollout artifacts.

## 14. Spec Coverage And Handoff Matrix

Use this matrix during `/deep-implement` to keep implementation aligned with the product-grade spec. A section is not complete until its blocking gate is satisfied or explicitly documented as a rollout blocker.

| Spec Requirement | Primary Section(s) | Blocking Gate |
|---|---|---|
| OpenAI Agents SDK is the primary Hybrid runtime, with no second SDK bridge | 04, 05 | Adapter contract tests, SDK health metadata, release notes review |
| Chat-origin Hybrid does not depend on Agency workflow runtime | 03, 06, 07 | Router/coordinator tests prove Agency-free execution path |
| Direct `create image:`, `create video:`, `enhance prompt`, and explicit skills bypass Hybrid | 01, 06, 09 | Routing fixture suite, chat regression tests |
| Durable execution state survives Redis loss/reload | 02, 05, 08 | Migration tests, reload/resume tests, Redis-loss fixture |
| Stage state machine supports intake, swarm, validate, approval, commit, repair, retry, cancel | 02, 03, 05, 08 | State transition tests and stale approval tests |
| Neutral `/hybrid` workspace replaces Agency-branded UI for Chat-origin Hybrid | 06, 07 | UI contract tests and workspace route tests |
| Approval checkpoint is explicit, durable, resumable, and tenant-bound | 02, 07, 08 | Approval resume/expire/cross-tenant tests |
| Commit executors are allowlisted, tenant-policy checked, audited, and idempotent | 01, 08 | Idempotency tests, audit assertions, policy-denial tests |
| Billing and budget controls are enforced before each billable stage | 05, 07, 08, 09 | Cost ceiling tests, insufficient-credit fail-closed tests |
| Security controls prevent frontend SDK calls and cross-tenant trace/preview access | 04, 07, 08, 09 | Security review checklist and cross-tenant negative tests |
| Shadow mode compares SDK candidate outputs without side effects | 02, 05, 09 | Shadow replay fixtures and comparison metadata assertions |
| Product metrics and SLOs are emitted for operator rollout decisions | 05, 07, 09 | Metrics assertions and rollout checklist |
| Legacy Agency links remain readable or redirect safely | 03, 07, 09 | Legacy link compatibility tests |
| Release gates, rollback, and operator recovery are documented | 09 | `rollout.md`, `operator-playbook.md`, and replay pass |

## 15. Implementation Risk Register

| Risk | Why It Matters | Controlled In | Required Mitigation |
|---|---|---|---|
| Router over-selects Hybrid for direct media or prompt-enhance requests | Breaks existing high-value Chat fast paths | 01, 06, 09 | Golden routing fixtures, direct route precedence, false-positive metric |
| SDK adapter drifts from Node contract after dependency update | Runtime failures can surface only after stage execution | 01, 04, 05 | Current/current-1 contract fixtures and version metadata |
| Durable store schema diverges from existing execution tables | Migration and rollback risk | 02 | Impact check before migration, reversible migration, backfill/rollback notes |
| Commit retries duplicate side effects | User-facing data corruption or duplicate artifacts | 08 | Idempotency key enforcement, audit assertions, duplicate prevention metric |
| Shadow mode accidentally mutates state | Canary safety failure | 05, 09 | Side-effect suppression tests and executor denylist in shadow mode |
| UI exposes redacted trace, preview token, or cross-tenant run data | Security/privacy incident | 07, 08, 09 | Redaction tests, tenant-bound token tests, security review gate |
| Billing estimate and actual usage disagree silently | Credit disputes and rollout confusion | 05, 07, 09 | Stage-level estimated/actual cost fields and stable historical summary tests |
| Operator cannot recover stuck approval or failed stage | Production support burden | 08, 09 | Retry/cancel/expire tests plus operator playbook drills |

## 16. Deep-Implement Readiness Notes

- Start with Section 01 and keep its shared contracts, flags, and fixtures small. Later sections should extend these contracts instead of introducing parallel shapes.
- Do not parallelize Sections 02, 03, and 05 unless the persistence shape is already merged; they share execution ids, stage state, and result contracts.
- Section 04 can proceed after Section 01, but it must not create a new OpenAI Agents SDK bridge. Extend the existing adapter surface only.
- Treat Section 06 routing tests as a release-blocking regression suite because direct media and prompt-enhance paths were the original product pain.
- Treat Section 08 as security-sensitive even if the first executor is intentionally narrow. Mutating executor behavior must be allowlisted, tenant-bound, audited, and idempotent before rollout.
- Section 09 must produce the rollout artifacts, not only tests. The implementation handoff is incomplete without replay fixture results, `rollout.md`, and `operator-playbook.md`.
- Re-run `check-sections.py` and `check-ui-contracts.py` after any planning edit, then run focused app tests during implementation as each section lands.

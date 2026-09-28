# Spec 231 implementation research

## Research decision

- Codebase research: required; this is an existing monorepo with a mature legacy LLM router.
- Web research: defer until the relevant adapter wave. Provider, Cloudflare Gateway, Queue and SDK behavior changes over time; each integration wave must use current official documentation and live capability probes before qualification. The design document already lists primary sources, but those references do not prove current account entitlement or runtime behavior.
- Specialized codebase index: unavailable for this task. The repository instructions prohibit use of the retired SocratiCode system, so discovery used bounded `rg`, direct source reads and migration/test inventory instead.
- User interview: skipped by explicit user instruction to make routine implementation decisions autonomously. The source spec provides the product/security constraints. No business policy is weakened by that instruction.

## Current implementation map

| Area | Existing source | Current behavior / gap |
|---|---|---|
| Provider selection and fallback | `apps/web/server/services/llmRouter.ts` | Resolves `model_provider_map`, applies provider health and `routing_rules`, orders by cost/priority, and retries eligible provider failures. This is a legacy provider-level selection path, not the full Spec 231 intent → hard policy filter → immutable plan pipeline. |
| Provider/model catalog | `apps/web/server/services/llmProviderCatalog.ts` | Has model surface/execution eligibility, capability flags, safe relative endpoint validation and catalog-backed pricing helpers. There is no complete versioned qualification record or deployment/certification revision contract. |
| HTTP entrypoint | `apps/web/server/_core/llmRoutes.ts` | Owns many public/internal request surfaces and legacy model selection paths. Must inventory and converge consumers incrementally; no global cutover. |
| Chat handler | `apps/web/server/services/llmRoutesHandler.ts` | Resolves user/provider selection and calls `executeWithFallback`; useful compatibility adapter boundary. |
| Admin catalog UI | `apps/web/client/src/pages/AdminLLMProviders.tsx` | Manages provider/model catalog. Does not expose the full rollout-bundle, qualification, route-pin, budget, privacy and attempt evidence required by R4. |
| Economics | `apps/web/server/services/creditService.ts`, `costTracker.ts` | Existing credit authority and provider usage/cost projection. Spec 231 must extend/use it; it must not create a second wallet or settlement authority. |
| Durable jobs | Existing `worker_jobs` + outbox services | Canonical long-running job owner. Spec 231 cannot replace this with a new queue/ledger. Inline inference remains inline; durable inference must be admitted through the existing job control plane. |
| Persistence | `apps/web/drizzle/schema.ts`; migrations `0000` onward | Existing `llm_providers`, `model_provider_map`, `routing_rules`, and `provider_usage_log`. No `inference_plans`, `inference_attempts`, versioned rollout bundle or secure conversation-state manifest tables were found by targeted search. Do not infer that a migration is deployed from source alone. |
| Tests | `apps/web/server/services/llmRouter.test.ts`, `llmProviderCatalog.test.ts`, `apps/web/server/_core/llmRoutes*.test.ts`, provider tests | Focused legacy routing/provider behavior is covered; R2/R3/R4 acceptance catalog is not implemented as a unified conformance suite. |

## Key implementation risks found

1. Existing fallback selects among healthy configured providers but does not itself prove the full Spec 220 / tenant / locality / consent / capability / budget intersection before egress.
2. Legacy model/provider locks and fallback have multiple caller-specific semantics. A new resolver must not silently broaden a user lock or switch endpoint fidelity.
3. Retry after an ambiguous submission can double-charge or duplicate tool effects unless attempt ownership, idempotency and `UNKNOWN_OUTCOME` are first-class.
4. Dynamic Gateway routes can drift behind a mutable route name. The selected planned model is not proof of the executed model.
5. Current sources do not establish live provider credentials, dynamic-route version-pin support, account entitlements, schema application, production deployment or actual external charge reconciliation.
6. The spec-number collision remains an external registry gate. Preserve the two topics and stable `spec_uid` values; never rename the Redis work to 232 without the live authoritative registry transaction required by Spec 231 §70/§87.

## Test and implementation conventions

- Web: Vitest; service tests live under `apps/web/server/services/__tests__` or beside the service for established suites. Use mocks for unit/contract tests and disposable PostgreSQL for transaction, fencing and migration integration tests.
- Python: pytest under `python-backend/tests`; do not mirror the TypeScript router authority in Python. Python providers/agents should consume the shared server-authorized inference contract through the existing service boundary.
- Drizzle schema/migration files live under `apps/web/drizzle`; migrations are additive and require disposable database testing plus compatibility tests. Existing test database and CI policies must be checked before database integration runs.
- Local source tests prove code behavior only. Provider API fidelity, credential ownership, deployed migrations, route immutability, account entitlement, UI/browser behavior and production outcomes require separate environment evidence.

## Automatic decisions authorized for this plan

- Default selection is `AUTO`; the router deterministically chooses only from qualified and policy-eligible candidates without asking the user to pick each route.
- User/provider/model locks are respected. Automatic fallback is allowed only for explicitly pre-approved equivalent candidates; `none` stays pinned and `ask` returns a typed consent-required outcome.
- High/critical risk, missing authorization/consent, stale policy, unknown budget, unknown provider identity, unsupported continuation, or route-pin mismatch fail closed with a typed outcome. “No more confirmations” authorizes routine engineering choices, not weaker security, payment or side-effect approval.
- Start with a deterministic/static policy baseline. Classifier, semantic, learned routing, shadow replay, evaluator cascade and randomized experiments remain opt-in until their corpus lineage, consent, thresholds and measured benefit pass the stated gates.
- Do not enable production traffic or change provider credentials/routes as part of local implementation. Promotion requires the individual release gates in Spec 231.

## 2026-09-27 active caller scan (exact direct Web scan; runtime closure remains open)

The direct TypeScript invocation scan used the installed TypeScript AST against non-test `apps/web/server/**/*.ts` callsites of `executeWithFallback`. It found 20 direct legacy calls grouped into 18 source-function owners. The approved Spec 231 `llmRouterAttemptAdapter.ts` boundary and central `llmRouter.ts` implementation are excluded from the legacy inventory. `server/services/inference/__tests__/legacyLlmCallerInventory.test.ts` now repeats this scan and requires exact equality with `legacyLlmCallerInventory.ts`, so a new direct callsite fails the focused test until reviewed. Function and file ownership below identifies the immediate runtime surface; it does not yet prove the upstream job/API owner of every service call.

| Immediate caller | Direct callsites | Runtime owner / status |
|---|---|---|
| `_core/llmRoutes.ts` → `services/llmRoutesHandler.ts` (`handleChatWithRouter`, `handleStreamWithRouter`) | `llmRoutesHandler.ts:103,287` | Web HTTP chat and streaming routes; API route handler is verified in `_core/llmRoutes.ts:4369,4402` |
| `_core/mcpRegistry.ts` (`executeGatewayChat`) | `mcpRegistry.ts:609` | MCP tool execution via registered gateway tool; runtime route mapping needs MCP invocation auth and caller contract capture |
| `routers/skills.ts` (`callLLMWithVision`) | `skills.ts:1669,1685` | tRPC skill/vision helper; invoked by several skill procedures and `voiceGuidedVisualAnalysis` |
| `services/skillModelFallback.ts` (`executeSkillLlmWithFallback`) | `skillModelFallback.ts:163` | Shared skill helper; upstream skill runtime owners still need callsite mapping |
| Vertical Drama planning and generation | `verticalDramaAdBanner.ts:449`; `verticalDramaStoryBible.ts:1796,2582` | tRPC/service and long-running generation paths; actual sync vs `worker_jobs` ownership must be established per function, not inferred from domain name |
| Marketplace Auto Review | `marketplaceAutoReviewService.ts:14399,22178` | Service functions called from marketplace review/shot workflow; job-family/runtime mapping remains open |
| Product storyboard skills | `productReviewSequentialStoryboardSkillRunner.ts:2124,3277`; `productReferenceStoryboardSkillRunner.ts:1932,2340`; `productVideoMotionPromptSkillRunner.ts:387` | Product/marketplace execution services; caller/job control-plane owner remains to be traced |
| Presentation generation | `aiPresentationService.ts:8438` (`invokeSkillTextLLM`) | Presentation service; sync request vs durable job owner remains to be traced |
| Structured call compatibility helper | `callLLMStructured.ts:641` | Shared helper; direct upstream API/service owners remain to be traced |
| Channel Gateway | `channelGateway.ts:381,391` | Webhook/widget message processing. Inbound sources include `routes/widgetGateway.ts` and `services/webhookDispatchQueue.ts`; queue authority mapping remains to be checked |

The Python AST scan of non-test `python-backend/app/**/*.py` found **34 grouped call targets across 23 files** outside the central `app/llm_proxy/**` adapter implementation. `python-backend/tests/test_spec231_llm_caller_inventory.py` pins this set and fails when a statically visible gateway/client/SDK target changes without review. Its assertion was executed directly through Python's standard-library `runpy` and passed; the `pytest` executable/module is unavailable in this environment, so the pytest runner itself was not verified. It includes LLM text calls and adjacent embedding, audio, and moderation SDK calls; those adjacent surfaces must be classified separately during adoption rather than silently treated as text-chat routes.

| Source function | Runtime owner / status |
|---|---|
| `api/llm_v1.py` → `chat_completion` and `streaming_service.py` → `chat_completion` | Public/internal API router plus its response streaming service; exact route auth and Node callers need mapping |
| `api/opencode_gateway.py` → `gateway.chat_completion` / stream | OpenCode HTTP gateway endpoint |
| `api/internal_library.py` → chat and Responses gateway | Internal library API flow; exact caller trust and runtime context remain to be traced |
| `api/v1/prompt_enhancement.py` → three gateway calls | Prompt enhancement HTTP API |
| `services/playwright_script_generator.py`, `automation_copilot.py`, `self_healing_executor.py` | Service-level direct calls; determine whether triggered inline or under existing job control plane |
| `tasks/unified_job_task.py` → `client.complete` | Python unified job runtime/task, apparently background-owned; verify its `worker_jobs`/outbox contract before adopting plans |

The Python scan also identifies direct SDK endpoints in `kilo/memory_extractor.py`, `orchestrator/rag/{reranker,vector_retriever}.py`, `orchestrator/vector_store/embedding_service.py`, `services/{embedding_service,moderation_service}.py`, plus direct unified-client callers in social executors, `orchestrator.py`, model comparison, streaming, summaries, and `tasks/unified_job_task.py`. The latter task is a background runtime candidate whose canonical job/outbox owner still needs verification before adoption.

Scope limits: the scanner only closes the explicit method and SDK call shapes listed in its test. Dynamic provider adapters, SDK-specific calls through aliases not matching those shapes, indirect helper aliases, imports assembled dynamically, and Node-to-Python RPC callers are not fully covered. This is a regression-guarded static inventory, not caller-closure acceptance. No production callsite was switched in this pass because current callers do not yet provide the trusted policy snapshot, qualification registry revision and canonical reservation/attempt ownership needed to construct an authorized R4 plan.

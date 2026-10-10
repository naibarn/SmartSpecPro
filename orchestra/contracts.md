# Spec 214 Implementation Contracts

- Spec 214 owns semantic node type identity, manifest, presets, instance semantics, binding references, ports/config/UI, runtime/security/governance declarations, AI Builder retrieval, extension admission, and version lifecycle.
- Spec 215 owns workflow interface/definition, graph, non-node bindings/scopes/policies/instrumentation, compilation and runtime state. Existing partial compiler contracts may consume Spec 214 but must not become a second node registry.
- Feature 195 `worker_jobs` + outbox is the only durable physical job authority.
- Canonical core set is exactly the 16 IDs in Spec 214. Vendor, product, protocol, Skill, and provider labels are bindings/capabilities/presets, not new core types.
- Registry lookup is exact-version and digest-verified. Unsupported/unknown types fail closed. Search returns real registered manifests only.
- Node instance config must reject secret material and runtime state. Binding refs carry identity only; they never contain credential material.
- Derived port/schema resolution is deterministic and side-effect free; unresolved bindings block authoring/compile explicitly.
- No destructive legacy-ID retirement or persistence migration without read-only production inventory and rollback evidence.
- Do not claim R20 live-generation certification from local corpus/static checks.

## SmartAIHub Marathon R2 — Provider Boundary Wave (2026-10-10)

### Shared interface

- `ExecutorInput.beforeProviderRequest?: () => Promise<void>` is server-created only and is absent for ordinary chat requests.
- `executeSkillLlmWithFallback` forwards this optional guard to every physical provider attempt through `executeWithFallback`.
- A guard rejection propagates as an authorization failure; the LLM router must not classify it as a network error or continue to another provider.
- Team media executors call the same guard before sending context-derived prompt data to the media service.

### Ownership boundaries

| File | Owner |
|---|---|
| `apps/web/server/services/__tests__/llmRouter.providerAuthorization.test.ts` | `provider_dispatch_guard_tests` agent |
| `apps/web/server/services/__tests__/imageExecutor.test.ts` | conductor |
| `apps/web/server/services/__tests__/audioExecutor.test.ts` | conductor |
| `apps/web/server/services/__tests__/videoExecutor.test.ts` | conductor |
| `apps/web/server/services/unifiedOrchestrator.ts` | conductor |
| `apps/web/server/services/executors/types.ts` | conductor |
| `apps/web/server/services/executors/textSkillExecutor.ts` | conductor |
| `apps/web/server/services/executors/videoExecutor.ts` | conductor |
| `apps/web/server/services/executors/imageExecutor.ts` | conductor |
| `apps/web/server/services/executors/audioExecutor.ts` | conductor |
| `apps/web/server/services/skillModelFallback.ts` | conductor |
| `apps/web/server/services/llmRouter.ts` | conductor |

### Test boundary

- Agent: deterministic provider guard tests prove no fetch/fallback after denial, worker-local requests are not queued after denial, and guards run at physical attempts.
- Conductor: focused executor tests prove media service calls are suppressed after denial; orchestrator/context tests prove the captured team binding is wired into provider paths.

### Impact boundary

| Surface | Handling |
|---|---|
| `promptComposer.ts` and its dirty SPEC-269 copy | read-only comparison; old delta remains preserved and untouched |
| Chat context project memories | already global-only without verified project binding; no new binding inferred |
| Provider transport | guard invoked before request; remote acceptance cannot be atomic with PostgreSQL revalidation |
| Team-room persistent memory | remains disabled until trusted source provenance exists |
| SPEC-224 protected dispatch / deployment | out of scope; remains DENY / unauthorized |

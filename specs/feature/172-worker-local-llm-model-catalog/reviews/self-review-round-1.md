# Deep-plan self-review — round 1

Date: 2026-09-01

## Review result

PASS after corrective edits. The plan is implementable section-by-section and preserves
the existing device-local Local AI lane.

## Findings and fixes

1. **[MUST_FIX] Job namespace was ambiguous.** The first draft mentioned both
   `local_ai_task` and `llm_invoke` as if they were interchangeable. The plan now defines
   canonical Worker-backed dispatch as `llm_invoke` and reserves `local_ai_task` for legacy
   compatibility.
2. **[MUST_FIX] Existing Local AI boundary was under-specified.** The plan now names
   `localAi.ts`, policy/runtime/catalog services, and `packages/local-ai-core` as protected
   compatibility boundaries.
3. **[MUST_FIX] Runtime module ownership was too broad.** Section 04 now names the focused
   `local_llm_registry.rs` and `local_llm_adapter.rs` modules so registry and adapter behavior
   are testable without coupling it to the existing Comfy executor.
4. **[NICE_TO_HAVE] Browser evidence depends on an authenticated environment.** This is
   retained as a required evidence item for the UI section; local component tests remain the
   deterministic fallback and the final report must distinguish the two.

## Scorecard

| Dimension | Result | Evidence |
|---|---|---|
| Requirements coverage | 5/5 | Spec sections cover owner, Group ACL, multi-model registry, projection, catalog, routing, runtime, UI, billing/lifecycle |
| Security/privacy | 5/5 | No browser direct endpoint, no Cloud secrets, fail-closed refs, owner-created same-tenant Groups |
| Compatibility | 5/5 | Legacy `local_ai_task`, local-client Local AI, global and media catalogs explicitly preserved |
| Implementability | 5/5 | Existing routes/services/tables and exact new boundaries are named |
| Testability | 5/5 | TDD plan maps protocol, DB/ACL, routing, Rust runtime, UI, and lifecycle tests |

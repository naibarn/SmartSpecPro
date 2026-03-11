## Objective

Enforce enabled-model availability across runtime execution paths so disabled LLM models are neither displayed nor silently executed through stale settings or hardcoded fallbacks.

## Approach

1. Introduce or reuse a small server-side helper that can resolve an enabled LLM model from:
   - explicit requested model
   - persisted/stored model
   - configured default model
   - first enabled model
2. Apply that helper to user-triggered execution paths first:
   - chat
   - translation
   - skills/media prompt generation
   - agency/workflow save-execute boundaries where needed
3. Apply the same policy to unattended/background paths:
   - scheduler
   - memory summarization/consolidation
   - channel gateway / response helpers
   - browser-policy legacy settings bridge
4. Remove remaining client-side hardcoded LLM request fallbacks so requests do not reintroduce disabled model IDs.

## Acceptance Criteria

- No user-facing model request path falls back to a disabled hardcoded model.
- Persisted settings that point at disabled models resolve to enabled models or fail safely.
- Background services do not silently run disabled models.
- Tests cover helper behavior and at least the highest-risk router/service call sites.


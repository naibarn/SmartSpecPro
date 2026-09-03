# Learning Log

## 2026-09-02 — Feature 173 follow-up audit

- A disabled Enhanced button without a visible readiness reason is operationally
  ambiguous even when the server returns structured blocker codes. Keep the reason
  visible in the storyboard while preserving the disabled state and Legacy path.
- A local service restart is a meaningful production-readiness gate for Beta. A
  missing ESM export can prevent the entire Node process from starting, so startup
  must be rechecked after any touched runtime/UI change.
- Grok's app transport profile remains distinct from the raw provider skill adapter:
  SmartAIHub sends Start + image references in one ordered array, while the raw
  provider contract remains unchanged to avoid widening scope or invalidating its
  manifest assumptions.
- Readiness errors can be caused by persisted JSON naming drift rather than missing
  media. When a typed projection is camelCase but stored storyboard output is
  provider-shaped snake_case, normalize at the Enhanced boundary and test the
  actual stored shape.

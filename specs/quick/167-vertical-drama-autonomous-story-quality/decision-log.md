# Decision log

## Depth

`promote-to-large-existing-architecture`: the requested behavior crosses story
plan, deep draft, script hydration, long-form memory, durable job state, and
tests. The implementation still reuses existing modules and avoids a schema
migration unless the current persistence contract cannot carry the fields.

## Decisions

1. Add a pure shared semantic consistency module first so it can be tested with
   deterministic fixtures before LLM integration.
2. Keep operational hard failures hard; only ordinary content-quality findings
   get automatic best-known fallback.
3. Make completion status explicit (`completed_with_warnings`) rather than
   pretending every semantic finding was fixed.
4. Use bounded retries with deterministic progress and checkpoint persistence,
   not an unbounded loop.
5. Preserve the existing user approval semantics for destructive or structural
   changes outside ordinary story quality; this request changes only automatic
   generation quality repair.

## Review rounds

### Round 1 — completeness

[AUTO-FIX] Added explicit integration at plan, deep, script, and long-form
boundaries, plus operational-failure separation.

### Round 2 — contradictions

[AUTO-FIX] Clarified that a best-known fallback may complete only when the
structural contract passes; it cannot fabricate missing content.

### Round 3 — scale

[AUTO-FIX] Added block-scoped repair impact and bounded rolling retrieval for
120-episode stories.

### Round 4 — security/data safety

[AUTO-FIX] Added tenant/ownership/corrupted-state/provider boundaries and
explicitly excluded automatic mutation of existing persisted series.

### Round 5 — user experience

No meaningful [AUTO-FIX] item remains. Completion is automatic and residual
quality findings are surfaced as warnings rather than a manual restart request.

### Round 6 — final convergence

No meaningful [AUTO-FIX] item remains. The plan is ready for implementation.

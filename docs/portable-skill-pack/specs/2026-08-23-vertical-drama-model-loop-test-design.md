# Vertical Drama recommended-model runtime loop design

## Goal

Make the Vertical Drama Draft model recommendation evidence-based for the Story
Architecture stage. A model is usable only when it completes the same provider
request, JSON extraction, contract schema, and architecture quality gate used by
the Draft pipeline.

## Runtime loop

1. Read enabled, auto-selection-only, admin-recommended Draft models from the
   database in priority order.
2. Run a bounded Story Architecture probe for each candidate using the real
   `executeWithFallback` path and the production contract/schema.
3. Classify each attempt as provider failure, transport/JSON failure, schema
   failure, quality-gate failure, or pass. Record model/provider and diagnostics
   without logging prompt or secret material.
4. Continue to the next candidate after any non-pass. Do not coerce unknown arc
   IDs or invent missing story fields.
5. Use only a model that passes the complete probe for automatic Draft selection;
   retain deterministic fallback behavior when no candidate passes.

## Acceptance

- A real recommended model produces a complete architecture accepted by both the
  contract schema and `evaluateVerticalDramaStoryArchitecture`.
- A provider/model that returns HTTP 400, malformed JSON, invalid enum values, or
  incomplete required fields is not selected as healthy.
- The loop is bounded and idempotent per probe run, and credits are charged only
  for the actual provider calls.
- Focused tests cover pass, schema failure, provider failure, candidate rotation,
  and no-healthy-model behavior.

## Operational boundary

The initial probe is run against the local runtime/database configuration with
the user-authorized real provider calls. Production deployment and authenticated
browser proof remain separate release steps unless explicitly executed.

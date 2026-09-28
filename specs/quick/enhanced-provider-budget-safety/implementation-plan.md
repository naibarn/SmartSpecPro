# Implementation plan

## Objective

Make Enhanced authoring provider-budget safe and route-correct without changing
the successful prompt contract or credit-settlement boundary.

## Work packages

1. Python runtime configuration
   - Add validated per-stage output-token setting and provider route fields.
   - Map camelCase skill input fields where applicable.
2. Agents SDK integration
   - Set `ModelSettings(max_tokens=...)` on every Agent.
   - Select the configured Responses/Chat Completions API family explicitly and
     use the provider model id.
3. Provider error boundary
   - Classify 402, 429, auth, unsupported transport, and unknown errors in the
     bridge without emitting tracebacks.
   - Normalize Node bridge failures to safe actionable messages and retain the
     existing credit deduction ordering.
4. Server route snapshot
   - Add provider model id/API style to `EnhancedModelFacts` and pass the
     selected provider candidate metadata into the skill input.
5. Regression tests
   - Extend Python runtime tests for settings, routing, and safe classification.
   - Extend TypeScript tests for model snapshot metadata and error mapping.

## Risks and mitigations

- Provider model ids may be absent in old queued jobs: fall back to logical id
  and default Responses only for legacy snapshots.
- Some providers advertise unsupported API styles: fail closed with a stable
  precondition/error instead of silently changing providers.
- Existing dirty TypeScript files overlap the router/service: inspect and edit
  only task-owned hunks; do not reset or rewrite unrelated changes.

## Acceptance

- The request body contains a bounded output token value in a fake SDK test.
- OpenRouter 402 maps to a safe stable error and no traceback is surfaced.
- Focused Python and Vitest suites pass; parse and diff checks pass.

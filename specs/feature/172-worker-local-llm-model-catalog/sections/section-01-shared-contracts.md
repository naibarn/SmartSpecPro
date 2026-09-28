# Section 01 — Shared Contracts

## Scope

Create the versioned contracts required by the Worker-backed Local LLM feature while
preserving the existing device-local `packages/local-ai-core` and the current
`localAiWorkerJobContractSchema` behavior.

## Files and ownership

- Modify `apps/web/shared/workerRuntime.ts` for Worker LLM protocol values and schemas.
- Modify `apps/web/shared/workerAccessKeys.ts` for `llm:inventory` and scope normalization.
- Add focused shared tests beside `apps/web/shared/__tests__/workerRuntime.test.ts`.
- Do not add Worker models to global provider tables or change local-client catalog types.
- The canonical Worker job type is `llm_invoke`; `local_ai_task` remains a legacy
  compatibility type and must not be overloaded with the new Worker catalog protocol.

## Contract requirements

Add schemas/types for:

- `worker-llm-inventory/1` with bounded provider/model arrays, safe display metadata,
  capability source flags, inventory revision, and no endpoint/credential/prompt fields.
- `worker-llm-invoke/1` with server-issued request ID, opaque modelRef, local provider/model
  binding, task, messages, bounded parameters, response format, stream flag, and privacy mode.
- Normalized result, stream delta, usage/timing, terminal error, cancellation, and inventory
  mapping response.
- `sourceType=worker_app` discriminated model rows and task-compatible selection metadata.
- Capability families `llm_gateway` plus `llm.chat`, `llm.completion`, `llm.vision`, and
  `llm.embedding` (or the repository's established naming convention, consistently).
- `llm:inventory` permission scope. `llm_invoke` claim/report must require the appropriate
  `llm:chat`/task scope in addition to existing worker claim/report scopes.

Use strict schemas at every cloud/Worker boundary. Preserve legacy provider IDs and fields;
new arbitrary local provider identity belongs to the Worker-backed contract, not the old
two-provider local-client enum. Model identity is stable and opaque; display-name changes
must not change IDs.

## Acceptance and tests first

Write tests before implementation for valid/invalid inventory, secret rejection, bounds,
revision fields, source discrimination, task capability mismatch, explicit no-fallback
policy, scope parsing, and legacy contract compatibility. Run only the focused Vitest file;
do not run typecheck/build.

## Done when

All producers and consumers can import one contract module, old Local AI tests remain valid,
and malformed/oversized/secret-bearing payloads fail closed with stable error codes.

## UI/UX Contract

### Target User / JTBD
N/A — this section defines shared wire contracts; user-facing behavior is covered by Section 05.

### Existing Pattern Reference
N/A — no UI is changed in this section.

### Surface Inventory
N/A — shared schemas only.

### Component Map
N/A — no UI components are owned here.

### State Matrix
N/A — protocol validation states are tested in Section 01; rendering states are in Section 05.

### Responsive Matrix
N/A — no layout changes.

### Accessibility Acceptance
N/A — no rendered controls; Section 05 owns accessibility acceptance.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — focused schema tests are sufficient for this section; browser evidence is required by Section 05.

## Implementation record

- Added `apps/web/shared/workerLocalLlm.ts` with strict inventory, invoke, result,
  event, capability, privacy, and secret-rejection schemas.
- Extended Worker permission scopes with `llm:inventory` while preserving the
  existing generic runtime identity contract.
- Focused shared Worker Local LLM, Worker runtime, and feature-flag tests passed.

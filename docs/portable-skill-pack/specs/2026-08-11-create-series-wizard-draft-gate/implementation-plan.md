# Implementation Plan

## Objective

Make Create Series Wizard uniformly skill-first and confirmation-gated while keeping all
existing persisted series and shot-duration behavior compatible.

## Workstream 1: client resolver and draft gate

1. Change the single-preset action kind to `synthesize_single_preset` and update copy/types.
2. Add transient draft-gate state with a source signature and request/applied keys.
3. Route every active synthesis CTA through the existing mutation.
4. Validate generated title options at the wizard boundary; preserve manual title behavior.
5. Invalidate the gate on source edits, mode/preset changes, and regeneration.
6. Require applied draft plus title/field validity for Next, forward stepper clicks, and Create.
7. Keep Back navigation and ordinary output-field edits available.

## Workstream 2: service and skill contract

1. Generate a server-side variation nonce per synthesis attempt.
2. Add a single-preset reinterpretation instruction to the skill prompt context.
3. Keep the existing procedure, authorization, credit, schema, and response shape.
4. Add focused prompt/nonce regression tests and only strengthen the wizard boundary for
   automatic title options.

## Workstream 3: tests and verification

1. Update resolver tests for the new single-preset action.
2. Add wizard tests for generation, apply gate, title selection/manual title, staleness,
   regeneration, and no direct preset application.
3. Add service/skill tests for single-source instructions and distinct retry context.
4. Run focused Vitest suites, skill fixture verification, `git diff --check`, and changed-file
   TypeScript diagnostics where available.

## Acceptance criteria

- No active single-preset UI path calls `applyPreset` or sets `appliedPresetId`.
- Next and forward stepper remain disabled until the current draft is applied and title rules
  are satisfied.
- Manual title bypasses only candidate selection, not draft confirmation.
- Source edits and regeneration invalidate prior confirmation.
- Single-preset prompts explicitly require a novel reinterpretation and carry a new nonce.
- Focused tests cover all acceptance criteria and existing series/shot code is untouched.

## Rollout and safety

This is a client workflow plus prompt-contract change. No migration, deploy-time secret, or
old-record transform is needed. Existing server auth/credits remain the authoritative guard.
If focused tests reveal unrelated baseline failures, report them separately.

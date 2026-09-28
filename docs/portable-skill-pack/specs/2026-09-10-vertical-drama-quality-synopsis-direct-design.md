# Vertical Drama Quality-Driven Synopsis-Direct Start Frame Design

## Status

Approved for autonomous implementation by the user on 2026-09-10.

## Goal

When an episode has a valid non-AUTO image quality selected for its current
image model, the Start Frame "สร้าง Prompt + ภาพ" action must send the current
shot synopsis directly to the image media provider. The image provider remains
responsible for interpreting the scene and deciding the visual treatment with
its own native reasoning. The existing prompt-skill behavior remains the
default for AUTO/invalid quality and for every other image workflow.

## Scope boundary

The new path applies only to the Start Frame prompt-plus-image action. It does
not apply to Stop Frame, Angle Variations, Reference Frame, manual AI prompt
editing, batch/legacy prompt generation, or render-only reuse.

## Architecture and data flow

1. The client sends an explicit `synopsis_direct` source only from the Start
   Frame prompt-plus-image action when the selected quality is not AUTO.
2. The server rechecks the episode setting against the selected image-model
   catalog row. The direct source is active only when the quality value is
   still supported and model-bound; otherwise the request falls back to the
   existing skill path.
3. The direct prompt uses the authoritative current `canonicalShotSummary`.
   Character names are replaced deterministically, longest name first, with
   `Image N`, where N is the 1-based index of the attached character reference
   in the same order used for provider submission.
4. The server persists the exact direct prompt and a source stamp on the frame.
   The subsequent paid render recognizes that stamp and does not send the
   prompt through a creative prompt refiner or re-authoring skill.
5. Existing deterministic provider requirements that are required for safety,
   reference ordering, product locks, scene continuity, and output limits stay
   enforced. They are treated as technical/safety boundaries, not as creative
   prompt authoring.

## Safety and failure behavior

- Missing canonical synopsis in a requested direct path fails closed with an
  actionable precondition error; it never silently invents a replacement.
- The server-side story safety scan still runs. A high-risk synopsis is
  rejected rather than rewritten by a prompt skill, preserving the direct
  source contract and avoiding an extra creative LLM call.
- Unselected roster names are removed using the existing cast-visibility guard;
  selected names are replaced with their reference-image index.
- Provider reference URLs retain the existing ownership, capability, trimming,
  transport, reservation, refund, and tenant checks.
- Quality is forwarded only through the existing validated `extraParams.quality`
  boundary. No provider or model is substituted.

## Verification

- Unit-test the name-to-`Image N` transformation, overlap handling, missing
  synopsis, unselected-name guard, and direct/legacy source selection.
- Add router/service regression coverage proving the direct path does not call
  the prompt skill, persists the transformed synopsis, and leaves AUTO on the
  old path.
- Add client flow coverage proving only the Start Frame prompt-plus-image
  request opts into `synopsis_direct` when quality is explicit.
- Run focused Vitest tests, targeted TypeScript diagnostics if available, and
  `git diff --check`. Do not run a paid provider generation as ordinary proof.

## Trade-offs

The direct path intentionally rejects high-risk text instead of asking an LLM
to rewrite it. This keeps the provider prompt faithful to the synopsis and
avoids hidden creative changes, at the cost of requiring the user to repair
unsafe story text before rendering.

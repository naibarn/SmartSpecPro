# Generic Base + Extension Prompt Contract

## Base turn
1. Source/reference declarations.
2. Continuity contract: cast, product, wardrobe, environment, camera, audio.
3. Local timeline `[0-Xs]` for this generation segment.
4. Product action/mechanism/proof beat for this segment only.
5. Dialogue/audio assigned to this segment.
6. End Bridge State: finish in a stable state that the next extension can continue from.

## Extension turn N
Start with a continuation directive.

- Continue from the exact current ending; do not replay completed actions.
- Restate only continuity-critical state, not the entire original scene description.
- Local timecode 0s is the start of this extension.
- State whether this is the same continuous shot or a planned cut/new shot.
- Describe only the new narrative beat(s).
- Preserve product/cast state unless an explicit transition changes them.
- Describe dialogue/audio continuation.
- End on the next Bridge State.

## Seam rule
If the provider may rewrite tail frames during extension, avoid placing exact labels, exact UI, CTA text, or a dialogue word boundary at the seam. Review the overlap/tail region after every extension.

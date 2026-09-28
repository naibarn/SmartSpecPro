# Vertical Drama Combined Character Identity Lock

## Goal

Ensure every Vertical Drama shot prompt that has attached character references
contains one persisted, deterministic `CHARACTER IDENTITY LOCK` block. The block
must cover every unique attached character in the shot without repeating the
facial-feature checklist per character.

## Contract

The block declares the shot-local mapping from character name to reference image,
then states one shared preservation checklist: facial proportions, face shape,
forehead, eyebrows, eyes, nose, cheekbones, jaw/chin, mouth/lips, skin tone,
hairline/hairstyle, and apparent age. It also explicitly forbids identity swaps,
merging, replacement, or reinterpretation between references.

The mapping is derived only from the actual attachment order for that shot.
Duplicate character entries are merged, and a character with multiple approved
reference images receives one mapping entry and one lock block.

## Integration

Use a pure shared formatter and apply it before prompt QC at these boundaries:

- batch start-frame plan projection;
- per-shot prompt generation and reference-frame persistence;
- normal image rendering, including legacy prompts;
- repair/grid provider prompts where attached character references are present.

Generated identity-lock blocks are marked and stripped before rebuilding so the
operation is idempotent. The block is passed as a protected prompt fragment so
length QC cannot remove it. Shots without character references retain the legacy
prompt unchanged.

## Validation

Focused tests cover the combined block, multi-character ordering, duplicate
character de-duplication, stale-block replacement, no-reference compatibility,
prompt persistence, and legacy normal-render behavior.

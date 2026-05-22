# Section 02: Context Assets, Library, and Drag/Drop

## Goal

Let users compose planning context visually by dragging assets into Production Director.

## Requirements

- Add character search to the right-side library/search panel.
- Character results include provider character assets and eligible library/generated images.
- Add filters for Characters, Products, Marketplace, Audio, Generated, and Provider Assets.
- Drag payloads must be typed and include source/provenance.
- Product drag payloads must include product identity, marketplace/capture refs, evidence IDs, image role, fidelity risk, and approval state when available.
- Production drop zones:
  - Cast / Characters,
  - Products / Claims,
  - Scene & Mood References,
  - Audio / Voice / Music,
  - Existing Generated Media,
  - Output Targets.
- Drop zones must support click-to-add for accessibility and mobile.

## Acceptance

- Character asset can be searched and dragged into Production.
- Product image/marketplace product/audio/media assets route to correct drop zones.
- Dropped asset cards show thumbnail, role, source, provenance, lock/remove, and readiness warnings.
- Product asset cards show product identity, image role, claim/evidence badges, fidelity risk, variant/SKU label, and approval/block state.

# Vertical Drama Location Canonicalization

Date: 2026-07-20
Status: Approved for implementation

## Problem

An episode storyboard may describe an existing physical location with a new
`location_key` and a situation qualifier appended to its name, for example
`location-2-visit1` / `ศูนย์ควบคุมการปฏิบัติการบิน (ช่วงเช้า)`, while the
durable series roster already contains `location-2` /
`ศูนย์ควบคุมการปฏิบัติการบิน`.

The reconciliation service can recognize this as a reuse, but the persisted
storyboard keeps the incoming key. The episode UI then joins strictly by key
and incorrectly displays a waiting-for-sync state.

## Design

1. Keep location identity matching deterministic:
   - exact stable key;
   - exact normalized name;
   - exact normalized name after removing one trailing parenthetical qualifier.
   - no fuzzy or edit-distance matching.
2. Return an incoming-to-canonical key binding for every reconciled location.
3. Apply those bindings to `storyboard.distinct_locations` before persisting a
   newly generated storyboard.
4. Preserve best-effort behavior: if reconciliation fails, persist the original
   generated storyboard rather than failing generation.
5. Resolve legacy storyboard data in the episode UI with the same bounded
   normalized-name and one-parenthetical fallback after exact-key lookup.
6. Do not merge or delete existing roster rows automatically.
7. Use the same identity resolver for every per-shot consumer:
   - the location thumbnail displayed beside character references;
   - start-frame prompt and image reference attachment;
   - shot video-prompt vision references;
   - rendered-video reference asset attachment.
     A storyboard group supplies both its incoming key and name. A manual
     per-shot override remains key-authoritative because it is selected from the
     durable roster itself.

## Verification

- Reconciliation tests cover canonical bindings, parenthetical variants,
  genuinely distinct similar names, and fullwidth parentheses.
- A pure frontend resolver test covers exact-key precedence, legacy
  parenthetical fallback, and no fuzzy matching.
- Episode pipeline tests verify that canonical keys are persisted when
  reconciliation reuses an existing row.
- Router tests verify that a legacy situation-qualified group resolves the
  canonical location image for start-frame, video-prompt, and video-render
  consumers.

## Deployment and migration

No schema migration is required. Existing episodes become readable through the
UI fallback. Newly regenerated storyboards persist canonical keys. A separate,
explicit data repair can be added later if stored legacy keys must be rewritten
in bulk.

---
name: Vertical Drama Scene Visual State
description: Author one durable visual continuity lock for one scene of a Vertical Drama sub-episode.
version: 1.0.0
category: other
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: layers
tags:
  - vertical-drama
  - scene
  - continuity
  - lock
  - visual-bible
trigger_patterns: []
priority: 50
config:
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Vertical Drama Scene Visual State

You author exactly one compact visual continuity state for exactly one scene.
The caller supplies location facts, member-shot facts, known wardrobe, an optional
location reference image, and an optional authorized series look. Return ONLY valid,
compact JSON with no markdown or commentary.

## SCENE VISUAL STATE CONTRACT

Return exactly this shape:

```json
{
  "contract_version": 1,
  "scene_visual_state": {
    "lighting_state": "short factual lock",
    "fixed_elements": [{ "name": "fixed item", "placement": "stable placement" }],
    "spatial_layout": "short factual set arrangement",
    "staging_axis": "short factual 180-degree line lock",
    "sleep_surface": { "type": "long_bed", "name": "primary bed", "occupant": "character name", "placement": "stable placement" },
    "wardrobe_in_scene": [{ "character": "name", "wardrobe": "one scene outfit" }],
    "active_props": [{ "name": "prop", "placement": "current placement", "from_shot": 3 }],
    "palette_mood": "short palette and texture lock",
    "time_jump_suspected": false,
    "coverage_gaps": ["script-required element absent from the reference"]
  }
}
```

`lighting_state` locks time of day, sun/key direction, shadow behavior, and
sky/window state. `fixed_elements` contains immovable set facts.
`spatial_layout` locks their arrangement relative to the camera.
`staging_axis` locks character sides and the safe side of the 180-degree line.
`sleep_surface` is optional but mandatory when a bed, crib/bassinet, sofa, or
other sleep surface is part of the scene. Its `type`, name, occupant, and
placement are concrete continuity facts. If the script explicitly says a long
bed, preserve `long_bed` even when a location reference image resembles a
crib/bassinet; never silently substitute the surface.
`wardrobe_in_scene` carries one outfit for every character appearing in the
scene. `active_props` is optional scene-local rendering context, with optional
`from_shot` provenance; it is not a story prop ledger and must not invent durable
prop history. `palette_mood` is color and surface texture, never emotion.
`time_jump_suspected` and `coverage_gaps` are review signals.

The calling application owns the location identity, scene membership, revision,
timestamps, lifecycle flags, and skill version. Never add those fields to the JSON.

This state is the authoritative source for scene-level visual facts after it is
saved. If a location description, reference image, or older prompt conflicts
with the saved state, preserve the shot action but apply it to the saved scene
facts. Do not infer or import a replacement from another source.

## LOCK, DO NOT DESCRIBE

Every value is a short, concrete constraint list. Never write lyrical set
description, emotional direction, character psychology, shot composition, lens
choices, camera moves, or acting instructions.

Good: `"late afternoon; low sun from camera-left window; long warm shadows fall right"`

Bad: `"a melancholy golden hour mirrors her quiet heartbreak while the camera drifts closer"`

The good form can be reused unchanged across all shots. The bad form is emotional
and camera-direction prose that each render will reinterpret differently.

## LIGHTING STATE

The location record stores no authoritative time of day or mood. Author one
`lighting_state` from these sources in descending authority:

1. the attached location reference image, when present;
2. the location description;
3. the scene description;
4. member-shot summaries.

If facts conflict, preserve explicit script facts and flag a suspected internal time
change for review. If there is no image and prose is thin, select one plausible,
internally consistent state and commit to it. An arbitrary but consistent lock is
better than nine independent inventions.

When `series_look` is present, keep palette and lighting treatment inside that
authorized register. The series look owns overall treatment; this state owns the
scene's concrete time of day, source direction, shadow direction, and window/sky
condition. Do not copy series camera grammar into any field.

## SET, LAYOUT AND STAGING AXIS

A fixed element cannot move during the scene: walls, doors, windows, counters,
built-in appliances, large furniture, permanent signs, and structural fixtures.
Record each with a terse placement relative to stable set landmarks.

For a primary bed or sleep surface, use `sleep_surface` in addition to any
fixed-element entry. Choose one of `long_bed`, `single_bed`, `crib_bassinet`,
`sofa`, `floor_mattress`, or `other`. Do not infer the type from the image when
the explicit script or supplied user correction says otherwise.

Write `spatial_layout` as a reusable relationship between those landmarks, not as
one shot's composition. Write `staging_axis` as a stable character-side and
camera-side lock that respects the 180-degree rule. Do not dictate a particular
shot size, pose, or camera movement.

## WARDROBE AND PROPS CONTINUITY

Use one outfit per character for the entire scene unless a member-shot fact
explicitly establishes a change. Prefer supplied wardrobe facts; when absent, record
only what the script or reference visibly establishes and do not invent ornate
details.

Use `active_props` only for objects visibly in play within this scene and needed to
keep adjacent renders coherent. Record stable placement and `from_shot` only when
the introducing shot is clear. Do not infer possession, long-term state, narrative
importance, or cross-scene persistence; Feature 140's fact ledger owns those facts.

## TIME JUMP AND COVERAGE GAPS

Set `time_jump_suspected: true` when member shots imply a time change inside this
single scene grouping. This is a review signal, not permission to blend two lighting
states.

List in `coverage_gaps` any script-required set element the supplied location image
does not show. With no image, list important elements that cannot be grounded from
the supplied prose. Both fields are review signals for the calling app and are never
rendered into an image prompt. Never smuggle a warning into `lighting_state` or
`palette_mood`.

## Worked example

Input facts: a small home kitchen; attached reference shows one window left of the
sink; shots 1-3 happen continuously in late afternoon; Mali wears a pale work shirt;
a chipped blue mug enters in shot 2; authorized palette is warm cream and muted navy.

```json
{"contract_version":1,"scene_visual_state":{"lighting_state":"late afternoon; warm window key from camera-left; shadows fall right; clear sky visible","fixed_elements":[{"name":"sink window","placement":"camera-left wall above sink"},{"name":"dining table","placement":"center-right, parallel to counter"}],"spatial_layout":"sink wall left; counter across rear; dining table center-right with clear aisle between","staging_axis":"Mali remains table-right facing counter-left; cameras stay on the room-entry side of the line","wardrobe_in_scene":[{"character":"Mali","wardrobe":"pale work shirt, unchanged for scene"}],"active_props":[{"name":"chipped blue mug","placement":"near edge of dining table","from_shot":2}],"palette_mood":"warm cream surfaces with muted navy accents; matte lived-in texture","time_jump_suspected":false,"coverage_gaps":[]}}
```

## Edge case — no reference image

Input facts: `location_description` says only "an old office"; the scene needs a
locked filing cabinet but supplies no visual reference.

```json
{"contract_version":1,"scene_visual_state":{"lighting_state":"overcast daytime; soft window key from camera-right; low-contrast shadows fall left","fixed_elements":[{"name":"office door","placement":"rear-left wall"},{"name":"filing cabinet","placement":"rear-right wall"}],"spatial_layout":"desk centered between door rear-left and cabinet rear-right","staging_axis":"desk separates visitor on left from manager on right; cameras remain on doorway side","wardrobe_in_scene":[],"active_props":[],"palette_mood":"desaturated beige and charcoal; worn matte surfaces","time_jump_suspected":false,"coverage_gaps":["no reference image confirms filing cabinet design or exact room proportions"]}}
```

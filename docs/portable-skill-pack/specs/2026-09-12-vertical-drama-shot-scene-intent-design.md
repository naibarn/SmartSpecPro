# Vertical Drama Shot Scene Intent Skill — Design

## Goal

Add a skill-first semantic pass that converts each generated shot's narrative into
a validated visual presence and communication contract before start-frame planning.
It must distinguish physically visible characters, off-screen speakers, remote
callers, barrier/separate-location participants, generic supporting presence, and
mentioned-only characters.

## Decisions

- Run once per episode after `storyboard_shotgrid` produces its nine shots and
  before the storyboard is persisted.
- Supply the current episode's shot sequence plus a bounded previous-episode
  ending context, roster keys, canonical dialogue, and existing shot text.
- Persist the result inside each storyboard shot as `scene_intent`; it is derived
  metadata and never replaces the authored synopsis.
- When the user has already customized a frame's cast, downstream start-frame
  projection continues to preserve that selection exactly.
- Validated high-confidence output may update automatic physical/caller refs.
  Low-confidence or contradictory output fails closed with a reviewable error;
  it must not guess a portrait or spend image-generation credits.
- Phone/video callers use `screen_caller_refs`; mentions, voice-only speakers,
  text-message senders, and people behind a barrier are never silently added to
  the physical cast.

## Contract

Each shot receives bounded JSON containing `physical_character_refs`,
`screen_caller_refs`, `offscreen_speaker_refs`, `mentioned_only_refs`,
`supporting_presence`, `communication_mode`, `visual_plan`, optional dual-view
participants/locations, per-line dialogue routing, confidence, reason codes, and
`needs_review`.

The server validates all character keys against the tenant-scoped roster, rejects
overlapping role sets, preserves user-authoritative assignments, and projects
dual-view facts through the existing `view_mode`/`dual_view` compatibility path.

## Non-goals

- No mutation of authored synopsis, dialogue, character roster, or existing media.
- No new database table or provider integration.
- No automatic provider/image generation during semantic classification.
- No broad rewrite of the existing storyboard or start-frame prompt skills.

## Verification

Pure contract tests cover phone/video calls, shouting through a door, separate
locations, text messages, mentions, duplicate/unknown refs, and low-confidence
fail-closed behavior. Service tests mock the LLM and assert the skill prompt,
schema validation, and credit accounting. Pipeline tests assert the semantic
pass is applied before persistence and that manual cast state remains authoritative.

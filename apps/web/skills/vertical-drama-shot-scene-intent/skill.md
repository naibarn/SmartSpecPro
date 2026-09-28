---
name: Vertical Drama Shot Scene Intent
description: Interpret the visible and non-visible character intent of exactly nine vertical-drama storyboard shots before image generation.
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
# Skill metadata version. This is not the response contract_version value.
contract_version: 1
smartspec_slug: vertical-drama-shot-scene-intent
---

# Vertical Drama Shot Scene Intent

Return ONLY valid JSON matching `schemas/output.schema.json`. This skill is a
narrow semantic preflight. It does not rewrite the synopsis, dialogue, or
image prompt. It resolves the visual truth that downstream image planning must
follow.

## Evidence order

Read all current shots in order. For each shot, use this evidence order:

1. Explicit placement in the current shot's synopsis/action/visual description.
2. Explicit dialogue routing in the current shot.
3. The immediately previous shot in the current episode.
4. The bounded final shots of the previous episode.
5. Character roster identity facts.

Context is evidence, not permission to invent a person in the frame.

## Required separation

- `physical_character_refs`: exact roster IDs of people physically visible in
  the shot's environment. These are the only identity-locked bodies the image
  planner may put in the physical scene.
- `screen_caller_refs`: exact roster IDs of remote phone/video callers. Keep
  them out of `physical_character_refs`; render them only inside a clearly
  visible device/video-call screen when `visual_plan.mode` is
  `device_screen`.
- `offscreen_speaker_refs`: exact roster IDs whose voice is heard but whose
  body is not visible, including a person behind a closed door/wall.
- `mentioned_only_refs`: exact roster IDs named in backstory, gossip, memory,
  news/TV, a text message, or other reference without visual placement or a
  remote call. They must not be in physical or screen caller refs.

Never use a character name alone as evidence of physical presence. A person
can be central to a line and still be absent from the image.

## Communication and visual plan

- Ordinary phone/video call shown only on a handset, tablet, or monitor:
  `screen_caller_refs` + `communication_mode` phone/video + `visual_plan.mode`
  `device_screen`; this is not dual view.
- Video call where the edit shows both participants in their own places:
  use `dual_view`, with disjoint primary/secondary groups and two locations.
- Talking through a closed door, wall, or other barrier: use
  `barrier_dialogue` or `shout_through_barrier`; do not show the unseen body.
  Use `dual_view` only when both sides are explicitly shown.
- Cross-cut dialogue or parallel action in different places: use
  `separate_locations` + `dual_view`.
- Text messages: use `text_message` + `text_ui` when the message UI is shown.
  The sender is not a screen caller unless the text explicitly transitions to
  a call.
- Voice-only or offscreen speech: use `voice_only` and route the line away
  from the physical image.
- An object/detail shot with no named person: use `no_character`.

## Ambiguity rule

If the synopsis, dialogue, continuity context, or requested view contradicts
itself, set `needs_review: true` and `confidence: low`. Do not guess. The
server rejects that output before persistence or image generation.

Use only exact IDs from the supplied roster. Do not invent IDs, merge people,
or copy a previous shot's cast merely because the location continues.

## Exact output contract

The response itself must use the string contract version
`vd-shot-scene-intent-v1` at both the root and every nested `scene_intent`.
The numeric frontmatter value `contract_version: 1` is metadata only and must
never be copied into the response.

Return exactly nine shot entries. Every `scene_intent` must contain:

```text
contract_version: "vd-shot-scene-intent-v1"
physical_character_refs: string[]
screen_caller_refs: string[]
offscreen_speaker_refs: string[]
mentioned_only_refs: string[]
supporting_presence: object[]
communication_mode: "none" | "phone_call" | "video_call" | "text_message" | "shout_through_barrier" | "barrier_dialogue" | "separate_locations" | "voice_only"
visual_plan: object with mode, reason_codes:string[], primary_character_refs:string[], secondary_character_refs:string[]
dialogue_routing: object[]
confidence: "high" | "medium" | "low"
needs_review: boolean
reason_codes: string[]
```

`supporting_presence` and `dialogue_routing` must be arrays, never strings.
`supporting_presence` entries are objects with at least `role`. Each dialogue
routing entry has `line_index`, `role`, `visual_target`, `must_be_on_screen`,
and `must_not_appear_physically`. Return one complete JSON object only, with
no markdown, prose, partial patch, or JSON-encoded arrays/objects.

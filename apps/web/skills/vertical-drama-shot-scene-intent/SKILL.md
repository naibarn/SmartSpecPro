---
name: Vertical Drama Shot Scene Intent
description: Interpret the visible and non-visible character intent of exactly nine vertical-drama storyboard shots before image generation.
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
contract_version: 1
smartspec_slug: vertical-drama-shot-scene-intent
---

# Vertical Drama Shot Scene Intent

Return ONLY valid JSON matching `schemas/output.schema.json`. This skill is a
narrow semantic preflight. It does not rewrite the synopsis, dialogue, or
image prompt. It resolves the visual truth that downstream image planning must
follow.

Read all current shots in order, then use the immediately previous shot and
bounded final shots of the previous episode as continuity evidence. Context is
not permission to invent a person in the frame.

For every shot, keep these categories disjoint:

- `physical_character_refs`: people physically visible in the environment.
- `screen_caller_refs`: remote phone/video callers, never physical bodies.
- `offscreen_speaker_refs`: voices heard while the body is not visible,
  including behind a closed door/wall.
- `mentioned_only_refs`: people named in backstory, gossip, memory, news/TV,
  or text messages without visual placement or a remote call.

Never use a character name alone as evidence of physical presence. A phone or
video caller shown only on a device uses `device_screen`, not `dual_view`.
Use `dual_view` only when both environments/views are explicitly shown, such
as a video-call edit, a barrier shot showing both sides, or cross-cut dialogue
between separate locations. Text-message senders are not callers; use
`text_ui`. Voice-only speech uses `voice_only` and does not add a body.

If any evidence is ambiguous or contradictory, set `needs_review: true` and
`confidence: low`; the server will fail closed before persistence or image
generation. Use only exact roster IDs and return exactly nine shot entries.

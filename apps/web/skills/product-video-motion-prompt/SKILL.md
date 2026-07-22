---
name: product-video-motion-prompt
description: Marketplace Auto Review per-shot video motion prompt skill. Turns one storyboard keyframe (start frame, optional stop frame) plus the shot's planned action, camera, voiceover meaning, product facts, and an optional user motion direction into a single physically-plausible, product-true, continuity-safe video motion prompt in English. Grounds all motion in the supplied keyframe image and never invents product claims.
category: video_prompt_generation
version: 1.0.0
icon: clapperboard
tags:
  - shared-skill
  - product-fidelity
  - marketplace-auto-review
  - video-motion-prompt
auto_trigger: false
triggerPatterns:
  - product video motion prompt
trigger_patterns:
  - product video motion prompt
enabled_by_default: true
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
execution_policy:
  mode: requirements
  requirements:
    supportsVision: true
  allowConversationOverride: false
  allowFreeModels: false
  fallbackPolicy: error
config:
  media_studio:
    marketplace_auto_review_video_motion:
      enabled: true
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Prompt Logic

## Primary Contract

This skill writes the motion/video prompt for exactly ONE shot of a Marketplace
Auto Review video. It receives the shot's start keyframe image (and, when the
video model supports it, a stop keyframe image), plus the shot's planned facts:
`shot_title`, `shot_visual`, `shot_movement`, `voiceover_excerpt`,
`aspect_ratio`, `duration_seconds`, product facts (`product_name`,
`product_brand`, `product_category`, `product_facts`), and an OPTIONAL
`motion_direction` supplied by the user.

Return only the final plain-text video motion prompt for this one shot. It must
describe how the shot MOVES from its start keyframe over `duration_seconds` — the
subject action, product interaction, and camera motion — as a single coherent
motion instruction the video model can execute.

The supplied facts are the source of truth. Use `shot_movement` as the planned
camera/subject motion for this beat, `shot_visual` as the staged composition,
and `voiceover_excerpt` only for emotional/narrative meaning — never render
spoken words, subtitles, or captions as visible text.

## Keyframe Grounding Lock

The first attached image is THIS shot's start keyframe: the exact frame the
video must begin on. Ground every described motion in that image. The people,
product, wardrobe, framing, lighting, and environment already visible in the
keyframe are fixed reality — do not restage them, recolor them, swap the
product, change who is present, or teleport to a different location. Describe
motion that plausibly grows out of the pose and composition shown in the start
keyframe. If a stop keyframe is also attached, treat it as the exact frame the
shot must end on, and describe motion that carries the start keyframe smoothly
and continuously into that ending pose/composition without a cut, jump, or
identity change.

## Physically-Plausible Product Interaction

All product handling must obey real physics and the product's real form. A pump
bottle is pressed and dispenses from its nozzle; a liquid pours and falls under
gravity and spreads or foams realistically; a lid twists or flips; a garment
drapes and folds with its real weight; a device is gripped, tilted, and operated
through its real controls. Never show the product doing something its real
construction cannot do, never morph or resize it mid-motion, and never let a
hand pass through it. Hands, fingers, and product contact points must stay
anatomically and mechanically believable for the full `duration_seconds`.

## Continuity And Identity Safety

Preserve the same person identity, product instance, wardrobe, and environment
from the start keyframe through the entire shot. If a face is visible in the
keyframe, keep it the same recognizable face — no drift to a different person,
no age change, no wardrobe swap. Motion should feel like one continuous take of
the exact scene in the keyframe. Keep the shot readable within `aspect_ratio`
(vertical 9:16 framing when specified): the product and any speaking face must
stay inside the safe framing, not drift out or get cropped away.

## User Motion Direction (optional)

The caller sometimes supplies a `motion_direction` — the user's own free-text
description of how they want the product used/moved across the whole video
(for example: a model picks up the shampoo bottle, presses the pump so shampoo
falls onto the palm, lathers it through the hair into soft foam, then ends on a
clear product showcase). When present, treat it as a MANDATORY ADDITIONAL
directive layered on top of every rule above — never a replacement for product
truth, keyframe grounding, physics, or continuity, and never a reason to skip
any of them.

The `motion_direction` usually describes the motion of the ENTIRE video across
all shots, in chronological order. Map only the slice that belongs to THIS
shot's position in the timeline: use `shot_title`, `shot_visual`,
`shot_movement`, and this shot's place in the running order to decide which
portion of the user's sequence happens now, and write only that portion as this
shot's motion. Preserve the user's chronological order across shots — do not
replay earlier steps or jump ahead to the ending beat unless this is the shot
where that beat belongs. When the user's sequence ends on a product showcase or
similar final beat, honor that ending on the shot that occupies the final
timeline position.

Slicing is STRICT — one shot performs at most ONE step of the user's sequence
(two directly adjacent micro-steps only when a single step cannot fill the
shot's duration). Divide the sequence mentally across `shot_count` positions
and take only the step(s) at `shot_order`'s position. Steps that belong to
earlier or later shots must not appear in this shot's motion at all, not even
as a quick recap or transition. When the caller states "This is the final
shot", write ONLY the user's closing beat (e.g. the product showcase) plus at
most a settling motion into it — the pump press, pouring, lathering, or any
earlier step must NOT be re-performed in the final shot.

When no `motion_direction` is supplied, this section does not apply — write the
shot's motion prompt from the shot facts and keyframe exactly as every rule
above already describes, unchanged.

## Voice Consistency (optional voice_profile)

The caller sometimes supplies an optional `voice_profile` — a short deterministic
descriptor of the single narrator voice used across the whole video (for example
`one single consistent adult Thai female narrator voice`, or the neutral
`one single consistent narrator voice`). It is provided only for runs whose audio
comes from the video model itself (native video audio), where each clip is
generated separately and the narrator voice can otherwise drift between clips.

When `voice_profile` is present, the written motion prompt must state that this
shot uses that same single narrator voice — the same timbre, tone, pacing, and
spoken language — as every other clip in the video, and must never switch to a
different narrator, gender, age, accent, or language mid-video. Keep this to one
short clause folded into the prompt; do not render the spoken words, subtitles,
or captions as visible text, and do not invent a voice that contradicts the
supplied descriptor. When `voice_profile` is absent, this section does not apply
and the motion prompt is written exactly as the rules above describe, unchanged.

## Product Truth

Never invent prices, discounts, ratings, sold counts, certifications, badges,
awards, medical/efficacy claims, or any marketplace claim. Show only the
product's real appearance and real, plausible use. Do not add a second competing
sellable product or replace the keyframe product with a generic substitute.

## Output Format Lock

Return plain prompt text only, in English. No JSON, no YAML, no Markdown fences,
no headings, no bullet lists, no frame labels, no timecodes, no quoted voiceover
lines, no QA notes, and no implementation notes. Do not echo the input field
names. Write one compact, complete motion instruction (a short paragraph) that
stays comfortably within the length budget and never stops mid-sentence.

This skill does not auto-trigger. It is invoked once per video shot by
Marketplace Auto Review's video generation stage when the user supplied a motion
direction for the run.

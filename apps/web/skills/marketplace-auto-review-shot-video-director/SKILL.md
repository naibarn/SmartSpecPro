---
name: marketplace-auto-review-shot-video-director
description: Compact per-shot video director for accepted Marketplace Auto Review images.
category: video_prompting
version: 1.0.0
tags: [shared-skill, marketplace-auto-review, staged-storyboard, video-director]
auto_trigger: false
enabled_by_default: true
execution_mode: llm-only
strict_provider_pin: false
fallback_policy: bounded_server_fallback
---

# Marketplace Auto Review Shot Video Director

Author one bounded video prompt for exactly one accepted image artifact. The
accepted image is the visual source of truth; preserve the product identity,
visible geometry, continuity, and approved Thai dialogue. Return only the
schema-valid structured output. Do not invent claims, prices, accessories,
logos, watermarks, captions, marketplace UI, or unsupported motion.

This skill creates a reviewable text artifact only. Its output does not approve
video-provider spend. The user must approve the exact video prompt after the
accepted image exists and immediately before the provider request.

## Two-Person Conversation Mode

This mode activates ONLY when the accepted shot was staged for a two-member
cast — signaled by `castInShot`/`dialogueTurns` when supplied alongside
`approved_dialogue`, or by `approved_dialogue` itself carrying speaker-labeled
lines (e.g. `"ไอริณ: ...\nกันต์: ..."`). When the shot has a single presenter,
ignore this section and write the video prompt exactly as described above —
that path's output must stay unchanged.

**Never re-author the dialogue.** `approved_dialogue` (and `dialogueTurns`
when supplied) is already approved; quote it verbatim into the video
prompt's spoken-dialogue block, in speaker order. Do not merge, shorten,
reorder, or reassign a line from one speaker to the other.

**Lip-sync and reaction directive.** For each line, the speaking cast
member's mouth motion must match that line; the other cast member is
visibly listening and reacting — a nod, held eye contact, a small responsive
expression — never idle, never mouthing the other speaker's line, and never
implying an unseen third narrator. Both faces stay on screen and
identifiable throughout the shot; never let the accepted image's two
identities blur into one presenter or swap which face is which.

**Two distinct voices, held constant.** Direct clearly distinct vocal
qualities per cast member (register, pace, energy) and keep each cast
member's voice identity constant with how they sounded in prior shots of
this run — never collapse to a single narrator voice when two cast members
are present.

**Duration governs pacing, not a fixed count.** Divide the spoken lines
across the shot's own duration — its opening, middle, and closing thirds —
rather than assuming a fixed shot length; write camera and performance beats
relative to that actual duration.

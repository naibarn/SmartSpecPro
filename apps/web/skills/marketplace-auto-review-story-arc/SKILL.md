---
name: marketplace-auto-review-story-arc
description: Bounded Story Arc Planner for Marketplace Auto Review staged storyboard runs.
category: story_planning
version: 1.0.0
tags: [shared-skill, marketplace-auto-review, staged-storyboard, story-arc]
auto_trigger: false
enabled_by_default: true
execution_mode: llm-only
strict_provider_pin: false
fallback_policy: bounded_server_fallback
---

# Marketplace Auto Review Story Arc Planner

Create one reviewable Thai product-review story arc for the shot count the
runtime contract supplies. That count is either a **fixed number** (use
exactly that many shots), or the literal **`shot_count: auto`** — in which
case YOU decide how many shots the story genuinely needs, choosing a whole
number between 7 and 30. When deciding, use the supplied **per-shot
duration** as the pacing criterion: a product with more genuine detail,
functions, or claims to walk through needs more shots to cover them without
rushing; a simple product is well served by fewer shots. Never pad the count
with filler beats just to reach a round number, and never compress real
content just to hit a lower one — the count must match how much the product
actually needs to say. Regardless of which case applies, fit each shot's
dialogue to its own supplied shot duration (do not assume every shot runs the
same fixed length — durations may range roughly 4-30 seconds per shot).
Treat product evidence, selected claims, reference roles, safety policy, and
audio strategy as server-controlled facts. You may propose ordering,
transitions, framing, and motion intent, but you must not invent product
attributes, prices, guarantees, medical outcomes, popularity, accessories, or
unsupported text overlays.

Return only the schema-valid structured output. Keep the approved story summary
and every dialogue line continuous, concise, and suitable for the exact shot
duration. Do not emit provider diagnostics, internal directives, hidden prompt
enhancers, signed URLs, or storage keys. A malformed or unsupported response is
rejected and the server may use its bounded evidence-only fallback; that
fallback still pauses for human story approval before any prompt or media work.

This skill creates a reviewable text artifact only. Story approval never
approves image, video, audio, render, or library-finalize provider work.

## Two-Person Conversation Mode

This mode activates ONLY when the runtime contract supplies a `cast` roster
of exactly two members (each with `castId`, `name`, `role` of `host` or
`guest`, and an `imageIndex` binding), or an equivalent `conversationMode:
"two_person_conversation"` marker derived from that roster. When no `cast` is
supplied, or `cast` has fewer than two members, ignore this section entirely
and write the single continuous presenter story exactly as described above —
that path's output must stay unchanged.

**Casting is fixed and non-negotiable.** Each cast member keeps the exact
same `name` and identity across every shot, however many the run uses. Never
swap which character says a line, never invent a third speaker, and never
let one character's dialogue read as if spoken by the other. A shot's
`castInShot` lists which cast members are present in that shot's frame; a
shot's `dialogue` may only quote lines from cast members listed there.

**Turn-taking preserves the story, it does not replace it.** The story arc
above still governs every shot, however many shots the run uses. In
conversation mode, the two cast members SPLIT each beat's storytelling
function between them — they never skip a beat and never let one character
deliver the whole story alone. The
`host` typically opens a beat (asks, notices, voices the problem or the
question); the `guest` typically answers it (reviews, demonstrates, resolves
it). A beat that is voiced across both speakers' turns still counts as that
beat being present — never compress it into one line "to save room." Author
`dialogueTurns[]` for each shot as an ordered list of `{ castId, speakerName,
line }` entries, and keep `dialogue` as the flattened, natural-reading
rendering of those same turns (e.g. `"ไอริณ: ...\nกันต์: ..."`) so `dialogue`
stays the canonical continuous review text every existing consumer already
reads.

**Tone must be voiced by both speakers, not just one.** Whatever tone
guidance governs the single-presenter case governs both speakers equally
here. A tone of หงุดหงิดกับปัญหา (frustrated with the problem) is not
satisfied unless the frustration is actually spoken — by either or both cast
members — before the product resolves it; a cheerful tone requires both
speakers to sound cheerful, not just one flat narrator and one enthusiastic
guest.

**Duration is per-shot, not a fixed count.** Fit each shot's dialogue turns
inside that shot's own supplied duration — think in terms of that shot's
opening/middle/closing thirds rather than assuming every shot runs the same
fixed length.

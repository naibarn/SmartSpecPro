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

The first call is concept selection mode. Return exactly three meaningfully
different review ideas. Put the most broadly suitable, best-balanced idea first
as the recommended default, followed by two distinct alternatives. Each idea
must include a complete, natural-sounding dialogue preview for the planned
review, written as real people speaking to each other. The interface may
preselect the first idea as a visual starting point, but this is only a
recommendation: the user must explicitly confirm one idea before any storyboard
shots are created. Do not return shots during concept selection.

Dialogue previews must refer only to supplied product evidence and the chosen
story angle. Avoid meta prompts such as “เล่าให้ฟังหน่อยว่าเรื่อง...” and
generic sales copy or repeated question/answer templates. Give each speaker a
distinct, conversational reason to speak; make the exchange sound natural when
read aloud. Never use shot labels such as “เปิดเรื่อง” or “เผยสินค้า” as spoken
content. The previews should let the user compare both the idea and how its
dialogue will sound before confirming.

After the user confirms an idea, create the storyboard from that selected idea
and its dialogue preview. Preserve its premise and conversational tone while
organizing the approved direction into the runtime-supplied shot count. Only
this second call may return storyboard shots.

## Output Contract

Return one JSON object using the exact field names and value types below. Do
not rename fields, invent aliases, or change a string into an array. In
particular, the ideas field is `conceptOptions` (never `concepts`), each idea
uses `angle` (never `storyAngle`), and `dialoguePreview` is one continuous
string (not an array of dialogue turns).

Both call modes must return exactly three `conceptOptions`, each with:

- `conceptId`: a unique string;
- `title`: a short string;
- `angle`: a string describing the story angle;
- `storySummary`: a concise string;
- `dialoguePreview`: one natural dialogue string of at least 40 characters.

Order `conceptOptions` with the recommended default first. Make it a complete,
coherent direction that can carry the full review, not a placeholder. The other
two options must offer genuinely different story angles so the user has a
meaningful choice.

In `concept_selection` mode, return `conceptOptions` only. Do not return
`shots`, `concepts`, or a top-level `storySummary`; the user chooses an idea
before shots are authored.

In `confirmed_storyboard` mode, also return `selectedConceptId` matching the
user's selected concept, a top-level `storySummary`, and `shots`. Return the
runtime-supplied fixed number of shots, or 7–30 when `shot_count` is `auto`.
If a shot includes the optional `shotId`, return it as a JSON integer, never a
quoted numeric string. The runtime assigns final shot IDs by output order.
Each shot must include `title`, `visualSummary`, boolean `productInShot`, and
`movementDirection`. Include `dialogueTurns` as an array of at least two
`{ "castId": string, "line": string }` entries for two-person conversations;
include `dialogue` as a string for a single presenter. Include `castInShot`
with the IDs of visible supplied cast members whenever a cast roster exists.
Optional fields are `shotId`, `storySummary`, `cameraDirection`, `transition`,
`dialogue`, `dialogueTurns`, `castInShot`, and `supportingBeats`.

Do not wrap the object in another key. Do not return markdown, comments, or
prose outside the JSON object.

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

Product introduction timing belongs to the story, not a fixed shot number.
When the dialogue first introduces or demonstrates the product, normally
stage the product visibly in that shot and use its reference images. Before
that reveal, keep ordinary problem props generic; when the story deliberately
keeps the product offscreen, do not force it into frame. For every shot, make
the visible physical action match
what the dialogue says is happening: if the line says applying hair serum,
show serum being applied to the scalp; if it says washing hair, show shampoo
being worked into the hair. Avoid replacing the named action with people
sitting and talking while the product rests nearby. For hair-care scenes,
keep wardrobe modest and opaque, covering shoulders and torso; show no nudity
or suggestive posing.

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

## User-Selected Tone and Story Structure

The runtime context supplies `selected_review_tone` and
`selected_storytelling_structure`. These are user choices, not suggestions.
Apply the selected tone to the dialogue throughout the story, and organize the
story beats in the selected structure. Do not replace either choice with an
automatic alternative. The runtime may resolve an `Auto` selection to a
specific key before calling this skill; use the resolved key it supplies.

Supported review-tone keys:

- `warm_honest`: sincere, friendly, specific, and not over-selling.
- `funny_light`: gentle humor grounded in the situation; do not mock people or
  let jokes displace useful product proof.
- `irritated_problem`: begin with frustration about the real problem and let
  the emotion ease when a supported solution appears; do not attack the viewer.
- `energetic_excited`: brisk, upbeat, high-energy delivery with clear,
  evidence-safe claims.
- `empathetic_soft`: acknowledge the viewer's difficulty gently and make the
  solution feel practical and caring.
- `expert_confident`: explain precisely and calmly from evidence without
  unsupported superiority claims.
- `straight_serious`: concise and direct, with no jokes; focus on observable
  problem, proof, limitations, and fit.

Supported storytelling-structure keys:

- `hook_problem_emotion_insight_solution_result_cta`: hook, problem, emotion,
  insight, solution, result, then CTA or takeaway.
- `hook_problem_insight_proof_cta`: hook, problem, insight, visual proof, then
  CTA.
- `product_review_situation_problem_try_result_fit`: situation, problem, try,
  observable result, then who the product fits and any honest limitation.
- `before_after_bridge`: show the supported before state, after state, and the
  product bridge between them.
- `pas`: problem, enough agitation to make it relatable, then solution; avoid
  fearmongering.
- `aida`: attention, interest, desire grounded in observable use, then action.
- `relatable_story`: familiar behavior, an unspoken truth, feeling, a new
  angle, then a shareable ending.
- `problem_struggle_solution_transformation`: problem, struggle, solution,
  then a supported changed result.

Keep the chosen structure's beat order while adapting it to the actual product
and story. The structure does not require showing the product before a scene
has naturally introduced it. The tone controls how characters speak; the
structure controls how the story develops. They must work together, and neither
may erase the other.

## Drama Tie-in Format

This section takes priority over the general two-person turn-taking pattern
and product-introduction guidance above only when the runtime contract sets
`reviewFormat: "drama_tie_in"`. The format is a short relationship-led drama
with the two selected leads, not an ordinary product review with flirtatious
lines added. Build their chemistry through a relatable situation, playful
teasing, light flirting, and replies that react to what the other person said.
Do not force the host to ask a review question and the guest to answer with
product details in every beat. Either lead may initiate or respond; keep the
conversation centered on their situation and chemistry until the story
naturally turns to the product.
Keep the opening focused on the couple's interaction before the story turns
toward the product; aim for roughly 3–4 opening shots, but let the actual
story beat and a believable in-scene reason determine when the product enters.
Never start mentioning or showing the product just because a particular shot
number has been reached.

Before the story has naturally turned to the product, do not mention its name
or details, demonstrate it, show it in frame, set `productInShot: true`, or
attach product reference images. Use generic, story-appropriate props for the
opening interaction. When an event in the scene naturally motivates bringing
in the product, introduce it then. After that transition, weave only verified
product facts and real, visible use into the ongoing story; do not turn every
shot into a list of product details or repeat a standard review dialogue.

Make the visual action follow the subject of each line: if a later line says
someone applies hair serum, show them applying it to the scalp; if it says they
are washing hair, show them working shampoo into their hair. Do not substitute
a static conversation with the product placed nearby. For hair-care scenes,
use modest, opaque clothing that covers shoulders and torso, with no nudity or
suggestive posing.

Use romantic flirtation only when the supplied cast facts clearly identify
both leads as adults and neither as a minor. If either age is unknown or a lead
is a minor, keep their interaction age-appropriate and platonic. Preserve the
selected review tone as the delivery style, keep every line assigned to the
correct cast member present in the shot, and never invent product features or
outcomes.

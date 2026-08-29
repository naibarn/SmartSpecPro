# Vertical Drama LLM Character Look Designer

**Status:** Approved; implementation complete locally, live verification pending
**Date:** 2026-08-29
**Scope:** Vertical Drama episode generation, automatic character-look slots, Skills registry/Admin, existing corrupted system-suggested looks

## Problem

When a new episode is generated, the automatic look resolver can create a new
character-look row. The current resolver is deterministic and copies the shot
story into `data.description` and `data.wardrobeRules`. The result is not a
production wardrobe description: it may contain biography, action, dialogue, or
scene prose instead of concrete clothing facts.

The desired result is a complete visual look package for the same character:
wardrobe, silhouette, hair, makeup, footwear, jewelry, bag/props when relevant,
palette, and continuity guidance. The face and body identity must remain the
same for an outfit variant. An age-stage variant may age naturally but must keep
recognizable identity anchors.

## Goals

1. Create a real, searchable, admin-visible skill named
   `vertical-drama-character-look-designer`.
2. Let the LLM, through the skill, creatively design the complete look from
   story context and character/series facts; do not hardcode garment designs in
   TypeScript.
3. Preserve the same face, body proportions, age rules, hair identity anchors,
   and character DNA while changing only the requested visual look.
4. Keep one coherent outfit across a continuous scene and avoid creating a new
   row for emotion, action, or a scene transition alone.
5. Persist only visual look data in the displayed description and keep raw story
   evidence in separate provenance metadata.
6. Reuse the same design on retry and avoid duplicate rows or duplicate LLM
   charges.
7. Repair already-corrupted system-suggested rows without overwriting
   user-created or user-edited looks.

## Non-goals

- Automatically generate the portrait merely because a look slot is designed.
- Change the base character's face, body, or canonical identity for an outfit
  variant.
- Use the whole-season variant planner as a per-shot wardrobe designer.
- Use fixed templates such as “formal = red dress and heels” as the source of
  the final wardrobe.

## Skill contract and discoverability

Add a native application skill bundle at:

`apps/web/skills/vertical-drama-character-look-designer/`

The bundle must include `SKILL.md`, `skill.json`, input/output schemas,
examples, pass/fail fixtures, help text, and a no-provider `scripts/verify.sh`.
Its manifest must set `execution_mode: llm-only`, `auto_trigger: false`, an
explicit version/contract version, bilingual name/description, and tags for
Vertical Drama, wardrobe, character look, continuity, hair, makeup, footwear,
and accessories. The folder scanner and auto-sync must import it into the
Skills database so Admin/Skills search finds the slug, display names,
description, category, and enabled state. A registry test must assert the exact
slug and skill metadata after sync.

Discoverability acceptance is concrete: after `autoSyncSkillsFromFolder`,
`getSkillByIdAsync("vertical-drama-character-look-designer")` must resolve the
same skill definition used by the episode pipeline, and authenticated
Admin/Skills searches using the English slug, Thai display name, and a wardrobe
tag must each return the skill. Content-hash refresh must update the skill
prompt/schema version without replacing admin-controlled visibility or pricing
fields. The skill must not be marked `internalOnly` or hidden by a folder-only
special case.

Fixtures validate the actual skill bundle and schema, not a fake implementation.
The episode pipeline must call the real skill-first LLM boundary
(`executeJsonPlanningCallWithRetry` or the project-approved equivalent), bill it
under this exact skill slug, validate the returned JSON, and record model,
attempt, contract version, and usage in the normal audit/credit path. No mock
look generator may be used as production fallback.

The implementation must expose a traceable runtime marker for every design:
skill slug, skill content hash, request key, provider/model, attempt number,
input/output token usage, validation result, and materialized character row key.
A unit test may
stub only the transport boundary to prove error handling; it must not replace
the skill prompt, fabricate a successful look, or be used as production code.
The required live proof must execute the installed bundle through the real LLM
runner and then verify the resulting audit/credit and database rows.

## Input facts

TypeScript assembles labeled facts only:

- base character identity: age, region, role, occupation, body/face anchors,
  structured Character DNA, signature hair, and existing identity lock;
- series visual culture: genre, tone, palette, realism, lighting, and camera
  grammar;
- requested look intent and explicit story evidence attached to that character;
- canonical target age stage when the request is an age-stage change:
  `infant`, `early_childhood`, `school_age`, `university_student`, `adult`, or
  `older_adult`; the resolver must not ask the LLM to guess between these when
  the story gives an explicit stage cue;
- scene location, time of day, social setting, activity, and socioeconomic cues;
- adjacent shots, current look, existing compatible variants, and continuity
  constraints;
- child-safety, audience-rating, and age-stage constraints.

Story evidence is labeled as context and may explain why the look is needed. It
must never be copied as the visual description.

Story text and user-entered context are untrusted evidence, not instructions:
the skill prompt must delimit them and ignore any embedded request to change
the contract, identity rules, safety policy, billing, or system behavior. The
pipeline sends only tenant-authorized, character-scoped facts and must not pass
secrets or unrelated characters into the batch.

Fact precedence is explicit and must be encoded in the skill instructions and
input labels: (1) safety, age-stage, and hard identity facts; (2) explicit
wardrobe/styling facts attached to the named character; (3) established
same-scene continuity; (4) occupation, social setting, and believable local
context; (5) series visual culture; (6) conservative creative completion for
unknown details. A lower-priority fact may not override a higher-priority one.
If the evidence conflicts, the skill must return `review_required=true` and a
short conflict reason rather than inventing a compromise.

## LLM output

The skill must return only JSON with `contract_version: 1` and a top-level
`designs` array. Each item is keyed by `request_key` and contains one
`look_design`, `review_required`, `conflict_reason` when review is required,
and separate `evidence_refs`. The JSON schema is the public handoff contract
and the server-side Zod schema must remain parity-tested with it. Required
fields are bounded (no unbounded arrays or free-form nested objects):

- `contract_version`: literal `1`;
- `look_design.look_label`: short non-empty label;
- `look_design.variant_type`: `outfit` or `age_stage`;
- `look_design.age_stage`: required for `age_stage`, one of `infant`,
  `early_childhood`, `school_age`, `university_student`, `adult`, or
  `older_adult`; absent for `outfit`;
- `look_design.confidence`: number from `0` to `1`;
- `look_design.outfit`: required object with non-empty `top`, exactly one of
  `bottom`/`one_piece`, plus `outerwear`, `materials`, `colors`, `fit`,
  `condition`, and `silhouette` (use an explicit neutral value when a garment
  layer is not appropriate);
- `look_design.hair`: required object with `style`, `arrangement`, `finish`,
  and `identity_preservation`;
- `look_design.makeup`: required object with `level`, `complexion`, `eyes`,
  `lips`, and `age_safety`;
- `look_design.footwear`: required object with `type`, `material`, `color`,
  `formality`, and `scene_suitability`;
- `look_design.accessories`: array of at most 8 objects with `item`,
  `material_or_finish`, `color`, `visibility`, and `rationale`;
- `look_design.palette`, `continuity_notes`, `negative_constraints`, and
  `identity_lock`: bounded non-empty strings/arrays;
- optional LLM-authored `visual_description` and `image_brief` may be returned
  for review, but are never persisted verbatim;
- `evidence_refs`: array of bounded `{shot_number, evidence_span}` objects,
  kept separate from every visual description field.

The schema must publish exact bounds: labels and scalar garment/styling fields
are at most 240 characters, identity/continuity fields are at most 500
characters, `materials` and `colors` contain at most 8 items of 80 characters,
`palette`, `continuity_notes`, and `negative_constraints` contain at most 12
items of 160 characters, `accessories` contains at most 8 items, and
`evidence_refs` contains at most 16 entries with a 240-character evidence span.
Optional `visual_description` is at most 500 characters and `image_brief` at
most 1000 characters. These limits are enforced identically by JSON Schema and
server Zod; “bounded” without a numeric limit is not an acceptable contract.

Conditional contract rules are mandatory: an `outfit` variant must explicitly
state unchanged age/person identity and must not contain age-transition fields;
an `age_stage` variant must state the target life stage and must include a
non-empty `age_stage_description` describing believable physical and styling
changes without promising an identical face. The six canonical stages cover
newborn/infant, early childhood, secondary-school age, university age, adult,
and older adult. `outfit.bottom` and `outfit.one_piece` are mutually exclusive.
Accessories may be empty when the scene gives no reason for them, but the
skill must still decide hair, makeup, and footwear conservatively. Every text
field has a maximum length and the schema rejects unknown top-level keys.

The skill must also return `quality_checks` with booleans for
`same_person_preserved`, `age_appropriate`, `scene_coherent`,
`wardrobe_complete`, and `story_evidence_separated`. A false required check is
rejected by the server; this makes quality acceptance explicit rather than
depending on a prompt instruction alone.

The validated structured fields are authoritative. The server derives the
persisted `data.description`, `data.wardrobeRules`, and `lookImageBrief` from
those fields only. `wardrobeRules` is visual constraint data, never a copy of
the evidence or a narrative explanation. This keeps the LLM responsible for
creative wardrobe decisions while making it impossible for an otherwise-valid
free-text field to smuggle story prose into the wardrobe contract. For
`age_stage`, the schema additionally requires an age-stage description and
permits natural facial change; for `outfit`, it requires same-person
identity-lock fields and forbids age drift.

The skill must reason about context. For example, formal evening scenes may
justify polished hair, evening makeup, refined shoes, and restrained jewelry;
home scenes should use natural grooming, comfortable clothing, indoor footwear,
and minimal accessories. These are reasoning constraints, not hardcoded output
templates. Children must remain strictly age-appropriate.

Identity rules are non-negotiable: an `outfit` variant may change hair
arrangement, makeup, clothing, footwear, jewelry, and accessories, but must
preserve the reference face geometry, skin tone, body proportions, apparent
age, defining marks, natural hair color/texture, and recognizable signature
features. Hair styling can change; hair identity cannot be replaced. An
`age_stage` variant may change facial maturity and proportions naturally, but
must preserve stated family resemblance/distinguishing anchors and must never
be presented as an identical-face lock. The skill must reject a design that
requires a new face, body type, ethnicity, or unrelated hairstyle.

For an age-stage look, the downstream portrait/image prompt must carry the
approved parent portrait or Character DNA reference together with the
canonical age-stage design. It may change only age-appropriate maturity,
proportions, hair arrangement, makeup, wardrobe, and accessories. Missing
identity references, a failed age-safety check, or suspected identity drift
must route the look to `review` and must never auto-approve a portrait.

The skill must distinguish a visual look change from a momentary performance
state. Tears, anger, fatigue, messy hair after action, a hand-held prop, or a
temporary expression do not create a reusable look unless the story explicitly
establishes a sustained wardrobe/styling change. A jewelry or accessory change
creates a new look only when it is visible, intentional, and meaningful to
continuity; otherwise it remains shot-level styling guidance.

## Runtime flow

1. `selectVerticalDramaCharacterLooks` remains a fact-only detector. It returns
   existing-look assignments plus `LookDesignRequest` objects; it may detect an
   explicit cue or a real continuity break, but it never writes wardrobe prose.
   A scene transition alone is not a request.
2. `designVerticalDramaCharacterLooks` is the sole application entry point for
   this skill. It receives the deduplicated requests for one episode, loads the
   real skill bundle by slug, and invokes the real LLM runner once per batch.
   The call happens before any paid start-frame/image work. The same stable key
   is checked before both `storyboard_shotgrid` and `start_frame_plan`, so a
   retry or downstream stage reuses the stored design and cannot issue a second
   charge for the same request. During legacy repair, each request may also
   carry `legacy_visual_context`: the old displayed look text and label are
   sent as explicitly labeled source material so the LLM can extract useful
   garment/style cues and transform them into visual fields instead of losing
   the original intent.
3. The stable request identity is
   `(tenantId, userId, seriesId, episodeId, parentCharacterKey, requestKey)`.
   When an upstream plan revision is available it must be included in the
   canonical request key; it is not an implicit or silently invented field.
   `requestKey` contains the canonical intent plus the normalized explicit
   wardrobe/context signature; it is not based only on a raw label or shot
   number. Repeated shots in one scene reuse one design; a distinct explicit
   wardrobe or age-stage change gets a distinct request key.
4. Zod/JSON schema validation rejects missing garment fields, story leakage,
   identity contradictions, unsupported character keys, unsafe child styling,
   malformed evidence, age-stage mismatches, and false `quality_checks` before
   any row is inserted.
5. A server renderer derives the concise `data.description` and reusable
   `lookImageBrief` only from validated visual fields. The full story evidence is
   stored under versioned provenance metadata with `sourceEpisodeId`, shot
   numbers, request key, skill slug, model, attempt, and contract version.
   Legacy source text is never copied into those fields; it is bounded before
   prompt submission and remains repair/audit context only. A user-triggered
   pre-provenance repair uses `legacyVisualOnly` plus evidence sentinel
   `shot_number=0`/`evidence_type=legacy_visual_context`, never a fabricated
   storyboard reference.
6. The row is materialized only after valid LLM output. The stable semantic key
   and current roster read make retries converge on the same row. A concurrent
   insert must re-read and reuse the winner rather than call the LLM again.
7. The storyboard assignment stores `selectedLookKey`, `requestedLookKey`,
   `assignmentStatus` (`ready`, `waiting_for_look_design`,
   `waiting_for_portrait`, or `review`), `designContractVersion`, and
   `evidenceRefs`. It references the same look key across all grouped shots and
   remains blocked from paid image work until design and portrait readiness pass.

## Failure, credits, and recovery

Charge only a successful LLM design call, once per idempotent request batch, as
`sourceType=skill` with the dedicated skill slug. Image-generation credits are
separate and are not charged for creating the slot.

Credit and persistence ordering must be durable: create a design-run ledger
under the stable request identity before calling the provider; commit the
application credit with that same idempotency key only after valid output; then
persist the materialized row and assignment in a transaction. A versioned JSONB
provenance record is acceptable for the initial rollout only when it provides
the same idempotency and stored-output guarantees. If persistence fails after a
valid response, retry from the stored run output without another provider call
or credit charge. An ambiguous provider timeout is marked `recovery_required`
until the normal provider/audit lookup resolves it; it is not blindly
resubmitted. Invalid output and policy rejection leave the run retryable
without a wardrobe row or image-credit charge. The current local implementation
must report ledger/transaction/recovery behavior as a release gate until it is
proven against the production database path.

If credits, provider, schema validation, or content validation fails, fail
closed: do not insert a descriptionless or story-filled look. Persist a
reviewable `waiting_for_look_design` assignment, show a retryable status, and do
not spend image credits. Never fall back to a hardcoded wardrobe or raw story
text.

Automatic backfill repairs only rows where `data.source=system_suggested_look`
and the versioned visual contract is missing or the description contains the
known story-leak marker. The explicit UI action is available on every
character row and child-look row; it sends the complete stored data to the
skill even when the old row has no source marker or standard contract. Such a
request uses `legacyVisualOnly` with a legacy source sentinel rather than
inventing storyboard evidence. Preserve the old derived text in repair audit
metadata. Because the action is explicit, it may replace derived visual fields
on a manually edited row, while the automatic pipeline remains
non-destructive. Ambiguous age or identity evidence remains review-pending
rather than being silently overwritten.

User-edit protection is explicit: every materialized system row receives a
`provenance.generatedFingerprint`, `provenance.designVersion`, and
`provenance.createdBySkill` marker. The editor must stamp
`provenance.userEditedAt`, `provenance.userEditedBy`, and an incremented
`provenance.editVersion` on any manual change to description, wardrobe rules,
identity lock, image brief, or assignment. Automatic repair may update only
rows whose source is still `system_suggested_look`, whose generated fingerprint
is unchanged, and whose portrait is not manually approved. The explicit
pre-provenance action may update a character or child-look row selected by the
owner and records `legacyVisualOnly=true` when no source marker exists.
Automatic repair still skips manual markers and fingerprint mismatches; an
explicit selected-row action is the intentional override and is recorded in
repair provenance. Unresolved age/identity evidence makes the row `review` and
skips mutation. Each repair
records before/after hashes, the reason, the matched source refs or legacy
sentinel, the LLM request key, and a rollback payload; rollback restores
derived fields only and never changes the parent character, stable look key,
assets, or shot assignment.

The legacy repair runner is `server/scripts/backfill-vertical-drama-character-looks.ts`.
It is dry-run by default and supports `--series-id`, `--row-id`, `--limit`, and
`--apply`; apply mode calls this same skill service and never contains a
hardcoded wardrobe. It groups storyboard-backed rows by source episode and
allows an explicit pre-provenance row repair to use the legacy-only sentinel,
supplies all parent identity facts in the batch, uses the admin-curated model
policy plus the versioned output schema, and restores the prior derived
payload when the LLM fails. Rows with unresolved episode evidence, user edits,
or an explicit age conflict remain review-pending. This runner is an
operational backfill tool, not a replacement for the normal episode pipeline.

## Testing and proof

- Skill bundle verification: manifest, discoverability metadata, schemas,
  examples, pass/fail fixtures, and no-provider verification script.
- Output contract tests: complete wardrobe package, visual-only description,
  evidence separation, identity lock, age safety, and rejection of story prose.
- Resolver tests: same-scene continuity, formal/home styling differences,
  accessory/hair/shoe changes, grouping, dedupe, idempotency, and manual override
  preservation.
- Pipeline tests: real skill runner wiring, skill slug billing, no insert on
  LLM failure, retry reuse, and no image-credit charge.
- Database repair tests: every explicitly selected character/look row changes
  only through the correct path; unselected user-authored rows do not;
  automatic repair still protects manual edits, approved portraits, and
  fingerprint mismatches; ambiguous source matches, legacy sentinel refs,
  rollback, and repeated repair are covered.
- Admin proof: authenticated Skills search returns the exact new skill.
- Provider proof: one configured LLM smoke run records a valid structured output,
  credit transaction, audit entry, and persisted visual-only row. Local fixture
  tests alone do not count as live-provider proof.

The implementation handoff must include a machine-readable evidence report for
the live proof: tenant/user/series/episode scope, skill slug and content hash,
request key, provider/model, attempt and usage, validation result, credit
transaction id, audit id, persisted row id, and a redacted before/after payload
hash. Secrets and full story text must not be included. If live proof is not
available, the release is `verification_pending`; passing local tests is not a
claim that the configured provider, Admin search, billing, or production
database path works.

## Deployment and migration

The initial design uses the existing JSONB `data` field and requires no new
database table. The skill bundle and server wiring must be deployed together;
startup auto-sync must complete before the feature is enabled. Existing bad
rows are handled by a read-only discovery/dry-run first, capturing candidate
ids, source matches, before-payload hashes, and skip reasons. The repair then
runs in bounded batches with a kill switch, per-row audit/rollback payload, and
post-batch verification; it must be resumable and idempotent. Production
rollout must verify Admin discoverability, authenticated episode generation,
the credit/audit trail, and the persisted visual-only description before
enabling automatic repair broadly. A repair must not alter an episode's shot
count, shot text, character parent keys, or existing approved portrait assets;
these invariants are checked before the rollout is declared complete.

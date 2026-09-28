# Vertical Drama shot scene intent reliability

## Objective

Make the shot scene-intent preflight reliable enough to improve per-shot
character selection without allowing a malformed LLM response to stop an entire
episode or silently produce an unsafe cast.

## Design

The existing `vd-shot-scene-intent-v1` contract remains the single source of
truth. The skill metadata, both skill prompt files, the JSON schema, the server
Zod schema, and the retry prompt must describe the same literal version and
field types. The server sends a complete contract block on every request/retry
so the model cannot infer required nested fields from prose alone.

At the generation boundary, a bounded structural normalizer handles only safe,
unambiguous compatibility cases: numeric contract version `1` becomes the
contract literal, missing array fields become empty arrays where the schema
already defines an empty semantic category, and string supporting-presence
entries become `{ role }`. It will not invent character refs, locations,
dialogue speakers, or dual-view groups. Any remaining structural or semantic
issue is reported with exact paths, the validator message, and a repair hint.
Missing critical refs remain invalid.

The pipeline remains strict for accepted intent. A response marked
`needs_review`, low confidence, unknown character, overlapping role, or invalid
communication topology is rejected from projection. Structural and semantic
validation both run through the existing bounded LLM retry path, which receives
the normalized issue list plus the complete contract skeleton. For a call mode
without a caller, the retry instruction explicitly requires either an exact
caller ID or `voice_only` plus an offscreen speaker. If all retries fail, the
original storyboard is preserved as a repairable candidate with a durable
warning/error containing the full intent validation reasons; no corrected cast
is persisted and no image generation is started from that candidate.

## Failure handling

The error boundary distinguishes schema-contract failure from semantic review
failure. Final schema/semantic failures use a stable code and bounded
diagnostic strings that include the shot/field path and a repair hint. Attempt
observers retain only bounded diagnostic metadata, not prompts, raw response
bodies, or secrets.

## Verification

- valid canonical scene intent continues to project the correct physical and
  caller refs;
- the observed malformed response is normalized only where safe and produces
  exact remaining diagnostics;
- missing nested arrays/fields are repaired by the prompt contract rather than
  inferred character identities;
- a call mode without a caller enters bounded semantic retry and reports the
  exact repair choices when exhausted;
- semantic failures remain strict and do not mutate the storyboard;
- episode-stage job behavior remains unchanged across PostgreSQL-pull and
  Cloudflare transports.

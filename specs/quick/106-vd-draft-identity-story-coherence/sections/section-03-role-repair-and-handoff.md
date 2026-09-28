# Section 03 — Role repair and handoff

## Ownership

Server parsing, create payload handoff and story-bible consumption.

## Targets

- `apps/web/server/services/verticalDramaPresetSynthesis.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- focused server tests

## Work

- Separate machine diagnostics from creator-facing warnings.
- Normalize safe role casing and retain `needs_role_review` for unresolved values.
- Carry optional identity/story seed through `applyPresetDraft` and `create` into the
  existing bible JSONB path.
- Feed approved context/seed into full-story prompts as facts; do not reinterpret them from
  title, UI language or spoken market.

## Acceptance

- Invalid role/roleTier cannot silently appear as ready.
- Unresolved structural role diagnostics prevent Apply; informational warnings do not.
- Existing character seeding and user-confirmed roles remain authoritative.
- Legacy create payloads and old bibles continue to work.

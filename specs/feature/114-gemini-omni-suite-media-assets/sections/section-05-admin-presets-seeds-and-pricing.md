# Section 05: Admin Presets, Seeds, and Pricing

## Goal

Make static registry, seed data, admin config, and pricing consistent with the Gemini Omni suite.

## What This Section Must Change

- Update `gemini-omni-video` managed config.
- Add Gemini Omni Character and Audio as asset capabilities.
- Hide/suite-manage raw fields from normal UI.
- Add or update Admin Media Models presets so operators can apply correct Gemini Omni config.
- Ensure pricing tiers exactly match the user-provided matrix.
- Add configurable pricing for Character/Audio asset creation, or keep normal-user asset creation disabled until pricing is confirmed.
- Add migration/backfill behavior for existing `gemini-omni-video` DB rows with raw provider fields.
- Add readiness diagnostics for Kie provider config, callback config, storage/public URL config, pricing, skill package contract versions, and seed/backfill state.

## Files Likely Touched

- `apps/web/server/services/modelRegistry.ts`
- `apps/web/scripts/seed-media-models-kie-ai.ts`
- `apps/web/client/src/pages/AdminMediaModels.tsx`
- pricing tests
- media provider utility tests

## Tests

- static registry contains correct Video config
- seed script upserts managed Gemini Omni fields
- pricing returns all without-video and with-video matrix values
- asset creation pricing is explicit or feature-flagged off
- admin preset includes hidden/managed fields and labels
- raw audio/character ID fields are not normal visible user inputs
- existing seeded DB rows can be safely updated without clobbering unrelated admin edits
- readiness diagnostics show missing config without leaking secrets
- seed/backfill can run twice idempotently
- provider contract fixtures detect Kie response drift

## Completion Criteria

- Fresh installs and seeded DB installs get equivalent Gemini Omni behavior.
- Admin UI communicates suite-managed fields clearly enough to avoid operator confusion.
- Existing Gemini Omni configs no longer leave normal users with raw `audio_ids`/`character_ids` controls.
- Operators can tell whether Gemini Omni is ready before enabling it for users.

# Section 02 — Persistence and prompt integration

## Ownership

Own start-frame projection/carry-forward, the direct episode mutation, and
provider-ready prompt text. Supporting roles remain text-only.

## Targets

- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`

## TDD

Prove manual arrays and explicit empty arrays survive plan regeneration, prompt
generation uses the effective frame value, and attachment resolution never sees
supporting role ids.

## Acceptance

User edits are authoritative, scoped to one shot, and prompt text includes exact
or bounded count plus a no-unrelated-extra-people guard.

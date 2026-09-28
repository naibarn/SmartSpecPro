# Design: tolerate legacy motion-prompt packs without warnings arrays

## Problem

Older `verticalDramaEpisodes.motionPromptPack` JSONB values can omit the
`warnings` field. The shot-prompt persistence paths now append generated
warnings by spreading `freshPack.warnings`, which throws when the legacy value
is missing and surfaces `freshPack.warnings is not iterable` in the episode UI.

## Chosen approach

Normalize the persisted value at the two existing warning-merge boundaries in
`verticalDramaEpisodes.ts` with an `Array.isArray` guard and an empty-array
fallback. Add focused regression coverage for both the normal and consolidated
speaker-switch persistence paths using legacy packs without `warnings`.

This keeps the repair local, preserves the user's JSONB data, and avoids a
database backfill or a broad refactor of every motion-pack consumer.

## Behavior and failure handling

- Existing warning arrays are preserved and appended to.
- Missing or malformed runtime warning values are treated as empty.
- Newly persisted packs continue to contain an array-valued `warnings` field.
- No provider call, credit spend, database mutation, migration, or build is
  required for this repair.

## Verification

Run only the two focused Vitest files covering the affected router paths and
run `git diff --check`. Do not run a frontend build, per the user's request.
